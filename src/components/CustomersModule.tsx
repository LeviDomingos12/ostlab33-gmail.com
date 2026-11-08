import React, { useState, useMemo, memo } from "react";
import { 
  Users, 
  Plus, 
  Trash2, 
  Search, 
  Star, 
  Smartphone, 
  Award, 
  AlertCircle, 
  Sparkles, 
  Send,
  CheckCircle2,
  DollarSign,
  ShoppingBag,
  Receipt,
  Printer,
  Eye,
  X,
  Target,
  MessageSquare,
  Gift,
  Check,
  Edit2
} from "lucide-react";
import { sendEmail } from "../lib/gmail";
import { Customer, UserRole, Transaction, SystemSettings } from "../types";
import { authenticatedFetch } from "../lib/apiClient";
import { useConfirm } from "../hooks/useConfirm";
import { printInvoiceHTML } from "../lib/printHelper";
import { generateEntityId, generateReceiptNumber } from "../lib/deterministic";

interface CustomersModuleProps {
  customers: Customer[];
  transactions?: Transaction[];
  settings?: SystemSettings;
  onAddCustomer: (c: Customer) => void;
  onUpdateCustomer?: (c: Customer) => void;
  onAddCashFlowEntry?: (entry: any) => void;
  onDeleteCustomer: (cId: string) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currentRole: UserRole;
  currency: string;
  activeUsername?: string;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
}

function CustomersModule({
  customers,
  transactions = [],
  settings,
  onAddCustomer,
  onUpdateCustomer,
  onAddCashFlowEntry,
  onDeleteCustomer,
  onAddAuditLog,
  currentRole,
  currency,
  activeUsername,
  onShowToast
}: CustomersModuleProps) {
  const confirm = useConfirm();
  
  // Local states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "VIP" | "DEBT" | "INACTIVE">("ALL");

  // Sub-tabs navigation inside Customer Module
  const [activeSubTab, setActiveSubTab] = useState<"list" | "register" | "history" | "debts" | "purchases" | "campaigns">("list");

  // Customer Purchase History States
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState<Customer | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Debt Settlement Modal States
  const [settleDebtCustomer, setSettleDebtCustomer] = useState<Customer | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<number | "">("");
  const [isSettling, setIsSettling] = useState(false);

  // Customer Creator
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [nuit, setNuit] = useState("");
  const [creditLimit, setCreditLimit] = useState<number | "">("");
  const [localError, setLocalError] = useState("");

  // Customer Editor States
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNuit, setEditNuit] = useState("");
  const [editCreditLimit, setEditCreditLimit] = useState<number | "">("");

  // SMS Marketing & Loyalty Campaigns states
  const [showSmsPanel, setShowSmsPanel] = useState(false);
  const [campaignTarget, setCampaignTarget] = useState<
    "ALL" | "VIP" | "DEBT" | "INACTIVE" | "LOYALTY_REDEEMABLE" | "LOYALTY_HIGH" | "LOYALTY_MEDIUM" | "LOYALTY_LOW" | "LOYALTY_CUSTOM"
  >("LOYALTY_REDEEMABLE");
  const [customMinPoints, setCustomMinPoints] = useState<number>(10);
  const [customMaxPoints, setCustomMaxPoints] = useState<number>(500);
  const [customSmsPrompt, setCustomSmsPrompt] = useState("");
  const [smsOptions, setSmsOptions] = useState<string[]>([]);
  const [selectedSms, setSelectedSms] = useState<string>(
    "Estimado(a) {NOME}, voce tem {PONTOS} pontos acumulados na {EMPRESA}! Troque o seu saldo por descontos no valor de {VALOR_RESGATE} na sua proxima compra. Visite-nos!"
  );
  const [isGeneratingSms, setIsGeneratingSms] = useState(false);
  const [smsDispatchStatus, setSmsDispatchStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [dispatchCount, setDispatchCount] = useState(0);
  const [previewCustomerId, setPreviewCustomerId] = useState<string>("");

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // 1. Search text
      const matchSearch = 
        (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.phone || "").includes(searchQuery) || 
        (c.nuit && c.nuit.includes(searchQuery));
      // 2. Advanced filters
      let matchFilter = true;
      if (filterType === "VIP") {
        matchFilter = c.purchaseCount >= 10;
      } else if (filterType === "DEBT") {
        matchFilter = c.debt > 0;
      } else if (filterType === "INACTIVE") {
        matchFilter = c.purchaseCount <= 4;
      }

      return matchSearch && matchFilter;
    });
  }, [customers, searchQuery, filterType]);

  // Target customers matching Loyalty Points criteria
  const matchingTargetCustomers = useMemo(() => {
    return customers.filter(c => {
      const pts = c.loyaltyPoints || 0;
      if (campaignTarget === "ALL") return true;
      if (campaignTarget === "VIP") return c.purchaseCount >= 10;
      if (campaignTarget === "DEBT") return c.debt > 0;
      if (campaignTarget === "INACTIVE") return c.purchaseCount <= 4;
      if (campaignTarget === "LOYALTY_REDEEMABLE") return pts > 0;
      if (campaignTarget === "LOYALTY_HIGH") return pts >= 50;
      if (campaignTarget === "LOYALTY_MEDIUM") return pts >= 10 && pts < 50;
      if (campaignTarget === "LOYALTY_LOW") return pts < 10;
      if (campaignTarget === "LOYALTY_CUSTOM") return pts >= customMinPoints && pts <= customMaxPoints;
      return true;
    });
  }, [customers, campaignTarget, customMinPoints, customMaxPoints]);

  const campaignStats = useMemo(() => {
    const totalRecipients = matchingTargetCustomers.length;
    const totalPoints = matchingTargetCustomers.reduce((acc, c) => acc + (c.loyaltyPoints || 0), 0);
    const avgPoints = totalRecipients > 0 ? Math.round(totalPoints / totalRecipients) : 0;
    const totalRedeemableMT = totalPoints * 100;
    return { totalRecipients, totalPoints, avgPoints, totalRedeemableMT };
  }, [matchingTargetCustomers]);

  const previewCustomer = useMemo(() => {
    if (previewCustomerId) {
      const match = matchingTargetCustomers.find(c => c.id === previewCustomerId);
      if (match) return match;
    }
    return matchingTargetCustomers[0] || customers[0] || null;
  }, [matchingTargetCustomers, previewCustomerId, customers]);

  // Filter transactions for selected customer purchase history
  const selectedCustomerTransactions = useMemo(() => {
    if (!selectedCustomerHistory) return [];
    const cust = selectedCustomerHistory;
    
    // Filter matching customer ID, phone, or name
    const list = (transactions || []).filter(tx => {
      if (tx.customerId && tx.customerId === cust.id) return true;
      if (cust.phone && tx.customerPhone && tx.customerPhone.replace(/\s+/g, '').includes(cust.phone.replace(/\s+/g, ''))) return true;
      if (cust.name && tx.customerName && tx.customerName.toLowerCase().trim() === cust.name.toLowerCase().trim()) return true;
      return false;
    });

    if (!historySearchQuery.trim()) {
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const q = historySearchQuery.toLowerCase();
    return list.filter(tx => 
      (tx.invoiceNumber && tx.invoiceNumber.toLowerCase().includes(q)) ||
      (tx.cashierName && tx.cashierName.toLowerCase().includes(q)) ||
      (tx.paymentMethod && tx.paymentMethod.toLowerCase().includes(q)) ||
      (tx.items && tx.items.some(i => i.productName && i.productName.toLowerCase().includes(q)))
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, selectedCustomerHistory, historySearchQuery]);

  // Handle customer registration
  const handleSubmitCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setLocalError("Por favor, preencha os campos obrigatórios (Nome e Telefone).");
      return;
    }
    setLocalError("");

    const payload: Customer = {
      id: generateEntityId("cust"),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || "",
      address: address.trim() || "Indisponível",
      nuit: nuit.trim() || "",
      creditLimit: Number(creditLimit) || 0,
      totalSpent: 0,
      purchaseCount: 0,
      debt: 0,
      loyaltyPoints: 0,
      preferredPaymentMethod: "CASH",
      oneClickCheckoutEnabled: false
    };

    onAddCustomer(payload);
    onAddAuditLog(
      "Cadastrar Cliente",
      "CLIENTES",
      `Novo cliente '${payload.name}' cadastrado por ${currentRole}. Telefone: ${payload.phone}`
    );

    if (onShowToast) {
      onShowToast(`Cliente ${payload.name} cadastrado com sucesso!`, "success", "Cadastro Concluído");
    }

    setActiveSubTab("list");
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNuit("");
    setCreditLimit("");
  };

  const handleOpenEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setEditName(c.name || "");
    setEditPhone(c.phone || "");
    setEditEmail(c.email || "");
    setEditAddress(c.address || "");
    setEditNuit(c.nuit || "");
    setEditCreditLimit((c as any).creditLimit || 0);
  };

  const handleSaveEditCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !onUpdateCustomer) return;
    if (!editName.trim() || !editPhone.trim()) {
      if (onShowToast) onShowToast("Por favor, preencha os campos obrigatórios (Nome e Contacto).", "error");
      return;
    }

    const updatedCustomer: Customer = {
      ...editingCustomer,
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      address: editAddress.trim() || "Indisponível",
      nuit: editNuit.trim(),
      creditLimit: Number(editCreditLimit) || 0
    };

    onUpdateCustomer(updatedCustomer);
    onAddAuditLog(
      "Atualizar Cliente",
      "CLIENTES",
      `Dados cadastrais do cliente '${updatedCustomer.name}' atualizados por ${currentRole}.`
    );

    if (onShowToast) {
      onShowToast(`Cliente '${updatedCustomer.name}' atualizado com sucesso!`, "success", "Atualização Concluída");
    }

    setEditingCustomer(null);
  };

  // Delete Customer
  const handleDeleteCustomerClick = async (customerId: string) => {
    const cli = customers.find(c => c.id === customerId);
    if (!cli) return;

    if (cli.debt > 0 && currentRole === "CASHIER") {
      if (onShowToast) onShowToast(`Operadores não têm permissão para apagar clientes com dívidas ativas. Contate um Administrador.`, "error", "Bloqueio de Segurança");
      return;
    }

    const isConfirmed = await confirm({
      title: "Você tem certeza?",
      message: `Deseja realmente apagar permanentemente o cliente "${cli.name}"? Todos os acúmulos de pontos e histórico serão excluídos do sistema de forma definitiva e irreversível.`,
      confirmText: "Sim, Excluir",
      cancelText: "Não, Cancelar",
      type: "danger"
    });

    if (isConfirmed) {
      onDeleteCustomer(customerId);
      onAddAuditLog("Excluir Cliente", "CLIENTES", `Cadastro de '${cli.name}' excluído do sistema por ${currentRole}.`);
    }
  };

  // Debt Settlement
  const handleSettleDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleDebtCustomer || !settlementAmount || !onUpdateCustomer || !onAddCashFlowEntry) return;
    
    const amountToPay = Number(settlementAmount);
    if (amountToPay <= 0) {
      if (onShowToast) onShowToast("O valor a ser liquidado deve ser maior que zero.", "error");
      return;
    }

    if (amountToPay > settleDebtCustomer.debt) {
      if (onShowToast) onShowToast(`O valor informado (${amountToPay} MT) é maior que a dívida atual (${settleDebtCustomer.debt} MT).`, "error");
      return;
    }

    setIsSettling(true);
    
    // Simulate network processing and sending SMS/Email
    setTimeout(async () => {
      const settlementRecord = {
        id: generateEntityId("set"),
        date: new Date().toISOString(),
        amount: amountToPay,
        method: "Numerário"
      };

      // 1. Update customer debt and history
      onUpdateCustomer({
        ...settleDebtCustomer,
        debt: settleDebtCustomer.debt - amountToPay,
        settlements: [...(settleDebtCustomer.settlements || []), settlementRecord]
      });

      // 2. Add cash flow entry
      onAddCashFlowEntry({
        id: generateEntityId("cash"),
        timestamp: new Date().toISOString(),
        type: "INPUT",
        amount: amountToPay,
        reason: `Liquidação de dívida: ${settleDebtCustomer.name}`,
        responsibleUser: activeUsername || "Operador Atual"
      });

      // 3. Log audit
      onAddAuditLog(
        "Liquidação de Dívida",
        "CLIENTES",
        `Dívida de ${settleDebtCustomer.name} liquidada em ${amountToPay} MT.`
      );

      const receiptNumber = generateReceiptNumber();
      const operatorName = activeUsername || "Operador Atual";
      const remainingBalance = settleDebtCustomer.debt - amountToPay;
      const paymentMethodStr = "Numerário";

      // 4. Send email receipt
      if (settleDebtCustomer.email && settleDebtCustomer.email.includes("@")) {
        try {
          const htmlReceipt = `
            <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #047857; text-align: center; margin-bottom: 20px;">Recibo de Liquidação de Dívida</h2>
              <p><strong>Recibo Nº:</strong> ${receiptNumber}</p>
              <p><strong>Data:</strong> ${new Date().toLocaleString()}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
              <p>Olá <strong>${settleDebtCustomer.name}</strong>,</p>
              <p>Confirmamos a receção do pagamento no valor de <strong>${amountToPay.toLocaleString()} MT</strong> via ${paymentMethodStr}.</p>
              <p>A sua dívida pendente foi atualizada para: <strong>${remainingBalance.toLocaleString()} MT</strong>.</p>
              <p>Operador: ${operatorName}</p>
              <p style="margin-top: 30px; font-size: 12px; color: #64748b; text-align: center;">Obrigado pela sua preferência!<br><em>${settings?.companyName || "Indisponível"} - Sistema de Faturação</em></p>
            </div>
          `;
          await sendEmail({
            to: settleDebtCustomer.email,
            subject: `Recibo ${receiptNumber} - ${settings?.companyName || "Indisponível"}`,
            body: htmlReceipt,
            isHtml: true
          });
        } catch (e) {
          console.error("Failed to send receipt email:", e);
        }
      }

      // 4.5 Send SMS receipt
      if (settleDebtCustomer.phone) {
        try {
          const { sendSMS } = await import("../lib/sms");
          const smsMsg = `${settings?.companyName || "Sistema"} (Recibo: ${receiptNumber}): Pagamento de ${amountToPay} MT efetuado via ${paymentMethodStr}. Divida atual: ${remainingBalance} MT. Obrigado!`;
          await sendSMS(settleDebtCustomer.phone, smsMsg);
        } catch (e) {
          console.error("Failed to send SMS receipt:", e);
        }
      }

      // 4.6 Generate PDF Receipt
      try {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(4, 120, 87);
        doc.text(`${(settings?.companyName || "SISTEMA").toUpperCase()} - COMPROVATIVO DE LIQUIDACAO`, 14, 20);
        
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Recibo Nº: ${receiptNumber}`, 14, 30);
        doc.text(`Data: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Operador: ${operatorName}`, 14, 46);
        
        doc.setLineWidth(0.5);
        doc.line(14, 52, 196, 52);
        
        doc.text(`Cliente: ${settleDebtCustomer.name}`, 14, 62);
        doc.text(`Nuit: ${settleDebtCustomer.nuit || "N/A"}`, 14, 70);
        
        doc.setFont("helvetica", "bold");
        doc.text(`Valor Liquidado: ${amountToPay.toLocaleString()} MT`, 14, 85);
        doc.setFont("helvetica", "normal");
        doc.text(`Método de Pagamento: ${paymentMethodStr}`, 14, 93);
        doc.text(`Dívida Restante: ${remainingBalance.toLocaleString()} MT`, 14, 101);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Obrigado por regularizar a sua situacao!", 14, 120);
        doc.text("Processado por computador", 14, 126);
        
        doc.autoPrint();
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
        
        doc.save(`${receiptNumber}_${settleDebtCustomer.name.replace(/\s+/g, '_')}.pdf`);
      } catch (err) {
        console.error("Error generating PDF receipt:", err);
      }

      // 5. Confirmation toast
      if (onShowToast) {
        onShowToast(
          `Liquidação de ${amountToPay} MT efetuada! Comprovativo enviado por SMS/E-mail para ${settleDebtCustomer.phone}.`,
          "success",
          "Dívida Liquidada"
        );
      }

      setSettleDebtCustomer(null);
      setSettlementAmount("");
      setIsSettling(false);
    }, 1200);
  };

  // Loyalty SMS Preset Templates
  const LOYALTY_SMS_PRESETS = [
    {
      id: "redeem_reward",
      title: "🌟 Resgate de Recompensas",
      badge: "Alta Conversão",
      description: "Convite para trocar pontos por descontos em compras",
      template: "Estimado(a) {NOME}, voce tem {PONTOS} pontos acumulados na {EMPRESA}! Troque o seu saldo por descontos no valor de {VALOR_RESGATE} na sua proxima compra. Visite-nos!"
    },
    {
      id: "double_points",
      title: "🚀 Bónus Pontos em Dobro",
      badge: "Fim-de-Semana",
      description: "Promove ganho acelerado de pontos de fidelidade",
      template: "Atencao {NOME}! Neste fim-de-semana ganhe PONTOS EM DOBRO a cada compra na {EMPRESA}. O seu saldo atual e de {PONTOS} pts ({VALOR_RESGATE}). Te esperamos!"
    },
    {
      id: "points_reminder",
      title: "⚠️ Lembrete de Saldo Ativo",
      badge: "Reativação",
      description: "Incentiva clientes inativos a usar pontos acumulados",
      template: "Ola {NOME}, nao deixe os seus {PONTOS} pontos de fidelidade caducarem! Visite a {EMPRESA} hoje para usar os seus pontos e ganhar ofertas exclusivas."
    },
    {
      id: "vip_appreciation",
      title: "💎 Oferta Cliente VIP",
      badge: "Fidelidade VIP",
      description: "Mensagem de consideração para clientes com saldo elevado",
      template: "Obrigado pela preferencia {NOME}! Como nosso cliente VIP com {PONTOS} pontos acumulados na {EMPRESA}, preparamos um presente especial para si este mes."
    }
  ];

  // Helper parser for dynamic SMS tags
  const parseSmsTemplate = (template: string, cust?: Customer | null): string => {
    const companyNameStr = settings?.companyName || "Indisponível";
    if (!cust) {
      return template
        .replace(/{NOME}/g, "Cliente Exemplo")
        .replace(/{PONTOS}/g, "0")
        .replace(/{VALOR_RESGATE}/g, "0 MT")
        .replace(/{EMPRESA}/g, companyNameStr)
        .replace(/{TELEFONE}/g, settings?.storeContact || "Indisponível");
    }

    const pts = cust.loyaltyPoints || 0;
    const redemptionValue = (pts * 100).toLocaleString("pt-MZ") + " MT";
    return template
      .replace(/{NOME}/g, cust.name || "Cliente")
      .replace(/{PONTOS}/g, pts.toString())
      .replace(/{VALOR_RESGATE}/g, redemptionValue)
      .replace(/{EMPRESA}/g, companyNameStr)
      .replace(/{TELEFONE}/g, cust.phone || "");
  };

  const handleInsertTag = (tag: string) => {
    setSelectedSms(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + tag);
  };

  // Trigger Gemini API to generate gorgeous creative SMS (Server-Side Key)
  const handleGenerateAISms = async () => {
    setIsGeneratingSms(true);
    setSmsOptions([]);

    try {
      const response = await authenticatedFetch("/api/gemini/marketing/sms", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignType: `Fidelização por Pontos (${campaignTarget})`,
          details: `Incentivar o resgate de pontos de fidelidade de clientes com saldo ativo. Use as tags {NOME}, {PONTOS}, {VALOR_RESGATE} e {EMPRESA}. Instrução extra: ${customSmsPrompt || 'Nenhuma'}`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.smsList && Array.isArray(data.smsList)) {
        setSmsOptions(data.smsList);
        setSelectedSms(data.smsList[0]);
      } else {
        throw new Error("Formato inválido recebido do servidor AI.");
      }
    } catch (error) {
      console.warn("Erro ao contactar Gemini, aplicando fallback local...");
      const fallbackList = [
        `Estimado(a) {NOME}, voce tem {PONTOS} pontos na {EMPRESA}! Troque o seu saldo por descontos no valor de {VALOR_RESGATE} na sua proxima compra. Visite-nos!`,
        `Atencao {NOME}! Neste fim-de-semana ganhe PONTOS EM DOBRO a cada compra na {EMPRESA}. O seu saldo atual e de {PONTOS} pts ({VALOR_RESGATE}). Te esperamos!`,
        `Ola {NOME}, nao deixe os seus {PONTOS} pontos de fidelidade caducarem! Visite a {EMPRESA} hoje para usar os seus pontos e ganhar ofertas exclusivas.`
      ];
      setSmsOptions(fallbackList);
      setSelectedSms(fallbackList[0]);
    } finally {
      setIsGeneratingSms(false);
    }
  };

  // Dispatch Campaign
  const handleDispatchSmsCampaign = async () => {
    if (!selectedSms.trim()) {
      if (onShowToast) onShowToast("Digite ou selecione uma mensagem para a campanha de SMS.", "warning", "Mensagem Vazia");
      return;
    }

    if (matchingTargetCustomers.length === 0) {
      if (onShowToast) onShowToast("Nenhum cliente encontrado com os critérios de pontos de fidelidade selecionados.", "warning", "Sem Destinatários");
      return;
    }

    setSmsDispatchStatus("sending");
    setDispatchCount(matchingTargetCustomers.length);

    try {
      const sampleMessage = parseSmsTemplate(selectedSms, matchingTargetCustomers[0]);

      // Try importing real SMS dispatcher if available
      const { sendSMS } = await import("../lib/sms").catch(() => ({ sendSMS: null }));

      if (sendSMS) {
        for (const cust of matchingTargetCustomers) {
          if (cust.phone) {
            const personalizedMsg = parseSmsTemplate(selectedSms, cust);
            await sendSMS(cust.phone, personalizedMsg).catch(() => null);
          }
        }
      }

      const response = await authenticatedFetch("/api/campaign/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: ["SMS"],
          campaignTitle: `Fidelização Pontos (${campaignTarget})`,
          message: sampleMessage,
          recipients: matchingTargetCustomers.map(c => ({
            phone: c.phone,
            name: c.name,
            loyaltyPoints: c.loyaltyPoints
          })),
          simulateError: false
        })
      });

      const data = await response.json().catch(() => ({ success: true }));

      setSmsDispatchStatus("sent");
      onAddAuditLog(
        "Campanha Marketing SMS Fidelização",
        "CLIENTES",
        `Campanha SMS enviada para ${matchingTargetCustomers.length} destinatários (${campaignStats.totalPoints} pontos acumulados em grupo). Exemplo: "${sampleMessage.substring(0, 50)}..."`
      );
      
      if (onShowToast) {
        onShowToast(
          data.message || `Campanha SMS enviada com sucesso para ${matchingTargetCustomers.length} clientes!`,
          "success",
          "SMS Disparados com Sucesso"
        );
      }
    } catch (err: any) {
      setSmsDispatchStatus("idle");
      if (onShowToast) {
        onShowToast(err.message || "Falha ao despachar a campanha de SMS.", "error", "Falha de Envio");
      }
    }
  };

  {/* Campanhas SMS Content Section */}
  const renderSmsCampaignSection = () => (
    <div className="bg-slate-900 border border-slate-800 p-5 md:p-6 rounded-2xl animate-in slide-in-from-top duration-200 space-y-6 text-white shadow-xl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-gradient-to-br from-lime-500/20 to-emerald-500/20 text-lime-400 border border-lime-500/30 rounded-xl">
              <Smartphone className="w-5 h-5 animate-pulse" />
            </span>
            <div>
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                <span>Campanhas de SMS Marketing & Fidelidade</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-300 border border-lime-500/30">
                  DISPARO EM MASSA
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Elabore e envie mensagens personalizadas aos seus clientes com base no saldo acumulado de pontos de fidelidade.
              </p>
            </div>
          </div>
        </div>

        {activeSubTab !== "campaigns" && (
          <button 
            type="button"
            onClick={() => { setShowSmsPanel(false); setSmsDispatchStatus("idle"); setSmsOptions([]); }}
            className="text-slate-400 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Fechar Painel ✕
          </button>
        )}
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Público Alvo Selecionado</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg font-extrabold text-lime-400 font-mono">{campaignStats.totalRecipients}</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-[9.5px] text-slate-400 block mt-0.5">Com contacto de telefone</span>
        </div>

        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Pontos no Segmento</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg font-extrabold text-amber-400 font-mono">{campaignStats.totalPoints.toLocaleString()} Pts</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-[9.5px] text-slate-400 block mt-0.5">Média: {campaignStats.avgPoints} Pts / cliente</span>
        </div>

        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Potencial de Resgate</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg font-extrabold text-emerald-400 font-mono">{campaignStats.totalRedeemableMT.toLocaleString()} MT</span>
            <Gift className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-[9.5px] text-slate-400 block mt-0.5">1 Ponto = 100 MT em trocas</span>
        </div>

        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Gateway de Envio</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-bold text-slate-200">GSM / Web API</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <span className="text-[9.5px] text-emerald-400 block mt-0.5">Pronto para Disparo</span>
        </div>
      </div>

      {/* Main Campaign Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Segment Selection & Draft Editor */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* 1. Target Audience Selector */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-lime-400 uppercase font-mono flex items-center gap-1.5">
                <Target className="w-4 h-4 text-lime-400" />
                1. Segmentação por Saldo de Pontos & Perfil
              </label>
              <span className="text-[10px] text-slate-400 font-mono">{matchingTargetCustomers.length} Clientes Filtrados</span>
            </div>

            <select
              value={campaignTarget}
              onChange={(e) => setCampaignTarget(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-semibold text-white outline-none focus:border-lime-500 transition"
            >
              <option value="LOYALTY_REDEEMABLE">🌟 Clientes com Saldo de Pontos Resgatáveis (&gt; 0 Pts) - ({customers.filter(c => (c.loyaltyPoints || 0) > 0).length})</option>
              <option value="LOYALTY_HIGH">💎 Alto Saldo de Fidelidade VIP (≥ 50 Pts) - ({customers.filter(c => (c.loyaltyPoints || 0) >= 50).length})</option>
              <option value="LOYALTY_MEDIUM">🚀 Saldo Médio de Fidelidade (10 a 49 Pts) - ({customers.filter(c => (c.loyaltyPoints || 0) >= 10 && (c.loyaltyPoints || 0) < 50).length})</option>
              <option value="LOYALTY_LOW">⚠️ Poucos / Sem Pontos (&lt; 10 Pts - Reativação) - ({customers.filter(c => (c.loyaltyPoints || 0) < 10).length})</option>
              <option value="LOYALTY_CUSTOM">🎯 Intervalo Personalizado de Pontos (Min/Max)</option>
              <option value="ALL">👥 Todos os Clientes com Telefone ({customers.length})</option>
              <option value="VIP">⭐ Clientes Recorrentes (≥ 10 Compras) ({customers.filter(c => c.purchaseCount >= 10).length})</option>
              <option value="DEBT">🔴 Clientes com Dívidas em Aberto ({customers.filter(c => c.debt > 0).length})</option>
            </select>

            {/* Custom min/max points range inputs */}
            {campaignTarget === "LOYALTY_CUSTOM" && (
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 grid grid-cols-2 gap-3 animate-in fade-in">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono font-bold block mb-1">Mínimo de Pontos:</label>
                  <input 
                    type="number"
                    min={0}
                    value={customMinPoints}
                    onChange={(e) => setCustomMinPoints(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md p-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-mono font-bold block mb-1">Máximo de Pontos:</label>
                  <input 
                    type="number"
                    min={0}
                    value={customMaxPoints}
                    onChange={(e) => setCustomMaxPoints(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md p-1.5 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. Preset Templates & Quick Tags */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-orange-400 uppercase font-mono flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-orange-400" />
                2. Modelos Prontos de Fidelização
              </label>
              <span className="text-[10px] text-slate-400">Clique para aplicar</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LOYALTY_SMS_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedSms(p.template)}
                  className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-850 hover:border-orange-500/50 text-left transition group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-orange-300">{p.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded font-mono">{p.badge}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-1 line-clamp-1">{p.description}</p>
                </button>
              ))}
            </div>

            {/* Dynamic Tags Insertion Pills */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-mono font-bold block mb-1.5">Variáveis Dinâmicas do Cliente:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "{NOME}", label: "Nome do Cliente" },
                  { tag: "{PONTOS}", label: "Saldo de Pontos" },
                  { tag: "{VALOR_RESGATE}", label: "Valor Est. Resgate (MT)" },
                  { tag: "{EMPRESA}", label: "Nome do Negócio" },
                  { tag: "{TELEFONE}", label: "Número do Cliente" }
                ].map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => handleInsertTag(t.tag)}
                    className="px-2 py-1 bg-slate-900 hover:bg-orange-500/20 text-orange-300 hover:text-orange-200 border border-slate-700 hover:border-orange-500/50 rounded text-[10.5px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    <span>+</span>
                    <span>{t.tag}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Text Message Draft Editor */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-400 uppercase font-mono flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                3. Redação e Edição do Texto Promocional
              </label>
              <span className={`text-[10px] font-mono font-bold ${
                selectedSms.length > 160 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {selectedSms.length} / 160 Chars ({Math.ceil(selectedSms.length / 160) || 1} SMS)
              </span>
            </div>

            <textarea
              rows={4}
              value={selectedSms}
              onChange={(e) => setSelectedSms(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white outline-none focus:border-amber-500 font-mono leading-relaxed"
              placeholder="Digite a mensagem da campanha aqui..."
            />

            {/* AI Prompt Generator trigger */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customSmsPrompt}
                  onChange={(e) => setCustomSmsPrompt(e.target.value)}
                  placeholder="Instruções para a IA (ex: dar 15% bónus no M-Pesa)..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={handleGenerateAISms}
                  disabled={isGeneratingSms}
                  className="px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                  <span>{isGeneratingSms ? "Gerando..." : "Gerar com IA"}</span>
                </button>
              </div>

              {smsOptions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono font-bold block">Opções Sugeridas pela IA:</span>
                  <div className="space-y-1.5">
                    {smsOptions.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedSms(opt)}
                        className={`w-full p-2 rounded-lg border text-left text-[11px] font-mono transition flex items-start gap-2 ${
                          selectedSms === opt 
                            ? "bg-amber-500/20 border-amber-500 text-amber-200" 
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850"
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-slate-800 text-[9px] font-bold text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Live Mobile Device Mockup & Dispatch Controller */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Smartphone Simulator Preview */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-emerald-400 font-mono uppercase flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Pré-visualização em Dispositivo
              </span>
              <span className="text-[9.5px] text-slate-400">Tempo Real</span>
            </div>

            {/* Test Customer Switcher */}
            {matchingTargetCustomers.length > 0 && (
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400 font-mono font-bold block">Testar com Cliente do Grupo:</label>
                <select
                  value={previewCustomerId}
                  onChange={(e) => setPreviewCustomerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200 font-medium"
                >
                  {matchingTargetCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.loyaltyPoints || 0} Pts (Est: {(c.loyaltyPoints || 0) * 100} MT)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mobile Device Frame Mockup */}
            <div className="mx-auto w-full max-w-[300px] bg-slate-900 border-4 border-slate-800 rounded-3xl p-3 shadow-2xl relative space-y-2">
              {/* Phone Speaker & Camera Notch */}
              <div className="w-16 h-2 bg-slate-800 rounded-full mx-auto"></div>

              {/* Phone Header */}
              <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-850 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-slate-300 font-mono">SMS Gateway</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono">
                  {previewCustomer ? previewCustomer.phone : "+258 84 000 0000"}
                </span>
              </div>

              {/* Chat Message Bubble */}
              <div className="py-3 px-1 space-y-2">
                <div className="bg-gradient-to-br from-lime-900/60 to-emerald-950/80 border border-lime-500/40 rounded-2xl p-3 text-[11px] text-lime-100 font-sans shadow-md space-y-1.5 relative">
                  <p className="leading-relaxed whitespace-pre-wrap font-medium">
                    {parseSmsTemplate(selectedSms, previewCustomer)}
                  </p>
                  <div className="flex items-center justify-between text-[8.5px] text-lime-400/70 pt-1 font-mono border-t border-lime-500/20">
                    <span>Hoje, 09:41</span>
                    <span className="flex items-center gap-1">
                      <span>SMS Entregue</span>
                      <Check className="w-2.5 h-2.5 text-lime-400" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Customer Card summary */}
              {previewCustomer && (
                <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                  <div>
                    <span className="text-white font-bold block">{previewCustomer.name}</span>
                    <span className="text-[9px] text-amber-400 font-mono font-bold">{previewCustomer.loyaltyPoints || 0} Pontos Acumulados</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-mono font-bold block">{((previewCustomer.loyaltyPoints || 0) * 100).toLocaleString("pt-MZ")} MT</span>
                    <span className="text-[8.5px] text-slate-500">Valor de Resgate</span>
                  </div>
                </div>
              )}
            </div>

            {/* Final Dispatch Button */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Total a Disparar:</span>
                <span className="text-lime-400 font-extrabold">{matchingTargetCustomers.length} Clientes</span>
              </div>

              {smsDispatchStatus === "idle" ? (
                <button
                  type="button"
                  onClick={handleDispatchSmsCampaign}
                  disabled={matchingTargetCustomers.length === 0 || !selectedSms.trim()}
                  className="w-full py-3 bg-gradient-to-r from-lime-500 to-emerald-600 hover:from-lime-600 hover:to-emerald-700 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-lime-950/50 cursor-pointer disabled:opacity-50 transition"
                >
                  <Send className="w-4 h-4 fill-slate-950" />
                  <span>Emitir Campanha SMS em Massa</span>
                </button>
              ) : smsDispatchStatus === "sending" ? (
                <div className="p-3 bg-slate-900 rounded-xl border border-orange-500/40 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-orange-400">
                    <span className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>
                    <span>Disparando mensagens SMS em massa ({dispatchCount} contatos)...</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div className="bg-orange-500 h-full animate-pulse w-3/4"></div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 font-extrabold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Campanha SMS Disparada com Sucesso!</span>
                  </div>
                  <p className="text-[10px] text-emerald-200">
                    Mensagens entregues para {dispatchCount} clientes de fidelidade.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSmsDispatchStatus("idle")}
                    className="mt-1 text-[10px] font-bold text-emerald-400 underline cursor-pointer"
                  >
                    Criar Nova Campanha
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Targeted Customers List Preview Box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-300 font-mono uppercase block">
              Destinatários do Grupo ({matchingTargetCustomers.length})
            </span>
            <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar text-[10.5px]">
              {matchingTargetCustomers.length === 0 ? (
                <div className="p-3 text-center text-slate-500 italic">
                  Nenhum cliente atende aos critérios de filtro selecionados.
                </div>
              ) : (
                matchingTargetCustomers.map((cust) => (
                  <div key={cust.id} className="p-2 bg-slate-900 rounded-lg border border-slate-850 flex items-center justify-between">
                    <div>
                      <span className="text-slate-200 font-bold block">{cust.name}</span>
                      <span className="text-slate-400 font-mono text-[9.5px]">{cust.phone}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-400 font-bold font-mono block">🌟 {cust.loyaltyPoints || 0} Pts</span>
                      <span className="text-emerald-400 font-mono text-[9px]">{((cust.loyaltyPoints || 0) * 100).toLocaleString("pt-MZ")} MT</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Sub tabs navigation */}
      <div className="flex gap-1 border-b border-slate-200/80 pb-px mb-5 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSubTab("list")}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "list"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Users className="w-4 h-4" />
          Fichas de Clientes ({customers.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (!selectedCustomerHistory && customers.length > 0) {
              setSelectedCustomerHistory(customers[0]);
            }
            setActiveSubTab("purchases");
          }}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "purchases"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Histórico de Compras
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("debts")}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "debts"
              ? "border-red-600 text-red-600 bg-red-50/30 dark:bg-red-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <AlertCircle className="w-4 h-4 text-red-600" />
          Com Dívidas ({customers.filter(c => c.debt > 0).length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("register")}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "register"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Plus className="w-4 h-4" />
          Cadastrar Novo Cliente
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("history")}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "history"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Histórico de Liquidações
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveSubTab("campaigns");
            setShowSmsPanel(true);
          }}
          className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === "campaigns"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Campanhas SMS ({customers.length})
        </button>
      </div>

      {activeSubTab === "list" && (
        <>
          {/* 1. Filter switches & SMS Marketing Toggle */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            
            {/* KPI quick filtering hooks */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                  filterType === "ALL"
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todos os Clientes ({customers.length})
              </button>

              <button
                onClick={() => setFilterType("VIP")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border flex items-center gap-1.5 ${
                  filterType === "VIP"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                VIP ({customers.filter(c => c.purchaseCount >= 10).length})
              </button>

              <button
                onClick={() => setActiveSubTab("debts")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border flex items-center gap-1.5 ${
                  activeSubTab === "debts"
                    ? "bg-red-600 border-red-600 text-white"
                    : "bg-white border-slate-200 text-red-600 hover:bg-red-50"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Com Dívidas ({customers.filter(c => c.debt > 0).length})
              </button>

              <button
                onClick={() => setFilterType("INACTIVE")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                  filterType === "INACTIVE"
                    ? "bg-slate-700 border-slate-700 text-white"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Pouco Ativos ({customers.filter(c => c.purchaseCount <= 4).length})
              </button>
            </div>

            {/* Action Triggers */}
            <div className="flex gap-2 items-center w-full md:w-auto">
              <button
                onClick={() => setShowSmsPanel(!showSmsPanel)}
                className="flex-1 md:flex-initial bg-white hover:bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition shadow-2xs"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                Campanhas SMS
              </button>

              <button
                onClick={() => setActiveSubTab("register")}
                className="flex-1 md:flex-initial bg-blue-600 hover:bg-blue-700 py-1.5 px-3.5 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar Cliente
              </button>
            </div>

          </div>

          {/* 1B. SMS Marketing automated Campaign Assistant Panel */}
          {showSmsPanel && renderSmsCampaignSection()}

          {/* 2. Custom Dashboard Database Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col min-h-[320px]">
            
            {/* Search header tool */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="relative w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, contato ou NUIT tax ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-orange-505"
                />
              </div>

              <span className="text-[10px] text-slate-400 font-mono">Fidelização active: 1 Ponto = 100 MT</span>
            </div>

            {/* Database List Table */}
            <div className="flex-1 overflow-x-auto max-h-[500px] overflow-y-auto text-[11.5px] custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wide text-[9.5px]">
                    <th className="p-3.5">FOTO</th>
                    <th className="p-3.5">CLIENTE</th>
                    <th className="p-3.5">CONTATO / EMAIL</th>
                    <th className="p-3.5">NUIT FISCAL</th>
                    <th className="p-3.5">ENDEREÇO</th>
                    <th className="p-3.5 text-right">TOTAL COMPRADO</th>
                    <th className="p-3.5 text-center">Nº DE COMPRAS</th>
                    <th className="p-3.5 text-right">DÍVIDA ATIVA</th>
                    <th className="p-3.5 text-center">LOYALTY PONTOS</th>
                    <th className="p-3.5 text-center">EXCLUIR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 italic colSpan-10">Nenhum cliente atendeu aos filtros selecionados.</td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => {
                      const isVip = c.purchaseCount >= 10;
                      const hasDebt = c.debt > 0;

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/45 transition">
                          <td className="p-3 text-center">
                            <span className="w-7 h-7 bg-orange-100 text-orange-850 rounded-full text-xs font-bold flex items-center justify-center">
                              {c.name.substring(0, 2).toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-850">{c.name}</span>
                              {isVip && (
                                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                  VIP
                                </span>
                              )}
                              {c.oneClickCheckoutEnabled && (
                                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-0.5" title={`Método: ${c.preferredPaymentMethod || "Dinheiro"}`}>
                                  ⚡ One-Click ({c.preferredPaymentMethod === "CASH" ? "Dinheiro" : c.preferredPaymentMethod === "MPESA_PAGA_FACIL" ? "M-Pesa" : c.preferredPaymentMethod === "EMOLA" ? "E-Mola" : c.preferredPaymentMethod === "POS_CARD" ? "POS" : c.preferredPaymentMethod === "CREDIT_CARD" ? "Cartão" : c.preferredPaymentMethod === "BANK_TRANSFER" ? "Transf" : c.preferredPaymentMethod === "DEBT" ? "Dívida" : "Dinheiro"})
                                </span>
                              )}
                            </div>
                            {c.lastPurchaseDate && (
                              <span className="text-[9.5px] text-slate-400 font-mono mt-0.5 block">Último: {c.lastPurchaseDate}</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            <div>{c.phone}</div>
                            <span className="text-[10px] text-slate-400 font-sans">{c.email}</span>
                          </td>
                          <td className="p-3 font-mono text-slate-500">{c.nuit}</td>
                          <td className="p-3 text-slate-500 max-w-[150px] truncate">{c.address}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">{c.totalSpent.toLocaleString()} {currency}</td>
                          <td className="p-3 text-center font-mono text-slate-500">{c.purchaseCount} vezes</td>
                          <td className={`p-3 text-right font-mono text-xs font-bold ${
                            hasDebt ? "text-red-700 bg-red-50/30" : "text-slate-400"
                          }`}>
                            {c.debt > 0 ? `${c.debt.toLocaleString()} MT` : "Sem dívidas"}
                            {hasDebt && (
                              <span className="text-[8.5px] font-sans font-bold bg-red-100 text-red-700 block rounded px-1 mt-0.5 text-center leading-none">VENCIDO</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1 py-0.5 px-2 bg-amber-50 rounded-full border border-amber-200">
                              <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="font-mono text-xs font-bold text-amber-800">{c.loyaltyPoints}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedCustomerHistory(c);
                                  setActiveSubTab("purchases");
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer"
                                title="Ver Histórico de Compras"
                              >
                                <ShoppingBag className="w-3 h-3 text-amber-600 shrink-0" />
                                Compras
                              </button>
                              <button
                                onClick={() => handleOpenEditModal(c)}
                                className="p-1 text-slate-400 hover:text-orange-600 rounded transition cursor-pointer"
                                title="Editar Cliente"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {hasDebt && (
                                <button
                                  onClick={() => {
                                    setSettleDebtCustomer(c);
                                    setSettlementAmount(c.debt);
                                  }}
                                  className="p-1 text-slate-400 hover:text-emerald-600 rounded transition"
                                  title="Liquidar Dívida"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteCustomerClick(c.id)}
                                className="p-1 text-slate-350 hover:text-red-650 rounded cursor-pointer animate-none"
                                title="Excluir Cliente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSubTab === "campaigns" && (
        <div className="space-y-6">
          {renderSmsCampaignSection()}
        </div>
      )}

      {activeSubTab === "register" && (
        <div className="bg-white p-6 rounded-2xl max-w-lg mx-auto border border-slate-200 shadow-md space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-slate-900 text-sm">Registrar Cliente</h3>
          </div>

          <form onSubmit={handleSubmitCustomer} className="space-y-4 text-xs">
            {localError && (
              <div className="bg-red-500/10 text-red-500 p-2.5 rounded-lg text-xs font-semibold border border-red-500/20">
                {localError}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Completo do Cliente *</label>
              <input
                type="text"
                required
                placeholder="Ex: Carlos Tembe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-semibold outline-none focus:border-orange-500 text-slate-850"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Contacto Telefónico *</label>
              <input
                type="tel"
                required
                placeholder="Ex: 847231455"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-505 uppercase">E-mail de Notificação</label>
              <input
                type="email"
                placeholder="Ex: cliente@empresa.co.mz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-semibold outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-505 uppercase">Endereço Residencial</label>
              <input
                type="text"
                placeholder="Ex: Av. Julius Nyerere, Maputo"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-semibold outline-none focus:border-orange-500 text-slate-850"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">NUIT Fiscal</label>
                <input
                  type="text"
                  placeholder="Ex: 123456789"
                  value={nuit}
                  onChange={(e) => setNuit(e.target.value)}
                  className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Limite Crédito ({currency})</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Ex: 5000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-55 border border-slate-200 rounded-lg p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab("list");
                  setLocalError("");
                }}
                className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Confirmar Cadastro
              </button>
            </div>
          </form>
        </div>
      )}

      {activeSubTab === "debts" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Gestão de Clientes com Dívidas</h3>
                <p className="text-xs text-slate-500">Controle e liquidação de contas pendentes.</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total em Dívida</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {customers.filter(c => c.debt > 0).reduce((acc, c) => acc + c.debt, 0).toLocaleString()} {currency}
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Clientes Devedores</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {customers.filter(c => c.debt > 0).length}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[350px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-3 font-semibold rounded-tl-lg">Cliente</th>
                  <th className="p-3 font-semibold">Valor da Dívida</th>
                  <th className="p-3 font-semibold">Última Compra</th>
                  <th className="p-3 font-semibold">Dias em Atraso</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Ação</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {customers.filter(c => c.debt > 0).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">Nenhum cliente com dívida ativa no momento.</td>
                  </tr>
                ) : (
                  customers.filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt).map(customer => {
                    const lastPurchaseStr = customer.lastPurchaseDate;
                    let daysDelayed = 0;
                    if (lastPurchaseStr) {
                      const lastDate = new Date(lastPurchaseStr.split('/').reverse().join('-')); // Adjust if date format is DD/MM/YYYY
                      if (!isNaN(lastDate.getTime())) {
                        daysDelayed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                      }
                    }
                    
                    const debtState = customer.debt > 0 && customer.settlements && customer.settlements.length > 0 
                      ? "Parcialmente Liquidada" 
                      : customer.debt > 0 ? "Ativa" : "Liquidada";

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{customer.name}</td>
                        <td className="p-3 font-bold font-mono text-red-600">{customer.debt.toLocaleString()} {currency}</td>
                        <td className="p-3 text-slate-600">{lastPurchaseStr || "N/A"}</td>
                        <td className="p-3 font-medium text-slate-800">{daysDelayed > 0 ? `${daysDelayed} dias` : "Recente"}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                            debtState === "Ativa" ? "bg-red-100 text-red-700" :
                            debtState === "Parcialmente Liquidada" ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {debtState}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setSettleDebtCustomer(customer);
                              setSettlementAmount(customer.debt);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition-colors ml-auto cursor-pointer"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Liquidar Dívida
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === "history" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-slate-800">Histórico de Liquidações</h3>
                <p className="text-xs text-slate-500">Registo global de amortizações e pagamentos de dívidas efetuados pelos clientes.</p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 uppercase text-[10px] font-bold text-slate-500 tracking-wider">
                  <th className="p-3 border-b border-slate-200">Data e Hora</th>
                  <th className="p-3 border-b border-slate-200">Cliente</th>
                  <th className="p-3 border-b border-slate-200">Método de Liquidação</th>
                  <th className="p-3 border-b border-slate-200 text-right">Valor Pago (MT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.flatMap(c => 
                  (c.settlements || []).map(s => ({...s, customerName: c.name}))
                ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(settlement => (
                  <tr key={settlement.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 text-xs text-slate-600">
                      {new Date(settlement.date).toLocaleString()}
                    </td>
                    <td className="p-3 text-xs font-semibold text-slate-800">
                      {settlement.customerName}
                    </td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                        {settlement.method}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-mono font-bold text-slate-800 text-right">
                      {settlement.amount.toLocaleString()} MT
                    </td>
                  </tr>
                ))}
                {customers.flatMap(c => c.settlements || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500 text-xs">
                      Nenhum histórico de liquidação encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === "purchases" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-200 space-y-6">
          {/* Header Customer Selector */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20 shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Histórico de Compras por Cliente</h3>
                <p className="text-xs text-slate-500">Histórico de transações comerciais e faturas emitidas por cliente.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-bold text-slate-600 shrink-0">Cliente:</label>
              <select
                value={selectedCustomerHistory?.id || ""}
                onChange={(e) => {
                  const found = customers.find(c => c.id === e.target.value);
                  setSelectedCustomerHistory(found || null);
                }}
                className="bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 w-full sm:w-72 shadow-sm"
              >
                <option value="">-- Selecionar Cliente --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) - {c.purchaseCount} compras
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedCustomerHistory ? (
            <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-600 text-sm">Nenhum cliente selecionado</p>
              <p className="text-xs text-slate-400 mt-1">Por favor, selecione um cliente no menu acima para consultar o seu histórico de compras.</p>
            </div>
          ) : (
            <>
              {/* Customer Info & Executive KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-xl shadow-md flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">Ficha de Cliente</span>
                      {selectedCustomerHistory.purchaseCount >= 10 && (
                        <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full uppercase">VIP</span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-base text-white mt-1 leading-tight">{selectedCustomerHistory.name}</h4>
                    <p className="text-xs text-slate-300 font-mono mt-1">📱 {selectedCustomerHistory.phone}</p>
                    <p className="text-xs text-slate-400 font-mono">🏢 NUIT: {selectedCustomerHistory.nuit || "N/A"}</p>
                  </div>
                  {selectedCustomerHistory.address && (
                    <p className="text-[10.5px] text-slate-400 mt-3 truncate border-t border-slate-700/60 pt-2">
                      📍 {selectedCustomerHistory.address}
                    </p>
                  )}
                </div>

                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/60 flex flex-col justify-center">
                  <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider font-mono">Total de Vendas Acumuladas</span>
                  <p className="text-2xl font-black font-mono text-amber-900 mt-1">
                    {selectedCustomerTransactions.reduce((acc, t) => acc + t.grandTotal, 0).toLocaleString()} {currency}
                  </p>
                  <p className="text-[10.5px] text-amber-700 font-medium mt-1">
                    Em {selectedCustomerTransactions.length} transações liquidadas
                  </p>
                </div>

                <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200/60 flex flex-col justify-center">
                  <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider font-mono">Pontos de Fidelidade</span>
                  <p className="text-2xl font-black font-mono text-emerald-900 mt-1 flex items-center gap-1.5">
                    <Award className="w-6 h-6 text-emerald-600" />
                    {selectedCustomerHistory.loyaltyPoints}
                  </p>
                  <p className="text-[10.5px] text-emerald-700 font-medium mt-1">
                    Saldo atual de pontos acumulados
                  </p>
                </div>

                <div className={`p-4 rounded-xl border flex flex-col justify-center ${
                  selectedCustomerHistory.debt > 0 
                    ? "bg-red-50/70 border-red-200/70 text-red-900" 
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}>
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider font-mono ${
                    selectedCustomerHistory.debt > 0 ? "text-red-700" : "text-slate-500"
                  }`}>
                    Dívida Pendente
                  </span>
                  <p className={`text-2xl font-black font-mono mt-1 ${
                    selectedCustomerHistory.debt > 0 ? "text-red-700" : "text-slate-700"
                  }`}>
                    {selectedCustomerHistory.debt.toLocaleString()} {currency}
                  </p>
                  <p className="text-[10.5px] font-medium mt-1 opacity-80">
                    {selectedCustomerHistory.debt > 0 ? "⚠️ Pendente de pagamento" : "✓ Sem pendências financeiras"}
                  </p>
                </div>
              </div>

              {/* Filter / Search within transaction list */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-2">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por nº fatura, produto ou operador..."
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  Exibindo <span className="font-bold text-slate-800">{selectedCustomerTransactions.length}</span> transação(ões)
                </span>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 tracking-wider sticky top-0 z-10">
                      <th className="p-3 border-b border-slate-200">Data e Hora</th>
                      <th className="p-3 border-b border-slate-200">Nº Fatura</th>
                      <th className="p-3 border-b border-slate-200">Itens / Artigos Comprados</th>
                      <th className="p-3 border-b border-slate-200">Método Pagamento</th>
                      <th className="p-3 border-b border-slate-200">Operador / Caixa</th>
                      <th className="p-3 border-b border-slate-200 text-right">Total ({currency})</th>
                      <th className="p-3 border-b border-slate-200 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {selectedCustomerTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                          Nenhuma transação comercial encontrada para os critérios selecionados.
                        </td>
                      </tr>
                    ) : (
                      selectedCustomerTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono text-slate-600 shrink-0 whitespace-nowrap">
                            {new Date(tx.timestamp).toLocaleString("pt-MZ", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800 shrink-0 whitespace-nowrap">
                            {tx.invoiceNumber || tx.id}
                          </td>
                          <td className="p-3 max-w-xs">
                            <div className="space-y-1">
                              {tx.items.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                  <span className="font-semibold truncate max-w-[180px]">{item.productName}</span>
                                  <span className="font-mono text-slate-500 text-[10px] shrink-0 ml-1">
                                    {item.quantity}x {item.price.toLocaleString()} MT
                                  </span>
                                </div>
                              ))}
                              {tx.items.length > 3 && (
                                <span className="text-[10px] text-amber-600 font-bold block">
                                  + {tx.items.length - 3} mais artigo(s)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 shrink-0 whitespace-nowrap">
                            <span className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 font-mono">
                              {tx.paymentMethod === "CASH" ? "💵 Dinheiro" :
                               tx.paymentMethod === "MPESA_PAGA_FACIL" ? "📱 M-Pesa" :
                               tx.paymentMethod === "EMOLA" ? "📱 E-Mola" :
                               tx.paymentMethod === "POS_CARD" ? "💳 POS Card" :
                               tx.paymentMethod === "CREDIT_CARD" ? "💳 Cartão" :
                               tx.paymentMethod === "BANK_TRANSFER" ? "🏦 Transferência" :
                               tx.paymentMethod === "DEBT" ? "🧾 Dívida" : tx.paymentMethod}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-600 shrink-0 whitespace-nowrap">
                            👤 {tx.cashierName || "Caixa"}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 text-sm shrink-0 whitespace-nowrap">
                            {tx.grandTotal.toLocaleString()} {currency}
                          </td>
                          <td className="p-3 text-center shrink-0 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedTxDetail(tx)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[10.5px] transition flex items-center gap-1 cursor-pointer"
                                title="Ver Detalhes da Fatura"
                              >
                                <Eye className="w-3.5 h-3.5" /> Detalhes
                              </button>
                              {settings && (
                                <button
                                  onClick={() => printInvoiceHTML(tx, settings)}
                                  className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                  title="Imprimir / Descarregar Fatura HTML"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTxDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">Fatura / Comprovante #{selectedTxDetail.invoiceNumber || selectedTxDetail.id}</h3>
                  <p className="text-[10.5px] text-slate-300 font-mono">
                    {new Date(selectedTxDetail.timestamp).toLocaleString("pt-MZ")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase font-sans">Cliente</span>
                  <p className="font-bold text-slate-800">{selectedTxDetail.customerName || "Consumidor Final"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase font-sans">Operador / Caixa</span>
                  <p className="font-bold text-slate-800">{selectedTxDetail.cashierName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase font-sans">Método de Pagamento</span>
                  <p className="font-bold text-slate-800">{selectedTxDetail.paymentMethod}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase font-sans">NUIT Cliente</span>
                  <p className="font-bold text-slate-800">{selectedTxDetail.nuit || "N/A"}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2 uppercase text-[10px] tracking-wider font-mono">Itens da Compra</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="p-2">Produto</th>
                        <th className="p-2 text-center">Qtd</th>
                        <th className="p-2 text-right">Preço</th>
                        <th className="p-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {selectedTxDetail.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-sans font-medium text-slate-800">{it.productName}</td>
                          <td className="p-2 text-center text-slate-600">{it.quantity}</td>
                          <td className="p-2 text-right text-slate-600">{it.price.toLocaleString()}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{it.subtotal.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-1 text-right font-mono">
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Subtotal:</span>
                  <span>{selectedTxDetail.subtotal.toLocaleString()} {currency}</span>
                </div>
                {selectedTxDetail.vatTotal > 0 && (
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>IVA Total (16%):</span>
                    <span>{selectedTxDetail.vatTotal.toLocaleString()} {currency}</span>
                  </div>
                )}
                {selectedTxDetail.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 text-xs font-bold">
                    <span>Desconto Aplicado:</span>
                    <span>-{selectedTxDetail.discountTotal.toLocaleString()} {currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 text-sm font-black pt-1 border-t border-amber-200/80">
                  <span>TOTAL PAGO:</span>
                  <span className="text-amber-700">{selectedTxDetail.grandTotal.toLocaleString()} {currency}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="flex-1 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Fechar
              </button>
              {settings && (
                <button
                  onClick={() => printInvoiceHTML(selectedTxDetail, settings)}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Imprimir Fatura
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Debt Settlement Modal */}
      {settleDebtCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="bg-emerald-500 p-4 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Liquidar Dívida Pendente</h3>
                <p className="text-emerald-50 text-xs mt-0.5">Operação de regularização financeira</p>
              </div>
              <DollarSign className="w-6 h-6 opacity-80" />
            </div>

            <form onSubmit={handleSettleDebt} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Cliente</p>
                  <p className="font-bold text-slate-800">{settleDebtCustomer.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-semibold">Dívida Total</p>
                  <p className="font-bold font-mono text-red-600">{settleDebtCustomer.debt.toLocaleString()} {currency}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Valor a Liquidar (MT)</label>
                  <button 
                    type="button"
                    onClick={() => setSettlementAmount(settleDebtCustomer.debt)}
                    className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 hover:bg-emerald-100 font-bold uppercase tracking-wide cursor-pointer"
                  >
                    Liquidar Totalmente
                  </button>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max={settleDebtCustomer.debt}
                  step="0.01"
                  autoFocus
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value ? Number(e.target.value) : "")}
                  className="w-full text-lg font-mono font-bold text-emerald-700 border-2 border-slate-200 rounded-xl p-3 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                  placeholder="0.00"
                />
                {settlementAmount && settlementAmount < settleDebtCustomer.debt && (
                  <p className="text-[10px] text-orange-600 font-medium">
                    Liquidação Parcial. Saldo remanescente será: <span className="font-bold">{(settleDebtCustomer.debt - Number(settlementAmount)).toLocaleString()} {currency}</span>
                  </p>
                )}
                {settlementAmount === settleDebtCustomer.debt && (
                  <p className="text-[10px] text-emerald-600 font-medium font-bold">
                    Liquidação Total efetuada. Dívida será encerrada.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSettleDebtCustomer(null);
                    setSettlementAmount("");
                  }}
                  disabled={isSettling}
                  className="flex-1 py-2.5 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSettling || !settlementAmount}
                  className="flex-1 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSettling ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                      Processando...
                    </>
                  ) : (
                    <>
                      Confirmar Liquidação
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Cliente */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-slate-900 text-sm">Editar Cadastro de Cliente</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCustomer} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Contacto Telefónico *</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-mail</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Endereço Residencial</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">NUIT Fiscal</label>
                  <input
                    type="text"
                    value={editNuit}
                    onChange={(e) => setEditNuit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Limite Crédito ({currency})</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={editCreditLimit}
                    onChange={(e) => setEditCreditLimit(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono font-semibold outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default memo(CustomersModule);
