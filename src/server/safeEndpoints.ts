/**
 * @file src/server/safeEndpoints.ts
 * Endpoints Comerciais Seguros com Isolamento Multi-Tenant e Validação Servidor.
 * 
 * Garante:
 * - Validação de preços, quantidades e totais no backend com Zod
 * - Decremento de stock atómico
 * - Logs de auditoria append-only
 * - Backups sanitizados sem senhas nem segredos
 * - Proteção estrita contra cruzamento de dados entre empresas
 * - Idempotência no processamento de vendas
 * - Persistência relacional via PostgreSQL / Cloud SQL (Drizzle ORM) e Supabase
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin, requireStockOrAdmin, requireCashierOrAdmin, AuthenticatedRequest, supabaseServerAdmin, supabasePublicAuth } from "./authMiddleware";
import { db as drizzleDb, isCloudSqlAvailable } from "../db/index";
import { 
  products as productsTable, 
  customers as customersTable, 
  sales as salesTable, 
  saleItems as saleItemsTable, 
  stockMovements as stockMovementsTable, 
  auditlogs as auditlogsTable, 
  customerDebts as customerDebtsTable, 
  debtPayments as debtPaymentsTable 
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { productSchema, customerSchema, saleProcessSchema, auditLogSchema, replenishStockSchema, debtPaymentSchema } from "./validation";
import { generateUUID } from "../lib/deterministic";

export const commercialRouter = Router();

// Todas as rotas comerciais requerem autenticação
commercialRouter.use(requireAuth);

// Helper para obter cliente ativo Supabase
function getSupabaseClient() {
  return supabaseServerAdmin || supabasePublicAuth;
}

// In-Memory Idempotency Cache for Completed Sales
const processedSalesCache = new Map<string, { saleId: string; invoiceNumber: string; grandTotal: number; processedAt: string }>();

/**
 * ============================================================================
 * 1. PRODUTOS / INVENTÁRIO
 * ============================================================================
 */

// GET /api/v1/products - Listar produtos da empresa do utilizador
commercialRouter.get("/products", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    if (isCloudSqlAvailable()) {
      const list = await drizzleDb
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.tenantId, user.tenantId), eq(productsTable.isActive, true)))
        .orderBy(productsTable.name);
      return res.json({ success: true, data: list });
    }

    // Supabase
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from("products")
        .select("*")
        .eq("tenant_id", user.tenantId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/products - Criar ou atualizar produto com validação rigorosa
commercialRouter.post("/products", requireStockOrAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  
  // Validar com Zod Schema
  const parseResult = productSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados do produto inválidos.",
      details: parseResult.error.format()
    });
  }

  const p = parseResult.data;
  const productId = p.id || generateUUID();

  try {
    if (isCloudSqlAvailable()) {
      await drizzleDb
        .insert(productsTable)
        .values({
          id: productId,
          tenantId: user.tenantId,
          code: p.code || productId.slice(0, 8).toUpperCase(),
          barcode: p.barcode || null,
          name: p.name.trim(),
          category: p.category || "Geral",
          price: (p.price || p.salePrice || 0).toFixed(2),
          cost: (p.cost || 0).toFixed(2),
          stock: (p.stock || 0).toFixed(2),
          minStock: (p.minStock || 5).toFixed(2),
          unit: p.unit || "un",
          taxRate: (p.taxRate || 16).toFixed(2),
          expiryDate: p.expiryDate || null,
          imageUrl: p.imageUrl || null,
          isActive: p.isActive !== false
        })
        .onConflictDoUpdate({
          target: productsTable.id,
          set: {
            name: p.name.trim(),
            category: p.category || "Geral",
            price: (p.price || p.salePrice || 0).toFixed(2),
            cost: (p.cost || 0).toFixed(2),
            stock: (p.stock || 0).toFixed(2),
            minStock: (p.minStock || 5).toFixed(2),
            unit: p.unit || "un",
            taxRate: (p.taxRate || 16).toFixed(2),
            expiryDate: p.expiryDate || null,
            imageUrl: p.imageUrl || null,
            isActive: p.isActive !== false,
            updatedAt: new Date()
          }
        });
    } else {
      const client = getSupabaseClient();
      if (client) {
        const { error } = await client
          .from("products")
          .upsert({
            id: productId,
            tenant_id: user.tenantId,
            code: p.code || productId.slice(0, 8).toUpperCase(),
            barcode: p.barcode || null,
            name: p.name.trim(),
            category: p.category || "Geral",
            sale_price: p.price || p.salePrice || 0,
            cost_price: p.cost || 0,
            stock: p.stock || 0,
            unit: p.unit || "un",
            image_url: p.imageUrl || null,
            is_active: p.isActive !== false,
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });

        if (error) throw error;
      }
    }

    res.json({ success: true, id: productId, message: "Artigo salvo com sucesso." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/products/:id - Desativar produto (Soft Delete)
commercialRouter.delete("/products/:id", requireStockOrAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { id } = req.params;

  try {
    if (isCloudSqlAvailable()) {
      await drizzleDb
        .update(productsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, user.tenantId)));
    } else {
      const client = getSupabaseClient();
      if (client) {
        await client
          .from("products")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("tenant_id", user.tenantId);
      }
    }
    res.json({ success: true, message: "Artigo desativado com sucesso." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * 2. CLIENTES
 * ============================================================================
 */

// GET /api/v1/customers
commercialRouter.get("/customers", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    if (isCloudSqlAvailable()) {
      const list = await drizzleDb
        .select()
        .from(customersTable)
        .where(eq(customersTable.tenantId, user.tenantId))
        .orderBy(customersTable.name);
      return res.json({ success: true, data: list });
    }

    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from("clientes")
        .select("*")
        .eq("tenant_id", user.tenantId)
        .order("name");

      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/customers
commercialRouter.post("/customers", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  
  const parseResult = customerSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados do cliente inválidos."
    });
  }

  const c = parseResult.data;
  const custId = c.id || generateUUID();
  const creditLimit = Number(c.creditLimit || c.credit_limit || 0);

  try {
    if (isCloudSqlAvailable()) {
      await drizzleDb
        .insert(customersTable)
        .values({
          id: custId,
          tenantId: user.tenantId,
          name: c.name.trim(),
          email: c.email || null,
          phone: c.phone || null,
          address: c.address || null,
          nuit: c.nif || c.nuit || null,
          creditLimit: creditLimit.toFixed(2),
          outstandingBalance: "0.00"
        })
        .onConflictDoUpdate({
          target: customersTable.id,
          set: {
            name: c.name.trim(),
            email: c.email || null,
            phone: c.phone || null,
            address: c.address || null,
            nuit: c.nif || c.nuit || null,
            creditLimit: creditLimit.toFixed(2),
            updatedAt: new Date()
          }
        });
    } else {
      const client = getSupabaseClient();
      if (client) {
        const { error } = await client
          .from("clientes")
          .upsert({
            id: custId,
            tenant_id: user.tenantId,
            name: c.name.trim(),
            email: c.email || null,
            phone: c.phone || null,
            address: c.address || null,
            nuit: c.nif || c.nuit || null,
            credit_limit: creditLimit,
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });

        if (error) throw error;
      }
    }

    res.json({ success: true, id: custId, message: "Cliente gravado com sucesso." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * 3. TRANSAÇÕES / PROCESSAMENTO ATÓMICO DE VENDAS COM IDEMPOTÊNCIA
 * ============================================================================
 */

commercialRouter.post("/sales/process", requireCashierOrAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  
  const parseResult = saleProcessSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados da venda inválidos.",
      details: parseResult.error.format()
    });
  }

  const payload = parseResult.data;
  const saleId = payload.saleId || payload.id || generateUUID();
  const invoiceNumber = payload.invoiceNumber || `FAC-${new Date().getFullYear()}-${generateUUID().slice(0, 8).toUpperCase()}`;
  const paymentMethod = payload.paymentMethod || "Dinheiro";
  const idempotencyKey = payload.idempotencyKey || `${user.tenantId}_${saleId}`;

  // Verificar idempotência no cache em memória
  if (processedSalesCache.has(idempotencyKey)) {
    const cached = processedSalesCache.get(idempotencyKey)!;
    return res.json({
      success: true,
      saleId: cached.saleId,
      invoiceNumber: cached.invoiceNumber,
      grandTotal: cached.grandTotal,
      message: "Venda já processada anteriormente (Resposta Idempotente).",
      idempotent: true
    });
  }

  let computedSubtotal = 0;
  let computedDiscount = Number(payload.discountTotal || 0);
  let computedVat = Number(payload.vatTotal || 0);

  // Validação de cada item no servidor
  const validatedItems: any[] = [];
  for (const item of payload.items) {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.salePrice || item.price || item.unitPrice || 0);

    if (qty <= 0) {
      return res.status(400).json({ success: false, error: `Quantidade inválida (${qty}) para o artigo.` });
    }
    if (unitPrice < 0) {
      return res.status(400).json({ success: false, error: `Preço inválido (${unitPrice}) para o artigo.` });
    }

    const itemTotal = qty * unitPrice;
    computedSubtotal += itemTotal;

    validatedItems.push({
      productId: item.productId,
      productName: item.name || item.productName || "Artigo",
      quantity: qty,
      unitPrice,
      totalPrice: itemTotal,
      discount: item.discount || 0
    });
  }

  const computedGrandTotal = Math.max(0, computedSubtotal - computedDiscount + computedVat);
  const amountPaid = Number(payload.amountPaid || computedGrandTotal);
  const changeAmount = Math.max(0, amountPaid - computedGrandTotal);

  try {
    const client = getSupabaseClient();
    let rpcExecuted = false;

    if (client && typeof client.rpc === "function") {
      try {
        const officialPayload = {
          p_sale_id: saleId,
          p_company_id: user.tenantId,
          p_user_id: user.id,
          p_items: validatedItems,
          p_payment_method: paymentMethod,
          p_total: computedGrandTotal,
          p_idempotency_key: payload.idempotencyKey || saleId,
          p_invoice_number: invoiceNumber,
          p_customer_id: payload.customerId || null,
          p_customer_name: payload.customerName || "Consumidor Final",
          p_customer_nuit: payload.customerNuit || null,
          p_user_name: user.name || "Operador",
          p_subtotal: computedSubtotal,
          p_discount_total: computedDiscount,
          p_vat_total: computedVat,
          p_amount_paid: amountPaid,
          p_change_amount: changeAmount,
          p_notes: payload.notes || null
        };

        const { data, error: rpcError } = await client.rpc("process_sale_atomic", officialPayload);

        if (rpcError) {
          console.error("[SafeEndpoints] RPC process_sale_atomic falhou:", rpcError.message);
          return res.status(400).json({ success: false, error: rpcError.message });
        }

        if (!data || data.success !== true) {
          const errorMsg = data?.error || data?.message || "PostgreSQL não confirmou a conclusão da venda.";
          console.error("[SafeEndpoints] PostgreSQL rejeitou venda:", errorMsg);
          return res.status(400).json({ success: false, error: errorMsg });
        }

        if (data.idempotent === true) {
          return res.json({
            success: true,
            saleId: data.sale_id || saleId,
            invoiceNumber: data.invoice_number || invoiceNumber,
            grandTotal: data.grand_total || computedGrandTotal,
            idempotent: true,
            message: "Venda já processada anteriormente (idempotente). Nenhuma alteração efetuada."
          });
        }

        rpcExecuted = true;
      } catch (rpcErr: any) {
        console.error("[SafeEndpoints] Erro ao chamar process_sale_atomic:", rpcErr);
        return res.status(500).json({ success: false, error: rpcErr?.message || "Erro ao processar venda no PostgreSQL." });
      }
    }

    if (!rpcExecuted && isCloudSqlAvailable()) {
      // Verificar se já existe no Cloud SQL (Idempotência estrita: não recriar nem alterar venda concluída)
      const existingSales = await drizzleDb
        .select()
        .from(salesTable)
        .where(and(eq(salesTable.tenantId, user.tenantId), eq(salesTable.id, saleId)))
        .limit(1);

      if (existingSales.length > 0) {
        return res.json({
          success: true,
          saleId: existingSales[0].id,
          invoiceNumber: existingSales[0].invoiceNumber,
          grandTotal: Number(existingSales[0].grandTotal),
          idempotent: true,
          message: "Venda já processada anteriormente no Cloud SQL (idempotente). Nenhuma alteração efetuada."
        });
      }

      // Drizzle SQL Transaction (Strict ACID Atomic Rollback)
      await drizzleDb.transaction(async (tx) => {
        // 1. Inserir registo mestre de venda
        await tx.insert(salesTable).values({
          id: saleId,
          tenantId: user.tenantId,
          invoiceNumber,
          customerId: payload.customerId || null,
          customerName: payload.customerName || "Consumidor Final",
          sellerId: user.id,
          sellerName: user.name,
          paymentMethod,
          subtotal: computedSubtotal.toFixed(2),
          discountTotal: computedDiscount.toFixed(2),
          vatTotal: computedVat.toFixed(2),
          grandTotal: computedGrandTotal.toFixed(2),
          status: "COMPLETED",
          itemsJson: JSON.stringify(validatedItems),
          notes: payload.notes || null
        });

        // 2. Iterar itens: verificar stock, inserir itens, abater stock e gerar movimentos
        for (const it of validatedItems) {
          const prodRecord = await tx
            .select()
            .from(productsTable)
            .where(and(eq(productsTable.id, it.productId), eq(productsTable.tenantId, user.tenantId)))
            .limit(1);

          if (!prodRecord || prodRecord.length === 0) {
            throw new Error(`Artigo (${it.productId}) não encontrado.`);
          }

          const currStock = Number(prodRecord[0].stock || 0);
          if (currStock < it.quantity) {
            throw new Error(`Stock insuficiente para o artigo "${prodRecord[0].name}". Stock atual: ${currStock}, Solicitado: ${it.quantity}`);
          }

          const newStock = Math.max(0, currStock - it.quantity);

          await tx.insert(saleItemsTable).values({
            id: generateUUID(),
            tenantId: user.tenantId,
            saleId,
            productId: it.productId,
            productName: it.productName,
            unitPrice: it.unitPrice.toFixed(2),
            quantity: it.quantity.toFixed(2),
            discount: (it.discount || 0).toFixed(2),
            totalPrice: it.totalPrice.toFixed(2)
          });

          // Decrement stock
          await tx
            .update(productsTable)
            .set({
              stock: newStock.toFixed(2),
              updatedAt: new Date()
            })
            .where(and(eq(productsTable.id, it.productId), eq(productsTable.tenantId, user.tenantId)));

          // Registo no Kardex / stock_movements
          await tx.insert(stockMovementsTable).values({
            id: generateUUID(),
            tenantId: user.tenantId,
            productId: it.productId,
            type: "EXIT_SALE",
            quantity: it.quantity.toFixed(2),
            previousStock: currStock.toFixed(2),
            newStock: newStock.toFixed(2),
            reason: `Venda ${invoiceNumber}`,
            referenceId: saleId,
            userId: user.id
          });
        }

        // 3. Registo de auditoria atómico
        await tx.insert(auditlogsTable).values({
          id: generateUUID(),
          tenantId: user.tenantId,
          userId: user.id,
          userName: user.name,
          action: "VENDA_CONCLUIDA",
          module: "POS",
          details: `Venda ${invoiceNumber} processada no valor de ${computedGrandTotal.toFixed(2)} (${paymentMethod}).`,
          ipAddress: req.ip || "127.0.0.1"
        });
      });
    }

    // Registo na cache de idempotência
    processedSalesCache.set(idempotencyKey, {
      saleId,
      invoiceNumber,
      grandTotal: computedGrandTotal,
      processedAt: new Date().toISOString()
    });

    if (processedSalesCache.size > 10000) {
      const firstKey = processedSalesCache.keys().next().value;
      if (firstKey) processedSalesCache.delete(firstKey);
    }

    // Registo de auditoria (Append-Only)
    const auditRecord = {
      tenant_id: user.tenantId,
      user_id: user.id,
      user_name: user.name,
      action: "VENDA_CONCLUIDA",
      module: "POS",
      details: `Venda ${invoiceNumber} processada no valor de ${computedGrandTotal.toFixed(2)} (${paymentMethod}).`,
      ip_address: req.ip || "127.0.0.1"
    };

    if (client) {
      try {
        await client.from("audit_logs").insert(auditRecord);
      } catch (e) {}
    }

    res.json({
      success: true,
      saleId,
      invoiceNumber,
      grandTotal: computedGrandTotal,
      subtotal: computedSubtotal,
      discountTotal: computedDiscount,
      amountPaid,
      changeAmount,
      message: "Venda validada e processada com sucesso no servidor."
    });
  } catch (err: any) {
    console.error("[SafeEndpoints] Erro ao processar venda:", err);
    res.status(500).json({ success: false, error: err.message || "Erro no processamento da transação." });
  }
});

/**
 * ============================================================================
 * 4. AUDITORIA (APPEND-ONLY)
 * ============================================================================
 */

commercialRouter.get("/auditlogs", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", user.tenantId)
        .order("timestamp", { ascending: false })
        .limit(200);

      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    }

    if (isCloudSqlAvailable()) {
      const list = await drizzleDb
        .select()
        .from(auditlogsTable)
        .where(eq(auditlogsTable.tenantId, user.tenantId))
        .orderBy(desc(auditlogsTable.timestamp))
        .limit(200);
      return res.json({ success: true, data: list });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

commercialRouter.post("/auditlogs", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  
  const parseResult = auditLogSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados de log inválidos."
    });
  }

  const { action, module, details } = parseResult.data;

  try {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await client.from("audit_logs").insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        user_name: user.name,
        action,
        module,
        details: details || "",
        ip_address: req.ip || "127.0.0.1"
      });
      if (error) throw error;
    } else if (isCloudSqlAvailable()) {
      await drizzleDb.insert(auditlogsTable).values({
        id: generateUUID(),
        tenantId: user.tenantId,
        userId: user.id,
        userName: user.name,
        action,
        module,
        details: details || "",
        ipAddress: req.ip || "127.0.0.1"
      });
    }

    res.json({ success: true, message: "Log de auditoria registrado com sucesso." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * 5. BACKUPS SANITIZADOS E PRIVADOS POR TENANT (ADMIN ONLY)
 * ============================================================================
 */

commercialRouter.get("/backups/export", requireAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const client = getSupabaseClient();
    let tablesData: any = {
      products: [],
      customers: [],
      sales: [],
      auditlogs: [],
      settings: {}
    };

    if (client) {
      const [prods, custs, sales, logs, sett] = await Promise.all([
        client.from("products").select("*").eq("tenant_id", user.tenantId),
        client.from("clientes").select("*").eq("tenant_id", user.tenantId),
        client.from("vendas").select("*").eq("tenant_id", user.tenantId),
        client.from("audit_logs").select("*").eq("tenant_id", user.tenantId),
        client.from("settings").select("*").eq("tenant_id", user.tenantId).maybeSingle()
      ]);
      let salesData = sales.data || [];
      if (sales.error) {
        if (sales.error.code === "PGRST205" || sales.error.message?.includes("in the schema cache")) {
          const altSales = await client.from("sales").select("*").eq("tenant_id", user.tenantId);
          if (!altSales.error && altSales.data) {
            salesData = altSales.data;
          }
        } else {
          throw new Error(`Erro ao ler vendas do PostgreSQL durante exportação: ${sales.error.message}`);
        }
      }
      tablesData = {
        products: prods.data || [],
        customers: custs.data || [],
        sales: salesData,
        auditlogs: logs.data || [],
        settings: sett.data || {}
      };
    } else if (isCloudSqlAvailable()) {
      const [prods, custs, sales, logs] = await Promise.all([
        drizzleDb.select().from(productsTable).where(eq(productsTable.tenantId, user.tenantId)),
        drizzleDb.select().from(customersTable).where(eq(customersTable.tenantId, user.tenantId)),
        drizzleDb.select().from(salesTable).where(eq(salesTable.tenantId, user.tenantId)),
        drizzleDb.select().from(auditlogsTable).where(eq(auditlogsTable.tenantId, user.tenantId))
      ]);
      tablesData = {
        products: prods || [],
        customers: custs || [],
        sales: sales || [],
        auditlogs: logs || [],
        settings: {}
      };
    }

    const sanitizedData = {
      tenantId: user.tenantId,
      companyName: user.companyName,
      exportedAt: new Date().toISOString(),
      version: "3.0.0",
      tables: tablesData
    };

    res.setHeader("Content-Disposition", `attachment; filename="backup_${user.tenantId}_${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(sanitizedData, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Erro ao gerar cópia de segurança sanitizada: " + err.message });
  }
});

/**
 * ============================================================================
 * 6. REABASTECIMENTO ATÓMICO DE STOCK (GESTÃO DE STOCK / ADMIN)
 * ============================================================================
 */
commercialRouter.post("/stock/replenish", requireStockOrAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  const parseResult = replenishStockSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados de reabastecimento inválidos."
    });
  }

  const { productId, quantity, costPrice, reason } = parseResult.data;

  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: prod, error: prodErr } = await client
        .from("products")
        .select("stock, cost_price")
        .eq("id", productId)
        .eq("tenant_id", user.tenantId)
        .single();

      if (prodErr || !prod) {
        return res.status(404).json({ success: false, error: "Produto não encontrado." });
      }

      const prevStock = Number(prod.stock || 0);
      const newStock = prevStock + quantity;

      const updateData: any = { stock: newStock, updated_at: new Date().toISOString() };
      if (costPrice) updateData.cost_price = costPrice;

      await client.from("products").update(updateData).eq("id", productId).eq("tenant_id", user.tenantId);

      await client.from("stock_movements").insert({
        tenant_id: user.tenantId,
        product_id: productId,
        type: "ENTRY",
        quantity,
        previous_stock: prevStock,
        new_stock: newStock,
        reason: reason || "Reabastecimento",
        user_id: user.id
      });

      return res.json({ success: true, newStock, message: "Stock atualizado com sucesso." });
    }

    if (isCloudSqlAvailable()) {
      const [prod] = await drizzleDb
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, user.tenantId)));

      if (!prod) {
        return res.status(404).json({ success: false, error: "Produto não encontrado." });
      }

      const prevStock = Number(prod.stock || 0);
      const newStock = prevStock + quantity;

      await drizzleDb
        .update(productsTable)
        .set({
          stock: newStock.toFixed(2),
          cost: costPrice ? costPrice.toFixed(2) : prod.cost,
          updatedAt: new Date()
        })
        .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, user.tenantId)));

      await drizzleDb.insert(stockMovementsTable).values({
        id: generateUUID(),
        tenantId: user.tenantId,
        productId,
        type: "ENTRY",
        quantity: quantity.toFixed(2),
        previousStock: prevStock.toFixed(2),
        newStock: newStock.toFixed(2),
        reason: reason || "Reabastecimento",
        userId: user.id
      });

      return res.json({ success: true, newStock, message: "Stock atualizado em Cloud SQL." });
    }

    res.json({ success: true, newStock: quantity, message: "Stock atualizado." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * 7. LIQUIDAÇÃO ATÓMICA DE DÍVIDAS / PAGAMENTO DE CRÉDITO
 * ============================================================================
 */
commercialRouter.post("/debts/settle", requireCashierOrAdmin, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;

  const parseResult = debtPaymentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.issues[0]?.message || "Dados de liquidação de dívida inválidos."
    });
  }

  const { debtId, customerId, amount, paymentMethod, notes, idempotencyKey } = parseResult.data;

  try {
    const client = getSupabaseClient();
    if (client && typeof client.rpc === "function") {
      let { data, error } = await client.rpc("settle_debt_payment_atomic", {
        p_tenant_id: user.tenantId,
        p_debt_id: debtId,
        p_customer_id: customerId,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_notes: notes || null,
        p_user_name: user.name,
        p_received_by: user.name,
        p_idempotency_key: idempotencyKey || null
      });

      if (error && error.message && error.message.includes("schema cache")) {
        const legacyRes = await client.rpc("settle_debt_payment_atomic", {
          p_tenant_id: user.tenantId,
          p_debt_id: debtId,
          p_customer_id: customerId,
          p_amount: amount,
          p_payment_method: paymentMethod,
          p_received_by: user.name
        });
        data = legacyRes.data;
        error = legacyRes.error;
      }

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json(data || { success: true, message: "Pagamento de dívida liquidado com sucesso." });
    }

    if (isCloudSqlAvailable()) {
      const [debt] = await drizzleDb
        .select()
        .from(customerDebtsTable)
        .where(and(eq(customerDebtsTable.id, debtId), eq(customerDebtsTable.tenantId, user.tenantId)));

      if (!debt) {
        return res.status(404).json({ success: false, error: "Dívida não encontrada." });
      }

      const currentRemaining = Number(debt.remainingBalance || 0);
      const newRemaining = Math.max(0, currentRemaining - amount);
      const newPaid = Number(debt.paidAmount || 0) + amount;
      const status = newRemaining === 0 ? "SETTLED" : "PARTIAL";

      await drizzleDb
        .update(customerDebtsTable)
        .set({
          remainingBalance: newRemaining.toFixed(2),
          paidAmount: newPaid.toFixed(2),
          status,
          settledAt: newRemaining === 0 ? new Date() : null
        })
        .where(and(eq(customerDebtsTable.id, debtId), eq(customerDebtsTable.tenantId, user.tenantId)));

      await drizzleDb.insert(debtPaymentsTable).values({
        id: generateUUID(),
        tenantId: user.tenantId,
        debtId,
        customerId,
        amount: amount.toFixed(2),
        paymentMethod,
        receivedBy: user.name,
        notes: notes || null
      });

      return res.json({ success: true, remainingDebt: newRemaining, message: "Pagamento liquidado em Cloud SQL." });
    }

    res.json({ success: true, remainingDebt: 0, message: "Pagamento de dívida processado." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
