/**
 * @file supabase.ts
 * Inicialização Centralizada do Cliente Supabase (@supabase/supabase-js) Singleton.
 * 
 * Utiliza as variáveis de ambiente 'VITE_SUPABASE_URL' e 'VITE_SUPABASE_ANON_KEY'
 * para autenticação e conexão com o banco de dados PostgreSQL relacional.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Resolução segura de variáveis de ambiente sem secrets ou fallbacks hardcoded
const env = (import.meta as any).env || {};
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || "";

/**
 * Retorna o URI de redirecionamento dinâmico e exato para a aplicação cliente,
 * alinhado com as configurações do Google Cloud Console e Supabase Auth.
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return env.APP_URL || "http://localhost:3000";
}

/**
 * Retorna o URI de callback OAuth do Supabase correspondente ao projeto.
 * Formato: https://<project-ref>.supabase.co/auth/v1/callback
 */
export function getSupabaseOAuthCallbackUrl(): string {
  if (!SUPABASE_URL) return "";
  try {
    const urlObj = new URL(SUPABASE_URL);
    return `${urlObj.origin}/auth/v1/callback`;
  } catch {
    return `${SUPABASE_URL}/auth/v1/callback`;
  }
}

/**
 * Cliente Singleton do Supabase para uso na aplicação.
 * Inicializa com URL e Chave públicas fornecidas nas variáveis de ambiente.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://unconfigured.supabase.co",
  SUPABASE_ANON_KEY || "unconfigured-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce"
    }
  }
);

/**
 * Retorna a instância singleton do cliente Supabase.
 */
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

/**
 * Inicia o fluxo de autenticação com Google no Supabase com os URIs de redirecionamento corretos.
 */
export async function signInWithGoogleOAuth(customRedirect?: string, options?: { skipBrowserRedirect?: boolean }) {
  const targetRedirect = customRedirect || getAuthRedirectUrl();
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: targetRedirect,
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      },
      skipBrowserRedirect: options?.skipBrowserRedirect ?? false
    }
  });
}

export default supabase;

