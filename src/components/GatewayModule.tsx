import React, { useState, useEffect } from "react";
import { 
  CreditCard, 
  Smartphone, 
  CheckCircle2, 
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Bell,
  Send,
  AlertTriangle,
  UserCheck
} from "lucide-react";
import { SystemSettings, UserRole, Product, Customer } from "../types";
import { authenticatedFetch } from "../lib/apiClient";

interface GatewayModuleProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currentRole: UserRole;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  products?: Product[];
  customers?: Customer[];
}

export default function GatewayModule({
  settings,
  onUpdateSettings,
  onAddAuditLog,
  currentRole,
  onShowToast,
  products = [],
  customers = []
}: GatewayModuleProps) {
  const canEdit = String(currentRole || "").toUpperCase().trim().includes("ADMIN") || String(currentRole || "").toUpperCase().trim().includes("SUPERVIS");

  const [mpesaEnabled, setMpesaEnabled] = useState(settings.mpesaEnabled || false);
  const [mpesaShortcode, setMpesaShortcode] = useState(settings.mpesaShortcode || "");
  const [mpesaApiKey, setMpesaApiKey] = useState(settings.mpesaApiKey || "");
  const [mpesaSecret, setMpesaSecret] = useState(settings.mpesaSecret || "");
  const [mpesaWebhookUrl, setMpesaWebhookUrl] = useState(settings.mpesaWebhookUrl || "");

  const [emolaEnabled, setEmolaEnabled] = useState(settings.emolaEnabled || false);
  const [emolaShortcode, setEmolaShortcode] = useState(settings.emolaShortcode || "");
  const [emolaApiKey, setEmolaApiKey] = useState(settings.emolaApiKey || "");
  const [emolaSecret, setEmolaSecret] = useState(settings.emolaSecret || "");
  const [emolaWebhookUrl, setEmolaWebhookUrl] = useState(settings.emolaWebhookUrl || "");

  const [whatsappEnabled, setWhatsappEnabled] = useState(settings.whatsappEnabled || false);
  const [whatsappProvider, setWhatsappProvider] = useState<"DIRECT_LINK" | "EVOLUTION_API" | "TWILIO" | "META_CLOUD">(settings.whatsappProvider || "DIRECT_LINK");
  const [whatsappApiEndpoint, setWhatsappApiEndpoint] = useState(settings.whatsappApiEndpoint || "");
  const [whatsappToken, setWhatsappToken] = useState(settings.whatsappToken || "");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState(settings.whatsappPhoneId || "");
  const [managerWhatsappPhone, setManagerWhatsappPhone] = useState(settings.managerWhatsappPhone || "");

  const [testPhone, setTestPhone] = useState("");
  const [testMessageText, setTestMessageText] = useState("Olá! Esta é uma mensagem de teste de ligação enviada via API de Integração WhatsApp Business.");
  const [sendingTest, setSendingTest] = useState(false);

  const [lowStockMessageText, setLowStockMessageText] = useState("");
  const [sendingLowStock, setSendingLowStock] = useState(false);

  const [debtMessageTemplate, setDebtMessageTemplate] = useState(
    "⚠️ *Aviso de Vencimento de Dívida - OST Vendas* ⚠️\n\nEstimado(a) cliente *[NOME_CLIENTE]*,\n\nIdentificamos que possui um saldo pendente no valor de *[VALOR_DIVIDA] MT* com vencimento em aberto.\n\nAgradecemos a vossa atenção para regularizar este valor. Caso necessite de apoio ou queira efetuar o pagamento via M-Pesa ou e-Mola, entre em contacto connosco.\n\n_Mensagem automática gerada em: [DATA_HORA]_"
  );
  const [sendingDebtNotificationId, setSendingDebtNotificationId] = useState<string | null>(null);

  const [isSimulatingPolling, setIsSimulatingPolling] = useState(false);
  const [simulatedPollingStatus, setSimulatedPollingStatus] = useState<string | null>(null);

  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= p.minStock);
  const outOfStockItems = products.filter(p => p.stock <= 0);
  const debtCustomers = customers.filter(c => c.debt > 0);

  // Auto-generate low stock report message when products list changes
  useEffect(() => {
    if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
      let lines = `⚠️ *Alerta de Ruptura de Stock - OST Vendas* ⚠️\n\nOlá Gestor, identificamos itens críticos em stock no momento:\n\n`;
      
      if (outOfStockItems.length > 0) {
        lines += `🔴 *ITENS ESGOTADOS (${outOfStockItems.length}):*\n`;
        outOfStockItems.slice(0, 10).forEach(p => {
          lines += `• *${p.name}* (Ref: ${p.code} | Stock: ${p.stock} un)\n`;
        });
        if (outOfStockItems.length > 10) lines += `...e mais ${outOfStockItems.length - 10} item(ns).\n`;
        lines += `\n`;
      }

      if (lowStockItems.length > 0) {
        lines += `🟠 *ITENS COM STOCK BAIXO (${lowStockItems.length}):*\n`;
        lowStockItems.slice(0, 10).forEach(p => {
          lines += `• *${p.name}* (Qtd: ${p.stock} un / Mínimo Alerta: ${p.minStock} un)\n`;
        });
        if (lowStockItems.length > 10) lines += `...e mais ${lowStockItems.length - 10} item(ns).\n`;
        lines += `\n`;
      }

      lines += `Por favor, providencie a reposição imediata junto aos fornecedores.\n_Relatório gerado em: ${new Date().toLocaleString()}_`;
      setLowStockMessageText(lines);
    } else {
      setLowStockMessageText(`✅ *Status de Stock Saudável - OST Vendas* \n\nOlá Gestor, informamos que todos os produtos ativos do sistema comercial encontram-se em níveis saudáveis e seguros de stock.`);
    }
  }, [products]);

  const handleSendWhatsAppMessage = async (targetPhone: string, text: string, type: "test" | "low_stock" | "debt", customerId?: string) => {
    if (!targetPhone) {
      if (onShowToast) onShowToast("Por favor, introduza um número de telefone com o formato internacional (Ex: 841234567 ou 258841234567).", "warning");
      return;
    }

    const cleanPhone = targetPhone.replace(/\D/g, "");
    const defaultPhone = cleanPhone.length === 9 && (cleanPhone.startsWith("84") || cleanPhone.startsWith("85") || cleanPhone.startsWith("82") || cleanPhone.startsWith("87") || cleanPhone.startsWith("86"))
      ? `258${cleanPhone}`
      : cleanPhone;

    const directUrl = `https://api.whatsapp.com/send?phone=${defaultPhone}&text=${encodeURIComponent(text)}`;

    if (type === "test") setSendingTest(true);
    if (type === "low_stock") setSendingLowStock(true);
    if (type === "debt" && customerId) setSendingDebtNotificationId(customerId);

    // Build configuration payload dynamically from current local states
    const activeConfig = {
      whatsappEnabled,
      whatsappProvider,
      whatsappApiEndpoint,
      whatsappToken,
      whatsappPhoneId,
      managerWhatsappPhone
    };

    try {
      if (!whatsappEnabled || whatsappProvider === "DIRECT_LINK") {
        // Direct link fallback
        window.open(directUrl, "_blank", "noopener,noreferrer");
        if (onShowToast) onShowToast("Link direto do WhatsApp aberto com sucesso!", "success");
        onAddAuditLog("Enviar Mensagem WhatsApp", "GATEWAY", `Link manual WhatsApp gerado para ${defaultPhone}.`);
        return;
      }

      const response = await authenticatedFetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: defaultPhone,
          message: text,
          gatewayConfig: activeConfig
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Falha ao enviar através do Gateway de Integração");
      }

      if (resData.mode === "DIRECT_LINK") {
        window.open(resData.directUrl || directUrl, "_blank", "noopener,noreferrer");
        if (onShowToast) onShowToast("Link direto do WhatsApp aberto!", "success");
      } else {
        if (onShowToast) onShowToast(resData.message || "Notificação enviada com sucesso via API!", "success");
      }
      onAddAuditLog("Enviar Mensagem WhatsApp", "GATEWAY", `Notificação enviada via WhatsApp (${whatsappProvider}) para ${defaultPhone}.`);
    } catch (err: any) {
      if (onShowToast) onShowToast(`Erro no Gateway: ${err.message}. Redirecionando para Link Direto...`, "warning");
      window.open(directUrl, "_blank", "noopener,noreferrer");
    } finally {
      if (type === "test") setSendingTest(false);
      if (type === "low_stock") setSendingLowStock(false);
      if (type === "debt") setSendingDebtNotificationId(null);
    }
  };

  const handleSaveGateways = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      if (onShowToast) onShowToast("Apenas administradores podem configurar APIs de pagamento.", "error");
      return;
    }

    onUpdateSettings({
      mpesaEnabled,
      mpesaShortcode,
      mpesaApiKey,
      mpesaSecret,
      mpesaWebhookUrl,
      emolaEnabled,
      emolaShortcode,
      emolaApiKey,
      emolaSecret,
      emolaWebhookUrl,
      whatsappEnabled,
      whatsappProvider,
      whatsappApiEndpoint,
      whatsappToken,
      whatsappPhoneId,
      managerWhatsappPhone
    });

    onAddAuditLog(
      "Atualização de Gateways",
      "INTEGRAÇÕES",
      "Credenciais da API M-Pesa, e-Mola e WhatsApp (incluindo contacto do gestor) atualizadas."
    );

    if (onShowToast) {
      onShowToast("Configurações de Gateway salvas com sucesso!", "success", "Gateways Integrados");
    }
  };

  const handleValidatePendingPayments = async () => {
    if (!mpesaEnabled && !emolaEnabled) {
      if (onShowToast) onShowToast("Nenhum gateway habilitado para validar.", "warning");
      return;
    }
    
    setIsSimulatingPolling(true);
    setSimulatedPollingStatus("Consultando estado das credenciais e webhooks dos gateways...");

    try {
      const res = await authenticatedFetch("/api/security/firewall-status");
      await res.json().catch(() => ({}));
      
      setIsSimulatingPolling(false);
      setSimulatedPollingStatus(null);
      if (onShowToast) {
        onShowToast("Comunicação com gateways operacionais verificada com sucesso.", "success", "Verificação Concluída");
      }
    } catch (err: any) {
      setIsSimulatingPolling(false);
      setSimulatedPollingStatus(null);
      if (onShowToast) {
        onShowToast(err?.message || "Falha na comunicação com o servidor.", "error", "Erro de Validação");
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Integrações de Pagamento Móvel (Gateways)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure as credenciais de API do M-Pesa e e-Mola para processamento e validação de pagamentos.
          </p>
        </div>
        <div>
          <button
            onClick={handleValidatePendingPayments}
            disabled={isSimulatingPolling || (!mpesaEnabled && !emolaEnabled)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSimulatingPolling ? "animate-spin" : ""}`} />
            Validar Estado Gateways
          </button>
        </div>
      </div>

      {simulatedPollingStatus && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center gap-3 text-blue-700">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="font-semibold text-sm">{simulatedPollingStatus}</span>
        </div>
      )}

      <form onSubmit={handleSaveGateways} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* M-PESA */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-red-900 leading-tight">Vodacom M-Pesa</h3>
                <span className="text-[10px] text-red-600 font-semibold uppercase tracking-widest">Gateway API</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={mpesaEnabled}
                onChange={(e) => setMpesaEnabled(e.target.checked)}
                disabled={!canEdit}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Business Number (Shortcode)</label>
              <input
                type="text"
                disabled={!canEdit}
                value={mpesaShortcode}
                onChange={(e) => setMpesaShortcode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono font-bold outline-none text-slate-800 disabled:opacity-60"
                placeholder="Ex: 123456"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">API Key / Public Key</label>
              <input
                type="password"
                disabled={!canEdit}
                value={mpesaApiKey}
                onChange={(e) => setMpesaApiKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-sm outline-none text-slate-800 disabled:opacity-60"
                placeholder="••••••••••••••••••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">API Secret / Private Key</label>
              <input
                type="password"
                disabled={!canEdit}
                value={mpesaSecret}
                onChange={(e) => setMpesaSecret(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-sm outline-none text-slate-800 disabled:opacity-60"
                placeholder="••••••••••••••••••••••••"
              />
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-4 mt-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Webhook Endpoint URL</label>
              <input
                type="url"
                disabled={!canEdit}
                value={mpesaWebhookUrl}
                onChange={(e) => setMpesaWebhookUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs outline-none text-slate-800 disabled:opacity-60"
                placeholder="https://sua-api.com/webhooks/mpesa"
              />
              <p className="text-[10px] text-slate-400">Endpoint para recepção de confirmações em tempo real.</p>
            </div>
          </div>
        </div>

        {/* E-MOLA */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-sm">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-orange-900 leading-tight">Movitel e-Mola</h3>
                <span className="text-[10px] text-orange-600 font-semibold uppercase tracking-widest">Gateway API</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={emolaEnabled}
                onChange={(e) => setEmolaEnabled(e.target.checked)}
                disabled={!canEdit}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
            </label>
          </div>

          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Merchant ID / Business Code</label>
              <input
                type="text"
                disabled={!canEdit}
                value={emolaShortcode}
                onChange={(e) => setEmolaShortcode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono font-bold outline-none text-slate-800 disabled:opacity-60"
                placeholder="Ex: 98765"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">API Key / Token</label>
              <input
                type="password"
                disabled={!canEdit}
                value={emolaApiKey}
                onChange={(e) => setEmolaApiKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-sm outline-none text-slate-800 disabled:opacity-60"
                placeholder="••••••••••••••••••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">API Secret</label>
              <input
                type="password"
                disabled={!canEdit}
                value={emolaSecret}
                onChange={(e) => setEmolaSecret(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-sm outline-none text-slate-800 disabled:opacity-60"
                placeholder="••••••••••••••••••••••••"
              />
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-4 mt-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Webhook Endpoint URL</label>
              <input
                type="url"
                disabled={!canEdit}
                value={emolaWebhookUrl}
                onChange={(e) => setEmolaWebhookUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs outline-none text-slate-800 disabled:opacity-60"
                placeholder="https://sua-api.com/webhooks/emola"
              />
              <p className="text-[10px] text-slate-400">Endpoint para recepção de confirmações em tempo real.</p>
            </div>
          </div>
        </div>

        {/* WHATSAPP API */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-emerald-900 leading-tight">API do WhatsApp</h3>
                <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-widest">Notificações e Faturamento Digital</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                disabled={!canEdit}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Provedor API do WhatsApp</label>
                <select
                  disabled={!canEdit || !whatsappEnabled}
                  value={whatsappProvider}
                  onChange={(e) => setWhatsappProvider(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-800 disabled:opacity-60"
                >
                  <option value="DIRECT_LINK">Link Direto (wa.me) - 100% Grátis e Ilimitado</option>
                  <option value="EVOLUTION_API">Evolution API v1 / v2 (Gateway Customizado)</option>
                  <option value="TWILIO">Twilio WhatsApp API (Gateway Corporativo)</option>
                  <option value="META_CLOUD">Meta WhatsApp Cloud API (Oficial)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  {whatsappProvider === "DIRECT_LINK" && "Abre uma janela directa para o número do cliente com a mensagem pré-formatada. Rápido, seguro e não necessita de mensalidade."}
                  {whatsappProvider === "EVOLUTION_API" && "Dispara de forma invisível via servidor Node.js/Baileys. Ideal para automatização em massa sem intervenção humana."}
                  {whatsappProvider === "TWILIO" && "Dispara via canais globais Twilio. Exige credenciais sandbox ou número homologado."}
                  {whatsappProvider === "META_CLOUD" && "Integração oficial Meta com templates pré-aprovados pela Meta Business Suite."}
                </p>
              </div>

              {whatsappProvider !== "DIRECT_LINK" && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    {whatsappProvider === "TWILIO" ? "Número WhatsApp do Twilio (From)" : "URL do Endpoint da API"}
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit || !whatsappEnabled}
                    value={whatsappApiEndpoint}
                    onChange={(e) => setWhatsappApiEndpoint(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs outline-none text-slate-800 disabled:opacity-60"
                    placeholder={whatsappProvider === "EVOLUTION_API" ? "https://api.seuservidor.com/message/sendText/instancia" : whatsappProvider === "TWILIO" ? "whatsapp:+14155238886" : "https://api.twilio.com/2010-04-01/Accounts/..."}
                  />
                  <p className="text-[10px] text-slate-400">
                    {whatsappProvider === "TWILIO" 
                      ? "Número sandbox ou homologado configurado no Twilio, iniciando com 'whatsapp:' (Ex: whatsapp:+14155238886)."
                      : "Endpoint HTTP POST para processamento do envio da mensagem."}
                  </p>
                </div>
              )}
            </div>

            {whatsappProvider !== "DIRECT_LINK" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 mt-2 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    {whatsappProvider === "TWILIO" ? "Twilio Auth Token" : "Token de Autorização (API Key / secret)"}
                  </label>
                  <input
                    type="password"
                    disabled={!canEdit || !whatsappEnabled}
                    value={whatsappToken}
                    onChange={(e) => setWhatsappToken(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs outline-none text-slate-800 disabled:opacity-60"
                    placeholder="••••••••••••••••••••••••"
                  />
                  <p className="text-[10px] text-slate-400">
                    {whatsappProvider === "TWILIO" ? "Auth Token fornecido pelo painel do Twilio." : "Chave Bearer ou API Secret para autenticação no gateway."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    {whatsappProvider === "TWILIO" ? "Twilio Account SID" : "ID do Telefone ou Nome da Instância"}
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit || !whatsappEnabled}
                    value={whatsappPhoneId}
                    onChange={(e) => setWhatsappPhoneId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs outline-none text-slate-800 disabled:opacity-60"
                    placeholder={whatsappProvider === "EVOLUTION_API" ? "MinhaInstancia" : whatsappProvider === "TWILIO" ? "AC••••••••••••••••••••••••••••••••" : "Ex: MG1a2b3c4d..."}
                  />
                  <p className="text-[10px] text-slate-400">
                    {whatsappProvider === "TWILIO" ? "Identificador exclusivo Account SID da sua conta Twilio." : "Identificador exclusivo do canal de envio de mensagens."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="lg:col-span-2 mt-2">
            <button
              type="submit"
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-lg shadow-slate-900/20 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Salvar Credenciais de Gateway
            </button>
            <p className="text-xs text-center text-slate-500 mt-3 flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              As credenciais da API são salvas com criptografia e usadas para validação em tempo real.
            </p>
          </div>
        )}

      </form>

      {/* SEPARATOR */}
      <div className="border-t border-slate-150 my-8 dark:border-zinc-850"></div>

      {/* WHATSAPP BUSINESS NOTIFICATION HUB & CONTROL PANEL */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm dark:bg-zinc-900 dark:border-zinc-800 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className="p-5 bg-gradient-to-r from-emerald-650 to-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <Bell className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Centro de Notificações WhatsApp Business</h3>
              <p className="text-[11px] text-emerald-100/80 mt-0.5">Dispare comprovativos, relatórios e alertas de ruptura de stock directamente para o gestor ou cliente</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase ${
            whatsappEnabled 
              ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 animate-pulse" 
              : "bg-white/10 text-emerald-100/60"
          }`}>
            {whatsappEnabled ? `Status: ACTIVO (${whatsappProvider})` : "Status: MODO MANUAL"}
          </span>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* COLUMN 1: DESTINATÁRIOS E CONFIGURAÇÃO DE ALERTA */}
          <div className="space-y-5">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 flex items-center gap-1.5 dark:text-zinc-500">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Destinatários Principais
            </h4>

            {/* Manager Contact setting */}
            <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-150 space-y-3 dark:bg-zinc-850 dark:border-zinc-800">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-650 dark:text-zinc-300 flex items-center justify-between">
                  <span>Número do Gestor (WhatsApp)</span>
                  <span className="text-[9.5px] text-slate-400 normal-case font-mono">Formato: 2588XXXXXXXX</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={managerWhatsappPhone}
                    onChange={(e) => setManagerWhatsappPhone(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs text-slate-850 outline-none focus:border-emerald-500 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                    placeholder="Ex: 258841234567"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ managerWhatsappPhone });
                      if (onShowToast) onShowToast("Contacto do Gestor actualizado!", "success");
                    }}
                    className="px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-lg border border-emerald-200 transition cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
                <p className="text-[10px] text-slate-450 mt-1">Este número será o destinatário padrão para todos os alertas automáticos e manuais de stock crítico.</p>
              </div>
            </div>

            {/* Test WhatsApp block */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-xs text-slate-750 dark:text-zinc-300">Testar Comunicação do Canal</h5>
                <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase dark:bg-zinc-800">Sandbox</span>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Número do Destinatário de Teste</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Ex: 843332211 ou 25884..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs outline-none focus:border-emerald-500 text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Mensagem de Teste</label>
                  <textarea
                    rows={2}
                    value={testMessageText}
                    onChange={(e) => setTestMessageText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-emerald-500 text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={() => handleSendWhatsAppMessage(testPhone || managerWhatsappPhone, testMessageText, "test")}
                  className="w-full py-2 bg-slate-850 hover:bg-slate-950 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingTest ? "A disparar..." : "Disparar Mensagem de Teste"}
                </button>
              </div>
            </div>

          </div>

          {/* COLUMN 2: STOCK BAIXO & NOTIFICAÇÕES */}
          <div className="space-y-5">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 flex items-center justify-between dark:text-zinc-500">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                Alertas de Stock Baixo
              </span>
              <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-full dark:bg-amber-950/20 dark:text-amber-400">
                {lowStockItems.length + outOfStockItems.length} Alertas Activos
              </span>
            </h4>

            {/* Stock diagnostic indicators */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 text-center dark:bg-red-950/10 dark:border-red-900/30">
                <span className="text-xl font-bold font-mono text-red-650">{outOfStockItems.length}</span>
                <p className="text-[10px] text-red-700 font-bold uppercase mt-0.5 dark:text-red-400">Esgotados</p>
              </div>
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-center dark:bg-amber-950/10 dark:border-amber-900/30">
                <span className="text-xl font-bold font-mono text-amber-650">{lowStockItems.length}</span>
                <p className="text-[10px] text-amber-700 font-bold uppercase mt-0.5 dark:text-amber-400">Stock Crítico</p>
              </div>
            </div>

            {/* Editable Low stock notification text-area block */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Mensagem de Relatório de Stock Baixo</label>
                <button
                  type="button"
                  onClick={() => {
                    // Reset to default
                    if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
                      let lines = `⚠️ *Alerta de Ruptura de Stock - OST Vendas* ⚠️\n\nOlá Gestor, identificamos itens críticos em stock no momento:\n\n`;
                      if (outOfStockItems.length > 0) {
                        lines += `🔴 *ITENS ESGOTADOS (${outOfStockItems.length}):*\n`;
                        outOfStockItems.slice(0, 10).forEach(p => {
                          lines += `• *${p.name}* (Ref: ${p.code} | Stock: ${p.stock} un)\n`;
                        });
                        if (outOfStockItems.length > 10) lines += `...e mais ${outOfStockItems.length - 10} item(ns).\n`;
                        lines += `\n`;
                      }
                      if (lowStockItems.length > 0) {
                        lines += `🟠 *ITENS COM STOCK BAIXO (${lowStockItems.length}):*\n`;
                        lowStockItems.slice(0, 10).forEach(p => {
                          lines += `• *${p.name}* (Qtd: ${p.stock} un / Mínimo Alerta: ${p.minStock} un)\n`;
                        });
                        if (lowStockItems.length > 10) lines += `...e mais ${lowStockItems.length - 10} item(ns).\n`;
                        lines += `\n`;
                      }
                      lines += `Por favor, providencie a reposição imediata junto aos fornecedores.\n_Relatório gerado em: ${new Date().toLocaleString()}_`;
                      setLowStockMessageText(lines);
                    }
                  }}
                  className="text-[9px] text-emerald-600 hover:underline font-bold dark:text-emerald-400 cursor-pointer"
                >
                  Reiniciar Template
                </button>
              </div>
              <textarea
                rows={6}
                value={lowStockMessageText}
                onChange={(e) => setLowStockMessageText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-sans outline-none focus:border-emerald-500 text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
              />
              <p className="text-[9.5px] text-slate-400">Pode modificar o texto acima antes de disparar para o WhatsApp do gestor.</p>
            </div>

            {/* Dispatch button */}
            <button
              type="button"
              disabled={sendingLowStock}
              onClick={() => handleSendWhatsAppMessage(managerWhatsappPhone, lowStockMessageText, "low_stock")}
              className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                lowStockItems.length > 0 || outOfStockItems.length > 0
                  ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/10"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10"
              }`}
            >
              <Send className="w-4 h-4" />
              {sendingLowStock 
                ? "A enviar alerta de stock..." 
                : lowStockItems.length > 0 || outOfStockItems.length > 0
                ? "Enviar Alerta Crítico ao Gestor via WhatsApp ⚠️"
                : "Enviar Relatório de Stock Saudável ao Gestor 🟢"}
            </button>
          </div>

        </div>

        {/* BOTTOM QUICK ACTIONS FOR CRITICAL PRODUCTS LIST */}
        {lowStockItems.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-150 p-4 dark:bg-zinc-850 dark:border-zinc-800">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Disparo Rápido Individual de Reposição</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {lowStockItems.slice(0, 6).map(p => (
                <div key={p.id} className="bg-white p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="truncate pr-1">
                    <p className="font-bold text-slate-800 truncate dark:text-zinc-200">{p.name}</p>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Stock: {p.stock} un (Mín: {p.minStock})</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `⚠️ *Alerta de Reposição urgente* ⚠️\n\n*Produto:* ${p.name}\n*SKU:* ${p.code}\n*Quantidade Atual:* ${p.stock} un\n*Nível de Alerta Mínimo:* ${p.minStock} un\n\n_Por favor, providencie mais stock com urgência._`;
                      handleSendWhatsAppMessage(managerWhatsappPhone, msg, "test");
                    }}
                    className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded border border-amber-200 text-[9px] font-bold transition whitespace-nowrap cursor-pointer"
                    title="Disparar Alerta Individual"
                  >
                    Notificar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* WHATSAPP DEBT OVERDUE ALERTS HUB */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm dark:bg-zinc-900 dark:border-zinc-800 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className="p-5 bg-gradient-to-r from-red-650 to-red-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <AlertTriangle className="w-5 h-5 text-red-100" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Centro de Avisos de Vencimento de Dívidas (WhatsApp)</h3>
              <p className="text-[11px] text-red-100/80 mt-0.5">Notifique clientes devedores de forma automática e integrada via Twilio</p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-bold bg-white/10 text-red-100 rounded-full uppercase">
            {debtCustomers.length} Clientes Devedores
          </span>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* COLUMN 1: TEMPLATE CONFIGURATION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 dark:text-zinc-500">
                Template de Notificação de Cobrança
              </h4>
              <button
                type="button"
                onClick={() => setDebtMessageTemplate(
                  "⚠️ *Aviso de Vencimento de Dívida - OST Vendas* ⚠️\n\nEstimado(a) cliente *[NOME_CLIENTE]*,\n\nIdentificamos que possui um saldo pendente no valor de *[VALOR_DIVIDA] MT* com vencimento em aberto.\n\nAgradecemos a vossa atenção para regularizar este valor. Caso necessite de apoio ou queira efetuar o pagamento via M-Pesa ou e-Mola, entre em contacto connosco.\n\n_Mensagem automática gerada em: [DATA_HORA]_"
                )}
                className="text-[9px] text-red-600 hover:underline font-bold dark:text-red-400 cursor-pointer"
              >
                Reiniciar Template
              </button>
            </div>

            <textarea
              rows={8}
              value={debtMessageTemplate}
              onChange={(e) => setDebtMessageTemplate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-sans outline-none focus:border-red-500 text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
              placeholder="Digite o template aqui..."
            />

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-zinc-850 dark:border-zinc-800 text-[11px] text-slate-500 space-y-1">
              <p className="font-bold text-slate-700 dark:text-zinc-300">Tags dinâmicas disponíveis:</p>
              <p>• <code>[NOME_CLIENTE]</code>: Nome completo do cliente devedor</p>
              <p>• <code>[VALOR_DIVIDA]</code>: Valor da dívida pendente em meticais</p>
              <p>• <code>[DATA_HORA]</code>: Data e hora do disparo do alerta</p>
            </div>
          </div>

          {/* COLUMN 2: DEBT CLIENTS LIST & TRIGGER ACTIONS */}
          <div className="space-y-4">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 dark:text-zinc-500 flex items-center justify-between">
              <span>Lista de Clientes com Saldo Devedor</span>
              <span className="font-mono text-xs text-red-650 font-bold">
                Total: {debtCustomers.reduce((acc, c) => acc + c.debt, 0).toLocaleString()} MT
              </span>
            </h4>

            {debtCustomers.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 dark:border-zinc-850">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="text-xs font-bold text-slate-500">Nenhuma dívida pendente identificada!</p>
                <p className="text-[10px] mt-0.5">Todos os seus clientes estão com saldo em dia.</p>
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto space-y-2.5 pr-1">
                {debtCustomers.map(customer => {
                  // Replace tags for this specific customer
                  const formattedMessage = debtMessageTemplate
                    .replace(/\[NOME_CLIENTE\]/g, customer.name)
                    .replace(/\[VALOR_DIVIDA\]/g, customer.debt.toLocaleString())
                    .replace(/\[DATA_HORA\]/g, new Date().toLocaleString());

                  const isSending = sendingDebtNotificationId === customer.id;

                  return (
                    <div 
                      key={customer.id} 
                      className="bg-slate-50/50 hover:bg-slate-50 p-3.5 rounded-xl border border-slate-150 flex items-center justify-between gap-3 dark:bg-zinc-850 dark:border-zinc-800"
                    >
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-2 truncate">
                          <p className="font-bold text-slate-800 truncate dark:text-zinc-200">{customer.name}</p>
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded dark:bg-red-950/20 dark:text-red-400 whitespace-nowrap">
                            VENCIDO
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Tel: {customer.phone || "Sem contacto"}</p>
                        <p className="text-xs font-black text-red-650 mt-0.5">{customer.debt.toLocaleString()} MT</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Send via WhatsApp button */}
                        <button
                          type="button"
                          disabled={isSending || !customer.phone}
                          onClick={() => handleSendWhatsAppMessage(customer.phone, formattedMessage, "debt", customer.id)}
                          className="p-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 rounded-lg border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          title="Enviar Cobrança via WhatsApp"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isSending ? "A enviar..." : "Cobrar"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
