/**
 * @file sms.ts
 * Real SMS Gateway Dispatcher - Connects to the backend SMS service
 */

import { authenticatedFetch } from "./apiClient";

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await authenticatedFetch("/api/sms/test-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumber: to,
        messageText: message
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error || result?.message || `HTTP ${response.status}: Falha no envio de SMS`);
    }

    return { success: true, message: result?.message || "SMS despachado com sucesso." };
  } catch (err: any) {
    console.error("[SMS Gateway Error]", err);
    return { success: false, error: err?.message || "Erro de comunicação com o Gateway de SMS." };
  }
}

