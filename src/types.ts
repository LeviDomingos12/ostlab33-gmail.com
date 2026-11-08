export type UserRole = "ADMIN" | "SUPERVISOR" | "CASHIER" | "AUDITOR" | "RH" | "FINANCEIRO";
export type SubscriptionPlan = "BRONZE" | "PRATA" | "OURO";

export interface PlanFeature {
  name: string;
  bronze: boolean;
  prata: boolean;
  ouro: boolean;
  description: string;
}

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
  companyId?: string;
}

export interface MultiTenantMetadata {
  ownerId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  companyId?: string;
  tenantId?: string;
  role?: string;
}

export interface Product extends MultiTenantMetadata {
  id: string;
  name: string;
  code: string;
  category: string;
  supplier: string;
  costPrice: number;
  salePrice: number;
  vatRate: number; // e.g. 16 for Moçambique
  stock: number;
  minStock: number;
  price?: number;
  sale_price?: number;
  cost_price?: number;
  expiryDate?: string;
  image?: string;
  emoji?: string;
  promotion?: string; // e.g. "PROMO", "MAIS_VENDIDO", "NOVO", "DESCONTO"
  isFavorite?: boolean;
  brand?: string;
  weightBased?: boolean; // True if sold per kg
  barcode?: string;
  unit?: string;
  branchStocks?: Record<string, number>; // Stock per branch ID
  batches?: ProductBatch[]; // Batches associated with this product
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number; // percentage or fixed
  vatRate: number;
}

export interface Customer extends MultiTenantMetadata {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  nuit: string; // Moçambique Tax ID
  totalSpent: number;
  purchaseCount: number;
  lastPurchaseDate?: string;
  debt: number;
  balance?: number;
  creditLimit?: number;
  loyaltyPoints: number;
  creditBlocked?: boolean;
  preferredPaymentMethod?: string;
  oneClickCheckoutEnabled?: boolean;
  settlements?: { id: string, date: string, amount: number, method: string }[];
  notes?: string;
}

export interface Transaction extends MultiTenantMetadata {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  status?: "COMPLETED" | "CANCELLED" | "REFUNDED";
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    vatAmount: number;
    discountAmount: number;
    subtotal: number;
  }[];
  subtotal: number;
  vatTotal: number;
  discountTotal: number;
  grandTotal: number;
  amountPaid?: number;
  changeAmount?: number;
  paymentMethod: "CASH" | "MPESA_PAGA_FACIL" | "EMOLA" | "POS_CARD" | "CREDIT_CARD" | "BANK_TRANSFER" | "MIXED" | "DEBT";
  paymentDetails?: string;
  cashierName: string;
  userId?: string;
  sellerId?: string;
  customerName?: string;
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  nuit?: string;
  branchId?: string; // Associated branch ID
  shiftId?: string; // Shift ID associated with this sale
  fiscalHash?: string; // AGT/MEF Fiscal Hash signature
  fiscalKeys?: string; // Short sign key e.g. "D4-F5-G6-A2"
  fiscalCertified?: boolean; // Certified indicator
  idempotencyKey?: string;
}

export interface CashFlowEntry extends MultiTenantMetadata {
  id: string;
  timestamp: string;
  type: "INPUT" | "REINFORCEMENT" | "EXPENSE" | "QUEBRA" | "SANGRIA" | "DEVOLUTION" | "SOBRA";
  amount: number;
  reason: string;
  responsibleUser: string;
  shiftId?: string;
  registerId?: string;
  paymentMethod?: "CASH" | "MPESA_PAGA_FACIL" | "EMOLA" | "POS_CARD" | "BANK_TRANSFER" | "OTHER";
  category?: "SUPRIMENTO" | "SANGRIA" | "DESPESA_OPERACIONAL" | "PAGAMENTO_FORNECEDOR" | "DEVOLUCAO_VENDA" | "QUEBRA_CAIXA" | "SOBRA_CAIXA" | "RECEBIMENTO_DIVIDA" | "OUTRO" | "RECEBIMENTO_VENDA" | "TROCO_DEVOLVIDO";
  reference?: string;
  destination?: string;
  supplierOrClient?: string;
  authorizedSupervisor?: string;
  supervisorPinVerified?: boolean;
  notes?: string;
  amountIn?: number;
  amountOut?: number;
  balanceAfter?: number;
  changeSource?: string;
  branchId?: string; // Loja/Filial do movimento
}

export interface CashShift extends MultiTenantMetadata {
  id: string;
  branchId?: string; // Loja/Filial do turno
  shiftId?: string;
  shiftNumber?: number;
  registerId?: string;
  openedAt: string;
  openedBy: string;
  openingBalance: number;
  openingSupervisor?: string;
  openingNotes?: string;
  status?: "OPEN" | "CLOSED";
  closedAt?: string;
  closedBy?: string;
  closingSupervisor?: string;
  theoreticalBalance: number;
  physicalBalance: number;
  difference: number;
  differenceType?: "EXACT" | "SURPLUS" | "SHORTAGE";
  closingNotes?: string;
  denominations?: Record<string, number>;
  reconciliation?: {
    cashSales: number;
    mpesaSales: number;
    emolaSales: number;
    posCardSales: number;
    transferSales: number;
    totalSales: number;
    reinforcements: number;
    inputs: number;
    sangrias: number;
    expenses: number;
    devolutions: number;
    quebras: number;
  };
}

export interface CashClosure extends CashShift {}

export interface AuditLog extends MultiTenantMetadata {
  id: string;
  timestamp: string;
  user: string;
  userRole: UserRole;
  action: string;
  module: string;
  details: string;
  ip?: string;
  device?: string;
}

export interface Employee extends MultiTenantMetadata {
  id: string;
  name: string;
  role: string;
  contact: string;
  salary: number;
  admissionDate: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED";
  pin?: string;
  email?: string;
  username?: string;
  pinCreatedAt?: string;
  pinChanged?: boolean;
  password?: string;
  fotoPerfil?: string;
  theme?: string;
  twoFactorEmailEnabled?: boolean;
  twoFactorSmsEnabled?: boolean;
  isPhoneValidated?: boolean;
  whatsapp?: string;
  observacoes?: string;
  expirationDate?: string;
  logoUrl?: string;
  webAuthnEnabled?: boolean;
  webAuthnCredentialId?: string;
  subscriptionPlan?: SubscriptionPlan;
  planGrantedBy?: string;
  assignedBranchId?: string; // Loja/Filial atribuída
  allowedBranchIds?: string[]; // Lojas autorizadas
}

export interface SystemSettings extends MultiTenantMetadata {
  companyName: string;
  companyAddress: string;
  companyNuit: string;
  companyNif?: string;
  invoiceSeries?: string;
  securityPin?: string;
  systemVersion?: string;
  nuit?: string;
  email?: string;
  storeEmail?: string;
  vatDefaultRate: number;
  currency: string; // e.g. MT, Meticais
  logoUrl?: string;
  autoBackup: boolean;
  smsGateway: string;
  smtpServer: string;
  reportRecipientEmail: string;
  theme?: string; // Color theme ID, e.g. "laranja", "azul", etc.
  reportHour: string;
  reportFrequency: "daily" | "weekly";
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  smtpSenderName?: string;
  smtpFromEmail?: string;
  smtpSource?: "database" | "env" | "none";
  smtpLastTestedAt?: string;
  smtpTlsIgnoreErrors?: boolean;
  emailProvider?: "smtp" | "resend";
  resendApiKey?: string;
  resendFromEmail?: string;
  emailStockAlertsEnabled?: boolean;
  emailAlertsStockEnabled?: boolean;
  emailAlertsCashShiftEnabled?: boolean;
  emailAlertsSecurityEnabled?: boolean;
  emailAlertsLargeSalesEnabled?: boolean;
  isSmtpVerified?: boolean;
  slogan?: string;
  storeAddress?: string;
  storeContact?: string;
  defaultVat?: number;
  categoryStockThresholds?: Record<string, number>;
  cloudBackupEnabled?: boolean;
  backupFrequency?: string;
  backupCron?: string;
  backupTime?: string;
  cloudProvider?: string;
  backupExportToCloud?: boolean;
  backupExportToEmail?: boolean;
  mpesaEnabled?: boolean;
  mpesaShortcode?: string;
  mpesaApiKey?: string;
  mpesaSecret?: string;
  mpesaWebhookUrl?: string;
  emolaEnabled?: boolean;
  emolaShortcode?: string;
  emolaApiKey?: string;
  emolaSecret?: string;
  emolaWebhookUrl?: string;
  whatsappEnabled?: boolean;
  whatsappProvider?: "DIRECT_LINK" | "EVOLUTION_API" | "TWILIO" | "META_CLOUD";
  whatsappApiEndpoint?: string;
  whatsappToken?: string;
  whatsappPhoneId?: string;
  managerWhatsappPhone?: string;
  whatsappMessageTemplate?: string;
  whatsappLogs?: Array<{
    id: string;
    timestamp: string;
    recipient: string;
    provider: string;
    status: 'SUCCESS' | 'FAILED' | 'TEST';
    message: string;
    response?: string;
  }>;
  alertsRecipientEmail?: string;
  stockAlertEmailSubject?: string;
  stockAlertEmailBody?: string;
  smsAlertsEnabled?: boolean;
  smsProviderType?: "TWILIO" | "CUSTOM_HTTP";
  smsTwilioSid?: string;
  smsTwilioToken?: string;
  smsTwilioFrom?: string;
  smsCustomUrl?: string;
  smsManagerPhone?: string;
  smsStockThreshold?: number;
  stockAlertAutoSendOnSale?: boolean;
  stockAlertSoundEnabled?: boolean;
  stockAlertIncludeDeficit?: boolean;
  printerEnabled?: boolean;
  twoFactorEmailEnabled?: boolean;
  twoFactorNewLocationEmail?: boolean;
  printerName?: string;
  printerConnectionType?: "USB" | "BLUETOOTH" | "NETWORK";
  printerIpAddress?: string;
  printerPort?: string;
  printerBaudRate?: string;
  printerType?: "RECEIPT" | "LABEL";
  paperSize?: "A4" | "80MM" | "58MM";
  printerAutoCut?: boolean;
  thermalMarginTop?: number;
  thermalMarginBottom?: number;
  branches?: Branch[];
  stockTransfers?: StockTransfer[];
  batches?: ProductBatch[];
  activeBranchId?: string;
  fiscalCertificationNumber?: string;
  fiscalLogoUrl?: string;
  fiscalModeEnabled?: boolean;
  inventoryStrategy?: "FIFO" | "LIFO" | "NORMAL";
  expiryAlertDays?: number;
  expiryAlertsEnabled?: boolean;
  expiryNotificationMethod?: "EMAIL" | "SMS" | "BOTH";
  expiryEmailSubject?: string;
  expiryEmailBody?: string;
  aiAutoMonitoring?: boolean;
  aiHealthSensitivity?: number;
  suppliers?: Supplier[];
  supplierOrders?: SupplierOrder[];
  supplierOverdueToleranceDays?: number;
  subscriptionPlan?: SubscriptionPlan;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  nuit?: string;
  status: "Ativo" | "Inativo";
}

export type ReceiptStatus = "Aguardando Envio" | "Em Trânsito" | "Entregue" | "Cancelado";

export interface SupplierOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  quantityRequested: number;
  unitCost: number;
  totalValue: number;
  status: "Pendente" | "Recebido" | "Cancelado";
  receiptStatus?: "Aguardando Envio" | "Em Trânsito" | "Entregue" | "Cancelado";
  paymentStatus: "Pago" | "Crédito" | "Pendente";
  paymentDueDate?: string;
  requestDate: string;
  receivedDate?: string;
  receivedQuantity?: number;
  deliveryConfirmedDate?: string;
  deliveryConfirmedBy?: string;
  deliveryNotes?: string;
  isReplenishmentOrder?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  contact: string;
  city?: string;
  code?: string;
  managerName?: string;
  isMainStore?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  openingHours?: string;
  color?: string;
  notes?: string;
}

export interface CompanyProfile {
  id?: string;
  email: string;
  company_name: string;
  nuit?: string;
  address?: string;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StockTransfer {
  id: string;
  originBranchId: string;
  destinationBranchId: string;
  productId: string;
  productName: string;
  quantity: number;
  timestamp: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  responsibleUser: string;
}

export interface ProductBatch {
  id: string;
  productId: string;
  productName: string;
  batchCode: string;
  quantity: number;
  initialQuantity: number;
  expiryDate: string; // YYYY-MM-DD
  costPrice: number;
  receivedDate: string;
  supplier?: string;
}

export interface MasterclassVideo {
  id: string;
  title: string;
  duration: string;
  description: string;
  thumbnail: string;
  category: string;
  steps: string[];
  instructor?: string;
  youtubeId?: string;
}

export interface SalesForecast {
  forecastText: string;
  growthRate: number;
  growthTrend: "up" | "down" | "stable";
  suggestedCampaigns: string[];
}

export type SystemUser = Employee;

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  time?: string;
  completed: boolean;
  priority?: "low" | "medium" | "high";
  date?: string;
}

export interface RecurringReminder {
  id: string;
  title: string;
  description?: string;
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[];
  time?: string;
  active: boolean;
}
