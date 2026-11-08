import { useMemo, useState, useCallback, memo } from "react";
import { 
  DollarSign, 
  ShoppingBag,
  Calendar,
  BadgePercent,
  Trash2,
  Percent,
  Receipt,
  Package,
  Printer,
  ChevronRight,
  X,
  CreditCard,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  PiggyBank
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell
} from "recharts";
import { Product, Customer, Transaction, CashFlowEntry, SystemSettings } from "../types";
import { printInvoiceHTML } from "../lib/printHelper";
import { PromoFlyerGenerator } from "./PromoFlyerGenerator";
import { ProfitMarginWidget } from "./dashboard/ProfitMarginWidget";

interface DashboardModuleProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  cashFlow: CashFlowEntry[];
  currency: string;
  activeUser?: any;
  onChangeModule?: (mod: string) => void;
  settings?: SystemSettings;
  onUpdateSettings?: (newSettings: Partial<SystemSettings>) => void;
  onUpdateProduct?: (updatedP: Product) => void;
  onAddAuditLog?: (action: string, module: string, description: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
  onCompleteSale?: (transaction: Transaction) => void;
  isOnline?: boolean;
  theme?: string;
  onTriggerPanic?: () => void;
  transactionsError?: string | null;
  onRetryTransactions?: () => void;
}

const PAYMENT_COLORS = ["#2563eb", "#10b981", "#6366f1", "#0284c7", "#64748b"];

// Pure date formatting helpers placed outside component scope to avoid reallocation per render
const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateSplit = (rawDate: any): string => {
  if (!rawDate) return "";
  if (typeof rawDate === "string") {
    // Fast path: ISO string starting with YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      return rawDate.substring(0, 10);
    }
    const cleaned = rawDate.includes(" ") && !rawDate.includes("T") 
      ? rawDate.replace(" ", "T") 
      : rawDate;
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return formatLocalDate(d);
    return rawDate.split("T")[0].split(" ")[0];
  }
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return formatLocalDate(d);
  } catch {}
  return "";
};

interface NormalizedTxItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  costPrice: number;
  subtotal: number;
  emoji?: string;
}

interface NormalizedTransaction {
  id: string;
  original: Transaction;
  dateStr: string;
  monthStr: string;
  timestampMs: number;
  hour: number;
  grandTotal: number;
  paymentMethod: string;
  items: NormalizedTxItem[];
  totalQuantity: number;
  totalCost: number;
}

function DashboardModule({
  products,
  transactions,
  currency,
  activeUser,
  onChangeModule,
  settings,
  onUpdateProduct,
  onAddAuditLog,
  onShowToast,
  transactionsError,
  onRetryTransactions
}: DashboardModuleProps) {
  // Period scope: TODAY, YESTERDAY, LAST_7, THIS_MONTH
  const [timeScope, setTimeScope] = useState<"TODAY" | "YESTERDAY" | "LAST_7" | "THIS_MONTH">("TODAY");

  // Selected Transaction for details modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Expiry Batch Promo / Discard States
  const [promoProduct, setPromoProduct] = useState<Product | null>(null);
  const [promoBatch, setPromoBatch] = useState<any | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [customPromoPrice, setCustomPromoPrice] = useState<string>("");
  const [isFlyerGeneratorOpen, setIsFlyerGeneratorOpen] = useState(false);
  const [flyerProduct, setFlyerProduct] = useState<Product | null>(null);
  const [confirmDiscardBatch, setConfirmDiscardBatch] = useState<any | null>(null);

  // Date anchors memoized
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);
  
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatLocalDate(d);
  }, []);

  const last7DaysStrings = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      list.push(formatLocalDate(d));
    }
    return list;
  }, []);

  const last7DaysSet = useMemo(() => new Set(last7DaysStrings), [last7DaysStrings]);

  const prev7DaysSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 7; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      set.add(formatLocalDate(d));
    }
    return set;
  }, []);

  const currentMonthStr = useMemo(() => todayStr.substring(0, 7), [todayStr]);

  const lastMonthStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return formatLocalDate(d).substring(0, 7);
  }, []);

  // Product Map: O(1) hashmap lookup avoiding quadratic O(N*M) array finds
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < products.length; i++) {
      map.set(products[i].id, products[i]);
    }
    return map;
  }, [products]);

  // Normalized and parsed transactions: Performed ONCE per transactions/products change.
  // Parses dates, extracts items JSON, and computes totals so subsequent renders and scope switches are instantaneous.
  const validNormalizedTransactions = useMemo(() => {
    const list: NormalizedTransaction[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      // Exclude cancelled and refunded transactions
      if (tx.status === "CANCELLED" || (tx as any).status === "REFUNDED") continue;

      const dateStr = dateSplit(tx.timestamp);
      if (!dateStr) continue;

      const dateObj = new Date(tx.timestamp);
      const timestampMs = !isNaN(dateObj.getTime()) ? dateObj.getTime() : 0;
      const hour = !isNaN(dateObj.getTime()) ? dateObj.getHours() : 12;
      const grandTotal = Number(tx.grandTotal || 0);

      // Parse items safely only once
      let rawItems: any[] = [];
      if (Array.isArray(tx.items)) {
        rawItems = tx.items;
      } else if (typeof (tx as any).items === "string") {
        try { rawItems = JSON.parse((tx as any).items); } catch {}
      } else if (typeof (tx as any).itemsJson === "string") {
        try { rawItems = JSON.parse((tx as any).itemsJson); } catch {}
      }

      let txQuantity = 0;
      let txCost = 0;
      const parsedItems: NormalizedTxItem[] = [];

      for (let j = 0; j < rawItems.length; j++) {
        const it = rawItems[j];
        const prodId = it.productId || it.product_id || it.id || it.name || `item-${j}`;
        const prod = productMap.get(prodId);
        const qty = Number(it.quantity || it.qty || 1);
        const price = Number(it.price || it.salePrice || it.sale_price || 0);
        const costPrice = it.costPrice !== undefined ? Number(it.costPrice) : Number(prod?.costPrice || 0);
        const subtotal = Number(it.subtotal || (price * qty));

        txQuantity += qty;
        txCost += costPrice * qty;

        parsedItems.push({
          productId: prodId,
          name: it.productName || it.product_name || prod?.name || "Produto",
          quantity: qty,
          price,
          costPrice,
          subtotal,
          emoji: prod?.emoji || "📦"
        });
      }

      list.push({
        id: tx.id,
        original: tx,
        dateStr,
        monthStr: dateStr.substring(0, 7),
        timestampMs,
        hour,
        grandTotal,
        paymentMethod: tx.paymentMethod || "CASH",
        items: parsedItems,
        totalQuantity: txQuantity,
        totalCost: txCost
      });
    }

    return list;
  }, [transactions, productMap]);

  // Filter transactions based on selected scope: O(N) fast property check using precomputed date strings
  const scopedTransactions = useMemo(() => {
    return validNormalizedTransactions.filter(tx => {
      if (timeScope === "TODAY") return tx.dateStr === todayStr;
      if (timeScope === "YESTERDAY") return tx.dateStr === yesterdayStr;
      if (timeScope === "LAST_7") return last7DaysSet.has(tx.dateStr);
      if (timeScope === "THIS_MONTH") return tx.dateStr.startsWith(currentMonthStr);
      return true;
    });
  }, [validNormalizedTransactions, timeScope, todayStr, yesterdayStr, last7DaysSet, currentMonthStr]);

  // Real KPI statistics directly from authoritative transactions: Fast single-pass aggregation
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalQuantity = 0;
    const txCount = scopedTransactions.length;

    for (let i = 0; i < txCount; i++) {
      const tx = scopedTransactions[i];
      totalRevenue += tx.grandTotal;
      totalCost += tx.totalCost;
      totalQuantity += tx.totalQuantity;
    }

    const totalProfit = Math.max(0, totalRevenue - totalCost);
    const avgTicket = txCount > 0 ? Math.round(totalRevenue / txCount) : 0;
    const profitMarginPercent = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

    // Comparison metrics:
    let prevRevenue = 0;
    let prevCost = 0;

    if (timeScope === "THIS_MONTH") {
      for (let i = 0; i < validNormalizedTransactions.length; i++) {
        const tx = validNormalizedTransactions[i];
        if (tx.monthStr === lastMonthStr) {
          prevRevenue += tx.grandTotal;
          prevCost += tx.totalCost;
        }
      }
    } else if (timeScope === "LAST_7") {
      for (let i = 0; i < validNormalizedTransactions.length; i++) {
        const tx = validNormalizedTransactions[i];
        if (prev7DaysSet.has(tx.dateStr)) {
          prevRevenue += tx.grandTotal;
          prevCost += tx.totalCost;
        }
      }
    } else {
      for (let i = 0; i < validNormalizedTransactions.length; i++) {
        const tx = validNormalizedTransactions[i];
        if (tx.dateStr === yesterdayStr) {
          prevRevenue += tx.grandTotal;
          prevCost += tx.totalCost;
        }
      }
    }

    const prevProfit = Math.max(0, prevRevenue - prevCost);
    const prevMarginPercent = prevRevenue > 0 ? Math.round((prevProfit / prevRevenue) * 100) : 0;
    const profitGrowthRate = prevProfit > 0 ? ((totalProfit - prevProfit) / prevProfit) * 100 : (totalProfit > 0 ? 100 : 0);
    const marginPointsDiff = profitMarginPercent - prevMarginPercent;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      totalQuantity,
      txCount,
      avgTicket,
      profitMarginPercent,
      yesterdaySales: prevRevenue,
      yesterdayCostOfSales: prevCost,
      yesterdayProfit: prevProfit,
      yesterdayProfitMarginPercent: prevMarginPercent,
      profitGrowthRate,
      marginPointsDiff
    };
  }, [scopedTransactions, validNormalizedTransactions, timeScope, yesterdayStr, lastMonthStr, prev7DaysSet]);

  // Chart: Timeline of sales in selected scope
  const chartTimelineData = useMemo(() => {
    if (timeScope === "TODAY" || timeScope === "YESTERDAY") {
      // Group by hour blocks (08:00 to 22:00)
      const hoursMap: Record<string, number> = {
        "08:00": 0, "10:00": 0, "12:00": 0, "14:00": 0,
        "16:00": 0, "18:00": 0, "20:00": 0, "22:00": 0
      };
      const targetDate = timeScope === "TODAY" ? todayStr : yesterdayStr;

      for (let i = 0; i < scopedTransactions.length; i++) {
        const tx = scopedTransactions[i];
        if (tx.dateStr === targetDate) {
          const hour = tx.hour;
          let slot = "08:00";
          if (hour >= 21) slot = "22:00";
          else if (hour >= 19) slot = "20:00";
          else if (hour >= 17) slot = "18:00";
          else if (hour >= 15) slot = "16:00";
          else if (hour >= 13) slot = "14:00";
          else if (hour >= 11) slot = "12:00";
          else if (hour >= 9) slot = "10:00";
          else slot = "08:00";

          hoursMap[slot] += tx.grandTotal;
        }
      }

      return Object.keys(hoursMap).map(h => ({
        label: h,
        valor: Math.round(hoursMap[h])
      }));
    }

    if (timeScope === "LAST_7") {
      // Last 7 days ordered chronologically
      const days = [...last7DaysStrings].reverse();
      const map: Record<string, number> = {};
      for (let i = 0; i < days.length; i++) {
        map[days[i]] = 0;
      }

      for (let i = 0; i < scopedTransactions.length; i++) {
        const tx = scopedTransactions[i];
        if (map[tx.dateStr] !== undefined) {
          map[tx.dateStr] += tx.grandTotal;
        }
      }

      return days.map(d => {
        const parts = d.split("-");
        const formatted = `${parts[2]}/${parts[1]}`;
        return {
          label: formatted,
          valor: Math.round(map[d] || 0)
        };
      });
    }

    // THIS_MONTH: Day-by-day sales volume for each day of current month
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthPart = currentMonthStr.split("-")[1] || String(now.getMonth() + 1).padStart(2, "0");

    const maxDay = Math.max(Math.min(currentDay, daysInMonth), 7);
    const dayMap: Record<number, number> = {};
    for (let day = 1; day <= maxDay; day++) {
      dayMap[day] = 0;
    }

    for (let i = 0; i < scopedTransactions.length; i++) {
      const tx = scopedTransactions[i];
      if (tx.dateStr.startsWith(currentMonthStr)) {
        const dayPart = parseInt(tx.dateStr.split("-")[2], 10);
        if (!isNaN(dayPart) && dayPart >= 1 && dayPart <= daysInMonth) {
          dayMap[dayPart] = (dayMap[dayPart] || 0) + tx.grandTotal;
        }
      }
    }

    return Object.entries(dayMap).map(([dayStr, total]) => {
      const dayNum = parseInt(dayStr, 10);
      const paddedDay = String(dayNum).padStart(2, "0");
      return {
        label: `${paddedDay}/${monthPart}`,
        valor: Math.round(total)
      };
    });
  }, [scopedTransactions, timeScope, todayStr, yesterdayStr, last7DaysStrings, currentMonthStr]);

  // Chart: Payment methods distribution - O(N) fast pass with precomputed grandTotal
  const chartPaymentMethods = useMemo(() => {
    const map: Record<string, number> = {
      "Dinheiro": 0,
      "M-Pesa": 0,
      "E-Mola": 0,
      "Cartão (POS)": 0,
      "Transferência": 0,
      "Outro": 0
    };

    for (let i = 0; i < scopedTransactions.length; i++) {
      const tx = scopedTransactions[i];
      const method = (tx.paymentMethod || "").toUpperCase();
      const amount = tx.grandTotal;
      if (method === "CASH" || method.includes("DINHEIRO")) {
        map["Dinheiro"] += amount;
      } else if (method.includes("MPESA") || method.includes("M-PESA")) {
        map["M-Pesa"] += amount;
      } else if (method.includes("EMOLA") || method.includes("E-MOLA")) {
        map["E-Mola"] += amount;
      } else if (method.includes("CARD") || method.includes("POS") || method.includes("CARTAO") || method.includes("CARTÃO")) {
        map["Cartão (POS)"] += amount;
      } else if (method.includes("TRANSFER") || method.includes("BANCO")) {
        map["Transferência"] += amount;
      } else {
        map["Outro"] += amount;
      }
    }

    return Object.entries(map)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [scopedTransactions]);

  // Top Selling Products in period: Direct O(items) iteration without quadratic products.find lookup
  const topProducts = useMemo(() => {
    const map: Record<string, { id: string; name: string; quantity: number; revenue: number; emoji?: string }> = {};

    for (let i = 0; i < scopedTransactions.length; i++) {
      const tx = scopedTransactions[i];
      for (let j = 0; j < tx.items.length; j++) {
        const item = tx.items[j];
        const prodId = item.productId;
        if (!map[prodId]) {
          map[prodId] = {
            id: prodId,
            name: item.name,
            quantity: 0,
            revenue: 0,
            emoji: item.emoji
          };
        }
        map[prodId].quantity += item.quantity;
        map[prodId].revenue += item.subtotal;
      }
    }

    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [scopedTransactions]);

  // Recent Transactions in period (max 6): Fast numeric timestamp sort
  const recentTransactions = useMemo(() => {
    return [...scopedTransactions]
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 6)
      .map(tx => tx.original);
  }, [scopedTransactions]);

  // Expiring Batches (within 30 days) from real products
  const expiringBatches = useMemo(() => {
    const list: any[] = [];
    const now = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(now.getDate() + 30);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (Array.isArray(p.batches)) {
        for (let j = 0; j < p.batches.length; j++) {
          const b = p.batches[j];
          if (b.quantity > 0 && b.expiryDate) {
            const expDate = new Date(b.expiryDate);
            if (expDate <= thirtyDaysAhead) {
              const diffTime = expDate.getTime() - now.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              list.push({
                ...b,
                productId: p.id,
                productName: p.name,
                product: p,
                daysLeft: diffDays,
                isExpired: diffDays <= 0
              });
            }
          }
        }
      }
    }

    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [products]);

  // Actions for batch promos / discards memoized with useCallback
  const handleApplyPromo = useCallback((prodId: string, batchId: string, pct: number, promoPrice: number) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod || !onUpdateProduct) return;

    const updated: Product = {
      ...prod,
      salePrice: promoPrice,
      promotion: "PROMO"
    };

    onUpdateProduct(updated);
    if (onAddAuditLog) {
      onAddAuditLog(
        "PROMOÇÃO_VALIDADE",
        "DASHBOARD",
        `Produto ${prod.name} (Lote: ${batchId}) em promoção por ${promoPrice} ${currency} (-${pct}%)`
      );
    }
    if (onShowToast) {
      onShowToast(`Promoção ativada para ${prod.name}! Novo preço: ${promoPrice} ${currency}`, "success");
    }
    setPromoProduct(null);
    setPromoBatch(null);
  }, [products, onUpdateProduct, onAddAuditLog, onShowToast, currency]);

  const handleDiscardBatch = useCallback((batchId: string) => {
    if (!confirmDiscardBatch || !onUpdateProduct) return;
    const prod = confirmDiscardBatch.product;
    if (!prod) return;

    const updatedBatches = (prod.batches || []).filter((b: any) => b.id !== batchId);
    const discardedQty = confirmDiscardBatch.quantity;
    const newStock = Math.max(0, (prod.stock || 0) - discardedQty);

    const updatedProd: Product = {
      ...prod,
      stock: newStock,
      batches: updatedBatches
    };

    onUpdateProduct(updatedProd);
    if (onAddAuditLog) {
      onAddAuditLog(
        "DESCARTE_LOTE",
        "STOCK",
        `Descarte de ${discardedQty} unidades do lote ${confirmDiscardBatch.batchCode} de ${prod.name} por vencimento.`
      );
    }
    if (onShowToast) {
      onShowToast(`Lote ${confirmDiscardBatch.batchCode} descartado com sucesso.`, "info");
    }
    setConfirmDiscardBatch(null);
  }, [confirmDiscardBatch, onUpdateProduct, onAddAuditLog, onShowToast]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. CLEAN EXECUTIVE HEADER & PERIOD SELECTOR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Painel de Controlo Comercial
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Dashboard Executivo
          </h1>
          <p className="text-xs text-slate-500">
            Visão consolidada de vendas, rentabilidade e operações em tempo real.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-semibold w-full md:w-auto border border-slate-200/60">
          <button
            type="button"
            onClick={() => setTimeScope("TODAY")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              timeScope === "TODAY"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setTimeScope("YESTERDAY")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              timeScope === "YESTERDAY"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Ontem
          </button>
          <button
            type="button"
            onClick={() => setTimeScope("LAST_7")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              timeScope === "LAST_7"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            7 Dias
          </button>
          <button
            type="button"
            onClick={() => setTimeScope("THIS_MONTH")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              timeScope === "THIS_MONTH"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Este Mês
          </button>
        </div>
      </div>

      {/* QUICK ACTIONS ROW: As 4 Operações Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onChangeModule?.("POS")}
          className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-left transition flex items-center justify-between group shadow-xs cursor-pointer"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-100 block">Ponto de Venda</span>
            <strong className="text-sm font-bold block mt-0.5">Nova Venda</strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition">
            <ShoppingBag className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule?.("STOCK")}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-left transition flex items-center justify-between group shadow-xs cursor-pointer"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Inventário</span>
            <strong className="text-sm font-bold text-slate-800 block mt-0.5">Adicionar Produto</strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <Package className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule?.("CUSTOMERS")}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-left transition flex items-center justify-between group shadow-xs cursor-pointer"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Créditos & Clientes</span>
            <strong className="text-sm font-bold text-slate-800 block mt-0.5">Receber Pagamento</strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <CreditCard className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule?.("CASH")}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-left transition flex items-center justify-between group shadow-xs cursor-pointer"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Caixa do Turno</span>
            <strong className="text-sm font-bold text-slate-800 block mt-0.5">Consultar Caixa</strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <PiggyBank className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* ERROR ALERT: PostgreSQL Sales Fetch Failure (Do NOT mask error as zero sales) */}
      {transactionsError && (
        <div id="dashboard-sales-error-banner" className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4.5 text-rose-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm" role="alert">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-sm text-rose-950 flex items-center gap-2">
                <span>Falha na Leitura das Vendas</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
                  Erro Crítico
                </span>
              </h4>
              <p className="text-xs text-rose-800 font-medium mt-1 leading-relaxed">
                O servidor retornou o seguinte erro: <code className="bg-rose-100/80 px-1.5 py-0.5 rounded font-mono font-bold text-rose-900 border border-rose-200">{transactionsError}</code>. Os valores abaixo não refletem zero vendas reais; a recuperação das vendas falhou.
              </p>
            </div>
          </div>
          {onRetryTransactions && (
            <button
              id="dashboard-retry-sales-btn"
              type="button"
              onClick={onRetryTransactions}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-2 transition cursor-pointer shadow-sm hover:shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          )}
        </div>
      )}

      {/* 2. KEY METRICS ROW (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {timeScope === "TODAY" ? "Vendas de Hoje" : timeScope === "YESTERDAY" ? "Vendas de Ontem" : timeScope === "LAST_7" ? "Vendas (7 Dias)" : "Vendas do Mês"}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold font-mono text-slate-900">
              {stats.totalRevenue.toLocaleString()} <span className="text-xs font-medium text-slate-400">{currency}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
              <span>{stats.txCount} {stats.txCount === 1 ? "venda" : "vendas"}</span>
              <span className="text-slate-300">•</span>
              <span>{stats.totalQuantity} {stats.totalQuantity === 1 ? "artigo" : "artigos"}</span>
            </p>
          </div>
        </div>

        {/* Card 2: Estimated Profit */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Lucro Real
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold font-mono text-emerald-600">
              +{stats.totalProfit.toLocaleString()} <span className="text-xs font-medium text-slate-400">{currency}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <span>Margem líquida: <strong className="text-slate-700 font-mono">{stats.profitMarginPercent}%</strong></span>
            </p>
          </div>
        </div>

        {/* Card 3: Transaction Count */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Transações & Volume
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold font-mono text-slate-900">
              {stats.txCount} <span className="text-xs font-medium text-slate-400">{stats.txCount === 1 ? "recibo" : "recibos"}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              {stats.totalQuantity} {stats.totalQuantity === 1 ? "artigo vendido" : "artigos vendidos"}
            </p>
          </div>
        </div>

        {/* Card 4: Average Ticket */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Ticket Médio
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold font-mono text-slate-900">
              {stats.avgTicket.toLocaleString()} <span className="text-xs font-medium text-slate-400">{currency}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Média por cliente
            </p>
          </div>
        </div>
      </div>

      {/* 3. PERFORMANCE PROFIT MARGIN WIDGET */}
      <ProfitMarginWidget
        dailySales={stats.totalRevenue}
        dailyCostOfSales={stats.totalCost}
        dailyProfit={stats.totalProfit}
        dailyProfitMarginPercent={stats.profitMarginPercent}
        yesterdaySales={stats.yesterdaySales}
        yesterdayCostOfSales={stats.yesterdayCostOfSales}
        yesterdayProfit={stats.yesterdayProfit}
        yesterdayProfitMarginPercent={stats.yesterdayProfitMarginPercent}
        profitGrowthRate={stats.profitGrowthRate}
        marginPointsDiff={stats.marginPointsDiff}
        currency={currency}
        selectedDateStr={todayStr}
        isToday={timeScope === "TODAY"}
        timeScope={timeScope}
      />

      {/* 4. BALANCED CHARTS ROW (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Sales Timeline (Area Chart) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-88">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                Evolução do Faturamento
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Valores reais de vendas correspondentes ao período selecionado.
              </p>
            </div>
            <span className="text-xs font-bold font-mono text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
              {stats.totalRevenue.toLocaleString()} {currency}
            </span>
          </div>

          <div className="flex-1 min-h-0 text-[11px] font-mono">
            {stats.totalRevenue === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                <Package className="w-8 h-8 text-slate-300 stroke-1" />
                <p className="text-xs font-medium">Nenhuma venda registrada no período selecionado.</p>
                {onChangeModule && (
                  <button
                    type="button"
                    onClick={() => onChangeModule("POS")}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    Abrir Ponto de Venda (POS) <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSalesClean" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: any) => [`${Number(value).toLocaleString()} ${currency}`, "Faturamento"]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", border: "none", color: "#fff", fontSize: "11px" }}
                  />
                  <Area type="monotone" dataKey="valor" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSalesClean)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Payment Methods (Donut Chart) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-88">
          <div className="mb-2">
            <h3 className="font-bold text-slate-800 text-sm">Métodos de Pagamento</h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribuição das vendas realizadas.</p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-[11px]">
            {chartPaymentMethods.length === 0 ? (
              <div className="text-center p-6 text-slate-400 space-y-2">
                <CreditCard className="w-8 h-8 text-slate-300 stroke-1 mx-auto" />
                <p className="text-xs font-medium">Sem transações registradas no período.</p>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="w-full h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartPaymentMethods}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={68}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartPaymentMethods.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => [`${Number(val).toLocaleString()} ${currency}`, "Valor"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Clean Custom Legend */}
                <div className="w-full grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
                  {chartPaymentMethods.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-[10.5px]">
                      <div className="flex items-center gap-1.5 truncate">
                        <span 
                          className="w-2 h-2 rounded-full shrink-0" 
                          style={{ backgroundColor: PAYMENT_COLORS[idx % PAYMENT_COLORS.length] }} 
                        />
                        <span className="text-slate-600 truncate">{item.name}</span>
                      </div>
                      <span className="font-bold font-mono text-slate-800 shrink-0">
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. OPERATIONAL OVERVIEW: TOP PRODUCTS & RECENT TRANSACTIONS (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Column 1: Top Selling Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Produtos Mais Vendidos</h3>
              <p className="text-xs text-slate-400 mt-0.5">Ranking por receita gerada no período.</p>
            </div>
            {topProducts.length > 0 && (
              <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded-md">
                Top {topProducts.length}
              </span>
            )}
          </div>

          <div className="flex-1">
            {topProducts.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-1">
                <p className="text-xs font-medium">Nenhum produto vendido neste período.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {topProducts.map((p, idx) => (
                  <div key={p.id} className="py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors rounded-xl px-2">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-base">{p.emoji || "📦"}</span>
                      <div>
                        <p className="text-xs font-bold text-slate-800 line-clamp-1">{p.name}</p>
                        <p className="text-[10.5px] text-slate-400 font-medium">
                          {p.quantity} {p.quantity === 1 ? "unidade vendida" : "unidades vendidas"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold font-mono text-slate-900">
                        {p.revenue.toLocaleString()} {currency}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Recent Transactions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Últimas Transações</h3>
              <p className="text-xs text-slate-400 mt-0.5">Vendas concluídas recentemente.</p>
            </div>
            {onChangeModule && (
              <button
                type="button"
                onClick={() => onChangeModule("CASH")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                Ver Todas <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1">
            {recentTransactions.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-1">
                <p className="text-xs font-medium">Nenhuma transação registrada ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => {
                  const time = new Date(tx.timestamp).toLocaleTimeString("pt-MZ", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div 
                      key={tx.id} 
                      onClick={() => setSelectedTx(tx)}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl px-2 cursor-pointer"
                      title="Clique para ver os detalhes da venda"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {tx.invoiceNumber || tx.id.substring(0, 8)}
                          </p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span>{time}</span>
                            <span>•</span>
                            <span>{tx.cashierName || "Operador"}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-600">{tx.paymentMethod}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold font-mono text-emerald-600">
                          +{tx.grandTotal.toLocaleString()} {currency}
                        </p>
                        <span className="text-[9.5px] text-slate-400 font-mono">
                          {tx.items?.length || 0} {tx.items?.length === 1 ? "item" : "itens"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. EXPIRY & BATCH CONTROL (Only shown when there are batches nearing expiry) */}
      {expiringBatches.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200/80 p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-900">Alerta de Lotes Próximos ao Vencimento</h3>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Existem {expiringBatches.length} {expiringBatches.length === 1 ? "lote com validade crítica" : "lotes com validade crítica"} a menos de 30 dias.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {expiringBatches.slice(0, 6).map((b) => (
              <div key={b.id} className="bg-white p-3 rounded-xl border border-amber-100 shadow-2xs flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{b.productName}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Lote: <strong>{b.batchCode}</strong> • {b.quantity} un
                  </p>
                  <p className={`text-[10px] font-bold ${b.isExpired ? "text-red-600" : "text-amber-600"}`}>
                    {b.isExpired ? "Expirado!" : `Vence em ${b.daysLeft} dias`}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {b.product && (
                    <button
                      type="button"
                      onClick={() => {
                        setPromoProduct(b.product);
                        setPromoBatch(b);
                        const disc = Math.round(b.product.salePrice * 0.8);
                        setCustomPromoPrice(String(disc));
                        setDiscountPercent(20);
                      }}
                      className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer"
                      title="Criar Promoção"
                    >
                      <BadgePercent className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDiscardBatch(b)}
                    className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer"
                    title="Descartar Lote"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: TRANSACTION DETAILS */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-600" />
                  <h3 className="font-bold text-sm text-slate-800">
                    Detalhes da Venda {selectedTx.invoiceNumber || ""}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl text-slate-600">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Data & Hora</span>
                    <strong className="text-slate-800">
                      {new Date(selectedTx.timestamp).toLocaleString("pt-MZ")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Operador</span>
                    <strong className="text-slate-800">{selectedTx.cashierName || "N/D"}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Pagamento</span>
                    <strong className="text-slate-800">{selectedTx.paymentMethod}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Cliente</span>
                    <strong className="text-slate-800">{selectedTx.customerName || "Consumidor Final"}</strong>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Itens da Fatura</span>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl p-2">
                    {selectedTx.items?.map((it, idx) => (
                      <div key={idx} className="py-1.5 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{it.productName}</p>
                          <p className="text-[10px] text-slate-400">{it.quantity}x a {it.price.toLocaleString()} {currency}</p>
                        </div>
                        <span className="font-bold font-mono text-slate-900">
                          {((it.quantity || 1) * (it.price || 0)).toLocaleString()} {currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-between items-center font-bold text-sm">
                  <span className="text-slate-700">Total Pago:</span>
                  <span className="text-emerald-600 font-mono text-base">
                    {selectedTx.grandTotal.toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (settings) {
                      printInvoiceHTML(selectedTx, settings);
                    }
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  Imprimir Recibo
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PROMO / FLYER MODAL */}
      {promoProduct && promoBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <BadgePercent className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Criar Promoção Rápida</h4>
                <p className="text-xs text-slate-500">Defina o desconto promocional para o produto.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
              <p className="font-bold text-slate-800">{promoProduct.name}</p>
              <div className="flex justify-between text-slate-500 text-[11px] font-mono">
                <span>SKU: {promoProduct.code}</span>
                <span>Lote: {promoBatch.batchCode} ({promoBatch.quantity} un)</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-1 font-bold">
                <span className="text-slate-500">Preço Atual:</span>
                <span className="text-slate-800">{promoProduct.salePrice.toLocaleString()} {currency}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sugestões de Desconto</label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 30, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setDiscountPercent(pct);
                      const calculated = Math.round(promoProduct.salePrice * (1 - pct / 100));
                      setCustomPromoPrice(String(calculated));
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
                      discountPercent === pct 
                        ? "bg-blue-600 text-white border-blue-600" 
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preço Promocional ({currency})</label>
              <input
                type="number"
                value={customPromoPrice}
                onChange={(e) => setCustomPromoPrice(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Novo preço"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPromoProduct(null);
                  setPromoBatch(null);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleApplyPromo(promoProduct.id, promoBatch.id, discountPercent, Number(customPromoPrice))}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Ativar Promoção
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DISCARD MODAL */}
      {confirmDiscardBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Descarte de Lote Vencido</h4>
                <p className="text-xs text-slate-500">Deseja realmente dar baixa neste lote?</p>
              </div>
            </div>

            <div className="bg-red-50/60 p-3 rounded-xl text-xs space-y-1 text-red-950">
              <p className="font-bold">{confirmDiscardBatch.productName}</p>
              <p className="text-[11px] font-mono">Lote: <strong>{confirmDiscardBatch.batchCode}</strong> ({confirmDiscardBatch.quantity} un)</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDiscardBatch(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDiscardBatch(confirmDiscardBatch.id)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Confirmar Descarte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLYER GENERATOR */}
      {isFlyerGeneratorOpen && flyerProduct && (
        <PromoFlyerGenerator
          product={flyerProduct}
          currency={currency}
          isOpen={isFlyerGeneratorOpen}
          onClose={() => {
            setIsFlyerGeneratorOpen(false);
            setFlyerProduct(null);
          }}
          settings={settings}
        />
      )}
    </div>
  );
}

export default memo(DashboardModule);
