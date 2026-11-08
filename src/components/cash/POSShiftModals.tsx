import React, { useState, useMemo } from "react";
import { 
  X, 
  Lock, 
  Unlock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Coins, 
  AlertTriangle, 
  FileText, 
  CheckCircle2
} from "lucide-react";
import { Employee, SystemSettings } from "../../types";
import { ActiveCashShift, ShiftMetricsSummary } from "../../services/cashShiftService";
import DenominationCounter, { DENOMINATIONS } from "../DenominationCounter";
import { CASH_REGISTERS } from "./CashShiftModals";

interface POSShiftModalsProps {
  activeUsername: string;
  employees: Employee[];
  currency: string;
  activeShift: ActiveCashShift | null;
  shiftMetrics: ShiftMetricsSummary;
  settings?: SystemSettings;
  
  // Modals Visibility
  showOpenModal: boolean;
  onCloseOpenModal: () => void;
  showCloseModal: boolean;
  onCloseCloseModal: () => void;
  showExtratoModal: boolean;
  onCloseExtratoModal: () => void;
  showQuickEntryModal: boolean;
  quickEntryType: "SUPRIMENTO" | "SANGRIA";
  onCloseQuickEntryModal: () => void;
  
  // Handlers
  onConfirmOpenShift: (openingFloat: number, supervisor: string, notes: string, registerId?: string) => Promise<void> | void;
  onConfirmCloseShift: (physicalCount: number, supervisor: string, notes: string, denominations?: Record<string, number>) => Promise<void> | void;
  onConfirmQuickEntry: (type: "SUPRIMENTO" | "SANGRIA", amount: number, reason: string, supervisor?: string) => Promise<void> | void;
}

export const POSShiftModals: React.FC<POSShiftModalsProps> = ({
  activeUsername,
  employees = [],
  currency = "MT",
  activeShift,
  shiftMetrics,
  settings: _settings,
  showOpenModal,
  onCloseOpenModal,
  showCloseModal,
  onCloseCloseModal,
  showExtratoModal,
  onCloseExtratoModal,
  showQuickEntryModal,
  quickEntryType,
  onCloseQuickEntryModal,
  onConfirmOpenShift,
  onConfirmCloseShift,
  onConfirmQuickEntry
}) => {
  // ----------------------------------------------------
  // ESTADOS DO MODAL DE ABERTURA
  // ----------------------------------------------------
  const [openFloat, setOpenFloat] = useState<string>("1000");
  const [openRegisterId, setOpenRegisterId] = useState<string>("POS-01");
  const [openSupervisor, setOpenSupervisor] = useState<string>("");
  const [openPin, setOpenPin] = useState<string>("");
  const [openNotes, setOpenNotes] = useState<string>("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [showOpenDenomModal, setShowOpenDenomModal] = useState<boolean>(false);

  // ----------------------------------------------------
  // ESTADOS DO MODAL DE FECHAMENTO
  // ----------------------------------------------------
  const [closeTab, setCloseTab] = useState<"summary" | "denoms">("summary");
  const [closePhysicalCount, setClosePhysicalCount] = useState<number>(0);
  const [closePhysicalCountInput, setClosePhysicalCountInput] = useState<string>("");
  const [closeSupervisor, setCloseSupervisor] = useState<string>("");
  const [closePin, setClosePin] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeConfirmed, setCloseConfirmed] = useState<boolean>(false);

  // Contagem de cédulas para fecho
  const [denomCounts, setDenomCounts] = useState<{ [key: string]: number }>({
    "1000": 0, "500": 0, "200": 0, "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "2": 0, "1": 0, "0.5": 0
  });

  const calculatedFromDenoms = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * count);
    }, 0);
  }, [denomCounts]);

  const handleDenomChange = (val: number, count: number) => {
    setDenomCounts(prev => ({ ...prev, [val.toString()]: count }));
  };

  const handleResetDenomCounts = () => {
    setDenomCounts({
      "1000": 0, "500": 0, "200": 0, "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "2": 0, "1": 0, "0.5": 0
    });
  };

  // ----------------------------------------------------
  // ESTADOS DO MODAL DE EXTRATO DO TURNO
  // ----------------------------------------------------
  const [extratoFilter, setExtratoFilter] = useState<string>("TODOS");
  const [extratoSearch, setExtratoSearch] = useState<string>("");

  // ----------------------------------------------------
  // ESTADOS DO MODAL RÁPIDO DE SUPRIMENTO / SANGRIA
  // ----------------------------------------------------
  const [quickAmount, setQuickAmount] = useState<string>("");
  const [quickReason, setQuickReason] = useState<string>("");
  const [quickSupervisor, setQuickSupervisor] = useState<string>("");
  const [quickError, setQuickError] = useState<string | null>(null);

  // Lista de supervisores disponíveis
  const availableSupervisors = useMemo(() => {
    const sups = employees.filter(e => {
      const r = (e.role || "").toLowerCase();
      return r.includes("admin") || r.includes("super") || r.includes("gerente") || r.includes("chefe");
    });
    return sups.length > 0 ? sups : employees;
  }, [employees]);

  // Inicializar supervisores padrão
  React.useEffect(() => {
    if (!openSupervisor && availableSupervisors.length > 0) {
      setOpenSupervisor(availableSupervisors[0].name);
    }
    if (!closeSupervisor && availableSupervisors.length > 0) {
      setCloseSupervisor(availableSupervisors[0].name);
    }
  }, [availableSupervisors, openSupervisor, closeSupervisor]);

  // Inicializar contagem física de fecho com valor teórico sugerido
  React.useEffect(() => {
    if (showCloseModal) {
      const theor = shiftMetrics.expectedCashInDrawer;
      setClosePhysicalCount(theor);
      setClosePhysicalCountInput(theor.toString());
      setCloseConfirmed(false);
      setCloseError(null);
    }
  }, [showCloseModal, shiftMetrics.expectedCashInDrawer]);

  // Diferença do fecho
  const diffVal = useMemo(() => {
    return closePhysicalCount - shiftMetrics.expectedCashInDrawer;
  }, [closePhysicalCount, shiftMetrics.expectedCashInDrawer]);

  // Submissão da Abertura de Turno
  const handleOpenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpenError(null);

    const val = parseFloat(openFloat);
    if (isNaN(val) || val < 0) {
      setOpenError("O fundo inicial de troco deve ser um valor igual ou superior a 0.");
      return;
    }

    try {
      await onConfirmOpenShift(val, openSupervisor, openNotes, openRegisterId);
      onCloseOpenModal();
    } catch (err: any) {
      setOpenError(err.message || "Erro ao abrir turno de caixa.");
    }
  };

  // Submissão do Fechamento de Turno
  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloseError(null);

    if (diffVal !== 0 && !closeConfirmed) {
      setCloseError("Existe uma divergência entre o saldo teórico e o dinheiro contado. Confirme a leitura física para prosseguir.");
      return;
    }

    try {
      await onConfirmCloseShift(closePhysicalCount, closeSupervisor, closeNotes, denomCounts);
      onCloseCloseModal();
    } catch (err: any) {
      setCloseError(err.message || "Erro ao homologar fecho de turno.");
    }
  };

  // Submissão de Suprimento / Sangria Rápido
  const handleQuickEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);

    const amt = parseFloat(quickAmount);
    if (isNaN(amt) || amt <= 0) {
      setQuickError("Introduza um valor válido superior a zero.");
      return;
    }

    if (quickEntryType === "SANGRIA" && amt > shiftMetrics.expectedCashInDrawer) {
      setQuickError(`Saldo insuficiente em gaveta (${shiftMetrics.expectedCashInDrawer.toLocaleString()} ${currency}) para realizar esta sangria.`);
      return;
    }

    try {
      await onConfirmQuickEntry(quickEntryType, amt, quickReason, quickSupervisor);
      setQuickAmount("");
      setQuickReason("");
      onCloseQuickEntryModal();
    } catch (err: any) {
      setQuickError(err.message || "Erro ao registrar operação.");
    }
  };

  // Movimentos filtrados do extrato
  const filteredMovements = useMemo(() => {
    return shiftMetrics.movements.filter(m => {
      if (extratoFilter !== "TODOS") {
        if (extratoFilter === "VENDAS" && m.type !== "PAGAMENTO_VENDA") return false;
        if (extratoFilter === "TROCOS" && m.type !== "TROCO_VENDA") return false;
        if (extratoFilter === "ENTRADAS" && m.type !== "SUPRIMENTO" && m.type !== "ABERTURA") return false;
        if (extratoFilter === "SAIDAS" && m.type !== "SANGRIA" && m.type !== "DESPESA") return false;
      }
      if (extratoSearch.trim() !== "") {
        const q = extratoSearch.toLowerCase();
        const desc = (m.description || "").toLowerCase();
        const ref = (m.reference || "").toLowerCase();
        const op = (m.operator || "").toLowerCase();
        if (!desc.includes(q) && !ref.includes(q) && !op.includes(q)) return false;
      }
      return true;
    });
  }, [shiftMetrics.movements, extratoFilter, extratoSearch]);

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MODAL DE ABERTURA DE TURNO OBRIGATÓRIA */}
      {/* ========================================================================= */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Abertura de Turno de Caixa
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Obrigatório antes de realizar qualquer venda no POS
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseOpenModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleOpenSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Operador do Turno
                  </label>
                  <input
                    type="text"
                    disabled
                    value={activeUsername}
                    className="w-full p-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Terminal / Caixa
                  </label>
                  <select
                    value={openRegisterId}
                    onChange={(e) => setOpenRegisterId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                  >
                    {CASH_REGISTERS.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fundo de Maneio Inicial (Trocos) */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span>Fundo Inicial de Caixa (Para Trocos) ({currency}) *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOpenDenomModal(prev => !prev)}
                    className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-full hover:bg-amber-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <Coins className="w-3 h-3" />
                    <span>{showOpenDenomModal ? "Ocultar Cédulas" : "Contar Cédulas"}</span>
                  </button>
                </div>

                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={openFloat}
                  onChange={(e) => setOpenFloat(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-3 bg-white dark:bg-zinc-900 border-2 border-amber-300 dark:border-amber-700 rounded-xl font-mono font-black text-slate-900 dark:text-white text-lg outline-none focus:border-amber-500 shadow-sm"
                />

                {/* Atalhos Rápidos */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold">Atalhos:</span>
                  {[0, 200, 500, 1000, 2000, 5000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setOpenFloat(val.toString())}
                      className="px-2 py-1 bg-white dark:bg-zinc-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold font-mono transition border border-slate-200 dark:border-zinc-700 cursor-pointer"
                    >
                      {val === 0 ? "Sem Fundo (0 MT)" : `${val.toLocaleString()} ${currency}`}
                    </button>
                  ))}
                </div>

                {showOpenDenomModal && (
                  <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900/40">
                    <DenominationCounter
                      denomCounts={denomCounts}
                      onChangeCount={(val, count) => {
                        handleDenomChange(val, count);
                        const newTotal = calculatedFromDenoms;
                        setOpenFloat(newTotal.toString());
                      }}
                      onResetCounts={handleResetDenomCounts}
                      currency={currency}
                      isInteractive={true}
                    />
                    <div className="mt-2 text-right">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        Total Contado: <strong>{calculatedFromDenoms.toLocaleString()} {currency}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Supervisor Responsável */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Supervisor de Turno
                  </label>
                  <select
                    value={openSupervisor}
                    onChange={(e) => setOpenSupervisor(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                  >
                    {availableSupervisors.map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role || "Supervisor"})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIN do Supervisor (Opcional)
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    value={openPin}
                    onChange={(e) => setOpenPin(e.target.value)}
                    placeholder="PIN"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notas de Abertura (Opcional)
                </label>
                <input
                  type="text"
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  placeholder="Ex: Turno da manhã, notas trocadas para troco rápido."
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                />
              </div>

              {openError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{openError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCloseOpenModal}
                  className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Confirmar e Abrir Turno</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MODAL DE FECHAMENTO DE TURNO & CONFERÊNCIA FÍSICA */}
      {/* ========================================================================= */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4 my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Fechamento de Caixa & Homologação de Turno
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Terminal: <strong>{activeShift?.registerId || "POS-01"}</strong> • Operador: <strong>{activeShift?.openedBy || activeUsername}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseCloseModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setCloseTab("summary")}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                  closeTab === "summary"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                1. Reconciliação e Homologação
              </button>
              <button
                type="button"
                onClick={() => setCloseTab("denoms")}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  closeTab === "denoms"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>2. Contagem de Cédulas ({calculatedFromDenoms.toLocaleString()} {currency})</span>
              </button>
            </div>

            {closeTab === "denoms" ? (
              <div className="space-y-4">
                <DenominationCounter
                  denomCounts={denomCounts}
                  onChangeCount={handleDenomChange}
                  onResetCounts={handleResetDenomCounts}
                  currency={currency}
                  isInteractive={true}
                />
                <button
                  type="button"
                  onClick={() => {
                    setClosePhysicalCount(calculatedFromDenoms);
                    setClosePhysicalCountInput(calculatedFromDenoms.toString());
                    setCloseTab("summary");
                  }}
                  className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-sm transition cursor-pointer"
                >
                  Aplicar Valor da Contagem ({calculatedFromDenoms.toLocaleString()} {currency}) ao Fecho
                </button>
              </div>
            ) : (
              <form onSubmit={handleCloseSubmit} className="space-y-4 text-xs">
                {/* Painel de Reconciliação dos Componentes do Turno */}
                <div className="p-3.5 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-wider block border-b border-slate-200 dark:border-zinc-800 pb-1.5">
                    Demonstrativo Financeiro do Turno
                  </span>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>(+) Fundo Inicial de Abertura:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {shiftMetrics.initialFloat.toLocaleString()} {currency}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>(+) Pagamentos Recebidos em Dinheiro:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{shiftMetrics.totalCashReceived.toLocaleString()} {currency}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>(-) Trocos Devolvidos aos Clientes:</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        -{shiftMetrics.totalChangeGiven.toLocaleString()} {currency}
                      </span>
                    </div>

                    {/* Detalhamento da Origem dos Trocos */}
                    <div className="bg-slate-100 dark:bg-zinc-900 p-2 rounded-lg text-[10px] space-y-1 border border-slate-200 dark:border-zinc-800">
                      <div className="flex justify-between text-slate-500">
                        <span>• Troco saído do Fundo Inicial:</span>
                        <span className="font-mono font-semibold">
                          {shiftMetrics.changeFromInitialFloat.toLocaleString()} {currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>• Troco saído de Vendas Acumuladas:</span>
                        <span className="font-mono font-semibold">
                          {shiftMetrics.changeFromSales.toLocaleString()} {currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-bold border-t border-slate-200 dark:border-zinc-800 pt-1">
                        <span>• Estado do Fundo Inicial para Troco:</span>
                        <span className={shiftMetrics.isInitialFloatExhausted ? "text-rose-500" : "text-emerald-500"}>
                          {shiftMetrics.isInitialFloatExhausted 
                            ? "Esgotado (0 MT)" 
                            : `${shiftMetrics.initialFloatRemaining.toLocaleString()} MT disponíveis`}
                        </span>
                      </div>
                    </div>

                    {shiftMetrics.totalManualEntries > 0 && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>(+) Suprimentos / Reforços Manuais:</span>
                        <span className="font-mono font-bold text-emerald-600">
                          +{shiftMetrics.totalManualEntries.toLocaleString()} {currency}
                        </span>
                      </div>
                    )}

                    {shiftMetrics.totalManualExits > 0 && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>(-) Sangrias / Despesas Manuais:</span>
                        <span className="font-mono font-bold text-rose-600">
                          -{shiftMetrics.totalManualExits.toLocaleString()} {currency}
                        </span>
                      </div>
                    )}

                    {/* Vendas Eletrónicas */}
                    {shiftMetrics.totalDigitalSales > 0 && (
                      <div className="flex justify-between text-slate-500 border-t border-slate-200 dark:border-zinc-800 pt-1 text-[10px]">
                        <span>Vendas Eletrónicas (M-Pesa/Cartão/Banco):</span>
                        <span className="font-mono font-bold text-blue-600">
                          {shiftMetrics.totalDigitalSales.toLocaleString()} {currency}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Três Métricas Centrais: Teórico vs Físico vs Diferença */}
                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Saldo Teórico
                    </span>
                    <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-sm">
                      {shiftMetrics.expectedCashInDrawer.toLocaleString()} {currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Dinheiro Contado
                    </span>
                    <span className="font-mono font-black text-orange-600 dark:text-orange-400 text-sm">
                      {closePhysicalCount.toLocaleString()} {currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {diffVal === 0 ? "Balanço" : diffVal > 0 ? "Sobra de Caixa" : "Falta de Caixa"}
                    </span>
                    <span className={`font-mono font-black text-sm ${
                      diffVal === 0 ? "text-emerald-600" : diffVal > 0 ? "text-amber-500" : "text-rose-600"
                    }`}>
                      {diffVal > 0 ? `+${diffVal.toLocaleString()}` : diffVal.toLocaleString()} {currency}
                    </span>
                  </div>
                </div>

                {/* Input de Dinheiro Físico Contado */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-extrabold text-slate-700 dark:text-slate-300">
                      Dinheiro Físico Contado na Gaveta ({currency}) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setCloseTab("denoms")}
                      className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Coins className="w-3 h-3" />
                      <span>Abrir Contagem Detalhada</span>
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={closePhysicalCountInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClosePhysicalCountInput(v);
                      setClosePhysicalCount(parseFloat(v) || 0);
                    }}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border-2 border-orange-300 dark:border-orange-700 rounded-xl font-mono font-black text-slate-900 dark:text-white text-base outline-none focus:border-orange-500"
                  />
                </div>

                {/* Alerta de Divergência se houver Falta ou Sobra */}
                {diffVal !== 0 && (
                  <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    diffVal < 0 
                      ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200" 
                      : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200"
                  }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-black block uppercase text-[11px]">
                        {diffVal < 0 ? "⚠️ Falta de Caixa (Quebra) Detetada" : "💰 Sobra de Caixa Detetada"}
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {diffVal < 0 
                          ? `Falta na gaveta a quantia de ${Math.abs(diffVal).toLocaleString()} ${currency} em relação ao saldo teórico esperado.`
                          : `Existe um excedente de ${diffVal.toLocaleString()} ${currency} em relação ao saldo teórico esperado.`}
                      </p>
                      <label className="flex items-center gap-2 pt-1 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={closeConfirmed}
                          onChange={(e) => setCloseConfirmed(e.target.checked)}
                          className="rounded text-orange-600 focus:ring-orange-500"
                        />
                        <span>Confirmo a contagem física e autorizo o registo da divergência.</span>
                      </label>
                    </div>
                  </div>
                )}

                {diffVal === 0 && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Conferência Exata! O dinheiro contado coincide com o saldo teórico.</span>
                  </div>
                )}

                {/* Supervisor Responsável */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Supervisor Homologador
                    </label>
                    <select
                      value={closeSupervisor}
                      onChange={(e) => setCloseSupervisor(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                    >
                      {availableSupervisors.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.role || "Supervisor"})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      PIN do Supervisor
                    </label>
                    <input
                      type="password"
                      maxLength={8}
                      value={closePin}
                      onChange={(e) => setClosePin(e.target.value)}
                      placeholder="PIN"
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest outline-none text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Observações de Fecho
                  </label>
                  <input
                    type="text"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Ex: Turno encerrado com conferência exata."
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                  />
                </div>

                {closeError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-bold text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{closeError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onCloseCloseModal}
                    className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-extrabold shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Homologar e Fechar Turno</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL DE EXTRATO DO TURNO (TODOS OS MOVIMENTOS INDIVIDUAIS) */}
      {/* ========================================================================= */}
      {showExtratoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Extrato de Caixa do Turno #{activeShift?.shiftNumber || 1}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Registos individuais de cada entrada, saída, pagamento em dinheiro e troco
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseExtratoModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo Rápido */}
            <div className="grid grid-cols-4 gap-2 text-center p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Fundo Inicial</span>
                <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                  {shiftMetrics.initialFloat.toLocaleString()} {currency}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Recebido (Vendas)</span>
                <span className="font-mono font-black text-emerald-600">
                  +{shiftMetrics.totalCashReceived.toLocaleString()} {currency}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Trocos Devolvidos</span>
                <span className="font-mono font-black text-rose-600">
                  -{shiftMetrics.totalChangeGiven.toLocaleString()} {currency}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Saldo na Gaveta</span>
                <span className="font-mono font-black text-amber-500">
                  {shiftMetrics.expectedCashInDrawer.toLocaleString()} {currency}
                </span>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex gap-1">
                {[
                  { id: "TODOS", label: "Todos" },
                  { id: "VENDAS", label: "Pagamentos" },
                  { id: "TROCOS", label: "Trocos" },
                  { id: "ENTRADAS", label: "Entradas/Supr." },
                  { id: "SAIDAS", label: "Saídas/Sangrias" }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setExtratoFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-[11px] ${
                      extratoFilter === f.id
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={extratoSearch}
                onChange={(e) => setExtratoSearch(e.target.value)}
                placeholder="Pesquisar por fatura, operador..."
                className="p-1.5 px-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs outline-none w-56"
              />
            </div>

            {/* Tabela de Movimentos */}
            <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-zinc-800 sticky top-0 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <tr>
                    <th className="p-2.5">Hora</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5 text-right">Entrada</th>
                    <th className="p-2.5 text-right">Saída</th>
                    <th className="p-2.5 text-right">Saldo Gaveta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-sans">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 text-xs">
                        Nenhum movimento registado neste turno até ao momento.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m, idx) => {
                      const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--:--";
                      return (
                        <tr key={m.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40 transition">
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">
                            {timeStr}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              m.type === "ABERTURA"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : m.type === "PAGAMENTO_VENDA"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : m.type === "TROCO_VENDA"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : m.type === "SUPRIMENTO"
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}>
                              {m.categoryLabel}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={m.description}>
                            {m.description}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                            {m.amountIn > 0 ? `+${m.amountIn.toLocaleString()} ${currency}` : "-"}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                            {m.amountOut > 0 ? `-${m.amountOut.toLocaleString()} ${currency}` : "-"}
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-white">
                            {m.balanceAfter.toLocaleString()} {currency}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onCloseExtratoModal}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
              >
                Fechar Extrato
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL RÁPIDO DE SUPRIMENTO OU SANGRIA */}
      {/* ========================================================================= */}
      {showQuickEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                {quickEntryType === "SUPRIMENTO" ? (
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                )}
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {quickEntryType === "SUPRIMENTO" ? "Suprimento / Reforço de Caixa" : "Sangria / Retirada para Cofre"}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseQuickEntryModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickEntrySubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor da Operação ({currency}) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-black text-slate-900 dark:text-white text-base outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / Justificação *
                </label>
                <input
                  type="text"
                  required
                  value={quickReason}
                  onChange={(e) => setQuickReason(e.target.value)}
                  placeholder={quickEntryType === "SUPRIMENTO" ? "Ex: Reforço com trocos miúdos" : "Ex: Retirada de segurança para cofre central"}
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Supervisor Responsável
                </label>
                <select
                  value={quickSupervisor}
                  onChange={(e) => setQuickSupervisor(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                >
                  {availableSupervisors.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role || "Supervisor"})</option>
                  ))}
                </select>
              </div>

              {quickError && (
                <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{quickError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCloseQuickEntryModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl text-white font-extrabold shadow-sm transition cursor-pointer ${
                    quickEntryType === "SUPRIMENTO" 
                      ? "bg-emerald-600 hover:bg-emerald-700" 
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  Confirmar {quickEntryType === "SUPRIMENTO" ? "Suprimento" : "Sangria"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
