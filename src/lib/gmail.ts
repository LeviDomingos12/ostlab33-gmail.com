import { getSupabaseClient } from "./supabase";
import { authenticatedFetch } from "./apiClient";

/**
 * Obtém o token de acesso Google de forma estritamente efêmera da sessão em memória do Supabase Auth.
 * 
 * GARANTIA DE SEGURANÇA:
 * - google_access_token NUNCA é armazenado no localStorage ou sessionStorage.
 * - Credenciais e tokens temporários não são gravados em disco nem persistidos.
 * - Limpa proativamente qualquer chave legada residual que possa ter existido no storage do cliente.
 */
export const getGoogleAccessToken = async (): Promise<string | null> => {
  // Clear any insecure legacy google_access_token or variants from client storages
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("google_access_token");
      localStorage.removeItem("google_token");
      localStorage.removeItem("gmail_token");
      localStorage.removeItem("provider_token");
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("google_access_token");
      sessionStorage.removeItem("google_token");
      sessionStorage.removeItem("gmail_token");
      sessionStorage.removeItem("provider_token");
    }
  } catch {}

  const client = getSupabaseClient();
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    if (session?.provider_token) return session.provider_token;
    if (session?.access_token) return session.access_token;
  }
  return null;
};

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: { filename: string; content: string; mimeType: string }[];
}

export const sendEmail = async ({ to, subject, body, isHtml = true, attachments }: SendEmailParams) => {
  try {
    // 1. Try sending via server-side SMTP first (which uses settings/env configs)
    const serverResponse = await authenticatedFetch("/api/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        body,
      }),
    });

    if (serverResponse.ok) {
      const data = await serverResponse.json();
      return data;
    } else {
      console.warn("[SMTP FAILED] Falling back to client-side Gmail API if token is available.");
    }
  } catch (error) {
    console.error("[SMTP ERROR] Failed to send via SMTP, trying Google API fallback:", error);
  }

  // 2. Fallback to client-side Google Gmail API if access token is available
  try {
    const accessToken = await getGoogleAccessToken();
    if (accessToken) {
      let emailContent = "";

      if (attachments && attachments.length > 0) {
        const boundary = "----=_NextPart_" + Math.random().toString(36).substring(2);
        emailContent += `To: ${to}\r\n`;
        emailContent += `Subject: ${subject}\r\n`;
        emailContent += `MIME-Version: 1.0\r\n`;
        emailContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
        
        emailContent += `--${boundary}\r\n`;
        emailContent += `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8\r\n\r\n`;
        emailContent += `${body}\r\n\r\n`;

        for (const attachment of attachments) {
          emailContent += `--${boundary}\r\n`;
          emailContent += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
          emailContent += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
          emailContent += `Content-Transfer-Encoding: base64\r\n\r\n`;
          emailContent += `${attachment.content}\r\n\r\n`;
        }
        
        emailContent += `--${boundary}--\r\n`;
      } else {
        emailContent = `To: ${to}\r\n` +
          `Subject: ${subject}\r\n` +
          `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8\r\n\r\n` +
          `${body}`;
      }

      // Use btoa and encodeURIComponent to safely base64 encode
      const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: base64EncodedEmail,
        }),
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[GMAIL API FALLBACK WARN] Gmail API send failed:", errorData?.error?.message || response.statusText);
      }
    }
  } catch (gmailErr) {
    console.warn("[GMAIL API FALLBACK ERROR]", gmailErr);
  }

  // Fallback: report real error if neither SMTP nor Gmail API delivered
  return {
    success: false,
    error: "Não foi possível enviar o e-mail. Verifique as configurações de SMTP nas Definições do Sistema."
  };
};
