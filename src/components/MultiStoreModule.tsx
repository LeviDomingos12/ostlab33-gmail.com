import React, { useState, useMemo, useCallback } from "react";
import { 
  Building2, 
  Store, 
  MapPin, 
  Users, 
  Package, 
  ArrowLeftRight, 
  Plus, 
  Search, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  BarChart3, 
  FileText, 
  Printer, 
  Edit3, 
  Trash2, 
  Clock, 
  Phone, 
  ShieldCheck, 
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Filter,
  Check,
  X,
  PiggyBank,
  ShoppingBag,
  ArrowRight
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  Cell
} from "recharts";
import { 
  Branch, 
  Product, 
  Transaction, 
  CashFlowEntry, 
  Employee, 
  SystemSettings, 
  StockTransfer, 
  UserRole 
} from "../types";
import { generateEntityId } from "../lib/deterministic";

export interface StoreMetricItem {
  branch: Branch;
  totalRevenue: number;
  txCount: number;
  totalItemsSold: number;
  cashCount: number;
  cashTotal: number;
  digitalTotal: number;
  avgTicket: number;
  stockUnits: number;
  stockValue: number;
  lowStockItemsCount: number;
  assignedStaffCount: number;
}

interface MultiStoreModuleProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  products: Product[];
  onUpdateProduct: (product: Product) => void;
  onUpdateProductsBatch?: (products: Product[]) => void;
  transactions: Transaction[];
  cashFlow: CashFlowEntry[];
  employees: Employee[];
  onUpdateEmployees?: (updatedList: Employee[]) => void;
  currency: string;
  activeUsername: string;
  currentRole: UserRole;
  selectedStoreId: string; // "all" | branchId
  onSelectStore: (storeId: string) => void;
  onShowToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  onChangeModule?: (module: string) => void;
  theme?: string;
}

export default function MultiStoreModule({
  settings,
  onUpdateSettings,
  products,
  onUpdateProduct,
  onUpdateProductsBatch,
  transactions,
  cashFlow,
  employees,
  onUpdateEmployees,
  currency,
  activeUsername,
  currentRole: _currentRole,
  selectedStoreId,
  onSelectStore,
  onShowToast,
  onAddAuditLog,
  onChangeModule,
  theme
}: MultiStoreModuleProps) {
  // Navigation Sub-tab
  const [activeTab, setActiveTab] = useState<"overview" | "stores" | "stock_transfers" | "cash_shifts" | "staff">("overview");
  
  // Time scope for analytics
  const [timeScope, setTimeScope] = useState<"TODAY" | "7_DAYS" | "THIS_MONTH" | "ALL">("THIS_MONTH");

  // Stores from settings
  const branches = useMemo<Branch[]>(() => {
    return settings.branches && settings.branches.length > 0 ? settings.branches : [];
  }, [settings.branches]);

  // Modals & form state for Branch Create/Edit
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchCity, setBranchCity] = useState("Maputo");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchContact, setBranchContact] = useState("");
  const [branchManager, setBranchManager] = useState("");
  const [branchHours, setBranchHours] = useState("08:00 - 20:00");
  const [branchColor, setBranchColor] = useState("#2563eb");
  const [branchNotes, setBranchNotes] = useState("");

  // Transfer stock state
  const [transferOriginId, setTransferOriginId] = useState<string>(branches[0]?.id || "central");
  const [transferDestId, setTransferDestId] = useState<string>(branches[1]?.id || "filial_matola");
  const [transferProductId, setTransferProductId] = useState<string>("");
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [isExecutingTransfer, setIsExecutingTransfer] = useState(false);

  // Search filter for stock matrix
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState("ALL");

  // Filter for staff allocation
  const [staffStoreFilter, setStaffStoreFilter] = useState<string>("ALL");

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Filter transactions by time scope
  const filteredTransactionsByTime = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    return transactions.filter(t => {
      if (t.status === "CANCELLED" || (t as any).status === "REFUNDED") return false;
      const tDate = t.timestamp.split("T")[0];

      if (timeScope === "TODAY") {
        return tDate === todayStr;
      }
      if (timeScope === "7_DAYS") {
        const diffDays = Math.floor((now.getTime() - new Date(t.timestamp).getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }
      if (timeScope === "THIS_MONTH") {
        return tDate.substring(0, 7) === todayStr.substring(0, 7);
      }
      return true;
    });
  }, [transactions, timeScope]);

  // Consolidate metrics per store
  const storeMetrics = useMemo<Record<string, StoreMetricItem>>(() => {
    const map: Record<string, StoreMetricItem> = {};

    // Initialize map with all branches
    branches.forEach(b => {
      // Calculate local stock
      let stockUnits = 0;
      let stockValue = 0;
      let lowStockItemsCount = 0;

      products.forEach(p => {
        const localStock = p.branchStocks?.[b.id] !== undefined ? p.branchStocks[b.id] : (b.isMainStore ? p.stock : 0);
        stockUnits += Math.max(0, localStock);
        stockValue += Math.max(0, localStock) * p.costPrice;
        if (localStock <= p.minStock) {
          lowStockItemsCount++;
        }
      });

      // Calculate staff count
      const assignedStaff = employees.filter(e => e.assignedBranchId === b.id);

      map[b.id] = {
        branch: b,
        totalRevenue: 0,
        txCount: 0,
        totalItemsSold: 0,
        cashCount: 0,
        cashTotal: 0,
        digitalTotal: 0,
        avgTicket: 0,
        stockUnits,
        stockValue,
        lowStockItemsCount,
        assignedStaffCount: assignedStaff.length
      };
    });

    // Populate sales data
    filteredTransactionsByTime.forEach(t => {
      const bId = t.branchId || "central";
      if (!map[bId] && branches.length > 0) {
        // If unknown branch, allocate to first or main store
        const main = branches.find(b => b.isMainStore) || branches[0];
        if (main && map[main.id]) {
          map[main.id].totalRevenue += t.grandTotal;
          map[main.id].txCount++;
          map[main.id].totalItemsSold += t.items.reduce((acc, i) => acc + i.quantity, 0);
          if (t.paymentMethod === "CASH") map[main.id].cashTotal += t.grandTotal;
          else map[main.id].digitalTotal += t.grandTotal;
        }
        return;
      }

      if (map[bId]) {
        map[bId].totalRevenue += t.grandTotal;
        map[bId].txCount++;
        map[bId].totalItemsSold += t.items.reduce((acc, i) => acc + i.quantity, 0);
        if (t.paymentMethod === "CASH") map[bId].cashTotal += t.grandTotal;
        else map[bId].digitalTotal += t.grandTotal;
      }
    });

    // Compute averages
    Object.values(map).forEach(m => {
      m.avgTicket = m.txCount > 0 ? Math.round(m.totalRevenue / m.txCount) : 0;
    });

    return map;
  }, [branches, filteredTransactionsByTime, products, employees]);

  // Overall consolidated totals
  const overallConsolidated = useMemo(() => {
    let revenue = 0;
    let transactions = 0;
    let itemsSold = 0;
    let stockTotalUnits = 0;
    let stockTotalValue = 0;
    let totalEmployees = employees.length;

    (Object.values(storeMetrics) as StoreMetricItem[]).forEach((m: StoreMetricItem) => {
      revenue += m.totalRevenue;
      transactions += m.txCount;
      itemsSold += m.totalItemsSold;
      stockTotalUnits += m.stockUnits;
      stockTotalValue += m.stockValue;
    });

    const avgTicket = transactions > 0 ? Math.round(revenue / transactions) : 0;

    return {
      revenue,
      transactions,
      itemsSold,
      stockTotalUnits,
      stockTotalValue,
      totalEmployees,
      avgTicket,
      activeStoresCount: branches.filter(b => b.status !== "INACTIVE").length,
      totalStoresCount: branches.length
    };
  }, [storeMetrics, employees, branches]);

  // Chart data comparing stores
  const storesChartData = useMemo(() => {
    return (Object.values(storeMetrics) as StoreMetricItem[]).map((m: StoreMetricItem) => ({
      name: m.branch.name.replace("Filial ", "").replace(" (Maputo)", ""),
      faturamento: m.totalRevenue,
      vendas: m.txCount,
      stock: m.stockUnits,
      color: m.branch.color || "#ea580c"
    }));
  }, [storeMetrics]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingBranch(null);
    setBranchName("");
    setBranchCode(`LOJA-${String(branches.length + 1).padStart(2, "0")}`);
    setBranchCity("Maputo");
    setBranchAddress("");
    setBranchContact("");
    setBranchManager(activeUsername);
    setBranchHours("08:00 - 20:00");
    setBranchColor("#2563eb");
    setBranchNotes("");
    setIsBranchModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchCode(b.code || "");
    setBranchCity(b.city || "Maputo");
    setBranchAddress(b.address || "");
    setBranchContact(b.contact || "");
    setBranchManager(b.managerName || "");
    setBranchHours(b.openingHours || "08:00 - 20:00");
    setBranchColor(b.color || "#2563eb");
    setBranchNotes(b.notes || "");
    setIsBranchModalOpen(true);
  };

  // Save Store (Create or Edit)
  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      onShowToast?.("O nome da loja/filial é obrigatório.", "warning");
      return;
    }

    if (editingBranch) {
      // Edit existing
      const updatedList = branches.map(b => {
        if (b.id === editingBranch.id) {
          return {
            ...b,
            name: branchName.trim(),
            code: branchCode.trim() || b.code,
            city: branchCity.trim(),
            address: branchAddress.trim(),
            contact: branchContact.trim(),
            managerName: branchManager.trim(),
            openingHours: branchHours.trim(),
            color: branchColor,
            notes: branchNotes.trim()
          };
        }
        return b;
      });

      onUpdateSettings({ branches: updatedList });
      onAddAuditLog(
        "Edição de Loja/Filial",
        "MULTI-LOJA",
        `Loja "${branchName.trim()}" (ID: ${editingBranch.id}) atualizada pelo administrador.`
      );
      onShowToast?.(`Loja "${branchName.trim()}" atualizada com sucesso!`, "success");
    } else {
      // Create new
      const newId = `branch_${generateEntityId("store")}`;
      const newBranch: Branch = {
        id: newId,
        name: branchName.trim(),
        code: branchCode.trim() || `L-${branches.length + 1}`,
        city: branchCity.trim(),
        address: branchAddress.trim(),
        contact: branchContact.trim(),
        managerName: branchManager.trim(),
        isMainStore: branches.length === 0,
        status: "ACTIVE",
        openingHours: branchHours.trim(),
        color: branchColor,
        notes: branchNotes.trim()
      };

      const updatedList = [...branches, newBranch];
      onUpdateSettings({ branches: updatedList });
      onAddAuditLog(
        "Cadastro de Loja/Filial",
        "MULTI-LOJA",
        `Nova filial "${branchName.trim()}" (Código: ${newBranch.code}, Cidade: ${newBranch.city}) registada com sucesso.`
      );
      onShowToast?.(`Nova loja "${branchName.trim()}" criada com sucesso!`, "success");
    }

    setIsBranchModalOpen(false);
  };

  // Toggle store active status
  const handleToggleStoreStatus = (b: Branch) => {
    const newStatus = b.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const updatedList = branches.map(br => br.id === b.id ? { ...br, status: newStatus as any } : br);
    onUpdateSettings({ branches: updatedList });
    onAddAuditLog(
      "Alteração de Status de Loja",
      "MULTI-LOJA",
      `Loja "${b.name}" alterada para status ${newStatus}.`
    );
    onShowToast?.(`Loja "${b.name}" agora está ${newStatus === "ACTIVE" ? "Ativa" : "Inativa"}.`, "info");
  };

  // Execute Inter-Branch Stock Transfer
  const handleExecuteStockTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProductId) {
      onShowToast?.("Selecione o produto a ser transferido.", "warning");
      return;
    }
    if (transferOriginId === transferDestId) {
      onShowToast?.("A loja de origem e destino não podem ser as mesmas.", "error");
      return;
    }
    if (transferQuantity <= 0) {
      onShowToast?.("A quantidade a transferir deve ser superior a zero.", "warning");
      return;
    }

    const targetProduct = products.find(p => p.id === transferProductId);
    if (!targetProduct) {
      onShowToast?.("Produto não encontrado.", "error");
      return;
    }

    const originStore = branches.find(b => b.id === transferOriginId);
    const destStore = branches.find(b => b.id === transferDestId);

    // Current stock in origin
    const currentOriginStock = targetProduct.branchStocks?.[transferOriginId] !== undefined
      ? targetProduct.branchStocks[transferOriginId]
      : (originStore?.isMainStore ? targetProduct.stock : 0);

    if (currentOriginStock < transferQuantity) {
      onShowToast?.(
        `Stock insuficiente na loja de origem (${originStore?.name || "Origem"}). Disponível: ${currentOriginStock} un, Solicitado: ${transferQuantity} un.`,
        "error"
      );
      return;
    }

    setIsExecutingTransfer(true);

    try {
      // 1. Update product branchStocks
      const updatedBranchStocks = { ...(targetProduct.branchStocks || {}) };
      
      const currentDestStock = updatedBranchStocks[transferDestId] !== undefined
        ? updatedBranchStocks[transferDestId]
        : (destStore?.isMainStore ? targetProduct.stock : 0);

      updatedBranchStocks[transferOriginId] = Math.max(0, currentOriginStock - transferQuantity);
      updatedBranchStocks[transferDestId] = currentDestStock + transferQuantity;

      const updatedProduct: Product = {
        ...targetProduct,
        branchStocks: updatedBranchStocks
      };

      onUpdateProduct(updatedProduct);

      // 2. Record StockTransfer entry
      const newTransfer: StockTransfer = {
        id: `transf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originBranchId: transferOriginId,
        destinationBranchId: transferDestId,
        productId: targetProduct.id,
        productName: targetProduct.name,
        quantity: transferQuantity,
        timestamp: new Date().toISOString(),
        status: "COMPLETED",
        responsibleUser: activeUsername
      };

      const existingTransfers = settings.stockTransfers || [];
      onUpdateSettings({
        stockTransfers: [newTransfer, ...existingTransfers]
      });

      // 3. Audit log & feedback
      onAddAuditLog(
        "Transferência Inter-Filial",
        "MULTI-LOJA",
        `Transferência de ${transferQuantity} un do artigo "${targetProduct.name}" da loja "${originStore?.name}" para "${destStore?.name}". Justificativa: ${transferNotes || 'Sem notas'}.`
      );

      onShowToast?.(
        `Transferência de ${transferQuantity} un de "${targetProduct.name}" concluída com sucesso entre ${originStore?.name} e ${destStore?.name}!`,
        "success"
      );

      // Reset form fields
      setTransferQuantity(1);
      setTransferNotes("");
    } catch (err: any) {
      onShowToast?.(`Erro ao transferir stock: ${err.message}`, "error");
    } finally {
      setIsExecutingTransfer(false);
    }
  };

  // Reassign staff member to branch
  const handleAssignStaffToBranch = (empId: string, branchId: string) => {
    if (!onUpdateEmployees) return;
    const targetEmp = employees.find(e => e.id === empId);
    if (!targetEmp) return;

    const targetBranch = branches.find(b => b.id === branchId);
    const branchName = branchId === "ALL" ? "Todas as Lojas (Acesso Global)" : (targetBranch?.name || "Loja");

    const updatedEmployees = employees.map(emp => {
      if (emp.id === empId) {
        return {
          ...emp,
          assignedBranchId: branchId === "ALL" ? undefined : branchId
        };
      }
      return emp;
    });

    onUpdateEmployees(updatedEmployees);
    onAddAuditLog(
      "Alocação de Colaborador",
      "MULTI-LOJA",
      `Colaborador ${targetEmp.name} alocado à loja "${branchName}".`
    );
    onShowToast?.(`${targetEmp.name} alocado com sucesso a "${branchName}".`, "success");
  };

  // Filtered products for stock matrix
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !stockSearchQuery.trim() || 
        p.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(stockSearchQuery.toLowerCase());
      const matchCat = stockCategoryFilter === "ALL" || p.category === stockCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [products, stockSearchQuery, stockCategoryFilter]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (staffStoreFilter === "ALL") return employees;
    if (staffStoreFilter === "GLOBAL") return employees.filter(e => !e.assignedBranchId);
    return employees.filter(e => e.assignedBranchId === staffStoreFilter);
  }, [employees, staffStoreFilter]);

  const isNight = theme === "night";

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-800">
      
      {/* 1. TOP EXECUTIVE MULTI-STORE HERO BANNER */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-blue-100 text-blue-900 rounded-xl shrink-0 mt-0.5">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Supervisão Multi-Loja & Rede de Filiais
                </h1>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full text-[11px] font-bold border border-blue-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                  Painel Central Consolidado
                </span>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 rounded-full text-[11px] font-bold border border-emerald-200">
                  {overallConsolidated.activeStoresCount} de {overallConsolidated.totalStoresCount} Lojas Ativas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                Supervisione o desempenho consolidado de todas as unidades, faça a gestão de stocks isolados ou integrados, 
                audite os caixas de cada filial e aloque operadores em tempo real com controle total.
              </p>
            </div>
          </div>

          {/* Quick Actions in Hero */}
          <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Loja / Filial</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectStore("all")}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                selectedStoreId === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
              title="Alternar contexto para visualização de toda a rede"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Visão Consolidada</span>
            </button>
          </div>
        </div>

        {/* Executive Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5 pt-4 border-t border-slate-200">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Faturamento da Rede</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-extrabold font-mono text-slate-900">
                {overallConsolidated.revenue.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-400">{currency}</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              {overallConsolidated.transactions} faturas emitidas
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Stock Total da Rede</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-extrabold font-mono text-slate-900">
                {overallConsolidated.stockTotalUnits.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-400">unidades</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              Valor: ~{overallConsolidated.stockTotalValue.toLocaleString()} {currency}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ticket Médio Consolidado</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-extrabold font-mono text-slate-900">
                {overallConsolidated.avgTicket.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-400">{currency}</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              Por compra na rede
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Equipa Total da Rede</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-extrabold font-mono text-slate-900">
                {overallConsolidated.totalEmployees}
              </span>
              <span className="text-xs font-bold text-slate-400">colaboradores</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              Distribuídos em {branches.length} filiais
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar mt-5 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "overview"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Supervisão & Desempenho</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stores")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "stores"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Lojas & Filiais ({branches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stock_transfers")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "stock_transfers"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Stocks & Transferências Inter-Lojas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cash_shifts")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "cash_shifts"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            }`}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            <span>Caixas por Loja</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "staff"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Equipas por Filial</span>
          </button>
        </div>
      </div>

      {/* 2. TAB CONTENT: OVERVIEW (CONSOLIDATED DASHBOARD) */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          
          {/* Time Scope Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Período de Análise:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setTimeScope("TODAY")}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    timeScope === "TODAY" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setTimeScope("7_DAYS")}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    timeScope === "7_DAYS" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Últimos 7 Dias
                </button>
                <button
                  type="button"
                  onClick={() => setTimeScope("THIS_MONTH")}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    timeScope === "THIS_MONTH" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Este Mês
                </button>
                <button
                  type="button"
                  onClick={() => setTimeScope("ALL")}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    timeScope === "ALL" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Todo o Período
                </button>
              </div>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Base de dados consolidada com {filteredTransactionsByTime.length} vendas analisadas.
            </span>
          </div>

          {/* Comparative Store Revenue Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Comparativo de Faturamento Entre Lojas
                </h3>
                <p className="text-[11px] text-slate-500">Distribuição do volume financeiro bruto no período selecionado.</p>
              </div>
            </div>

            <div className="h-72 w-full text-xs font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storesChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11, fontWeight: "bold" }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toLocaleString()} ${currency}`, "Faturamento"]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", color: "#fff", fontSize: "11px" }}
                  />
                  <Bar dataKey="faturamento" radius={[8, 8, 0, 0]}>
                    {storesChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || "#2563eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Store Performance Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Desempenho Detalhado por Unidade</h3>
                <p className="text-[11px] text-slate-500">Métricas operacionais, financeiras e de inventário de cada loja.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Loja / Filial</th>
                    <th className="py-3 px-4">Cidade & Morada</th>
                    <th className="py-3 px-4 text-right">Faturamento</th>
                    <th className="py-3 px-4 text-center">Vendas</th>
                    <th className="py-3 px-4 text-right">Ticket Médio</th>
                    <th className="py-3 px-4 text-right">Stock Local</th>
                    <th className="py-3 px-4 text-center">Alertas Stock</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.map((b) => {
                    const m = storeMetrics[b.id] || {
                      totalRevenue: 0,
                      txCount: 0,
                      avgTicket: 0,
                      stockUnits: 0,
                      lowStockItemsCount: 0
                    };
                    const isSelected = selectedStoreId === b.id;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0" 
                              style={{ backgroundColor: b.color || "#2563eb" }} 
                            />
                            <div>
                              <strong className="text-slate-900 font-bold block">{b.name}</strong>
                              <span className="text-[10px] font-mono text-slate-400">{b.code}</span>
                            </div>
                            {b.isMainStore && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                Sede
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>
                            <span className="font-semibold block">{b.city || "Moçambique"}</span>
                            <span className="text-[10px] text-slate-400 truncate block max-w-xs">{b.address}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {m.totalRevenue.toLocaleString()} {currency}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700">
                          {m.txCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-600">
                          {m.avgTicket.toLocaleString()} {currency}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                          {m.stockUnits.toLocaleString()} un
                        </td>
                        <td className="py-3 px-4 text-center">
                          {m.lowStockItemsCount > 0 ? (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold text-[10px]">
                              {m.lowStockItemsCount} críticos
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                              Normal ✓
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            b.status !== "INACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                          }`}>
                            {b.status !== "INACTIVE" ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStore(b.id);
                              onShowToast?.(`Contexto alterado para ${b.name}!`, "success");
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                              isSelected
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                            }`}
                          >
                            {isSelected ? "Em Foco ✓" : "Selecionar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT: STORES MANAGEMENT */}
      {activeTab === "stores" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Catálogo de Lojas & Filiais Físicas</h2>
              <p className="text-xs text-slate-500">Crie e configure os pontos de venda e depósitos da sua empresa.</p>
            </div>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Nova Loja</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {branches.map((b) => {
              const m = storeMetrics[b.id] || {
                totalRevenue: 0,
                txCount: 0,
                stockUnits: 0,
                assignedStaffCount: 0
              };
              const isSelected = selectedStoreId === b.id;

              return (
                <div 
                  key={b.id} 
                  className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? "bg-blue-50/40 border-blue-400 shadow-md ring-2 ring-blue-500/20"
                      : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div>
                    {/* Top Badges */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3.5 h-3.5 rounded-full" 
                          style={{ backgroundColor: b.color || "#2563eb" }} 
                        />
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                          {b.code}
                        </span>
                        {b.isMainStore && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                            Sede Central
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status !== "INACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                        }`}>
                          {b.status !== "INACTIVE" ? "Ativa" : "Inativa"}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(b)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition rounded"
                          title="Editar Loja"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Info */}
                    <div className="mt-3 space-y-1.5">
                      <h3 className="font-bold text-base text-slate-900">{b.name}</h3>
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.address || "Sem endereço cadastrado"}, {b.city}</span>
                      </p>
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.contact || "Sem contacto"}</span>
                      </p>
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.openingHours || "08:00 - 20:00"}</span>
                      </p>
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Gerente: <strong>{b.managerName || "Não atribuído"}</strong></span>
                      </p>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Faturamento</span>
                        <span className="text-xs font-bold font-mono text-slate-900 block mt-0.5">
                          {m.totalRevenue.toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Stock Local</span>
                        <span className="text-xs font-bold font-mono text-blue-700 block mt-0.5">
                          {m.stockUnits.toLocaleString()} un
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Operadores</span>
                        <span className="text-xs font-bold font-mono text-slate-900 block mt-0.5">
                          {m.assignedStaffCount} func.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons at bottom */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleStoreStatus(b)}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                    >
                      {b.status !== "INACTIVE" ? "Desativar" : "Reativar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectStore(b.id);
                        onShowToast?.(`Loja ${b.name} definida como ativa para operações!`, "success");
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      }`}
                    >
                      <span>{isSelected ? "Loja em Foco ✓" : "Operar Nesta Loja"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: STOCKS & INTER-STORE TRANSFERS */}
      {activeTab === "stock_transfers" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          
          {/* Transfer Tool & Stock Matrix Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT 1 COL: Inter-Store Stock Transfer Form */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="pb-2 border-b border-slate-200 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Transferência Inter-Filial</h3>
              </div>
              <p className="text-xs text-slate-500">
                Transfira quantidades de artigos entre depósitos e lojas com atualização de inventário e guia de remessa imediata.
              </p>

              <form onSubmit={handleExecuteStockTransfer} className="space-y-3.5 text-xs">
                {/* Loja de Origem */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Loja de Origem (Sai Stock) *</label>
                  <select
                    value={transferOriginId}
                    onChange={(e) => setTransferOriginId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} disabled={b.id === transferDestId}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Loja de Destino */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Loja de Destino (Entra Stock) *</label>
                  <select
                    value={transferDestId}
                    onChange={(e) => setTransferDestId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} disabled={b.id === transferOriginId}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Produto Selecionado */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Artigo a Transferir *</label>
                  <select
                    value={transferProductId}
                    onChange={(e) => setTransferProductId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Selecione o Artigo --</option>
                    {products.map(p => {
                      const originStore = branches.find(b => b.id === transferOriginId);
                      const originStock = p.branchStocks?.[transferOriginId] !== undefined
                        ? p.branchStocks[transferOriginId]
                        : (originStore?.isMainStore ? p.stock : 0);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} (Disponível na Origem: {originStock} un)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Quantidade */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Quantidade a Transferir *</label>
                  <input
                    type="number"
                    min={1}
                    value={transferQuantity}
                    onChange={(e) => setTransferQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Notas / Justificativa */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Justificativa / Motivo</label>
                  <input
                    type="text"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Ex: Reabastecimento para época festiva"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isExecutingTransfer}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isExecutingTransfer ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>A Processar Transferência...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Executar Transferência</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* RIGHT 2 COLS: Stock Matrix Across Stores */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Matriz de Inventário por Loja</h3>
                  <p className="text-[11px] text-slate-500">Veja exatamente onde cada produto está distribuído na rede.</p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={stockSearchQuery}
                      onChange={(e) => setStockSearchQuery(e.target.value)}
                      placeholder="Pesquisar produto..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <select
                    value={stockCategoryFilter}
                    onChange={(e) => setStockCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-xl py-1.5 px-2.5 text-xs font-bold text-slate-700"
                  >
                    <option value="ALL">Todas Categorias</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto flex-1 max-h-96 custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-4 bg-slate-50">Produto</th>
                      <th className="py-2.5 px-4 bg-slate-50">Preço Venda</th>
                      {branches.map(b => (
                        <th key={b.id} className="py-2.5 px-4 text-right bg-slate-50">
                          <span className="block truncate max-w-[100px]">{b.name}</span>
                        </th>
                      ))}
                      <th className="py-2.5 px-4 text-right bg-slate-100 font-bold text-slate-900">Stock Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(p => {
                      // Total stock across stores
                      const totalAcross = branches.reduce((sum, b) => {
                        const local = p.branchStocks?.[b.id] !== undefined
                          ? p.branchStocks[b.id]
                          : (b.isMainStore ? p.stock : 0);
                        return sum + local;
                      }, 0);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-4">
                            <span className="font-bold text-slate-900 block truncate max-w-xs">{p.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{p.code} • {p.category}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-700">
                            {p.salePrice} {currency}
                          </td>
                          {branches.map(b => {
                            const localStock = p.branchStocks?.[b.id] !== undefined
                              ? p.branchStocks[b.id]
                              : (b.isMainStore ? p.stock : 0);
                            const isLow = localStock <= p.minStock;

                            return (
                              <td key={b.id} className="py-2.5 px-4 text-right font-mono">
                                <span className={`font-bold px-1.5 py-0.5 rounded ${
                                  isLow ? "bg-rose-100 text-rose-800" : "text-slate-800"
                                }`}>
                                  {localStock} un
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-4 text-right font-mono font-extrabold text-blue-700 bg-blue-50/30">
                            {totalAcross} un
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Transfers History Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Histórico de Guias de Transferência</h3>
                <p className="text-[11px] text-slate-500">Registo permanente de remessas e movimentações entre filiais.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Data & Hora</th>
                    <th className="py-3 px-4">Origem</th>
                    <th className="py-3 px-4">Destino</th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4 text-center">Quantidade</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!settings.stockTransfers || settings.stockTransfers.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Nenhuma transferência inter-filial registrada ainda.
                      </td>
                    </tr>
                  ) : (
                    settings.stockTransfers.slice(0, 15).map(t => {
                      const orig = branches.find(b => b.id === t.originBranchId)?.name || t.originBranchId;
                      const dest = branches.find(b => b.id === t.destinationBranchId)?.name || t.destinationBranchId;
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {new Date(t.timestamp).toLocaleString("pt-MZ")}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {orig}
                          </td>
                          <td className="py-3 px-4 font-bold text-blue-700">
                            {dest}
                          </td>
                          <td className="py-3 px-4 text-slate-900 font-medium">
                            {t.productName}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                            {t.quantity} un
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {t.responsibleUser}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              Concluída ✓
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: CASH SHIFTS PER STORE */}
      {activeTab === "cash_shifts" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Caixas e Movimentações Financeiras por Loja</h2>
              <p className="text-xs text-slate-500">Audite os turnos de caixa de cada uma das lojas físicas da rede.</p>
            </div>

            {onChangeModule && (
              <button
                type="button"
                onClick={() => onChangeModule("CASH")}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <PiggyBank className="w-4 h-4" />
                <span>Abrir Módulo de Caixa</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {branches.map(b => {
              const m = storeMetrics[b.id] || {
                totalRevenue: 0,
                cashTotal: 0,
                digitalTotal: 0,
                txCount: 0
              };

              // Cash movements for this store
              const branchMovements = cashFlow.filter(c => c.branchId === b.id || (!c.branchId && b.isMainStore));
              const totalSangrias = branchMovements.filter(c => c.type === "SANGRIA").reduce((acc, c) => acc + c.amount, 0);
              const totalSuprimentos = branchMovements.filter(c => c.type === "INPUT" || c.type === "REINFORCEMENT").reduce((acc, c) => acc + c.amount, 0);

              return (
                <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: b.color || "#2563eb" }} 
                      />
                      <strong className="font-bold text-sm text-slate-900">{b.name}</strong>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {b.city}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Total Faturado no Caixa:</span>
                      <strong className="font-mono font-bold text-slate-900">{m.totalRevenue.toLocaleString()} {currency}</strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Entradas em Numerário:</span>
                      <span className="font-mono font-semibold text-emerald-600">+{m.cashTotal.toLocaleString()} {currency}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">M-Pesa / E-Mola / Cartões:</span>
                      <span className="font-mono font-semibold text-blue-600">+{m.digitalTotal.toLocaleString()} {currency}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Suprimentos Registados:</span>
                      <span className="font-mono font-semibold text-slate-700">+{totalSuprimentos.toLocaleString()} {currency}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Sangrias Efetuadas:</span>
                      <span className="font-mono font-semibold text-rose-600">-{totalSangrias.toLocaleString()} {currency}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStore(b.id);
                        if (onChangeModule) onChangeModule("CASH");
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition cursor-pointer text-center"
                    >
                      Aceder ao Caixa desta Filial
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. TAB CONTENT: STAFF BY STORE */}
      {activeTab === "staff" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Alocação de Funcionários por Filial</h2>
              <p className="text-xs text-slate-500">Defina a qual loja cada operador pertence ou conceda permissão multi-loja.</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Filtrar por Loja:</span>
              <select
                value={staffStoreFilter}
                onChange={(e) => setStaffStoreFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Todas as Lojas ({employees.length})</option>
                <option value="GLOBAL">Acesso Global ({employees.filter(e => !e.assignedBranchId).length})</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({employees.filter(e => e.assignedBranchId === b.id).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(emp => {
              const assigned = branches.find(b => b.id === emp.assignedBranchId);

              return (
                <div key={emp.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{emp.name}</h4>
                      <span className="text-[10px] font-mono text-slate-400">{emp.role} • {emp.contact}</span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      emp.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {emp.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Loja Alocada:</label>
                    <select
                      value={emp.assignedBranchId || "ALL"}
                      onChange={(e) => handleAssignStaffToBranch(emp.id, e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-1.5 px-2.5 text-xs font-bold text-slate-800"
                    >
                      <option value="ALL">🌐 Acesso Global (Todas as Lojas)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          🏬 {b.name} ({b.city})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    {assigned ? (
                      <span className="flex items-center gap-1 text-blue-700 font-semibold">
                        <MapPin className="w-3 h-3" />
                        Alocado a: {assigned.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Perfil multi-loja (Pode operar em qualquer filial).
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT STORE */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {editingBranch ? "Editar Loja / Filial" : "Cadastrar Nova Loja / Filial"}
                  </h3>
                  <p className="text-[11px] text-slate-500">Preencha os dados da unidade comercial.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-slate-700 block">Nome da Loja *</label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="Ex: Filial Beira Centro"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Código / Sigla</label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="Ex: BEI-03"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Cidade</label>
                  <input
                    type="text"
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                    placeholder="Ex: Beira, Matola, Nampula"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-slate-700 block">Endereço Completo</label>
                  <input
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder="Ex: Av. Eduardo Mondlane, nº 123"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Telefone / Contacto</label>
                  <input
                    type="text"
                    value={branchContact}
                    onChange={(e) => setBranchContact(e.target.value)}
                    placeholder="Ex: +258 84 123 4567"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Gerente / Responsável</label>
                  <input
                    type="text"
                    value={branchManager}
                    onChange={(e) => setBranchManager(e.target.value)}
                    placeholder="Ex: Marta Ubisse"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Horário de Funcionamento</label>
                  <input
                    type="text"
                    value={branchHours}
                    onChange={(e) => setBranchHours(e.target.value)}
                    placeholder="Ex: 08:00 - 20:00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Cor de Identificação</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branchColor}
                      onChange={(e) => setBranchColor(e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-lg border border-slate-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={branchColor}
                      onChange={(e) => setBranchColor(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-xl py-2 px-2.5 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
                >
                  {editingBranch ? "Salvar Alterações" : "Cadastrar Loja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
