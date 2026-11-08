import { z } from "zod";

/**
 * Schemas de validação estrita (Zod) para todos os endpoints da API OST Vendas.
 * Protege contra mass assignment, injeção de tipos e dados inconsistentes.
 */

// 1. Produtos / Inventário
export const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome do produto é obrigatório").max(200),
  code: z.string().max(50).optional().default(""),
  barcode: z.string().max(50).optional().default(""),
  category: z.string().max(100).optional().default("Geral"),
  categoryId: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Preço não pode ser negativo").optional().default(0),
  salePrice: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0, "Custo não pode ser negativo").optional().default(0),
  costPrice: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().min(0, "Stock não pode ser negativo").optional().default(0),
  minStock: z.coerce.number().min(0).optional().default(0),
  unit: z.string().max(20).optional().default("un"),
  imageUrl: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  vatRate: z.coerce.number().min(0).max(100).optional().default(16),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  expiryDate: z.string().optional().nullable()
});

// 2. Clientes
export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome do cliente é obrigatório").max(200),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable().or(z.literal("")),
  address: z.string().max(300).optional().nullable().or(z.literal("")),
  nif: z.string().max(50).optional().nullable().or(z.literal("")),
  nuit: z.string().max(50).optional().nullable().or(z.literal("")),
  creditLimit: z.coerce.number().min(0).optional().default(0),
  credit_limit: z.coerce.number().min(0).optional(),
  notes: z.string().max(1000).optional().nullable()
});

// 3. Itens de Venda
export const saleItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, "ID do produto é obrigatório"),
  name: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  salePrice: z.coerce.number().min(0, "Preço unitário não pode ser negativo").optional(),
  price: z.coerce.number().min(0, "Preço unitário não pode ser negativo").optional(),
  unitPrice: z.coerce.number().min(0, "Preço unitário não pode ser negativo").optional(),
  discount: z.coerce.number().min(0).optional().default(0),
  costPrice: z.coerce.number().min(0).optional().default(0),
  vatRate: z.coerce.number().min(0).optional().default(16)
});

// 4. Processamento Atómico de Venda
export const saleProcessSchema = z.object({
  saleId: z.string().optional(),
  id: z.string().optional(),
  idempotencyKey: z.string().max(100).optional(),
  invoiceNumber: z.string().max(50).optional(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().max(200).optional().default("Consumidor Final"),
  customerNuit: z.string().max(50).optional().nullable(),
  paymentMethod: z.string().min(1).max(50).default("Dinheiro"),
  amountPaid: z.coerce.number().min(0).optional(),
  discountTotal: z.coerce.number().min(0).optional().default(0),
  vatTotal: z.coerce.number().min(0).optional().default(0),
  items: z.array(saleItemSchema).min(1, "A venda deve conter pelo menos 1 artigo"),
  notes: z.string().max(1000).optional().nullable()
});

// 6. Logs de Auditoria
export const auditLogSchema = z.object({
  action: z.string().min(1).max(100),
  module: z.string().min(1).max(100),
  details: z.string().max(2000).optional().default(""),
  device: z.string().max(200).optional().nullable()
});

// 7. Base de Dados / Armazenamento (db/save)
export const dbSaveSchema = z.object({
  table: z.enum(["products", "customers", "transactions", "cashflow", "employees", "auditlogs", "settings", "categories", "suppliers"]),
  data: z.union([z.array(z.record(z.string(), z.any())), z.record(z.string(), z.any())])
});

// 8. Envio de E-mail
export const emailSendSchema = z.object({
  to: z.string().email("Endereço de e-mail de destino inválido"),
  subject: z.string().min(1, "Assunto é obrigatório").max(200),
  body: z.string().min(1, "Conteúdo do e-mail é obrigatório").max(100000),
  isHtml: z.boolean().optional().default(false)
});

// 9. Envio de SMS
export const smsSendSchema = z.object({
  to: z.string().min(6, "Número de telefone inválido").max(30),
  message: z.string().min(1, "Mensagem é obrigatória").max(1000)
});

// 10. Envio de WhatsApp
export const whatsappSendSchema = z.object({
  to: z.string().min(6, "Número de destino inválido").max(30),
  message: z.string().min(1, "Mensagem é obrigatória").max(4000)
});

// 11. Campanhas
export const campaignDispatchSchema = z.object({
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]),
  recipients: z.array(z.string().min(1)).min(1, "Lista de destinatários vazia"),
  message: z.string().min(1, "Mensagem da campanha é obrigatória"),
  subject: z.string().max(200).optional()
});

// 12. Gemini AI Endpoints
export const geminiChatSchema = z.object({
  message: z.string().min(1, "Mensagem não pode estar vazia").max(5000),
  context: z.string().max(5000).optional()
});

export const geminiForecastSchema = z.object({
  salesHistory: z.array(z.any()).optional().default([]),
  inventoryStatus: z.array(z.any()).optional().default([]),
  businessType: z.string().max(200).optional().default("Comércio Geral")
});

export const geminiMarketingSmsSchema = z.object({
  campaignType: z.string().max(200).optional().default("Promoção"),
  details: z.string().max(2000).optional().default("")
});

export const geminiMarketingSloganSchema = z.object({
  productName: z.string().min(1, "Nome do produto é obrigatório").max(200),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(10),
  price: z.coerce.number().min(0).optional().default(0)
});

// 13. Configurações de Segurança e Firewall
export const firewallConfigSchema = z.object({
  enabled: z.boolean().optional(),
  securityHeadersEnabled: z.boolean().optional(),
  sanitizerEnabled: z.boolean().optional(),
  bruteForceProtectionEnabled: z.boolean().optional(),
  blacklistedIps: z.array(z.string()).optional(),
  whitelistedIps: z.array(z.string()).optional(),
  whitelistOnlyMode: z.boolean().optional()
});

export const rateLimitConfigSchema = z.object({
  enabled: z.boolean().optional(),
  profile: z.enum(["strict", "balanced", "tolerant", "custom"]).optional(),
  generalMax: z.coerce.number().positive().optional(),
  aiMax: z.coerce.number().positive().optional(),
  emailMax: z.coerce.number().positive().optional(),
  dbMax: z.coerce.number().positive().optional()
});

export const replenishStockSchema = z.object({
  productId: z.string().min(1, "ID do produto é obrigatório"),
  quantity: z.coerce.number().positive("Quantidade para reabastecimento deve ser positiva"),
  costPrice: z.coerce.number().min(0).optional().default(0),
  reason: z.string().max(200).optional().default("Reabastecimento"),
  idempotencyKey: z.string().max(100).optional()
});

export const debtPaymentSchema = z.object({
  debtId: z.string().min(1, "ID da dívida é obrigatório"),
  customerId: z.string().min(1, "ID do cliente é obrigatório"),
  amount: z.coerce.number().positive("Valor do pagamento deve ser maior que zero"),
  paymentMethod: z.string().min(1).max(50).default("Dinheiro"),
  notes: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().max(100).optional()
});

/**
 * Lista de campos proibidos enviados pelo frontend que devem ser removidos para evitar Mass Assignment e Privilege Escalation.
 */
export const PROHIBITED_CLIENT_FIELDS = [
  "tenant_id",
  "tenantId",
  "company_id",
  "companyId",
  "role",
  "permissions",
  "created_by",
  "createdBy",
  "updated_by",
  "updatedBy",
  "is_admin",
  "isAdmin",
  "is_owner",
  "isOwner"
] as const;

/**
 * Higieniza objetos de dados removendo campos administrativos e de privilégio antes de persistir,
 * além de neutralizar potenciais injeções de scripts e tags perigosas em strings.
 */
export function sanitizeInputData<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Sanitização de strings contra XSS e injeções
    return data
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/javascript:/gi, "")
      .trim() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeInputData(item)) as unknown as T;
  }

  if (typeof data === "object") {
    const copy: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      // Ignorar campos proibidos
      if (PROHIBITED_CLIENT_FIELDS.includes(key as any)) {
        continue;
      }
      copy[key] = sanitizeInputData(value);
    }
    return copy as T;
  }

  return data;
}

