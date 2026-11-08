import { pgTable, text, timestamp, numeric, boolean, jsonb, integer, date } from "drizzle-orm/pg-core";

// --- Companies & Multi-Tenant Boundaries ---
export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUid: text("owner_uid").notNull(),
  taxId: text("tax_id"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  currency: text("currency").default("MT"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// --- Profiles ---
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  companyId: text("company_id"),
  email: text("email"),
  fullName: text("full_name"),
  role: text("role").default("ADMIN"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// --- Categories & Suppliers ---
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow()
});

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  nif: text("nif"),
  nuit: text("nuit"),
  status: text("status").default("Ativo"),
  createdAt: timestamp("created_at").defaultNow()
});

// --- Branches (Filiais) ---
export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  contact: text("contact"),
  city: text("city"),
  code: text("code"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow()
});

// --- Products & Inventory (products) ---
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  companyId: text("company_id"),
  ownerId: text("owner_id"),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  code: text("code"),
  barcode: text("barcode"),
  category: text("category").notNull().default("Geral"),
  categoryId: text("category_id"),
  supplier: text("supplier"),
  supplierId: text("supplier_id"),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull().default("0.00"),
  salePrice: numeric("sale_price", { precision: 14, scale: 2 }).notNull().default("0.00"),
  cost: numeric("cost", { precision: 14, scale: 2 }).notNull().default("0.00"),
  price: numeric("price", { precision: 14, scale: 2 }).notNull().default("0.00"),
  stock: numeric("stock", { precision: 14, scale: 2 }).notNull().default("0.00"),
  minStock: numeric("min_stock", { precision: 14, scale: 2 }).notNull().default("0.00"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("16.00"),
  unit: text("unit").notNull().default("un"),
  expiryDate: text("expiry_date"),
  image: text("image"),
  imageUrl: text("image_url"),
  emoji: text("emoji"),
  promotion: text("promotion"),
  isFavorite: boolean("is_favorite").default(false),
  brand: text("brand"),
  weightBased: boolean("weight_based").default(false),
  branchStocks: jsonb("branch_stocks").default({}),
  batches: jsonb("batches").default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const produtos = products;

// --- Product Batches (Lotes) ---
export const productBatches = pgTable("product_batches", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  batchCode: text("batch_code").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  initialQuantity: numeric("initial_quantity", { precision: 14, scale: 2 }).notNull(),
  expiryDate: date("expiry_date").notNull(),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).default("0.00"),
  receivedDate: date("received_date").defaultNow(),
  supplier: text("supplier"),
  createdAt: timestamp("created_at").defaultNow()
});

// --- Stock Movements (Kardex) ---
export const stockMovements = pgTable("stock_movements", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull(),
  type: text("type").notNull(), // 'ENTRY', 'EXIT_SALE', 'LOSS', 'ADJUSTMENT', 'TRANSFER', 'RETURN'
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  previousStock: numeric("previous_stock", { precision: 14, scale: 2 }).notNull(),
  newStock: numeric("new_stock", { precision: 14, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).default("0.00"),
  reason: text("reason"),
  referenceId: text("reference_id"),
  userId: text("user_id"),
  userName: text("user_name"),
  timestamp: timestamp("timestamp").defaultNow()
});

// --- Stock Transfers (Transferências entre Lojas) ---
export const stockTransfers = pgTable("stock_transfers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  originBranchId: text("origin_branch_id").notNull(),
  destinationBranchId: text("destination_branch_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("COMPLETED"),
  responsibleUser: text("responsible_user").notNull(),
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow()
});

// --- Customers (clientes / customers) ---
export const clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  nuit: text("nuit"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).default("0.00"),
  balance: numeric("balance", { precision: 14, scale: 2 }).default("0.00"),
  debt: numeric("debt", { precision: 14, scale: 2 }).default("0.00"),
  totalSpent: numeric("total_spent", { precision: 14, scale: 2 }).default("0.00"),
  purchaseCount: integer("purchase_count").default(0),
  lastPurchaseDate: timestamp("last_purchase_date"),
  loyaltyPoints: integer("loyalty_points").default(0),
  creditBlocked: boolean("credit_blocked").default(false),
  preferredPaymentMethod: text("preferred_payment_method"),
  oneClickCheckoutEnabled: boolean("one_click_checkout_enabled").default(false),
  settlements: jsonb("settlements").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const customers = clientes;

// --- Customer Debts & Debt Payments ---
export const customerDebts = pgTable("customer_debts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  customerId: text("customer_id").notNull(),
  saleId: text("sale_id"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
  remainingBalance: numeric("remaining_balance", { precision: 14, scale: 2 }).notNull(),
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at")
});

export const debtPayments = pgTable("debt_payments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  debtId: text("debt_id").notNull(),
  customerId: text("customer_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  receivedBy: text("received_by"),
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow()
});

// --- Sales (vendas / sales / transactions) ---
export const vendas = pgTable("vendas", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  idempotencyKey: text("idempotency_key"),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name").default("Consumidor Final"),
  customerNuit: text("customer_nuit"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  sellerId: text("seller_id"),
  sellerName: text("seller_name"),
  operatorName: text("operator_name"),
  cashierName: text("cashier_name"),
  branchId: text("branch_id"),
  paymentMethod: text("payment_method").notNull(),
  paymentDetails: text("payment_details"),
  paymentStatus: text("payment_status").notNull().default("PAID"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).default("0.00"),
  vatTotal: numeric("vat_total", { precision: 14, scale: 2 }).default("0.00"),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).default("0.00"),
  changeAmount: numeric("change_amount", { precision: 14, scale: 2 }).default("0.00"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).default("0.00"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).default("0.00"),
  fiscalHash: text("fiscal_hash"),
  fiscalKeys: text("fiscal_keys"),
  fiscalCertified: boolean("fiscal_certified").default(false),
  status: text("status").notNull().default("COMPLETED"),
  items: jsonb("items").notNull().default([]),
  itemsJson: text("items_json"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  timestamp: timestamp("timestamp").defaultNow()
});

export const sales = vendas;
export const transactions = vendas;

// --- Sale Items (venda_itens / sale_items) ---
export const vendaItens = pgTable("venda_itens", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).default("0.00"),
  discount: numeric("discount", { precision: 14, scale: 2 }).default("0.00"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).default("16.00"),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).default("0.00"),
  totalPrice: numeric("total_price", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const saleItems = vendaItens;

// --- Returns & Credit Notes (returns / credit_notes) ---
export const returns = pgTable("returns", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  creditNoteNumber: text("credit_note_number").notNull(),
  saleId: text("sale_id"),
  originalInvoiceNumber: text("original_invoice_number").notNull(),
  customerName: text("customer_name").default("Consumidor Final"),
  customerNuit: text("customer_nuit"),
  reason: text("reason").notNull(),
  items: jsonb("items").notNull().default([]),
  totalRefund: numeric("total_refund", { precision: 14, scale: 2 }).notNull().default("0.00"),
  refundMethod: text("refund_method").notNull().default("CASH"),
  operatorName: text("operator_name").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const creditNotes = returns;

// --- Suspended Carts (Carrinhos Retidos) ---
export const suspendedCarts = pgTable("suspended_carts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  items: jsonb("items").notNull().default([]),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0.00"),
  note: text("note"),
  savedBy: text("saved_by"),
  savedAt: timestamp("saved_at").defaultNow()
});

// --- Cash Register & Cash Movements (caixa / cash_movements) ---
export const caixa = pgTable("caixa", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  cashRegisterId: text("cash_register_id"),
  shiftId: text("shift_id"),
  type: text("type").notNull(), // 'INPUT', 'REINFORCEMENT', 'EXPENSE', 'QUEBRA', 'SANGRIA', 'DEVOLUTION', 'SOBRA'
  category: text("category"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  responsibleUser: text("responsible_user"),
  paymentMethod: text("payment_method").default("CASH"),
  reference: text("reference"),
  referenceId: text("reference_id"),
  destination: text("destination"),
  supplierOrClient: text("supplier_or_client"),
  authorizedSupervisor: text("authorized_supervisor"),
  supervisorPinVerified: boolean("supervisor_pin_verified").default(false),
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow()
});

export const cashMovements = caixa;

// --- Cash Registers (Sessões) ---
export const cashRegisters = pgTable("cash_registers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  openedBy: text("opened_by").notNull(),
  openerName: text("opener_name"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }),
  actualClosingBalance: numeric("actual_closing_balance", { precision: 14, scale: 2 }),
  difference: numeric("difference", { precision: 14, scale: 2 }).default("0.00"),
  status: text("status").notNull().default("OPEN"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at")
});

// --- Cash Closures (Balancetes) ---
export const cashClosures = pgTable("cash_closures", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  shiftId: text("shift_id"),
  shiftNumber: integer("shift_number"),
  registerId: text("register_id"),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").notNull(),
  openedBy: text("opened_by").notNull(),
  closedBy: text("closed_by").notNull(),
  openingSupervisor: text("opening_supervisor"),
  closingSupervisor: text("closing_supervisor"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  theoreticalBalance: numeric("theoretical_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  physicalBalance: numeric("physical_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  difference: numeric("difference", { precision: 14, scale: 2 }).notNull().default("0.00"),
  differenceType: text("difference_type").notNull().default("EXACT"),
  reconciliation: jsonb("reconciliation").notNull().default({}),
  denominations: jsonb("denominations").default({}),
  closingNotes: text("closing_notes"),
  createdAt: timestamp("created_at").defaultNow()
});

// --- Cash Shifts (Turno Ativo) ---
export const cashShifts = pgTable("cash_shifts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  status: text("status").notNull().default("CLOSED"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  openedAt: timestamp("opened_at").defaultNow(),
  openedBy: text("opened_by").notNull().default("Admin"),
  openingSupervisor: text("opening_supervisor"),
  openingNotes: text("opening_notes"),
  updatedAt: timestamp("updated_at").defaultNow()
});

// --- Staff / Colaboradores (colaboradores / employees) ---
export const colaboradores = pgTable("colaboradores", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  authUid: text("auth_uid"),
  name: text("name").notNull(),
  username: text("username"),
  email: text("email"),
  contact: text("contact"),
  whatsapp: text("whatsapp"),
  role: text("role").notNull().default("Operador"),
  salary: numeric("salary", { precision: 14, scale: 2 }).default("0.00"),
  admissionDate: date("admission_date").defaultNow(),
  status: text("status").notNull().default("ACTIVE"),
  pin: text("pin"),
  pinCreatedAt: timestamp("pin_created_at"),
  pinChanged: boolean("pin_changed").default(true),
  fotoPerfil: text("foto_perfil"),
  theme: text("theme").default("laranja"),
  twoFactorEmailEnabled: boolean("two_factor_email_enabled").default(true),
  twoFactorSmsEnabled: boolean("two_factor_sms_enabled").default(false),
  isPhoneValidated: boolean("is_phone_validated").default(false),
  observacoes: text("observacoes"),
  expirationDate: date("expiration_date"),
  logoUrl: text("logo_url"),
  webAuthnEnabled: boolean("web_authn_enabled").default(false),
  webAuthnCredentialId: text("web_authn_credential_id"),
  subscriptionPlan: text("subscription_plan").default("OURO"),
  planGrantedBy: text("plan_granted_by"),
  branch: text("branch").default("Sede Principal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const employees = colaboradores;

// --- Supplier Orders (Ordens de Compra) ---
export const supplierOrders = pgTable("supplier_orders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  supplierName: text("supplier_name").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantityRequested: numeric("quantity_requested", { precision: 14, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("Pendente"),
  paymentStatus: text("payment_status").notNull().default("Pendente"),
  requestDate: timestamp("request_date").defaultNow(),
  receivedDate: timestamp("received_date")
});

// --- Reminders & Recurring Reminders ---
export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  time: text("time"),
  completed: boolean("completed").notNull().default(false),
  priority: text("priority").notNull().default("medium"),
  date: date("date"),
  createdAt: timestamp("created_at").defaultNow()
});

export const recurringReminders = pgTable("recurring_reminders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  frequency: text("frequency").notNull().default("daily"),
  daysOfWeek: jsonb("days_of_week").default([]),
  time: text("time"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow()
});

// --- User Training Progress ---
export const userTrainingProgress = pgTable("user_training_progress", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  videoId: text("video_id").notNull(),
  watched: boolean("watched").default(true),
  watchedAt: timestamp("watched_at").defaultNow(),
  quizScore: integer("quiz_score"),
  quizCompleted: boolean("quiz_completed").default(false)
});

// --- Audit Logs ---
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id"),
  userName: text("user_name").notNull(),
  userRole: text("user_role"),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  device: text("device"),
  timestamp: timestamp("timestamp").defaultNow()
});

export const auditlogs = auditLogs;

// --- Settings & Configuration ---
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  companyName: text("company_name").notNull().default("OST Comércio Geral, Lda"),
  companyAddress: text("company_address").default("Av. Eduardo Mondlane, Nº 1234, Maputo - Moçambique"),
  companyNuit: text("company_nuit").default("400123987"),
  companyPhone: text("company_phone").default("+258 84 000 0000"),
  companyEmail: text("company_email").default("contacto@ostvendas.co.mz"),
  receiptFooterMessage: text("receipt_footer_message").default("Obrigado pela sua preferência! Processado por computador."),
  enableVat: boolean("enable_vat").default(true),
  vatPercentage: numeric("vat_percentage", { precision: 5, scale: 2 }).default("16.00"),
  currency: text("currency").default("MT"),
  lowStockThreshold: numeric("low_stock_threshold", { precision: 14, scale: 2 }).default("5.00"),
  defaultPrinter: text("default_printer").default("thermal_80mm"),
  cloudBackupEnabled: boolean("cloud_backup_enabled").default(true),
  backupFrequency: text("backup_frequency").default("daily"),
  backupTime: text("backup_time").default("18:00"),
  logoUrl: text("logo_url"),
  theme: text("theme").default("laranja"),
  invoiceSeries: text("invoice_series").default("A"),
  securityPin: text("security_pin"),
  systemVersion: text("system_version").default("2.4.0"),
  autoBackup: boolean("auto_backup").default(true),
  smsGateway: text("sms_gateway"),
  smtpServer: text("smtp_server"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  smtpSecure: boolean("smtp_secure").default(false),
  smtpEnabled: boolean("smtp_enabled").default(true),
  smtpSenderName: text("smtp_sender_name"),
  smtpFromEmail: text("smtp_from_email"),
  reportRecipientEmail: text("report_recipient_email"),
  reportHour: text("report_hour").default("18:00"),
  reportFrequency: text("report_frequency").default("daily"),
  fiscalCertificationNumber: text("fiscal_certification_number"),
  fiscalLogoUrl: text("fiscal_logo_url"),
  fiscalModeEnabled: boolean("fiscal_mode_enabled").default(true),
  inventoryStrategy: text("inventory_strategy").default("FIFO"),
  expiryAlertDays: integer("expiry_alert_days").default(30),
  expiryAlertsEnabled: boolean("expiry_alerts_enabled").default(true),
  expiryNotificationMethod: text("expiry_notification_method").default("EMAIL"),
  aiAutoMonitoring: boolean("ai_auto_monitoring").default(true),
  aiHealthSensitivity: integer("ai_health_sensitivity").default(5),
  branches: jsonb("branches").default([]),
  stockTransfers: jsonb("stock_transfers").default([]),
  batches: jsonb("batches").default([]),
  suppliers: jsonb("suppliers").default([]),
  supplierOrders: jsonb("supplier_orders").default([]),
  supplierOverdueToleranceDays: integer("supplier_overdue_tolerance_days").default(7),
  valJson: jsonb("val_json"),
  updatedAt: timestamp("updated_at").defaultNow()
});

// --- Recovery Requests ---
export const recoveryRequests = pgTable("recovery_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  employeeId: text("employee_id").notNull(),
  employeeName: text("employee_name").notNull(),
  email: text("email"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at")
});
