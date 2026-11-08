/**
 * @file src/lib/apiClient.ts
 * Cliente HTTP Seguro com Injeção Automática de Token JWT do Supabase Auth.
 * 
 * Garante que todas as chamadas à API do backend (/api/*) incluem
 * a identidade autenticada do utilizador e previnem escalada de privilégios.
 */

import { supabase } from "./supabase";

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Executa uma requisição HTTP incluindo automaticamente o cabeçalho Authorization com o Bearer Token do Supabase.
 */
export async function authenticatedFetch(input: string | URL, init: ApiFetchOptions = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    console.warn("[ApiClient] Não foi possível obter o token de sessão do Supabase:", err);
  }

  // Prevenir caching de respostas de dados sensíveis
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const timeoutMs = init.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      headers,
      signal: init.signal || controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Wrapper conveniente para chamadas JSON autenticadas
 */
export async function apiPost<T = any>(endpoint: string, bodyData: any): Promise<T> {
  const res = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(errBody.message || `Erro HTTP ${res.status}`);
  }

  return res.json();
}

export async function apiGet<T = any>(endpoint: string): Promise<T> {
  const res = await authenticatedFetch(endpoint, {
    method: "GET"
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(errBody.message || `Erro HTTP ${res.status}`);
  }

  return res.json();
}
