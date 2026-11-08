import React, { useState, useMemo, useCallback, useEffect, memo } from "react";
import { 
  PiggyBank, 
  LayoutDashboard, 
  BookOpen, 
  History, 
  BarChart3
} from "lucide-react";
import { 
  CashFlowEntry, 
  Transaction, 
  UserRole, 
  SystemSettings, 
  Employee, 
  CashClosure 
} from "../types";
import { generateEntityId } from "../lib/deterministic";
import { CommercialDataService } from "../services/dataService";
import { CashKpiCards } from "./cash/CashKpiCards";
import { CashQuickActions } from "./cash/CashQuickActions";
import { CashReconciliationPanel } from "./cash/CashReconciliationPanel";
import { CashbookLedger } from "./cash/CashbookLedger";
import { CashClosuresHistory } from "./cash/CashClosuresHistory";
import { CashShiftModals } from "./cash/CashShiftModals";
import { exportCashbookPdf, exportSingleClosurePdf } from "./cash/cashPdfService";
import CashAnalyticalCharts from "./CashAnalyticalCharts";
import { DENOMINATIONS } from "./DenominationCounter";

import { ActiveCashShift } from "../services/cashShiftService";

interface CashRegisterModuleProps {
  cashFlow: CashFlowEntry[];
  transactions: Transaction[];
  onAddCashFlowEntry: (entry: CashFlowEntry) => void;
  activeUsername: string;
  activeUser?: Employee;
  employees?: Employee[];
  currentRole: UserRole;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currency: string;
  settings?: SystemSettings;
  theme?: string;
  onShowToast?: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  activeShift?: ActiveCashShift | null;
  onOpenShift?: (floatVal: number, supervisor: string, notes: string, registerId?: string) => Promise<void> | void;
  onCloseShift?: (physVal: number, supervisor: string, notes: string, denominations?: Record<string, number>) => Promise<void> | void;
}

function CashRegisterModule({
  cashFlow,
  transactions,
  onAddCashFlowEntry,
  activeUsername,
  activeUser,
  employees = [],
  currentRole,
  onAddAuditLog,
  currency = "MT",
  settings = {} as SystemSettings,
  theme = "light",
  onShowToast,
  activeShift,
  onOpenShift,
  onCloseShift
}: CashRegisterModuleProps) {
  // Main Module Tab Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "cashbook" | "closures" | "analytics">("dashboard");

  // Shift Status & Float (strictly in-memory, loaded directly from PostgreSQL/Supabase or prop)
  const [internalShiftStatus, setInternalShiftStatus] = useState<"OPEN" | "CLOSED">("CLOSED");
  const [internalOpeningBalance, setInternalOpeningBalance] = useState<number>(0);
  const [internalShiftOpenedAt, setInternalShiftOpenedAt] = useState<string>("");
  const [internalShiftOpenedBy, setInternalShiftOpenedBy] = useState<string>("");

  const shiftStatus = activeShift !== undefined ? (activeShift ? activeShift.status : "CLOSED") : internalShiftStatus;
  const openingBalance = activeShift !== undefined ? (activeShift ? activeShift.openingBalance : 0) : internalOpeningBalance;
  const shiftOpenedAt = activeShift !== undefined ? (activeShift ? activeShift.openedAt : "") : internalShiftOpenedAt;
  const shiftOpenedBy = activeShift !== undefined ? (activeShift ? activeShift.openedBy : activeUsername) : internalShiftOpenedBy;

  // Closures History State (strictly in-memory, loaded directly from PostgreSQL/Supabase)
  const [closuresHistory, setClosuresHistory] = useState<CashClosure[]>([]);

  // Fetch real closures and active shift directly from PostgreSQL/Supabase on mount
  useEffect(() => {
    let isMounted = true;

    // Load active shift status from PostgreSQL
    CommercialDataService.fetchActiveCashShift().then((shift) => {
      if (isMounted && shift) {
        setInternalShiftStatus(shift.status);
        setInternalOpeningBalance(shift.openingBalance || 0);
        setInternalShiftOpenedAt(shift.openedAt || "");
        setInternalShiftOpenedBy(shift.openedBy || activeUsername);
      }
    }).catch(err => {
      console.warn("[CAIXA] Erro ao carregar turno ativo do PostgreSQL:", err);
    });

    // Load historical closures from PostgreSQL
    CommercialDataService.fetchCashClosures().then((closures) => {
      if (isMounted && closures && closures.length > 0) {
        setClosuresHistory(closures);
      }
    }).catch(err => {
      console.warn("[CAIXA] Erro ao carregar fechos de caixa do PostgreSQL:", err);
    });

    // Subscribe to realtime cash closure events
    const sub = CommercialDataService.subscribeCashClosures(() => {
      CommercialDataService.fetchCashClosures().then((closures) => {
        if (isMounted && closures) {
          setClosuresHistory(closures);
        }
      }).catch(() => {});
    });

    return () => {
      isMounted = false;
      sub?.unsubscribe?.();
    };
  }, [activeUsername]);

  // Denominations Counter State - Clean default initialized to 0 for production commercialization
  const [denomCounts, setDenomCounts] = useState<{ [key: string]: number }>({
    "1000": 0,
    "500": 0,
    "200": 0,
    "100": 0,
    "50": 0,
    "20": 0,
    "10": 0,
    "5": 0,
    "2": 0,
    "1": 0,
    "0.5": 0
  });

  const calculatedFromDenoms = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * count);
    }, 0);
  }, [denomCounts]);

  const [physicalCount, setPhysicalCount] = useState<number>(() => calculatedFromDenoms);

  const handleDenomChange = (val: number, count: number) => {
    setDenomCounts(prev => ({
      ...prev,
      [val.toString()]: count
    }));
  };

  const handleResetDenoms = () => {
    const empty: { [key: string]: number } = {};
    DENOMINATIONS.forEach(d => {
      empty[d.value.toString()] = 0;
    });
    setDenomCounts(empty);
  };

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

  // Date Range for Cashbook
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));

  // Modals Visibility
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showSangriaModal, setShowSangriaModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryModalType, setEntryModalType] = useState<"REINFORCEMENT" | "EXPENSE" | "INPUT" | "DEVOLUTION" | "QUEBRA">("REINFORCEMENT");
  const [showDenomModal, setShowDenomModal] = useState(false);
  const [showAdjustFloatModal, setShowAdjustFloatModal] = useState(false);

  // Filtered transactions in date range
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.timestamp) return false;
      if (t.status === "CANCELLED" || (t as any).status === "REFUNDED") return false;
      const d = dateSplit(t.timestamp);
      return d >= startDate && d <= endDate;
    });
  }, [transactions, startDate, endDate]);

  // Filtered cashflow in date range
  const filteredCashFlow = useMemo(() => {
    return cashFlow.filter(f => {
      if (!f.timestamp) return false;
      const d = dateSplit(f.timestamp);
      return d >= startDate && d <= endDate;
    });
  }, [cashFlow, startDate, endDate]);

  // Cash Calculations Engine
  const cashMetrics = useMemo(() => {
    // 1. Sales by payment method
    let cashSales = 0;
    let mpesaSales = 0;
    let emolaSales = 0;
    let posCardSales = 0;
    let transferSales = 0;

    filteredTransactions.forEach(t => {
      if ((t.status as string) === "CANCELLED" || (t as any).status === "REFUNDED") return;
      const amt = Number(t.grandTotal || 0);
      const m = (t.paymentMethod || "").toUpperCase();
      if (m === "CASH" || m.includes("DINHEIRO")) cashSales += amt;
      else if (m.includes("MPESA") || m.includes("M-PESA")) mpesaSales += amt;
      else if (m.includes("EMOLA") || m.includes("E-MOLA")) emolaSales += amt;
      else if (m.includes("CARD") || m.includes("POS") || m.includes("CARTAO") || m.includes("CARTÃO")) posCardSales += amt;
      else if (m.includes("TRANSFER") || m.includes("BANCO")) transferSales += amt;
      else cashSales += amt;
    });

    const digitalSales = mpesaSales + emolaSales + posCardSales + transferSales;
    const totalSales = cashSales + digitalSales;

    // 2. Cash Flow Movements
    let reinforcements = 0;
    let inputs = 0;
    let sangrias = 0;
    let expenses = 0;
    let devolutions = 0;
    let quebras = 0;

    filteredCashFlow.forEach(f => {
      // Ignorar lançamentos de venda e troco vinculados (já consolidados em cashSales)
      if (f.category === "RECEBIMENTO_VENDA" || f.id.startsWith("cf-pay-") || f.id.startsWith("cf-sale-")) return;
      if (f.category === "TROCO_DEVOLVIDO" || f.id.startsWith("cf-troco-")) return;

      const amt = Number(f.amount || 0);
      const r = (f.reason || "").toLowerCase();
      if (f.type === "REINFORCEMENT") {
        reinforcements += amt;
      } else if (f.type === "INPUT") {
        inputs += amt;
      } else if (f.type === "SANGRIA" || (f.type === "EXPENSE" && (r.includes("sangria") || r.includes("retirada") || r.includes("cofre")))) {
        sangrias += amt;
      } else if (f.type === "DEVOLUTION" || r.includes("devolução") || r.includes("reembolso")) {
        devolutions += amt;
      } else if (f.type === "QUEBRA") {
        quebras += amt;
      } else if (f.type === "EXPENSE") {
        expenses += amt;
      }
    });

    // 3. Fundo de Abertura
    const currentOpening = shiftStatus === "OPEN" ? openingBalance : 0;

    // 4. Saldo Teórico em Dinheiro (Gaveta)
    // Formula: Fundo + Vendas Dinheiro + Reforços + Outras Entradas − Sangrias − Despesas − Devoluções − Quebras
    const theoreticalTotal = currentOpening + cashSales + reinforcements + inputs - sangrias - expenses - devolutions - quebras;

    return {
      openingValue: currentOpening,
      cashSales,
      mpesaSales,
      emolaSales,
      posCardSales,
      transferSales,
      digitalSales,
      totalSales,
      reinforcements,
      inputs,
      sangrias,
      expenses,
      devolutions,
      quebras,
      theoreticalTotal
    };
  }, [filteredTransactions, filteredCashFlow, shiftStatus, openingBalance]);

  // Unified Chronological Timeline
  const unifiedTimeline = useMemo(() => {
    const items: any[] = [];

    // Transactions
    filteredTransactions.forEach(t => {
      const isCash = t.paymentMethod === "CASH";
      items.push({
        id: `tx-${t.id}`,
        timestamp: t.timestamp,
        type: isCash ? "SALE" : "DIGITAL_SALE",
        paymentMethod: t.paymentMethod,
        amount: t.grandTotal,
        reason: isCash ? `Venda em Dinheiro #${t.invoiceNumber || t.id}` : `Venda Digital (${t.paymentMethod}) #${t.invoiceNumber || t.id}`,
        responsibleUser: t.cashierName || activeUsername,
        supplier: t.customerName || "Consumidor Final",
        isInput: true
      });
    });

    // Cashflow entries
    filteredCashFlow.forEach(f => {
      const r = (f.reason || "").toLowerCase();
      const isInput = f.type === "REINFORCEMENT" || f.type === "INPUT";
      items.push({
        id: f.id,
        timestamp: f.timestamp,
        type: f.type,
        amount: f.amount,
        reason: f.reason || "Lançamento manual de caixa",
        responsibleUser: f.responsibleUser || activeUsername,
        supplier: r.includes("fornecedor") || r.includes("papelaria") ? "Fornecedor Local" : "Gaveta de Caixa",
        isInput
      });
    });

    // Sort descending by timestamp
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }, [filteredTransactions, filteredCashFlow, activeUsername]);

  // Hourly Analytics Data
  const hourlyData = useMemo(() => {
    const hours = ["08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h", "20h"];
    const chartMap: { [hour: string]: { Entradas: number; Saídas: number } } = {};
    hours.forEach(h => {
      chartMap[h] = { Entradas: 0, Saídas: 0 };
    });

    const parseHour = (ts: string) => {
      try {
        const d = new Date(ts);
        const hr = d.getHours();
        if (hr >= 8 && hr <= 20) {
          return `${String(hr).padStart(2, "0")}h`;
        }
      } catch (e) {}
      return null;
    };

    filteredTransactions.forEach(t => {
      if (t.paymentMethod === "CASH") {
        const h = parseHour(t.timestamp);
        if (h && chartMap[h]) {
          chartMap[h].Entradas += Number(t.grandTotal || 0);
        }
      }
    });

    filteredCashFlow.forEach(f => {
      const h = parseHour(f.timestamp);
      if (h && chartMap[h]) {
        if (f.type === "INPUT" || f.type === "REINFORCEMENT") {
          chartMap[h].Entradas += Number(f.amount || 0);
        } else {
          chartMap[h].Saídas += Number(f.amount || 0);
        }
      }
    });

    return hours.map(h => ({
      hour: h,
      Entradas: chartMap[h].Entradas,
      Saídas: chartMap[h].Saídas
    }));
  }, [filteredTransactions, filteredCashFlow]);

  // Handlers for Operational Actions
  const handleOpenShift = useCallback((floatVal: number, supervisor: string, notes: string) => {
    if (onOpenShift) {
      onOpenShift(floatVal, supervisor, notes, "POS-01");
      return;
    }

    setInternalOpeningBalance(floatVal);
    setInternalShiftStatus("OPEN");
    const now = new Date().toISOString();
    setInternalShiftOpenedAt(now);
    setInternalShiftOpenedBy(activeUsername);

    // Persist active shift in Supabase
    CommercialDataService.saveActiveCashShift({
      status: "OPEN",
      openingBalance: floatVal,
      openedAt: now,
      openedBy: activeUsername,
      openingSupervisor: supervisor,
      openingNotes: notes
    });

    onAddAuditLog(
      "Abertura Turno Caixa",
      "CAIXA",
      `Turno aberto por ${activeUsername} com fundo inicial de ${floatVal.toLocaleString()} ${currency}. Homologado por: ${supervisor}. Obs: ${notes || "N/A"}`
    );
    onShowToast?.("Turno de caixa aberto com sucesso!", "success");
  }, [activeUsername, currency, onAddAuditLog, onShowToast, onOpenShift]);

  const handleCloseShift = useCallback(async (physVal: number, supervisor: string, notes: string) => {
    if (onCloseShift) {
      await onCloseShift(physVal, supervisor, notes, denomCounts);
      const closures = await CommercialDataService.fetchCashClosures();
      if (closures && closures.length > 0) {
        setClosuresHistory(closures);
      }
      return;
    }

    const diff = physVal - cashMetrics.theoreticalTotal;
    const now = new Date().toISOString();

    const newClosure: CashClosure = {
      id: generateEntityId("FECHO"),
      shiftId: generateEntityId("TURNO"),
      openedAt: shiftOpenedAt,
      closedAt: now,
      openedBy: shiftOpenedBy,
      closedBy: activeUsername,
      openingSupervisor: supervisor,
      closingSupervisor: supervisor,
      openingBalance,
      theoreticalBalance: cashMetrics.theoreticalTotal,
      physicalBalance: physVal,
      difference: diff,
      differenceType: diff === 0 ? "EXACT" : diff > 0 ? "SURPLUS" : "SHORTAGE",
      reconciliation: {
        cashSales: cashMetrics.cashSales,
        mpesaSales: cashMetrics.mpesaSales,
        emolaSales: cashMetrics.emolaSales,
        posCardSales: cashMetrics.posCardSales,
        transferSales: cashMetrics.transferSales,
        reinforcements: cashMetrics.reinforcements,
        inputs: cashMetrics.inputs,
        sangrias: cashMetrics.sangrias,
        expenses: cashMetrics.expenses,
        devolutions: cashMetrics.devolutions,
        quebras: cashMetrics.quebras,
        totalSales: cashMetrics.totalSales
      },
      closingNotes: notes || "Fechamento regular de turno homologado com sucesso."
    };

    setClosuresHistory(prev => [newClosure, ...prev]);
    setInternalShiftStatus("CLOSED");

    // Persist closure and shift status to Supabase
    CommercialDataService.saveCashClosure(newClosure);
    CommercialDataService.saveActiveCashShift({
      status: "CLOSED",
      openingBalance,
      openedAt: shiftOpenedAt,
      openedBy: shiftOpenedBy,
      openingSupervisor: supervisor,
      openingNotes: notes
    });

    onAddAuditLog(
      "Fechamento Turno Caixa",
      "CAIXA",
      `Turno de caixa encerrado. Teórico: ${cashMetrics.theoreticalTotal} ${currency}, Contado: ${physVal} ${currency}, Desvio: ${diff} ${currency}. Homologado por: ${supervisor}`
    );

    // Auto-generate closing document PDF
    exportSingleClosurePdf(newClosure, currency, settings);
    onShowToast?.(`Caixa fechado com sucesso! Desvio: ${diff.toLocaleString()} ${currency}`, diff === 0 ? "success" : "warning");
  }, [cashMetrics, openingBalance, shiftOpenedAt, shiftOpenedBy, activeUsername, currency, settings, onAddAuditLog, onShowToast, onCloseShift, denomCounts]);

  const handleSangria = useCallback((amt: number, dest: string, reason: string, supervisor: string) => {
    const entry: CashFlowEntry = {
      id: generateEntityId("flow_sangria"),
      timestamp: new Date().toISOString(),
      type: "EXPENSE",
      amount: amt,
      reason: `Sangria: [${dest}] - ${reason || "Retirada de segurança para cofre"}`,
      responsibleUser: activeUsername
    };

    onAddCashFlowEntry(entry);
    onAddAuditLog(
      "Sangria de Caixa",
      "CAIXA",
      `Sangria de ${amt.toLocaleString()} ${currency} executada por ${activeUsername} para ${dest}. Autorizada por: ${supervisor}`
    );
    onShowToast?.(`Sangria de ${amt.toLocaleString()} ${currency} registada com sucesso!`, "success");
  }, [activeUsername, currency, onAddCashFlowEntry, onAddAuditLog, onShowToast]);

  const handleGenericEntry = useCallback((type: "REINFORCEMENT" | "EXPENSE" | "INPUT" | "DEVOLUTION" | "QUEBRA", amt: number, reason: string, supplier: string) => {
    let finalReason = reason;
    if (supplier.trim()) {
      finalReason = `${reason} (Credor/Fornecedor: ${supplier})`;
    }

    const entry: CashFlowEntry = {
      id: generateEntityId(`flow_${type.toLowerCase()}`),
      timestamp: new Date().toISOString(),
      type,
      amount: amt,
      reason: finalReason,
      responsibleUser: activeUsername
    };

    onAddCashFlowEntry(entry);
    onAddAuditLog(
      `Lançamento Caixa (${type})`,
      "CAIXA",
      `Lançamento de ${type} no valor de ${amt.toLocaleString()} ${currency} por ${activeUsername}. Motivo: ${finalReason}`
    );
    onShowToast?.(`Operação de ${type} registada com sucesso!`, "success");
  }, [activeUsername, currency, onAddCashFlowEntry, onAddAuditLog, onShowToast]);

  const handleAdjustOpeningBalance = useCallback((newFloat: number, reason: string, supervisor: string) => {
    setInternalOpeningBalance(newFloat);
    
    if (shiftStatus === "OPEN") {
      CommercialDataService.saveActiveCashShift({
        status: "OPEN",
        openingBalance: newFloat,
        openedAt: shiftOpenedAt,
        openedBy: shiftOpenedBy,
        openingSupervisor: supervisor,
        openingNotes: `Ajuste manual de fundo de gaveta: ${reason}`
      });
    }

    onAddAuditLog(
      "Ajuste Manual Fundo de Gaveta",
      "CAIXA",
      `Fundo de maneio / Saldo Teórico da gaveta definido manualmente para ${newFloat.toLocaleString()} ${currency} por ${activeUsername}. Motivo: ${reason}. Homologado por: ${supervisor}`
    );
    onShowToast?.(`Fundo da gaveta atualizado para ${newFloat.toLocaleString()} ${currency}!`, "success");
  }, [shiftStatus, shiftOpenedAt, shiftOpenedBy, activeUsername, currency, onAddAuditLog, onShowToast]);

  // Export Livro de Caixa PDF
  const handleExportCashbookPdf = () => {
    exportCashbookPdf(unifiedTimeline, startDate, endDate, activeUsername, currency, settings);
    onAddAuditLog("Exportar Livro Caixa PDF", "CAIXA", `Relatório PDF de Livro de Caixa exportado por ${activeUsername}.`);
    onShowToast?.("Relatório PDF do Livro de Caixa gerado!", "info");
  };

  // Export CSV / Excel
  const handleExportCashbookCsv = () => {
    const headers = "ID,Data/Hora,Tipo,Operador,Descricao,Valor,Moeda\n";
    const rows = unifiedTimeline.map(item => {
      const isPositive = item.isInput || item.type === "SALE" || item.type === "REINFORCEMENT";
      const val = `${isPositive ? "" : "-"}${item.amount}`;
      const cleanReason = (item.reason || "").replace(/"/g, '""');
      return `"${item.id}","${item.timestamp}","${item.type}","${item.responsibleUser}","${cleanReason}",${val},"${currency}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Livro_Caixa_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddAuditLog("Exportar Livro Caixa CSV", "CAIXA", `Exportação CSV do Livro de Caixa efetuada por ${activeUsername}.`);
    onShowToast?.("Arquivo CSV do Livro de Caixa exportado!", "info");
  };

  const isManagerOrAdmin = currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "FINANCEIRO" || (currentRole as string) === "GERENTE";

  return (
    <div className="space-y-5">
      {/* Top Header Bar & Module Navigation */}
      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Controlo de Caixa & Turnos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operador: <span className="font-semibold text-slate-700 dark:text-slate-200">{activeUsername}</span> · Moeda: <span className="font-semibold text-blue-600 dark:text-blue-400">{currency}</span>
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === "dashboard"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Painel do Turno</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cashbook")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === "cashbook"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Livro de Caixa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("closures")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === "closures"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico Fechos ({closuresHistory.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === "analytics"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Gráficos Horários</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PAINEL DO TURNO & DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Main KPI Cards */}
          <CashKpiCards
            shiftStatus={shiftStatus}
            openingBalance={cashMetrics.openingValue}
            cashSalesAmount={cashMetrics.cashSales}
            digitalSalesAmount={cashMetrics.digitalSales}
            reinforcements={cashMetrics.reinforcements}
            inputs={cashMetrics.inputs}
            sangrias={cashMetrics.sangrias}
            expenses={cashMetrics.expenses}
            devolutions={cashMetrics.devolutions}
            quebras={cashMetrics.quebras}
            theoreticalTotal={cashMetrics.theoreticalTotal}
            physicalCount={physicalCount}
            currency={currency}
            onOpenDenomModal={() => setShowDenomModal(true)}
            onEditOpeningBalance={() => setShowAdjustFloatModal(true)}
          />

          {/* Quick Operations Bar */}
          <CashQuickActions
            shiftStatus={shiftStatus}
            onOpenShiftModal={() => setShowOpenModal(true)}
            onCloseShiftModal={() => setShowCloseModal(true)}
            onOpenSangriaModal={() => setShowSangriaModal(true)}
            onOpenEntryModal={(type) => {
              setEntryModalType(type);
              setShowEntryModal(true);
            }}
            onOpenDenomModal={() => setShowDenomModal(true)}
            onExportPdf={handleExportCashbookPdf}
            onExportCsv={handleExportCashbookCsv}
            isManagerOrAdmin={isManagerOrAdmin}
          />

          {/* Mozambique Multichannel Reconciliation Panel */}
          <CashReconciliationPanel
            cashSales={cashMetrics.cashSales}
            mpesaSales={cashMetrics.mpesaSales}
            emolaSales={cashMetrics.emolaSales}
            posCardSales={cashMetrics.posCardSales}
            transferSales={cashMetrics.transferSales}
            currency={currency}
          />

          {/* Hourly Visual Charts Preview */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider">
                Fluxo de Caixa por Hora (Turno Ativo)
              </span>
              <span className="text-[11px] text-slate-400">
                Entradas em dinheiro vs. Saídas operacionais
              </span>
            </div>
            <CashAnalyticalCharts data={hourlyData} currency={currency} />
          </div>
        </div>
      )}

      {/* TAB 2: LIVRO DE CAIXA */}
      {activeTab === "cashbook" && (
        <div className="animate-in fade-in duration-200">
          <CashbookLedger
            entries={unifiedTimeline}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            currency={currency}
            onExportPdf={handleExportCashbookPdf}
            onExportCsv={handleExportCashbookCsv}
          />
        </div>
      )}

      {/* TAB 3: HISTÓRICO DE FECHAMENTOS */}
      {activeTab === "closures" && (
        <div className="animate-in fade-in duration-200">
          <CashClosuresHistory
            closures={closuresHistory}
            currency={currency}
            settings={settings}
            onAuditLog={onAddAuditLog}
          />
        </div>
      )}

      {/* TAB 4: GRÁFICOS ANALÍTICOS */}
      {activeTab === "analytics" && (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Análise Horária de Fluxo Financeiro em Caixa
            </h3>
            <p className="text-xs text-slate-500">
              Distribuição por faixa de horário dos recebimentos em dinheiro e saídas de caixa
            </p>
          </div>
          <CashAnalyticalCharts data={hourlyData} currency={currency} />
        </div>
      )}

      {/* MODALS COMPONENT */}
      <CashShiftModals
        activeUsername={activeUsername}
        employees={employees}
        settings={settings}
        currency={currency}
        showOpenModal={showOpenModal}
        onCloseOpenModal={() => setShowOpenModal(false)}
        showCloseModal={showCloseModal}
        onCloseCloseModal={() => setShowCloseModal(false)}
        showSangriaModal={showSangriaModal}
        onCloseSangriaModal={() => setShowSangriaModal(false)}
        showEntryModal={showEntryModal}
        entryModalType={entryModalType}
        onCloseEntryModal={() => setShowEntryModal(false)}
        showDenomModal={showDenomModal}
        onCloseDenomModal={() => setShowDenomModal(false)}
        showAdjustFloatModal={showAdjustFloatModal}
        onCloseAdjustFloatModal={() => setShowAdjustFloatModal(false)}
        theoreticalBalance={cashMetrics.theoreticalTotal}
        physicalBalance={physicalCount}
        openingBalance={openingBalance}
        cashSalesAmount={cashMetrics.cashSales}
        digitalSalesAmount={cashMetrics.digitalSales}
        reinforcements={cashMetrics.reinforcements}
        inputs={cashMetrics.inputs}
        sangrias={cashMetrics.sangrias}
        expenses={cashMetrics.expenses}
        devolutions={cashMetrics.devolutions}
        quebras={cashMetrics.quebras}
        denomCounts={denomCounts}
        onChangeDenomCount={handleDenomChange}
        onResetDenomCounts={handleResetDenoms}
        onApplyDenomToPhysical={(total) => setPhysicalCount(total)}
        onConfirmOpenShift={handleOpenShift}
        onConfirmCloseShift={handleCloseShift}
        onConfirmSangria={handleSangria}
        onConfirmEntry={handleGenericEntry}
        onConfirmAdjustFloat={handleAdjustOpeningBalance}
      />
    </div>
  );
}

export default memo(CashRegisterModule);
