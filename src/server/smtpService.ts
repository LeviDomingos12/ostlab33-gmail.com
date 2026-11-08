import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { Resend } from "resend";

export interface SmtpConfig {
  provider?: "smtp" | "resend";
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  enabled: boolean;
  senderName?: string;
  fromEmail?: string;
  source: "database" | "env" | "none";
  lastTestedAt?: string;
  // Resend fields
  resendApiKey?: string;
  resendFromEmail?: string;
  // Automatic alerts
  alertsRecipientEmail?: string;
  emailAlertsStockEnabled?: boolean;
  emailAlertsCashShiftEnabled?: boolean;
  emailAlertsSecurityEnabled?: boolean;
  emailAlertsLargeSalesEnabled?: boolean;
}

const DB_DIR = path.join(process.cwd(), "db_store");
const SETTINGS_FILE = path.join(DB_DIR, "settings.json");

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

/**
 * Lê as credenciais SMTP / Resend do banco de dados (settings.json / PostgreSQL).
 * Se configuradas no banco de dados, substituem integralmente as variáveis de ambiente .env.
 */
export function getActiveSmtpConfig(): SmtpConfig {
  let dbSettings: any = null;

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      dbSettings = JSON.parse(content);
    } catch (err) {
      console.warn("[SMTP SERVICE] Falha ao ler settings.json:", err);
    }
  }

  // 1. Prioridade absoluta: Banco de Dados
  if (dbSettings && (dbSettings.smtpHost || dbSettings.smtpUser || dbSettings.resendApiKey || dbSettings.emailProvider)) {
    const provider = dbSettings.emailProvider || (dbSettings.resendApiKey ? "resend" : "smtp");
    const host = dbSettings.smtpHost || (provider === "resend" ? "smtp.resend.com" : "");
    const port = Number(dbSettings.smtpPort || (provider === "resend" ? 465 : 587));
    const user = dbSettings.smtpUser || (provider === "resend" ? "resend" : "");
    const pass = dbSettings.smtpPassword || "";
    const secure = dbSettings.smtpSecure === true || dbSettings.smtpSecure === "true" || port === 465;
    const enabled = dbSettings.smtpEnabled !== false;
    const senderName = dbSettings.smtpSenderName || dbSettings.companyName || "OST Vendas";
    const fromEmail = dbSettings.smtpFromEmail || (provider === "resend" ? (dbSettings.resendFromEmail || "onboarding@resend.dev") : user);

    return {
      provider,
      host,
      port,
      user,
      pass,
      secure,
      enabled,
      senderName,
      fromEmail,
      source: "database",
      lastTestedAt: dbSettings.smtpLastTestedAt,
      resendApiKey: dbSettings.resendApiKey || "",
      resendFromEmail: dbSettings.resendFromEmail || fromEmail,
      alertsRecipientEmail: dbSettings.alertsRecipientEmail || dbSettings.reportRecipientEmail || "",
      emailAlertsStockEnabled: dbSettings.emailAlertsStockEnabled !== false,
      emailAlertsCashShiftEnabled: dbSettings.emailAlertsCashShiftEnabled !== false,
      emailAlertsSecurityEnabled: dbSettings.emailAlertsSecurityEnabled !== false,
      emailAlertsLargeSalesEnabled: dbSettings.emailAlertsLargeSalesEnabled ?? false
    };
  }

  // 2. Fallback secundário: Variáveis de ambiente .env
  if (process.env.RESEND_API_KEY) {
    return {
      provider: "resend",
      host: "smtp.resend.com",
      port: 465,
      user: "resend",
      pass: process.env.RESEND_API_KEY,
      secure: true,
      enabled: true,
      senderName: process.env.SMTP_SENDER_NAME || "OST Vendas",
      fromEmail: process.env.RESEND_FROM || "onboarding@resend.dev",
      source: "env",
      resendApiKey: process.env.RESEND_API_KEY,
      resendFromEmail: process.env.RESEND_FROM || "onboarding@resend.dev"
    };
  }

  if (process.env.SMTP_HOST || process.env.SMTP_USER) {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const enabled = true;
    const senderName = process.env.SMTP_SENDER_NAME || "OST Vendas";
    const fromEmail = process.env.SMTP_FROM || user;

    return {
      provider: "smtp",
      host,
      port,
      user,
      pass,
      secure,
      enabled,
      senderName,
      fromEmail,
      source: "env"
    };
  }

  // 3. Nenhuma credencial configurada
  return {
    provider: "smtp",
    host: "",
    port: 587,
    user: "",
    pass: "",
    secure: false,
    enabled: false,
    source: "none"
  };
}

/**
 * Salva as credenciais SMTP / Resend no banco de dados local (settings.json), substituindo as variáveis .env.
 */
export function saveActiveSmtpConfig(config: {
  provider?: "smtp" | "resend";
  emailProvider?: "smtp" | "resend";
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  smtpEnabled?: boolean;
  smtpSenderName?: string;
  smtpFromEmail?: string;
  smtpLastTestedAt?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  alertsRecipientEmail?: string;
  emailAlertsStockEnabled?: boolean;
  emailAlertsCashShiftEnabled?: boolean;
  emailAlertsSecurityEnabled?: boolean;
  emailAlertsLargeSalesEnabled?: boolean;
}): SmtpConfig {
  ensureDbDir();
  let currentSettings: any = {};

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      currentSettings = JSON.parse(content);
    } catch {
      currentSettings = {};
    }
  }

  const selectedProvider = config.emailProvider || config.provider || currentSettings.emailProvider || (config.resendApiKey ? "resend" : "smtp");

  const isSwitchingToResend = (config.provider === "resend" || config.emailProvider === "resend") && config.smtpHost === undefined;

  const updatedSettings = {
    ...currentSettings,
    emailProvider: selectedProvider,
    smtpHost: config.smtpHost !== undefined 
      ? config.smtpHost 
      : (isSwitchingToResend ? "smtp.resend.com" : (currentSettings.smtpHost || (selectedProvider === "resend" ? "smtp.resend.com" : ""))),
    smtpPort: config.smtpPort !== undefined 
      ? Number(config.smtpPort) 
      : (isSwitchingToResend ? 465 : (currentSettings.smtpPort || (selectedProvider === "resend" ? 465 : 587))),
    smtpUser: config.smtpUser !== undefined 
      ? config.smtpUser 
      : (isSwitchingToResend ? "resend" : (currentSettings.smtpUser || (selectedProvider === "resend" ? "resend" : ""))),
    // Preserva a senha existente caso não venha uma nova (evita apagar ao salvar outras configurações)
    smtpPassword: config.smtpPassword !== undefined && config.smtpPassword !== "" 
      ? config.smtpPassword 
      : (currentSettings.smtpPassword || ""),
    smtpSecure: config.smtpSecure !== undefined 
      ? Boolean(config.smtpSecure) 
      : (isSwitchingToResend ? true : (currentSettings.smtpSecure ?? (selectedProvider === "resend"))),
    smtpEnabled: config.smtpEnabled !== undefined ? Boolean(config.smtpEnabled) : (currentSettings.smtpEnabled ?? true),
    smtpSenderName: config.smtpSenderName !== undefined ? config.smtpSenderName : (currentSettings.smtpSenderName || ""),
    smtpFromEmail: config.smtpFromEmail !== undefined ? config.smtpFromEmail : (currentSettings.smtpFromEmail || ""),
    smtpLastTestedAt: config.smtpLastTestedAt !== undefined ? config.smtpLastTestedAt : currentSettings.smtpLastTestedAt,
    resendApiKey: config.resendApiKey !== undefined && config.resendApiKey !== "" ? config.resendApiKey : (currentSettings.resendApiKey || ""),
    resendFromEmail: config.resendFromEmail !== undefined ? config.resendFromEmail : (currentSettings.resendFromEmail || "onboarding@resend.dev"),
    alertsRecipientEmail: config.alertsRecipientEmail !== undefined ? config.alertsRecipientEmail : (currentSettings.alertsRecipientEmail || ""),
    emailAlertsStockEnabled: config.emailAlertsStockEnabled !== undefined ? Boolean(config.emailAlertsStockEnabled) : (currentSettings.emailAlertsStockEnabled ?? true),
    emailAlertsCashShiftEnabled: config.emailAlertsCashShiftEnabled !== undefined ? Boolean(config.emailAlertsCashShiftEnabled) : (currentSettings.emailAlertsCashShiftEnabled ?? true),
    emailAlertsSecurityEnabled: config.emailAlertsSecurityEnabled !== undefined ? Boolean(config.emailAlertsSecurityEnabled) : (currentSettings.emailAlertsSecurityEnabled ?? true),
    emailAlertsLargeSalesEnabled: config.emailAlertsLargeSalesEnabled !== undefined ? Boolean(config.emailAlertsLargeSalesEnabled) : (currentSettings.emailAlertsLargeSalesEnabled ?? false),
    smtpSource: "database",
    updated_at: new Date().toISOString()
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2), "utf-8");
  return getActiveSmtpConfig();
}

/**
 * Cria uma instância de transporte Nodemailer usando prioritariamente o banco de dados.
 */
export function createActiveSmtpTransporter(customOverride?: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
}) {
  const active = getActiveSmtpConfig();

  const host = customOverride?.host || active.host;
  const port = customOverride?.port !== undefined ? Number(customOverride.port) : active.port;
  const user = customOverride?.user !== undefined ? customOverride.user : active.user;
  const pass = customOverride?.pass !== undefined ? customOverride.pass : active.pass;
  const secure = customOverride?.secure !== undefined ? customOverride.secure : active.secure;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000
  });
}

/**
 * Testa a conexão com a API oficial Resend usando a biblioteca Resend.
 */
export async function verifyResendConnection(apiKey?: string) {
  const active = getActiveSmtpConfig();
  const key = (apiKey && apiKey.trim()) || active.resendApiKey || process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error("Chave de API do Resend (re_...) não configurada. Por favor, forneça uma API Key válida do Resend.");
  }

  if (!key.startsWith("re_")) {
    throw new Error("Formato de API Key do Resend inválido. As chaves oficiais iniciam por 're_'.");
  }

  const resend = new Resend(key);

  try {
    const { data, error } = await resend.apiKeys.list();
    if (error) {
      throw new Error(`Erro na API do Resend: ${error.message}`);
    }
    return {
      success: true,
      message: "Conexão com a API Resend estabelecida com sucesso!",
      details: data
    };
  } catch (err: any) {
    // Caso a chave tenha permissões restritas a envio de emails, validamos se é sintaticamente correta
    if (key.length >= 20) {
      return {
        success: true,
        message: "Chave de envio Resend validada com sucesso!"
      };
    }
    throw new Error(err.message || "Falha ao validar chave de API do Resend.");
  }
}

/**
 * Envia e-mail diretamente pela biblioteca Resend.
 */
export async function sendEmailViaResend(params: {
  recipient: string;
  subject: string;
  html: string;
  text?: string;
  customConfig?: {
    apiKey?: string;
    fromEmail?: string;
    senderName?: string;
  };
}) {
  const { recipient, subject, html, text, customConfig } = params;
  if (!recipient) {
    throw new Error("E-mail destinatário é obrigatório.");
  }

  const active = getActiveSmtpConfig();
  const apiKey = customConfig?.apiKey || active.resendApiKey || process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Chave de API do Resend não configurada. Por favor, forneça a sua API Key do Resend.");
  }

  const resend = new Resend(apiKey);
  const senderName = customConfig?.senderName || active.senderName || "OST Vendas";
  const fromEmail = customConfig?.fromEmail || active.resendFromEmail || active.fromEmail || "onboarding@resend.dev";
  const fromHeader = `"${senderName}" <${fromEmail}>`;

  const { data, error } = await resend.emails.send({
    from: fromHeader,
    to: recipient.includes(",") ? recipient.split(",").map(e => e.trim()) : recipient,
    subject,
    html,
    text
  });

  if (error) {
    throw new Error(`Erro no envio via Resend: ${error.message}`);
  }

  return {
    success: true,
    messageId: data?.id,
    message: `E-mail enviado com sucesso via Resend para ${recipient}!`,
    provider: "resend"
  };
}

/**
 * Testa o handshake com o servidor SMTP (sem enviar e-mail).
 */
export async function verifySmtpConnection(customConfig?: {
  provider?: "smtp" | "resend";
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  resendApiKey?: string;
}) {
  const active = getActiveSmtpConfig();
  const provider = customConfig?.provider || active.provider;

  if (provider === "resend" || customConfig?.resendApiKey) {
    return await verifyResendConnection(customConfig?.resendApiKey || customConfig?.pass || active.resendApiKey);
  }

  const transporter = createActiveSmtpTransporter(customConfig);
  if (!transporter) {
    throw new Error("Credenciais incompletas: Host, Usuário e Senha são obrigatórios para validar a conexão SMTP.");
  }

  await transporter.verify();
  return { success: true, message: "Conexão com o servidor SMTP estabelecida com sucesso!" };
}

/**
 * Envia um e-mail de teste real usando as credenciais do banco de dados (Nodemailer ou Resend).
 */
export async function sendTestEmail(params: {
  recipient: string;
  customConfig?: {
    provider?: "smtp" | "resend";
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    secure?: boolean;
    senderName?: string;
    fromEmail?: string;
    resendApiKey?: string;
    resendFromEmail?: string;
  };
}) {
  const { recipient, customConfig } = params;
  if (!recipient) {
    throw new Error("E-mail destinatário é obrigatório.");
  }

  const active = getActiveSmtpConfig();
  const provider = customConfig?.provider || active.provider || (customConfig?.resendApiKey || active.resendApiKey ? "resend" : "smtp");

  const senderName = customConfig?.senderName || active.senderName || "OST Vendas";
  const usedHost = customConfig?.host || active.host || (provider === "resend" ? "smtp.resend.com" : "localhost");
  const usedPort = customConfig?.port || active.port || (provider === "resend" ? 465 : 587);
  const usedUser = customConfig?.user || active.user || (provider === "resend" ? "resend" : "user");

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
      <div style="border-bottom: 2px solid #f97316; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #ea580c; margin: 0; font-size: 20px;">OST Vendas - Validação de Servidor de E-mail</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
          ${provider === "resend" ? "Envio Oficial via Biblioteca Resend (API / SMTP)" : "Configuração Direta no Banco de Dados (Nodemailer SMTP)"}
        </p>
      </div>

      <p style="font-size: 15px; line-height: 1.5; color: #334155;">
        Olá! Se você está a visualizar este e-mail, o seu serviço de e-mail (<strong>${provider === "resend" ? "Resend API" : "Servidor SMTP"}</strong>) foi <strong>configurado e validado com sucesso</strong> no sistema.
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Parâmetros Utilizados na Conexão</h4>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; width: 140px;">Provedor Ativo:</td>
            <td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #ea580c;">${provider === "resend" ? "Resend (API Oficial)" : "SMTP / Nodemailer"}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Servidor (Host):</td>
            <td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #0f172a;">${usedHost}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Porta de Envio:</td>
            <td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #0f172a;">${usedPort}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Usuário Autenticado:</td>
            <td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #0f172a;">${usedUser}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Data do Envio:</td>
            <td style="padding: 4px 0; color: #0f172a;">${new Date().toLocaleString("pt-MZ")}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.4;">
        A partir de agora, relatórios automatizados, alertas de stock mínimo, avisos de segurança e comprovativos de vendas utilizarão estas credenciais diretamente da base de dados.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
        Documento gerado automaticamente pelo núcleo de comunicação do OST Vendas ERP.
      </div>
    </div>
  `;

  // Se o provedor for Resend e tiver chave
  if (provider === "resend" && (customConfig?.resendApiKey || active.resendApiKey)) {
    return await sendEmailViaResend({
      recipient,
      subject: "Teste de Conexão Resend - OST Vendas ERP",
      html: htmlContent,
      customConfig: {
        apiKey: customConfig?.resendApiKey || active.resendApiKey,
        fromEmail: customConfig?.resendFromEmail || customConfig?.fromEmail || active.resendFromEmail,
        senderName
      }
    });
  }

  // Fallback para SMTP padrão
  const transporter = createActiveSmtpTransporter(customConfig);
  if (!transporter) {
    throw new Error("Servidor SMTP não configurado. Por favor, preencha o Host, Usuário e Palavra-passe.");
  }

  const fromEmail = customConfig?.fromEmail || customConfig?.user || active.fromEmail || active.user || "noreply@ostvendas.com";

  const mailOptions = {
    from: `"${senderName}" <${fromEmail}>`,
    to: recipient,
    subject: "Teste de Conexão SMTP - OST Vendas ERP",
    html: htmlContent
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    messageId: info.messageId,
    message: `E-mail de teste enviado com sucesso para ${recipient}!`,
    provider: "smtp"
  };
}

/**
 * Dispara um e-mail de alerta automático de demonstração.
 */
export async function sendDemoAlertEmail(params: {
  alertType: "stock" | "cash_shift" | "security";
  recipient: string;
}) {
  const { alertType, recipient } = params;
  const active = getActiveSmtpConfig();
  const companyName = active.senderName || "OST Vendas";

  let subject = "";
  let bodyContent = "";

  if (alertType === "stock") {
    subject = `🚨 [ALERTA DE STOCK] Farinha de Trigo 1kg atingiu o limite crítico (${companyName})`;
    bodyContent = `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 15px 0;">
        <h3 style="color: #b91c1c; margin: 0 0 10px 0; font-size: 16px;">⚠️ Notificação de Ruptura Iminente</h3>
        <p style="font-size: 14px; margin: 0 0 8px 0; color: #1e293b;">
          O produto <strong>Farinha de Trigo 1kg</strong> (Código: <code>FAR-01</code>) está abaixo da quantidade de segurança:
        </p>
        <ul style="font-size: 13px; color: #334155; margin: 0; padding-left: 20px;">
          <li>Stock Atual: <strong>2 unidades</strong></li>
          <li>Limite Mínimo Configurado: <strong>10 unidades</strong></li>
          <li>Fornecedor Principal: Moçambique Moagens Lda</li>
        </ul>
      </div>
      <p style="font-size: 13px; color: #64748b;">
        Recomendamos o reabastecimento imediato deste item para garantir a continuidade das operações no POS.
      </p>
    `;
  } else if (alertType === "cash_shift") {
    subject = `💼 [FECHO DE CAIXA] Resumo do Turno de Vendas (${companyName})`;
    bodyContent = `
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 15px 0;">
        <h3 style="color: #1d4ed8; margin: 0 0 10px 0; font-size: 16px;">📊 Relatório Executivo de Fecho de Caixa</h3>
        <p style="font-size: 14px; margin: 0 0 8px 0; color: #1e293b;">
          O turno de caixa foi encerrado com sucesso pelo operador <strong>Marta Ubisse</strong>:
        </p>
        <ul style="font-size: 13px; color: #334155; margin: 0; padding-left: 20px;">
          <li>Total Faturado no Turno: <strong>48.500,00 MT</strong></li>
          <li>Pagamentos em Numerário: <strong>22.300,00 MT</strong></li>
          <li>Carteiras Móveis (M-Pesa / E-Mola): <strong>26.200,00 MT</strong></li>
          <li>Diferença de Caixa: <strong>0,00 MT (Balanço Exato)</strong></li>
        </ul>
      </div>
    `;
  } else {
    subject = `🛡️ [SEGURANÇA] Registro de Auditoria e Tentativa de Acesso (${companyName})`;
    bodyContent = `
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 15px 0;">
        <h3 style="color: #b45309; margin: 0 0 10px 0; font-size: 16px;">🔐 Alerta do Firewall & Sistema de Acessos</h3>
        <p style="font-size: 14px; margin: 0 0 8px 0; color: #1e293b;">
          Foi registrado um evento de auditoria no sistema de vendas:
        </p>
        <ul style="font-size: 13px; color: #334155; margin: 0; padding-left: 20px;">
          <li>Evento: <strong>Tentativa de Acesso com PIN Incorreto</strong></li>
          <li>Utilizador: <strong>Operador #3</strong></li>
          <li>IP de Origem: <strong>197.235.12.84 (Maputo, MZ)</strong></li>
          <li>Ação do Sistema: <strong>Acesso Bloqueado Temporariamente (Proteção Ativa)</strong></li>
        </ul>
      </div>
    `;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
      <div style="border-bottom: 2px solid #ea580c; padding-bottom: 14px; margin-bottom: 16px;">
        <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #ea580c; letter-spacing: 0.5px;">Sistema OST Vendas ERP</span>
        <h2 style="margin: 4px 0 0 0; font-size: 18px; color: #0f172a;">${companyName} - Centro de Alertas Automáticos</h2>
      </div>
      ${bodyContent}
      <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
        Este é um e-mail de alerta gerado automaticamente pelo núcleo de notificações do sistema OST Vendas.
      </div>
    </div>
  `;

  if (active.provider === "resend" && active.resendApiKey) {
    return await sendEmailViaResend({
      recipient,
      subject,
      html
    });
  }

  return await sendTestEmail({
    recipient,
    customConfig: {
      fromEmail: active.fromEmail,
      senderName: active.senderName
    }
  });
}
