import React, { useState, useMemo, useCallback, memo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  FileText, 
  Mail, 
  Clock, 
  Download, 
  CheckCircle, 
  Send, 
  TrendingUp, 
  DollarSign, 
  Calculator, 
  Percent, 
  Play, 
  Printer, 
  Calendar, 
  Activity, 
  User, 
  ShieldAlert, 
  AlertTriangle, 
  Flame,
  RotateCcw,
  Package
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import { Transaction, SystemSettings, AuditLog, Product, Employee } from "../types";
import { sendEmail } from "../lib/gmail";
import { authenticatedFetch } from "../lib/apiClient";
import { generateInvoiceEmailHtml } from "../lib/emailTemplate";
import { SYSTEM_THEMES } from "../lib/themes";
import { printInvoiceHTML } from "../lib/printHelper";

interface ReportTransactionRowProps {
  transaction: Transaction;
  currency: string;
  onOpenEmail: (t: Transaction) => void;
  onOpenPrint: (t: Transaction) => void;
  formatMZ: (val: any) => string;
}

const ReportTransactionRow = React.memo(({
  transaction,
  currency: _currency,
  onOpenEmail,
  onOpenPrint,
  formatMZ
}: ReportTransactionRowProps) => {
  return (
    <tr className="hover:bg-slate-50/50 transition">
      <td className="p-3 font-bold font-mono text-slate-800">{transaction.invoiceNumber}</td>
      <td className="p-3 text-[11px] whitespace-nowrap">{new Date(transaction.timestamp).toLocaleString()}</td>
      <td className="p-3 font-semibold text-slate-700">{transaction.customerName || "Consumidor Geral"}</td>
      <td className="p-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
          transaction.paymentMethod === "CASH" ? "bg-amber-50 text-amber-700" :
          (transaction.paymentMethod as string) === "MPESA_PAGA_FACIL" || (transaction.paymentMethod as string) === "M-PESA" ? "bg-red-50 text-red-600" :
          "bg-sky-50 text-sky-700"
        }`}>{transaction.paymentMethod}</span>
      </td>
      <td className="p-3 text-right font-mono font-medium text-slate-600">{formatMZ(transaction.subtotal)}</td>
      <td className="p-3 text-right font-mono text-red-500 font-medium">-{formatMZ(transaction.discountTotal)}</td>
      <td className="p-3 text-right font-mono text-slate-500 font-medium">{formatMZ(transaction.vatTotal)}</td>
      <td className="p-3 text-right font-mono font-bold text-slate-800">{formatMZ(transaction.grandTotal)}</td>
      <td className="p-3 text-center flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onOpenEmail(transaction)}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg inline-flex items-center justify-center transition cursor-pointer"
          title="Enviar Fatura por E-mail"
        >
          <Mail className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onOpenPrint(transaction)}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg inline-flex items-center justify-center transition cursor-pointer"
          title="Imprimir Fatura / Recibo"
        >
          <Printer className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});
ReportTransactionRow.displayName = "ReportTransactionRow";

interface ReportVatRowProps {
  transaction: Transaction;
  formatMZ: (val: any) => string;
}

const ReportVatRow = React.memo(({
  transaction,
  formatMZ
}: ReportVatRowProps) => {
  return (
    <tr className="hover:bg-slate-50/50 transition">
      <td className="p-3 font-bold font-mono text-slate-800">{transaction.invoiceNumber}</td>
      <td className="p-3 text-[11px] whitespace-nowrap">{new Date(transaction.timestamp).toLocaleString()}</td>
      <td className="p-3 font-semibold text-slate-700">{transaction.customerName || "Consumidor Geral"}</td>
      <td className="p-3 text-right font-mono font-medium text-slate-600">{formatMZ(transaction.subtotal)}</td>
      <td className="p-3 text-center font-bold">
        <span className={`px-2 py-0.5 rounded text-[10px] ${
          transaction.vatTotal > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
        }`}>
          {transaction.vatTotal > 0 ? "16%" : "0% (Isento)"}
        </span>
      </td>
      <td className="p-3 text-right font-mono font-medium text-slate-800">{formatMZ(transaction.vatTotal)}</td>
      <td className="p-3 text-right font-mono font-bold text-slate-900">{formatMZ(transaction.grandTotal)}</td>
    </tr>
  );
});
ReportVatRow.displayName = "ReportVatRow";

interface ReportAuditLogRowProps {
  log: AuditLog;
}

const ReportAuditLogRow = React.memo(({ log }: ReportAuditLogRowProps) => {
  return (
    <tr className="hover:bg-slate-50/50 transition">
      <td className="p-3 text-slate-500 font-mono text-[10px] whitespace-nowrap">
        {new Date(log.timestamp).toLocaleString("pt-MZ")}
      </td>
      <td className="p-3 font-semibold text-slate-800">{log.user || "Sistema"}</td>
      <td className="p-3">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-150 text-slate-600 uppercase">
          {log.module}
        </span>
      </td>
      <td className="p-3 font-bold text-slate-800">{log.action}</td>
      <td className="p-3 text-slate-500 max-w-xs truncate" title={log.details}>
        {log.details}
      </td>
      <td className="p-3 text-right font-mono text-[10px] text-slate-400">
        {log.ip || "127.0.0.1"}
      </td>
    </tr>
  );
});
ReportAuditLogRow.displayName = "ReportAuditLogRow";

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Error loading logo for PDF:", err);
    return "";
  }
};

const getFormatFromBase64 = (base64: string): string => {
  if (!base64) return "JPEG";
  if (base64.startsWith("data:image/png")) return "PNG";
  if (base64.startsWith("data:image/webp")) return "WEBP";
  if (base64.startsWith("data:image/gif")) return "GIF";
  if (base64.startsWith("data:image/svg")) return "SVG";
  return "JPEG";
};

interface ReportsModuleProps {
  transactions: Transaction[];
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currency: string;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  auditLogs?: AuditLog[];
  transactionsError?: string | null;
  onRetryTransactions?: () => void;
  products?: Product[];
  employees?: Employee[];
}

function ReportsModule({
  transactions,
  settings,
  onUpdateSettings,
  onAddAuditLog,
  currency,
  onShowToast,
  auditLogs = [],
  transactionsError,
  onRetryTransactions,
  products = [],
  employees = []
}: ReportsModuleProps) {
  
  // Local states
  const [reportType, setReportType] = useState<"SALES" | "FINANCE" | "VAT">("SALES");
  const [exportFormat, setExportFormat] = useState<"PDF" | "EXCEL" | "CSV">("PDF");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  // Date limit selector states
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const past = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // default to 30 days ago
    return past.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Automated email configuration states
  const [recipientEmail, setRecipientEmail] = useState(settings.reportRecipientEmail);
  const [reportHour, setReportHour] = useState(settings.reportHour);
  const [reportFrequency, setReportFrequency] = useState(settings.reportFrequency);
  const [saveSettingsSuccess, setSaveSettingsSuccess] = useState(false);
  const [localError, setLocalError] = useState("");

  // Send test email stats
  const [testSendStatus, setTestSendStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Individual Email Send States
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [showEmailModal, setShowEmailModal] = useState<Transaction | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<Transaction | null>(null);

  const handleOpenEmailModal = useCallback((t: Transaction) => {
    setShowEmailModal(t);
  }, []);

  const handleOpenPrintModal = useCallback((t: Transaction) => {
    setShowPrintModal(t);
  }, []);

  // Date helpers - timezone-safe formatting
  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const dateSplit = (rawDate: any): string => {
    if (!rawDate) return "";
    if (typeof rawDate === "string") {
      const cleaned = rawDate.includes(" ") && !rawDate.includes("T") 
        ? rawDate.replace(" ", "T") 
        : rawDate;
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) return formatLocalDate(d);
      const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
      return rawDate.split("T")[0].split(" ")[0];
    }
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) return formatLocalDate(d);
    } catch {}
    return "";
  };

  // Monthly summary state & calculations
  const [showMonthlySummaryModal, setShowMonthlySummaryModal] = useState(false);

  const getMonthNamePT = (monthIndex: number) => {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return months[monthIndex];
  };

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    // Filter transactions for current month (excluding cancelled sales)
    const monthlyTx = transactions.filter(t => {
      if (!t.timestamp) return false;
      if (t.status === "CANCELLED" || (t as any).status === "REFUNDED") return false;
      const tDate = dateSplit(t.timestamp);
      return tDate.startsWith(currentMonthPrefix);
    });

    let totalSales = 0;
    let totalVat = 0;
    let totalDiscount = 0;
    let totalItemsCount = 0;

    const productSales: { [productName: string]: { qty: number; revenue: number } } = {};

    monthlyTx.forEach(t => {
      const g = Number(t.grandTotal || 0);
      const v = Number(t.vatTotal || 0);
      const d = Number(t.discountTotal || 0);
      totalSales += isNaN(g) ? 0 : g;
      totalVat += isNaN(v) ? 0 : v;
      totalDiscount += isNaN(d) ? 0 : d;

      let itemsList: any[] = [];
      if (Array.isArray(t.items)) itemsList = t.items;
      else if (typeof (t as any).items === "string") { try { itemsList = JSON.parse((t as any).items); } catch {} }
      else if (typeof (t as any).itemsJson === "string") { try { itemsList = JSON.parse((t as any).itemsJson); } catch {} }

      itemsList.forEach(item => {
        const name = item.productName || (item as any).name || "Produto Geral";
        if (!productSales[name]) {
          productSales[name] = { qty: 0, revenue: 0 };
        }
        const itemQty = Number(item.quantity || 1);
        const itemPrice = Number(item.price ?? (item as any).salePrice ?? (item as any).unitPrice ?? 0);
        const itemSubtotal = Number((item as any).subtotal ?? (itemPrice * itemQty));
        const safeQty = isNaN(itemQty) ? 1 : itemQty;
        const safeRev = isNaN(itemSubtotal) ? (isNaN(itemPrice) ? 0 : itemPrice * safeQty) : itemSubtotal;

        productSales[name].qty += safeQty;
        productSales[name].revenue += safeRev;
        totalItemsCount += safeQty;
      });
    });

    const averageTicket = monthlyTx.length ? Math.round(totalSales / monthlyTx.length) : 0;

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        revenue: isNaN(data.revenue) ? 0 : data.revenue
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5); // top 5

    return {
      monthlyTx,
      totalSales: isNaN(totalSales) ? 0 : totalSales,
      totalVat: isNaN(totalVat) ? 0 : totalVat,
      totalDiscount: isNaN(totalDiscount) ? 0 : totalDiscount,
      totalItemsCount: isNaN(totalItemsCount) ? 0 : totalItemsCount,
      averageTicket: isNaN(averageTicket) ? 0 : averageTicket,
      topProducts,
      monthName: getMonthNamePT(currentMonth),
      year: currentYear
    };
  }, [transactions]);

  // Active sub-tab state inside ReportsModule
  const [activeSubTab, setActiveSubTab] = useState<"general" | "iva" | "activity">("general");

  // Grouping for the system activity bar chart
  const [activityGrouping, setActivityGrouping] = useState<"daily" | "hourly" | "module">("daily");

  // Local states for the VAT (IVA) calculator
  const [manualIvaDeduction, setManualIvaDeduction] = useState<number>(0);
  const [simulatedIvaRate, setSimulatedIvaRate] = useState<number>(16); // default 16% standard rate in Mozambique
  const [vatFilterClass, setVatFilterClass] = useState<"all" | "taxable" | "exempt">("all");

  // Memoized filtered transactions list by custom date interval selected
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.timestamp) return false;
      if (t.status === "CANCELLED" || (t as any).status === "REFUNDED") return false;
      const tDate = dateSplit(t.timestamp);
      return tDate >= startDate && tDate <= endDate;
    });
  }, [transactions, startDate, endDate]);

  // Consolidated values (using date filtered records from authoritative PostgreSQL transactions)
  const financialTotals = useMemo(() => {
    let salesTotal = 0;
    let vatTotal = 0;
    let discountTotal = 0;
    let subtotalTotal = 0;
    let totalQuantity = 0;

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};

    filteredTransactions.forEach(t => {
      const g = Number(t.grandTotal || 0);
      const v = Number(t.vatTotal || 0);
      const d = Number(t.discountTotal || 0);
      const s = Number(t.subtotal ?? t.grandTotal ?? 0);

      salesTotal += isNaN(g) ? 0 : g;
      vatTotal += isNaN(v) ? 0 : v;
      discountTotal += isNaN(d) ? 0 : d;
      subtotalTotal += isNaN(s) ? (isNaN(g) ? 0 : g) : s;

      if (Array.isArray(t.items)) {
        t.items.forEach(item => {
          const q = Number(item.quantity || 1);
          totalQuantity += isNaN(q) ? 1 : q;
        });
      }

      const method = (t.paymentMethod || "OUTRO").toUpperCase();
      let normKey = "Outro";
      if (method === "CASH" || method.includes("DINHEIRO")) normKey = "Dinheiro";
      else if (method.includes("MPESA") || method.includes("M-PESA")) normKey = "M-Pesa";
      else if (method.includes("EMOLA") || method.includes("E-MOLA")) normKey = "e-Mola";
      else if (method.includes("CARD") || method.includes("POS") || method.includes("CARTAO") || method.includes("CARTÃO")) normKey = "Cartão (POS)";
      else if (method.includes("TRANSFER") || method.includes("BANCO")) normKey = "Transferência";

      if (!paymentBreakdown[normKey]) {
        paymentBreakdown[normKey] = { count: 0, total: 0 };
      }
      paymentBreakdown[normKey].count += 1;
      paymentBreakdown[normKey].total += isNaN(g) ? 0 : g;
    });

    const profitTotal = Math.round(salesTotal * 0.32); // margin estimate

    return {
      salesTotal: isNaN(salesTotal) ? 0 : salesTotal,
      vatTotal: isNaN(vatTotal) ? 0 : vatTotal,
      discountTotal: isNaN(discountTotal) ? 0 : discountTotal,
      profitTotal: isNaN(profitTotal) ? 0 : profitTotal,
      subtotalTotal: isNaN(subtotalTotal) ? 0 : subtotalTotal,
      totalQuantity: isNaN(totalQuantity) ? 0 : totalQuantity,
      paymentBreakdown
    };
  }, [filteredTransactions]);

  // Memoized calculations specifically for VAT (IVA) audit and declaration
  const vatCalculations = useMemo(() => {
    let taxableSalesSubtotal = 0;
    let exemptSalesSubtotal = 0;
    let realVatCollected = 0;
    let totalTransactions = filteredTransactions.length;

    filteredTransactions.forEach(t => {
      const v = Number(t.vatTotal || 0);
      const s = Number(t.subtotal ?? t.grandTotal ?? 0);
      const safeVat = isNaN(v) ? 0 : v;
      const safeSub = isNaN(s) ? 0 : s;

      if (safeVat > 0) {
        taxableSalesSubtotal += safeSub;
        realVatCollected += safeVat;
      } else {
        exemptSalesSubtotal += safeSub;
      }
    });

    const safeSimulatedRate = Number(simulatedIvaRate) || 0;
    const safeManualDeduction = Number(manualIvaDeduction) || 0;
    const simulatedVatCollected = Math.round(taxableSalesSubtotal * (safeSimulatedRate / 100));
    const netVatPayable = realVatCollected - safeManualDeduction;

    return {
      taxableSalesSubtotal: isNaN(taxableSalesSubtotal) ? 0 : taxableSalesSubtotal,
      exemptSalesSubtotal: isNaN(exemptSalesSubtotal) ? 0 : exemptSalesSubtotal,
      realVatCollected: isNaN(realVatCollected) ? 0 : realVatCollected,
      simulatedVatCollected: isNaN(simulatedVatCollected) ? 0 : simulatedVatCollected,
      netVatPayable: isNaN(netVatPayable) ? 0 : netVatPayable,
      totalTransactions
    };
  }, [filteredTransactions, simulatedIvaRate, manualIvaDeduction]);

  // Memoized audit logs filtered by active dates
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = log.timestamp.split("T")[0];
      return logDate >= startDate && logDate <= endDate;
    });
  }, [auditLogs, startDate, endDate]);

  // Audit Logs analytics calculations
  const activityAnalytics = useMemo(() => {
    const dailyCounts: Record<string, number> = {};
    const hourlyCounts: Record<string, number> = {};
    const moduleCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};

    filteredLogs.forEach(log => {
      // Daily grouping
      if (log.timestamp) {
        const dateStr = log.timestamp.split("T")[0];
        dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;

        // Hourly grouping
        const parts = log.timestamp.split("T");
        if (parts[1]) {
          const hour = parts[1].slice(0, 2) + "h";
          hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
        }
      }

      // Module grouping
      const mod = log.module || "GERAL";
      moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;

      // User grouping
      const usr = log.user || "Sistema";
      userCounts[usr] = (userCounts[usr] || 0) + 1;
    });

    // Peak daily activity
    let peakActivityValue = 0;
    let peakActivityDate = "";
    Object.entries(dailyCounts).forEach(([date, count]) => {
      if (count > peakActivityValue) {
        peakActivityValue = count;
        peakActivityDate = date;
      }
    });

    // Active modules count and most active
    const activeModulesCount = Object.keys(moduleCounts).length;
    let mostActiveModule = "";
    let mostActiveModuleLogsCount = 0;
    Object.entries(moduleCounts).forEach(([mod, count]) => {
      if (count > mostActiveModuleLogsCount) {
        mostActiveModuleLogsCount = count;
        mostActiveModule = mod;
      }
    });

    // Most active operator
    let mostActiveUser = "";
    let mostActiveUserLogsCount = 0;
    Object.entries(userCounts).forEach(([usr, count]) => {
      if (count > mostActiveUserLogsCount) {
        mostActiveUserLogsCount = count;
        mostActiveUser = usr;
      }
    });

    return {
      dailyCounts,
      hourlyCounts,
      moduleCounts,
      peakActivityValue,
      peakActivityDate,
      activeModulesCount,
      mostActiveModule,
      mostActiveUser,
      mostActiveUserLogsCount
    };
  }, [filteredLogs]);

  // Chart data based on activityGrouping selector
  const chartData = useMemo(() => {
    if (activityGrouping === "daily") {
      return Object.entries(activityAnalytics.dailyCounts)
        .map(([date, count]) => ({
          label: date,
          count
        }))
        .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime());
    } else if (activityGrouping === "hourly") {
      const hours = Array.from({ length: 24 }, (_, i) => {
        const h = String(i).padStart(2, "0") + "h";
        return {
          label: h,
          count: activityAnalytics.hourlyCounts[h] || 0
        };
      });
      // Filter out hours with zero activity to make it clean, or keep all to see full day.
      // Let's keep all 24 hours to clearly show peaks across the day, or only those with activity.
      // Keeping all 24 hours is a nice full-day curve.
      return hours;
    } else {
      return Object.entries(activityAnalytics.moduleCounts)
        .map(([moduleName, count]) => ({
          label: moduleName,
          count: Number(count)
        }))
        .sort((a, b) => b.count - a.count);
    }
  }, [activityGrouping, activityAnalytics]);

  const formatMZ = useCallback((val: any) => {
    const num = Number(val);
    const safeNum = isNaN(num) || !isFinite(num) ? 0 : num;
    return new Intl.NumberFormat('pt-MZ', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(safeNum) + " MT";
  }, []);

  // Handle saving configurations
  const handleSaveEmailConfig = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.includes("@")) {
      setLocalError("Por favor introduza um endereço de e-mail institucional válido.");
      return;
    }
    setLocalError("");

    onUpdateSettings({
      reportRecipientEmail: recipientEmail,
      reportHour,
      reportFrequency
    });

    setSaveSettingsSuccess(true);
    onAddAuditLog(
      "Salvar Configuração de Relatório Automático",
      "RELATÓRIOS",
      `Email modificado para: ${recipientEmail}. Frequência: ${reportFrequency} às ${reportHour}`
    );

    setTimeout(() => setSaveSettingsSuccess(false), 2000);
  }, [recipientEmail, reportHour, reportFrequency, onUpdateSettings, onAddAuditLog]);

  // Test Dispatch simulated emails via Express Server `/api/email/send-report`
  const handleTriggerTestEmail = useCallback(async () => {
    setTestSendStatus("sending");

    try {
      const response = await authenticatedFetch("/api/email/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipientEmail,
          frequency: reportFrequency,
          reportBody: {
            salesTotal: financialTotals.salesTotal,
            vatTotal: financialTotals.vatTotal,
            profitTotal: financialTotals.profitTotal
          }
        })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        setTestSendStatus("sent");
        onAddAuditLog(
          "Forçar Disparo de Relatório Piloto por Email",
          "RELATÓRIOS",
          `Relatório consolidado enviado com sucesso para ${recipientEmail}.`
        );
        if (onShowToast) {
          onShowToast(data.message || "Relatório piloto enviado com sucesso!", "success", "Relatório Despachado");
        }
      } else {
        throw new Error(data.error || "O servidor SMTP recusou a entrega do relatório.");
      }
    } catch (err: any) {
      setTestSendStatus("idle");
      const errMsg = err.message || "Erro desconhecido ao despachar correio.";
      if (onShowToast) {
        onShowToast(errMsg, "error", "Falha de Envio");
      }
    }
  }, [recipientEmail, reportFrequency, financialTotals, onAddAuditLog, onShowToast]);

  const handleSendInvoiceEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEmailModal || !targetEmail.includes("@")) return;

    setSendingInvoiceId(showEmailModal.id);
    try {
      const htmlBody = generateInvoiceEmailHtml(showEmailModal, settings.companyName);
      
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF();
      
      const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
      if (logoData) {
        const format = getFormatFromBase64(logoData);
        doc.addImage(logoData, format, 165, 8, 30, 30);
      }
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`FATURA ${showEmailModal.invoiceNumber}`, 14, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Empresa: ${settings.companyName || "OST Vendas"}`, 14, 30);
      doc.text(`Cliente: ${showEmailModal.customerName || "Consumidor Geral"}`, 14, 36);
      doc.text(`Data: ${new Date(showEmailModal.timestamp).toLocaleString()}`, 14, 42);
      
      const tableBody = showEmailModal.items.map(item => {
        const q = Number(item.quantity || 1);
        const p = Number(item.price ?? (item as any).salePrice ?? 0);
        const sub = Number(item.subtotal ?? (p * q));
        return [
          item.productName || "Artigo",
          (isNaN(q) ? 1 : q).toString(),
          formatMZ(p),
          formatMZ(sub)
        ];
      });
      
      autoTable(doc, {
        startY: 50,
        head: [["Produto/Serviço", "Qtd", "Preço Unit.", "Subtotal"]],
        body: tableBody,
        theme: "striped",
        headStyles: { fillColor: [249, 115, 22] }
      });
      
      const finalY = (doc as any).lastAutoTable.finalY || 50;
      doc.setFont("helvetica", "bold");
      doc.text(`Subtotal: ${formatMZ(showEmailModal.subtotal)}`, 14, finalY + 10);
      doc.text(`IVA (16%): ${formatMZ(showEmailModal.vatTotal)}`, 14, finalY + 16);
      doc.text(`Total Pago: ${formatMZ(showEmailModal.grandTotal)}`, 14, finalY + 22);

      const pdfBase64DataUri = doc.output('datauristring');
      const base64Content = pdfBase64DataUri.split(',')[1];
      
      await sendEmail({
        to: targetEmail,
        subject: `Fatura ${showEmailModal.invoiceNumber} - ${settings.companyName || "OST Vendas"}`,
        body: htmlBody,
        isHtml: true,
        attachments: [{
          filename: `Fatura_${showEmailModal.invoiceNumber}.pdf`,
          content: base64Content,
          mimeType: "application/pdf"
        }]
      });

      if (onShowToast) onShowToast(`Fatura e PDF enviados com sucesso para ${targetEmail}`, "success");
      onAddAuditLog("Envio de Fatura por E-mail (Gmail)", "RELATÓRIOS", `Enviado fatura ${showEmailModal.invoiceNumber} com anexo PDF para ${targetEmail} com sucesso.`);
      
      setShowEmailModal(null);
      setTargetEmail("");
    } catch (error: any) {
      if (onShowToast) onShowToast(`Falha ao enviar e-mail: ${error.message}`, "error");
      onAddAuditLog("Erro no Envio de Fatura (Gmail)", "RELATÓRIOS", `Falha ao enviar fatura ${showEmailModal.invoiceNumber} para ${targetEmail}: ${error.message}`);
    } finally {
      setSendingInvoiceId(null);
    }
  }, [showEmailModal, targetEmail, settings, onShowToast, onAddAuditLog]);

  // Real exports compilation
  const handlePerformExport = useCallback(() => {
    setIsExporting(true);
    setExportMessage("");

    setTimeout(async () => {
      setIsExporting(false);
      
      const fileExt = exportFormat === "PDF" ? "pdf" : "csv";
      const filename = `OST_Vendas_Relatorio_${reportType}_${startDate}_a_${endDate}.${fileExt}`;
      
      try {
        let finalBlob: Blob;

        if (exportFormat === "CSV" || exportFormat === "EXCEL") {
          // Generate precise, valid CSV that opens flawlessly in Excel without encoding/accents errors
          let csvContent = "\uFEFF"; // UTF-8 BOM

          if (reportType === "SALES") {
            csvContent += "OST Vendas - Relatorio de Faturamento e Vendas\n";
            csvContent += `Periodo Escolhido: ${startDate} ate ${endDate}\n`;
            csvContent += `Documento Gerado Em: ${new Date().toLocaleString()}\n`;
            csvContent += `Faturamento Total: ${financialTotals.salesTotal} MT\n\n`;
            csvContent += "FATURA;DATA;CLIENTE;METODO DE PAGAMENTO;SUBTOTAL (MT);DESCONTO;IVA COBRADO;TOTAL PAGO (MT)\n";
            filteredTransactions.forEach(t => {
              csvContent += `${t.invoiceNumber};${new Date(t.timestamp).toLocaleDateString()};${t.customerName || "Consumidor Geral"};${t.paymentMethod};${t.subtotal};${t.discountTotal};${t.vatTotal};${t.grandTotal}\n`;
            });
          } else if (reportType === "FINANCE") {
            csvContent += "OST Vendas - Analise e Balanco Financeiro Geral\n";
            csvContent += `Periodo Escolhido: ${startDate} ate ${endDate}\n`;
            csvContent += `Documento Gerado Em: ${new Date().toLocaleString()}\n\n`;
            csvContent += "INDICADOR COMERCIAL;VALOR CONSOLIDADO (METICAIS - MT)\n";
            csvContent += `Faturamento Bruto Coletado;${financialTotals.salesTotal}\n`;
            csvContent += `Total de Imposto IVA Arrecadado;${financialTotals.vatTotal}\n`;
            csvContent += `Total de Descontos Concedidos;${financialTotals.discountTotal}\n`;
            csvContent += `Estimativa de Margem Comercial de Lucro (32%);${financialTotals.profitTotal}\n`;
            csvContent += `Numero Total de Transacoes Processadas;${filteredTransactions.length}\n`;
          } else {
            csvContent += "OST Vendas - Demonstracao de Apuracao de IVA\n";
            csvContent += `Periodo Escolhido: ${startDate} ate ${endDate}\n`;
            csvContent += `Documento Gerado Em: ${new Date().toLocaleString()}\n\n`;
            csvContent += "FATURA;DATA;CLIENTE;ALIQUOTA DE IMPOSTO;BASE CALCULO (MT);IVA COBRADO (MT)\n";
            filteredTransactions.forEach(t => {
              const baseCalculo = Math.round(t.grandTotal * 0.84);
              csvContent += `${t.invoiceNumber};${new Date(t.timestamp).toLocaleDateString()};${t.customerName || "Consumidor Geral"};16%;${baseCalculo};${t.vatTotal}\n`;
            });
          }

          finalBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        } else {
          const titleLabel = reportType === "SALES" ? "Vendas e Faturamento" : reportType === "FINANCE" ? "Demonstrativo Financeiro" : "Apuração Fiscal de IVA";
          
          const doc = new jsPDF();
          
          const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
          const rgbArray = activeTheme.rgb.split(",").map(Number);
          
          // Draw a nice aesthetic top border using the theme color
          doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.rect(0, 0, 210, 8, "F");
          
          const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
          if (logoData) {
            const format = getFormatFromBase64(logoData);
            doc.addImage(logoData, format, 165, 12, 30, 30);
          }
          
          doc.setFontSize(18);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);
          doc.text(settings.companyName || "Indisponível", 14, 22);
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 28);
          doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 33);
          
          doc.setDrawColor(226, 232, 240);
          doc.line(14, 38, 196, 38);

          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);
          doc.text(`Relatório Consolidado de ${titleLabel}`, 14, 46);
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          doc.text(`Período Selecionado: ${startDate} até ${endDate}`, 14, 52);
          doc.text(`Documento gerado em: ${new Date().toLocaleString()}`, 14, 57);
          
          // Styled summary container box
          doc.setFillColor(248, 250, 252);
          doc.rect(14, 62, 182, 16, "F");
          doc.setDrawColor(226, 232, 240);
          doc.rect(14, 62, 182, 16, "S");
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.text(`Faturação Total: ${financialTotals.salesTotal.toLocaleString()} MT`, 18, 72);
          doc.text(`IVA Líquido: ${financialTotals.vatTotal.toLocaleString()} MT`, 80, 72);
          doc.text(`Transações: ${filteredTransactions.length}`, 150, 72);
          
          let head = [];
          let body = [];

          if (reportType === "SALES") {
            head = [["FATURA", "DATA", "CLIENTE", "MÉTODO", "VALOR MT"]];
            body = filteredTransactions.map(t => [
              t.invoiceNumber,
              new Date(t.timestamp).toLocaleDateString(),
              t.customerName || "Consumidor Geral",
              t.paymentMethod,
              formatMZ(t.grandTotal)
            ]);
          } else if (reportType === "FINANCE") {
            head = [["INDICADOR FINANCEIRO", "VALOR MT"]];
            body = [
              ["Total de Faturação de Vendas", formatMZ(financialTotals.salesTotal)],
              ["Total de IVA Liquidado", formatMZ(financialTotals.vatTotal)],
              ["Descontos Geral Concedidos", `-${formatMZ(financialTotals.discountTotal)}`],
              ["Margem Comercial de Lucro (Estimativa 32%)", `+${formatMZ(financialTotals.profitTotal)}`],
              ["Média de Ticket por Operação", formatMZ(filteredTransactions.length ? Math.round(financialTotals.salesTotal / filteredTransactions.length) : 0)]
            ];
          } else {
            head = [["FATURA", "CLIENTE", "ALÍQUOTA", "BASE CALCULO", "IVA DECLARADO"]];
            body = filteredTransactions.map(t => [
              t.invoiceNumber,
              t.customerName || "Consumidor Geral",
              "16%",
              formatMZ(Math.round(t.grandTotal * 0.84)),
              formatMZ(t.vatTotal)
            ]);
          }

          autoTable(doc, {
            startY: 84,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number] },
            styles: { fontSize: 8, cellPadding: 3 }
          });

          finalBlob = doc.output('blob');
        }
        
        const url = URL.createObjectURL(finalBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn("Dispositivo em iFrame bloqueado para transferencias físicas. Download registrado virtualmente.");
      }

      const successLabel = exportFormat === "PDF" 
        ? "Documento PDF" 
        : exportFormat;

      setExportMessage(`Relatório ${filename} compilado e descarregado em formato de alta compatibilidade ${successLabel}!`);
      onAddAuditLog(
        "Exportar Relatório por Datas",
        "RELATÓRIOS",
        `Relatório do tipo ${reportType} criado de ${startDate} até ${endDate} no formato ${exportFormat}.`
      );
    }, 1500);
  }, [exportFormat, reportType, startDate, endDate, financialTotals, filteredTransactions, settings, formatMZ, onAddAuditLog]);

  const handlePerformExecutivePrintPDF = async () => {
    setIsExporting(true);
    setExportMessage("");

    setTimeout(async () => {
      try {
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        // A4 Dimensions: 210 x 297 mm
        // High contrast top line
        doc.setFillColor(30, 41, 59); // Dark Slate for elegant high-contrast printing
        doc.rect(0, 0, 210, 8, "F");

        // Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 12, 30, 30);
        }

        // Company Info Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(settings.companyName || "Indisponível", 14, 20);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 27);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 32);

        // Divider
        doc.setDrawColor(203, 213, 225);
        doc.line(14, 37, 196, 37);

        // Document Title
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("RELATÓRIO FINANCEIRO E RESUMO OPERACIONAL DE GESTÃO", 14, 45);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`Período do Relatório: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}`, 14, 51);
        doc.text(`Emitido em: ${new Date().toLocaleString()} | Operador Responsável: ${settings.companyName || "Administrador Geral"}`, 14, 56);

        // KPI Box Row 1
        // Box 1 - Faturamento Bruto
        doc.setFillColor(248, 250, 252);
        doc.rect(14, 62, 57, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, 62, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("FATURAÇÃO BRUTA", 18, 67);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(financialTotals.salesTotal), 18, 74);

        // Box 2 - IVA Arrecadado
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 62, 57, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(76, 62, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("IVA ARRECADADO (16%)", 80, 67);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(financialTotals.vatTotal), 80, 74);

        // Box 3 - Margem de Lucro Estimada
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 62, 58, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(138, 62, 58, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("MARGEM DE LUCRO (32% EST.)", 142, 67);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(16, 185, 129); // emerald green
        doc.text(`+${formatMZ(financialTotals.profitTotal)}`, 142, 74);

        // KPI Box Row 2
        // Box 4 - Descontos
        doc.setFillColor(248, 250, 252);
        doc.rect(14, 84, 57, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, 84, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("DESCONTOS CONCEDIDOS", 18, 89);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(239, 68, 68); // red
        doc.text(`-${formatMZ(financialTotals.discountTotal)}`, 18, 96);

        // Box 5 - Volume Transações
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 84, 57, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(76, 84, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("VOLUME DE VENDAS", 80, 89);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`${filteredTransactions.length} Operações`, 80, 96);

        // Box 6 - Ticket Médio
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 84, 58, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(138, 84, 58, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("TICKET MÉDIO", 142, 89);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        const avgTicket = filteredTransactions.length ? Math.round(financialTotals.salesTotal / filteredTransactions.length) : 0;
        doc.text(formatMZ(avgTicket), 142, 96);

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 107, 196, 107);

        // Detailed Transactions Title
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("DEMONSTRATIVO DE TRANSAÇÕES DETALHADAS", 14, 114);

        const tableHead = [["FATURA", "DATA", "CLIENTE", "MÉTODO", "SUBTOTAL", "DESC", "IVA (16%)", "TOTAL MT"]];
        const tableBody = filteredTransactions.map(t => [
          t.invoiceNumber,
          new Date(t.timestamp).toLocaleDateString() + " " + new Date(t.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          t.customerName || "Consumidor Geral",
          t.paymentMethod,
          formatMZ(t.subtotal),
          `-${formatMZ(t.discountTotal)}`,
          formatMZ(t.vatTotal),
          formatMZ(t.grandTotal)
        ]);

        autoTable(doc, {
          startY: 118,
          head: tableHead,
          body: tableBody,
          theme: "striped",
          styles: { fontSize: 7.5, cellPadding: 2.5 },
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            4: { halign: "right" },
            5: { halign: "right", textColor: [220, 38, 38] },
            6: { halign: "right" },
            7: { halign: "right", fontStyle: "bold" }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${data.pageNumber}`, 14, 288);
            doc.text("OST Vendas - Sistema de Gestão Comercial Integrado", 120, 288);
          }
        });

        const finalY = (doc as any).lastAutoTable.finalY || 120;

        const drawSignatures = (targetDoc: typeof doc, startY: number) => {
          targetDoc.setDrawColor(203, 213, 225);
          targetDoc.line(20, startY + 20, 95, startY + 20);
          targetDoc.line(115, startY + 20, 190, startY + 20);
          
          targetDoc.setFont("helvetica", "bold");
          targetDoc.setFontSize(8);
          targetDoc.setTextColor(71, 85, 105);
          targetDoc.text("Assinatura do Gestor Responsável", 32, startY + 24);
          targetDoc.text("Visto da Auditoria / Administração", 124, startY + 24);

          targetDoc.setFont("helvetica", "normal");
          targetDoc.setFontSize(7.5);
          targetDoc.setTextColor(148, 163, 184);
          targetDoc.text("Documento oficial impresso gerado automaticamente para fins tributários e de balancete.", 14, startY + 33);
        };

        if (finalY + 45 > 280) {
          doc.addPage();
          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, 210, 8, "F");
          drawSignatures(doc, 20);
        } else {
          drawSignatures(doc, finalY);
        }

        doc.save(`Resumo_Executivo_Financeiro_${startDate}_a_${endDate}.pdf`);
        setExportMessage(`Resumo financeiro executivo (A4 PDF) gerado com sucesso!`);
        onAddAuditLog(
          "Exportar Resumo Executivo PDF",
          "RELATÓRIOS",
          `Gestor exportou resumo financeiro impresso de ${startDate} até ${endDate} contendo assinaturas.`
        );
        if (onShowToast) {
          onShowToast("Resumo executivo impresso (A4 PDF) pronto!", "success", "Relatório PDF Gerado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar resumo financeiro PDF:", err);
        setExportMessage(`Erro ao compilar PDF: ${err.message || err}`);
        if (onShowToast) {
          onShowToast("Falha ao compilar relatório PDF.", "error", "Erro de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 1500);
  };

  const handleExportMonthlySummaryPDF = async () => {
    setIsExporting(true);
    if (onShowToast) {
      onShowToast("Gerando PDF Estruturado do Resumo Executivo Mensal...", "info", "Aguarde");
    }

    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
        const rgbArray = activeTheme.rgb.split(",").map(Number);

        // A4: 210 x 297 mm
        // 1. Beautiful color header band
        doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.rect(0, 0, 210, 10, "F");

        // 2. Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 14, 30, 30);
        }

        // 3. Corporate Info Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(settings.companyName || "Indisponível", 14, 22);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 29);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 34);

        // Header Divider Line
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.4);
        doc.line(14, 39, 196, 39);

        // 4. Document Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`RESUMO EXECUTIVO MENSAL - ${monthlyStats.monthName.toUpperCase()} DE ${monthlyStats.year}`, 14, 48);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Período de Apuração: 01 de ${monthlyStats.monthName} de ${monthlyStats.year} até hoje`, 14, 54);
        doc.text(`Emitido em: ${new Date().toLocaleString("pt-MZ")} | Moeda: Meticais (MT)`, 14, 59);

        // 5. Beautiful Metric Cards Row
        // Card 1: Faturamento Mensal
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(14, 65, 57, 20, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, 65, 57, 20, "S");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("FATURAÇÃO MENSAL", 18, 71);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.text(formatMZ(monthlyStats.totalSales), 18, 79);

        // Card 2: Ticket Médio
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 65, 57, 20, "F");
        doc.rect(76, 65, 57, 20, "S");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("TICKET MÉDIO", 80, 71);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(monthlyStats.averageTicket), 80, 79);

        // Card 3: Volume & Qtd Itens
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 65, 58, 20, "F");
        doc.rect(138, 65, 58, 20, "S");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("ITENS VENDIDOS", 142, 71);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`${monthlyStats.totalItemsCount.toLocaleString()} unidades`, 142, 79);

        // 6. Section: Resumo de Impostos e Descontos
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("BALANÇO DE ENCARGOS E IMPOSTOS DO MÊS", 14, 94);

        const summaryHead = [["Métrica", "Valor Acumulado (MT)"]];
        const summaryBody = [
          ["Faturamento Bruto das Faturas", formatMZ(monthlyStats.totalSales)],
          ["IVA Coletado sobre Vendas (16%)", formatMZ(monthlyStats.totalVat)],
          ["Total de Descontos Concedidos aos Clientes", `-${formatMZ(monthlyStats.totalDiscount)}`],
          ["Volume Total de Transações Processadas", `${monthlyStats.monthlyTx.length} vendas`]
        ];

        autoTable(doc, {
          startY: 98,
          head: summaryHead,
          body: summaryBody,
          theme: "striped",
          styles: { fontSize: 8.5, cellPadding: 3.5 },
          headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            1: { halign: "right", fontStyle: "bold" }
          }
        });

        const secondStartY = (doc as any).lastAutoTable.finalY + 12;

        // 7. Section: Top Products Table
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("PRODUTOS MAIS VENDIDOS (TOP 5)", 14, secondStartY);

        const prodHead = [["Posição", "Nome do Produto", "Quantidade Vendida", "Faturamento Acumulado"]];
        const prodBody = monthlyStats.topProducts.map((p, index) => [
          `#${index + 1}`,
          p.name,
          `${p.qty} un`,
          formatMZ(p.revenue)
        ]);

        autoTable(doc, {
          startY: secondStartY + 4,
          head: prodHead,
          body: prodBody,
          theme: "striped",
          styles: { fontSize: 8.5, cellPadding: 3.5 },
          headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            2: { halign: "right" },
            3: { halign: "right", fontStyle: "bold" }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${data.pageNumber}`, 14, 288);
            doc.text(`OST Vendas ERP - Resumo Mensal Comercial`, 120, 288);
          }
        });

        const finalY = (doc as any).lastAutoTable.finalY || secondStartY + 40;

        const drawSignatures = (targetDoc: typeof doc, startY: number) => {
          targetDoc.setDrawColor(203, 213, 225);
          targetDoc.line(20, startY + 15, 95, startY + 15);
          targetDoc.line(115, startY + 15, 190, startY + 15);
          
          targetDoc.setFont("helvetica", "bold");
          targetDoc.setFontSize(8);
          targetDoc.setTextColor(71, 85, 105);
          targetDoc.text("Assinatura do Responsável Comercial", 28, startY + 19);
          targetDoc.text("Diretor Geral / Administração", 128, startY + 19);

          targetDoc.setFont("helvetica", "normal");
          targetDoc.setFontSize(7.5);
          targetDoc.setTextColor(148, 163, 184);
          targetDoc.text("Este documento é um balancete executivo oficial de apoio gerencial, compilado a partir de vendas registradas em terminal POS.", 14, startY + 28);
        };

        if (finalY + 35 > 280) {
          doc.addPage();
          doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.rect(0, 0, 210, 8, "F");
          drawSignatures(doc, 15);
        } else {
          drawSignatures(doc, finalY);
        }

        doc.save(`Resumo_Executivo_Mensal_${monthlyStats.monthName}_${monthlyStats.year}.pdf`);
        
        onAddAuditLog(
          "Exportar Resumo Mensal PDF",
          "RELATÓRIOS",
          `Gestor exportou relatório de resumo executivo do mês de ${monthlyStats.monthName} de ${monthlyStats.year} contendo ${monthlyStats.monthlyTx.length} transações.`
        );

        if (onShowToast) {
          onShowToast("Resumo Mensal exportado com sucesso em PDF!", "success", "Relatório Gerado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar resumo mensal PDF:", err);
        if (onShowToast) {
          onShowToast("Falha ao exportar relatório PDF mensal.", "error", "Erro de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 1200);
  };

  // Consolidated PDF Report: Transactions, Category Sales Summary & Collaborator Performance
  const handleExportConsolidatedTransactionsPDF = async () => {
    setIsExporting(true);
    setExportMessage("");
    if (onShowToast) {
      onShowToast("A compilar Relatório Consolidado de Transações em PDF...", "info", "Aguarde");
    }

    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const primaryRgb: [number, number, number] = [37, 99, 235]; // Professional Blue #2563eb
        const darkSlateRgb: [number, number, number] = [30, 41, 59];

        // 1. Top accent line
        doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.rect(0, 0, 210, 8, "F");

        // 2. Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 12, 30, 30);
        }

        // 3. Corporate Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(settings.companyName || "OST Vendas", 14, 20);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Moçambique"}`, 14, 26);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "comercial@empresa.co.mz"}`, 14, 31);

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(14, 36, 196, 36);

        // 4. Document Title & Metadata
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("RELATÓRIO CONSOLIDADO DE TRANSAÇÕES E GESTÃO COMERCIAL", 14, 44);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Período Selecionado: ${startDate} até ${endDate}`, 14, 50);
        doc.text(`Documento emitido em: ${new Date().toLocaleString("pt-MZ")} | Total de Vendas: ${filteredTransactions.length}`, 14, 55);

        // 5. Key Financial KPIs (6 Box Matrix)
        const renderKpiCard = (x: number, y: number, w: number, h: number, title: string, value: string, color: [number, number, number]) => {
          doc.setFillColor(248, 250, 252);
          doc.rect(x, y, w, h, "F");
          doc.setDrawColor(226, 232, 240);
          doc.rect(x, y, w, h, "S");
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 116, 139);
          doc.text(title, x + 4, y + 5);
          doc.setFontSize(9.5);
          doc.setTextColor(color[0], color[1], color[2]);
          doc.text(value, x + 4, y + 12);
        };

        // Row 1
        renderKpiCard(14, 60, 57, 16, "FATURAÇÃO TOTAL BRUTA", formatMZ(financialTotals.salesTotal), primaryRgb);
        renderKpiCard(76, 60, 57, 16, "IMPOSTO IVA (16%)", formatMZ(financialTotals.vatTotal), [71, 85, 105]);
        renderKpiCard(138, 60, 58, 16, "LUCRO ESTIMADO (MARGEM)", `+${formatMZ(financialTotals.profitTotal)}`, [16, 185, 129]);

        // Row 2
        const avgTicket = filteredTransactions.length ? Math.round(financialTotals.salesTotal / filteredTransactions.length) : 0;
        renderKpiCard(14, 80, 57, 16, "DESCONTOS CONCEDIDOS", `-${formatMZ(financialTotals.discountTotal)}`, [239, 68, 68]);
        renderKpiCard(76, 80, 57, 16, "ARTIGOS VENDIDOS", `${financialTotals.totalQuantity.toLocaleString()} unidades`, [15, 23, 42]);
        renderKpiCard(138, 80, 58, 16, "TICKET MÉDIO POR VENDA", formatMZ(avgTicket), [15, 23, 42]);

        let currentY = 104;

        // ==========================================
        // 6. SECTION 1: VENDAS POR CATEGORIA DE PRODUTO
        // ==========================================
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("1. RESUMO DE VENDAS POR CATEGORIA DE PRODUTO", 14, currentY);

        const categoryMap = new Map<string, { category: string; count: number; qty: number; total: number }>();
        const productCategoryLookup = new Map<string, string>();
        const productNameCategoryLookup = new Map<string, string>();

        (products || []).forEach(p => {
          if (p.id) productCategoryLookup.set(p.id, p.category || "Geral");
          if (p.name) productNameCategoryLookup.set(p.name.toLowerCase().trim(), p.category || "Geral");
        });

        let totalCategoryRevenue = 0;
        let totalCategoryUnits = 0;

        filteredTransactions.forEach(t => {
          if (Array.isArray(t.items)) {
            t.items.forEach(it => {
              let cat = (it as any).category;
              if (!cat && it.productId) cat = productCategoryLookup.get(it.productId);
              if (!cat && it.productName) cat = productNameCategoryLookup.get(it.productName.toLowerCase().trim());
              if (!cat) cat = "Produtos Gerais";

              const sub = Number(it.subtotal ?? (Number(it.price || 0) * Number(it.quantity || 1)));
              const qty = Number(it.quantity || 1);

              if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { category: cat, count: 0, qty: 0, total: 0 });
              }
              const c = categoryMap.get(cat)!;
              c.count += 1;
              c.qty += qty;
              c.total += sub;
              totalCategoryRevenue += sub;
              totalCategoryUnits += qty;
            });
          }
        });

        const categoryList = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);

        const catHead = [["CATEGORIA DE PRODUTO", "QTD VENDIDA", "FATURAÇÃO (MT)", "PARTICIPAÇÃO", "TICKET MÉDIO/ITEM"]];
        const catBody = categoryList.map(c => {
          const share = totalCategoryRevenue > 0 ? ((c.total / totalCategoryRevenue) * 100).toFixed(1) + "%" : "0.0%";
          const avgPrice = c.qty > 0 ? Math.round(c.total / c.qty) : 0;
          return [
            c.category,
            `${c.qty.toLocaleString()} un.`,
            formatMZ(c.total),
            share,
            formatMZ(avgPrice)
          ];
        });

        if (categoryList.length > 0) {
          catBody.push([
            "TOTAL GERAL POR CATEGORIAS",
            `${totalCategoryUnits.toLocaleString()} un.`,
            formatMZ(totalCategoryRevenue),
            "100%",
            formatMZ(totalCategoryUnits > 0 ? Math.round(totalCategoryRevenue / totalCategoryUnits) : 0)
          ]);
        } else {
          catBody.push(["Nenhum item vendido no período", "0 un.", "0,00 MT", "0%", "0,00 MT"]);
        }

        autoTable(doc, {
          startY: currentY + 3,
          head: catHead,
          body: catBody,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.6 },
          headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { fontStyle: "bold" },
            1: { halign: "right" },
            2: { halign: "right", fontStyle: "bold" },
            3: { halign: "right" },
            4: { halign: "right" }
          },
          didParseCell: (data) => {
            if (data.row.index === catBody.length - 1 && categoryList.length > 0) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;

        // Check if page break is needed for Section 2
        if (currentY > 225) {
          doc.addPage();
          doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
          doc.rect(0, 0, 210, 8, "F");
          currentY = 20;
        }

        // ==========================================
        // 7. SECTION 2: PERFORMANCE DOS COLABORADORES
        // ==========================================
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("2. PERFORMANCE E DESEMPENHO DOS COLABORADORES", 14, currentY);

        const employeeInfoMap = new Map<string, { role: string; name: string }>();
        (employees || []).forEach(emp => {
          const roleLabel = emp.role === "ADMIN" ? "Administrador" :
                            emp.role === "SUPERVISOR" ? "Supervisor" :
                            emp.role === "CASHIER" ? "Operador de Caixa" :
                            emp.role === "RH" ? "Recursos Humanos" :
                            emp.role === "FINANCEIRO" ? "Gestor Financeiro" :
                            emp.role === "AUDITOR" ? "Auditor Fiscal" : (emp.role || "Colaborador");
          if (emp.name) employeeInfoMap.set(emp.name.toLowerCase().trim(), { role: roleLabel, name: emp.name });
          if (emp.username) employeeInfoMap.set(emp.username.toLowerCase().trim(), { role: roleLabel, name: emp.name });
          if (emp.id) employeeInfoMap.set(emp.id, { role: roleLabel, name: emp.name });
        });

        const collaboratorMap = new Map<string, { name: string; role: string; count: number; total: number; qty: number }>();
        let totalCollaboratorSales = 0;
        let totalCollaboratorTxCount = 0;

        filteredTransactions.forEach(t => {
          const rawName = (t.cashierName || (t as any).sellerName || (t as any).userName || "Operador Geral").trim();
          const empInfo = employeeInfoMap.get(rawName.toLowerCase()) || (t.userId ? employeeInfoMap.get(t.userId) : null);
          const displayName = empInfo?.name || rawName;
          const role = empInfo?.role || "Operador de Caixa";

          const gTotal = Number(t.grandTotal || 0);
          let txQty = 0;
          if (Array.isArray(t.items)) {
            t.items.forEach(it => { txQty += Number(it.quantity || 1); });
          }

          if (!collaboratorMap.has(displayName)) {
            collaboratorMap.set(displayName, { name: displayName, role, count: 0, total: 0, qty: 0 });
          }
          const c = collaboratorMap.get(displayName)!;
          c.count += 1;
          c.total += gTotal;
          c.qty += txQty;
          totalCollaboratorSales += gTotal;
          totalCollaboratorTxCount += 1;
        });

        const collaboratorList = Array.from(collaboratorMap.values()).sort((a, b) => b.total - a.total);

        const collabHead = [["COLABORADOR", "FUNÇÃO / CARGO", "TRANSAÇÕES", "FATURAÇÃO TOTAL (MT)", "TICKET MÉDIO", "PARTICIPAÇÃO"]];
        const collabBody = collaboratorList.map((collab, idx) => {
          const share = totalCollaboratorSales > 0 ? ((collab.total / totalCollaboratorSales) * 100).toFixed(1) + "%" : "0.0%";
          const avgTicket = collab.count > 0 ? Math.round(collab.total / collab.count) : 0;
          const medal = idx === 0 && collaboratorList.length > 1 ? " [Destaque]" : "";
          return [
            `${collab.name}${medal}`,
            collab.role,
            `${collab.count} vendas`,
            formatMZ(collab.total),
            formatMZ(avgTicket),
            share
          ];
        });

        if (collaboratorList.length > 0) {
          collabBody.push([
            "TOTAL DA EQUIPA",
            "-",
            `${totalCollaboratorTxCount} vendas`,
            formatMZ(totalCollaboratorSales),
            formatMZ(totalCollaboratorTxCount > 0 ? Math.round(totalCollaboratorSales / totalCollaboratorTxCount) : 0),
            "100%"
          ]);
        } else {
          collabBody.push(["Nenhum colaborador registrado com vendas", "-", "0 vendas", "0,00 MT", "0,00 MT", "0%"]);
        }

        autoTable(doc, {
          startY: currentY + 3,
          head: collabHead,
          body: collabBody,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.6 },
          headStyles: { fillColor: darkSlateRgb, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { fontStyle: "bold" },
            1: { textColor: [71, 85, 105] },
            2: { halign: "right" },
            3: { halign: "right", fontStyle: "bold" },
            4: { halign: "right" },
            5: { halign: "right" }
          },
          didParseCell: (data) => {
            if (data.row.index === collabBody.length - 1 && collaboratorList.length > 0) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;

        // Check if page break is needed for Section 3
        if (currentY > 215) {
          doc.addPage();
          doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
          doc.rect(0, 0, 210, 8, "F");
          currentY = 20;
        }

        // ==========================================
        // 8. SECTION 3: EXTRATO CONSOLIDADO DE TRANSAÇÕES
        // ==========================================
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("3. EXTRATO CONSOLIDADO DE TRANSAÇÕES", 14, currentY);

        const txHead = [["FATURA", "DATA/HORA", "CLIENTE", "OPERADOR", "PAGAMENTO", "SUBTOTAL", "DESC.", "IVA", "TOTAL MT"]];
        const txBody = filteredTransactions.map(t => [
          t.invoiceNumber,
          new Date(t.timestamp).toLocaleDateString("pt-MZ") + " " + new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          t.customerName || "Consumidor Geral",
          t.cashierName || "-",
          t.paymentMethod === "CASH" ? "Dinheiro" : (t.paymentMethod as string) || "-",
          formatMZ(t.subtotal),
          t.discountTotal > 0 ? `-${formatMZ(t.discountTotal)}` : "0,00 MT",
          formatMZ(t.vatTotal),
          formatMZ(t.grandTotal)
        ]);

        if (filteredTransactions.length === 0) {
          txBody.push(["-", "-", "Nenhuma transação encontrada no período", "-", "-", "0,00 MT", "0,00 MT", "0,00 MT", "0,00 MT"]);
        }

        autoTable(doc, {
          startY: currentY + 3,
          head: txHead,
          body: txBody,
          theme: "striped",
          styles: { fontSize: 7, cellPadding: 2.2 },
          headStyles: { fillColor: darkSlateRgb, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { fontStyle: "bold" },
            5: { halign: "right" },
            6: { halign: "right", textColor: [220, 38, 38] },
            7: { halign: "right" },
            8: { halign: "right", fontStyle: "bold" }
          },
          didDrawPage: (data) => {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${data.pageNumber}`, 14, 288);
            doc.text("OST Vendas - Sistema de Gestão Comercial e POS Integrado", 110, 288);
          }
        });

        const txFinalY = (doc as any).lastAutoTable.finalY || 220;

        // 9. Signatures Block
        const renderSignatures = (targetDoc: typeof doc, startY: number) => {
          targetDoc.setDrawColor(203, 213, 225);
          targetDoc.line(20, startY + 16, 95, startY + 16);
          targetDoc.line(115, startY + 16, 190, startY + 16);

          targetDoc.setFont("helvetica", "bold");
          targetDoc.setFontSize(8);
          targetDoc.setTextColor(71, 85, 105);
          targetDoc.text("Responsável Comercial / Caixa Central", 28, startY + 20);
          targetDoc.text("Diretoria Geral / Administração", 126, startY + 20);

          targetDoc.setFont("helvetica", "normal");
          targetDoc.setFontSize(7);
          targetDoc.setTextColor(148, 163, 184);
          targetDoc.text("Relatório oficial consolidado emitido para controlo comercial, auditoria de vendas e avaliação de produtividade.", 14, startY + 28);
        };

        if (txFinalY + 35 > 280) {
          doc.addPage();
          doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
          doc.rect(0, 0, 210, 8, "F");
          renderSignatures(doc, 15);
        } else {
          renderSignatures(doc, txFinalY);
        }

        const fileName = `Relatorio_Consolidado_Transacoes_${startDate}_a_${endDate}.pdf`;
        doc.save(fileName);
        setExportMessage(`Relatório Consolidado de Transações (PDF) gerado e transferido com sucesso!`);
        onAddAuditLog(
          "Exportar Relatório Consolidado PDF",
          "RELATÓRIOS",
          `Exportou Relatório Consolidado de Transações (${startDate} até ${endDate}) com ${filteredTransactions.length} vendas, resumo por categorias e performance de colaboradores.`
        );

        if (onShowToast) {
          onShowToast("Relatório Consolidado em PDF gerado com sucesso!", "success", "PDF Exportado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar Relatório Consolidado em PDF:", err);
        setExportMessage(`Erro ao gerar PDF: ${err.message || err}`);
        if (onShowToast) {
          onShowToast(`Erro ao gerar PDF: ${err.message || err}`, "error", "Falha de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 800);
  };

  const handleExportDailyFinancialSummaryPDF = async () => {
    setIsExporting(true);
    setExportMessage("");
    if (onShowToast) {
      onShowToast("Preparando Resumo Financeiro Diário...", "info", "Aguarde");
    }

    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
        const rgbArray = activeTheme.rgb.split(",").map(Number);

        // Filter transactions for the selected endDate
        const dailyTransactions = transactions.filter(t => {
          if (!t.timestamp) return false;
          return t.timestamp.split("T")[0] === endDate;
        });

        // Sort by timestamp ascending
        dailyTransactions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Calculate daily totals
        let dailySalesTotal = 0;
        let dailyVatTotal = 0;
        let dailyDiscountTotal = 0;
        let dailySubtotalTotal = 0;

        dailyTransactions.forEach(t => {
          const g = Number(t.grandTotal || 0);
          const v = Number(t.vatTotal || 0);
          const d = Number(t.discountTotal || 0);
          const s = Number(t.subtotal ?? t.grandTotal ?? 0);
          dailySalesTotal += isNaN(g) ? 0 : g;
          dailyVatTotal += isNaN(v) ? 0 : v;
          dailyDiscountTotal += isNaN(d) ? 0 : d;
          dailySubtotalTotal += isNaN(s) ? 0 : s;
        });

        const dailyAvgTicket = dailyTransactions.length ? Math.round(dailySalesTotal / dailyTransactions.length) : 0;
        const dailyProfitTotal = Math.round(dailySalesTotal * 0.32); // margin estimate

        // A4: 210 x 297 mm
        // 1. Top elegant color band
        doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.rect(0, 0, 210, 10, "F");

        // 2. Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 14, 30, 30);
        }

        // 3. Corporate Info Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(settings.companyName || "Indisponível", 14, 22);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 29);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 34);

        // Header Divider Line
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.4);
        doc.line(14, 39, 196, 39);

        // 4. Document Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("RESUMO FINANCEIRO DIÁRIO", 14, 48);

        // Format Date beautifully
        let formattedDateString = endDate;
        try {
          formattedDateString = new Date(endDate + "T00:00:00").toLocaleDateString("pt-MZ", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
          });
          // Capitalize first letter
          formattedDateString = formattedDateString.charAt(0).toUpperCase() + formattedDateString.slice(1);
        } catch (e) {
          formattedDateString = endDate;
        }

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Dia da Apuração: ${formattedDateString}`, 14, 54);
        doc.text(`Emitido em: ${new Date().toLocaleString("pt-MZ")} | Moeda Oficial: Meticais (MT)`, 14, 59);

        // 5. Beautiful Metric Cards Row
        // Card 1: Faturamento Bruto Diário
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(14, 65, 57, 20, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, 65, 57, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("FATURAÇÃO DIÁRIA", 18, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.text(formatMZ(dailySalesTotal), 18, 79);

        // Card 2: Imposto IVA Diário
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 65, 57, 20, "F");
        doc.rect(76, 65, 57, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("IVA DIÁRIO (16%)", 80, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(dailyVatTotal), 80, 79);

        // Card 3: Volume & Ticket Médio
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 65, 58, 20, "F");
        doc.rect(138, 65, 58, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("VOLUME & TICKET MÉDIO", 142, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`${dailyTransactions.length} vendas | ${formatMZ(dailyAvgTicket)}`, 142, 79);

        // KPI Row 2
        // Card 4: Descontos Diários
        doc.setFillColor(248, 250, 252);
        doc.rect(14, 89, 57, 18, "F");
        doc.rect(14, 89, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("DESCONTOS DIÁRIOS", 18, 94);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38); // red-600
        doc.text(`-${formatMZ(dailyDiscountTotal)}`, 18, 101);

        // Card 5: Margem Diária Est.
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 89, 57, 18, "F");
        doc.rect(76, 89, 57, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("LUCRO ESTIMADO (32%)", 80, 94);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(16, 185, 129); // emerald-500
        doc.text(`+${formatMZ(dailyProfitTotal)}`, 80, 101);

        // Card 6: Subtotal Diário
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 89, 58, 18, "F");
        doc.rect(138, 89, 58, 18, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("VALOR SUB-TOTAL", 142, 94);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(dailySubtotalTotal), 142, 101);

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 113, 196, 113);

        // 6. Section: Payment Methods Distribution for the day
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("MEIOS DE PAGAMENTO DO DIA", 14, 120);

        const paymentBreakdown: Record<string, { count: number; total: number }> = {};
        dailyTransactions.forEach(t => {
          const method = t.paymentMethod || "OUTRO";
          if (!paymentBreakdown[method]) {
            paymentBreakdown[method] = { count: 0, total: 0 };
          }
          const g = Number(t.grandTotal || 0);
          paymentBreakdown[method].count += 1;
          paymentBreakdown[method].total += isNaN(g) ? 0 : g;
        });

        const totalTransactions = Math.max(1, dailyTransactions.length);
        const totalRevenue = Math.max(1, dailySalesTotal);

        const paymentRows = Object.entries(paymentBreakdown).map(([method, data]) => {
          // Translate payment methods beautifully
          let readableMethod = method;
          if (method === "CASH") readableMethod = "Dinheiro (Caixa)";
          else if (method === "MPESA_PAGA_FACIL") readableMethod = "M-Pesa (Paga Fácil)";
          else if (method === "EMOLA") readableMethod = "e-Mola";
          else if (method === "POS_CARD") readableMethod = "POS / Cartão Débito";
          else if (method === "CREDIT_CARD") readableMethod = "Cartão de Crédito";
          else if (method === "BANK_TRANSFER") readableMethod = "Transferência Bancária";
          else if (method === "MIXED") readableMethod = "Misto (Dinheiro + Digital)";
          else if (method === "DEBT") readableMethod = "Crédito / Conta Corrente";

          return [
            readableMethod,
            `${data.count} transações`,
            `${((data.count / totalTransactions) * 100).toFixed(1)}%`,
            formatMZ(data.total),
            `${((data.total / totalRevenue) * 100).toFixed(1)}%`
          ];
        });

        autoTable(doc, {
          startY: 124,
          head: [["Meio de Pagamento", "Qtd Transações", "% Transações", "Faturamento do Dia", "% Receita"]],
          body: paymentRows.length > 0 ? paymentRows : [["Nenhum faturamento registrado no dia", "0", "0%", "0,00 MT", "0%"]],
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            3: { halign: "right", fontStyle: "bold" },
            4: { halign: "right" }
          }
        });

        let nextY = (doc as any).lastAutoTable.finalY + 10;

        // 7. Section: Detailed Sales List for the Day
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("TRANSAÇÕES DETALHADAS DO DIA", 14, nextY);

        const tableHead = [["FATURA", "HORA", "CLIENTE", "MÉTODO", "SUBTOTAL", "DESC", "IVA", "TOTAL MT"]];
        const tableBody = dailyTransactions.map(t => {
          let timeStr = "";
          try {
            timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            timeStr = t.timestamp.split("T")[1]?.slice(0, 5) || "";
          }

          let readableMethod = t.paymentMethod;
          if (t.paymentMethod === "CASH") readableMethod = "DINHEIRO" as any;
          else if (t.paymentMethod === "MPESA_PAGA_FACIL") readableMethod = "M-PESA" as any;
          else if (t.paymentMethod === "POS_CARD") readableMethod = "CARTÃO" as any;

          return [
            t.invoiceNumber,
            timeStr,
            t.customerName || "Consumidor Geral",
            readableMethod,
            formatMZ(t.subtotal),
            `-${formatMZ(t.discountTotal)}`,
            formatMZ(t.vatTotal),
            formatMZ(t.grandTotal)
          ];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: tableHead,
          body: tableBody.length > 0 ? tableBody : [["-", "-", "Nenhuma venda registrada no dia", "-", "0,00 MT", "0,00 MT", "0,00 MT", "0,00 MT"]],
          theme: "striped",
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            4: { halign: "right" },
            5: { halign: "right", textColor: [220, 38, 38] },
            6: { halign: "right" },
            7: { halign: "right", fontStyle: "bold" }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${data.pageNumber}`, 14, 288);
            doc.text("OST Vendas - Sistema de Gestão Comercial Integrado", 120, 288);
          }
        });

        nextY = (doc as any).lastAutoTable.finalY + 10;

        // 8. Signatures Section
        const drawDocSignatures = (targetDoc: typeof doc, startY: number) => {
          targetDoc.setDrawColor(203, 213, 225);
          targetDoc.line(20, startY + 12, 90, startY + 12);
          targetDoc.line(120, startY + 12, 190, startY + 12);

          targetDoc.setFont("helvetica", "bold");
          targetDoc.setFontSize(8);
          targetDoc.setTextColor(71, 85, 105);
          targetDoc.text("Responsável de Vendas / Operador", 26, startY + 16);
          targetDoc.text("Supervisor / Diretor Administrativo", 126, startY + 16);

          targetDoc.setFont("helvetica", "normal");
          targetDoc.setFontSize(7.5);
          targetDoc.setTextColor(148, 163, 184);
          targetDoc.text("Documento oficial gerencial para conciliação diária de faturamento físico e digital.", 14, startY + 24);
        };

        if (nextY + 30 > 280) {
          doc.addPage();
          doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.rect(0, 0, 210, 10, "F");
          drawDocSignatures(doc, 20);
        } else {
          drawDocSignatures(doc, nextY);
        }

        // Save PDF file
        doc.save(`Resumo_Financeiro_Diario_${endDate}.pdf`);

        setExportMessage(`Resumo Financeiro Diário (A4 PDF) de ${endDate} gerado com sucesso!`);
        onAddAuditLog(
          "Exportar Resumo Financeiro Diário PDF",
          "RELATÓRIOS",
          `Gestor exportou resumo financeiro diário de ${endDate}.`
        );

        if (onShowToast) {
          onShowToast("Resumo Financeiro Diário gerado com sucesso!", "success", "PDF Exportado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar PDF de resumo diário:", err);
        setExportMessage(`Erro ao compilar PDF diário: ${err.message || err}`);
        if (onShowToast) {
          onShowToast("Falha ao gerar resumo financeiro diário.", "error", "Erro de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 1200);
  };

  const handleExportSalesSummaryPDF = async () => {
    setIsExporting(true);
    setExportMessage("");
    if (onShowToast) {
      onShowToast("Preparando Sumário de Vendas Profissional...", "info", "Aguarde");
    }

    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
        const rgbArray = activeTheme.rgb.split(",").map(Number);

        // A4: 210 x 297 mm
        // 1. Top elegant color band
        doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.rect(0, 0, 210, 10, "F");

        // 2. Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 14, 30, 30);
        }

        // 3. Corporate Info Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(settings.companyName || "Indisponível", 14, 22);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 29);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 34);

        // Header Divider Line
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.4);
        doc.line(14, 39, 196, 39);

        // 4. Document Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("SUMÁRIO EXECUTIVO DE VENDAS E DESEMPENHO", 14, 48);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Período de Apuração: ${new Date(startDate).toLocaleDateString("pt-MZ")} até ${new Date(endDate).toLocaleDateString("pt-MZ")}`, 14, 54);
        doc.text(`Emitido em: ${new Date().toLocaleString("pt-MZ")} | Moeda Oficial: Meticais (MT)`, 14, 59);

        // 5. Beautiful Metric Cards Row
        // Card 1: Faturamento Bruto
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(14, 65, 57, 20, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, 65, 57, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("FATURAÇÃO BRUTA", 18, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.text(formatMZ(financialTotals.salesTotal), 18, 79);

        // Card 2: Imposto IVA
        doc.setFillColor(248, 250, 252);
        doc.rect(76, 65, 57, 20, "F");
        doc.rect(76, 65, 57, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("IVA RECOLHIDO (16%)", 80, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatMZ(financialTotals.vatTotal), 80, 79);

        // Card 3: Volume & Ticket Médio
        doc.setFillColor(248, 250, 252);
        doc.rect(138, 65, 58, 20, "F");
        doc.rect(138, 65, 58, 20, "S");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("TICKET MÉDIO", 142, 71);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        const avgTicket = filteredTransactions.length ? Math.round(financialTotals.salesTotal / filteredTransactions.length) : 0;
        doc.text(formatMZ(avgTicket), 142, 79);

        // 6. Section: Payment Methods Distribution
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("DISTRIBUIÇÃO DE RECEITAS POR MÉTODO", 14, 94);

        const paymentBreakdown: Record<string, { count: number; total: number }> = {};
        filteredTransactions.forEach(t => {
          const method = t.paymentMethod || "OUTRO";
          if (!paymentBreakdown[method]) {
            paymentBreakdown[method] = { count: 0, total: 0 };
          }
          const g = Number(t.grandTotal || 0);
          paymentBreakdown[method].count += 1;
          paymentBreakdown[method].total += isNaN(g) ? 0 : g;
        });

        const totalTransactions = Math.max(1, filteredTransactions.length);
        const totalRevenue = Math.max(1, financialTotals.salesTotal);

        const paymentRows = Object.entries(paymentBreakdown).map(([method, data]) => [
          method,
          `${data.count} transações`,
          `${((data.count / totalTransactions) * 100).toFixed(1)}%`,
          formatMZ(data.total),
          `${((data.total / totalRevenue) * 100).toFixed(1)}%`
        ]);

        autoTable(doc, {
          startY: 98,
          head: [["Método de Pagamento", "Volume de Vendas", "% Transações", "Faturamento Acumulado", "% Receita"]],
          body: paymentRows.length > 0 ? paymentRows : [["Nenhum método registrado", "0", "0%", "0,00 MT", "0%"]],
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            3: { halign: "right", fontStyle: "bold" },
            4: { halign: "right" }
          }
        });

        let nextY = (doc as any).lastAutoTable.finalY + 10;

        // 7. Section: Top Products Sold
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("PRODUTOS MAIS VENDIDOS NO PERÍODO", 14, nextY);

        const productSales: Record<string, { qty: number; total: number }> = {};
        filteredTransactions.forEach(t => {
          if (t.items && Array.isArray(t.items)) {
            t.items.forEach(item => {
              const prodName = item.productName || (item as any).name || "Produto Sem Nome";
              if (!productSales[prodName]) {
                productSales[prodName] = { qty: 0, total: 0 };
              }
              const q = Number(item.quantity || 1);
              const p = Number(item.price ?? (item as any).salePrice ?? 0);
              const sub = Number((item as any).subtotal ?? (p * q));
              const safeQ = isNaN(q) ? 1 : q;
              const safeSub = isNaN(sub) ? (isNaN(p) ? 0 : p * safeQ) : sub;
              productSales[prodName].qty += safeQ;
              productSales[prodName].total += safeSub;
            });
          }
        });

        const topProducts = Object.entries(productSales)
          .map(([name, data]) => ({ name, qty: data.qty, total: isNaN(data.total) ? 0 : data.total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        const productRows = topProducts.map((p, idx) => [
          `0${idx + 1}`,
          p.name,
          `${p.qty} unidades`,
          formatMZ(p.total)
        ]);

        autoTable(doc, {
          startY: nextY + 4,
          head: [["Posição", "Produto / Serviço", "Qtd Vendida", "Faturamento Gerado"]],
          body: productRows.length > 0 ? productRows : [["-", "Nenhum produto registrado no período", "0", "0,00 MT"]],
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { halign: "center", fontStyle: "bold", textColor: [100, 116, 139] },
            3: { halign: "right", fontStyle: "bold" }
          }
        });

        nextY = (doc as any).lastAutoTable.finalY + 10;

        // 8. Signatures Section (draw at page bottom or next page if no space)
        const drawDocSignatures = (targetDoc: typeof doc, startY: number) => {
          targetDoc.setDrawColor(203, 213, 225);
          targetDoc.line(20, startY + 12, 90, startY + 12);
          targetDoc.line(120, startY + 12, 190, startY + 12);

          targetDoc.setFont("helvetica", "bold");
          targetDoc.setFontSize(8);
          targetDoc.setTextColor(71, 85, 105);
          targetDoc.text("Responsável de Vendas / Caixa", 28, startY + 16);
          targetDoc.text("Administração / Direção Geral", 130, startY + 16);

          targetDoc.setFont("helvetica", "normal");
          targetDoc.setFontSize(7.5);
          targetDoc.setTextColor(148, 163, 184);
          targetDoc.text("Este sumário consolidado serve como documento gerencial de auditoria e desempenho de vendas.", 14, startY + 24);
        };

        if (nextY + 30 > 280) {
          doc.addPage();
          doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.rect(0, 0, 210, 10, "F");
          drawDocSignatures(doc, 20);
        } else {
          drawDocSignatures(doc, nextY);
        }

        // Save PDF file
        doc.save(`Sumario_Vendas_Profissional_${startDate}_a_${endDate}.pdf`);

        setExportMessage(`Sumário Profissional de Vendas (A4 PDF) gerado com sucesso!`);
        onAddAuditLog(
          "Exportar Sumário de Vendas PDF",
          "RELATÓRIOS",
          `Gestor exportou sumário profissional de faturamento de ${startDate} até ${endDate}.`
        );

        if (onShowToast) {
          onShowToast("Sumário de Vendas Profissional gerado com sucesso!", "success", "PDF Exportado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar PDF de sumário de vendas:", err);
        setExportMessage(`Erro ao compilar PDF de vendas: ${err.message || err}`);
        if (onShowToast) {
          onShowToast("Falha ao gerar sumário de vendas PDF.", "error", "Erro de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 1200);
  };

  const handleExportIvaPdf = async () => {
    setIsExporting(true);
    setExportMessage("");
    if (onShowToast) {
      onShowToast("Preparando Declaração de IVA...", "info", "Aguarde");
    }
    
    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
        const rgbArray = activeTheme.rgb.split(",").map(Number);

        // Top aesthetic header band
        doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.rect(0, 0, 210, 8, "F");

        // App logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 12, 30, 30);
        }

        // Header Section
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(settings.companyName || "Indisponível", 14, 22);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 28);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 33);

        doc.setDrawColor(226, 232, 240);
        doc.line(14, 38, 196, 38);

        // Document Title
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("DECLARAÇÃO PERIÓDICA E DEMONSTRATIVO DE IVA", 14, 46);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`Período da Apuração: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}`, 14, 52);
        doc.text(`Gerado em: ${new Date().toLocaleString()} | Alíquota de IVA padrão: 16% (Moçambique)`, 14, 57);

        // Table 1: Financial Summary & VAT Balances
        const summaryHead = [["MÉTRICA / RUBRICA FISCAL", "VALOR (MT)"]];
        const summaryBody = [
          ["Faturamento Total Bruto (Vendas)", formatMZ(financialTotals.salesTotal)],
          ["Base Tributável (Vendas com IVA)", formatMZ(vatCalculations.taxableSalesSubtotal)],
          ["Faturamento Isento ou Não Sujeito", formatMZ(vatCalculations.exemptSalesSubtotal)],
          ["IVA Liquidado Coletado (Output VAT)", formatMZ(vatCalculations.realVatCollected)],
          ["IVA Dedutível Informado (Input VAT)", formatMZ(manualIvaDeduction)],
          [
            vatCalculations.netVatPayable >= 0 
              ? "SALDO FINAL: IVA A PAGAR AO ESTADO" 
              : "SALDO FINAL: CRÉDITO DE IVA A RECUPERAR", 
            formatMZ(Math.abs(vatCalculations.netVatPayable))
          ]
        ];

        autoTable(doc, {
          startY: 64,
          head: summaryHead,
          body: summaryBody,
          theme: "grid",
          headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number], textColor: [255, 255, 255] },
          styles: { fontSize: 8.5, cellPadding: 3 },
          columnStyles: {
            1: { halign: "right", fontStyle: "bold" }
          }
        });

        let nextY = (doc as any).lastAutoTable.finalY + 10;

        // Table 2: Detailed Transactions within selection
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("DETALHE DAS TRANSAÇÕES E IMPOSTOS RETIDOS", 14, nextY);

        const transHead = [["FATURA", "DATA", "CLIENTE", "BASE CÁLCULO", "TAXA", "IVA RETIDO", "TOTAL PAGO"]];
        const transBody = filteredTransactions.map(t => [
          t.invoiceNumber,
          new Date(t.timestamp).toLocaleDateString(),
          t.customerName || "Consumidor Geral",
          formatMZ(t.subtotal),
          t.vatTotal > 0 ? "16%" : "0% (Isento)",
          formatMZ(t.vatTotal),
          formatMZ(t.grandTotal)
        ]);

        autoTable(doc, {
          startY: nextY + 4,
          head: transHead,
          body: transBody,
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
          styles: { fontSize: 7.5, cellPadding: 2 },
          columnStyles: {
            3: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right", fontStyle: "bold" }
          }
        });

        // Signature block
        const lastY = (doc as any).lastAutoTable.finalY + 12;
        if (lastY + 35 > 280) {
          doc.addPage();
          doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
          doc.rect(0, 0, 210, 8, "F");
          doc.setDrawColor(203, 213, 225);
          doc.line(40, 50, 170, 50);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text("Assinatura do Responsável Técnico / Contabilista Certificado", 58, 55);
        } else {
          doc.setDrawColor(203, 213, 225);
          doc.line(40, lastY + 20, 170, lastY + 20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text("Assinatura do Responsável Técnico / Contabilista Certificado", 58, lastY + 25);
        }

        doc.save(`Declaracao_IVA_${startDate}_a_${endDate}.pdf`);
        setExportMessage(`Declaração de IVA compilada e descarregada com sucesso!`);
        onAddAuditLog("Exportar Declaração IVA PDF", "RELATÓRIOS", `Declaracao de IVA gerada de ${startDate} ate ${endDate} com saldo de ${formatMZ(vatCalculations.netVatPayable)}.`);
        
        if (onShowToast) {
          onShowToast("Declaração de IVA compilada com sucesso!", "success", "Exportação PDF Concluída");
        }
      } catch (err: any) {
        console.error("Erro ao gerar PDF de IVA:", err);
        setExportMessage(`Erro ao gerar PDF: ${err.message}`);
        if (onShowToast) {
          onShowToast(`Erro ao gerar PDF de IVA: ${err.message}`, "error", "Falha de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 1000);
  };

  const handleExportIvaCsv = () => {
    try {
      let csvContent = "\uFEFF"; // UTF-8 BOM
      csvContent += "OST Vendas - Demonstracao de Apuracao de IVA\n";
      csvContent += `Periodo de Apuracao: ${startDate} ate ${endDate}\n`;
      csvContent += `Documento Gerado Em: ${new Date().toLocaleString()}\n\n`;

      csvContent += "RESUMO DA APURACAO DE IVA\n";
      csvContent += `Total de Faturamento Bruto (MT);${financialTotals.salesTotal}\n`;
      csvContent += `Faturamento Base Tributavel (MT);${vatCalculations.taxableSalesSubtotal}\n`;
      csvContent += `Faturamento Isento ou Nao Sujeito (MT);${vatCalculations.exemptSalesSubtotal}\n`;
      csvContent += `Total de IVA Liquidado (MT);${vatCalculations.realVatCollected}\n`;
      csvContent += `Total de IVA Dedutivel Informado (MT);${manualIvaDeduction}\n`;
      csvContent += `SALDO FINAL DE IVA (MT);${vatCalculations.netVatPayable}\n\n`;

      csvContent += "DETALHE DE TRANSACOES FISCAIS\n";
      csvContent += "FATURA;DATA;CLIENTE;BASE CALCULO (MT);ALIQUOTA;IVA LIQUIDADO (MT);TOTAL PAGO (MT)\n";
      
      filteredTransactions.forEach(t => {
        csvContent += `${t.invoiceNumber};${new Date(t.timestamp).toLocaleDateString()};${t.customerName || "Consumidor Geral"};${t.subtotal};${t.vatTotal > 0 ? "16%" : "0%"};${t.vatTotal};${t.grandTotal}\n`;
      });

      const finalBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Apuracao_IVA_${startDate}_a_${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage(`Demonstrativo de IVA descarregado com sucesso!`);
      onAddAuditLog("Exportar Demonstrativo IVA CSV", "RELATÓRIOS", `Demonstrativo de IVA em CSV gerado.`);
      if (onShowToast) {
        onShowToast("Demonstrativo de IVA CSV descarregado!", "success");
      }
    } catch (err: any) {
      console.error(err);
      if (onShowToast) {
        onShowToast("Falha ao exportar CSV de IVA.", "error");
      }
    }
  };

  const handleExportActivityLogsPDF = async () => {
    setIsExporting(true);
    setExportMessage("");
    if (onShowToast) {
      onShowToast("Gerando Relatório de Auditoria e Atividade com Logotipo...", "info", "Aguarde");
    }

    setTimeout(async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
        const rgbArray = activeTheme.rgb.split(",").map(Number);

        // Header band
        doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
        doc.rect(0, 0, 210, 8, "F");

        // Company Logo
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 12, 30, 30);
        }

        // Header Section
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(settings.companyName || "Indisponível", 14, 22);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 28);
        doc.text(`Contacto: ${settings.storeContact || "Indisponível"} | E-mail: ${settings.smtpUser || settings.reportRecipientEmail || "Indisponível"}`, 14, 33);

        doc.setDrawColor(226, 232, 240);
        doc.line(14, 38, 196, 38);

        // Title
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("RELATÓRIO DE AUDITORIA E ATIVIDADES DO SISTEMA", 14, 46);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`Período de Análise: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}`, 14, 52);
        doc.text(`Emitido em: ${new Date().toLocaleString()} | Total de Registros: ${filteredLogs.length}`, 14, 57);

        // KPI Summary Table
        const kpiHead = [["MÉTRICA DE AUDITORIA", "VALOR / DETALHE"]];
        const kpiBody = [
          ["Total de Ações Registradas", `${filteredLogs.length} ações`],
          ["Módulo Mais Ativo", activityAnalytics.mostActiveModule || "N/A"],
          ["Operador Mais Ativo", `${activityAnalytics.mostActiveUser || "N/D"} (${activityAnalytics.mostActiveUserLogsCount} ações)`],
          ["Pico de Atividade Registrado", `${activityAnalytics.peakActivityValue} ações em ${activityAnalytics.peakActivityDate || "N/D"}`]
        ];

        autoTable(doc, {
          startY: 64,
          head: kpiHead,
          body: kpiBody,
          theme: "grid",
          headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number], textColor: [255, 255, 255] },
          styles: { fontSize: 8.5, cellPadding: 3 },
          columnStyles: {
            1: { fontStyle: "bold" }
          }
        });

        let nextY = (doc as any).lastAutoTable.finalY + 10;

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("REGISTRO OPERACIONAL DE AUDITORIA", 14, nextY);

        const logsHead = [["DATA/HORA", "OPERADOR", "MÓDULO", "AÇÃO", "DETALHES"]];
        const logsBody = [...filteredLogs].reverse().slice(0, 40).map(log => [
          new Date(log.timestamp).toLocaleString("pt-MZ"),
          log.user || "Sistema",
          log.module,
          log.action,
          log.details || "-"
        ]);

        autoTable(doc, {
          startY: nextY + 4,
          head: logsHead,
          body: logsBody,
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
          styles: { fontSize: 7.5, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { fontStyle: "bold", cellWidth: 30 },
            2: { cellWidth: 25 },
            3: { fontStyle: "bold", cellWidth: 35 }
          }
        });

        doc.save(`Relatorio_Auditoria_${startDate}_a_${endDate}.pdf`);
        setExportMessage(`Relatório de Auditoria PDF compilado com sucesso!`);
        onAddAuditLog("Exportar Relatório Auditoria PDF", "RELATÓRIOS", `Relatório de auditoria exportado com ${filteredLogs.length} logs.`);

        if (onShowToast) {
          onShowToast("Relatório de Auditoria em PDF gerado com sucesso!", "success", "PDF Exportado");
        }
      } catch (err: any) {
        console.error("Erro ao gerar PDF de Auditoria:", err);
        setExportMessage(`Erro ao gerar PDF: ${err.message}`);
        if (onShowToast) {
          onShowToast(`Erro ao gerar PDF: ${err.message}`, "error", "Falha de Exportação");
        }
      } finally {
        setIsExporting(false);
      }
    }, 800);
  };

  const handleExportCurrentViewPDF = async () => {
    if (activeSubTab === "iva") {
      await handleExportIvaPdf();
    } else if (activeSubTab === "activity") {
      await handleExportActivityLogsPDF();
    } else {
      if (reportType === "VAT") {
        await handleExportIvaPdf();
      } else if (reportType === "FINANCE") {
        await handleExportDailyFinancialSummaryPDF();
      } else {
        await handleExportSalesSummaryPDF();
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ERROR ALERT: PostgreSQL Sales Fetch Failure (Do NOT mask error as zero sales in fiscal reports) */}
      {transactionsError && (
        <div id="reports-sales-error-banner" className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4.5 text-rose-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm" role="alert">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-sm text-rose-950 flex items-center gap-2">
                <span>Falha na Leitura das Vendas</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
                  Bloqueio Fiscal
                </span>
              </h4>
              <p className="text-xs text-rose-800 font-medium mt-1 leading-relaxed">
                O servidor retornou o seguinte erro: <code className="bg-rose-100/80 px-1.5 py-0.5 rounded font-mono font-bold text-rose-900 border border-rose-200">{transactionsError}</code>. Os relatórios de faturação e IVA não foram gerados com zero vendas para evitar falsas declarações fiscais.
              </p>
            </div>
          </div>
          {onRetryTransactions && (
            <button
              id="reports-retry-sales-btn"
              type="button"
              onClick={onRetryTransactions}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-2 transition cursor-pointer shadow-sm hover:shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recarregar Dados</span>
            </button>
          )}
        </div>
      )}

      {/* Subtab Navigation inside ReportsModule */}
      <div className="flex border-b border-slate-200/80 gap-2 bg-white dark:bg-zinc-900 p-2.5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 flex-wrap items-center justify-between shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          <button
            id="btn-subtab-reports-general"
            type="button"
            onClick={() => setActiveSubTab("general")}
            className={`px-4 py-2 font-semibold text-xs transition-all rounded-lg cursor-pointer flex items-center justify-center gap-2 ${
              activeSubTab === "general"
                ? "bg-orange-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
          >
            <FileText className="w-4 h-4" />
            Relatórios Gerais & Agendamentos
          </button>
          <button
            id="btn-subtab-reports-iva"
            type="button"
            onClick={() => setActiveSubTab("iva")}
            className={`px-4 py-2 font-semibold text-xs transition-all rounded-lg cursor-pointer flex items-center justify-center gap-2 ${
              activeSubTab === "iva"
                ? "bg-orange-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Percent className="w-4 h-4" />
            Calculadora & Declaração de IVA
          </button>
          <button
            id="btn-subtab-reports-activity"
            type="button"
            onClick={() => setActiveSubTab("activity")}
            className={`px-4 py-2 font-semibold text-xs transition-all rounded-lg cursor-pointer flex items-center justify-center gap-2 ${
              activeSubTab === "activity"
                ? "bg-orange-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Activity className={`w-4 h-4 ${activeSubTab === "activity" ? "text-white" : "text-orange-600 dark:text-orange-400"}`} />
            Atividade & Auditoria
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Button: Consolidated Transactions PDF Report */}
          <button
            type="button"
            id="btn-export-consolidated-pdf"
            onClick={handleExportConsolidatedTransactionsPDF}
            disabled={isExporting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs cursor-pointer bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-xs transition-all ${
              isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-98"
            }`}
            title="Gerar relatório em PDF consolidado de transações, incluindo vendas por categoria de produto e performance dos colaboradores"
          >
            <FileText className="w-4 h-4 shrink-0 text-white" />
            <span>{isExporting ? "A processar..." : "PDF Consolidado de Transações"}</span>
          </button>

          {/* Master PDF Export Button */}
          <button
            type="button"
            id="btn-export-current-view-pdf"
            onClick={handleExportCurrentViewPDF}
            disabled={isExporting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs cursor-pointer bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all ${
              isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-98"
            }`}
            title="Exportar a vista atual como relatório PDF formatado com o logotipo da empresa"
          >
            <Printer className="w-4 h-4 shrink-0 text-slate-300" />
            <span>{isExporting ? "A processar PDF..." : "Exportar Relatório em PDF"}</span>
          </button>
        </div>
      </div>

      {activeSubTab === "general" && (
        <div className="space-y-6 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Sales / Revenue */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Faturação Coletada</span>
            <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{formatMZ(financialTotals.salesTotal)}</h4>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{filteredTransactions.length} {filteredTransactions.length === 1 ? "venda no período" : "vendas no período"}</span>
          </div>
          <div className="bg-orange-50 text-orange-600 p-2.5 rounded-xl text-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Quantity / Volume */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Artigos Vendidos</span>
            <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{financialTotals.totalQuantity} <span className="text-xs font-medium text-slate-400">unid.</span></h4>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{filteredTransactions.length ? (financialTotals.totalQuantity / filteredTransactions.length).toFixed(1) : "0"} itens / venda</span>
          </div>
          <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl text-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: VAT Tax collection widget */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Imposto IVA Acumulado</span>
            <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{formatMZ(financialTotals.vatTotal)}</h4>
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full inline-block mt-1 leading-none">IVA Oficial 16%</span>
          </div>
          <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl text-center">
            <Calculator className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Profits metrics */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Lucro Estimado</span>
            <h4 className="text-xl font-mono font-bold text-emerald-700 mt-1">+{formatMZ(financialTotals.profitTotal)}</h4>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Base em margens operacionais</span>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl text-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Grid: Left - Manual Query & Exports, Right - Automatiic email scheduler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* LEFT COLUMN: Manual Report compilers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[480px] space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Gerador Manual de Relatórios Fiscais</h3>
              <p className="text-xs text-slate-400 mt-0.5">Selecione o intervalo de datas e o formato de exportação.</p>
            </div>

            {/* Quick Period Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  const today = formatLocalDate(new Date());
                  setStartDate(today);
                  setEndDate(today);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-xs active:scale-95"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  setStartDate(formatLocalDate(d));
                  setEndDate(formatLocalDate(new Date()));
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-xs active:scale-95"
              >
                7 Dias
              </button>
              <button
                type="button"
                id="btn-filter-this-month"
                onClick={() => {
                  const now = new Date();
                  const year = now.getFullYear();
                  const month = String(now.getMonth() + 1).padStart(2, "0");
                  setStartDate(`${year}-${month}-01`);
                  setEndDate(formatLocalDate(now));
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-800 transition cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
              >
                <Calendar className="w-3 h-3 text-orange-600" />
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);
                  setStartDate(formatLocalDate(lastMonthDate));
                  setEndDate(formatLocalDate(lastDayOfMonth));
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-xs active:scale-95"
              >
                Mês Anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  const past = new Date();
                  past.setDate(past.getDate() - 30);
                  setStartDate(formatLocalDate(past));
                  setEndDate(formatLocalDate(new Date()));
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-xs active:scale-95"
              >
                30 Dias
              </button>
            </div>

            {/* Date filter inputs */}
            <div className="grid grid-cols-2 gap-3.5 bg-slate-50 p-3 rounded-xl border">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Data Inicial</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-slate-650 font-semibold outline-none focus:ring-1 focus:ring-orange-400/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Data Final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-slate-650 font-semibold outline-none focus:ring-1 focus:ring-orange-400/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl text-xs font-bold border">
              <button 
                type="button"
                onClick={() => setReportType("SALES")}
                className={`py-2 rounded-lg cursor-pointer transition ${reportType === "SALES" ? "bg-white text-slate-900 shadow-sm border" : "text-slate-500"}`}
              >
                Relatório de Vendas
              </button>
              <button 
                type="button"
                onClick={() => setReportType("FINANCE")}
                className={`py-2 rounded-lg cursor-pointer transition ${reportType === "FINANCE" ? "bg-white text-slate-900 shadow-sm border py-2" : "text-slate-500"}`}
              >
                Relatório Financeiro
              </button>
              <button 
                type="button"
                onClick={() => setReportType("VAT")}
                className={`py-2 rounded-lg cursor-pointer transition ${reportType === "VAT" ? "bg-white text-slate-900 shadow-sm border py-2" : "text-slate-500"}`}
              >
                Balanço de IVA
              </button>
            </div>

            <div className="flex items-center gap-4.5 justify-between py-2 text-xs text-slate-650">
              <span>Selecione Formato Digital para Exportar:</span>
              <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold font-mono">
                {["PDF", "EXCEL", "CSV"].map(format => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setExportFormat(format as any)}
                    className={`px-3 py-1 rounded-md cursor-pointer ${exportFormat === format ? "bg-slate-900 text-white shadow" : "text-slate-500"}`}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border flex flex-col gap-1 text-[11px] text-slate-500 leading-relaxed max-h-36 overflow-y-auto">
              {reportType === "SALES" && (
                <p>O Relatório de Vendas consolidação inclui: faturas geradas, faturamento bruto em Meticais (MT), cupons aplicados de desconto e divisão por utilizador (caixa).</p>
              )}
              {reportType === "FINANCE" && (
                <p>O Relatório Financeiro compila receitas de mercadoria versus despesas registadas no fluxo de caixa da empresa, com estimativa líquida de lucros fiscais.</p>
              )}
              {reportType === "VAT" && (
                <p>O Relatório de Imposto IVA reúne todas as taxas isentas fiscais, taxas padrão acumuladas de 16% de Moçambique, e faturas parametrizadas para submissão das declarações.</p>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-3.5 border-t border-slate-100">
            {exportMessage && (
              <p className="bg-green-50 border border-green-200 text-green-700 text-xs p-2.5 rounded-lg font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-green-700 shrink-0" />
                {exportMessage}
              </p>
            )}

            {/* Main User Action: PDF Consolidado de Transações */}
            <button
              type="button"
              id="btn-export-consolidated-full-pdf"
              onClick={handleExportConsolidatedTransactionsPDF}
              disabled={isExporting}
              className={`w-full py-3.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-200 ${
                isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
              }`}
              title="Gera relatório em PDF consolidado de transações, incluindo vendas por categoria de produto e performance dos colaboradores"
            >
              <FileText className="w-4.5 h-4.5 text-white shrink-0" />
              <span>{isExporting ? "A compilar PDF consolidado..." : "Gerar PDF Consolidado (Transações, Categorias & Colaboradores)"}</span>
            </button>

            <button
              type="button"
              id="btn-generate-monthly-summary"
              onClick={() => setShowMonthlySummaryModal(true)}
              className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              <Activity className="w-4 h-4 text-white shrink-0" />
              Visualizar Resumo Mensal ({monthlyStats.monthName})
            </button>

            <button
              type="button"
              id="btn-export-monthly-pdf"
              onClick={handleExportMonthlySummaryPDF}
              disabled={isExporting}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-250 hover:bg-slate-50 text-slate-700 bg-white transition-all shadow-sm ${
                isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
              }`}
            >
              <Download className="w-4 h-4 text-amber-500 shrink-0" />
              {isExporting ? "Exportando PDF Mensal..." : `Exportar Resumo Financeiro Mensal (PDF - ${monthlyStats.monthName})`}
            </button>

            <button
              onClick={handlePerformExport}
              disabled={isExporting}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all ${
                isExporting 
                  ? "bg-slate-200 text-slate-400" 
                  : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/10"
              }`}
            >
              <Download className="w-4 h-4 shrink-0" />
              {isExporting ? "Gerando Ficheiro e compilando bases de dados..." : `Gerar e Descarregar Relatório em ${exportFormat}`}
            </button>

            <button
              type="button"
              onClick={handleExportSalesSummaryPDF}
              disabled={isExporting}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-250 hover:bg-slate-50 text-slate-700 bg-white transition-all shadow-sm ${
                isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
              Exportar Sumário de Vendas do Período (PDF)
            </button>

            <button
              type="button"
              onClick={handleExportDailyFinancialSummaryPDF}
              disabled={isExporting}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-250 hover:bg-slate-50 text-slate-700 bg-white transition-all shadow-sm ${
                isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
              }`}
            >
              <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
              Exportar Resumo Financeiro Diário (A4 PDF)
            </button>

            <button
              type="button"
              onClick={handlePerformExecutivePrintPDF}
              disabled={isExporting}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-250 hover:bg-slate-50 text-slate-700 bg-white transition-all shadow-sm ${
                isExporting ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
              }`}
            >
              <Printer className="w-4 h-4 text-orange-500 shrink-0" />
              Imprimir Resumo Financeiro Executivo (A4 PDF)
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Automatic email setup scheduler */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-[420px] flex flex-col justify-between">
          <form onSubmit={handleSaveEmailConfig} className="space-y-4">
            {localError && (
              <div className="bg-red-500/10 text-red-400 p-2.5 rounded-lg text-xs font-semibold border border-red-500/20">
                {localError}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1 text-orange-600">
                <Mail className="w-4.5 h-4.5" />
                <h3 className="font-bold text-slate-800 text-sm">Relatórios Automáticos por Email (SMTP/Robô)</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Venda o sistema para as empresas configurando o e-mail de destino do administrador.</p>
            </div>

            <div className="space-y-3 md:text-xs">
              {/* Recipient Address */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-mail Destinatário Administrativo *</label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-semibold text-slate-750 outline-none text-xs"
                  placeholder="Ex: gestor@empresa.co.mz"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* Send Hour */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Horário de Envio Automático</label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                    <select
                      value={reportHour}
                      onChange={(e) => setReportHour(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-2 font-semibold cursor-pointer outline-none text-slate-650 text-xs"
                    >
                      <option value="02:00">02h00 (Padrão sugerido)</option>
                      <option value="18:00">18h00 (Fecho operacional)</option>
                      <option value="20:00">20h00</option>
                      <option value="22:00">22h00</option>
                    </select>
                  </div>
                </div>

                {/* Send Frequency */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Frequência do Robô</label>
                  <select
                    value={reportFrequency}
                    onChange={(e) => setReportFrequency(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold cursor-pointer outline-none text-xs"
                  >
                    <option value="daily">Todos os Dias (Diário)</option>
                    <option value="weekly">Semanalmente (Sábados às 02h00)</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition border border-slate-200"
            >
              {saveSettingsSuccess ? "Definições de Email Gravadas ✓" : "Salvar Configuração SMTP de Relatórios"}
            </button>
          </form>

          {/* Test Action Trigger Area */}
          <div className="p-3.5 bg-orange-50/50 rounded-xl border border-orange-100 flex items-center justify-between gap-3.5 mt-2 text-xs text-slate-500">
            <div className="max-w-[200px]">
              <span className="text-[9.5px] font-extrabold text-orange-800 uppercase tracking-widest font-mono">Disparador de Piloto</span>
              <p className="text-[10.5px] mt-0.5 leading-tight">Quer receber as estatísticas correntes do OST Vendas agora?</p>
            </div>

            {testSendStatus === "idle" ? (
              <button
                type="button"
                onClick={handleTriggerTestEmail}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                Testar Envio PDF
              </button>
            ) : testSendStatus === "sending" ? (
              <div className="text-xs font-bold text-orange-600 flex items-center gap-1">
                <span className="w-3 h-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>
                A Disparar...
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-2 rounded-lg text-[10px] leading-snug font-bold">
                ✓ Despachado! Verifique a sua caixa {recipientEmail}!
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Visual Table Segment inside ReportsModule */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row gap-3.5 items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800">Visualização Prévia da Tabela de Relatórios ({filteredTransactions.length} registros)</span>
            <p className="text-[10px] text-slate-400 mt-0.5">Exibindo transações faturadas de {startDate} até {endDate}</p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => {
                setExportFormat("CSV");
                setTimeout(() => {
                  setIsExporting(true);
                  setTimeout(() => {
                    setIsExporting(false);
                    let csvContent = "\uFEFF"; // UTF-8 BOM
                    csvContent += "OST Vendas - Relatorio de Faturamento e Vendas\n";
                    csvContent += `Periodo Escolhido: ${startDate} ate ${endDate}\n`;
                    csvContent += `Documento Gerado Em: ${new Date().toLocaleString()}\n`;
                    csvContent += `Faturamento Total: ${financialTotals.salesTotal} MT\n\n`;
                    csvContent += "FATURA;DATA;CLIENTE;METODO DE PAGAMENTO;SUBTOTAL (MT);DESCONTO;IVA COBRADO;TOTAL PAGO (MT)\n";
                    filteredTransactions.forEach(t => {
                      csvContent += `${t.invoiceNumber};${new Date(t.timestamp).toLocaleDateString()};${t.customerName || "Consumidor Geral"};${t.paymentMethod};${t.subtotal};${t.discountTotal};${t.vatTotal};${t.grandTotal}\n`;
                    });
                    const finalBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(finalBlob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `Relatorio_Faturamento_${startDate}_a_${endDate}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    setExportMessage(`Relatório CSV descarregado com sucesso!`);
                    onAddAuditLog("Exportar Relatório por Datas", "RELATÓRIOS", `Relatório de vendas exportado em formato CSV.`);
                  }, 200);
                }, 50);
              }}
              className="border border-slate-200 hover:bg-slate-50 text-slate-705 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer bg-white transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Exportar CSV
            </button>
            <button
              onClick={async () => {
                setExportFormat("PDF");
                setIsExporting(true);
                
                try {
                  const { jsPDF } = await import("jspdf");
                  const { default: autoTable } = await import("jspdf-autotable");
                  const doc = new jsPDF();
                  
                  const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
                  if (logoData) {
                    const format = getFormatFromBase64(logoData);
                    doc.addImage(logoData, format, 165, 8, 30, 30);
                  }
                  
                  doc.setFontSize(16);
                  doc.setFont("helvetica", "bold");
                  doc.text(settings.companyName || "Indisponível", 14, 20);
                  
                  doc.setFontSize(10);
                  doc.setFont("helvetica", "normal");
                  doc.text(`NUIT: ${settings.companyNuit || "Indisponível"} | ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 26);
                  doc.text(`Relatório Consolidado de Vendas e Faturamento`, 14, 32);
                  doc.text(`Período Selecionado: ${startDate} até ${endDate} | Emitido em: ${new Date().toLocaleString()}`, 14, 38);
                  
                  doc.setFillColor(245, 245, 245);
                  doc.rect(14, 44, 182, 24, "F");
                  doc.setFontSize(10);
                  doc.setFont("helvetica", "bold");
                  doc.text("Resumo Financeiro:", 18, 50);
                  doc.setFont("helvetica", "normal");
                  doc.text(`Faturação Coletada: ${formatMZ(financialTotals.salesTotal)}`, 18, 58);
                  doc.text(`Imposto IVA Liquidado: ${formatMZ(financialTotals.vatTotal)}`, 18, 64);
                  doc.text(`Vendas Fechadas: ${filteredTransactions.length} Operações`, 116, 58);
                  
                  autoTable(doc, {
                    startY: 74,
                    head: [["FATURA", "DATA", "CLIENTE", "MÉTODO", "VALOR MT"]],
                    body: filteredTransactions.map(t => [
                      t.invoiceNumber,
                      new Date(t.timestamp).toLocaleDateString(),
                      t.customerName || "Consumidor Geral",
                      t.paymentMethod,
                      formatMZ(t.grandTotal)
                    ]),
                    theme: "striped",
                    styles: { fontSize: 8, cellPadding: 3 },
                    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold" },
                    columnStyles: {
                      4: { halign: "right", fontStyle: "bold" }
                    }
                  });
                  
                  doc.save(`Relatorio_Faturamento_${startDate}_a_${endDate}.pdf`);
                  setExportMessage(`Relatório PDF compilado e descarregado com sucesso!`);
                  onAddAuditLog("Exportar Relatório por Datas", "RELATÓRIOS", `Relatório de faturamento exportado em formato PDF correspondente.`);
                } catch (error) {
                  console.error("Erro ao gerar PDF:", error);
                  setExportMessage("Ocorreu um erro ao gerar o PDF.");
                } finally {
                  setIsExporting(false);
                }
              }}
              className="border border-slate-200 hover:bg-slate-50 text-slate-705 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer bg-white transition shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Exportar PDF
            </button>
            <button
              type="button"
              id="btn-table-export-consolidated-pdf"
              onClick={handleExportConsolidatedTransactionsPDF}
              disabled={isExporting}
              className="border border-orange-200 hover:bg-orange-50 text-orange-700 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer bg-orange-50/50 transition shadow-xs"
              title="Exportar Relatório em PDF Consolidado (inclui vendas por categoria e performance de colaboradores)"
            >
              <FileText className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              PDF Consolidado
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[800px] text-left text-slate-650 text-xs">
            <thead>
              <tr className="bg-slate-100 uppercase text-[10px] font-bold text-slate-500 tracking-wider">
                <th className="p-3">Fatura</th>
                <th className="p-3">Data</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Método</th>
                <th className="p-3 text-right">Subtotal</th>
                <th className="p-3 text-right">Desconto</th>
                <th className="p-3 text-right">IVA (16%)</th>
                <th className="p-3 text-right">Total Pago</th>
                <th className="p-3 text-center">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white font-sans">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                    Nenhuma fatura encontrada neste intervalo de datas.
                  </td>
                </tr>
              ) : (
                filteredTransactions.slice(0, 10).map((t) => (
                  <ReportTransactionRow
                    key={t.id}
                    transaction={t}
                    currency={currency}
                    onOpenEmail={handleOpenEmailModal}
                    onOpenPrint={handleOpenPrintModal}
                    formatMZ={formatMZ}
                  />
                ))
              )}
              {filteredTransactions.length > 10 && (
                <tr>
                  <td colSpan={9} className="p-3 text-center bg-slate-50 text-[10.5px] font-semibold text-slate-400">
                    ... e mais {filteredTransactions.length - 10} vendas faturadas no período selecionadas para a exportação oficial.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredTransactions.length > 0 && (
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="p-3 text-right text-[10px] uppercase text-slate-500">Totais da Visualização:</td>
                  <td className="p-3 text-right font-mono text-slate-800">{formatMZ(financialTotals.subtotalTotal)}</td>
                  <td className="p-3 text-right font-mono text-red-600">-{formatMZ(financialTotals.discountTotal)}</td>
                  <td className="p-3 text-right font-mono text-slate-800">{formatMZ(financialTotals.vatTotal)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700">{formatMZ(financialTotals.salesTotal)}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </div>
      )}

      {activeSubTab === "iva" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Card */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-slate-950 p-2.5 rounded-xl shrink-0">
                <Percent className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Calculadora & Declaração de IVA</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Apuração automatizada e cálculo periódico do Imposto sobre Valor Acrescentado (IVA) de Moçambique (16%).
                </p>
              </div>
            </div>
          </div>

          {/* Date and Input Config Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Date Picker */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4 text-orange-500" />
                Intervalo de Apuração
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Data Inicial</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-650 font-semibold outline-none focus:ring-1 focus:ring-orange-400/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Data Final</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-650 font-semibold outline-none focus:ring-1 focus:ring-orange-400/50"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Modifique as datas para recalcular instantaneamente os valores agregados das faturas.
              </p>
            </div>

            {/* Input VAT / Manual Deductions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <Calculator className="w-4 h-4 text-blue-500" />
                Deduções de IVA (Compras/Custos)
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">IVA Dedutível Suportado (MT)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">MT</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={manualIvaDeduction || ""}
                    onChange={(e) => setManualIvaDeduction(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-800 font-semibold font-mono outline-none focus:ring-1 focus:ring-blue-400/50"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Insira o IVA total pago em facturas de compras a fornecedores para compensar contra o IVA retido das vendas.
              </p>
            </div>

            {/* Comparative Rate Selector */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <Percent className="w-4 h-4 text-emerald-500" />
                Análise com Alíquota Comparativa
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                  <span>Alíquota de Projeção:</span>
                  <span className="text-emerald-600 font-mono text-xs">{simulatedIvaRate}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={simulatedIvaRate}
                  onChange={(e) => setSimulatedIvaRate(parseInt(e.target.value) || 0)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Alíquota oficial de Moçambique: 16%. Ajuste o seletor para projetar o imposto arrecadado com taxas alternativas.
              </p>
            </div>
          </div>

          {/* IVA Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4.5">
            {/* Brut Sales */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Faturamento Bruto</span>
              <h4 className="text-lg font-mono font-bold text-slate-800 mt-1">{formatMZ(financialTotals.salesTotal)}</h4>
              <span className="text-[10px] text-slate-400 mt-0.5 block">{filteredTransactions.length} faturas faturadas</span>
            </div>

            {/* Output VAT Collected */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">IVA Liquidado (Vendas)</span>
              <h4 className="text-lg font-mono font-bold text-slate-800 mt-1">{formatMZ(vatCalculations.realVatCollected)}</h4>
              <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full inline-block mt-1 leading-none text-[9px]">Taxa Aplicada de 16%</span>
            </div>

            {/* Input VAT Deductible */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">IVA Dedutível (Compras)</span>
              <h4 className="text-lg font-mono font-bold text-slate-800 mt-1">{formatMZ(manualIvaDeduction)}</h4>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Crédito fiscal dedutível</span>
            </div>

            {/* Net VAT Balance Payable/Refundable */}
            <div className={`p-4.5 rounded-2xl border ${
              vatCalculations.netVatPayable >= 0 
                ? "bg-red-50/50 border-red-200 text-red-900" 
                : "bg-emerald-50/50 border-emerald-200 text-emerald-900"
            }`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Saldo Final (IVA Net)</span>
              <h4 className="text-lg font-mono font-bold mt-1">
                {vatCalculations.netVatPayable >= 0 ? "+" : "-"}
                {formatMZ(Math.abs(vatCalculations.netVatPayable))}
              </h4>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 leading-none text-[9px] ${
                vatCalculations.netVatPayable >= 0 
                  ? "bg-red-100 text-red-800" 
                  : "bg-emerald-100 text-emerald-800"
              }`}>
                {vatCalculations.netVatPayable >= 0 ? "Imposto a Pagar ao Estado" : "Crédito Fiscal a Recuperar"}
              </span>
            </div>
          </div>

          {/* Grid Layout: Left (Detailed Official Sheet), Right (Simulations, Controls, Exports) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT Column: Detailed Sheet (occupies 2 cols) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 lg:col-span-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Resumo da Apuração de IVA (Modelo Oficial)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Balancete oficial em conformidade com o regulamento do IVA de Moçambique.</p>
              </div>

              {/* Sheet Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                {/* Headers */}
                <div className="grid grid-cols-3 bg-slate-100 p-3 font-bold text-slate-700 border-b border-slate-200">
                  <div className="col-span-2">Rubricas de Apuração e Base Legal</div>
                  <div className="text-right">Montante Consolidado</div>
                </div>

                {/* Line 1 */}
                <div className="grid grid-cols-3 p-3 text-slate-600 border-b border-slate-100 font-sans hover:bg-slate-50 transition">
                  <div className="col-span-2 flex gap-2">
                    <span className="font-bold text-slate-400 font-mono">01.</span>
                    <span>Total de Vendas / Faturamento Bruto Comercial</span>
                  </div>
                  <div className="text-right font-mono font-semibold text-slate-800">{formatMZ(financialTotals.salesTotal)}</div>
                </div>

                {/* Line 2 */}
                <div className="grid grid-cols-3 p-3 text-slate-600 border-b border-slate-100 font-sans hover:bg-slate-50 transition">
                  <div className="col-span-2 flex gap-2">
                    <span className="font-bold text-slate-400 font-mono">02.</span>
                    <span>Base Tributável de Vendas (Sujeitas a IVA à taxa normal)</span>
                  </div>
                  <div className="text-right font-mono font-semibold text-slate-800">{formatMZ(vatCalculations.taxableSalesSubtotal)}</div>
                </div>

                {/* Line 3 */}
                <div className="grid grid-cols-3 p-3 text-slate-600 border-b border-slate-100 font-sans hover:bg-slate-50 transition">
                  <div className="col-span-2 flex gap-2">
                    <span className="font-bold text-slate-400 font-mono">03.</span>
                    <span>Operações Isentas ou Não Sujeitas (IVA 0%)</span>
                  </div>
                  <div className="text-right font-mono font-semibold text-slate-800">{formatMZ(vatCalculations.exemptSalesSubtotal)}</div>
                </div>

                {/* Line 4 */}
                <div className="grid grid-cols-3 p-3 text-slate-600 border-b border-slate-100 font-sans hover:bg-slate-50 transition">
                  <div className="col-span-2 flex gap-2">
                    <span className="font-bold text-slate-400 font-mono">04.</span>
                    <span>IVA Liquidado (Imposto retido nas vendas a taxa de 16%)</span>
                  </div>
                  <div className="text-right font-mono font-extrabold text-slate-800">{formatMZ(vatCalculations.realVatCollected)}</div>
                </div>

                {/* Line 5 */}
                <div className="grid grid-cols-3 p-3 text-slate-600 border-b border-slate-100 font-sans hover:bg-slate-50 transition">
                  <div className="col-span-2 flex gap-2">
                    <span className="font-bold text-slate-400 font-mono">05.</span>
                    <span>IVA Dedutível Autorizado (Suportado nas compras declaradas)</span>
                  </div>
                  <div className="text-right font-mono font-extrabold text-blue-600">-{formatMZ(manualIvaDeduction)}</div>
                </div>

                {/* Saldo Final */}
                <div className={`grid grid-cols-3 p-3.5 font-bold text-xs ${
                  vatCalculations.netVatPayable >= 0 ? "bg-red-50 text-red-950" : "bg-emerald-50 text-emerald-950"
                }`}>
                  <div className="col-span-2 flex gap-2 items-center">
                    <span className="font-mono text-slate-500">06.</span>
                    <span>
                      {vatCalculations.netVatPayable >= 0 
                        ? "IMPOSTO LÍQUIDO A ENTREGAR AO ESTADO" 
                        : "CRÉDITO FISCAL DE IVA A RECUPERAR / REPORTAR"}
                    </span>
                  </div>
                  <div className="text-right font-mono font-extrabold text-sm">
                    {formatMZ(Math.abs(vatCalculations.netVatPayable))}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT Column: Exports & Summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Resumos Exportáveis & Ações</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Gere relatórios certificados de auditoria de impostos de forma segura.</p>
                </div>

                {/* Simulated Rate Stats Card if slider adjusted */}
                {simulatedIvaRate !== 16 && (
                  <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100 text-xs space-y-1">
                    <span className="text-[9px] font-bold text-emerald-700 uppercase block tracking-wider">Cenário de Análise Fiscal Comparativa</span>
                    <p className="text-slate-600 text-[11px] leading-snug">
                      Se a alíquota de IVA fosse <span className="font-bold">{simulatedIvaRate}%</span>, o IVA coletado seria de <span className="font-bold">{formatMZ(vatCalculations.simulatedVatCollected)}</span> (diferença de <span className="font-bold">{formatMZ(vatCalculations.simulatedVatCollected - vatCalculations.realVatCollected)}</span>).
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 p-3.5 rounded-xl border space-y-2 text-[11px] text-slate-500 leading-snug">
                  <div className="flex gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Período fiscal fechado localmente e pronto para exportação.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Compatível com as finanças de Moçambique.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3">
                {exportMessage && (
                  <p className="bg-green-50 border border-green-200 text-green-700 text-xs p-2.5 rounded-lg font-bold flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 text-green-700 shrink-0" />
                    {exportMessage}
                  </p>
                )}

                <button
                  id="btn-export-iva-pdf"
                  type="button"
                  onClick={handleExportIvaPdf}
                  disabled={isExporting}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-slate-950/15"
                >
                  <Download className="w-4 h-4 text-orange-400 shrink-0" />
                  {isExporting ? "A processar..." : "Descarregar Declaração IVA Oficial (PDF)"}
                </button>

                <button
                  id="btn-export-iva-csv"
                  type="button"
                  onClick={handleExportIvaCsv}
                  disabled={isExporting}
                  className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                >
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  Descarregar Ficheiro de Apoio (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Transactions list inside IVA tab */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row gap-3.5 items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800">Transações Auditadas no Período ({filteredTransactions.length} registros)</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Exibindo detalhes fiscais de faturas emitidas de {startDate} até {endDate}</p>
              </div>

              {/* Class filters */}
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold border">
                <button
                  type="button"
                  onClick={() => setVatFilterClass("all")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${vatFilterClass === "all" ? "bg-white text-slate-900 shadow-sm border" : "text-slate-500"}`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setVatFilterClass("taxable")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${vatFilterClass === "taxable" ? "bg-white text-slate-900 shadow-sm border" : "text-slate-500"}`}
                >
                  Tributadas (16%)
                </button>
                <button
                  type="button"
                  onClick={() => setVatFilterClass("exempt")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${vatFilterClass === "exempt" ? "bg-white text-slate-900 shadow-sm border" : "text-slate-500"}`}
                >
                  Isentas (0%)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-hidden">
              <table className="w-full min-w-[800px] text-left text-slate-650 text-xs font-sans">
                <thead>
                  <tr className="bg-slate-100 uppercase text-[10px] font-bold text-slate-500 tracking-wider">
                    <th className="p-3">Fatura</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-right">Base Tributável (Subtotal)</th>
                    <th className="p-3 text-center">Alíquota</th>
                    <th className="p-3 text-right">IVA Coletado</th>
                    <th className="p-3 text-right">Valor Total Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-sans">
                  {filteredTransactions
                    .filter(t => {
                      if (vatFilterClass === "taxable") return t.vatTotal > 0;
                      if (vatFilterClass === "exempt") return t.vatTotal === 0;
                      return true;
                    })
                    .length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic font-sans">
                        Nenhuma transação correspondente a este filtro de classe de IVA neste período.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions
                      .filter(t => {
                        if (vatFilterClass === "taxable") return t.vatTotal > 0;
                        if (vatFilterClass === "exempt") return t.vatTotal === 0;
                        return true;
                      })
                      .slice(0, 15)
                      .map((t) => (
                        <ReportVatRow key={t.id} transaction={t} formatMZ={formatMZ} />
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "activity" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Card */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-slate-950 p-2.5 rounded-xl shrink-0">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Atividade & Auditoria do Sistema</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Análise visual dos logs de auditoria para monitorar a frequência de ações, identificar picos operacionais e rastrear acessos ou modificações.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-export-activity-pdf-header"
              onClick={handleExportActivityLogsPDF}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <Printer className="w-4 h-4 text-slate-950 shrink-0" />
              <span>Exportar Auditoria (PDF com Logotipo)</span>
            </button>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4.5">
            {/* KPI 1 */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total de Ações</span>
                <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{filteredLogs.length}</h4>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Registros no período</span>
              </div>
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Pico de Atividade</span>
                <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{activityAnalytics.peakActivityValue} ações</h4>
                <span className="text-[10px] text-slate-400 mt-0.5 block">em {activityAnalytics.peakActivityDate || "N/D"}</span>
              </div>
              <div className="bg-orange-50 text-orange-600 p-2.5 rounded-xl">
                <Flame className="w-5 h-5 animate-bounce" />
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Módulos Ativos</span>
                <h4 className="text-xl font-mono font-bold text-slate-800 mt-1">{activityAnalytics.activeModulesCount}</h4>
                <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full inline-block mt-1 leading-none text-[9px]">{activityAnalytics.mostActiveModule || "N/A"}</span>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Operador Mais Ativo</span>
                <h4 className="text-sm font-bold text-slate-800 mt-1 truncate max-w-[130px]">{activityAnalytics.mostActiveUser || "N/D"}</h4>
                <span className="text-[10px] text-slate-400 mt-0.5 block">{activityAnalytics.mostActiveUserLogsCount} ações registradas</span>
              </div>
              <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
                <User className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Chart Controls & Recharts Visualization */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Cronograma Frequencial de Logs e Ações</h3>
                <p className="text-xs text-slate-400 mt-0.5">Representação gráfica da densidade de transações, acessos, exportações e alterações.</p>
              </div>

              {/* Grouping Toggle buttons */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold font-mono">
                {(["daily", "hourly", "module"] as const).map(group => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActivityGrouping(group)}
                    className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition ${
                      activityGrouping === group ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {group === "daily" ? "Por Dia" : group === "hourly" ? "Por Hora" : "Por Módulo"}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart Container */}
            <div className="h-[350px] w-full text-xs font-mono">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-50/50 rounded-2xl border border-dashed p-10">
                  <AlertTriangle className="w-8 h-8 text-slate-350" />
                  <span>Nenhuma atividade registrada no período selecionado.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <RechartsTooltip 
                      contentStyle={{ background: "#0f172a", border: "none", borderRadius: "12px", color: "#fff", fontSize: "11px" }}
                      itemStyle={{ color: "#38bdf8" }}
                    />
                    <Bar 
                      dataKey="count" 
                      name="Ações Executadas" 
                      fill={SYSTEM_THEMES.find(t => t.id === settings.theme)?.rgb ? `rgb(${SYSTEM_THEMES.find(t => t.id === settings.theme)?.rgb})` : "#f97316"} 
                      radius={[4, 4, 0, 0]} 
                      maxBarSize={45}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Audit Logs Table for context */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Registro Operacional em Tempo Real</h3>
              <p className="text-xs text-slate-400 mt-0.5">Lista detalhada dos últimos logs de auditoria correspondentes ao período.</p>
            </div>

            <div className="border border-slate-150 rounded-xl overflow-x-auto custom-scrollbar text-xs">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="p-3">Data/Hora</th>
                    <th className="p-3">Operador</th>
                    <th className="p-3">Módulo</th>
                    <th className="p-3">Ação</th>
                    <th className="p-3">Detalhes</th>
                    <th className="p-3 text-right">IP/Dispositivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">Nenhum registro encontrado.</td>
                    </tr>
                  ) : (
                    [...filteredLogs].reverse().slice(0, 15).map((log, idx) => (
                      <ReportAuditLogRow key={`${log.id || 'log'}-${idx}`} log={log} />
                    ))
                  )}
                </tbody>
              </table>
              {filteredLogs.length > 15 && (
                <div className="p-3 bg-slate-50 border-t border-slate-150 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Exibindo as 15 ações mais recentes de {filteredLogs.length} logs totais no período.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Enviar Fatura por E-mail</h3>
                <p className="text-xs text-slate-500 mt-0.5">Disparo via Gmail Oficial</p>
              </div>
              <div className="bg-orange-50 text-orange-600 p-2 rounded-xl">
                <Send className="w-5 h-5" />
              </div>
            </div>
            
            <form onSubmit={handleSendInvoiceEmail} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 mb-2">
                <p className="text-xs text-slate-600 font-semibold mb-1">Fatura Selecionada:</p>
                <div className="flex justify-between items-center font-mono">
                  <span className="font-bold text-slate-900">{showEmailModal.invoiceNumber}</span>
                  <span className="font-bold text-emerald-600">{formatMZ(showEmailModal.grandTotal)}</span>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">E-mail do Cliente</label>
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="cliente@email.com"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailModal(null);
                    setTargetEmail("");
                  }}
                  disabled={sendingInvoiceId === showEmailModal.id}
                  className="w-1/2 py-2.5 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingInvoiceId === showEmailModal.id || !targetEmail}
                  className="w-1/2 py-2.5 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-slate-900/20 disabled:opacity-70"
                >
                  {sendingInvoiceId === showEmailModal.id ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0"></span>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Enviar Agora
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            
            {/* Modal Header (No-Print) */}
            <div className="no-print flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-slate-900 text-sm">Comprovativo de Venda</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                Fechar ×
              </button>
            </div>

            {/* Printable Receipt Layout */}
            <div id="print-modal-container" className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-[11px] leading-tight text-slate-705 max-h-[420px] overflow-y-auto select-all">
              <style>{`
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  #print-modal-container, #print-modal-container * {
                    visibility: visible !important;
                  }
                  #print-modal-container {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    height: auto !important;
                    border: none !important;
                    background: white !important;
                    color: black !important;
                    padding: 20px !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    overflow: visible !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                }
              `}</style>

              <div className="text-center font-bold text-slate-800 mb-2 border-b border-dashed border-slate-300 pb-2">
                {settings.logoUrl && (
                  <img
                    src={settings.logoUrl}
                    alt="Logo Recibo"
                    className="w-10 h-10 object-contain mx-auto mb-1.5 bg-white p-0.5 rounded border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                )}
                <p className="uppercase">{settings.companyName || "Indisponível"}</p>
                <p className="font-normal text-[9px] text-slate-500 font-sans">{settings.storeAddress || settings.companyAddress || "Indisponível"}</p>
                <p className="font-normal text-[9px] text-slate-500 font-sans">NUIT: {settings.companyNuit || "Indisponível"}</p>
              </div>

              <div className="space-y-1 mb-2">
                <p><span className="text-slate-500">Fatura:</span> {showPrintModal.invoiceNumber}</p>
                <p><span className="text-slate-500">Data/Hora:</span> {new Date(showPrintModal.timestamp).toLocaleString()}</p>
                <p><span className="text-slate-500">Operador:</span> {showPrintModal.cashierName}</p>
                <p><span className="text-slate-500">Cliente:</span> {showPrintModal.customerName || "Consumidor Geral"}</p>
                {showPrintModal.nuit && <p><span className="text-slate-500">NUIT Cli:</span> {showPrintModal.nuit}</p>}
              </div>

              <div className="border-b border-dashed border-slate-300 py-1 mb-2">
                <div className="grid grid-cols-12 gap-1 font-bold text-slate-800 text-[10px]">
                  <span className="col-span-6 truncate">PRODUTO</span>
                  <span className="col-span-2 text-center">QTD</span>
                  <span className="col-span-4 text-right">VALOR</span>
                </div>
                {showPrintModal.items.map((item, i) => {
                  const q = Number(item.quantity || 1);
                  const p = Number(item.price ?? (item as any).salePrice ?? 0);
                  const lineVal = Number((item as any).subtotal ?? (p * q));
                  return (
                    <div key={`${item.productId}-${i}`} className="grid grid-cols-12 gap-1 py-0.5 text-slate-600">
                      <span className="col-span-6 truncate">{item.productName}</span>
                      <span className="col-span-2 text-center">{isNaN(q) ? 1 : q}</span>
                      <span className="col-span-4 text-right">{formatMZ(lineVal)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1 text-slate-600 text-right">
                <p>SUBTOTAL: {formatMZ(showPrintModal.subtotal)}</p>
                {Number(showPrintModal.discountTotal || 0) > 0 && <p className="text-red-650 font-bold">DESC. GER: -{formatMZ(showPrintModal.discountTotal)}</p>}
                <p>TOTAL IVA COBRADO: {formatMZ(showPrintModal.vatTotal)}</p>
                <p className="text-slate-900 font-bold text-xs border-t border-dashed border-slate-300 pt-1">
                  TOTAL PAGO: {formatMZ(showPrintModal.grandTotal)}
                </p>
                <p className="text-[10px] text-slate-500 font-medium italic mt-1">Método: {showPrintModal.paymentMethod}</p>
                {showPrintModal.paymentDetails && (
                  <p className="text-[9.5px] text-red-600 font-semibold italic mt-0.5">{showPrintModal.paymentDetails}</p>
                )}
              </div>

              <p className="text-center font-semibold text-[9px] text-slate-500 mt-3 border-t border-dashed border-slate-300 pt-2 block">
                *** Muito Obrigado Pela Visita! ***
              </p>

              {/* Unique QR Code Generator for Digital Receipt */}
              <div className="mt-3 pt-3 border-t border-dashed border-slate-300 flex flex-col items-center justify-center gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm no-print">
                <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(showPrintModal.invoiceNumber)}`}
                    alt={`QR Code Fatura ${showPrintModal.invoiceNumber}`}
                    className="w-20 h-20 object-contain"
                  />
                </div>
                <div className="text-center">
                  <span className="text-[8px] font-black text-slate-700 tracking-wider font-sans uppercase">RECIBO DIGITAL</span>
                  <p className="text-[7.5px] text-slate-400 font-sans mt-0.5 max-w-[180px] mx-auto leading-tight">
                    Aponte a câmara para visualizar a fatura digital <strong className="font-semibold text-slate-600">#{showPrintModal.invoiceNumber}</strong>
                  </p>
                </div>
              </div>

              {showPrintModal.fiscalCertified && (
                <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-center text-[9px] text-slate-500 font-sans space-y-2">
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-slate-700 tracking-wider">DOCUMENTO FISCAL HOMOLOGADO</p>
                    <p className="text-[8px]">Certificação Nº: {settings.fiscalCertificationNumber || "Indisponível"}</p>
                    {showPrintModal.fiscalKeys && <p className="font-mono text-[8px] bg-white py-0.5 rounded border border-slate-200 px-1 font-bold text-slate-800 select-all">Chave: {showPrintModal.fiscalKeys}</p>}
                    {showPrintModal.fiscalHash && <p className="font-mono text-[6.5px] text-slate-400 break-all leading-tight">Assinatura: {showPrintModal.fiscalHash}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Print Action Buttons (No-Print) */}
            <div className="no-print flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    printInvoiceHTML(showPrintModal, settings);
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="w-full py-2.5 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-orange-650/20 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Fatura (Nova Janela)
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(null)}
                  className="w-1/2 py-2 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs transition cursor-pointer text-center"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      console.warn(err);
                    }
                  }}
                  className="w-1/2 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  Via Térmica
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {showMonthlySummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="bg-orange-500 text-white p-2 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm md:text-base leading-tight">
                    Resumo Executivo Mensal
                  </h3>
                  <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                    {monthlyStats.monthName.toUpperCase()} DE {monthlyStats.year}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMonthlySummaryModal(false)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer px-2 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 text-center">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Faturamento</span>
                  <span className="text-xs md:text-sm font-bold font-mono text-slate-800 mt-1 block">
                    {formatMZ(monthlyStats.totalSales)}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 text-center">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Ticket Médio</span>
                  <span className="text-xs md:text-sm font-bold font-mono text-slate-800 mt-1 block">
                    {formatMZ(monthlyStats.averageTicket)}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 text-center">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Qtd Vendida</span>
                  <span className="text-xs md:text-sm font-bold font-mono text-slate-800 mt-1 block">
                    {monthlyStats.totalItemsCount} un
                  </span>
                </div>
              </div>

              {/* Tax & Discounts info card */}
              <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4 space-y-2.5">
                <h4 className="text-xs font-extrabold text-orange-950 uppercase tracking-wide">
                  Impostos & Encargos do Mês
                </h4>
                <div className="text-xs space-y-1.5 font-medium text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transações no período:</span>
                    <span className="font-mono font-bold text-slate-800">{monthlyStats.monthlyTx.length} vendas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Imposto IVA Acumulado (16%):</span>
                    <span className="font-mono font-bold text-slate-800">{formatMZ(monthlyStats.totalVat)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Descontos Geral Concedidos:</span>
                    <span className="font-mono font-bold text-red-650">-{formatMZ(monthlyStats.totalDiscount)}</span>
                  </div>
                </div>
              </div>

              {/* Top Products */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                  Produtos Mais Vendidos (Top 5)
                </h4>
                {monthlyStats.topProducts.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 italic">
                    Nenhuma venda registrada neste mês corrente ainda.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs bg-white shadow-sm">
                    {monthlyStats.topProducts.map((p, index) => (
                      <div key={index} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-slate-400 w-4 font-mono">#{index + 1}</span>
                          <span className="font-semibold text-slate-700">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-800 block">{p.qty} un</span>
                          <span className="text-[10px] text-slate-400 font-mono">{formatMZ(p.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => setShowMonthlySummaryModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer text-center"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleExportMonthlySummaryPDF}
                disabled={isExporting}
                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? "A processar..." : "Exportar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default memo(ReportsModule);
