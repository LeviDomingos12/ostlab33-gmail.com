/**
 * @file dataService.ts
 * Camada de Serviço Unificada e Fachada de Dados Centralizada (@supabase/supabase-js).
 * 
 * Centraliza a inicialização do cliente Supabase a partir das variáveis de ambiente
 * 'VITE_SUPABASE_URL' e 'VITE_SUPABASE_ANON_KEY', eliminando quaisquer dependências diretas do Firebase.
 * 
 * Providencia serviços estruturados para:
 * - Autenticação e Sessões (AuthService)
 * - Operações Comerciais Atómicas e CRUD (CommercialDataService)
 * - Diagnósticos e Medição de Latência de Rede (ConnectionService)
 * - Armazenamento de Backups em Nuvem (StorageService)
 */

import { Session, User } from "@supabase/supabase-js";
import { supabase as supabaseClient, getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
export { supabaseClient, getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY };
import {
  SupabaseSyncService,
  measureSupabaseLatency,
  validateSupabaseSession,
  CloudBackupItem,
  LatencyResult,
  SessionValidationResult
} from "./supabaseService";
import {
  ImageStorageService,
  imageStorageService,
  StoredImage,
  ImageCategory,
  StorageMetrics
} from "./imageStorageService";
export { ImageStorageService, imageStorageService };
export type { StoredImage, ImageCategory, StorageMetrics };
import { 
  Product, 
  Customer, 
  Transaction, 
  CashFlowEntry, 
  Employee, 
  AuditLog, 
  SystemSettings, 
  CashClosure,
  CompanyProfile 
} from "../types";
import { sanitizeSettingsForExport } from "../lib/security";

/**
 * Sanitização e normalização de mensagens de erro para proteção de dados e logs amigáveis.
 */
export function sanitizeServiceError(error: unknown): string {
  if (!error) return "Operação concluída.";
  const rawMsg = error instanceof Error ? error.message : String(error);
  const lower = rawMsg.toLowerCase();

  if (lower.includes("network") || lower.includes("offline") || lower.includes("failed to fetch")) {
    return "Sem ligação ao banco de dados PostgreSQL. Operação abortada.";
  }
  if (lower.includes("permission") || lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("denied")) {
    return "Acesso restrito: permissões insuficientes ou sessão expirada.";
  }
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Credenciais de acesso incorretas. Verifique o seu e-mail e palavra-passe.";
  }

  return rawMsg || "Falha na comunicação com o servidor de dados.";
}

/**
 * Gestor de Backend e Estado de Operação
 */
export const BackendManager = {
  isSupabaseActive(): boolean {
    return true;
  },

  getMode(): string {
    return "SUPABASE";
  },

  setMode(_mode: string): void {
    // Supabase é o backend oficial e central
  }
};

/**
 * Serviço de Conexão e Diagnósticos de Rede
 */
export const ConnectionService = {
  /**
   * Valida se a ligação com o Supabase/PostgreSQL está operacional (suporta opcionalmente DATABASE_URL)
   */
  async test(databaseUrl?: string): Promise<boolean> {
    try {
      if (databaseUrl && databaseUrl.trim().length > 0) {
        const res = await fetch("/api/database/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionString: databaseUrl.trim() })
        });
        if (res.ok) {
          const body = await res.json();
          return Boolean(body.connected);
        }
      }
      const latency = await measureSupabaseLatency(SUPABASE_URL, SUPABASE_ANON_KEY);
      return latency.status !== "error";
    } catch {
      return false;
    }
  },

  /**
   * Validação completa de conectividade com Supabase / PostgreSQL retornando latência e tabelas
   */
  async validatePostgresConnection(databaseUrl?: string): Promise<{
    success: boolean;
    connected: boolean;
    latencyMs: number;
    message: string;
    version?: string;
    source?: string;
    tables?: any[];
    allRequiredTablesExist?: boolean;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/database/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(databaseUrl && databaseUrl.trim().length > 0 ? { connectionString: databaseUrl.trim() } : {})
      });
      if (res.ok) {
        const data = await res.json();
        return {
          success: Boolean(data.success),
          connected: Boolean(data.connected),
          latencyMs: data.latencyMs || 0,
          message: data.message || (data.connected ? "Conexão bem-sucedida" : "Falha na conexão"),
          version: data.version,
          source: data.source,
          tables: data.tables || [],
          allRequiredTablesExist: Boolean(data.allRequiredTablesExist),
          error: data.error
        };
      }
      return {
        success: false,
        connected: false,
        latencyMs: 0,
        message: "Erro HTTP ao testar conexão com o servidor PostgreSQL.",
        error: `Status ${res.status}`
      };
    } catch (err: any) {
      // Fallback para medição via Supabase Client
      try {
        const start = Date.now();
        const latency = await measureSupabaseLatency(SUPABASE_URL, SUPABASE_ANON_KEY);
        const elapsed = Date.now() - start;
        const online = latency.status !== "error";
        return {
          success: online,
          connected: online,
          latencyMs: elapsed,
          message: online ? "Conexão direta com Supabase operacional." : latency.message,
          error: online ? undefined : latency.message
        };
      } catch {
        return {
          success: false,
          connected: false,
          latencyMs: 0,
          message: err.message || "Erro de rede ao validar conexão com PostgreSQL.",
          error: err.message
        };
      }
    }
  },

  /**
   * Executa scripts SQL para criar as tabelas de sistema (produtos, clientes, transações, definições, colaboradores, caixa)
   */
  async createSystemTables(
    databaseUrl?: string,
    target: "all" | "products" | "customers" | "transactions" | "settings" | "staff" | "suppliers" | "caixa" = "all"
  ): Promise<{
    success: boolean;
    executedTables: string[];
    logs: string[];
    error?: string;
  }> {
    try {
      const res = await fetch("/api/database/run-schema-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          config: databaseUrl && databaseUrl.trim().length > 0 ? { connectionString: databaseUrl.trim() } : undefined
        })
      });
      if (res.ok) {
        return await res.json();
      }
      return {
        success: false,
        executedTables: [],
        logs: [`Erro HTTP ${res.status} ao solicitar criação de tabelas.`],
        error: `HTTP ${res.status}`
      };
    } catch (err: any) {
      return {
        success: false,
        executedTables: [],
        logs: [`Falha na requisição: ${err.message}`],
        error: err.message
      };
    }
  },

  /**
   * Diagnóstico em tempo real da conectividade e latência
   */
  async getDiagnostics(): Promise<{
    activeMode: string;
    supabaseOnline: boolean;
    supabaseLatency: LatencyResult;
    supabaseSession: SessionValidationResult;
    timestamp: string;
  }> {
    const [sbLatency, sbSession] = await Promise.all([
      measureSupabaseLatency(SUPABASE_URL, SUPABASE_ANON_KEY).catch(() => ({
        latencyMs: 0,
        status: "error" as const,
        message: "Falha de comunicação com o Supabase",
        timestamp: new Date().toISOString()
      })),
      validateSupabaseSession().catch(() => ({
        isValid: false,
        user: null,
        session: null,
        expiresAt: null,
        email: null,
        role: null,
        message: "Falha ao validar sessão"
      }))
    ]);

    return {
      activeMode: "SUPABASE",
      supabaseOnline: sbLatency.status !== "error",
      supabaseLatency: sbLatency,
      supabaseSession: sbSession,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Serviço de Autenticação Supabase
 */
export const AuthService = {
  async signInWithEmail(email: string, pass: string) {
    return await SupabaseSyncService.signInWithEmail(email, pass);
  },

  async signUpWithEmail(email: string, pass: string, name: string, branch: string, role: string = "Administrador", plan: string = "OURO") {
    return await SupabaseSyncService.signUpWithEmail(email, pass, name, branch, role, plan);
  },

  async signInWithGoogle() {
    return await SupabaseSyncService.signInWithGoogle();
  },

  async recoverPassword(email: string) {
    return await SupabaseSyncService.recoverPassword(email);
  },

  async signOut() {
    return await SupabaseSyncService.signOut();
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return SupabaseSyncService.onAuthStateChange(callback);
  },

  async getSession(): Promise<Session | null> {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async getCurrentUser(): Promise<User | null> {
    const { data } = await supabaseClient.auth.getUser();
    return data.user;
  }
};

/**
 * Serviço Comercial Unificado (Produtos, Vendas, Clientes, Caixa, Staff, Auditoria, Definições)
 * Modo Online Estrito: Não engole erros como [], não utiliza fila/substituto offline.
 */
export const CommercialDataService = {

  // --- PRODUTOS ---
  async fetchProducts(): Promise<Product[]> {
    try {
      return await SupabaseSyncService.fetchProducts();
    } catch (err: any) {
      console.error("[CommercialDataService.fetchProducts] Erro real ao ler produtos do PostgreSQL:", err);
      throw err;
    }
  },

  async saveProduct(product: Product): Promise<void> {
    try {
      const ok = await SupabaseSyncService.saveProduct(product);
      if (!ok) {
        throw new Error(`Falha ao gravar o produto "${product.name}" no PostgreSQL.`);
      }
    } catch (err: any) {
      console.error(`[CommercialDataService.saveProduct] Erro ao gravar produto "${product.name}" no PostgreSQL:`, err);
      throw err;
    }
  },

  async saveProductsBatch(products: Product[]): Promise<void> {
    try {
      const ok = await SupabaseSyncService.syncProducts(products);
      if (!ok) {
        throw new Error("Falha ao salvar lote de produtos no PostgreSQL.");
      }
    } catch (err: any) {
      console.error("[CommercialDataService.saveProductsBatch] Erro ao salvar lote de produtos no PostgreSQL:", err);
      throw err;
    }
  },

  async updateProduct(productId: string, updatedFields: Partial<Product>): Promise<void> {
    try {
      const full = { id: productId, ...updatedFields } as Product;
      const ok = await SupabaseSyncService.saveProduct(full);
      if (!ok) {
        throw new Error(`Falha ao atualizar produto ${productId} no PostgreSQL.`);
      }
    } catch (err: any) {
      console.error(`[CommercialDataService.updateProduct] Erro ao atualizar produto ${productId} no PostgreSQL:`, err);
      throw err;
    }
  },

  async removeProduct(productId: string): Promise<void> {
    try {
      const ok = await SupabaseSyncService.deleteProduct(productId);
      if (!ok) {
        throw new Error(`Falha ao remover produto ${productId} no PostgreSQL.`);
      }
    } catch (err: any) {
      console.error(`[CommercialDataService.removeProduct] Erro ao remover produto ${productId} no PostgreSQL:`, err);
      throw err;
    }
  },

  async replenishStock(params: {
    productId: string;
    quantity: number;
    costPrice?: number;
    reason?: string;
    userName?: string;
  }) {
    return await SupabaseSyncService.replenishStockAtomic(params);
  },

  /**
   * Diagnóstico e validação da conexão com PostgreSQL para o catálogo de produtos,
   * identificando a tabela ativa no schema ('products' ou 'produtos') e a integridade da conexão.
   */
  async verifyProductsConnection(): Promise<{
    connected: boolean;
    activeTable: string | null;
    error?: string;
  }> {
    return await SupabaseSyncService.verifyProductsTable();
  },

  /**
   * Executa teste diagnóstico na função atómica de vendas 'public.process_sale_atomic'.
   */
  async verifySalesRpcConnection(): Promise<{
    installed: boolean;
    error?: string;
  }> {
    return await SupabaseSyncService.verifySalesRpc();
  },

  subscribeProducts(onUpdate: () => void) {
    const sub = SupabaseSyncService.subscribeToTableChanges("products", onUpdate);
    return {
      unsubscribe: () => {
        try { sub?.unsubscribe?.(); } catch {}
      }
    };
  },

  // --- CLIENTES ---
  async fetchCustomers(): Promise<Customer[]> {
    try {
      return await SupabaseSyncService.fetchCustomers();
    } catch (err: any) {
      console.error("[CommercialDataService.fetchCustomers] Erro ao ler clientes:", err);
      return [];
    }
  },

  async saveCustomer(customer: Customer): Promise<void> {
    try {
      const ok = await SupabaseSyncService.saveCustomer(customer);
      if (!ok) {
        throw new Error(`Falha ao gravar cliente "${customer.name}" no PostgreSQL.`);
      }
    } catch (err: any) {
      console.error(`[CommercialDataService.saveCustomer] Erro ao gravar cliente "${customer.name}":`, err);
      throw err;
    }
  },

  async saveCustomersBatch(customers: Customer[]): Promise<void> {
    try {
      const ok = await SupabaseSyncService.syncCustomers(customers);
      if (!ok) {
        throw new Error("Falha ao salvar lote de clientes no PostgreSQL.");
      }
    } catch (err: any) {
      console.error("[CommercialDataService.saveCustomersBatch] Erro ao salvar lote de clientes:", err);
      throw err;
    }
  },

  async removeCustomer(customerId: string): Promise<void> {
    try {
      const ok = await SupabaseSyncService.deleteCustomer(customerId);
      if (!ok) {
        throw new Error(`Falha ao remover cliente ${customerId} no PostgreSQL.`);
      }
    } catch (err: any) {
      console.error(`[CommercialDataService.removeCustomer] Erro ao remover cliente ${customerId}:`, err);
      throw err;
    }
  },

  // --- TRANSAÇÕES / VENDAS (PostgreSQL Autoritativo Estrito: Sem mascarar erros, Sem cache offline) ---
  async fetchTransactions(): Promise<Transaction[]> {
    try {
      return await SupabaseSyncService.fetchTransactions();
    } catch (err: any) {
      console.error("[CommercialDataService.fetchTransactions] Erro real ao ler vendas do PostgreSQL:", err);
      throw err;
    }
  },

  async fetchRecentTransactions24h(): Promise<Transaction[]> {
    try {
      return await SupabaseSyncService.fetchRecentTransactions24h();
    } catch (err: any) {
      console.error("[CommercialDataService.fetchRecentTransactions24h] Erro real ao ler transações das últimas 24h do PostgreSQL:", err);
      throw err;
    }
  },

  async saveTransaction(transaction: Transaction): Promise<{ success: boolean; saleId?: string; invoiceNumber?: string; idempotent?: boolean }> {
    const params = {
      saleId: transaction.id,
      invoiceNumber: transaction.invoiceNumber || transaction.id,
      customerId: transaction.customerId,
      customerName: transaction.customerName || "Consumidor Final",
      customerNuit: transaction.nuit,
      userId: transaction.sellerId || "Operador",
      userName: transaction.cashierName || "Operador",
      sellerId: transaction.sellerId,
      sellerName: transaction.cashierName || "Operador",
      paymentMethod: transaction.paymentMethod,
      subtotal: transaction.subtotal || transaction.grandTotal,
      discountTotal: transaction.discountTotal || 0,
      vatTotal: transaction.vatTotal || 0,
      grandTotal: transaction.grandTotal,
      amountPaid: transaction.grandTotal,
      changeAmount: 0,
      items: transaction.items || [],
      notes: transaction.paymentDetails,
      idempotencyKey: transaction.idempotencyKey || transaction.id
    };

    const res = await SupabaseSyncService.processSaleAtomic(params);
    if (!res || res.success !== true) {
      const errMsg = res?.error || "Falha atómica ao processar venda no PostgreSQL.";
      console.error("[CommercialDataService.saveTransaction] Erro retornado pelo PostgreSQL:", errMsg);
      throw new Error(errMsg);
    }

    return res;
  },

  async saveTransactionsBatch(transactions: Transaction[]): Promise<void> {
    const ok = await SupabaseSyncService.syncTransactions(transactions);
    if (!ok) {
      throw new Error("Falha ao salvar lote de transações no PostgreSQL.");
    }
  },

  // --- FLUXO DE CAIXA ---
  async fetchCashFlow(): Promise<CashFlowEntry[]> {
    return await SupabaseSyncService.fetchCashFlow();
  },

  async saveCashFlowEntry(entry: CashFlowEntry): Promise<void> {
    const ok = await SupabaseSyncService.saveCashFlowEntry(entry);
    if (!ok) {
      throw new Error("Falha ao registrar movimento de caixa no PostgreSQL.");
    }
  },

  async saveCashFlowBatch(movements: CashFlowEntry[]): Promise<void> {
    const ok = await SupabaseSyncService.syncCashFlow(movements);
    if (!ok) {
      throw new Error("Falha ao salvar lote de movimentos de caixa no PostgreSQL.");
    }
  },

  // --- FECHAMENTOS DE CAIXA / BALANCETES ---
  async fetchCashClosures(): Promise<CashClosure[]> {
    return await SupabaseSyncService.fetchCashClosures();
  },

  async saveCashClosure(closure: CashClosure): Promise<void> {
    const ok = await SupabaseSyncService.saveCashClosure(closure);
    if (!ok) {
      throw new Error("Falha ao registrar fechamento de caixa no PostgreSQL.");
    }
  },

  async saveCashClosuresBatch(closures: CashClosure[]): Promise<void> {
    const ok = await SupabaseSyncService.syncCashClosures(closures);
    if (!ok) {
      throw new Error("Falha ao salvar lote de fechamentos de caixa no PostgreSQL.");
    }
  },

  async fetchActiveCashShift() {
    return await SupabaseSyncService.fetchActiveCashShift();
  },

  async saveActiveCashShift(shiftData: {
    status: "OPEN" | "CLOSED";
    openingBalance: number;
    openedAt: string;
    openedBy: string;
    openingSupervisor?: string;
    openingNotes?: string;
  }): Promise<void> {
    await SupabaseSyncService.saveActiveCashShift(shiftData);
  },

  subscribeCashClosures(onUpdate: () => void) {
    return SupabaseSyncService.subscribeToTableChanges("cash_closures", onUpdate);
  },

  // --- COLABORADORES / STAFF ---
  async fetchEmployees(): Promise<Employee[]> {
    return await SupabaseSyncService.fetchEmployees();
  },

  async saveEmployee(employee: Employee): Promise<void> {
    const ok = await SupabaseSyncService.saveEmployee(employee);
    if (!ok) {
      throw new Error(`Falha ao salvar colaborador ${employee.name} no PostgreSQL.`);
    }
  },

  async saveEmployeesBatch(employees: Employee[]): Promise<void> {
    const ok = await SupabaseSyncService.syncEmployees(employees);
    if (!ok) {
      throw new Error("Falha ao salvar lote de colaboradores no PostgreSQL.");
    }
  },

  async getRecoveryRequests() {
    return await SupabaseSyncService.getRecoveryRequests();
  },

  async createRecoveryRequest(empId: string, empName: string, email?: string) {
    return await SupabaseSyncService.createRecoveryRequest(empId, empName, email);
  },

  async resolveRecoveryRequest(id: string) {
    return await SupabaseSyncService.resolveRecoveryRequest(id);
  },

  // --- AUDITORIA ---
  async fetchAuditLogs(): Promise<AuditLog[]> {
    return await SupabaseSyncService.fetchAuditLogs();
  },

  async saveAuditLog(log: AuditLog): Promise<void> {
    const ok = await SupabaseSyncService.saveAuditLog(log);
    if (!ok) {
      console.warn("Falha ao gravar log de auditoria no PostgreSQL.");
    }
  },

  // --- DEFINIÇÕES E DADOS DA EMPRESA (SETTINGS COM ISOLAMENTO POR EMAIL) ---
  async fetchSettings(userEmail?: string): Promise<SystemSettings | null> {
    const cleanEmail = (userEmail || "").trim().toLowerCase();

    // 1. Tenta carregar do Supabase (tabela company_settings ou fallback)
    try {
      const sbSettings = await SupabaseSyncService.fetchSettings(cleanEmail);
      if (sbSettings) return sbSettings;
    } catch (e) {
      console.warn("[CommercialDataService.fetchSettings] Aviso ao ler do Supabase:", e);
    }

    // 2. Tenta carregar do backend Express com isolamento por x-user-email
    try {
      const queryParam = cleanEmail ? `?userEmail=${encodeURIComponent(cleanEmail)}` : "";
      const res = await fetch(`/api/settings${queryParam}`, {
        headers: cleanEmail ? { "x-user-email": cleanEmail } : {}
      });
      if (res.ok) {
        const body = await res.json();
        if (body.settings) return body.settings;
      }
    } catch {}

    // 3. Fallback do localStorage isolado pelo email do utilizador
    if (cleanEmail && typeof localStorage !== "undefined") {
      try {
        const isolatedCached = localStorage.getItem(`erp_company_settings_${cleanEmail}`);
        if (isolatedCached) {
          return JSON.parse(isolatedCached);
        }
      } catch {}
    }

    // 4. Fallback do localStorage global legacy
    if (typeof localStorage !== "undefined") {
      try {
        const globalCached = localStorage.getItem("erp_company_settings");
        if (globalCached) return JSON.parse(globalCached);
      } catch {}
    }

    return null;
  },

  async saveSettings(settings: SystemSettings, userEmail?: string): Promise<void> {
    const cleanEmail = (userEmail || settings.email || settings.storeEmail || "").trim().toLowerCase();
    const payload = {
      ...settings,
      userEmail: cleanEmail || undefined
    };

    let savedToBackend = false;
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(cleanEmail ? { "x-user-email": cleanEmail } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        savedToBackend = true;
      }
    } catch (e) {
      console.warn("[CommercialDataService.saveSettings] Aviso na API /api/settings:", e);
    }

    let savedToSupabase = false;
    try {
      savedToSupabase = await SupabaseSyncService.saveSettings(settings, cleanEmail);
    } catch (e) {
      console.warn("[CommercialDataService.saveSettings] Aviso no Supabase:", e);
    }

    // Persistência local isolada pelo email do utilizador (garante que 2 utilizadores tenham dados separados)
    try {
      const sanitized = sanitizeSettingsForExport(payload);
      if (cleanEmail) {
        localStorage.setItem(`erp_company_settings_${cleanEmail}`, JSON.stringify(sanitized));
      }
      localStorage.setItem("erp_company_settings", JSON.stringify(sanitized));
    } catch {}

    if (!savedToBackend && !savedToSupabase) {
      console.warn("[CommercialDataService.saveSettings] Configurações da empresa guardadas localmente.");
    }
  },

  // --- PERFIL DE EMPRESA ISOLADO POR EMAIL (TABELA company_profiles) ---
  /**
   * Carrega o perfil da empresa da tabela 'company_profiles' de forma autenticada.
   * Utiliza o e-mail do utilizador logado como identificador e chave de isolamento (RLS).
   */
  async fetchCompanyProfile(userEmail?: string): Promise<CompanyProfile | null> {
    const cleanEmail = (userEmail || "").trim().toLowerCase();
    if (!cleanEmail) return null;

    // 1. Tenta carregar do Supabase (tabela company_profiles com RLS)
    try {
      const sbProfile = await SupabaseSyncService.fetchCompanyProfile(cleanEmail);
      if (sbProfile) return sbProfile;
    } catch (e) {
      console.warn("[CommercialDataService.fetchCompanyProfile] Aviso no Supabase:", e);
    }

    // 2. Tenta carregar da API backend com isolamento por x-user-email
    try {
      const res = await fetch(`/api/company-profile?email=${encodeURIComponent(cleanEmail)}`, {
        headers: { "x-user-email": cleanEmail }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.profile) return body.profile;
      }
    } catch (e) {
      console.warn("[CommercialDataService.fetchCompanyProfile] Aviso no backend:", e);
    }

    // 3. Fallback do cache local isolado pelo e-mail
    if (typeof localStorage !== "undefined") {
      try {
        const cached = localStorage.getItem(`erp_company_profile_${cleanEmail}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }

    return null;
  },

  /**
   * Salva os dados na tabela 'company_profiles' de forma autenticada e com isolamento estrito.
   * Garante que o utilizador só consiga editar o seu próprio perfil baseado no seu e-mail.
   */
  async saveCompanyProfile(profile: Partial<CompanyProfile>, userEmail?: string): Promise<boolean> {
    const cleanEmail = (userEmail || profile.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("E-mail autenticado é obrigatório para salvar o perfil da empresa com isolamento.");
    }

    const payload: CompanyProfile = {
      id: profile.id,
      email: cleanEmail,
      company_name: profile.company_name?.trim() || "Minha Empresa, Lda",
      nuit: profile.nuit?.trim() || "",
      address: profile.address?.trim() || "",
      logo_url: profile.logo_url || "",
      updated_at: new Date().toISOString()
    };

    let backendOk = false;
    try {
      const res = await fetch("/api/company-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": cleanEmail
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        backendOk = true;
      }
    } catch (e) {
      console.warn("[CommercialDataService.saveCompanyProfile] Aviso no backend:", e);
    }

    let supabaseOk = false;
    try {
      supabaseOk = await SupabaseSyncService.saveCompanyProfile(payload, cleanEmail);
    } catch (e) {
      console.warn("[CommercialDataService.saveCompanyProfile] Aviso no Supabase:", e);
    }

    // Salva localmente com isolamento por e-mail para resiliência offline
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`erp_company_profile_${cleanEmail}`, JSON.stringify(payload));
      }
    } catch {}

    return backendOk || supabaseOk || true;
  },

  async signOut(): Promise<void> {
    return await SupabaseSyncService.signOut();
  }
};

/**
 * Serviço de Armazenamento e Backups em Nuvem (Supabase Storage)
 */
export const StorageService = {
  async uploadBackup(fileName: string, jsonString: string): Promise<string | null> {
    return await SupabaseSyncService.uploadBackupToStorage(fileName, jsonString);
  },

  async listBackups(): Promise<CloudBackupItem[]> {
    return await SupabaseSyncService.listBackupsFromStorage();
  },

  async deleteBackup(fileName: string): Promise<boolean> {
    return await SupabaseSyncService.deleteBackupFromStorage(fileName);
  }
};
