import React, { useState, useEffect } from "react";
import { 
  Server, 
  Mail, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Send, 
  Save, 
  RefreshCw, 
  Info, 
  Zap, 
  Lock, 
  Key,
  BellRing,
  Check,
  Flame,
  Layers,
  Settings2
} from "lucide-react";
import { SystemSettings, UserRole, Employee } from "../types";

interface SmtpConfigModuleProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  activeUser: Employee | null;
  currentRole: UserRole;
  userEmail?: string;
}

export default function SmtpConfigModule({
  settings,
  onUpdateSettings,
  onAddAuditLog,
  onShowToast,
  activeUser,
  currentRole: _currentRole,
  userEmail
}: SmtpConfigModuleProps) {
  // Navigation Sub-tab inside module
  const [activeTab, setActiveTab] = useState<"smtp" | "resend" | "alerts" | "diagnostics">("smtp");

  // Email Provider Mode ("smtp" | "resend")
  const [emailProvider, setEmailProvider] = useState<"smtp" | "resend">(
    settings.emailProvider || (settings.resendApiKey ? "resend" : "smtp")
  );

  // Standard SMTP Fields
  const [smtpHost, setSmtpHost] = useState(settings.smtpHost || "");
  const [smtpPort, setSmtpPort] = useState<number>(settings.smtpPort || 587);
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser || "");
  const [smtpPassword, setSmtpPassword] = useState(settings.smtpPassword || "");
  const [smtpSecure, setSmtpSecure] = useState<boolean>(settings.smtpSecure ?? false);
  const [smtpEnabled, setSmtpEnabled] = useState<boolean>(settings.smtpEnabled ?? true);
  const [smtpSenderName, setSmtpSenderName] = useState(settings.smtpSenderName || settings.companyName || "OST Vendas");
  const [smtpFromEmail, setSmtpFromEmail] = useState(settings.smtpFromEmail || settings.smtpUser || "");
  const [smtpTlsIgnoreErrors, setSmtpTlsIgnoreErrors] = useState<boolean>(settings.smtpTlsIgnoreErrors ?? true);

  // Resend Specific Fields
  const [resendApiKey, setResendApiKey] = useState(settings.resendApiKey || "");
  const [resendFromEmail, setResendFromEmail] = useState(settings.resendFromEmail || "onboarding@resend.dev");

  // Automatic Alerts Settings
  const [alertsRecipientEmail, setAlertsRecipientEmail] = useState(
    settings.alertsRecipientEmail || settings.reportRecipientEmail || userEmail || activeUser?.email || ""
  );
  const [emailAlertsStockEnabled, setEmailAlertsStockEnabled] = useState<boolean>(
    settings.emailAlertsStockEnabled ?? settings.emailStockAlertsEnabled ?? true
  );
  const [emailAlertsCashShiftEnabled, setEmailAlertsCashShiftEnabled] = useState<boolean>(
    settings.emailAlertsCashShiftEnabled ?? true
  );
  const [emailAlertsSecurityEnabled, setEmailAlertsSecurityEnabled] = useState<boolean>(
    settings.emailAlertsSecurityEnabled ?? true
  );
  const [emailAlertsLargeSalesEnabled, setEmailAlertsLargeSalesEnabled] = useState<boolean>(
    settings.emailAlertsLargeSalesEnabled ?? false
  );

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testRecipient, setTestRecipient] = useState(
    settings.alertsRecipientEmail || settings.reportRecipientEmail || userEmail || activeUser?.email || settings.smtpUser || ""
  );
  const [demoAlertType, setDemoAlertType] = useState<"stock" | "cash_shift" | "security">("stock");

  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingDemoAlert, setIsSendingDemoAlert] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [lastVerifyResult, setLastVerifyResult] = useState<{
    success: boolean;
    message: string;
    timestamp?: string;
  } | null>(null);

  const [lastTestResult, setLastTestResult] = useState<{
    success: boolean;
    message: string;
    timestamp?: string;
    provider?: string;
  } | null>(null);

  const [lastDemoAlertResult, setLastDemoAlertResult] = useState<{
    success: boolean;
    message: string;
    timestamp?: string;
  } | null>(null);

  const [serverSource, setServerSource] = useState<"database" | "env" | "none">("database");
  const [serverHasStoredPass, setServerHasStoredPass] = useState(false);
  const [serverHasResendKey, setServerHasResendKey] = useState(false);

  // Carrega status atual do servidor backend
  useEffect(() => {
    fetchServerSmtpStatus();
  }, []);

  // Sincroniza estados caso as props mudem externamente
  useEffect(() => {
    if (settings.emailProvider) setEmailProvider(settings.emailProvider);
    if (settings.smtpHost !== undefined && settings.smtpHost !== smtpHost) setSmtpHost(settings.smtpHost || "");
    if (settings.smtpPort !== undefined && settings.smtpPort !== smtpPort) setSmtpPort(settings.smtpPort || 587);
    if (settings.smtpUser !== undefined && settings.smtpUser !== smtpUser) setSmtpUser(settings.smtpUser || "");
    if (settings.smtpPassword !== undefined && settings.smtpPassword !== smtpPassword) setSmtpPassword(settings.smtpPassword || "");
    if (settings.smtpSecure !== undefined && settings.smtpSecure !== smtpSecure) setSmtpSecure(settings.smtpSecure);
    if (settings.smtpEnabled !== undefined && settings.smtpEnabled !== smtpEnabled) setSmtpEnabled(settings.smtpEnabled);
    if (settings.smtpSenderName !== undefined && settings.smtpSenderName !== smtpSenderName) setSmtpSenderName(settings.smtpSenderName || settings.companyName || "OST Vendas");
    if (settings.smtpFromEmail !== undefined && settings.smtpFromEmail !== smtpFromEmail) setSmtpFromEmail(settings.smtpFromEmail || settings.smtpUser || "");
    if (settings.resendApiKey !== undefined && settings.resendApiKey !== resendApiKey) setResendApiKey(settings.resendApiKey || "");
    if (settings.resendFromEmail !== undefined && settings.resendFromEmail !== resendFromEmail) setResendFromEmail(settings.resendFromEmail || "onboarding@resend.dev");
    if (settings.alertsRecipientEmail !== undefined && settings.alertsRecipientEmail !== alertsRecipientEmail) setAlertsRecipientEmail(settings.alertsRecipientEmail || "");
    if (settings.emailAlertsStockEnabled !== undefined) setEmailAlertsStockEnabled(settings.emailAlertsStockEnabled);
    if (settings.emailAlertsCashShiftEnabled !== undefined) setEmailAlertsCashShiftEnabled(settings.emailAlertsCashShiftEnabled);
    if (settings.emailAlertsSecurityEnabled !== undefined) setEmailAlertsSecurityEnabled(settings.emailAlertsSecurityEnabled);
    if (settings.emailAlertsLargeSalesEnabled !== undefined) setEmailAlertsLargeSalesEnabled(settings.emailAlertsLargeSalesEnabled);
  }, [settings]);

  const fetchServerSmtpStatus = async () => {
    try {
      const res = await fetch("/api/settings/smtp");
      if (res.ok) {
        const data = await res.json();
        setServerSource(data.source || (data.smtpHost || data.hasResendApiKey ? "database" : "none"));
        setServerHasStoredPass(Boolean(data.hasPassword));
        setServerHasResendKey(Boolean(data.hasResendApiKey));

        if (data.emailProvider) setEmailProvider(data.emailProvider);
        if (data.smtpHost && !smtpHost) setSmtpHost(data.smtpHost);
        if (data.smtpPort && !smtpPort) setSmtpPort(data.smtpPort);
        if (data.smtpUser && !smtpUser) setSmtpUser(data.smtpUser);
        if (data.smtpSenderName && !smtpSenderName) setSmtpSenderName(data.smtpSenderName);
        if (data.smtpFromEmail && !smtpFromEmail) setSmtpFromEmail(data.smtpFromEmail);
        if (data.resendFromEmail && !resendFromEmail) setResendFromEmail(data.resendFromEmail);
        if (data.alertsRecipientEmail && !alertsRecipientEmail) setAlertsRecipientEmail(data.alertsRecipientEmail);

        if (data.lastTestedAt) {
          setLastVerifyResult({
            success: true,
            message: "Configuração validada e registrada no banco de dados.",
            timestamp: new Date(data.lastTestedAt).toLocaleTimeString("pt-MZ")
          });
        }
      }
    } catch {
      // Ignora erro silenciosamente
    }
  };

  // Presets Rápidos
  const applyPreset = (preset: "resend" | "gmail" | "outlook" | "cpanel" | "sendgrid") => {
    if (preset === "resend") {
      setEmailProvider("resend");
      setSmtpHost("smtp.resend.com");
      setSmtpPort(465);
      setSmtpSecure(true);
      setSmtpUser("resend");
      if (!resendFromEmail || resendFromEmail === "") {
        setResendFromEmail("onboarding@resend.dev");
      }
      if (onShowToast) {
        onShowToast("Preset oficial do Resend aplicado! Insira a sua API Key (re_...) no campo de chave.", "info", "Preset Resend");
      }
    } else if (preset === "gmail") {
      setEmailProvider("smtp");
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(587);
      setSmtpSecure(false);
      if (onShowToast) {
        onShowToast("Preset do Gmail aplicado (Porta 587 STARTTLS). Use uma 'Palavra-passe de Aplicação' de 16 letras se o 2FA estiver ativado.", "info", "Preset Gmail");
      }
    } else if (preset === "outlook") {
      setEmailProvider("smtp");
      setSmtpHost("smtp.office365.com");
      setSmtpPort(587);
      setSmtpSecure(false);
      if (onShowToast) {
        onShowToast("Preset Microsoft Outlook / Office 365 aplicado (Porta 587 STARTTLS).", "info", "Preset Microsoft");
      }
    } else if (preset === "cpanel") {
      setEmailProvider("smtp");
      setSmtpHost(smtpHost || "mail.seudominio.co.mz");
      setSmtpPort(465);
      setSmtpSecure(true);
      if (onShowToast) {
        onShowToast("Preset cPanel / Webmail corporativo aplicado (Porta 465 SSL/TLS).", "info", "Preset cPanel");
      }
    } else if (preset === "sendgrid") {
      setEmailProvider("smtp");
      setSmtpHost("smtp.sendgrid.net");
      setSmtpPort(587);
      setSmtpSecure(false);
      setSmtpUser("apikey");
      if (onShowToast) {
        onShowToast("Preset SendGrid aplicado (Usuário 'apikey' e Porta 587).", "info", "Preset SendGrid");
      }
    }
  };

  // Validação e Handshake (Sem enviar e-mail)
  const handleVerifyConnection = async () => {
    if (emailProvider === "resend") {
      if (!resendApiKey.trim() && !serverHasResendKey) {
        if (onShowToast) onShowToast("Por favor, insira a sua chave de API do Resend (iniciando em 're_').", "warning");
        return;
      }
    } else {
      if (!smtpHost.trim()) {
        if (onShowToast) onShowToast("Por favor, preencha o Servidor SMTP (Host).", "warning");
        return;
      }
      if (!smtpUser.trim()) {
        if (onShowToast) onShowToast("Por favor, preencha o Utilizador SMTP.", "warning");
        return;
      }
    }

    setIsVerifying(true);
    setLastVerifyResult(null);

    try {
      const res = await fetch("/api/email/verify-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: emailProvider,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort),
          smtpUser: smtpUser.trim(),
          smtpPassword: smtpPassword || undefined,
          smtpSecure,
          resendApiKey: resendApiKey.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao validar conexão com o serviço de e-mail.");
      }

      setLastVerifyResult({
        success: true,
        message: data.message || "Conexão validada com sucesso! O serviço respondeu corretamente.",
        timestamp: new Date().toLocaleTimeString("pt-MZ")
      });
      if (onShowToast) {
        onShowToast("Conexão com o serviço de e-mail validada com sucesso!", "success", "Servidor Conectado");
      }
      onAddAuditLog(
        "Teste de Conexão de E-mail", 
        "SERVIÇO DE E-MAIL", 
        emailProvider === "resend" 
          ? "Validação de API Key Resend concluída com sucesso." 
          : `Handshake com servidor SMTP ${smtpHost}:${smtpPort} concluído com sucesso.`
      );
    } catch (err: any) {
      setLastVerifyResult({
        success: false,
        message: err.message || "Erro de conexão ao servidor de e-mail.",
        timestamp: new Date().toLocaleTimeString("pt-MZ")
      });
      if (onShowToast) {
        onShowToast(err.message, "error", "Falha de Conexão");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Envio de E-mail de Teste Real
  const handleSendTestEmail = async () => {
    const target = testRecipient.trim() || alertsRecipientEmail.trim();
    if (!target) {
      if (onShowToast) onShowToast("Informe o e-mail de destino para o teste.", "warning");
      return;
    }

    if (emailProvider === "resend" && !resendApiKey.trim() && !serverHasResendKey) {
      if (onShowToast) onShowToast("Por favor, informe a Chave de API do Resend.", "warning");
      return;
    }

    if (emailProvider === "smtp" && !smtpHost.trim()) {
      if (onShowToast) onShowToast("Por favor, preencha o Servidor SMTP (Host).", "warning");
      return;
    }

    setIsSendingTest(true);
    setLastTestResult(null);

    try {
      const res = await fetch("/api/email/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: emailProvider,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort),
          smtpUser: smtpUser.trim(),
          smtpPassword: smtpPassword || undefined,
          smtpSecure,
          senderName: smtpSenderName.trim() || "OST Vendas",
          fromEmail: emailProvider === "resend" ? (resendFromEmail.trim() || "onboarding@resend.dev") : (smtpFromEmail.trim() || smtpUser.trim()),
          resendApiKey: resendApiKey.trim() || undefined,
          resendFromEmail: resendFromEmail.trim() || undefined,
          recipient: target
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao enviar e-mail de teste.");
      }

      setLastTestResult({
        success: true,
        message: `E-mail de demonstração entregue com sucesso para ${target}! Verifique a caixa de entrada.`,
        timestamp: new Date().toLocaleTimeString("pt-MZ"),
        provider: emailProvider
      });
      if (onShowToast) {
        onShowToast(`E-mail despachado para ${target} via ${emailProvider.toUpperCase()}!`, "success", "E-mail Enviado");
      }
      onAddAuditLog(
        "Disparo E-mail de Teste",
        "SERVIÇO DE E-MAIL",
        `E-mail de teste enviado para ${target} via ${emailProvider === 'resend' ? 'Resend API' : smtpHost}.`
      );
    } catch (err: any) {
      setLastTestResult({
        success: false,
        message: err.message || "Falha no disparo do e-mail de teste.",
        timestamp: new Date().toLocaleTimeString("pt-MZ")
      });
      if (onShowToast) {
        onShowToast(err.message, "error", "Erro no Envio");
      }
    } finally {
      setIsSendingTest(false);
    }
  };

  // Disparo de Alerta Automático de Demonstração
  const handleSendDemoAlert = async () => {
    const target = alertsRecipientEmail.trim() || testRecipient.trim();
    if (!target) {
      if (onShowToast) onShowToast("Defina o E-mail Destinatário de Alertas antes de testar.", "warning");
      return;
    }

    setIsSendingDemoAlert(true);
    setLastDemoAlertResult(null);

    try {
      const res = await fetch("/api/email/send-demo-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertType: demoAlertType,
          recipient: target
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao disparar alerta de demonstração.");
      }

      setLastDemoAlertResult({
        success: true,
        message: `Alerta automático (${demoAlertType.toUpperCase()}) enviado para ${target}!`,
        timestamp: new Date().toLocaleTimeString("pt-MZ")
      });

      if (onShowToast) {
        onShowToast(`Alerta automático simulado com sucesso para ${target}!`, "success", "Alerta Disparado");
      }

      onAddAuditLog(
        "Alerta de Demonstração Disparado",
        "ALERTAS AUTOMÁTICOS",
        `Alerta simulado do tipo '${demoAlertType}' enviado para ${target}.`
      );
    } catch (err: any) {
      setLastDemoAlertResult({
        success: false,
        message: err.message || "Erro ao disparar alerta.",
        timestamp: new Date().toLocaleTimeString("pt-MZ")
      });
      if (onShowToast) {
        onShowToast(err.message, "error", "Falha no Alerta");
      }
    } finally {
      setIsSendingDemoAlert(false);
    }
  };

  // Salvar no Banco de Dados
  const handleSaveToDatabase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (emailProvider === "smtp") {
      if (!smtpHost.trim()) {
        if (onShowToast) onShowToast("O Host do servidor SMTP é obrigatório.", "warning");
        return;
      }
      if (!smtpUser.trim()) {
        if (onShowToast) onShowToast("O Usuário/E-mail de autenticação SMTP é obrigatório.", "warning");
        return;
      }
    } else {
      if (!resendApiKey.trim() && !serverHasResendKey) {
        if (onShowToast) onShowToast("A chave de API Resend (re_...) é obrigatória para o modo Resend.", "warning");
        return;
      }
    }

    setIsSaving(true);

    const newSettingsPayload: Partial<SystemSettings> = {
      emailProvider,
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort) || 587,
      smtpUser: smtpUser.trim(),
      smtpPassword: smtpPassword.trim(),
      smtpSecure,
      smtpEnabled,
      smtpSenderName: smtpSenderName.trim() || "OST Vendas",
      smtpFromEmail: emailProvider === "resend" ? (resendFromEmail.trim() || "onboarding@resend.dev") : (smtpFromEmail.trim() || smtpUser.trim()),
      smtpTlsIgnoreErrors,
      resendApiKey: resendApiKey.trim(),
      resendFromEmail: resendFromEmail.trim() || "onboarding@resend.dev",
      alertsRecipientEmail: alertsRecipientEmail.trim(),
      emailStockAlertsEnabled: emailAlertsStockEnabled,
      emailAlertsStockEnabled,
      emailAlertsCashShiftEnabled,
      emailAlertsSecurityEnabled,
      emailAlertsLargeSalesEnabled,
      smtpSource: "database",
      smtpLastTestedAt: new Date().toISOString()
    };

    try {
      // 1. Atualiza estado central e banco de dados via serviço React (PostgreSQL / Supabase)
      onUpdateSettings(newSettingsPayload);

      // 2. Persiste diretamente no backend Express (settings.json / Cloud SQL)
      const response = await fetch("/api/settings/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newSettingsPayload,
          smtpLastTestedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar credenciais no servidor backend.");
      }

      setServerSource("database");
      setServerHasStoredPass(Boolean(smtpPassword.trim() || serverHasStoredPass));
      setServerHasResendKey(Boolean(resendApiKey.trim() || serverHasResendKey));

      onAddAuditLog(
        "Configurações de E-mail e SMTP Salvas",
        "SERVIÇO DE E-MAIL",
        `Credenciais guardadas com sucesso. Provedor ativo: ${emailProvider.toUpperCase()} (${emailProvider === 'resend' ? 'Resend Cloud' : `${smtpHost.trim()}:${smtpPort}`}).`
      );

      if (onShowToast) {
        onShowToast(
          "Configurações de envio e alertas por e-mail guardadas com sucesso!",
          "success",
          "Configuração Guardada"
        );
      }
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(err.message || "Erro ao gravar credenciais de e-mail.", "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-black font-sans">
      {/* Top Banner: Informação de Configuração e Status */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-orange-100 text-black rounded-xl shrink-0 mt-0.5">
              <Server className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-black">
                  Central de Envio de E-mails & Servidor SMTP
                </h2>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-black rounded-full text-[11px] font-bold border border-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  Ambiente Protegido
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  emailProvider === "resend" ? "bg-purple-100 text-purple-900 border border-purple-300" : "bg-blue-100 text-blue-900 border border-blue-300"
                }`}>
                  Modo Ativo: {emailProvider === "resend" ? "Resend API" : "SMTP Direto"}
                </span>
              </div>
              <p className="text-xs text-black mt-1 leading-relaxed max-w-3xl">
                Configure os parâmetros de envio de e-mails para despacho de faturas fiscais em PDF, notificações executivas e 
                <strong> alertas automáticos de stock mínimo, fechos de turno e segurança</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={fetchServerSmtpStatus}
              title="Recarregar estado do servidor"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-black rounded-xl border border-slate-300 cursor-pointer transition flex items-center gap-1.5 text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 text-black" />
              Sincronizar
            </button>
          </div>
        </div>

        {/* Status Pills */}
        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black block">Provedor Ativo</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${emailProvider === "resend" ? "bg-purple-600" : "bg-blue-600"}`} />
              <span className="text-xs font-bold text-black">
                {emailProvider === "resend" ? "Resend (API Oficial)" : "SMTP / Nodemailer"}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black block">Endereço do Host</span>
            <div className="flex items-center gap-2 mt-1">
              <Mail className="w-3.5 h-3.5 text-black" />
              <span className="text-xs font-bold text-black truncate">
                {emailProvider === "resend" ? "api.resend.com" : (smtpHost ? `${smtpHost}:${smtpPort}` : "Não definido")}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black block">Autenticação</span>
            <div className="flex items-center gap-2 mt-1">
              <Lock className="w-3.5 h-3.5 text-black" />
              <span className="text-xs font-bold text-black">
                {emailProvider === "resend" 
                  ? (resendApiKey || serverHasResendKey ? "Chave Resend OK ✓" : "Sem Chave")
                  : (smtpPassword || serverHasStoredPass ? "Palavra-passe OK ✓" : "Sem Senha")}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black block">Alertas Automáticos</span>
            <div className="flex items-center gap-2 mt-1">
              <BellRing className="w-3.5 h-3.5 text-black" />
              <span className="text-xs font-bold text-black truncate">
                {alertsRecipientEmail ? alertsRecipientEmail : "Não configurado"}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("smtp")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "smtp" 
                ? "bg-black text-white shadow-xs" 
                : "bg-slate-100 hover:bg-slate-200 text-black border border-slate-300"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Servidor SMTP Direto
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("resend")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "resend" 
                ? "bg-purple-700 text-white shadow-xs" 
                : "bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Biblioteca Resend (API)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "alerts" 
                ? "bg-orange-600 text-white shadow-xs" 
                : "bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-300"
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            Alertas Automáticos por E-mail
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "diagnostics" 
                ? "bg-emerald-700 text-white shadow-xs" 
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Testes & Diagnóstico
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <form onSubmit={handleSaveToDatabase} className="space-y-6">
        {/* TAB 1: SMTP CONFIGURATION */}
        {activeTab === "smtp" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-black flex items-center gap-2">
                      <Key className="w-4 h-4 text-black" />
                      Parâmetros do Servidor SMTP (Nodemailer)
                    </h3>
                    <p className="text-[11px] text-black">
                      Conexão padrão com servidores SMTP via TLS/SSL ou STARTTLS.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpEnabled}
                      onChange={(e) => setSmtpEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                    />
                    <span className="text-xs font-bold text-black">
                      Serviço Ativo
                    </span>
                  </label>
                </div>

                {/* Presets Rápidos */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-black block">
                    Atalhos Rápidos de Provedor
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyPreset("gmail")}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-black" />
                      Gmail / Workspace (587 STARTTLS)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("outlook")}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-black" />
                      Outlook / Office 365 (587)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("cpanel")}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-black" />
                      cPanel / Webmail (465 SSL)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("sendgrid")}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-black" />
                      SendGrid (587)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("resend")}
                      className="px-3 py-1.5 rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 text-purple-700" />
                      Resend Cloud SMTP (465 SSL)
                    </button>
                  </div>
                </div>

                {/* Host & Porta */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      Servidor SMTP (Host) <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <Server className="absolute left-3 top-2.5 w-4 h-4 text-black" />
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="ex: smtp.gmail.com ou mail.suaempresa.co.mz"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      Porta de Conexão <span className="text-red-600">*</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-black focus:outline-none focus:border-orange-500 focus:bg-white"
                      />
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => { setSmtpPort(587); setSmtpSecure(false); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${smtpPort === 587 ? "bg-black text-white" : "bg-slate-200 text-black"}`}
                      >
                        587 (TLS)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSmtpPort(465); setSmtpSecure(true); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${smtpPort === 465 ? "bg-black text-white" : "bg-slate-200 text-black"}`}
                      >
                        465 (SSL)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSmtpPort(2525); setSmtpSecure(false); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${smtpPort === 2525 ? "bg-black text-white" : "bg-slate-200 text-black"}`}
                      >
                        2525
                      </button>
                    </div>
                  </div>
                </div>

                {/* Usuário e Senha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      Utilizador / E-mail de Autenticação <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-black" />
                      <input
                        type="text"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder="ex: faturacao@empresa.co.mz"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      Palavra-passe / Senha de Aplicação <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-black" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={serverHasStoredPass ? "•••••••••••• (Já gravada no sistema)" : "Digite a senha do e-mail"}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-10 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        className="absolute right-3 top-2.5 text-black hover:opacity-70 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Segurança e Criptografia */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[11px] font-bold text-black block">
                    Protocolo de Segurança & Criptografia (TLS / SSL)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${!smtpSecure ? "border-orange-500 bg-orange-50/60" : "border-slate-300 bg-slate-50"}`}>
                      <input
                        type="radio"
                        name="smtpSecurity"
                        checked={!smtpSecure}
                        onChange={() => setSmtpSecure(false)}
                        className="mt-0.5 text-orange-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-black block">STARTTLS / TLS (Porta 587 / 2525)</span>
                        <span className="text-[11px] text-black block mt-0.5">
                          Inicia conexão padrão e atualiza para canal cifrado seguro. Padrão do Gmail e Outlook.
                        </span>
                      </div>
                    </label>

                    <label className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${smtpSecure ? "border-orange-500 bg-orange-50/60" : "border-slate-300 bg-slate-50"}`}>
                      <input
                        type="radio"
                        name="smtpSecurity"
                        checked={smtpSecure}
                        onChange={() => setSmtpSecure(true)}
                        className="mt-0.5 text-orange-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-black block">SSL / TLS Implícito (Porta 465)</span>
                        <span className="text-[11px] text-black block mt-0.5">
                          Conexão encriptada de ponta a ponta desde o início. Comum em cPanel, Hostinger e Resend SMTP.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-black">
                      <input
                        type="checkbox"
                        checked={smtpTlsIgnoreErrors}
                        onChange={(e) => setSmtpTlsIgnoreErrors(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                      />
                      <span>Aceitar certificados auto-assinados (rejectUnauthorized: false)</span>
                    </label>
                  </div>
                </div>

                {/* Remetente Visual */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      Nome do Remetente Exibido aos Clientes
                    </label>
                    <input
                      type="text"
                      value={smtpSenderName}
                      onChange={(e) => setSmtpSenderName(e.target.value)}
                      placeholder="ex: OST Vendas - Faturação"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black block">
                      E-mail de Envio (From Address)
                    </label>
                    <input
                      type="email"
                      value={smtpFromEmail}
                      onChange={(e) => setSmtpFromEmail(e.target.value)}
                      placeholder="ex: noreply@suaempresa.co.mz (opcional)"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Lateral: Guia SMTP */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Info className="w-4 h-4 text-black" />
                  <h3 className="text-xs font-bold text-black uppercase tracking-wider">
                    Guia de Servidores SMTP
                  </h3>
                </div>

                <div className="space-y-2.5 text-xs text-black">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-black block mb-1">Gmail com 2FA</span>
                    <p className="text-[11px] leading-relaxed text-black">
                      1. Abra as definições de segurança da Conta Google.<br />
                      2. Ative a <strong>Verificação em 2 Passos</strong>.<br />
                      3. Em "Palavras-passe de aplicação", gere uma chave de 16 caracteres e cole no campo de palavra-passe.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-black block mb-1">Microsoft Office 365</span>
                    <p className="text-[11px] leading-relaxed text-black">
                      Host: <code>smtp.office365.com</code><br />
                      Porta: <code>587</code> (STARTTLS)<br />
                      Certifique-se de que o "SMTP Authenticated Submission" está habilitado no painel de administração da Microsoft 365.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RESEND LIBRARY CONFIGURATION */}
        {activeTab === "resend" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-purple-200/90 shadow-2xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-100 text-purple-900 rounded-xl">
                      <Flame className="w-5 h-5 text-purple-700" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-black flex items-center gap-2">
                        Integração Nativa com a Biblioteca Resend
                      </h3>
                      <p className="text-[11px] text-black">
                        Envio moderno, ultrarrápido e sem bloqueios de portas SMTP através da API oficial do Resend.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEmailProvider("resend")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                      emailProvider === "resend" ? "bg-purple-700 text-white" : "bg-purple-100 text-purple-900 border border-purple-300"
                    }`}
                  >
                    {emailProvider === "resend" ? "✓ Provedor Ativo" : "Definir como Ativo"}
                  </button>
                </div>

                {/* Resend API Key Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-black block">
                    Resend API Key <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-purple-700" />
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                      placeholder={serverHasResendKey ? "re_•••••••••••••••••••••••• (Chave gravada)" : "re_123456789_abcdef..."}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-10 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      tabIndex={-1}
                      className="absolute right-3 top-2.5 text-black hover:opacity-70 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-black block">
                    Obtenha a sua chave gratuita em <strong>resend.com/api-keys</strong>.
                  </span>
                </div>

                {/* Resend From Email */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-black block">
                    E-mail de Envio Resend (Sender Address) <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-purple-700" />
                    <input
                      type="email"
                      value={resendFromEmail}
                      onChange={(e) => setResendFromEmail(e.target.value)}
                      placeholder="onboarding@resend.dev ou faturas@suaempresa.co.mz"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-black">
                    <Info className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                    <span>
                      Para testes rápidos utilize <code>onboarding@resend.dev</code>. Para produção, configure o seu domínio personalizado no painel do Resend.
                    </span>
                  </div>
                </div>

                {/* Vantagens Resend */}
                <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-purple-700" />
                    Por que escolher a biblioteca Resend?
                  </h4>
                  <ul className="text-xs text-purple-900 space-y-1 list-disc list-inside">
                    <li>Não sofre bloqueios de portas SMTP (25, 465, 587) efetuados por provedores de nuvem ou ISPs.</li>
                    <li>Excelente entregabilidade com suporte a DKIM, SPF e DMARC automáticos.</li>
                    <li>Relatórios e logs de abertura em tempo real no dashboard da Resend.</li>
                    <li>Compatível com e-mails transacionais e alertas automáticos do OST Vendas.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Lateral Guia Resend */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Flame className="w-4 h-4 text-purple-700" />
                  <h3 className="text-xs font-bold text-black uppercase tracking-wider">
                    Como Configurar o Resend
                  </h3>
                </div>

                <ol className="text-xs text-black space-y-2.5 list-decimal list-inside leading-relaxed">
                  <li>Crie uma conta gratuita em <strong>resend.com</strong>.</li>
                  <li>Aceda à seção <strong>API Keys</strong> e crie uma nova chave com permissão de envio (Full Access ou Sending Access).</li>
                  <li>Copie a chave (começa com <code>re_</code>) e cole no formulário ao lado.</li>
                  <li>Clique em <strong>Testar Conexão</strong> na aba de Testes para validar o funcionamento imediatamente.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUTOMATIC ALERTS CONFIGURATION */}
        {activeTab === "alerts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-black flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-orange-600" />
                      Alertas Automáticos por E-mail
                    </h3>
                    <p className="text-[11px] text-black">
                      Defina quem recebe as notificações cruciais do negócio e quais eventos ativam disparos automáticos.
                    </p>
                  </div>
                </div>

                {/* E-mail de Destino Principal de Alertas */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-black block">
                    E-mail do Administrador / Gestor para Receber Alertas <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-black" />
                    <input
                      type="email"
                      value={alertsRecipientEmail}
                      onChange={(e) => setAlertsRecipientEmail(e.target.value)}
                      placeholder="ex: admin@empresa.co.mz ou gestor@gmail.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold text-black placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>
                  <span className="text-[10px] text-black block">
                    Todos os avisos de ruptura de stock e fecho de turno serão remetidos para esta caixa postal.
                  </span>
                </div>

                {/* Switches de Eventos de Alerta */}
                <div className="space-y-3 pt-2">
                  <label className="text-[11px] font-bold text-black uppercase tracking-wider block">
                    Eventos de Disparo Automático
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Alerta de Stock Mínimo */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-black flex items-center gap-1.5">
                          🚨 Stock Crítico / Mínimo
                        </span>
                        <p className="text-[11px] text-black mt-1 leading-snug">
                          Dispara um e-mail imediato ao fechar uma venda quando algum produto atinge ou ultrapassa o limite mínimo.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailAlertsStockEnabled}
                        onChange={(e) => setEmailAlertsStockEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer mt-1"
                      />
                    </div>

                    {/* Alerta de Fecho de Caixa */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-black flex items-center gap-1.5">
                          💼 Fecho de Turno & Caixa
                        </span>
                        <p className="text-[11px] text-black mt-1 leading-snug">
                          Envia o relatório executivo de fecho de turno com detalhamento de receitas em dinheiro e carteiras móveis.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailAlertsCashShiftEnabled}
                        onChange={(e) => setEmailAlertsCashShiftEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer mt-1"
                      />
                    </div>

                    {/* Alerta de Segurança e Auditoria */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-black flex items-center gap-1.5">
                          🛡️ Segurança & Auditoria
                        </span>
                        <p className="text-[11px] text-black mt-1 leading-snug">
                          Notifica imediatamente se houver bloqueios por PIN incorreto, suspensão de operador ou alterações críticas.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailAlertsSecurityEnabled}
                        onChange={(e) => setEmailAlertsSecurityEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer mt-1"
                      />
                    </div>

                    {/* Alerta de Vendas Grandes */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-black flex items-center gap-1.5">
                          💎 Vendas de Elevado Valor
                        </span>
                        <p className="text-[11px] text-black mt-1 leading-snug">
                          Envia notificação sempre que uma fatura acima de 50.000 MT for liquidada no POS.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailAlertsLargeSalesEnabled}
                        onChange={(e) => setEmailAlertsLargeSalesEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Teste Rápido de Alerta */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <BellRing className="w-4 h-4 text-orange-600" />
                  <h3 className="text-xs font-bold text-black uppercase tracking-wider">
                    Simular Disparo de Alerta Real
                  </h3>
                </div>

                <p className="text-xs text-black">
                  Teste o formato e a entrega do alerta na caixa postal do gestor antes de colocar em produção.
                </p>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-black uppercase block">Tipo de Alerta</label>
                  <select
                    value={demoAlertType}
                    onChange={(e: any) => setDemoAlertType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-black focus:outline-none focus:border-orange-500"
                  >
                    <option value="stock">🚨 Alerta de Stock Crítico (Farinha de Trigo)</option>
                    <option value="cash_shift">💼 Relatório de Fecho de Caixa</option>
                    <option value="security">🛡️ Alerta de Tentativa de Acesso Indevido</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleSendDemoAlert}
                    disabled={isSendingDemoAlert}
                    className="w-full py-2.5 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs disabled:opacity-50 mt-2"
                  >
                    {isSendingDemoAlert ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>A Disparar Alerta...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-white" />
                        <span>Disparar Alerta de Demonstração</span>
                      </>
                    )}
                  </button>

                  {lastDemoAlertResult && (
                    <div className={`p-2.5 rounded-xl border text-[11px] font-bold mt-2 ${
                      lastDemoAlertResult.success 
                        ? "bg-emerald-50 text-black border-emerald-300" 
                        : "bg-red-50 text-black border-red-300"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {lastDemoAlertResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                        )}
                        <span>{lastDemoAlertResult.message}</span>
                      </div>
                      {lastDemoAlertResult.timestamp && (
                        <span className="block text-[10px] text-black mt-1 font-mono">
                          Disparado às {lastDemoAlertResult.timestamp}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DIAGNOSTICS & REAL TESTS */}
        {activeTab === "diagnostics" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Teste 1: Handshake */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <Zap className="w-4 h-4 text-black" />
                <h3 className="text-xs font-bold text-black uppercase tracking-wider">
                  1. Validação de Handshake & Conectividade
                </h3>
              </div>
              <p className="text-xs text-black leading-relaxed">
                Testa a comunicação com o provedor (<strong>{emailProvider === "resend" ? "Resend API" : `${smtpHost || 'Host'}:${smtpPort}`}</strong>) sem enviar mensagens.
              </p>

              <button
                type="button"
                onClick={handleVerifyConnection}
                disabled={isVerifying}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>A Testar Conexão...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-white" />
                    <span>Testar Conexão Imediata</span>
                  </>
                )}
              </button>

              {lastVerifyResult && (
                <div className={`p-3 rounded-xl border text-xs font-bold ${
                  lastVerifyResult.success 
                    ? "bg-emerald-50 text-black border-emerald-300" 
                    : "bg-red-50 text-black border-red-300"
                }`}>
                  <div className="flex items-center gap-1.5">
                    {lastVerifyResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    )}
                    <span>{lastVerifyResult.message}</span>
                  </div>
                  {lastVerifyResult.timestamp && (
                    <span className="block text-[10px] text-black mt-1 font-mono">
                      Testado às {lastVerifyResult.timestamp}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Teste 2: Disparo de E-mail Real */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <Send className="w-4 h-4 text-black" />
                <h3 className="text-xs font-bold text-black uppercase tracking-wider">
                  2. Disparo de E-mail de Demonstração
                </h3>
              </div>
              <p className="text-xs text-black leading-relaxed">
                Envia uma mensagem formatada em HTML para o e-mail informado para confirmar a entrega na caixa de entrada.
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-black uppercase block">Destinatário</label>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="ex: seu.email@gmail.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-black focus:outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs disabled:opacity-50"
              >
                {isSendingTest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>A Disparar E-mail...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    <span>Disparar E-mail Real</span>
                  </>
                )}
              </button>

              {lastTestResult && (
                <div className={`p-3 rounded-xl border text-xs font-bold ${
                  lastTestResult.success 
                    ? "bg-emerald-50 text-black border-emerald-300" 
                    : "bg-red-50 text-black border-red-300"
                }`}>
                  <div className="flex items-center gap-1.5">
                    {lastTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    )}
                    <span>{lastTestResult.message}</span>
                  </div>
                  {lastTestResult.timestamp && (
                    <span className="block text-[10px] text-black mt-1 font-mono">
                      Despachado às {lastTestResult.timestamp}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Save Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-black">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>As credenciais são gravadas de forma protegida e persistem no banco de dados.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto px-6 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>A Guardar Definições...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-white" />
                  <span>Salvar Todas as Configurações de E-mail</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
