/**
 * @file scripts/clean-mock-data.ts
 * Script de Administração OST VENDAS para Limpeza Permanente de Dados Mock / Exemplo.
 *
 * Remove irreversivelmente todos os produtos, clientes, transações, movimentações de stock
 * e lançamentos de caixa que contenham flags, propriedades ou identificadores de dados de exemplo ('mock'/'demo').
 *
 * Garante que apenas dados 100% autênticos inseridos por utilizadores permaneçam na base de dados.
 *
 * Execução:
 *   npx tsx scripts/clean-mock-data.ts
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DB_DIRS = [path.join(process.cwd(), "db_store"), path.join(process.cwd(), "data")];

// Padrões de identificação de dados de exemplo / mock
export const MOCK_ID_REGEX = /^(mock|demo|prod-mock|cust-mock|tx-mock|sample|teste|test-)/i;
export const MOCK_TEXT_REGEX = /\[(mock|demo|exemplo|teste)\]|\((mock|demo|demonstração|exemplo|teste)\)/i;

export interface CleanupReport {
  timestamp: string;
  purgedProducts: number;
  purgedCustomers: number;
  purgedTransactions: number;
  purgedCashflow: number;
  purgedAuditLogs: number;
  supabaseCleaned: boolean;
  fileDbCleaned: boolean;
  details: string[];
}

export function isMockItem(item: any): boolean {
  if (!item || typeof item !== "object") return false;

  // 1. Flags explícitas
  if (
    item.isMock === true ||
    item.is_mock === true ||
    item.mock === true ||
    item.isDemo === true ||
    item.is_demo === true ||
    item.isSample === true ||
    item.is_sample === true
  ) {
    return true;
  }

  // 2. Identificador
  if (typeof item.id === "string" && MOCK_ID_REGEX.test(item.id)) {
    return true;
  }

  // 3. Nomes ou descrições marcados como mock/demo
  const name = item.name || item.nome || item.customerName || item.invoice_number || item.invoiceNumber || "";
  if (typeof name === "string" && MOCK_TEXT_REGEX.test(name)) {
    return true;
  }

  const code = item.code || item.barcode || item.nuit || item.nif || "";
  if (typeof code === "string" && MOCK_ID_REGEX.test(code)) {
    return true;
  }

  return false;
}

export async function runMockDataCleanup(): Promise<CleanupReport> {
  const report: CleanupReport = {
    timestamp: new Date().toISOString(),
    purgedProducts: 0,
    purgedCustomers: 0,
    purgedTransactions: 0,
    purgedCashflow: 0,
    purgedAuditLogs: 0,
    supabaseCleaned: false,
    fileDbCleaned: false,
    details: []
  };

  console.log("===============================================================");
  console.log("🧹 INICIANDO LIMPEZA PERMANENTE DE DADOS MOCK / DEMONSTRAÇÃO");
  console.log("===============================================================");

  // --------------------------------------------------------------------------
  // 1. LIMPEZA EM FICHEIROS LOCAIS DO SERVIDOR (db_store/*.json e data/*.json)
  // --------------------------------------------------------------------------
  try {
    for (const dir of DB_DIRS) {
      if (fs.existsSync(dir)) {
        // 1.1 Produtos
        const prodPath = path.join(dir, "products.json");
        if (fs.existsSync(prodPath)) {
          const prods = JSON.parse(fs.readFileSync(prodPath, "utf-8"));
          if (Array.isArray(prods)) {
            const cleanProds = prods.filter(p => !isMockItem(p));
            const removed = prods.length - cleanProds.length;
            report.purgedProducts += removed;
            if (removed > 0) {
              fs.writeFileSync(prodPath, JSON.stringify(cleanProds, null, 2), "utf-8");
              report.details.push(`Removidos ${removed} produtos de exemplo de ${path.basename(dir)}.`);
            }
          }
        }

        // 1.2 Clientes
        const custPath = path.join(dir, "customers.json");
        if (fs.existsSync(custPath)) {
          const custs = JSON.parse(fs.readFileSync(custPath, "utf-8"));
          if (Array.isArray(custs)) {
            const cleanCusts = custs.filter(c => !isMockItem(c));
            const removed = custs.length - cleanCusts.length;
            report.purgedCustomers += removed;
            if (removed > 0) {
              fs.writeFileSync(custPath, JSON.stringify(cleanCusts, null, 2), "utf-8");
              report.details.push(`Removidos ${removed} clientes de exemplo de ${path.basename(dir)}.`);
            }
          }
        }

        // 1.3 Transações
        const txPath = path.join(dir, "transactions.json");
        if (fs.existsSync(txPath)) {
          const txs = JSON.parse(fs.readFileSync(txPath, "utf-8"));
          if (Array.isArray(txs)) {
            const cleanTxs = txs.filter(t => !isMockItem(t));
            const removed = txs.length - cleanTxs.length;
            report.purgedTransactions += removed;
            if (removed > 0) {
              fs.writeFileSync(txPath, JSON.stringify(cleanTxs, null, 2), "utf-8");
              report.details.push(`Removidas ${removed} transações de exemplo de ${path.basename(dir)}.`);
            }
          }
        }

        // 1.4 Caixa
        const cashPath = path.join(dir, "cashflow.json");
        if (fs.existsSync(cashPath)) {
          const cash = JSON.parse(fs.readFileSync(cashPath, "utf-8"));
          if (Array.isArray(cash)) {
            const cleanCash = cash.filter(c => !isMockItem(c));
            const removed = cash.length - cleanCash.length;
            report.purgedCashflow += removed;
            if (removed > 0) {
              fs.writeFileSync(cashPath, JSON.stringify(cleanCash, null, 2), "utf-8");
              report.details.push(`Removidos ${removed} registos de caixa de ${path.basename(dir)}.`);
            }
          }
        }

        // 1.5 Audit Logs de Teste
        const auditPath = path.join(dir, "auditlogs.json");
        if (fs.existsSync(auditPath)) {
          const logs = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
          if (Array.isArray(logs)) {
            const cleanLogs = logs.filter(l => !isMockItem(l));
            const removed = logs.length - cleanLogs.length;
            report.purgedAuditLogs += removed;
            if (removed > 0) {
              fs.writeFileSync(auditPath, JSON.stringify(cleanLogs, null, 2), "utf-8");
              report.details.push(`Removidos ${removed} logs de teste de ${path.basename(dir)}.`);
            }
          }
        }

        report.fileDbCleaned = true;
      }
    }
  } catch (fileErr: any) {
    console.error("Erro durante limpeza de ficheiros:", fileErr.message);
    report.details.push(`Aviso no ficheiro local: ${fileErr.message}`);
  }

  // --------------------------------------------------------------------------
  // 2. LIMPEZA NA BASE DE DADOS SUPABASE (PostgreSQL)
  // --------------------------------------------------------------------------
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      console.log(`📡 Conectando ao Supabase (${supabaseUrl}) para purga de dados de teste...`);
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });

      // 2.1 Produtos no Supabase
      const { data: dbProducts, error: prodErr } = await supabase.from("produtos").select("id, name, code, barcode");
      if (!prodErr && Array.isArray(dbProducts)) {
        const mockProductIds = dbProducts.filter(p => isMockItem(p)).map(p => p.id);
        if (mockProductIds.length > 0) {
          // Deletar dependências de movimentações e itens de venda
          await supabase.from("stock_movements").delete().in("product_id", mockProductIds);
          await supabase.from("venda_itens").delete().in("product_id", mockProductIds);
          const { error: delErr } = await supabase.from("produtos").delete().in("id", mockProductIds);
          if (!delErr) {
            report.purgedProducts += mockProductIds.length;
            report.details.push(`Supabase: Removidos ${mockProductIds.length} produtos mock/demo.`);
          }
        }
      }

      // 2.2 Clientes no Supabase
      const { data: dbCustomers, error: custErr } = await supabase.from("clientes").select("id, name, nuit");
      if (!custErr && Array.isArray(dbCustomers)) {
        const mockCustomerIds = dbCustomers.filter(c => isMockItem(c)).map(c => c.id);
        if (mockCustomerIds.length > 0) {
          await supabase.from("customer_debts").delete().in("customer_id", mockCustomerIds);
          await supabase.from("debt_payments").delete().in("customer_id", mockCustomerIds);
          const { error: delErr } = await supabase.from("clientes").delete().in("id", mockCustomerIds);
          if (!delErr) {
            report.purgedCustomers += mockCustomerIds.length;
            report.details.push(`Supabase: Removidos ${mockCustomerIds.length} clientes mock/demo.`);
          }
        }
      }

      // 2.3 Vendas no Supabase
      const { data: dbSales, error: salesErr } = await supabase.from("vendas").select("id, invoice_number, customer_name");
      if (!salesErr && Array.isArray(dbSales)) {
        const mockSaleIds = dbSales.filter(s => isMockItem(s)).map(s => s.id);
        if (mockSaleIds.length > 0) {
          await supabase.from("venda_itens").delete().in("sale_id", mockSaleIds);
          const { error: delErr } = await supabase.from("vendas").delete().in("id", mockSaleIds);
          if (!delErr) {
            report.purgedTransactions += mockSaleIds.length;
            report.details.push(`Supabase: Removidas ${mockSaleIds.length} vendas mock/demo.`);
          }
        }
      }

      // 2.4 Caixa / Movimentos de Caixa no Supabase
      const { data: dbCaixa, error: caixaErr } = await supabase.from("caixa").select("id, reason");
      if (!caixaErr && Array.isArray(dbCaixa)) {
        const mockCaixaIds = dbCaixa.filter(c => isMockItem(c)).map(c => c.id);
        if (mockCaixaIds.length > 0) {
          const { error: delErr } = await supabase.from("caixa").delete().in("id", mockCaixaIds);
          if (!delErr) {
            report.purgedCashflow += mockCaixaIds.length;
            report.details.push(`Supabase: Removidos ${mockCaixaIds.length} movimentos de caixa mock.`);
          }
        }
      }

      // 2.5 Verificar tabelas com nomes em inglês se existirem (products, customers, transactions)
      try {
        const { data: engProds } = await supabase.from("products").select("id, name, code, barcode");
        if (Array.isArray(engProds) && engProds.length > 0) {
          const mockEngIds = engProds.filter(p => isMockItem(p)).map(p => p.id);
          if (mockEngIds.length > 0) {
            await supabase.from("products").delete().in("id", mockEngIds);
            report.purgedProducts += mockEngIds.length;
            report.details.push(`Supabase (products): Removidos ${mockEngIds.length} produtos de exemplo.`);
          }
        }
      } catch (e) {}

      try {
        const { data: engCusts } = await supabase.from("customers").select("id, name");
        if (Array.isArray(engCusts) && engCusts.length > 0) {
          const mockCustIds = engCusts.filter(c => isMockItem(c)).map(c => c.id);
          if (mockCustIds.length > 0) {
            await supabase.from("customers").delete().in("id", mockCustIds);
            report.purgedCustomers += mockCustIds.length;
            report.details.push(`Supabase (customers): Removidos ${mockCustIds.length} clientes de exemplo.`);
          }
        }
      } catch (e) {}

      try {
        const { data: engTxs } = await supabase.from("transactions").select("id");
        if (Array.isArray(engTxs) && engTxs.length > 0) {
          const mockTxIds = engTxs.filter(t => isMockItem(t)).map(t => t.id);
          if (mockTxIds.length > 0) {
            await supabase.from("transactions").delete().in("id", mockTxIds);
            report.purgedTransactions += mockTxIds.length;
            report.details.push(`Supabase (transactions): Removidas ${mockTxIds.length} transações de exemplo.`);
          }
        }
      } catch (e) {}

      report.supabaseCleaned = true;
    } catch (sbErr: any) {
      console.warn("Aviso ao limpar Supabase:", sbErr.message);
      report.details.push(`Supabase aviso: ${sbErr.message}`);
    }
  } else {
    report.details.push("Supabase URL/Chave não configurados no servidor. Purga efetuada no armazenamento primário.");
  }

  console.log("---------------------------------------------------------------");
  console.log("✅ RELATÓRIO DA PURGA DE DADOS:");
  console.log(`- Produtos de exemplo removidos:    ${report.purgedProducts}`);
  console.log(`- Clientes de exemplo removidos:    ${report.purgedCustomers}`);
  console.log(`- Transações de exemplo removidas:  ${report.purgedTransactions}`);
  console.log(`- Movimentos de caixa de exemplo:   ${report.purgedCashflow}`);
  console.log(`- Logs de auditoria purgados:       ${report.purgedAuditLogs}`);
  console.log("===============================================================");

  return report;
}

// Execução direta via CLI se chamado como script principal
if (process.argv[1] && (process.argv[1].endsWith("clean-mock-data.ts") || process.argv[1].endsWith("clean-mock-data.js"))) {
  runMockDataCleanup()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Falha fatal na execução do script:", err);
      process.exit(1);
    });
}
