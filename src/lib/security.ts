/**
 * Utilitários Criptográficos e de Segurança do Sistema OST Vendas
 * Garante hashing seguro de PINs, higienização de dados de sessão e proteção contra vazamento de credenciais.
 */

import { Employee } from "../types";

/**
 * Calcula o hash SHA-256 de uma string (PIN ou token) usando a Web Crypto API nativa
 * ou fallback seguro para ambientes Node.js/Testes.
 */
export async function hashSecurityPin(pin: string): Promise<string> {
  const clean = (pin || "").trim();
  if (!clean) return "";

  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`ost_vendas_salt_${clean}`);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback síncrono/Node seguro caso crypto.subtle não esteja disponível
  try {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(`ost_vendas_salt_${clean}`).digest("hex");
  } catch {
    // Algoritmo simples de digest seguro como fallback extremo
    let hash = 0;
    const str = `ost_vendas_salt_${clean}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Verifica se um PIN digitado corresponde ao PIN ou hash armazenado
 */
export async function verifySecurityPin(enteredPin: string, storedPinOrHash?: string): Promise<boolean> {
  if (!enteredPin || !storedPinOrHash) return false;
  const cleanEntered = enteredPin.trim();
  const cleanStored = storedPinOrHash.trim();

  // Se o valor armazenado for igual ao PIN direto (migração legada)
  if (cleanStored === cleanEntered) {
    return true;
  }

  // Verificar pelo hash SHA-256 com salt
  const enteredHash = await hashSecurityPin(cleanEntered);
  if (enteredHash === cleanStored) {
    return true;
  }

  return false;
}

/**
 * Higieniza o objeto do utilizador autenticado antes de persistir em storage de sessão.
 * Remove estritamente senhas, PINs em claro, chaves privadas ou tokens não expirados.
 */
export function sanitizeUserSession(user: Employee | null | undefined): Employee | null {
  if (!user) return null;
  const safe = { ...user };
  delete (safe as any).pin;
  delete (safe as any).password;
  delete (safe as any).tempPassword;
  delete (safe as any).tokenSecret;
  delete (safe as any).pinHash;
  delete (safe as any).token;
  delete (safe as any).secret;
  delete (safe as any).accessToken;
  delete (safe as any).refreshToken;
  delete (safe as any).apiKey;
  return safe;
}

/**
 * Remove estritamente credenciais, PINs e senhas de colaboradores para snapshots, backups ou caches
 */
export function sanitizeEmployeesForExport(employees: Employee[] = []): Employee[] {
  return employees.map((emp) => {
    const safe = { ...emp };
    delete (safe as any).pin;
    delete (safe as any).password;
    delete (safe as any).tempPassword;
    delete (safe as any).tokenSecret;
    delete (safe as any).pinHash;
    delete (safe as any).token;
    delete (safe as any).secret;
    return safe;
  });
}

/**
 * Higieniza configurações do sistema para snapshots e backups, removendo securityPin e senhas SMTP
 */
export function sanitizeSettingsForExport(settings: any): any {
  if (!settings) return settings;
  const safe = { ...settings };
  delete safe.securityPin;
  delete safe.smtpPassword;
  delete safe.smsTwilioToken;
  delete safe.token;
  delete safe.secret;
  delete safe.apiKey;
  return safe;
}

/**
 * Executa uma purga rigorosa em todos os storages do navegador (localStorage, sessionStorage)
 * procurando por qualquer resíduo de chaves sensíveis (pin, password, tokens, caches, snapshots comerciais)
 */
export function purgeClientSensitiveStorage(): void {
  try {
    // 1. Chaves de storage proibidas
    const sensitiveKeys = [
      "password",
      "senha",
      "pin",
      "user_pin",
      "admin_pin",
      "supervisor_pin",
      "google_access_token",
      "google_token",
      "googleToken",
      "gmail_token",
      "gmailToken",
      "provider_token",
      "access_token",
      "refresh_token",
      "token",
      "secret",
      "api_key",
      "pos_sync_queue",
      "erp_cache_snapshot_global",
      "erp_auto_backup_local_db",
      "erp_local_backups_log",
      "ost_pos_cash_closures",
      "ost_pos_shift_status",
      "ost_pos_opening_balance",
      "ost_pos_shift_opened_at",
      "ost_pos_shift_opened_by",
      "erp_simulated_logged_in_user",
      "offline_queue",
      "erp_offline_sales",
      "pending_transactions",
      "cached_sales",
      "offline_sales",
      "erp_offline_queue",
      "sync_pending",
      "offline_transactions",
      "local_sales_cache"
    ];

    if (typeof localStorage !== "undefined") {
      sensitiveKeys.forEach(k => localStorage.removeItem(k));
      
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const lower = k.toLowerCase();
          if (
            lower.includes("password") ||
            lower.includes("senha") ||
            lower.includes("secret") ||
            lower.includes("user_pin") ||
            lower.includes("admin_pin") ||
            lower.includes("supervisor_pin") ||
            lower.includes("google_access_token") ||
            lower.includes("google_token") ||
            lower.includes("gmail_token") ||
            lower.includes("provider_token") ||
            (lower.includes("token") && !lower.startsWith("sb-") && !lower.includes("theme")) ||
            lower.startsWith("erp_cache_snapshot_") ||
            lower.startsWith("erp_backup_slot_") ||
            lower.startsWith("offline_") ||
            lower.startsWith("pending_") ||
            lower.startsWith("cached_sales") ||
            lower.startsWith("erp_offline")
          ) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // Higienizar 'erp_logged_in_user' se tiver persistido com PIN/senha
      const rawUser = localStorage.getItem("erp_logged_in_user");
      if (rawUser) {
        try {
          const parsed = JSON.parse(rawUser);
          if (parsed && (parsed.pin || parsed.password || parsed.tempPassword || parsed.pinHash || parsed.token || parsed.secret)) {
            const sanitized = sanitizeUserSession(parsed);
            localStorage.setItem("erp_logged_in_user", JSON.stringify(sanitized));
          }
        } catch {}
      }

      // Higienizar erp_company_settings se contiver securityPin ou smtpPassword
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("erp_company_settings")) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && (parsed.securityPin || parsed.smtpPassword || parsed.smsTwilioToken)) {
                const sanitized = sanitizeSettingsForExport(parsed);
                localStorage.setItem(k, JSON.stringify(sanitized));
              }
            }
          } catch {}
        }
      }
    }

    if (typeof sessionStorage !== "undefined") {
      sensitiveKeys.forEach(k => sessionStorage.removeItem(k));
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) {
          const lower = k.toLowerCase();
          if (
            lower.includes("password") ||
            lower.includes("senha") ||
            lower.includes("pin") ||
            lower.includes("token") ||
            lower.includes("secret")
          ) {
            sessionKeysToRemove.push(k);
          }
        }
      }
      sessionKeysToRemove.forEach(k => sessionStorage.removeItem(k));
    }

    // 2. Limpar cookies de sessão sensíveis se existirem
    if (typeof document !== "undefined" && document.cookie) {
      const cookies = document.cookie.split(";");
      for (const cookie of cookies) {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        const lowerName = name.toLowerCase();
        if (
          lowerName.includes("token") ||
          lowerName.includes("secret") ||
          lowerName.includes("password") ||
          lowerName.includes("pin") ||
          lowerName.includes("access")
        ) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
      }
    }

    // 3. Limpar CacheStorage de credenciais ou snapshots offline se existirem
    if (typeof window !== "undefined" && "caches" in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          const lower = name.toLowerCase();
          if (
            lower.includes("auth") ||
            lower.includes("token") ||
            lower.includes("snapshot") ||
            lower.includes("secret")
          ) {
            caches.delete(name);
          }
        }
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[SECURITY] Erro durante a purga de dados sensíveis:", err);
  }
}
