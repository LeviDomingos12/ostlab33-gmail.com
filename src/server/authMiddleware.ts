/**
 * @file src/server/authMiddleware.ts
 * Middleware de Autenticação e Autorização Estrita com Supabase Auth no Backend Express.
 * 
 * Funcionalidades:
 * - Validação de tokens JWT do Supabase (@supabase/supabase-js)
 * - Obtenção autoritativa de identidade, tenantId (company_id) e role a partir do banco
 * - Bloqueio de contas suspensas, inativas ou expiradas
 * - Proteção RBAC (ADMIN, SUPERVISOR, CASHIER, etc.)
 */

import { Request, Response, NextFunction } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente público/anon para validação de JWTs de utilizadores (apenas se configurado explicitamente)
export const supabasePublicAuth: SupabaseClient | null = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    )
  : null;

// Cliente com privilégios de serviço SOMENTE se a chave existir explicitamente no ambiente backend (nunca substitui por anon key)
export const supabaseServerAdmin: SupabaseClient | null = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

export interface AuthenticatedUserContext {
  id: string;
  email: string;
  tenantId: string;
  role: "ADMIN" | "SUPERVISOR" | "CASHIER" | "SELLER" | "STOCK_MANAGER";
  name: string;
  companyName: string;
  subscriptionPlan: "BRONZE" | "PRATA" | "OURO" | "ENTERPRISE";
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUserContext;
}

export function normalizeRole(roleStr: string | undefined | null): "ADMIN" | "SUPERVISOR" | "CASHIER" | "SELLER" | "STOCK_MANAGER" | null {
  if (!roleStr || typeof roleStr !== "string") return null;
  const r = roleStr.trim().toUpperCase();
  if (r === "STOCK_MANAGER" || r.includes("ESTOQ") || r.includes("ARMAZ") || r.includes("STOCK")) return "STOCK_MANAGER";
  if (r === "ADMIN" || r.includes("ADMIN") || r.includes("GERENTE_GERAL") || r.includes("PROPRIETARIO")) return "ADMIN";
  if (r === "SUPERVISOR" || r.includes("SUPERV") || r.includes("GERENT") || r.includes("MANAGER")) return "SUPERVISOR";
  if (r === "CASHIER" || r.includes("CAIXA") || r.includes("POS") || r.includes("OPERADOR")) return "CASHIER";
  if (r === "SELLER" || r.includes("VEND") || r.includes("COMERC") || r.includes("SELLER")) return "SELLER";
  return null;
}

export function normalizePlan(planStr: string | undefined | null): "BRONZE" | "PRATA" | "OURO" | "ENTERPRISE" {
  const p = (planStr || "").toUpperCase();
  if (p.includes("ENTERPRISE")) return "ENTERPRISE";
  if (p.includes("OURO") || p.includes("GOLD")) return "OURO";
  if (p.includes("PRATA") || p.includes("SILVER")) return "PRATA";
  return "BRONZE";
}

/**
 * Validação rigorosa contra spoofing de tenant por parte do cliente.
 * NUNCA permite que headers, query parameters, body parameters ou cookies troquem de empresa.
 */
export function validateNoClientTenantSpoofing(req: Request, authoritativeTenantId: string): { spoofed: boolean; attempted?: string; source?: string } {
  const headers = req.headers || {};
  const query = (req.query || {}) as Record<string, any>;
  const body = (req.body || {}) as Record<string, any>;
  const cookies = (req as any).cookies || {};

  const candidates: { source: string; value: any }[] = [
    { source: "header x-tenant-id", value: headers["x-tenant-id"] },
    { source: "header x-company-id", value: headers["x-company-id"] },
    { source: "header x-organization-id", value: headers["x-organization-id"] },
    { source: "header tenant-id", value: headers["tenant-id"] },
    { source: "header company-id", value: headers["company-id"] },
    { source: "header x-tenant", value: headers["x-tenant"] },
    { source: "header x-company", value: headers["x-company"] },
    { source: "query tenant_id", value: query.tenant_id },
    { source: "query tenantId", value: query.tenantId },
    { source: "query company_id", value: query.company_id },
    { source: "query companyId", value: query.companyId },
    { source: "query p_tenant_id", value: query.p_tenant_id },
    { source: "query p_company_id", value: query.p_company_id },
    { source: "query tenant", value: query.tenant },
    { source: "query company", value: query.company },
    { source: "query organization_id", value: query.organization_id },
    { source: "body tenant_id", value: body.tenant_id },
    { source: "body tenantId", value: body.tenantId },
    { source: "body company_id", value: body.company_id },
    { source: "body companyId", value: body.companyId },
    { source: "body p_tenant_id", value: body.p_tenant_id },
    { source: "body p_company_id", value: body.p_company_id },
    { source: "body tenant", value: body.tenant },
    { source: "body company", value: body.company },
    { source: "body organization_id", value: body.organization_id },
    { source: "cookie tenant_id", value: cookies.tenant_id },
    { source: "cookie tenantId", value: cookies.tenantId },
    { source: "cookie company_id", value: cookies.company_id },
    { source: "cookie companyId", value: cookies.companyId }
  ];

  for (const item of candidates) {
    if (typeof item.value === "string" && item.value.trim() !== "") {
      if (item.value.trim() !== authoritativeTenantId) {
        return { spoofed: true, attempted: item.value.trim(), source: item.source };
      }
    }
  }

  return { spoofed: false };
}

/**
 * Middleware para validar o Token JWT e injetar o utilizador autenticado e seu tenant_id
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado: Token de sessão não fornecido."
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Token de autenticação vazio."
      });
    }

    // Suporte para tokens de teste em ambiente de testes automatizados
    if ((process.env.NODE_ENV === "test" || process.env.VITEST) && token.startsWith("test-token-")) {
      const parts = token.replace("test-token-", "").split("-");
      const roleParsed = normalizeRole(parts[0]);
      if (!roleParsed) {
        return res.status(403).json({
          success: false,
          error: "Acesso negado: Perfil de utilizador sem papel (role) autorizado."
        });
      }

      const tenantId = parts[1] && parts[1].trim() !== "" ? `tenant_${parts[1].trim()}` : "";
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: "Acesso negado: Utilizador sem organização/empresa (tenant) válida associada."
        });
      }

      const userId = `user_${parts[0]}_${parts[1] || "default"}`;

      // Proteção Anti-Spoofing: Verificar se o cliente tentou enviar parâmetros/headers/cookies para trocar de empresa
      const spoofCheck = validateNoClientTenantSpoofing(req, tenantId);
      if (spoofCheck.spoofed) {
        return res.status(403).json({
          success: false,
          error: "Violação de segurança: Tenant fornecido pelo cliente não corresponde à identidade autenticada do token."
        });
      }

      // Forçar autoritativamente o tenant no body e query para impedir que qualquer parâmetro downstream troque de empresa
      if (req.body && typeof req.body === "object") {
        req.body.tenant_id = tenantId;
        req.body.tenantId = tenantId;
        req.body.company_id = tenantId;
        req.body.companyId = tenantId;
        req.body.p_tenant_id = tenantId;
        req.body.p_company_id = tenantId;
      }
      if (req.query && typeof req.query === "object") {
        (req.query as any).tenant_id = tenantId;
        (req.query as any).tenantId = tenantId;
        (req.query as any).company_id = tenantId;
        (req.query as any).companyId = tenantId;
      }

      (req as any).user = {
        id: userId,
        email: `${userId}@ostvendas.mz`,
        tenantId,
        role: roleParsed,
        name: `Test ${roleParsed}`,
        companyName: `Test Company ${tenantId}`,
        subscriptionPlan: "OURO"
      } as AuthenticatedUserContext;

      return next();
    }

    // 1. Validar token com o Supabase Auth
    if (!supabasePublicAuth) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado: Sessão inválida ou Supabase não configurado."
      });
    }

    const { data, error } = await supabasePublicAuth.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        error: "Sessão inválida ou expirada. Inicie sessão novamente no sistema."
      });
    }

    const user = data.user;

    // REGRA DE SEGURANÇA CRÍTICA: NUNCA autorizar role ou tenant a partir de user_metadata.
    // Metadados são gravados pelo cliente no signUp e não são autoritativos.
    // Obter estritamente da base de dados (profiles / colaboradores).
    let tenantId = "";
    let roleRaw: string | null = null;
    let fullName = user.email?.split("@")[0] || "Utilizador";
    let companyName = "OST Vendas";
    let planRaw = "OURO";
    let authoritativeFound = false;

    // 2. Consultar base de dados obrigatoriamente para obter tenant_id e role autoritativos
    const activeClient = supabaseServerAdmin || supabasePublicAuth;
    try {
      const { data: profile, error: profileErr } = await activeClient
        .from("profiles")
        .select("company_id, role, full_name, companies(id, name)")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileErr && profile) {
        if (profile.company_id && profile.company_id.trim() !== "") {
          tenantId = profile.company_id.trim();
          authoritativeFound = true;
        }
        if (profile.role) roleRaw = profile.role;
        if (profile.full_name) fullName = profile.full_name;
        if ((profile.companies as any)?.name) companyName = (profile.companies as any).name;
      }

      const { data: colab, error: colabErr } = await activeClient
        .from("colaboradores")
        .select("status, role, subscription_plan, tenant_id, nome")
        .eq("auth_uid", user.id)
        .maybeSingle();

      if (!colabErr && colab) {
        if (colab.status === "BLOCKED" || colab.status === "INACTIVE" || colab.status === "SUSPENDED") {
          return res.status(403).json({
            success: false,
            error: "Esta conta está bloqueada, suspensa ou inativa. Contacte a administração."
          });
        }
        if (colab.tenant_id && colab.tenant_id.trim() !== "") {
          tenantId = colab.tenant_id.trim();
          authoritativeFound = true;
        }
        if (colab.role) roleRaw = colab.role;
        if (colab.subscription_plan) planRaw = colab.subscription_plan;
        if (colab.nome) fullName = colab.nome;
      }
    } catch (dbErr) {
      console.error("[Auth Middleware] Falha na validação autoritativa do utilizador:", dbErr);
      return res.status(500).json({
        success: false,
        error: "Erro de integridade: Falha ao validar dados autoritativos do utilizador no servidor."
      });
    }

    // Se o utilizador não possuir registro autoritativo ou tenant válido no banco, rejeitar a operação
    if (!authoritativeFound || !tenantId || tenantId.trim() === "") {
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Perfil ou empresa (tenant) autoritativo não encontrado na base de dados. Metadados do utilizador não são aceites para autorização."
      });
    }

    // Validar role de forma estrita (sem fallback para ADMIN ou CASHIER)
    const verifiedRole = normalizeRole(roleRaw);
    if (!verifiedRole) {
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Perfil de utilizador sem papel (role) autorizado na base de dados."
      });
    }

    // 3. Validação de JWT e Prevenção de Spoofing de Tenant:
    // NUNCA permitir que metadados ou claims no JWT do cliente troquem a empresa
    const jwtMetadataTenant = (
      user.user_metadata?.company_id ||
      user.user_metadata?.tenant_id ||
      user.app_metadata?.company_id ||
      user.app_metadata?.tenant_id ||
      ""
    ).toString().trim();

    if (jwtMetadataTenant && jwtMetadataTenant !== tenantId) {
      return res.status(403).json({
        success: false,
        error: "Violação de segurança: Claim/metadado de empresa no JWT não corresponde à organização autoritativa na base de dados."
      });
    }

    // Proteção Anti-Spoofing: Verificar se o cliente tentou enviar parâmetros/headers/cookies para trocar de empresa
    const spoofCheck = validateNoClientTenantSpoofing(req, tenantId);
    if (spoofCheck.spoofed) {
      return res.status(403).json({
        success: false,
        error: "Violação de segurança: Tenant fornecido pelo cliente não corresponde à identidade autenticada do token."
      });
    }

    // Forçar autoritativamente o tenant no body e query para impedir que qualquer parâmetro downstream troque de empresa
    if (req.body && typeof req.body === "object") {
      req.body.tenant_id = tenantId;
      req.body.tenantId = tenantId;
      req.body.company_id = tenantId;
      req.body.companyId = tenantId;
      req.body.p_tenant_id = tenantId;
      req.body.p_company_id = tenantId;
    }
    if (req.query && typeof req.query === "object") {
      (req.query as any).tenant_id = tenantId;
      (req.query as any).tenantId = tenantId;
      (req.query as any).company_id = tenantId;
      (req.query as any).companyId = tenantId;
    }

    // Injetar contexto fidedigno e imutável no request derivado do token verificado
    (req as any).user = {
      id: user.id,
      email: user.email || "",
      tenantId,
      role: verifiedRole,
      name: fullName,
      companyName,
      subscriptionPlan: normalizePlan(planRaw)
    } as AuthenticatedUserContext;

    next();
  } catch (err: any) {
    console.error("[Auth Middleware] Erro na autenticação:", err);
    return res.status(401).json({
      success: false,
      error: "Falha na validação de segurança da requisição."
    });
  }
}

/**
 * Middleware para exigir perfil de Administrador
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUserContext;
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Permissão negada: Apenas administradores têm acesso a esta funcionalidade. Esta operação requer privilégios de Administrador do Sistema."
    });
  }
  next();
}

/**
 * Middleware para exigir perfil de Supervisor ou Administrador
 */
export function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUserContext;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPERVISOR")) {
    return res.status(403).json({
      success: false,
      error: "Permissão negada: Esta operação requer privilégios de Supervisor ou Administrador."
    });
  }
  next();
}

/**
 * Middleware para exigir perfil de Gestor de Stock, Supervisor ou Administrador
 */
export function requireStockOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUserContext;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPERVISOR" && user.role !== "STOCK_MANAGER")) {
    return res.status(403).json({
      success: false,
      error: "Permissão negada: Esta operação requer privilégios de Gestão de Stock ou Administração."
    });
  }
  next();
}

/**
 * Middleware para exigir perfil com permissão de Caixa/Vendas
 */
export function requireCashierOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUserContext;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Acesso não autorizado: Sessão não identificada."
    });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERVISOR" && user.role !== "CASHIER" && user.role !== "SELLER") {
    return res.status(403).json({
      success: false,
      error: "Permissão negada: Esta operação requer privilégios de Operador de Caixa, Vendedor ou Administração."
    });
  }
  next();
}

