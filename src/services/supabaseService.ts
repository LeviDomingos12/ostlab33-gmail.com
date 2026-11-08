/**
 * @file supabaseService.ts
 * Driver Oficial de Backend, Diagnósticos, Autenticação e Persistência Relacional (Supabase PostgreSQL).
 * 
 * Arquitetura:
 * OST Vendas Frontend -> Supabase Auth -> Supabase Client -> PostgreSQL + RLS + RPCs -> Supabase Storage
 */

import { createClient, SupabaseClient, Session, User } from "@supabase/supabase-js";
import { supabase as singletonClient } from "../lib/supabase";
import { 
  Product, 
  Customer, 
  Transaction, 
  CashFlowEntry, 
  Employee, 
  AuditLog, 
  SystemSettings, 
  UserRole, 
  CashClosure,
  SupplierOrder,
  CompanyProfile 
} from "../types";
import { generateEntityId } from "../lib/deterministic";
import { authenticatedFetch } from "../lib/apiClient";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
  autoSync: boolean;
  tenantId: string;
}

export interface LatencyResult {
  latencyMs: number;
  status: "optimal" | "good" | "slow" | "error";
  message: string;
  timestamp: string;
}

export interface SessionValidationResult {
  isValid: boolean;
  user: User | null;
  session: Session | null;
  expiresAt: string | null;
  email: string | null;
  role: string | null;
  message: string;
}

export interface CloudBackupItem {
  name: string;
  filename: string;
  fullPath: string;
  size: number;
  updated: string;
  downloadUrl: string;
}

const STORAGE_KEY_CONFIG = "ostvendas_supabase_config";

/**
 * Obtém o tenant da sessão ativa ou armazenamento local
 */
function getActiveSessionTenantId(): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const rawUser = window.localStorage.getItem("erp_logged_in_user");
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u?.tenantId && typeof u.tenantId === "string" && u.tenantId.trim() !== "") {
          return u.tenantId.trim();
        }
        if (u?.companyId && typeof u.companyId === "string" && u.companyId.trim() !== "") {
          return u.companyId.trim();
        }
      }
    }
  } catch {}
  return "";
}

/**
 * Obtém a configuração ativa do Supabase (lê de variáveis de ambiente ou do armazenamento local)
 */
export function getSupabaseConfig(): SupabaseConfig {
  const metaEnv = (import.meta as any).env || {};
  const procEnv = typeof process !== "undefined" && process.env ? process.env : ({} as Record<string, string | undefined>);
  const envUrl = (metaEnv.VITE_SUPABASE_URL as string) || (procEnv.VITE_SUPABASE_URL as string) || "";
  const envKey = (metaEnv.VITE_SUPABASE_ANON_KEY as string) || (procEnv.VITE_SUPABASE_ANON_KEY as string) || "";
  const envTenant = (metaEnv.VITE_SUPABASE_TENANT_ID as string) || (procEnv.VITE_SUPABASE_TENANT_ID as string) || "";
  const isTest = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));
  const fallbackTenant = isTest ? "ost-tenant-001" : "";

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        const parsed = JSON.parse(stored);
        const resolvedTenant = parsed.tenantId || getActiveSessionTenantId() || envTenant || fallbackTenant;
        return {
          url: parsed.url || envUrl,
          anonKey: parsed.anonKey || envKey,
          enabled: parsed.enabled ?? Boolean(envUrl && envKey),
          autoSync: parsed.autoSync ?? true,
          tenantId: resolvedTenant
        };
      }
    }
  } catch (e) {
    console.error("Erro ao ler configuração do Supabase", e);
  }

  const resolvedTenant = getActiveSessionTenantId() || envTenant || fallbackTenant;
  return {
    url: envUrl,
    anonKey: envKey,
    enabled: Boolean(envUrl && envKey),
    autoSync: true,
    tenantId: resolvedTenant
  };
}

/**
 * Salva a configuração do Supabase
 */
export function saveSupabaseConfig(config: Partial<SupabaseConfig>): void {
  const current = getSupabaseConfig();
  const updated: SupabaseConfig = { ...current, ...config };
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
  }
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;

/**
 * Define explicitamente o cliente Supabase (útil para injeção de dependência e testes)
 */
export function setSupabaseClient(client: SupabaseClient | null): void {
  cachedClient = client;
}

/**
 * Obtém ou instancia o cliente Supabase de forma lazy
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !config.enabled) {
    return singletonClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.warn("Falha ao inicializar cliente Supabase personalizado, usando singleton:", err);
    return singletonClient;
  }

  return cachedClient || singletonClient;
}

/**
 * Mede a latência real da rede com o Supabase (Ping em milissegundos)
 */
export async function measureSupabaseLatency(customUrl?: string, customKey?: string): Promise<LatencyResult> {
  const url = customUrl || getSupabaseConfig().url;
  const key = customKey || getSupabaseConfig().anonKey;

  if (!url || !key) {
    return {
      latencyMs: 0,
      status: "error",
      message: "Credenciais do servidor de dados não configuradas.",
      timestamp: new Date().toISOString()
    };
  }

  const startTime = performance.now();
  try {
    const client = createClient(url, key);
    let connError: any = null;
    for (const testTable of ["products", "produtos", "vendas"]) {
      const { error } = await client.from(testTable).select("id").limit(1);
      if (!error) {
        connError = null;
        break;
      }
      connError = error;
    }
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    if (connError && connError.code !== "PGRST116" && connError.code !== "42P01" && connError.code !== "PGRST205") {
      return {
        latencyMs,
        status: "error",
        message: `Falha na resposta: ${connError.message}`,
        timestamp: new Date().toISOString()
      };
    }

    let status: "optimal" | "good" | "slow" = "optimal";
    let message = `Excelente conexão com o Servidor Backend (${latencyMs}ms)`;
    if (latencyMs > 350) {
      status = "slow";
      message = `Latência elevada (${latencyMs}ms) - Verifique a sua ligação de rede.`;
    } else if (latencyMs > 150) {
      status = "good";
      message = `Boa conexão estável com o Servidor Backend (${latencyMs}ms)`;
    }

    return {
      latencyMs,
      status,
      message,
      timestamp: new Date().toISOString()
    };
  } catch (err: any) {
    const endTime = performance.now();
    return {
      latencyMs: Math.round(endTime - startTime),
      status: "error",
      message: err?.message || "Sem resposta do servidor remoto.",
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Validação em tempo real da sessão do utilizador com o Supabase Auth
 */
export async function validateSupabaseSession(): Promise<SessionValidationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      isValid: false,
      user: null,
      session: null,
      expiresAt: null,
      email: null,
      role: null,
      message: "Servidor de dados inativo ou não configurado."
    };
  }

  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) {
      return {
        isValid: false,
        user: null,
        session: null,
        expiresAt: null,
        email: null,
        role: null,
        message: `Erro na sessão: ${error.message}`
      };
    }

    if (!session || !session.user) {
      return {
        isValid: false,
        user: null,
        session: null,
        expiresAt: null,
        email: null,
        role: null,
        message: "Nenhuma sessão ativa encontrada."
      };
    }

    return {
      isValid: true,
      user: session.user,
      session,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      email: session.user.email || null,
      role: session.user.role || (session.user.user_metadata as any)?.role || "Utilizador Autenticado",
      message: `Sessão ativa e válida para ${session.user.email || "Utilizador"}`
    };
  } catch (err: any) {
    return {
      isValid: false,
      user: null,
      session: null,
      expiresAt: null,
      email: null,
      role: null,
      message: err?.message || "Falha ao validar sessão."
    };
  }
}

/**
 * Testa a conexão com o Supabase
 */
export async function testSupabaseConnection(url?: string, key?: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const targetUrl = url || getSupabaseConfig().url;
  const targetKey = key || getSupabaseConfig().anonKey;

  if (!targetUrl || !targetKey) {
    return { success: false, message: "URL ou Chave do Supabase não fornecidas." };
  }

  try {
    const latency = await measureSupabaseLatency(targetUrl, targetKey);
    if (latency.status === "error") {
      return { success: false, message: latency.message, latencyMs: latency.latencyMs };
    }
    return { 
      success: true, 
      message: `Conexão estabelecida com sucesso! (${latency.latencyMs}ms)`, 
      latencyMs: latency.latencyMs 
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Erro desconhecido ao conectar ao Supabase." };
  }
}

/**
 * ============================================================================
 * SERVIÇO PRINCIPAL SUPABASE (CRUD, TRANSAÇÕES ATÓMICAS, AUTH & STORAGE)
 * ============================================================================
 */

// Mapa de operações de venda em curso (in-flight) para prevenir duplicações concorrentes (Idempotência)
const inFlightSaleRequests = new Map<string, Promise<{ success: boolean; error?: string; saleId?: string; invoiceNumber?: string; idempotent?: boolean }>>();

/**
 * Identifica com precisão se o erro é de TABELA/RELAÇÃO inexistente no PostgreSQL / PostgREST,
 * sem confundir com erros de COLUNA inexistente (PGRST204).
 */
export function isTableMissingError(error: any): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") {
    return true;
  }
  const msg = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (
    (msg.includes("does not exist") || msg.includes("in the schema cache") || msg.includes("could not find the table")) &&
    !msg.includes("column")
  ) {
    return true;
  }
  return false;
}

/**
 * Extrai o nome da coluna que está faltando no cache de esquemas do PostgREST (PGRST204) ou PostgreSQL (42703).
 */
export function extractMissingColumn(error: any): string | null {
  if (!error || typeof error.message !== "string") return null;
  const m1 = error.message.match(/Could not find the '([^']+)' column/i);
  if (m1) return m1[1];
  const m2 = error.message.match(/column "?([^"\s]+)"? of relation/i);
  if (m2) return m2[1];
  const m3 = error.message.match(/column "?([^"\s]+)"? does not exist/i);
  if (m3) return m3[1];
  return null;
}

/**
 * Constrói o registro de produto adaptado para a tabela destino ('products' ou 'produtos'),
 * suportando esquemas flexíveis com resiliência automática para variações de colunas.
 */
export function buildProductRecord(
  table: string,
  p: Product,
  tenantId: string,
  excludedCols?: Set<string>,
  useAltPricing?: boolean
): Record<string, any> {
  const isEnglish = table === "products";
  const record: Record<string, any> = {
    id: p.id,
    tenant_id: tenantId,
    name: p.name,
    code: p.code || p.id,
    barcode: p.barcode || p.code || "",
    category: p.category || "Geral",
    stock: p.stock ?? 0,
    min_stock: p.minStock ?? 0,
    unit: (p as any).unit || "un",
    image_url: p.image || (p as any).imageUrl || "",
    is_active: true,
    updated_at: new Date().toISOString()
  };

  if (p.supplier) {
    record.supplier = p.supplier;
  }
  if (p.vatRate !== undefined) {
    record.vat_rate = p.vatRate;
  }
  if (p.expiryDate) {
    record.expiry_date = p.expiryDate;
  }
  if (p.image) {
    record.image = p.image;
  }
  if (p.emoji) {
    record.emoji = p.emoji;
  }
  if (p.promotion) {
    record.promotion = p.promotion;
  }
  if (p.isFavorite !== undefined) {
    record.is_favorite = p.isFavorite;
  }
  if (p.brand) {
    record.brand = p.brand;
  }
  if (p.weightBased !== undefined) {
    record.weight_based = p.weightBased;
  }
  if (p.branchStocks) {
    record.branch_stocks = p.branchStocks;
  }
  if (p.batches) {
    record.batches = p.batches;
  }
  if (p.createdBy) {
    record.created_by = p.createdBy;
  }

  const sPrice = Number(p.salePrice ?? (p as any).price ?? (p as any).sale_price ?? 0);
  const cPrice = Number(p.costPrice ?? (p as any).cost ?? (p as any).cost_price ?? 0);

  if (isEnglish) {
    if (!useAltPricing) {
      record.price = sPrice;
      record.cost = cPrice;
      record.sale_price = sPrice;
      record.cost_price = cPrice;
    } else {
      record.sale_price = sPrice;
      record.cost_price = cPrice;
      record.price = sPrice;
      record.cost = cPrice;
    }
  } else {
    record.cost_price = cPrice;
    record.sale_price = sPrice;
    record.cost = cPrice;
    record.price = sPrice;
  }

  if (excludedCols && excludedCols.size > 0) {
    for (const col of excludedCols) {
      delete record[col];
    }
  }

  return record;
}

export const SupabaseSyncService = {

  // --- AUTENTICAÇÃO SUPABASE COM VALIDAÇÃO ESTRITA DE SEGURANÇA ---
  async signUpWithEmail(email: string, password: string, name: string, branch: string, role: string = "Administrador", plan: string = "OURO") {
    const client = getSupabaseClient();
    if (!client) {
      return { user: null, error: new Error("Servidor de autenticação Supabase não está configurado.") };
    }

    try {
      const { data, error } = await client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            name: name.trim(),
            branch: branch.trim(),
            role,
            subscription_plan: plan
          }
        }
      });

      if (error) {
        console.warn("[Supabase Auth] Erro no signUp:", error.message);
        return { user: null, error };
      }

      if (data && data.user) {
        try {
          const tenantId = getSupabaseConfig().tenantId;
          const empRecord = {
            id: `emp_${data.user.id.slice(0, 8)}`,
            tenant_id: tenantId,
            auth_uid: data.user.id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            status: "ACTIVE",
            branch: branch.trim(),
            subscription_plan: plan,
            created_at: new Date().toISOString()
          };
          await client.from("colaboradores").upsert(empRecord, { onConflict: "email" });
        } catch (colabErr) {
          console.warn("[Supabase Auth] Aviso ao sincronizar colaborador:", colabErr);
        }
      }

      return data;
    } catch (err: any) {
      console.error("[Supabase Auth] Exceção no signUpWithEmail:", err?.message);
      return { user: null, error: err };
    }
  },

  async signInWithEmail(email: string, password: string) {
    const client = getSupabaseClient();
    if (!client) {
      return { user: null, error: new Error("Servidor de autenticação Supabase não está configurado.") };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        console.warn("[Supabase Auth] Falha no signInWithPassword:", error.message);
        return { user: null, error };
      }
      return data;
    } catch (err: any) {
      console.error("[Supabase Auth] Exceção no signInWithEmail:", err?.message);
      return { user: null, error: err };
    }
  },

  async signInWithGoogle(options?: { popup?: boolean }) {
    const client = getSupabaseClient();
    if (!client) {
      return { url: null, error: new Error("Cliente Supabase não configurado.") };
    }

    try {
      const redirectUri = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
      const isIframe = typeof window !== "undefined" && window.self !== window.top;

      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          queryParams: {
            access_type: "offline",
            prompt: "select_account"
          },
          skipBrowserRedirect: isIframe
        }
      });

      if (error) {
        console.warn("[Supabase Auth] Erro no signInWithOAuth Google:", error.message);
        return { data: null, error, url: null };
      }

      if (data?.url && typeof window !== "undefined") {
        if (isIframe) {
          const popup = window.open(
            data.url,
            "google_oauth_popup",
            "width=550,height=650,left=250,top=100,status=no,resizable=yes"
          );
          if (!popup || popup.closed || typeof popup.closed === "undefined") {
            if (window.top) {
              window.top.location.href = data.url;
            } else {
              window.location.assign(data.url);
            }
          }
        } else {
          window.location.assign(data.url);
        }
      }

      return { data, error: null, url: data?.url || null };
    } catch (err: any) {
      console.error("[Supabase Auth] Exceção no signInWithOAuth Google:", err?.message || err);
      return { data: null, error: err, url: null };
    }
  },

  async recoverPassword(email: string) {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: null };

    try {
      const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        console.warn("[Supabase Auth] Aviso no resetPasswordForEmail:", error.message);
      }
      return data;
    } catch (err: any) {
      console.warn("[Supabase Auth] Exceção no resetPasswordForEmail:", err);
      return null;
    }
  },

  async signOut() {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch (err: any) {
        console.warn("[Supabase Auth] Erro no signOut local:", err?.message || err);
      }
      try {
        await client.auth.signOut();
      } catch (err: any) {
        console.warn("[Supabase Auth] Erro no signOut global:", err?.message || err);
      }
    }
    const storage = typeof window !== "undefined" && window.localStorage ? window.localStorage : (typeof localStorage !== "undefined" ? localStorage : null);
    if (storage) {
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const k = storage.key(i);
          if (k && (k.startsWith("sb-") && (k.endsWith("-auth-token") || k.includes("token")))) {
            storage.removeItem(k);
          }
        }
      } catch {}
    }
  },

  /**
   * @deprecated Removido na Etapa 3. O Supabase/PostgreSQL é a fonte autoritativa única.
   */
  mergeRecordsById<T extends { id: string }>(_localList: T[] = [], remoteList: T[] = []): T[] {
    return remoteList;
  },

  /**
   * Sincroniza e Mapeia o Utilizador Autenticado (via Google Provider ou Email)
   * com verificação estrita de integridade de dados para evitar sobrescrita de perfis locais existentes.
   */
  async syncUserProfileFromAuth(user: User, localEmployees: Employee[] = []): Promise<{ employee: Employee; companyId: string; companyName: string }> {
    const client = getSupabaseClient();
    const uid = user.id;
    const email = (user.email || "").toLowerCase().trim();
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
    const avatarUrl = meta.avatar_url || meta.picture || "";
    const phone = meta.phone || meta.contact || "+258 84 000 0000";
    const defaultCompanyName = meta.company_name || meta.branch || "";
    
    // Verificar se já existe colaborador local com este email ou ID correspondente para preservar PIN e configurações
    const localMatch = localEmployees.find(e => 
      (e.email && e.email.toLowerCase().trim() === email) ||
      e.id === "emp_" + uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) ||
      (e.username && e.username.toLowerCase() === email.split("@")[0].toLowerCase())
    );

    let role: string = localMatch?.role || "ADMIN";
    let companyId = "comp_" + uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    let companyName = defaultCompanyName || (localMatch?.companyId && !localMatch.companyId.startsWith("comp_") ? localMatch.companyId : "");
    let status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED" = localMatch?.status || "ACTIVE";
    let subscriptionPlan: any = localMatch?.subscriptionPlan || meta.subscription_plan || "OURO";
    let existingEmpId = localMatch?.id || "emp_" + uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    let pin = localMatch?.pin || "";
    let pinChanged = localMatch?.pinChanged ?? true;
    let pinCreatedAt = localMatch?.pinCreatedAt || new Date().toISOString();
    let fotoPerfil = localMatch?.fotoPerfil || avatarUrl;

    if (client) {
      try {
        // 1. Verificar se este email já foi pré-cadastrado como colaborador por um Administrador
        const { data: existingColab } = await client
          .from("colaboradores")
          .select("*")
          .or(`auth_uid.eq.${uid},email.eq.${email}`)
          .maybeSingle();

        if (existingColab) {
          if (existingColab.id) existingEmpId = existingColab.id;
          if (existingColab.tenant_id) companyId = existingColab.tenant_id;
          if (existingColab.role) role = existingColab.role as UserRole;
          if (existingColab.status) status = existingColab.status as any;
          if (existingColab.branch) companyName = existingColab.branch;
          if (existingColab.subscription_plan) subscriptionPlan = existingColab.subscription_plan;
          if (existingColab.foto_perfil) fotoPerfil = existingColab.foto_perfil;
          if (existingColab.pin) pin = existingColab.pin;

          // Vincular auth_uid se ainda não estava vinculado
          if (!existingColab.auth_uid || existingColab.auth_uid !== uid) {
            await client
              .from("colaboradores")
              .update({ auth_uid: uid, updated_at: new Date().toISOString() })
              .eq("id", existingColab.id);
          }
        }

        // 2. Procurar perfil na tabela 'profiles'
        const { data: profile } = await client
          .from("profiles")
          .select("*, companies(*)")
          .eq("id", uid)
          .maybeSingle();

        if (profile) {
          if (profile.company_id) companyId = profile.company_id;
          if (profile.role && !existingColab) role = profile.role as UserRole;
          if (profile.companies && profile.companies.name) {
            companyName = profile.companies.name;
          }
        } else if (!existingColab) {
          // 3. Verificar se já existe empresa criada para este owner_uid
          const { data: existingComp } = await client
            .from("companies")
            .select("*")
            .eq("owner_uid", uid)
            .maybeSingle();

          if (existingComp) {
            companyId = existingComp.id;
            companyName = existingComp.name;
          } else {
            // Criar nova empresa para este novo administrador
            const { data: newComp } = await client
              .from("companies")
              .upsert({
                id: companyId,
                name: companyName,
                owner_uid: uid,
                email: email,
                phone: phone,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .maybeSingle();

            if (newComp && newComp.id) {
              companyId = newComp.id;
            }
          }

          // Inserir ou atualizar na tabela profiles
          await client.from("profiles").upsert({
            id: uid,
            company_id: companyId,
            email: email,
            full_name: fullName,
            role: role,
            avatar_url: fotoPerfil,
            phone: phone,
            updated_at: new Date().toISOString()
          });

          // Inserir na tabela colaboradores como Administrador da Empresa
          await client.from("colaboradores").upsert({
            id: existingEmpId,
            tenant_id: companyId,
            auth_uid: uid,
            name: fullName,
            email: email,
            role: role,
            contact: phone,
            salary: localMatch?.salary || 0,
            admission_date: localMatch?.admissionDate || new Date().toISOString().split("T")[0],
            status: status,
            branch: companyName,
            subscription_plan: subscriptionPlan,
            foto_perfil: fotoPerfil,
            pin: pin,
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });
        }

        // 4. Configurar tenant_id do Supabase Service para isolamento estrito
        saveSupabaseConfig({ tenantId: companyId });

      } catch (dbErr) {
        console.warn("[Supabase Sync Profile] Falha ao sincronizar perfil:", dbErr);
      }
    }

    const employee: Employee = {
      id: existingEmpId,
      name: localMatch?.name || fullName,
      email: email,
      role: role,
      contact: localMatch?.contact || phone,
      salary: localMatch?.salary || 0,
      admissionDate: localMatch?.admissionDate || new Date().toISOString().split("T")[0],
      status: status,
      username: localMatch?.username || email.split("@")[0],
      pin: pin,
      pinCreatedAt: pinCreatedAt,
      pinChanged: pinChanged,
      companyId: companyName,
      subscriptionPlan: subscriptionPlan,
      fotoPerfil: fotoPerfil,
      theme: localMatch?.theme
    };

    return { employee, companyId, companyName };
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const client = getSupabaseClient();
    if (!client) return { unsubscribe: () => {} };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  },

  // --- DIAGNÓSTICO & VALIDAÇÃO DA TABELA DE PRODUTOS (Única oficial: 'products') ---
  async verifyProductsTable(): Promise<{
    connected: boolean;
    activeTable: string | null;
    error?: string;
  }> {
    const client = getSupabaseClient();
    if (!client) {
      return { connected: false, activeTable: null, error: "Cliente Supabase não inicializado ou credenciais ausentes." };
    }

    try {
      const { error } = await client.from("products").select("id").limit(1);
      if (!error) {
        return { connected: true, activeTable: "products" };
      }
      return {
        connected: false,
        activeTable: null,
        error: isTableMissingError(error)
          ? "Tabela de produtos ('public.products') não encontrada no PostgreSQL (PGRST205)."
          : error.message
      };
    } catch (err: any) {
      return { connected: false, activeTable: null, error: err?.message || String(err) };
    }
  },

  // --- DIAGNÓSTICO DA FUNÇÃO ATÓMICA DE VENDAS (process_sale_atomic) ---
  async verifySalesRpc(): Promise<{
    installed: boolean;
    error?: string;
  }> {
    const client = getSupabaseClient();
    if (!client) {
      return { installed: false, error: "Cliente Supabase não inicializado ou credenciais ausentes." };
    }

    try {
      const { error } = await client.rpc("process_sale_atomic", {
        p_sale_id: "probe-check-rpc",
        p_company_id: "ost-tenant-001",
        p_user_id: "probe",
        p_items: [],
        p_payment_method: "CASH",
        p_total: 0
      });

      if (error) {
        if (error.code === "PGRST202" || error.message.includes("Could not find the function") || error.message.includes("schema cache")) {
          return { installed: false, error: error.message };
        }
        return { installed: true };
      }

      return { installed: true };
    } catch (err: any) {
      return { installed: false, error: err?.message || String(err) };
    }
  },

  // --- PRODUTOS / CATÁLOGO & INVENTÁRIO (Única tabela oficial: 'products') ---
  async fetchProducts(): Promise<Product[]> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Cliente Supabase não inicializado ou credenciais ausentes.");
    }

    let data: any = null;
    let lastError: any = null;

    try {
      const res = await client
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (res.error) {
        lastError = res.error;
      } else {
        data = res.data;
      }
    } catch (e) {
      lastError = e;
    }

    if (lastError) {
      console.error("[SupabaseSyncService.fetchProducts] Erro retornado pelo PostgreSQL na tabela 'products':", lastError);
      const isMissingTable = isTableMissingError(lastError);

      if (isMissingTable) {
        throw new Error(
          `A tabela de produtos ('public.products') não foi encontrada no banco PostgreSQL/Supabase (PGRST205). Por favor, execute o script SQL de criação no SQL Editor do Supabase.`
        );
      }

      throw new Error(
        `Erro ao ler produtos do PostgreSQL: ${lastError.message || (lastError as any).details || JSON.stringify(lastError)}`
      );
    }

    if (!data) {
      throw new Error("Falha ao ler produtos do PostgreSQL: resposta de dados nula.");
    }

    return data
      .filter((row: any) => row.is_active !== false)
      .map((row: any) => {
        const rowSalePrice = (row.sale_price != null && Number(row.sale_price) > 0)
          ? Number(row.sale_price)
          : (row.price != null && Number(row.price) > 0)
            ? Number(row.price)
            : Number(row.sale_price ?? row.price ?? 0);

        const rowCostPrice = (row.cost_price != null && Number(row.cost_price) > 0)
          ? Number(row.cost_price)
          : (row.cost != null && Number(row.cost) > 0)
            ? Number(row.cost)
            : Number(row.cost_price ?? row.cost ?? 0);

        return {
          id: row.id,
          name: row.name,
          code: row.code || row.id,
          category: row.category || "Geral",
          costPrice: rowCostPrice,
          salePrice: rowSalePrice,
          stock: Number(row.stock || 0),
          minStock: Number(row.min_stock || 0),
          vatRate: Number(row.vat_rate || 16),
          unit: row.unit || "un",
          barcode: row.barcode || row.code || "",
          supplier: row.supplier || "",
          expiryDate: row.expiry_date || row.expiryDate || undefined,
          imageUrl: row.image_url || row.imageUrl || row.image || "",
          image: row.image_url || row.imageUrl || row.image || "",
          emoji: row.emoji || undefined,
          promotion: row.promotion || undefined,
          isFavorite: Boolean(row.is_favorite ?? row.isFavorite ?? false),
          brand: row.brand || undefined,
          weightBased: Boolean(row.weight_based ?? row.weightBased ?? false),
          branchStocks: row.branch_stocks || undefined,
          batches: row.batches || undefined,
          tenantId: row.tenant_id || undefined,
          createdBy: row.created_by || undefined,
          createdAt: row.created_at || undefined,
          updatedAt: row.updated_at || undefined
        };
      });
  },

  async saveProduct(product: Product): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Cliente Supabase não configurado para salvar produto.");
    }

    const tenantId = getSupabaseConfig().tenantId;
    const table = "products";
    const excludedCols = new Set<string>();
    let useAltPricing = false;
    let saved = false;
    let lastError: any = null;

    // Resiliência de colunas dentro da tabela oficial 'products'
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const record = buildProductRecord(table, product, tenantId, excludedCols, useAltPricing);
        const res = await client.from(table).upsert(record as any, { onConflict: "id" });

        if (!res.error) {
          saved = true;
          lastError = null;
          break;
        }

        if (isTableMissingError(res.error)) {
          lastError = res.error;
          break;
        }

        const missingCol = extractMissingColumn(res.error);
        if (missingCol) {
          if (missingCol === "price" || missingCol === "cost") {
            useAltPricing = true;
            continue;
          } else if (missingCol === "sale_price" || missingCol === "cost_price") {
            useAltPricing = false;
            continue;
          } else {
            excludedCols.add(missingCol);
            continue;
          }
        }

        lastError = res.error;
        break;
      } catch (err) {
        lastError = err;
        break;
      }
    }

    if (!saved && lastError) {
      console.error("[SupabaseSyncService.saveProduct] Erro ao gravar produto no PostgreSQL ('products'):", lastError);
      const isMissingTable = isTableMissingError(lastError);

      if (isMissingTable) {
        throw new Error(
          `A tabela de produtos ('public.products') não foi encontrada no banco PostgreSQL/Supabase (PGRST205). Por favor, execute o script SQL de criação no painel do Supabase.`
        );
      }

      throw new Error(
        `Erro ao gravar produto no PostgreSQL: ${lastError.message || (lastError as any).details || JSON.stringify(lastError)}`
      );
    }

    return true;
  },

  async syncProducts(products: Product[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Cliente Supabase não configurado para sincronizar produtos.");
    }
    if (products.length === 0) return true;

    const tenantId = getSupabaseConfig().tenantId;
    const table = "products";
    const excludedCols = new Set<string>();
    let useAltPricing = false;
    let synced = false;
    let lastError: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const records = products.map((p) => buildProductRecord(table, p, tenantId, excludedCols, useAltPricing));
        const res = await client.from(table).upsert(records as any, { onConflict: "id" });

        if (!res.error) {
          synced = true;
          lastError = null;
          break;
        }

        if (isTableMissingError(res.error)) {
          lastError = res.error;
          break;
        }

        const missingCol = extractMissingColumn(res.error);
        if (missingCol) {
          if (missingCol === "price" || missingCol === "cost") {
            useAltPricing = true;
            continue;
          } else if (missingCol === "sale_price" || missingCol === "cost_price") {
            useAltPricing = false;
            continue;
          } else {
            excludedCols.add(missingCol);
            continue;
          }
        }

        lastError = res.error;
        break;
      } catch (err) {
        lastError = err;
        break;
      }
    }

    if (!synced && lastError) {
      console.error("[SupabaseSyncService.syncProducts] Erro ao sincronizar lote de produtos no PostgreSQL ('products'):", lastError);
      const isMissingTable = isTableMissingError(lastError);

      if (isMissingTable) {
        throw new Error(
          `A tabela de produtos ('public.products') não foi encontrada no banco PostgreSQL/Supabase (PGRST205). Por favor, execute o script SQL de criação no painel do Supabase.`
        );
      }

      throw new Error(
        `Erro ao sincronizar produtos no PostgreSQL: ${lastError.message || (lastError as any).details || JSON.stringify(lastError)}`
      );
    }

    return true;
  },

  async deleteProduct(productId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Cliente Supabase não configurado para remover produto.");
    }

    const table = "products";
    try {
      const res = await client.from(table).update({ is_active: false }).eq("id", productId);
      if (res.error) {
        throw res.error;
      }
      return true;
    } catch (err: any) {
      console.error("[SupabaseSyncService.deleteProduct] Erro ao desativar produto no PostgreSQL ('products'):", err);
      throw new Error(
        `Erro ao desativar produto no PostgreSQL: ${err.message || (err as any).details || JSON.stringify(err)}`
      );
    }
  },

  // --- REPLENISH STOCK ATOMIC (RPC) ---
  async replenishStockAtomic(params: {
    productId: string;
    quantity: number;
    costPrice?: number;
    reason?: string;
    userName?: string;
  }): Promise<{ success: boolean; error?: string; newStock?: number }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: "Supabase não conectado." };

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const basePayload: Record<string, any> = {
        p_tenant_id: tenantId,
        p_product_id: params.productId,
        p_quantity: params.quantity,
        p_cost_price: params.costPrice || null,
        p_reason: params.reason || "Reabastecimento de Stock",
        p_user_name: params.userName || "Sistema"
      };

      let { data, error } = await client.rpc("replenish_stock_atomic", basePayload);

      if (error && error.message && error.message.includes("schema cache")) {
        const altRes = await client.rpc("replenish_stock_atomic", {
          ...basePayload,
          p_received_by: params.userName || "Sistema"
        });
        data = altRes.data;
        error = altRes.error;
      }

      if (error) return { success: false, error: error.message };
      return data || { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // --- CLIENTES - PERSISTÊNCIA MULTICAMADA ADAPTATIVA (POSTGRESQL / SERVIDOR / LOCAL) ---
  async fetchCustomers(): Promise<Customer[]> {
    const client = getSupabaseClient();
    const candidateTables = ["clientes", "customers"];
    let remoteCustomers: Customer[] = [];
    let querySuccessful = false;

    if (client) {
      for (const table of candidateTables) {
        try {
          const { data, error } = await client
            .from(table)
            .select("*")
            .order("name", { ascending: true });

          if (!error && Array.isArray(data)) {
            querySuccessful = true;
            remoteCustomers = data.map((row: any) => ({
              id: row.id,
              name: row.name,
              nuit: row.nuit || row.nif || "",
              email: row.email || "",
              phone: row.phone || row.telefone || "",
              address: row.address || row.endereco || row.morada || "",
              totalSpent: Number(row.total_spent || 0),
              purchaseCount: Number(row.purchase_count || 0),
              debt: Number(row.debt ?? row.balance ?? 0),
              balance: Number(row.balance ?? row.debt ?? 0),
              creditLimit: Number(row.credit_limit || 0),
              lastPurchaseDate: row.last_purchase_date || undefined,
              loyaltyPoints: Number(row.loyalty_points || 0),
              creditBlocked: Boolean(row.credit_blocked),
              preferredPaymentMethod: row.preferred_payment_method || undefined,
              oneClickCheckoutEnabled: Boolean(row.one_click_checkout_enabled),
              settlements: Array.isArray(row.settlements) ? row.settlements : [],
              notes: row.notes || ""
            }));
            break;
          }
        } catch (e) {
          console.warn(`[SupabaseSyncService.fetchCustomers] Aviso ao ler tabela '${table}':`, e);
        }
      }
    }

    // Consulta persistência complementar do backend /api/customers
    let serverCustomers: Customer[] = [];
    try {
      const resp = await authenticatedFetch("/api/customers");
      if (resp.ok) {
        const body = await resp.json();
        if (body.success && Array.isArray(body.data)) {
          serverCustomers = body.data;
        }
      }
    } catch {}

    // Lê cache local de emergência (estritamente isolado por tenant)
    const tenantId = getSupabaseConfig().tenantId;
    const custCacheKey = tenantId ? `erp_customers_cache_${tenantId}` : null;
    let localCache: Customer[] = [];
    if (custCacheKey) {
      try {
        const raw = localStorage.getItem(custCacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) localCache = parsed;
        }
      } catch {}
    }

    // Fusão inteligente de 3 camadas
    const mergedMap = new Map<string, Customer>();

    // 1. Base com cache local
    localCache.forEach(c => { if (c?.id) mergedMap.set(c.id, c); });

    // 2. Servidor backend enriquece com dados persistidos no backend
    serverCustomers.forEach(c => {
      if (c?.id) {
        const prev = mergedMap.get(c.id) || ({} as Customer);
        mergedMap.set(c.id, { ...prev, ...c });
      }
    });

    // 3. Supabase atualiza com dados do PostgreSQL
    if (querySuccessful) {
      remoteCustomers.forEach(c => {
        if (c?.id) {
          const prev = mergedMap.get(c.id);
          if (prev) {
            mergedMap.set(c.id, {
              ...c,
              address: c.address || prev.address || "",
              notes: c.notes || prev.notes || "",
              loyaltyPoints: c.loyaltyPoints || prev.loyaltyPoints || 0,
              totalSpent: c.totalSpent || prev.totalSpent || 0,
              purchaseCount: c.purchaseCount || prev.purchaseCount || 0,
              settlements: (c.settlements && c.settlements.length > 0) ? c.settlements : (prev.settlements || []),
              preferredPaymentMethod: c.preferredPaymentMethod || prev.preferredPaymentMethod
            });
          } else {
            mergedMap.set(c.id, c);
          }
        }
      });
    }

    const finalList = Array.from(mergedMap.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // Mantém cache local atualizado (isolado por tenant)
    if (finalList.length > 0) {
      try {
        localStorage.setItem(custCacheKey, JSON.stringify(finalList));
      } catch {}
    }

    // Auto-cura: se o Supabase estava vazio mas tínhamos clientes no servidor ou local, salva no Supabase em segundo plano
    if (client && remoteCustomers.length === 0 && finalList.length > 0) {
      this.syncCustomers(finalList).catch(() => {});
    }

    return finalList;
  },

  async saveCustomer(customer: Customer): Promise<boolean> {
    if (!customer?.id || !customer?.name) return false;

    // 1. Atualização imediata do cache local (estritamente isolado por tenant)
    const tenantId = getSupabaseConfig().tenantId;
    const custCacheKey = tenantId ? `erp_customers_cache_${tenantId}` : null;
    if (custCacheKey) {
      try {
        const raw = localStorage.getItem(custCacheKey);
        let currentCache: Customer[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(currentCache)) currentCache = [];
        const idx = currentCache.findIndex(c => c.id === customer.id);
        if (idx >= 0) {
          currentCache[idx] = { ...currentCache[idx], ...customer };
        } else {
          currentCache.unshift(customer);
        }
        localStorage.setItem(custCacheKey, JSON.stringify(currentCache));
      } catch {}
    }

    // 2. Persistência direta no servidor backend
    try {
      authenticatedFetch("/api/customers/single", {
        method: "POST",
        body: JSON.stringify(customer)
      }).catch(e => console.warn("[saveCustomer] Aviso backend:", e));
    } catch {}

    // 3. Persistência no Supabase / PostgreSQL com poda adaptativa de colunas
    const client = getSupabaseClient();
    if (!client) return true;

    const candidateTables = ["clientes", "customers"];
    const excludedCols = new Set<string>([
      "address",
      "debt",
      "total_spent",
      "purchase_count",
      "loyalty_points",
      "credit_blocked",
      "preferred_payment_method",
      "one_click_checkout_enabled",
      "settlements",
      "last_purchase_date",
      "notes"
    ]);

    for (const table of candidateTables) {
      let saved = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const rec: Record<string, any> = {
            id: customer.id,
            name: customer.name
          };
          if (!excludedCols.has("tenant_id")) rec.tenant_id = tenantId;
          if (!excludedCols.has("nuit")) rec.nuit = customer.nuit || (customer as any).nif || "";
          if (!excludedCols.has("email")) rec.email = customer.email || "";
          if (!excludedCols.has("phone")) rec.phone = customer.phone || "";
          if (!excludedCols.has("address")) rec.address = customer.address || "";
          if (!excludedCols.has("balance")) rec.balance = customer.balance ?? customer.debt ?? 0;
          if (!excludedCols.has("debt")) rec.debt = customer.debt ?? customer.balance ?? 0;
          if (!excludedCols.has("credit_limit")) rec.credit_limit = (customer as any).creditLimit ?? 0;
          if (!excludedCols.has("total_spent")) rec.total_spent = customer.totalSpent ?? 0;
          if (!excludedCols.has("purchase_count")) rec.purchase_count = customer.purchaseCount ?? 0;
          if (!excludedCols.has("loyalty_points")) rec.loyalty_points = customer.loyaltyPoints ?? 0;
          if (!excludedCols.has("updated_at")) rec.updated_at = new Date().toISOString();

          const { error } = await client.from(table).upsert(rec, { onConflict: "id" });
          if (!error) {
            saved = true;
            break;
          }

          if (isTableMissingError(error)) {
            break;
          }

          const missing = extractMissingColumn(error);
          if (missing) {
            excludedCols.add(missing);
            continue;
          }
          break;
        } catch {
          break;
        }
      }
      if (saved) break;
    }

    return true;
  },

  async syncCustomers(customers: Customer[]): Promise<boolean> {
    if (!Array.isArray(customers) || customers.length === 0) return true;

    // 1. Atualiza cache local (estritamente isolado por tenant)
    const tenantId = getSupabaseConfig().tenantId;
    const custCacheKey = tenantId ? `erp_customers_cache_${tenantId}` : null;
    if (custCacheKey) {
      try {
        localStorage.setItem(custCacheKey, JSON.stringify(customers));
      } catch {}
    }

    // 2. Persiste em lote no servidor backend
    try {
      authenticatedFetch("/api/customers", {
        method: "POST",
        body: JSON.stringify({ customers })
      }).catch(e => console.warn("[syncCustomers] Aviso backend:", e));
    } catch {}

    // 3. Persiste no Supabase / PostgreSQL com auto-adaptação
    const client = getSupabaseClient();
    if (!client) return true;

    const candidateTables = ["clientes", "customers"];
    const excludedCols = new Set<string>([
      "address",
      "debt",
      "total_spent",
      "purchase_count",
      "loyalty_points",
      "credit_blocked",
      "preferred_payment_method",
      "one_click_checkout_enabled",
      "settlements",
      "last_purchase_date",
      "notes"
    ]);

    for (const table of candidateTables) {
      let synced = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const records = customers.map(c => {
            const rec: Record<string, any> = {
              id: c.id,
              name: c.name
            };
            if (!excludedCols.has("tenant_id")) rec.tenant_id = tenantId;
            if (!excludedCols.has("nuit")) rec.nuit = c.nuit || (c as any).nif || "";
            if (!excludedCols.has("email")) rec.email = c.email || "";
            if (!excludedCols.has("phone")) rec.phone = c.phone || "";
            if (!excludedCols.has("address")) rec.address = c.address || "";
            if (!excludedCols.has("balance")) rec.balance = c.balance ?? c.debt ?? 0;
            if (!excludedCols.has("debt")) rec.debt = c.debt ?? c.balance ?? 0;
            if (!excludedCols.has("credit_limit")) rec.credit_limit = (c as any).creditLimit ?? 0;
            if (!excludedCols.has("total_spent")) rec.total_spent = c.totalSpent ?? 0;
            if (!excludedCols.has("purchase_count")) rec.purchase_count = c.purchaseCount ?? 0;
            if (!excludedCols.has("loyalty_points")) rec.loyalty_points = c.loyaltyPoints ?? 0;
            if (!excludedCols.has("updated_at")) rec.updated_at = new Date().toISOString();
            return rec;
          });

          const { error } = await client.from(table).upsert(records, { onConflict: "id" });
          if (!error) {
            synced = true;
            break;
          }

          if (isTableMissingError(error)) {
            break;
          }

          const missing = extractMissingColumn(error);
          if (missing) {
            excludedCols.add(missing);
            continue;
          }
          break;
        } catch {
          break;
        }
      }
      if (synced) break;
    }

    return true;
  },

  async deleteCustomer(customerId: string): Promise<boolean> {
    // 1. Remove do cache local (estritamente isolado por tenant)
    const tenantId = getSupabaseConfig().tenantId;
    const custCacheKey = tenantId ? `erp_customers_cache_${tenantId}` : null;
    if (custCacheKey) {
      try {
        const raw = localStorage.getItem(custCacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((c: any) => c.id !== customerId);
            localStorage.setItem(custCacheKey, JSON.stringify(filtered));
          }
        }
      } catch {}
    }

    // 2. Remove do servidor backend
    try {
      authenticatedFetch(`/api/customers/${customerId}`, { method: "DELETE" }).catch(() => {});
    } catch {}

    // 3. Remove do Supabase
    const client = getSupabaseClient();
    if (client) {
      const candidateTables = ["clientes", "customers"];
      for (const table of candidateTables) {
        try {
          await client.from(table).delete().eq("id", customerId);
        } catch {}
      }
    }

    return true;
  },

  // --- VENDAS / TRANSAÇÕES ---
  async fetchTransactions(sinceIsoDate?: string): Promise<Transaction[]> {
    const client = getSupabaseClient();
    if (!client) {
      const err = new Error("Cliente PostgreSQL/Supabase não está disponível ou não foi inicializado.");
      console.error("[SupabaseSyncService.fetchTransactions]", err.message);
      throw err;
    }

    try {
      const candidateTables = ["vendas", "sales", "transactions"];
      let lastError: any = null;
      let data: any[] | null = null;

      for (const table of candidateTables) {
        let query = client.from(table).select("*");

        if (table === "sales") {
          query = query.order("created_at", { ascending: false });
          if (sinceIsoDate) {
            query = query.gte("created_at", sinceIsoDate);
          }
        } else {
          query = query.order("timestamp", { ascending: false });
          if (sinceIsoDate) {
            query = query.gte("timestamp", sinceIsoDate);
          }
        }

        let res: any = null;
        try {
          res = await query;
        } catch (fetchErr: any) {
          lastError = {
            message: fetchErr?.message || "Failed to fetch",
            code: "FETCH_ERROR"
          };
          break;
        }

        if (res && !res.error) {
          data = res.data;
          lastError = null;
          break;
        }

        if (res?.error) {
          const isSchemaCacheMissing =
            res.error.code === "PGRST205" ||
            (typeof res.error.message === "string" && res.error.message.includes("in the schema cache"));

          if (isSchemaCacheMissing) {
            lastError = res.error;
            continue;
          }

          // Se for um erro real do PostgreSQL (ex: timeout 57P01, permissão negada 42501, relation doesn't exist 42P01),
          // não prossegue para outras tabelas para manter fidelidade estrita ao erro do banco.
          lastError = res.error;
          break;
        }
      }

      if (lastError) {
        const isSchemaCacheMissing =
          lastError.code === "PGRST205" ||
          (typeof lastError.message === "string" && lastError.message.includes("in the schema cache"));

        if (isSchemaCacheMissing) {
          console.warn(
            "[SupabaseSyncService.fetchTransactions] Tabela de vendas ('vendas'/'sales') não encontrada no schema cache (PGRST205). Base sem vendas registradas. Retornando lista inicial vazia."
          );
          return [];
        }

        console.error("[SupabaseSyncService.fetchTransactions] Erro retornado pelo PostgreSQL:", lastError);
        throw new Error(
          `Erro ao ler vendas do PostgreSQL: ${lastError.message || (lastError as any).details || JSON.stringify(lastError)}`
        );
      }

      if (!data) {
        return [];
      }

      return data.map((row: any) => {
        const grandTotal = Number(row.grand_total ?? row.grandTotal ?? row.total_amount ?? 0);
        const subtotal = Number(row.subtotal ?? row.sub_total ?? grandTotal);
        const vatTotal = Number(row.vat_total ?? row.vatTotal ?? row.tax_amount ?? 0);
        const discountTotal = Number(row.discount_total ?? row.discountTotal ?? 0);

        let rawItems: any[] = [];
        if (Array.isArray(row.items)) {
          rawItems = row.items;
        } else if (typeof row.items_json === "string") {
          try { rawItems = JSON.parse(row.items_json || "[]"); } catch { rawItems = []; }
        } else if (typeof row.items === "string") {
          try { rawItems = JSON.parse(row.items || "[]"); } catch { rawItems = []; }
        }

        const normalizedItems = rawItems.map((item: any) => {
          const qty = Number(item.quantity ?? item.qty ?? 1);
          const price = Number(item.price ?? item.salePrice ?? item.sale_price ?? item.unitPrice ?? item.unit_price ?? 0);
          const itemSubtotal = Number(item.subtotal ?? item.sub_total ?? (price * qty));
          const vatRate = Number(item.vatRate ?? item.vat_rate ?? 16);
          const vatAmount = Number(item.vatAmount ?? item.vat_amount ?? (itemSubtotal * (vatRate / 100)));
          const discountAmount = Number(item.discountAmount ?? item.discount_amount ?? 0);
          const costPrice = Number(item.costPrice ?? item.cost_price ?? item.cost ?? 0);

          return {
            productId: item.productId || item.product_id || item.id || "",
            productName: item.productName || item.product_name || item.name || "Artigo",
            quantity: isNaN(qty) ? 1 : qty,
            price: isNaN(price) ? 0 : price,
            salePrice: isNaN(price) ? 0 : price,
            subtotal: isNaN(itemSubtotal) ? 0 : itemSubtotal,
            costPrice: isNaN(costPrice) ? 0 : costPrice,
            vatRate: isNaN(vatRate) ? 16 : vatRate,
            vatAmount: isNaN(vatAmount) ? 0 : vatAmount,
            discountAmount: isNaN(discountAmount) ? 0 : discountAmount,
            observation: item.observation || ""
          };
        });

        return {
          id: row.id,
          invoiceNumber: row.invoice_number || row.invoiceNumber || row.id,
          customerName: row.customer_name || row.customerName || "Consumidor Final",
          customerId: row.customer_id || row.customerId || undefined,
          customerNuit: row.customer_nuit || undefined,
          customerPhone: row.customer_phone || undefined,
          customerEmail: row.customer_email || undefined,
          grandTotal: isNaN(grandTotal) ? 0 : grandTotal,
          subtotal: isNaN(subtotal) ? (isNaN(grandTotal) ? 0 : grandTotal) : subtotal,
          vatTotal: isNaN(vatTotal) ? 0 : vatTotal,
          discountTotal: isNaN(discountTotal) ? 0 : discountTotal,
          paymentMethod: row.payment_method || row.paymentMethod || "CASH",
          paymentStatus: row.payment_status || row.status || "PAID",
          cashierName: row.cashier_name || row.operator_name || row.seller_name || row.sellerName || "",
          branchId: row.branch_id || undefined,
          amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
          changeAmount: row.change_amount != null ? Number(row.change_amount) : undefined,
          fiscalHash: row.fiscal_hash || undefined,
          fiscalKeys: row.fiscal_keys || undefined,
          fiscalCertified: Boolean(row.fiscal_certified),
          items: normalizedItems,
          notes: row.notes || undefined,
          timestamp: row.timestamp || row.created_at || row.createdAt || new Date().toISOString(),
          idempotencyKey: row.idempotency_key || undefined
        };
      });
    } catch (err: any) {
      if (
        err?.code === "PGRST205" ||
        (typeof err?.message === "string" && err.message.includes("in the schema cache"))
      ) {
        console.warn("[SupabaseSyncService.fetchTransactions] Schema cache PGRST205 capturado. Retornando [].");
        return [];
      }
      console.error("[SupabaseSyncService.fetchTransactions] Exceção ao ler vendas do PostgreSQL:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },

  async fetchRecentTransactions24h(): Promise<Transaction[]> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return await this.fetchTransactions(since24h);
  },

  // --- PROCESS SALE ATOMIC (RPC) ---

  async processSaleAtomic(params: {
    saleId: string;
    invoiceNumber: string;
    customerId?: string;
    customerName?: string;
    customerNuit?: string;
    userId?: string | null;
    userName?: string;
    sellerId?: string | null;
    sellerName?: string;
    paymentMethod: string;
    subtotal: number;
    discountTotal: number;
    vatTotal: number;
    grandTotal: number;
    amountPaid: number;
    changeAmount: number;
    items: any[];
    notes?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; error?: string; saleId?: string; invoiceNumber?: string; idempotent?: boolean }> {
    const idempotencyKey = params.idempotencyKey || params.saleId;
    
    // Se uma operação com a mesma chave de idempotência já estiver a correr em paralelo, reaproveita a promessa em curso
    if (idempotencyKey && inFlightSaleRequests.has(idempotencyKey)) {
      console.warn(`[SupabaseSyncService] Pedido concorrente para a venda/chave ${idempotencyKey}. Retornando a promessa em curso.`);
      return await inFlightSaleRequests.get(idempotencyKey)!;
    }

    const executeSale = async (): Promise<{ success: boolean; error?: string; saleId?: string; invoiceNumber?: string; idempotent?: boolean }> => {
      const client = getSupabaseClient();
      if (!client) {
        return { success: false, error: "Supabase não conectado. Conexão ao PostgreSQL obrigatória para registar vendas." };
      }

      try {
        const companyId = (params as any).companyId || (params as any).tenantId || getSupabaseConfig().tenantId;
        if (!companyId) {
          return { success: false, error: "Identificador de empresa/tenant ausente. Operação cancelada." };
        }

        // Contrato Oficial Único: Frontend <-> PostgreSQL (public.process_sale_atomic)
        const officialPayload = {
          p_sale_id: params.saleId,
          p_company_id: companyId,
          p_user_id: params.userId || params.sellerId || "Operador",
          p_items: (params.items || []).map((it: any) => ({
            productId: it.productId || it.id,
            productName: it.productName || it.name || "Artigo",
            quantity: Number(it.quantity || 1),
            salePrice: Number(it.salePrice || it.price || it.unitPrice || 0),
            costPrice: Number(it.costPrice || it.cost || 0),
            vatRate: Number(it.vatRate || 16)
          })),
          p_payment_method: params.paymentMethod,
          p_total: Number(params.grandTotal || 0),
          p_idempotency_key: idempotencyKey,
          p_invoice_number: params.invoiceNumber || params.saleId,
          p_customer_id: params.customerId || null,
          p_customer_name: params.customerName || "Consumidor Final",
          p_customer_nuit: params.customerNuit || null,
          p_user_name: params.userName || params.sellerName || "Operador",
          p_subtotal: Number(params.subtotal ?? params.grandTotal ?? 0),
          p_discount_total: Number(params.discountTotal || 0),
          p_vat_total: Number(params.vatTotal || 0),
          p_amount_paid: Number(params.amountPaid ?? params.grandTotal ?? 0),
          p_change_amount: Number(params.changeAmount || 0),
          p_notes: params.notes || null
        };

        // Invocação oficial direta
        const { data, error } = await client.rpc("process_sale_atomic", officialPayload);

        // Função de contingência: Gravação direta nas tabelas em caso de erro na RPC de Stored Procedure (ex: falta de uuid_generate_v4)
        const fallbackDirectSale = async (reason: string): Promise<{ success: boolean; error?: string; saleId?: string; invoiceNumber?: string }> => {
          console.warn(`[processSaleAtomic] Contingência acionada (${reason}). Gravando venda diretamente nas tabelas public.vendas, venda_itens, stock_movements e caixa...`);
          try {
            const saleId = params.saleId;
            const invoiceNumber = params.invoiceNumber || params.saleId;
            const paymentMethod = params.paymentMethod || "DINHEIRO";
            const grandTotal = Number(params.grandTotal || 0);
            const amountPaid = Number(params.amountPaid ?? grandTotal);
            const changeAmount = Number(params.changeAmount || 0);
            const subtotal = Number(params.subtotal ?? grandTotal);
            const discountTotal = Number(params.discountTotal || 0);
            const vatTotal = Number(params.vatTotal || 0);
            const userName = params.userName || params.sellerName || "Operador";
            const isCredit = ["A Prazo / Dívida", "Crédito", "CREDITO", "DEBT"].includes(paymentMethod);

            // 1. Gravar em public.vendas
            const { error: saleErr } = await client.from("vendas").upsert([{
              id: saleId,
              tenant_id: companyId,
              idempotency_key: idempotencyKey,
              invoice_number: invoiceNumber,
              customer_id: params.customerId || null,
              customer_name: params.customerName || "Consumidor Final",
              customer_nuit: params.customerNuit || null,
              seller_id: params.userId || null,
              seller_name: userName,
              operator_name: userName,
              payment_method: paymentMethod,
              payment_status: isCredit ? "PENDING_DEBT" : "PAID",
              subtotal: subtotal,
              discount_total: discountTotal,
              vat_total: vatTotal,
              grand_total: grandTotal,
              amount_paid: amountPaid,
              change_amount: changeAmount,
              total_amount: grandTotal,
              tax_amount: vatTotal,
              status: "COMPLETED",
              items: params.items || [],
              notes: params.notes || null,
              timestamp: new Date().toISOString(),
              created_at: new Date().toISOString()
            }], { onConflict: "id" });

            if (saleErr) {
              console.error("[fallbackDirectSale] Erro ao gravar em public.vendas:", saleErr.message);
              return { success: false, error: saleErr.message };
            }

            // 2. Gravar itens e abater stock
            for (const item of (params.items || [])) {
              const prodId = item.productId || item.id;
              const prodName = item.productName || item.name || "Artigo";
              const qty = Number(item.quantity || 1);
              const unitPrice = Number(item.price || item.salePrice || item.unitPrice || 0);
              const costPrice = Number(item.costPrice || item.cost || 0);
              const vatRate = Number(item.vatRate || 16);
              const vatAmount = Number(item.vatAmount || 0);
              const totalPrice = Number(item.totalPrice || item.total || (qty * unitPrice));
              const itemId = `vi_${saleId}_${prodId}`.slice(0, 60);

              await client.from("venda_itens").upsert([{
                id: itemId,
                tenant_id: companyId,
                sale_id: saleId,
                product_id: prodId,
                product_name: prodName,
                unit_price: unitPrice,
                quantity: qty,
                cost_price: costPrice,
                discount: 0,
                vat_rate: vatRate,
                vat_amount: vatAmount,
                total_price: totalPrice,
                created_at: new Date().toISOString()
              }], { onConflict: "id" });

              try {
                const { data: prodData } = await client.from("products").select("stock, name").eq("id", prodId).single();
                const currStock = Number(prodData?.stock || 0);
                const newStock = Math.max(0, currStock - qty);
                await client.from("products").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", prodId);

                const movId = `sm_${saleId}_${prodId}`.slice(0, 60);
                await client.from("stock_movements").upsert([{
                  id: movId,
                  tenant_id: companyId,
                  product_id: prodId,
                  type: "EXIT_SALE",
                  quantity: qty,
                  previous_stock: currStock,
                  new_stock: newStock,
                  cost_price: costPrice,
                  reason: `Venda ${invoiceNumber}`,
                  reference_id: saleId,
                  user_id: params.userId || "Operador",
                  user_name: userName,
                  timestamp: new Date().toISOString()
                }], { onConflict: "id" });
              } catch (stkErr) {
                console.warn("[fallbackDirectSale] Falha ao atualizar stock de artigo:", stkErr);
              }
            }

            // 3. Registar entrada de caixa se pago a dinheiro
            const isCash = paymentMethod.toUpperCase().includes("DINHEIRO") || paymentMethod.toUpperCase().includes("CASH") || paymentMethod.toUpperCase().includes("NUMER");
            if (isCash && amountPaid > 0) {
              const caixaId = `cx_${saleId}`.slice(0, 60);
              await client.from("caixa").upsert([{
                id: caixaId,
                tenant_id: companyId,
                type: "INPUT",
                amount: amountPaid,
                reason: `Recebimento Venda ${invoiceNumber}`,
                responsible_user: userName,
                reference_id: saleId,
                timestamp: new Date().toISOString()
              }], { onConflict: "id" });
            }

            // 4. Registar crédito / dívida de cliente se venda a prazo
            if (isCredit && params.customerId) {
              const remainingDebt = Math.max(0, grandTotal - amountPaid);
              const debtId = `debt_${saleId}`.slice(0, 60);
              await client.from("customer_debts").upsert([{
                id: debtId,
                tenant_id: companyId,
                customer_id: params.customerId,
                sale_id: saleId,
                total_amount: grandTotal,
                paid_amount: amountPaid,
                remaining_balance: remainingDebt,
                due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                status: remainingDebt <= 0 ? "SETTLED" : "PENDING",
                created_at: new Date().toISOString()
              }], { onConflict: "id" });

              try {
                const { data: custData } = await client.from("clientes").select("balance").eq("id", params.customerId).single();
                const currBal = Number(custData?.balance || 0);
                await client.from("clientes").update({
                  balance: currBal + remainingDebt,
                  updated_at: new Date().toISOString()
                }).eq("id", params.customerId);
              } catch {}
            }

            // 5. Registar log de auditoria
            try {
              const auditId = `aud_${saleId}`.slice(0, 60);
              await client.from("audit_logs").upsert([{
                id: auditId,
                tenant_id: companyId,
                user_id: params.userId || "Operador",
                user_name: userName,
                action: "VENDA_CONCLUIDA",
                module: "POS",
                details: `Venda ${invoiceNumber} no valor de ${grandTotal} MT concluída com sucesso.`,
                timestamp: new Date().toISOString()
              }], { onConflict: "id" });
            } catch {}

            return {
              success: true,
              saleId: saleId,
              invoiceNumber: invoiceNumber
            };
          } catch (directErr: any) {
            console.error("[fallbackDirectSale] Falha crítica:", directErr.message);
            return { success: false, error: directErr.message || "Erro ao gravar venda no PostgreSQL." };
          }
        };

        // 1. Falha de rede ou erro na chamada do RPC
        if (error) {
          console.error("[RPC process_sale_atomic] Erro de execução (Rollback acionado):", error.message);
          return { success: false, error: error.message };
        }

        // 2. O PostgreSQL executou a função mas retornou success: false (ex: erro de função de UUID ausente)
        if (!data || data.success !== true) {
          const failureReason = data?.error || data?.message || "O PostgreSQL não confirmou a gravação da venda.";
          if (typeof failureReason === "string" && (failureReason.includes("uuid_generate_v4") || failureReason.includes("does not exist"))) {
            return await fallbackDirectSale(`Erro interno de UUID na procedure: ${failureReason}`);
          }
          console.error("[RPC process_sale_atomic] Rejeição pelo PostgreSQL:", failureReason);
          return { success: false, error: failureReason };
        }

        // 3. PostgreSQL confirmou explicitamente com success: true (novo registo ou resultado idempotente)
        return {
          success: true,
          saleId: data.sale_id || params.saleId,
          invoiceNumber: data.invoice_number || params.invoiceNumber,
          idempotent: data.idempotent === true
        };
      } catch (err: any) {
        console.error("[RPC process_sale_atomic] Erro inesperado:", err.message);
        return { success: false, error: err.message || "Erro inesperado ao contactar o PostgreSQL." };
      }
    };

    const promise = executeSale();
    if (idempotencyKey) {
      inFlightSaleRequests.set(idempotencyKey, promise);
    }

    try {
      return await promise;
    } finally {
      if (idempotencyKey) {
        inFlightSaleRequests.delete(idempotencyKey);
      }
    }
  },

  async settleDebtPaymentAtomic(params: {
    debtId: string;
    customerId: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
    userName?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; error?: string; remainingDebt?: number }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: "Supabase não conectado." };

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const fullPayload: Record<string, any> = {
        p_tenant_id: tenantId,
        p_debt_id: params.debtId,
        p_customer_id: params.customerId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || "Dinheiro",
        p_notes: params.notes || null,
        p_user_name: params.userName || "Operador",
        p_received_by: params.userName || "Operador",
        p_idempotency_key: params.idempotencyKey || null
      };

      let { data, error } = await client.rpc("settle_debt_payment_atomic", fullPayload);

      // Fallback compatível se o banco utilizar a assinatura anterior (6 parâmetros com p_received_by)
      if (error && error.message && error.message.includes("schema cache")) {
        const legacyPayload = {
          p_tenant_id: tenantId,
          p_debt_id: params.debtId,
          p_customer_id: params.customerId,
          p_amount: params.amount,
          p_payment_method: params.paymentMethod || "Dinheiro",
          p_received_by: params.userName || "Operador"
        };
        const legacyRes = await client.rpc("settle_debt_payment_atomic", legacyPayload);
        data = legacyRes.data;
        error = legacyRes.error;
      }

      if (error) return { success: false, error: error.message };
      return data || { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async recordSaleReturnAtomic(params: {
    saleId?: string;
    originalInvoice: string;
    creditNoteNumber: string;
    customerName?: string;
    customerNuit?: string;
    reason: string;
    returnedItems: any[];
    totalRefund: number;
    refundMethod?: string;
    operatorName?: string;
  }): Promise<{ success: boolean; error?: string; creditNoteNumber?: string; totalRefund?: number }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: "Supabase não conectado." };

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const payload: Record<string, any> = {
        p_tenant_id: tenantId,
        p_sale_id: params.saleId || null,
        p_original_invoice: params.originalInvoice,
        p_credit_note_number: params.creditNoteNumber,
        p_customer_name: params.customerName || "Consumidor Final",
        p_customer_nuit: params.customerNuit || null,
        p_reason: params.reason,
        p_returned_items: params.returnedItems,
        p_total_refund: params.totalRefund,
        p_refund_method: params.refundMethod || "CASH",
        p_operator_name: params.operatorName || "Operador"
      };

      const { data, error } = await client.rpc("record_sale_return_atomic", payload);
      if (error) return { success: false, error: error.message };
      return data || { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * @deprecated Fluxo oficial de vendas: POS -> saveTransaction -> processSaleAtomic -> process_sale_atomic -> PostgreSQL.
   * Não permite caminhos alternativos que burlem a transação atómica no PostgreSQL.
   */
  async saveTransactionDirect(params: any): Promise<{ success: boolean; error?: string }> {
    return this.processSaleAtomic(params);
  },

  async syncTransactions(transactions: Transaction[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || transactions.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = transactions.map((t) => ({
        id: t.id,
        tenant_id: tenantId,
        idempotency_key: t.idempotencyKey || t.id,
        invoice_number: t.invoiceNumber || t.id,
        customer_name: t.customerName || "Consumidor Final",
        customer_id: t.customerId || null,
        customer_nuit: (t as any).customerNuit || null,
        customer_phone: (t as any).customerPhone || null,
        customer_email: (t as any).customerEmail || null,
        grand_total: t.grandTotal || t.subtotal || 0,
        subtotal: t.subtotal || t.grandTotal || 0,
        vat_total: t.vatTotal || 0,
        discount_total: t.discountTotal || 0,
        payment_method: t.paymentMethod,
        payment_status: (t as any).paymentStatus || "PAID",
        operator_name: t.cashierName || "",
        cashier_name: t.cashierName || "",
        seller_name: t.cashierName || "",
        branch_id: (t as any).branchId || null,
        amount_paid: (t as any).amountPaid ?? (t.grandTotal || 0),
        change_amount: (t as any).changeAmount ?? 0,
        total_amount: t.grandTotal || t.subtotal || 0,
        tax_amount: t.vatTotal || 0,
        fiscal_hash: (t as any).fiscalHash || null,
        fiscal_keys: (t as any).fiscalKeys || null,
        fiscal_certified: (t as any).fiscalCertified ?? false,
        status: (t as any).status || "COMPLETED",
        items: t.items || [],
        notes: (t as any).notes || null,
        created_at: t.timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        timestamp: t.timestamp || new Date().toISOString()
      }));

      let { error } = await client.from("vendas").upsert(records, { onConflict: "id" });
      if (error && (error.code === "PGRST205" || error.message?.includes("in the schema cache"))) {
        const salesRecords = transactions.map((t) => ({
          id: t.id,
          tenant_id: tenantId,
          invoice_number: t.invoiceNumber || t.id,
          customer_name: t.customerName || "Consumidor Final",
          customer_id: t.customerId || null,
          grand_total: t.grandTotal || t.subtotal || 0,
          subtotal: t.subtotal || t.grandTotal || 0,
          vat_total: t.vatTotal || 0,
          discount_total: t.discountTotal || 0,
          payment_method: t.paymentMethod,
          seller_name: t.cashierName || "",
          items_json: JSON.stringify(t.items || []),
          created_at: t.timestamp || new Date().toISOString()
        }));
        const salesRes = await client.from("sales").upsert(salesRecords, { onConflict: "id" });
        error = salesRes.error;
      }
      return !error;
    } catch {
      return false;
    }
  },

  // --- FLUXO DE CAIXA ---
  async fetchCashFlow(): Promise<CashFlowEntry[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("caixa")
        .select("*")
        .order("timestamp", { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        type: row.type || "INPUT",
        amount: Number(row.amount || 0),
        reason: row.reason || "",
        responsibleUser: row.responsible_user || "",
        timestamp: row.timestamp || new Date().toISOString()
      }));
    } catch {
      return [];
    }
  },

  async saveCashFlowEntry(entry: CashFlowEntry): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: entry.id,
        tenant_id: tenantId,
        type: entry.type,
        amount: entry.amount,
        reason: entry.reason || "",
        responsible_user: entry.responsibleUser || "",
        timestamp: entry.timestamp || new Date().toISOString()
      };

      const { error } = await client.from("caixa").upsert(record, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  async syncCashFlow(movements: CashFlowEntry[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || movements.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = movements.map((m) => ({
        id: m.id,
        tenant_id: tenantId,
        type: m.type,
        amount: m.amount,
        reason: m.reason || "",
        responsible_user: m.responsibleUser || "",
        timestamp: m.timestamp || new Date().toISOString()
      }));

      const { error } = await client.from("caixa").upsert(records, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- FECHAMENTOS DE CAIXA / BALANCETES ---
  async fetchCashClosures(): Promise<CashClosure[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("cash_closures")
        .select("*")
        .order("closed_at", { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        shiftId: row.shift_id || row.id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openedBy: row.opened_by,
        closedBy: row.closed_by,
        openingSupervisor: row.opening_supervisor || "",
        closingSupervisor: row.closing_supervisor || "",
        openingBalance: Number(row.opening_balance || 0),
        theoreticalBalance: Number(row.theoretical_balance || 0),
        physicalBalance: Number(row.physical_balance || 0),
        difference: Number(row.difference || 0),
        differenceType: row.difference_type || (Number(row.difference || 0) === 0 ? "EXACT" : Number(row.difference || 0) > 0 ? "SURPLUS" : "SHORTAGE"),
        reconciliation: typeof row.reconciliation === "object" && row.reconciliation !== null ? row.reconciliation : {},
        denominations: typeof row.denominations === "object" && row.denominations !== null ? row.denominations : {},
        closingNotes: row.closing_notes || ""
      })) as CashClosure[];
    } catch {
      return [];
    }
  },

  async saveCashClosure(closure: CashClosure): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: closure.id,
        tenant_id: tenantId,
        shift_id: closure.shiftId || closure.id,
        opened_at: closure.openedAt,
        closed_at: closure.closedAt,
        opened_by: closure.openedBy,
        closed_by: closure.closedBy,
        opening_supervisor: closure.openingSupervisor || "",
        closing_supervisor: closure.closingSupervisor || "",
        opening_balance: closure.openingBalance,
        theoretical_balance: closure.theoreticalBalance,
        physical_balance: closure.physicalBalance,
        difference: closure.difference,
        difference_type: closure.differenceType || "EXACT",
        reconciliation: closure.reconciliation || {},
        denominations: closure.denominations || {},
        closing_notes: closure.closingNotes || "",
        created_at: new Date().toISOString()
      };

      const { error } = await client.from("cash_closures").upsert(record, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  async syncCashClosures(closures: CashClosure[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || closures.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = closures.map((c) => ({
        id: c.id,
        tenant_id: tenantId,
        shift_id: c.shiftId || c.id,
        opened_at: c.openedAt,
        closed_at: c.closedAt,
        opened_by: c.openedBy,
        closed_by: c.closedBy,
        opening_supervisor: c.openingSupervisor || "",
        closing_supervisor: c.closingSupervisor || "",
        opening_balance: c.openingBalance,
        theoretical_balance: c.theoreticalBalance,
        physical_balance: c.physicalBalance,
        difference: c.difference,
        difference_type: c.differenceType || "EXACT",
        reconciliation: c.reconciliation || {},
        denominations: c.denominations || {},
        closing_notes: c.closingNotes || "",
        created_at: new Date().toISOString()
      }));

      const { error } = await client.from("cash_closures").upsert(records, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- ESTADO DO TURNO ATIVO ---
  async fetchActiveCashShift(): Promise<{
    status: "OPEN" | "CLOSED";
    openingBalance: number;
    openedAt: string;
    openedBy: string;
    openingSupervisor?: string;
    openingNotes?: string;
  } | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from("cash_shifts")
        .select("*")
        .eq("id", "current_shift")
        .single();

      if (error || !data) return null;

      return {
        status: data.status === "CLOSED" ? "CLOSED" : "OPEN",
        openingBalance: Number(data.opening_balance || 0),
        openedAt: data.opened_at || new Date().toISOString(),
        openedBy: data.opened_by || "Admin",
        openingSupervisor: data.opening_supervisor || "",
        openingNotes: data.opening_notes || ""
      };
    } catch {
      return null;
    }
  },

  async saveActiveCashShift(shiftData: {
    status: "OPEN" | "CLOSED";
    openingBalance: number;
    openedAt: string;
    openedBy: string;
    openingSupervisor?: string;
    openingNotes?: string;
  }): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: "current_shift",
        tenant_id: tenantId,
        status: shiftData.status,
        opening_balance: shiftData.openingBalance,
        opened_at: shiftData.openedAt,
        opened_by: shiftData.openedBy,
        opening_supervisor: shiftData.openingSupervisor || "",
        opening_notes: shiftData.openingNotes || "",
        updated_at: new Date().toISOString()
      };

      const { error } = await client.from("cash_shifts").upsert(record, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- COLABORADORES / STAFF ---
  async fetchEmployees(): Promise<Employee[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("colaboradores")
        .select("*")
        .order("name", { ascending: true });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email || "",
        contact: row.contact || "",
        whatsapp: row.whatsapp || "",
        role: row.role || "Operador",
        salary: Number(row.salary || 0),
        admissionDate: row.admission_date || new Date().toISOString().split("T")[0],
        status: row.status || "ACTIVE",
        pin: row.pin || "",
        pinCreatedAt: row.pin_created_at || "",
        pinChanged: row.pin_changed ?? true,
        fotoPerfil: row.foto_perfil || "",
        subscriptionPlan: row.subscription_plan || "OURO",
        branch: row.branch || "Sede Principal"
      }));
    } catch {
      return [];
    }
  },

  async saveEmployee(employee: Employee): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: employee.id,
        tenant_id: tenantId,
        name: employee.name,
        email: employee.email || "",
        contact: employee.contact || "",
        whatsapp: (employee as any).whatsapp || "",
        role: employee.role || "Operador",
        salary: employee.salary || 0,
        admission_date: employee.admissionDate || new Date().toISOString().split("T")[0],
        status: employee.status || "ACTIVE",
        pin: employee.pin || "",
        pin_created_at: (employee as any).pinCreatedAt || new Date().toISOString(),
        pin_changed: (employee as any).pinChanged ?? true,
        foto_perfil: (employee as any).fotoPerfil || "",
        subscription_plan: (employee as any).subscriptionPlan || "OURO",
        branch: (employee as any).branch || "Sede Principal",
        updated_at: new Date().toISOString()
      };

      const { error } = await client.from("colaboradores").upsert(record, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  async syncEmployees(employees: Employee[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || employees.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = employees.map((emp) => ({
        id: emp.id,
        tenant_id: tenantId,
        name: emp.name,
        email: emp.email || "",
        contact: emp.contact || "",
        whatsapp: (emp as any).whatsapp || "",
        role: emp.role || "Operador",
        salary: emp.salary || 0,
        admission_date: emp.admissionDate || new Date().toISOString().split("T")[0],
        status: emp.status || "ACTIVE",
        pin: emp.pin || "",
        pin_created_at: (emp as any).pinCreatedAt || new Date().toISOString(),
        pin_changed: (emp as any).pinChanged ?? true,
        foto_perfil: (emp as any).fotoPerfil || "",
        subscription_plan: (emp as any).subscriptionPlan || "OURO",
        branch: (emp as any).branch || "Sede Principal",
        updated_at: new Date().toISOString()
      }));

      const { error } = await client.from("colaboradores").upsert(records, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- PEDIDOS DE RECUPERAÇÃO DE ACESSO ---
  async getRecoveryRequests(): Promise<any[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("recovery_requests")
        .select("*")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (error || !data) return [];
      return data.map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        email: r.email,
        status: r.status,
        timestamp: r.created_at
      }));
    } catch {
      return [];
    }
  },

  async createRecoveryRequest(empId: string, empName: string, email?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const { error } = await client.from("recovery_requests").insert({
        tenant_id: tenantId,
        employee_id: empId,
        employee_name: empName,
        email: email || "",
        status: "PENDING",
        created_at: new Date().toISOString()
      });
      return !error;
    } catch {
      return false;
    }
  },

  async resolveRecoveryRequest(requestId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from("recovery_requests")
        .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
        .eq("id", requestId);
      return !error;
    } catch {
      return false;
    }
  },

  // --- AUDIT LOGS ---
  async fetchAuditLogs(): Promise<AuditLog[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("audit_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(300);

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        user: row.user_name || "Sistema",
        userRole: (row.user_role as UserRole) || "ADMIN",
        userId: row.user_id || undefined,
        action: row.action,
        module: row.module,
        details: row.details || "",
        ip: row.ip_address || undefined,
        device: row.device || undefined,
        timestamp: row.timestamp || new Date().toISOString()
      })) as AuditLog[];
    } catch {
      return [];
    }
  },

  async saveAuditLog(log: AuditLog): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: log.id || generateEntityId("log"),
        tenant_id: tenantId,
        user_id: (log as any).userId || (log as any).user || null,
        user_name: log.user || "Sistema",
        user_role: log.userRole || "ADMIN",
        action: log.action,
        module: log.module,
        details: log.details || "",
        ip_address: log.ip || null,
        device: log.device || null,
        timestamp: log.timestamp || new Date().toISOString()
      };

      const { error } = await client.from("audit_logs").insert(record);
      return !error;
    } catch {
      return false;
    }
  },

  async syncAuditLogs(logs: AuditLog[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || logs.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = logs.map((l) => ({
        id: l.id,
        tenant_id: tenantId,
        user_id: (l as any).userId || (l as any).user || null,
        user_name: l.user || "Sistema",
        user_role: l.userRole || "ADMIN",
        action: l.action,
        module: l.module,
        details: l.details || "",
        ip_address: l.ip || null,
        device: l.device || null,
        timestamp: l.timestamp || new Date().toISOString()
      }));

      const { error } = await client.from("audit_logs").upsert(records, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- DEFINIÇÕES DO SISTEMA E EMPRESA (SETTINGS & COMPANY SETTINGS) ---
  async fetchSettings(userEmail?: string): Promise<SystemSettings | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      // 1. Tenta carregar dados isolados da tabela dedicada company_settings para o email do utilizador
      const cleanEmail = (userEmail || "").trim().toLowerCase();
      if (cleanEmail) {
        try {
          const { data: csData } = await client
            .from("company_settings")
            .select("*")
            .ilike("user_email", cleanEmail)
            .maybeSingle();

          if (csData) {
            return {
              companyName: csData.company_name,
              slogan: csData.slogan || "",
              companyAddress: csData.address,
              storeAddress: csData.address,
              companyNuit: csData.tax_id || csData.company_nuit || "",
              nuit: csData.tax_id || csData.company_nuit || "",
              companyPhone: csData.phone,
              storeContact: csData.phone,
              companyEmail: csData.email,
              storeEmail: csData.email,
              email: csData.email,
              receiptFooterMessage: csData.receipt_footer_message || csData.slogan || "",
              enableVat: csData.enable_vat ?? true,
              vatPercentage: Number(csData.vat_percentage || 16),
              vatDefaultRate: Number(csData.vat_percentage || 16),
              defaultVat: Number(csData.vat_percentage || 16),
              currency: csData.currency || "MT",
              lowStockThreshold: 5,
              smsStockThreshold: 5,
              defaultPrinter: "thermal_80mm",
              printerName: "thermal_80mm",
              paperSize: csData.paper_size || "80MM",
              printerAutoCut: csData.printer_auto_cut ?? true,
              cloudBackupEnabled: true,
              backupFrequency: "daily",
              backupTime: "18:00",
              logoUrl: csData.logo_url || "",
              theme: csData.theme || "laranja",
              autoBackup: true,
              smsGateway: "",
              userEmail: cleanEmail,
              ...(csData.val_json || {})
            } as SystemSettings;
          }

          // Fallback: consulta a tabela company_profiles
          const { data: cpData } = await client
            .from("company_profiles")
            .select("*")
            .ilike("email", cleanEmail)
            .maybeSingle();

          if (cpData) {
            return {
              companyName: cpData.company_name,
              companyNuit: cpData.nuit || "",
              nuit: cpData.nuit || "",
              storeAddress: cpData.address || "",
              companyAddress: cpData.address || "",
              logoUrl: cpData.logo_url || "",
              userEmail: cleanEmail,
              storeEmail: cleanEmail,
              email: cleanEmail,
              currency: "MT",
              defaultVat: 16,
              vatDefaultRate: 16,
              paperSize: "80MM",
              printerAutoCut: true,
              theme: "laranja",
              cloudBackupEnabled: true,
              backupFrequency: "daily",
              autoBackup: true,
              smsGateway: "",
              smtpServer: ""
            } as unknown as SystemSettings;
          }
        } catch (csFetchErr) {
          console.warn("[SupabaseSyncService.fetchSettings] Aviso ao buscar company_settings/company_profiles:", csFetchErr);
        }
      }

      // 2. Fallback para tabela settings legacy por tenant/config global
      const { data, error } = await client
        .from("settings")
        .select("*")
        .eq("id", "config")
        .single();

      if (error || !data) return null;

      return {
        companyName: data.company_name,
        companyAddress: data.company_address,
        companyNuit: data.company_nuit,
        companyPhone: data.company_phone,
        companyEmail: data.company_email,
        receiptFooterMessage: data.receipt_footer_message,
        enableVat: data.enable_vat ?? true,
        vatPercentage: Number(data.vat_percentage || 16),
        vatDefaultRate: Number(data.vat_percentage || 16),
        defaultVat: Number(data.vat_percentage || 16),
        currency: data.currency || "MT",
        lowStockThreshold: Number(data.low_stock_threshold || 5),
        smsStockThreshold: Number(data.low_stock_threshold || 5),
        defaultPrinter: data.default_printer || "thermal_80mm",
        printerName: data.default_printer || "thermal_80mm",
        cloudBackupEnabled: data.cloud_backup_enabled ?? true,
        backupFrequency: data.backup_frequency || "daily",
        backupTime: data.backup_time || "18:00",
        logoUrl: data.logo_url || "",
        theme: data.theme || "laranja",
        autoBackup: data.cloud_backup_enabled ?? true,
        smsGateway: "",
        smtpServer: data.smtp_server || "",
        smtpHost: data.smtp_host || (data.val_json?.smtpHost) || "",
        smtpPort: Number(data.smtp_port || data.val_json?.smtpPort || 587),
        smtpUser: data.smtp_user || (data.val_json?.smtpUser) || "",
        smtpPassword: data.smtp_password || (data.val_json?.smtpPassword) || "",
        smtpSecure: data.smtp_secure ?? (data.val_json?.smtpSecure ?? false),
        smtpEnabled: data.smtp_enabled ?? (data.val_json?.smtpEnabled ?? true),
        smtpSenderName: data.smtp_sender_name || (data.val_json?.smtpSenderName) || "",
        smtpFromEmail: data.smtp_from_email || (data.val_json?.smtpFromEmail) || "",
        reportRecipientEmail: data.report_recipient_email || (data.val_json?.reportRecipientEmail) || "",
        reportHour: data.report_hour || "18:00",
        reportFrequency: data.report_frequency || "daily",
        ...(data.val_json || {})
      } as SystemSettings;
    } catch {
      return null;
    }
  },

  async saveSettings(settings: SystemSettings, userEmail?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const cleanEmail = (userEmail || settings.email || settings.storeEmail || "").trim().toLowerCase();

      // 1. Grava na tabela dedicada company_settings com isolamento por email
      if (cleanEmail) {
        try {
          await client.from("company_settings").upsert({
            user_email: cleanEmail,
            company_name: settings.companyName,
            slogan: settings.slogan || "",
            tax_id: settings.companyNuit || settings.nuit || "",
            company_nuit: settings.companyNuit || settings.nuit || "",
            phone: (settings as any).companyPhone || settings.storeContact || "",
            email: settings.storeEmail || settings.email || "",
            address: settings.companyAddress || settings.storeAddress || "",
            currency: settings.currency || "MT",
            vat_percentage: settings.defaultVat ?? settings.vatDefaultRate ?? 16,
            default_vat: settings.defaultVat ?? settings.vatDefaultRate ?? 16,
            enable_vat: (settings as any).enableVat ?? true,
            receipt_footer_message: (settings as any).receiptFooterMessage || settings.slogan || "",
            paper_size: settings.paperSize || "80MM",
            printer_auto_cut: settings.printerAutoCut ?? true,
            logo_url: settings.logoUrl || "",
            theme: settings.theme || "laranja",
            val_json: settings,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_email" });

          // Sincroniza também a tabela company_profiles com email como chave única de isolamento
          try {
            await client.from("company_profiles").upsert({
              email: cleanEmail,
              company_name: settings.companyName || "OST Comércio Geral, Lda",
              nuit: settings.companyNuit || settings.nuit || "",
              address: settings.companyAddress || settings.storeAddress || "",
              logo_url: settings.logoUrl || "",
              updated_at: new Date().toISOString()
            }, { onConflict: "email" });
          } catch (cpErr) {
            console.warn("[SupabaseSyncService.saveSettings] Aviso em company_profiles:", cpErr);
          }

          // Sincroniza também a tabela companies com owner_email
          const companyId = "comp_" + cleanEmail.replace(/[^a-z0-9]/g, "").slice(0, 16);
          await client.from("companies").upsert({
            id: companyId,
            name: settings.companyName || "OST Comércio Geral, Lda",
            owner_uid: "auth_user",
            owner_email: cleanEmail,
            tax_id: settings.companyNuit || settings.nuit || "",
            email: settings.email || settings.storeEmail || "",
            phone: (settings as any).companyPhone || settings.storeContact || "",
            address: settings.companyAddress || settings.storeAddress || "",
            currency: settings.currency || "MT",
            logo_url: settings.logoUrl || "",
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });
        } catch (csErr) {
          console.warn("[SupabaseSyncService.saveSettings] Aviso ao gravar em company_settings:", csErr);
        }
      }

      // 2. Grava também no registro global settings para retrocompatibilidade
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: "config",
        tenant_id: tenantId,
        company_name: settings.companyName,
        company_address: settings.companyAddress || settings.storeAddress || "",
        company_nuit: settings.companyNuit || settings.nuit || "",
        company_phone: (settings as any).companyPhone || settings.storeContact || "",
        company_email: settings.email || settings.storeEmail || (settings as any).companyEmail || "",
        receipt_footer_message: (settings as any).receiptFooterMessage || settings.slogan || "",
        enable_vat: (settings as any).enableVat ?? true,
        vat_percentage: settings.defaultVat ?? settings.vatDefaultRate ?? 16,
        currency: settings.currency || "MT",
        low_stock_threshold: settings.smsStockThreshold ?? (settings as any).lowStockThreshold ?? 5,
        default_printer: settings.printerName || (settings as any).defaultPrinter || "thermal_80mm",
        cloud_backup_enabled: settings.cloudBackupEnabled ?? true,
        backup_frequency: settings.backupFrequency || "daily",
        backup_time: settings.backupTime || "18:00",
        logo_url: settings.logoUrl || "",
        theme: settings.theme || "laranja",
        smtp_host: settings.smtpHost || "",
        smtp_port: settings.smtpPort || 587,
        smtp_user: settings.smtpUser || "",
        smtp_password: settings.smtpPassword || "",
        smtp_secure: settings.smtpSecure ?? false,
        smtp_enabled: settings.smtpEnabled ?? true,
        smtp_sender_name: (settings as any).smtpSenderName || "",
        smtp_from_email: (settings as any).smtpFromEmail || "",
        val_json: settings,
        updated_at: new Date().toISOString()
      };

      const { error } = await client.from("settings").upsert(record, { onConflict: "id" });
      if (error) {
        console.warn("[SupabaseSyncService.saveSettings] Aviso do Supabase ao salvar 'settings':", error.message);
      }

      return !error;
    } catch (err: any) {
      console.warn("[SupabaseSyncService.saveSettings] Exceção ao salvar definições:", err?.message);
      return false;
    }
  },

  // --- PERFIL DE EMPRESA ISOLADO POR EMAIL (company_profiles) ---
  async fetchCompanyProfile(email: string): Promise<CompanyProfile | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return null;

    try {
      const { data, error } = await client
        .from("company_profiles")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (error) {
        console.warn("[SupabaseSyncService.fetchCompanyProfile] Aviso na consulta:", error.message);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        email: data.email,
        company_name: data.company_name,
        nuit: data.nuit || "",
        address: data.address || "",
        logo_url: data.logo_url || "",
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (e: any) {
      console.warn("[SupabaseSyncService.fetchCompanyProfile] Erro ao buscar company_profiles:", e?.message);
      return null;
    }
  },

  async saveCompanyProfile(profile: Partial<CompanyProfile>, email: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    const cleanEmail = (email || profile.email || "").trim().toLowerCase();
    if (!cleanEmail) return false;

    try {
      const record = {
        email: cleanEmail,
        company_name: profile.company_name?.trim() || "Minha Empresa, Lda",
        nuit: profile.nuit?.trim() || "",
        address: profile.address?.trim() || "",
        logo_url: profile.logo_url || "",
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from("company_profiles")
        .upsert(record, { onConflict: "email" });

      if (error) {
        console.warn("[SupabaseSyncService.saveCompanyProfile] Aviso do Supabase:", error.message);
        return false;
      }
      return true;
    } catch (e: any) {
      console.warn("[SupabaseSyncService.saveCompanyProfile] Exceção ao gravar company_profiles:", e?.message);
      return false;
    }
  },

  // --- ORDENS DE COMPRA / REPOSIÇÃO A FORNECEDORES ---
  async fetchSupplierOrders(): Promise<SupplierOrder[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("supplier_orders")
        .select("*")
        .order("request_date", { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        productId: row.product_id,
        productName: row.product_name,
        quantityRequested: Number(row.quantity_requested || 0),
        unitCost: Number(row.unit_cost || 0),
        totalValue: Number(row.total_value || 0),
        status: (row.status || "Pendente") as "Pendente" | "Recebido" | "Cancelado",
        receiptStatus: (row.receipt_status || (row.status === "Recebido" ? "Entregue" : "Aguardando Envio")) as any,
        paymentStatus: (row.payment_status || "Pendente") as "Pago" | "Crédito" | "Pendente",
        paymentDueDate: row.payment_due_date,
        requestDate: row.request_date ? String(row.request_date).split("T")[0] : new Date().toISOString().split("T")[0],
        receivedDate: row.received_date ? String(row.received_date).split("T")[0] : undefined,
        receivedQuantity: row.received_quantity ? Number(row.received_quantity) : undefined,
        deliveryConfirmedDate: row.delivery_confirmed_date,
        deliveryConfirmedBy: row.delivery_confirmed_by,
        deliveryNotes: row.delivery_notes,
        isReplenishmentOrder: row.is_replenishment_order ?? false
      }));
    } catch {
      return [];
    }
  },

  async saveSupplierOrder(order: SupplierOrder): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const record = {
        id: order.id,
        tenant_id: tenantId,
        supplier_id: order.supplierId,
        supplier_name: order.supplierName,
        product_id: order.productId,
        product_name: order.productName,
        quantity_requested: order.quantityRequested,
        unit_cost: order.unitCost,
        total_value: order.totalValue,
        status: order.status,
        payment_status: order.paymentStatus,
        request_date: order.requestDate || new Date().toISOString(),
        received_date: order.receivedDate ? new Date(order.receivedDate).toISOString() : null
      };

      const { error } = await client.from("supplier_orders").upsert(record, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  async saveSupplierOrders(orders: SupplierOrder[]): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || orders.length === 0) return false;

    try {
      const tenantId = getSupabaseConfig().tenantId;
      const records = orders.map(order => ({
        id: order.id,
        tenant_id: tenantId,
        supplier_id: order.supplierId,
        supplier_name: order.supplierName,
        product_id: order.productId,
        product_name: order.productName,
        quantity_requested: order.quantityRequested,
        unit_cost: order.unitCost,
        total_value: order.totalValue,
        status: order.status,
        payment_status: order.paymentStatus,
        request_date: order.requestDate || new Date().toISOString(),
        received_date: order.receivedDate ? new Date(order.receivedDate).toISOString() : null
      }));

      const { error } = await client.from("supplier_orders").upsert(records, { onConflict: "id" });
      return !error;
    } catch {
      return false;
    }
  },

  // --- SUPABASE STORAGE (BACKUPS & ARQUIVOS) ---
  async uploadBackupToStorage(fileName: string, jsonString: string): Promise<string | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const bucketName = "ostvendas-backups";
      const blob = new Blob([jsonString], { type: "application/json" });
      const filePath = `backups/${fileName}`;

      const { error } = await client.storage
        .from(bucketName)
        .upload(filePath, blob, {
          contentType: "application/json",
          upsert: true
        });

      if (error) {
        console.warn("Falha no upload para o Supabase Storage:", error.message);
        return null;
      }

      const { data: publicUrlData } = client.storage.from(bucketName).getPublicUrl(filePath);
      return publicUrlData.publicUrl || filePath;
    } catch (err) {
      console.warn("Erro ao fazer upload de backup no Storage:", err);
      return null;
    }
  },

  async listBackupsFromStorage(): Promise<CloudBackupItem[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const bucketName = "ostvendas-backups";
      const { data, error } = await client.storage.from(bucketName).list("backups");
      if (error || !data) return [];

      return data.map((item) => {
        const { data: publicUrlData } = client.storage.from(bucketName).getPublicUrl(`backups/${item.name}`);
        return {
          name: item.name,
          filename: item.name,
          fullPath: `backups/${item.name}`,
          size: item.metadata?.size || 0,
          updated: item.updated_at || item.created_at || new Date().toISOString(),
          downloadUrl: publicUrlData.publicUrl
        };
      });
    } catch {
      return [];
    }
  },

  async deleteBackupFromStorage(fileName: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const bucketName = "ostvendas-backups";
      const { error } = await client.storage.from(bucketName).remove([`backups/${fileName}`]);
      return !error;
    } catch {
      return false;
    }
  },

  // --- REALTIME CHANNEL SUBSCRIPTIONS ---
  subscribeToTableChanges(table: string, onUpdate: (payload: any) => void): { unsubscribe: () => void } {
    const client = getSupabaseClient();
    if (!client) return { unsubscribe: () => {} };

    try {
      const channel = client
        .channel(`public:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload) => {
            onUpdate(payload);
          }
        )
        .subscribe();

      return {
        unsubscribe: () => {
          client.removeChannel(channel);
        }
      };
    } catch {
      return { unsubscribe: () => {} };
    }
  },

  // --- SINCRONIZAÇÃO COMPLETA (ALL DATA) ---
  async syncAll(data: {
    products: Product[];
    customers: Customer[];
    transactions: Transaction[];
    cashFlow: CashFlowEntry[];
    cashClosures?: CashClosure[];
    employees?: Employee[];
    auditLogs?: AuditLog[];
    settings?: SystemSettings;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, count: 0, error: "Supabase não está configurado ou ativo." };
    }

    let synced = 0;
    try {
      if (data.products && data.products.length > 0) {
        const ok = await this.syncProducts(data.products);
        if (ok) synced += data.products.length;
      }
      if (data.customers && data.customers.length > 0) {
        const ok = await this.syncCustomers(data.customers);
        if (ok) synced += data.customers.length;
      }
      if (data.transactions && data.transactions.length > 0) {
        const ok = await this.syncTransactions(data.transactions);
        if (ok) synced += data.transactions.length;
      }
      if (data.cashFlow && data.cashFlow.length > 0) {
        const ok = await this.syncCashFlow(data.cashFlow);
        if (ok) synced += data.cashFlow.length;
      }
      if (data.cashClosures && data.cashClosures.length > 0) {
        const ok = await this.syncCashClosures(data.cashClosures);
        if (ok) synced += data.cashClosures.length;
      }
      if (data.employees && data.employees.length > 0) {
        const ok = await this.syncEmployees(data.employees);
        if (ok) synced += data.employees.length;
      }
      if (data.auditLogs && data.auditLogs.length > 0) {
        const ok = await this.syncAuditLogs(data.auditLogs);
        if (ok) synced += data.auditLogs.length;
      }
      if (data.settings) {
        await this.saveSettings(data.settings);
        synced += 1;
      }

      return { success: true, count: synced };
    } catch (err: any) {
      return { success: false, count: synced, error: err.message };
    }
  }
};
