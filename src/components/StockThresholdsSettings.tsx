import React, { useState, useMemo, useEffect } from "react";
import { 
  BellRing, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Save, 
  Smartphone, 
  Mail, 
  MessageSquare, 
  Sliders, 
  Layers, 
  FileSpreadsheet, 
  Printer, 
  Sparkles,
  ChevronDown,
  Check,
  X,
  ArrowUpRight,
  TrendingDown,
  Info,
  Package,
  ShieldAlert,
  Volume2
} from "lucide-react";
import { Product, SystemSettings, UserRole } from "../types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface StockThresholdsSettingsProps {
  products: Product[];
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onUpdateProduct?: (product: Product) => void;
  onUpdateProducts?: (products: Product[]) => void;
  onAddAuditLog?: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  currentRole?: UserRole;
  currency?: string;
}

export default function StockThresholdsSettings({
  products = [],
  settings,
  onUpdateSettings,
  onUpdateProduct,
  onUpdateProducts,
  onAddAuditLog,
  onShowToast,
  currentRole = "ADMIN",
  currency = "MT"
}: StockThresholdsSettingsProps) {
  const canEdit = currentRole === "ADMIN" || currentRole === "SUPERVISOR";

  // Active view tab: "thresholds" (Individual limits table) | "automation" (Alert channels & triggers)
  const [activeView, setActiveView] = useState<"thresholds" | "automation">("thresholds");

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("TODOS");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CRITICAL" | "OUT_OF_STOCK" | "WARNING" | "HEALTHY" | "NO_THRESHOLD">("ALL");

  // Local state for modified product thresholds (productId -> new minStock)
  const [editedThresholds, setEditedThresholds] = useState<Record<string, number>>({});
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);

  // Bulk threshold configuration modal / tools
  const [bulkThresholdValue, setBulkThresholdValue] = useState<number>(5);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>("FILTERED");
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  // Automation Form States
  const [whatsappEnabled, setWhatsappEnabled] = useState(settings.whatsappEnabled ?? true);
  const [managerWhatsappPhone, setManagerWhatsappPhone] = useState(settings.managerWhatsappPhone || "");
  const [whatsappProvider, setWhatsappProvider] = useState(settings.whatsappProvider || "DIRECT_LINK");
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState(
    settings.whatsappMessageTemplate || 
    "⚠️ *ALERTA DE ESTOQUE CRÍTICO - {company_name}* ⚠️\n\nO produto *{product_name}* (SKU: {sku}) atingiu o nível crítico!\n• *Stock Atual:* {current_stock} un\n• *Limite Mínimo:* {threshold} un\n• *Reposição Sugerida:* +{deficit} un\n\n👉 Aceda ao sistema para repor: {pos_link}"
  );

  const [emailStockAlertsEnabled, setEmailStockAlertsEnabled] = useState(settings.emailStockAlertsEnabled ?? true);
  const [alertsRecipientEmail, setAlertsRecipientEmail] = useState(settings.alertsRecipientEmail || settings.reportRecipientEmail || "");
  const [stockAlertEmailSubject, setStockAlertEmailSubject] = useState(settings.stockAlertEmailSubject || "⚠️ Alerta de Reposição de Stock - Limiar Atingido");

  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(settings.smsAlertsEnabled ?? false);
  const [smsManagerPhone, setSmsManagerPhone] = useState(settings.smsManagerPhone || settings.managerWhatsappPhone || "");
  const [smsStockThreshold, setSmsStockThreshold] = useState(settings.smsStockThreshold || 5);

  const [stockAlertAutoSendOnSale, setStockAlertAutoSendOnSale] = useState(settings.stockAlertAutoSendOnSale ?? true);
  const [stockAlertSoundEnabled, setStockAlertSoundEnabled] = useState(settings.stockAlertSoundEnabled ?? true);
  const [stockAlertIncludeDeficit, setStockAlertIncludeDeficit] = useState(settings.stockAlertIncludeDeficit ?? true);

  const [reportHour, setReportHour] = useState(settings.reportHour || "18:00");
  const [reportFrequency, setReportFrequency] = useState<"daily" | "weekly">(settings.reportFrequency || "daily");

  // Sync settings when external props change
  useEffect(() => {
    setWhatsappEnabled(settings.whatsappEnabled ?? true);
    setManagerWhatsappPhone(settings.managerWhatsappPhone || "");
    setWhatsappProvider(settings.whatsappProvider || "DIRECT_LINK");
    setEmailStockAlertsEnabled(settings.emailStockAlertsEnabled ?? true);
    setAlertsRecipientEmail(settings.alertsRecipientEmail || settings.reportRecipientEmail || "");
    setStockAlertEmailSubject(settings.stockAlertEmailSubject || "⚠️ Alerta de Reposição de Stock - Limiar Atingido");
    setSmsAlertsEnabled(settings.smsAlertsEnabled ?? false);
    setSmsManagerPhone(settings.smsManagerPhone || settings.managerWhatsappPhone || "");
    setSmsStockThreshold(settings.smsStockThreshold || 5);
    setStockAlertAutoSendOnSale(settings.stockAlertAutoSendOnSale ?? true);
    setStockAlertSoundEnabled(settings.stockAlertSoundEnabled ?? true);
    setStockAlertIncludeDeficit(settings.stockAlertIncludeDeficit ?? true);
    setReportHour(settings.reportHour || "18:00");
    setReportFrequency(settings.reportFrequency || "daily");
  }, [settings]);

  // Categories list
  const categories = useMemo(() => {
    const list = new Set(products.map(p => p.category).filter(Boolean));
    return ["TODOS", ...Array.from(list)];
  }, [products]);

  // Helper to get effective minStock for a product
  const getProductMinStock = (p: Product) => {
    if (editedThresholds[p.id] !== undefined) {
      return editedThresholds[p.id];
    }
    return p.minStock !== undefined ? p.minStock : 0;
  };

  // KPI Calculations
  const stats = useMemo(() => {
    let criticalCount = 0;
    let outOfStockCount = 0;
    let warningCount = 0;
    let healthyCount = 0;
    let noThresholdCount = 0;
    let totalStockValueAtRisk = 0;

    products.forEach(p => {
      const min = getProductMinStock(p);
      if (min === 0) {
        noThresholdCount++;
      }
      if (p.stock <= 0) {
        outOfStockCount++;
        totalStockValueAtRisk += p.salePrice * (min || 5);
      } else if (p.stock <= min) {
        criticalCount++;
        totalStockValueAtRisk += (min - p.stock) * p.salePrice;
      } else if (p.stock <= min + 3) {
        warningCount++;
      } else {
        healthyCount++;
      }
    });

    const activeChannels = [
      whatsappEnabled && "WhatsApp",
      emailStockAlertsEnabled && "E-mail",
      smsAlertsEnabled && "SMS"
    ].filter(Boolean);

    return {
      total: products.length,
      criticalCount,
      outOfStockCount,
      warningCount,
      healthyCount,
      noThresholdCount,
      totalStockValueAtRisk,
      activeChannels
    };
  }, [products, editedThresholds, whatsappEnabled, emailStockAlertsEnabled, smsAlertsEnabled]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const min = getProductMinStock(p);
      
      // Search match
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.supplier && p.supplier.toLowerCase().includes(q));

      // Category match
      const matchCat = selectedCategory === "TODOS" || p.category === selectedCategory;

      // Status match
      let matchStatus = true;
      if (statusFilter === "CRITICAL") {
        matchStatus = p.stock > 0 && p.stock <= min;
      } else if (statusFilter === "OUT_OF_STOCK") {
        matchStatus = p.stock <= 0;
      } else if (statusFilter === "WARNING") {
        matchStatus = p.stock > min && p.stock <= min + 3;
      } else if (statusFilter === "HEALTHY") {
        matchStatus = p.stock > min + 3;
      } else if (statusFilter === "NO_THRESHOLD") {
        matchStatus = min === 0;
      }

      return matchSearch && matchCat && matchStatus;
    });
  }, [products, searchQuery, selectedCategory, statusFilter, editedThresholds]);

  // Count of pending unsaved changes
  const pendingChangesCount = Object.keys(editedThresholds).length;

  // Handle threshold change for single product
  const handleThresholdChange = (productId: string, value: number) => {
    const validVal = Math.max(0, Math.floor(value));
    setEditedThresholds(prev => ({
      ...prev,
      [productId]: validVal
    }));
  };

  // Save single product threshold
  const handleSaveSingleProduct = (product: Product) => {
    const newMin = editedThresholds[product.id];
    if (newMin === undefined) return;

    const updatedProduct = { ...product, minStock: newMin };
    
    if (onUpdateProduct) {
      onUpdateProduct(updatedProduct);
    } else if (onUpdateProducts) {
      const updatedList = products.map(p => p.id === product.id ? updatedProduct : p);
      onUpdateProducts(updatedList);
    }

    // Clean from pending map
    setEditedThresholds(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    setSavedSuccessId(product.id);
    setTimeout(() => setSavedSuccessId(null), 2500);

    if (onAddAuditLog) {
      onAddAuditLog(
        "Configurar Limiar de Stock",
        "STOCK",
        `Limite mínimo de '${product.name}' ajustado para ${newMin} un.`
      );
    }

    if (onShowToast) {
      onShowToast(`Limiar mínimo de "${product.name}" definido para ${newMin} un!`, "success", "Limiar Atualizado");
    }
  };

  // Save all modified thresholds in bulk
  const handleSaveAllThresholds = () => {
    if (pendingChangesCount === 0) return;

    const updatedList = products.map(p => {
      if (editedThresholds[p.id] !== undefined) {
        return { ...p, minStock: editedThresholds[p.id] };
      }
      return p;
    });

    if (onUpdateProducts) {
      onUpdateProducts(updatedList);
    } else if (onUpdateProduct) {
      // Sequential fallback
      Object.entries(editedThresholds).forEach(([id, min]) => {
        const prod = products.find(p => p.id === id);
        if (prod) {
          onUpdateProduct({ ...prod, minStock: Number(min) });
        }
      });
    }

    if (onAddAuditLog) {
      onAddAuditLog(
        "Atualizar Limiares em Massa",
        "STOCK",
        `${pendingChangesCount} produtos tiveram os seus limites mínimos de stock atualizados por ${currentRole}.`
      );
    }

    if (onShowToast) {
      onShowToast(`${pendingChangesCount} limiares mínimos de stock guardados com sucesso!`, "success", "Guardado");
    }

    setEditedThresholds({});
  };

  // Cancel all pending changes
  const handleCancelAllThresholds = () => {
    setEditedThresholds({});
    if (onShowToast) onShowToast("Alterações pendentes canceladas.", "info");
  };

  // Apply bulk threshold tool
  const handleApplyBulkThreshold = () => {
    const targetProducts = bulkCategoryTarget === "FILTERED"
      ? filteredProducts
      : bulkCategoryTarget === "ALL"
        ? products
        : products.filter(p => p.category === bulkCategoryTarget);

    if (targetProducts.length === 0) {
      if (onShowToast) onShowToast("Nenhum produto encontrado para aplicar o limiar.", "warning");
      return;
    }

    const newEdits = { ...editedThresholds };
    targetProducts.forEach(p => {
      newEdits[p.id] = bulkThresholdValue;
    });

    setEditedThresholds(newEdits);
    setIsBulkOpen(false);

    if (onShowToast) {
      onShowToast(`Limiar de ${bulkThresholdValue} un aplicado a ${targetProducts.length} produtos! Clique em "Guardar Todos" para efetivar.`, "info", "Limiares Aplicados");
    }
  };

  // Save Automation & Notification Settings
  const handleSaveAutomationSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const payload: Partial<SystemSettings> = {
      whatsappEnabled,
      managerWhatsappPhone,
      whatsappProvider: whatsappProvider as any,
      whatsappMessageTemplate,
      emailStockAlertsEnabled,
      alertsRecipientEmail,
      reportRecipientEmail: alertsRecipientEmail,
      stockAlertEmailSubject,
      smsAlertsEnabled,
      smsManagerPhone,
      smsStockThreshold: Number(smsStockThreshold),
      stockAlertAutoSendOnSale,
      stockAlertSoundEnabled,
      stockAlertIncludeDeficit,
      reportHour,
      reportFrequency
    };

    onUpdateSettings(payload);

    if (onAddAuditLog) {
      onAddAuditLog(
        "Automação de Alertas",
        "CONFIGURAÇÕES",
        `Definições de automação de alertas de stock atualizadas. WhatsApp: ${whatsappEnabled ? 'Ativo' : 'Inativo'}, Email: ${emailStockAlertsEnabled ? 'Ativo' : 'Inativo'}.`
      );
    }

    if (onShowToast) {
      onShowToast("Configurações de automação e canais de alerta guardadas com sucesso!", "success", "Automação Atualizada");
    }
  };

  // Trigger formatted WhatsApp alert for single product
  const handleSendSingleProductWhatsApp = (product: Product) => {
    const phone = managerWhatsappPhone || settings.managerWhatsappPhone;
    if (!phone) {
      if (onShowToast) onShowToast("Por favor, configure o número de WhatsApp do Gestor nas opções de automação.", "warning", "WhatsApp Não Configurado");
      return;
    }

    const min = getProductMinStock(product);
    const deficit = Math.max(1, (min * 2) - product.stock);
    const cleanPhone = phone.replace(/[^0-9]/g, "");

    const msg = `⚠️ *ALERTA DE REPOSIÇÃO DE STOCK - ${settings.companyName || "OST Vendas"}* ⚠️\n\n` +
      `*Produto:* ${product.name}\n` +
      `*Código/SKU:* ${product.code}\n` +
      `*Categoria:* ${product.category || "Geral"}\n` +
      `*Fornecedor:* ${product.supplier || "N/A"}\n\n` +
      `📦 *Stock Atual:* ${product.stock} un\n` +
      `🚨 *Limiar Mínimo Definido:* ${min} un\n` +
      `📥 *Sugestão de Reposição:* +${deficit} un\n\n` +
      `_Notificação automática gerada conforme o limiar de stock individual configurado._`;

    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");

    if (onAddAuditLog) {
      onAddAuditLog(
        "Disparo Alerta WhatsApp",
        "STOCK",
        `Alerta de stock para '${product.name}' disparado via WhatsApp para ${phone}.`
      );
    }

    if (onShowToast) {
      onShowToast(`Mensagem de alerta para "${product.name}" aberta no WhatsApp!`, "success");
    }
  };

  // Trigger consolidated WhatsApp alert for ALL critical products
  const handleSendConsolidatedWhatsAppAlert = () => {
    const phone = managerWhatsappPhone || settings.managerWhatsappPhone;
    if (!phone) {
      if (onShowToast) onShowToast("Por favor, configure o número de WhatsApp do Gestor nas opções de automação.", "warning", "WhatsApp Não Configurado");
      return;
    }

    const criticalItems = products.filter(p => {
      const min = getProductMinStock(p);
      return p.stock <= min;
    });

    if (criticalItems.length === 0) {
      if (onShowToast) onShowToast("Todos os produtos estão com níveis de stock acima do limiar mínimo! Nenhum alerta necessário.", "info", "Stock Regular");
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "");
    let msg = `🚨 *RELATÓRIO CONSOLIDADO DE STOCK CRÍTICO - ${settings.companyName || "OST Vendas"}* 🚨\n`;
    msg += `📅 *Data/Hora:* ${new Date().toLocaleString("pt-MZ")}\n`;
    msg += `📊 *Total de Itens em Ruptura / Abaixo do Limite:* ${criticalItems.length}\n\n`;
    msg += `*LISTA DE PRODUTOS PARA REPOSIÇÃO IMEDIATA:*\n`;
    msg += `─────────────────────────\n`;

    criticalItems.forEach((p, idx) => {
      const min = getProductMinStock(p);
      const deficit = Math.max(1, (min * 2) - p.stock);
      const isZero = p.stock <= 0;
      msg += `${idx + 1}. ${isZero ? "🔴 *[ESGOTADO]*" : "⚠️ *[CRÍTICO]*"} *${p.name}*\n`;
      msg += `   • SKU: \`${p.code}\` | Cat: ${p.category || "Geral"}\n`;
      msg += `   • Qtd Atual: *${p.stock} un* (Limiar Mín: ${min} un)\n`;
      msg += `   • Repor: *+${deficit} un* | Fornecedor: ${p.supplier || "N/A"}\n\n`;
    });

    msg += `─────────────────────────\n`;
    msg += `_Favor providenciar a emissão de ordens de compra aos fornecedores._`;

    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");

    if (onAddAuditLog) {
      onAddAuditLog(
        "Alerta Consolidado WhatsApp",
        "STOCK",
        `Alerta consolidado de ${criticalItems.length} produtos críticos enviado via WhatsApp para ${phone}.`
      );
    }

    if (onShowToast) {
      onShowToast(`Relatório consolidado de ${criticalItems.length} produtos críticos aberto no WhatsApp!`, "success", "Alerta Disparado");
    }
  };

  // Trigger consolidated Email Alert
  const handleSendConsolidatedEmailAlert = () => {
    const email = alertsRecipientEmail || settings.alertsRecipientEmail || settings.reportRecipientEmail;
    if (!email) {
      if (onShowToast) onShowToast("Por favor, configure o E-mail de destino nas opções de automação.", "warning", "E-mail Não Configurado");
      return;
    }

    const criticalItems = products.filter(p => {
      const min = getProductMinStock(p);
      return p.stock <= min;
    });

    if (criticalItems.length === 0) {
      if (onShowToast) onShowToast("Todos os produtos estão com níveis de stock acima do limiar mínimo!", "info");
      return;
    }

    const subject = encodeURIComponent(`${stockAlertEmailSubject} (${criticalItems.length} itens) - ${settings.companyName || "OST Vendas"}`);
    
    let body = `RELATÓRIO DE REPOSIÇÃO DE STOCK - LIMIARES MÍNIMOS ATINGIDOS\n\n`;
    body += `Empresa: ${settings.companyName || "OST Vendas"}\n`;
    body += `Data: ${new Date().toLocaleString("pt-MZ")}\n`;
    body += `Total de Produtos Abaixo do Limiar: ${criticalItems.length}\n\n`;
    body += `PRODUTOS QUE REQUEREM REPOSIÇÃO:\n`;
    body += `==========================================\n`;

    criticalItems.forEach((p, idx) => {
      const min = getProductMinStock(p);
      const deficit = Math.max(1, (min * 2) - p.stock);
      body += `${idx + 1}. [${p.code}] ${p.name}\n`;
      body += `   Stock Atual: ${p.stock} un | Limite Mínimo: ${min} un | Reposição Sugerida: +${deficit} un\n`;
      body += `   Categoria: ${p.category} | Fornecedor: ${p.supplier || "N/A"}\n\n`;
    });

    body += `==========================================\n`;
    body += `Gerado automaticamente pelo Sistema OST Vendas.\n`;

    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

    if (onAddAuditLog) {
      onAddAuditLog(
        "Alerta Consolidado E-mail",
        "STOCK",
        `Alerta de ${criticalItems.length} produtos críticos preparado para envio ao e-mail ${email}.`
      );
    }

    if (onShowToast) {
      onShowToast(`Resumo de stock crítico de ${criticalItems.length} produtos preparado para envio!`, "success");
    }
  };

  // Export PDF Report of Thresholds & Alerts
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const companyName = settings.companyName || "OST Vendas";
      const now = new Date().toLocaleString("pt-MZ");

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(companyName, 14, 18);

      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text("Relatório de Limiares Mínimos de Stock & Alertas de Ruptura", 14, 25);
      doc.setFontSize(8);
      doc.text(`Emitido em: ${now} | Utilizador: ${currentRole}`, 14, 30);

      const tableData = filteredProducts.map(p => {
        const min = getProductMinStock(p);
        const isCritical = p.stock <= min && p.stock > 0;
        const isOut = p.stock <= 0;
        const status = isOut ? "ESGOTADO" : isCritical ? "CRÍTICO" : p.stock <= min + 3 ? "ATENÇÃO" : "REGULAR";
        const deficit = Math.max(0, (min * 2) - p.stock);

        return [
          p.code,
          p.name,
          p.category || "Geral",
          p.supplier || "N/A",
          `${p.stock} un`,
          `${min} un`,
          status,
          deficit > 0 ? `+${deficit} un` : "-"
        ];
      });

      autoTable(doc, {
        startY: 35,
        head: [["CÓDIGO", "PRODUTO", "CATEGORIA", "FORNECEDOR", "STOCK ATUAL", "LIMIAR MÍN.", "ESTADO", "REPOR"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [249, 115, 22],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2.5
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        }
      });

      doc.save(`limiares_stock_${new Date().toISOString().split("T")[0]}.pdf`);
      if (onShowToast) onShowToast("Relatório PDF de limiares exportado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      if (onShowToast) onShowToast("Erro ao exportar PDF de limiares.", "error");
    }
  };

  // Export CSV of Thresholds
  const handleExportCSV = () => {
    const headers = ["CODIGO", "NOME", "CATEGORIA", "FORNECEDOR", "STOCK_ATUAL", "LIMITE_MINIMO", "ESTADO_ALERTA", "REPOSICAO_SUGERIDA"];
    const rows = filteredProducts.map(p => {
      const min = getProductMinStock(p);
      const isCritical = p.stock <= min && p.stock > 0;
      const isOut = p.stock <= 0;
      const status = isOut ? "ESGOTADO" : isCritical ? "CRITICO" : "REGULAR";
      const deficit = Math.max(0, (min * 2) - p.stock);

      return [
        p.code,
        p.name,
        p.category || "Geral",
        p.supplier || "",
        p.stock.toString(),
        min.toString(),
        status,
        deficit.toString()
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `limiares_stock_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onShowToast) onShowToast("Ficheiro CSV exportado!", "success");
  };

  return (
    <div className="space-y-6" id="stock-thresholds-container">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-orange-950/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Sliders className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-tight text-white flex items-center gap-2">
                Configurações de Stock & Limiares Mínimos
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-white/20 rounded-full border border-white/30 tracking-wider">
                  Automático
                </span>
              </h2>
              <p className="text-xs text-orange-100/90 font-medium">
                Defina limites mínimos individuais por produto e automatize alertas no WhatsApp, E-mail, SMS e no POS.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-black/20 p-1 rounded-xl backdrop-blur-sm self-start md:self-auto border border-white/10">
          <button
            type="button"
            onClick={() => setActiveView("thresholds")}
            className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === "thresholds"
                ? "bg-white text-orange-700 shadow-sm"
                : "text-white/80 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Limiares Individuais
            {pendingChangesCount > 0 && (
              <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                {pendingChangesCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveView("automation")}
            className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === "automation"
                ? "bg-white text-orange-700 shadow-sm"
                : "text-white/80 hover:text-white"
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            Canais de Alerta & Automação
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Monitored */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Produtos Monitorizados</span>
            <span className="text-xl font-black text-slate-800 font-mono mt-0.5 block">{stats.total}</span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">{stats.total - stats.noThresholdCount} com limiar individual</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Critical Alerts */}
        <button
          type="button"
          onClick={() => { setStatusFilter("CRITICAL"); setActiveView("thresholds"); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            statusFilter === "CRITICAL"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-400"
              : "bg-white border-slate-200 hover:border-rose-300 shadow-sm"
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-rose-600 block uppercase tracking-wider">Stock Crítico / Abaixo</span>
            <span className="text-xl font-black text-rose-700 font-mono mt-0.5 block flex items-center gap-1.5">
              {stats.criticalCount}
              {stats.criticalCount > 0 && <span className="text-[10px] bg-rose-100 text-rose-700 font-extrabold px-1.5 py-0.5 rounded">Ação Urgente</span>}
            </span>
            <span className="text-[10px] text-rose-500 mt-0.5 block">{stats.outOfStockCount} itens esgotados</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </button>

        {/* Active Channels */}
        <button
          type="button"
          onClick={() => setActiveView("automation")}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left transition-all hover:border-blue-300 cursor-pointer flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] font-bold text-blue-600 block uppercase tracking-wider">Canais de Alerta Ativos</span>
            <span className="text-xl font-black text-blue-700 font-mono mt-0.5 block">
              {stats.activeChannels.length} / 3
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate max-w-[140px]">
              {stats.activeChannels.length > 0 ? stats.activeChannels.join(", ") : "Nenhum ativo"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
        </button>

        {/* Value at Risk / Safe */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Défice de Reposição</span>
            <span className="text-base md:text-lg font-black text-slate-800 font-mono mt-0.5 block truncate">
              {stats.totalStockValueAtRisk.toLocaleString()} <span className="text-xs text-slate-400">{currency}</span>
            </span>
            <span className="text-[10px] text-emerald-600 font-bold mt-0.5 block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {stats.healthyCount} produtos seguros
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* VIEW 1: THRESHOLDS MANAGEMENT TABLE */}
      {activeView === "thresholds" && (
        <div className="space-y-4 animate-in fade-in-50 duration-150">
          {/* Action & Filter Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar produto por nome, código SKU, código de barras, fornecedor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-orange-500 focus:outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:border-orange-500 focus:outline-none"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c === "TODOS" ? "Todas as Categorias" : c}</option>
                  ))}
                </select>

                {/* Bulk Actions Button */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsBulkOpen(!isBulkOpen)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-orange-600" />
                    <span>Ajuste em Massa</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isBulkOpen ? "rotate-180" : ""}`} />
                  </button>
                )}

                {/* Export Report Options */}
                <button
                  type="button"
                  onClick={handleExportPDF}
                  title="Exportar Relatório PDF"
                  className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs flex items-center justify-center transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  title="Exportar CSV / Excel"
                  className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs flex items-center justify-center transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                </button>
              </div>
            </div>

            {/* Quick Filter Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todos ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CRITICAL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  statusFilter === "CRITICAL"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                🚨 Críticos ({stats.criticalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("OUT_OF_STOCK")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  statusFilter === "OUT_OF_STOCK"
                    ? "bg-red-700 text-white"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                🔴 Esgotados ({stats.outOfStockCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("WARNING")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  statusFilter === "WARNING"
                    ? "bg-amber-500 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                🟡 Próximos ({stats.warningCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("HEALTHY")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  statusFilter === "HEALTHY"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                🟢 Confortáveis ({stats.healthyCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("NO_THRESHOLD")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  statusFilter === "NO_THRESHOLD"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                ⚙️ Sem Limite ({stats.noThresholdCount})
              </button>
            </div>

            {/* Collapsible Bulk Threshold Setup Drawer */}
            {isBulkOpen && canEdit && (
              <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl space-y-3 mt-2 animate-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-orange-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    Definição de Limiares em Massa
                  </h4>
                  <span className="text-[10px] text-orange-700 font-medium">Ajuste rápido para múltiplos artigos</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Aplicar a quais produtos:</label>
                    <select
                      value={bulkCategoryTarget}
                      onChange={(e) => setBulkCategoryTarget(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-bold text-slate-700"
                    >
                      <option value="FILTERED">Apenas Produtos Filtrados ({filteredProducts.length})</option>
                      <option value="ALL">Todos os Produtos do Catálogo ({products.length})</option>
                      {categories.filter(c => c !== "TODOS").map(c => (
                        <option key={c} value={c}>Categoria: {c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Novo Limiar Mínimo:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={bulkThresholdValue}
                        onChange={(e) => setBulkThresholdValue(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-black text-slate-900 font-mono"
                      />
                      <div className="flex gap-1">
                        {[2, 5, 10, 20].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setBulkThresholdValue(val)}
                            className="px-2 py-1.5 bg-white hover:bg-orange-100 border border-orange-200 rounded-lg text-[10px] font-bold text-orange-700 cursor-pointer"
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleApplyBulkThreshold}
                      className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Aplicar a Seleção
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pending Changes Sticky Floating Bar */}
          {pendingChangesCount > 0 && (
            <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-orange-500 animate-ping" />
                <span className="text-xs font-bold text-slate-200">
                  Tem <strong className="text-orange-400 font-extrabold">{pendingChangesCount}</strong> limiares mínimos alterados por guardar.
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCancelAllThresholds}
                  className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllThresholds}
                  className="flex-1 sm:flex-none px-5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 cursor-pointer transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar Todos os Limiares
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Produto & Categoria</th>
                    <th className="py-3 px-3 text-center">Stock Atual</th>
                    <th className="py-3 px-3">Limiar Mínimo Individual</th>
                    <th className="py-3 px-3 text-center">Estado do Alerta</th>
                    <th className="py-3 px-3">Reposição</th>
                    <th className="py-3 px-4 text-right">Ações de Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-bold text-sm text-slate-600">Nenhum produto encontrado</p>
                        <p className="text-xs text-slate-400 mt-0.5">Tente ajustar a sua pesquisa ou os filtros de categoria/estado.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const min = getProductMinStock(p);
                      const isModified = editedThresholds[p.id] !== undefined && editedThresholds[p.id] !== (p.minStock || 0);
                      const isOut = p.stock <= 0;
                      const isCritical = p.stock <= min && !isOut;
                      const isWarning = p.stock > min && p.stock <= min + 3;
                      const deficit = Math.max(0, (min * 2) - p.stock);
                      const isJustSaved = savedSuccessId === p.id;

                      return (
                        <tr 
                          key={p.id} 
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isModified ? "bg-orange-50/30" : ""
                          }`}
                        >
                          {/* Product Details */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl p-1 bg-slate-100 rounded-lg shrink-0">
                                {p.emoji || "📦"}
                              </span>
                              <div className="min-w-0">
                                <h4 className="font-bold text-slate-850 truncate max-w-[200px] md:max-w-[260px]">
                                  {p.name}
                                </h4>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                  <span>SKU: {p.code}</span>
                                  <span>•</span>
                                  <span className="text-slate-500 font-sans">{p.category || "Geral"}</span>
                                  {p.supplier && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-500 font-sans truncate max-w-[100px]">{p.supplier}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Current Stock */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`text-xs font-black font-mono px-2 py-0.5 rounded-full ${
                                isOut 
                                  ? "bg-red-100 text-red-700" 
                                  : isCritical 
                                    ? "bg-rose-100 text-rose-700 font-extrabold" 
                                    : isWarning 
                                      ? "bg-amber-100 text-amber-800" 
                                      : "bg-emerald-50 text-emerald-700"
                              }`}>
                                {p.stock} {p.weightBased ? "kg" : "un"}
                              </span>
                              {min > 0 && (
                                <div className="w-14 bg-slate-150 h-1 rounded-full mt-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full ${
                                      isOut ? "w-0" : isCritical ? "bg-rose-500 w-1/3" : isWarning ? "bg-amber-500 w-2/3" : "bg-emerald-500 w-full"
                                    }`} 
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Individual Min Threshold Control */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              {canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleThresholdChange(p.id, Math.max(0, min - 1))}
                                    className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer transition active:scale-95"
                                    title="Diminuir Limiar (-1)"
                                  >
                                    -
                                  </button>

                                  <input
                                    type="number"
                                    min="0"
                                    max="9999"
                                    value={min}
                                    onChange={(e) => handleThresholdChange(p.id, parseInt(e.target.value) || 0)}
                                    className={`w-14 px-2 py-1 text-center font-black font-mono rounded-lg text-xs border focus:outline-none transition ${
                                      isModified
                                        ? "border-orange-500 bg-orange-50 text-orange-900"
                                        : "border-slate-200 bg-white text-slate-800 focus:border-blue-500"
                                    }`}
                                  />

                                  <button
                                    type="button"
                                    onClick={() => handleThresholdChange(p.id, min + 1)}
                                    className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer transition active:scale-95"
                                    title="Aumentar Limiar (+1)"
                                  >
                                    +
                                  </button>

                                  {isModified && (
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSingleProduct(p)}
                                      title="Guardar este limiar"
                                      className="p-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg cursor-pointer transition shadow-sm"
                                    >
                                      <Save className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {isJustSaved && (
                                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                      <Check className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="font-mono font-bold text-slate-700">{min} un</span>
                              )}
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3 text-center">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 font-extrabold text-[9.5px] rounded-full border border-red-200">
                                🔴 Esgotado
                              </span>
                            ) : isCritical ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 font-extrabold text-[9.5px] rounded-full border border-rose-200 animate-pulse">
                                🚨 Alerta Ativo
                              </span>
                            ) : isWarning ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-[9.5px] rounded-full border border-amber-200">
                                🟡 Próximo
                              </span>
                            ) : min === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 font-medium text-[9.5px] rounded-full">
                                Sem Limiar
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-[9.5px] rounded-full border border-emerald-150">
                                🟢 Seguro
                              </span>
                            )}
                          </td>

                          {/* Suggested Repletion */}
                          <td className="py-3 px-3">
                            {deficit > 0 ? (
                              <span className="font-mono font-bold text-rose-600 text-xs flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                +{deficit} un
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">-</span>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* WhatsApp trigger */}
                              <button
                                type="button"
                                onClick={() => handleSendSingleProductWhatsApp(p)}
                                title="Disparar Alerta no WhatsApp"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                              >
                                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline text-[10px] font-bold">WhatsApp</span>
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

            {/* Consolidated Dispatch Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Info className="w-4 h-4 text-orange-600 shrink-0" />
                <span>
                  Produtos que atinjam o seu limite mínimo geram alertas em tempo real no POS e disparam notificações automatizadas.
                </span>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleSendConsolidatedWhatsAppAlert}
                  className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  Alerta Geral WhatsApp ({stats.criticalCount})
                </button>
                <button
                  type="button"
                  onClick={handleSendConsolidatedEmailAlert}
                  className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  Resumo por E-mail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: AUTOMATION & ALERT CHANNELS CONFIGURATION */}
      {activeView === "automation" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-850 text-base">Automação de Envio de Alertas</h3>
                <p className="text-xs text-slate-400">Configure os canais e regras automáticas de disparo quando produtos atingirem os limites configurados.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSaveAutomationSettings()}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-orange-600/20 cursor-pointer transition"
            >
              <Save className="w-4 h-4" />
              Guardar Automação
            </button>
          </div>

          <form onSubmit={handleSaveAutomationSettings} className="space-y-6">
            {/* Automatic Triggers Section */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-600" />
                Gatilhos Automáticos no Sistema & POS
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Sale Stock Auto Alert */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-orange-300 transition">
                  <input
                    type="checkbox"
                    checked={stockAlertAutoSendOnSale}
                    onChange={(e) => setStockAlertAutoSendOnSale(e.target.checked)}
                    disabled={!canEdit}
                    className="mt-0.5 rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Disparo Automático Imediato ao Vender</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Envia alerta instantâneo quando uma venda deixa o stock em ou abaixo do seu limiar individual.
                    </span>
                  </div>
                </label>

                {/* Sound & POS feedback */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-orange-300 transition">
                  <input
                    type="checkbox"
                    checked={stockAlertSoundEnabled}
                    onChange={(e) => setStockAlertSoundEnabled(e.target.checked)}
                    disabled={!canEdit}
                    className="mt-0.5 rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-orange-500" />
                      Alerta Sonoro & Visual no POS
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Toca sinal sonoro e exibe notificação quando o operador fatura o último item em limite crítico.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Channels Configuration Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* CHANNEL 1: WHATSAPP */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b pb-3 border-slate-200">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>Canal WhatsApp do Gestor</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whatsappEnabled}
                      onChange={(e) => setWhatsappEnabled(e.target.checked)}
                      disabled={!canEdit}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">WhatsApp do Destinatário de Alertas</label>
                    <input
                      type="text"
                      value={managerWhatsappPhone}
                      onChange={(e) => setManagerWhatsappPhone(e.target.value)}
                      disabled={!canEdit || !whatsappEnabled}
                      placeholder="+258 84 123 4567"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Número do gestor com código do país (ex: +258 para Moçambique).</p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Modo de Envio WhatsApp</label>
                    <select
                      value={whatsappProvider}
                      onChange={(e) => setWhatsappProvider(e.target.value as any)}
                      disabled={!canEdit || !whatsappEnabled}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                    >
                      <option value="DIRECT_LINK">Link Direto (WhatsApp Web / App)</option>
                      <option value="EVOLUTION_API">Evolution API (Automático via Gateway)</option>
                      <option value="TWILIO">Twilio WhatsApp Business</option>
                      <option value="META_CLOUD">Meta Cloud API Oficial</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Modelo de Mensagem de Alerta</label>
                    <textarea
                      rows={4}
                      value={whatsappMessageTemplate}
                      onChange={(e) => setWhatsappMessageTemplate(e.target.value)}
                      disabled={!canEdit || !whatsappEnabled}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-[11px] focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["{product_name}", "{current_stock}", "{threshold}", "{deficit}", "{sku}"].map(tag => (
                        <span key={tag} className="text-[9px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* CHANNEL 2: EMAIL */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b pb-3 border-slate-200">
                  <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span>Canal E-mail de Notificação</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailStockAlertsEnabled}
                      onChange={(e) => setEmailStockAlertsEnabled(e.target.checked)}
                      disabled={!canEdit}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">E-mail de Destino para Rupturas</label>
                    <input
                      type="email"
                      value={alertsRecipientEmail}
                      onChange={(e) => setAlertsRecipientEmail(e.target.value)}
                      disabled={!canEdit || !emailStockAlertsEnabled}
                      placeholder="armazem@empresa.co.mz"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">E-mail do encarregado de compras ou gestor de stock.</p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Assunto Padrão do E-mail</label>
                    <input
                      type="text"
                      value={stockAlertEmailSubject}
                      onChange={(e) => setStockAlertEmailSubject(e.target.value)}
                      disabled={!canEdit || !emailStockAlertsEnabled}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Horário do Resumo</label>
                      <input
                        type="time"
                        value={reportHour}
                        onChange={(e) => setReportHour(e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Frequência</label>
                      <select
                        value={reportFrequency}
                        onChange={(e) => setReportFrequency(e.target.value as any)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="daily">Diário</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CHANNEL 3: SMS & Fallback */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-200">
                <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <span>Canal SMS & Limiar Geral de Fallback</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsAlertsEnabled}
                    onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                    disabled={!canEdit}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone para Alertas SMS</label>
                  <input
                    type="text"
                    value={smsManagerPhone}
                    onChange={(e) => setSmsManagerPhone(e.target.value)}
                    disabled={!canEdit || !smsAlertsEnabled}
                    placeholder="+258 84 000 0000"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Dispara SMS via Twilio ou Gateway configurado.</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Limiar Mínimo Geral Padrão (Fallback)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={smsStockThreshold}
                    onChange={(e) => setSmsStockThreshold(Number(e.target.value))}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Utilizado caso um produto não tenha limiar individual definido.</p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            {canEdit && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-600/20 flex items-center gap-2 cursor-pointer transition"
                >
                  <Check className="w-4 h-4" />
                  Guardar Todas as Definições de Automação
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
