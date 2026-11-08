import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  Lock, 
  Unlock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Coins, 
  AlertTriangle, 
  Receipt,
  TrendingDown, 
  RotateCcw
} from "lucide-react";
import { Employee, SystemSettings } from "../../types";
import DenominationCounter, { DENOMINATIONS } from "../DenominationCounter";

export const CASH_REGISTERS = [
  { id: "POS-01", name: "Caixa 01 - Balcão Principal" },
  { id: "POS-02", name: "Caixa 02 - Atendimento Rápido" },
  { id: "POS-03", name: "Caixa 03 - Bar / Restaurante" },
  { id: "POS-04", name: "Caixa 04 - Armazém / Atacado" }
];

export const EXPENSE_CATEGORIES = [
  { id: "DESPESA_OPERACIONAL", label: "Despesa Operacional Geral" },
  { id: "LIMPEZA_HIGIENE", label: "Limpeza e Higiene" },
  { id: "ALIMENTACAO", label: "Alimentação da Equipa" },
  { id: "TRANSPORTE_FRETE", label: "Transporte / Frete de Emergência" },
  { id: "ENERGIA_CREDELEC", label: "Eletricidade (Credelec)" },
  { id: "AGUA_SERVICOS", label: "Água e Serviços Básicos" },
  { id: "MATERIAL_ESCRITORIO", label: "Material de Escritório / Papelaria" },
  { id: "MANUTENCAO", label: "Manutenção Rápida" },
  { id: "PAGAMENTO_FORNECEDOR", label: "Pagamento a Fornecedor Local" },
  { id: "OUTRO", label: "Outro Motivo" }
];

interface CashShiftModalsProps {
  activeUsername: string;
  employees: Employee[];
  settings?: SystemSettings;
  currency: string;
  selectedRegisterId?: string;
  onSelectRegisterId?: (id: string) => void;
  // Modals visibility
  showOpenModal: boolean;
  onCloseOpenModal: () => void;
  showCloseModal: boolean;
  onCloseCloseModal: () => void;
  showSangriaModal: boolean;
  onCloseSangriaModal: () => void;
  showEntryModal: boolean;
  entryModalType: "REINFORCEMENT" | "EXPENSE" | "INPUT" | "DEVOLUTION" | "QUEBRA" | "SOBRA";
  onCloseEntryModal: () => void;
  showDenomModal: boolean;
  onCloseDenomModal: () => void;
  onOpenDenomModal?: () => void;
  showAdjustFloatModal?: boolean;
  onCloseAdjustFloatModal?: () => void;
  // Calculations
  theoreticalBalance: number;
  physicalBalance: number;
  openingBalance: number;
  cashSalesAmount: number;
  digitalSalesAmount: number;
  reinforcements: number;
  inputs: number;
  sangrias: number;
  expenses: number;
  devolutions: number;
  quebras: number;
  sobras?: number;
  // Denomination counts state
  denomCounts: { [key: string]: number };
  onChangeDenomCount: (val: number, count: number) => void;
  onResetDenomCounts: () => void;
  onApplyDenomToPhysical: (total: number) => void;
  // Handlers
  onConfirmOpenShift: (openingFloat: number, supervisor: string, notes: string, registerId?: string) => void;
  onConfirmCloseShift: (physicalCount: number, supervisor: string, notes: string, autoPostDifference?: boolean) => void;
  onConfirmSangria: (amount: number, destination: string, reason: string, supervisor: string, voucherRef?: string) => void;
  onConfirmEntry: (
    type: "REINFORCEMENT" | "EXPENSE" | "INPUT" | "DEVOLUTION" | "QUEBRA" | "SOBRA",
    amount: number,
    reason: string,
    supplier: string,
    category?: string,
    voucherRef?: string
  ) => void;
  onConfirmAdjustFloat?: (newFloat: number, reason: string, supervisor: string) => void;
}

export const CashShiftModals: React.FC<CashShiftModalsProps> = ({
  activeUsername,
  employees = [],
  settings,
  currency,
  selectedRegisterId = "POS-01",
  onSelectRegisterId,
  showOpenModal,
  onCloseOpenModal,
  showCloseModal,
  onCloseCloseModal,
  showSangriaModal,
  onCloseSangriaModal,
  showEntryModal,
  entryModalType,
  onCloseEntryModal,
  showDenomModal,
  onCloseDenomModal,
  onOpenDenomModal,
  showAdjustFloatModal = false,
  onCloseAdjustFloatModal,
  theoreticalBalance,
  physicalBalance,
  openingBalance,
  cashSalesAmount: _cashSalesAmount,
  digitalSalesAmount: _digitalSalesAmount,
  reinforcements: _reinforcements,
  inputs: _inputs,
  sangrias: _sangrias,
  expenses: _expenses,
  devolutions: _devolutions,
  quebras: _quebras,
  sobras: _sobras = 0,
  denomCounts,
  onChangeDenomCount,
  onResetDenomCounts,
  onApplyDenomToPhysical,
  onConfirmOpenShift,
  onConfirmCloseShift,
  onConfirmSangria,
  onConfirmEntry,
  onConfirmAdjustFloat
}) => {
  // Available Supervisors (Dynamic from real registered employees)
  const availableSupervisors = useMemo(() => {
    const valid = employees.filter(e => {
      const r = (e.role || "").toUpperCase();
      return r === "ADMIN" || r === "ADMINISTRADOR" || r === "SUPERVISOR" || r === "GERENTE" || r === "FINANCEIRO" || r === "MANAGER";
    });
    if (valid.length > 0) return valid;
    return employees.length > 0 ? employees : [{ id: "emp-1", name: activeUsername, role: "SUPERVISOR" } as Employee];
  }, [employees, activeUsername]);

  // Terminal State for Modals
  const [modalRegisterId, setModalRegisterId] = useState<string>(selectedRegisterId);

  // Open Shift Form State
  const [openFloat, setOpenFloat] = useState<string>("");
  const [openSupervisor, setOpenSupervisor] = useState<string>("");
  const [openPin, setOpenPin] = useState<string>("");
  const [openNotes, setOpenNotes] = useState<string>("");
  const [openError, setOpenError] = useState<string>("");

  // Close Shift Form State
  const [closePhysicalCount, setClosePhysicalCount] = useState<number>(physicalBalance);
  const [closeSupervisor, setCloseSupervisor] = useState<string>("");
  const [closePin, setClosePin] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");
  const [closeError, setCloseError] = useState<string>("");
  const [activeCloseTab, setActiveCloseTab] = useState<"summary" | "denoms">("summary");
  const [autoPostDiff, setAutoPostDiff] = useState<boolean>(true);

  // Sangria Form State
  const [sangriaAmount, setSangriaAmount] = useState<number>(0);
  const [sangriaDestination, setSangriaDestination] = useState<string>("Cofre Central");
  const [sangriaReason, setSangriaReason] = useState<string>("");
  const [sangriaVoucherRef, setSangriaVoucherRef] = useState<string>("");
  const [sangriaSupervisor, setSangriaSupervisor] = useState<string>("");
  const [sangriaPin, setSangriaPin] = useState<string>("");
  const [sangriaError, setSangriaError] = useState<string>("");

  // Generic Entry Form State
  const [entryAmount, setEntryAmount] = useState<number>(0);
  const [entryReason, setEntryReason] = useState<string>("");
  const [entrySupplier, setEntrySupplier] = useState<string>("");
  const [entryCategory, setEntryCategory] = useState<string>("DESPESA_OPERACIONAL");
  const [entryVoucherRef, setEntryVoucherRef] = useState<string>("");
  const [entryError, setEntryError] = useState<string>("");

  // Adjust Float Modal State
  const [adjustFloatVal, setAdjustFloatVal] = useState<number>(openingBalance || 0);
  const [adjustFloatReason, setAdjustFloatReason] = useState<string>("");
  const [adjustFloatSupervisor, setAdjustFloatSupervisor] = useState<string>("");
  const [adjustFloatPin, setAdjustFloatPin] = useState<string>("");
  const [adjustFloatError, setAdjustFloatError] = useState<string>("");

  // Reset openFloat on modal open
  useEffect(() => {
    if (showOpenModal) {
      setOpenFloat("");
      setOpenError("");
      setModalRegisterId(selectedRegisterId);
    }
  }, [showOpenModal, selectedRegisterId]);

  // Set default supervisor on init
  useEffect(() => {
    if (availableSupervisors.length > 0) {
      if (!openSupervisor) setOpenSupervisor(availableSupervisors[0].name);
      if (!closeSupervisor) setCloseSupervisor(availableSupervisors[0].name);
      if (!sangriaSupervisor) setSangriaSupervisor(availableSupervisors[0].name);
      if (!adjustFloatSupervisor) setAdjustFloatSupervisor(availableSupervisors[0].name);
    }
  }, [availableSupervisors]);

  // Sync adjustFloatVal with openingBalance
  useEffect(() => {
    setAdjustFloatVal(openingBalance || 0);
  }, [openingBalance]);

  // Keep closePhysicalCount in sync
  useEffect(() => {
    setClosePhysicalCount(physicalBalance);
  }, [physicalBalance]);

  // Helper to validate supervisor PIN securely against database
  const validateSupervisorPin = (supervisorName: string, pinToTest: string): boolean => {
    if (!pinToTest || pinToTest.trim() === "") return false;
    const sup = employees.find(e => e.name === supervisorName);
    if (sup && sup.pin) {
      return sup.pin === pinToTest;
    }
    if (settings?.securityPin) {
      return settings.securityPin === pinToTest;
    }
    return false;
  };

  const calculatedFromDenoms = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * count);
    }, 0);
  }, [denomCounts]);

  const diffVal = closePhysicalCount - theoreticalBalance;

  // 1. Submit Open Shift
  const handleOpenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (openFloat === "" || openFloat.trim() === "" || isNaN(Number(openFloat))) {
      setOpenError("É obrigatório inserir o valor inicial da gaveta (insira 0 se abrir sem trocos).");
      return;
    }
    const floatNumber = Number(openFloat);
    if (floatNumber < 0) {
      setOpenError("O fundo de maneio inicial não pode ser negativo.");
      return;
    }
    if (openPin) {
      const isValid = validateSupervisorPin(openSupervisor, openPin);
      if (!isValid) {
        setOpenError("PIN de homologação do Supervisor incorreto!");
        return;
      }
    }
    setOpenError("");
    onConfirmOpenShift(floatNumber, openSupervisor || activeUsername, openNotes, modalRegisterId);
    if (onSelectRegisterId) {
      onSelectRegisterId(modalRegisterId);
    }
    onCloseOpenModal();
    setOpenPin("");
    setOpenNotes("");
    setOpenFloat("");
  };

  // 2. Submit Close Shift
  const handleCloseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeSupervisor) {
      setCloseError("Selecione o supervisor homologador do fechamento.");
      return;
    }
    const isValid = validateSupervisorPin(closeSupervisor, closePin);
    if (!isValid) {
      setCloseError("PIN do Supervisor incorreto! Insira o PIN configurado do colaborador.");
      return;
    }
    if (diffVal !== 0 && (!closeNotes || closeNotes.trim().length < 5)) {
      setCloseError("Havendo diferença de caixa (quebra ou sobra), é obrigatório fornecer uma justificação detalhada.");
      return;
    }
    setCloseError("");
    onConfirmCloseShift(closePhysicalCount, closeSupervisor, closeNotes, autoPostDiff);
    onCloseCloseModal();
    setClosePin("");
    setCloseNotes("");
  };

  // 3. Submit Sangria
  const handleSangriaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sangriaAmount <= 0) {
      setSangriaError("Introduza um valor válido para a sangria de caixa.");
      return;
    }
    if (sangriaAmount > theoreticalBalance) {
      setSangriaError(`O valor da sangria (${sangriaAmount.toLocaleString()} ${currency}) não pode exceder o saldo disponível na gaveta (${theoreticalBalance.toLocaleString()} ${currency}).`);
      return;
    }
    if (sangriaPin) {
      const isValid = validateSupervisorPin(sangriaSupervisor, sangriaPin);
      if (!isValid) {
        setSangriaError("PIN do supervisor autorizador incorreto.");
        return;
      }
    }
    setSangriaError("");
    onConfirmSangria(sangriaAmount, sangriaDestination, sangriaReason, sangriaSupervisor, sangriaVoucherRef);
    onCloseSangriaModal();
    setSangriaAmount(0);
    setSangriaReason("");
    setSangriaVoucherRef("");
    setSangriaPin("");
  };

  // 4. Submit Entry
  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entryAmount <= 0) {
      setEntryError("O valor da operação deve ser maior que zero.");
      return;
    }
    if (!entryReason.trim()) {
      setEntryError("Por favor, descreva a finalidade ou motivo do lançamento.");
      return;
    }
    setEntryError("");
    onConfirmEntry(entryModalType, entryAmount, entryReason, entrySupplier, entryCategory, entryVoucherRef);
    onCloseEntryModal();
    setEntryAmount(0);
    setEntryReason("");
    setEntrySupplier("");
    setEntryVoucherRef("");
  };

  // 5. Submit Adjust Float
  const handleAdjustFloatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustFloatVal < 0) {
      setAdjustFloatError("O fundo de gaveta não pode ser negativo.");
      return;
    }
    if (adjustFloatPin) {
      const isValid = validateSupervisorPin(adjustFloatSupervisor, adjustFloatPin);
      if (!isValid) {
        setAdjustFloatError("PIN de homologação do Supervisor incorreto!");
        return;
      }
    }
    setAdjustFloatError("");
    if (onConfirmAdjustFloat) {
      onConfirmAdjustFloat(adjustFloatVal, adjustFloatReason || "Ajuste manual de fundo da gaveta", adjustFloatSupervisor || activeUsername);
    }
    if (onCloseAdjustFloatModal) {
      onCloseAdjustFloatModal();
    }
    setAdjustFloatPin("");
    setAdjustFloatReason("");
  };

  return (
    <>
      {/* 1. MODAL: ABERTURA DE TURNO */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Unlock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Abertura de Turno de Caixa
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseOpenModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Operador
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
                    value={modalRegisterId}
                    onChange={(e) => setModalRegisterId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                  >
                    {CASH_REGISTERS.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fundo inicial */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Fundo de Maneio Inicial (Trocos) ({currency}) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDenomModal();
                    }}
                    className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-900/40 hover:bg-orange-100 cursor-pointer flex items-center gap-1"
                  >
                    <Coins className="w-3 h-3" />
                    <span>Contar Cédulas</span>
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={openFloat}
                  onChange={(e) => setOpenFloat(e.target.value)}
                  placeholder="0.00 (Introduza o valor manual)"
                  className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-extrabold text-slate-900 dark:text-white text-base outline-none focus:border-orange-500 transition-colors"
                />
                
                {/* Quick amount shortcuts */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 font-semibold">Atalhos rápidos:</span>
                  {[0, 200, 500, 1000, 2000, 5000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setOpenFloat(val.toString())}
                      className="px-2 py-1 bg-slate-100 dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-orange-950/50 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[11px] font-bold font-mono transition cursor-pointer border border-slate-200 dark:border-zinc-700"
                    >
                      {val === 0 ? "Sem Fundo (0)" : `${val.toLocaleString()} ${currency}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Supervisor Responsável *
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
                    PIN do Supervisor
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    value={openPin}
                    onChange={(e) => setOpenPin(e.target.value)}
                    placeholder="PIN de autorização"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações de Abertura
                </label>
                <textarea
                  rows={2}
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  placeholder="Ex: Turno da manhã, gaveta com notas pequenas de troco."
                  className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                />
              </div>

              {openError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold text-xs">
                  ⚠️ {openError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCloseOpenModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm transition cursor-pointer"
                >
                  Confirmar Abertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MODAL: FECHAMENTO DE CAIXA E RECONCILIAÇÃO */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-orange-500" />
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Fechamento de Caixa & Homologação de Turno
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Terminal: <strong className="text-slate-700 dark:text-slate-300">{selectedRegisterId}</strong> • Operador: <strong className="text-slate-700 dark:text-slate-300">{activeUsername}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseCloseModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tab */}
            <div className="flex gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveCloseTab("summary")}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                  activeCloseTab === "summary"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                1. Resumo e Homologação
              </button>
              <button
                type="button"
                onClick={() => setActiveCloseTab("denoms")}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeCloseTab === "denoms"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>2. Contagem de Cédulas ({calculatedFromDenoms.toLocaleString()} {currency})</span>
              </button>
            </div>

            {activeCloseTab === "denoms" ? (
              <div className="space-y-4">
                <DenominationCounter
                  denomCounts={denomCounts}
                  onChangeCount={onChangeDenomCount}
                  onResetCounts={onResetDenomCounts}
                  currency={currency}
                  isInteractive={true}
                />
                <button
                  type="button"
                  onClick={() => {
                    setClosePhysicalCount(calculatedFromDenoms);
                    onApplyDenomToPhysical(calculatedFromDenoms);
                    setActiveCloseTab("summary");
                  }}
                  className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-sm transition cursor-pointer"
                >
                  Aplicar Valor da Contagem ({calculatedFromDenoms.toLocaleString()} {currency}) ao Fecho
                </button>
              </div>
            ) : (
              <form onSubmit={handleCloseSubmit} className="space-y-4 text-xs">
                {/* Financial Overview in Modal */}
                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Teórico</span>
                    <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                      {theoreticalBalance.toLocaleString()} {currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Físico</span>
                    <span className="font-mono font-extrabold text-orange-600 dark:text-orange-400 text-sm">
                      {closePhysicalCount.toLocaleString()} {currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {diffVal === 0 ? "Balanço" : diffVal > 0 ? "Sobra de Caixa" : "Quebra de Caixa"}
                    </span>
                    <span className={`font-mono font-extrabold text-sm ${
                      diffVal === 0 ? "text-emerald-600" : diffVal > 0 ? "text-amber-600 font-black" : "text-rose-600 font-black"
                    }`}>
                      {diffVal > 0 ? `+${diffVal.toLocaleString()}` : diffVal.toLocaleString()} {currency}
                    </span>
                  </div>
                </div>

                {/* Diferença Alert Banner */}
                {diffVal !== 0 && (
                  <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    diffVal < 0 
                      ? "bg-rose-50 border-rose-200 text-rose-800" 
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-extrabold block">
                        {diffVal < 0 ? "⚠️ QUEBRA DE CAIXA DETETADA" : "💰 SOBRA DE CAIXA DETETADA"}
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {diffVal < 0 
                          ? `Falta na gaveta a quantia de ${Math.abs(diffVal).toLocaleString()} ${currency} em relação ao esperado.`
                          : `Existe um excedente na gaveta de ${diffVal.toLocaleString()} ${currency} em relação ao esperado.`}
                      </p>
                      <label className="flex items-center gap-2 pt-1 cursor-pointer font-bold">
                        <input
                          type="checkbox"
                          checked={autoPostDiff}
                          onChange={(e) => setAutoPostDiff(e.target.checked)}
                          className="rounded text-orange-600 focus:ring-orange-500"
                        />
                        <span>Lançar automaticamente {diffVal < 0 ? "a Quebra" : "a Sobra"} no Livro de Caixa</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Saldo Físico Contado na Gaveta ({currency}) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={closePhysicalCount}
                      onChange={(e) => setClosePhysicalCount(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-extrabold text-slate-900 dark:text-white text-sm outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Supervisor Homologador *
                    </label>
                    <select
                      value={closeSupervisor}
                      onChange={(e) => setCloseSupervisor(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none"
                    >
                      {availableSupervisors.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.role || "Supervisor"})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIN do Supervisor para Validação e Fecho de Caixa *
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={8}
                    value={closePin}
                    onChange={(e) => setClosePin(e.target.value)}
                    placeholder="Insira o PIN de segurança do supervisor"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest text-sm outline-none focus:border-orange-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    A validação é efetuada contra a base de dados de colaboradores cadastrados.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Justificação / Observações de Fechamento {diffVal !== 0 && <span className="text-rose-500">* (Obrigatório devido à diferença)</span>}
                  </label>
                  <textarea
                    rows={2}
                    required={diffVal !== 0}
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder={
                      diffVal === 0 
                        ? "Ex: Turno fechado com conferência exata de valores."
                        : "Ex: Justificativa detalhada da causa da quebra/sobra apurada na contagem..."
                    }
                    className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                  />
                </div>

                {closeError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold text-xs">
                    ⚠️ {closeError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onCloseCloseModal}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-orange-500 dark:hover:bg-orange-600 text-white font-extrabold shadow-sm transition cursor-pointer"
                  >
                    Homologar e Fechar Turno
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 3. MODAL: SANGRIA RÁPIDA (COFRE) */}
      {showSangriaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Sangria de Segurança (Retirada para Cofre)
                  </h3>
                  <span className="text-[10px] text-slate-400">Terminal: {selectedRegisterId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseSangriaModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSangriaSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor da Retirada ({currency}) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={sangriaAmount || ""}
                  onChange={(e) => setSangriaAmount(Number(e.target.value))}
                  placeholder="Ex: 10000"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-extrabold text-slate-900 dark:text-white text-sm outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Disponível em gaveta: <strong className="text-slate-700 dark:text-slate-300">{theoreticalBalance.toLocaleString()} {currency}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Destino dos Fundos *
                  </label>
                  <select
                    value={sangriaDestination}
                    onChange={(e) => setSangriaDestination(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                  >
                    <option value="Cofre Central">Cofre Central</option>
                    <option value="Depósito Millennium BIM">Depósito Millennium BIM</option>
                    <option value="Depósito Bancário BCI">Depósito Bancário BCI</option>
                    <option value="Depósito Standard Bank">Depósito Standard Bank</option>
                    <option value="Gerência / Tesouraria">Gerência / Tesouraria</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nº Comprovativo / Guia
                  </label>
                  <input
                    type="text"
                    value={sangriaVoucherRef}
                    onChange={(e) => setSangriaVoucherRef(e.target.value)}
                    placeholder="Ex: GUIA-2026-08"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Supervisor Autorizador *
                  </label>
                  <select
                    value={sangriaSupervisor}
                    onChange={(e) => setSangriaSupervisor(e.target.value)}
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
                    value={sangriaPin}
                    onChange={(e) => setSangriaPin(e.target.value)}
                    placeholder="PIN"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / Justificação
                </label>
                <textarea
                  rows={2}
                  value={sangriaReason}
                  onChange={(e) => setSangriaReason(e.target.value)}
                  placeholder="Ex: Excesso de saldo em dinheiro na gaveta recolhido para custódia no cofre."
                  className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs"
                />
              </div>

              {sangriaError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold text-xs">
                  ⚠️ {sangriaError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCloseSangriaModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow-sm transition cursor-pointer"
                >
                  Executar Sangria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: LANÇAMENTO GENÉRICO (REFORÇO / DESPESA / DEVOLUÇÃO / QUEBRA / SOBRA) */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                {entryModalType === "REINFORCEMENT" && <ArrowDownLeft className="w-5 h-5 text-blue-600" />}
                {entryModalType === "EXPENSE" && <TrendingDown className="w-5 h-5 text-rose-600" />}
                {entryModalType === "DEVOLUTION" && <RotateCcw className="w-5 h-5 text-orange-600" />}
                {entryModalType === "QUEBRA" && <AlertTriangle className="w-5 h-5 text-purple-600" />}
                {entryModalType === "SOBRA" && <Coins className="w-5 h-5 text-emerald-600" />}
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {entryModalType === "REINFORCEMENT" && "Reforço de Caixa (Suprimento de Trocos)"}
                  {entryModalType === "EXPENSE" && "Lançamento de Despesa Operacional"}
                  {entryModalType === "DEVOLUTION" && "Devolução / Reembolso de Venda"}
                  {entryModalType === "QUEBRA" && "Registro de Quebra de Caixa"}
                  {entryModalType === "SOBRA" && "Registro de Sobra de Caixa"}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseEntryModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEntrySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor do Movimento ({currency}) *
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  value={entryAmount || ""}
                  onChange={(e) => setEntryAmount(Number(e.target.value))}
                  placeholder="Ex: 500"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-extrabold text-slate-900 dark:text-white text-sm outline-none focus:border-orange-500"
                />
              </div>

              {entryModalType === "EXPENSE" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Categoria da Despesa *
                    </label>
                    <select
                      value={entryCategory}
                      onChange={(e) => setEntryCategory(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none text-xs"
                    >
                      {EXPENSE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nº Recibo / Fatura
                    </label>
                    <input
                      type="text"
                      value={entryVoucherRef}
                      onChange={(e) => setEntryVoucherRef(e.target.value)}
                      placeholder="Ex: REC-1042"
                      className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Finalidade / Motivo *
                </label>
                <input
                  type="text"
                  required
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  placeholder={
                    entryModalType === "REINFORCEMENT" ? "Ex: Entrada de trocos em moedas de 5 e 10 MT vindos do cofre" :
                    entryModalType === "EXPENSE" ? "Ex: Compra de rolos de papel para o POS" :
                    entryModalType === "DEVOLUTION" ? "Ex: Reembolso de produto devolvido pelo cliente" :
                    entryModalType === "SOBRA" ? "Ex: Excedente apurado na contagem cega" : "Ex: Falta apurada na contagem física"
                  }
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold outline-none focus:border-orange-500 text-xs"
                />
              </div>

              {(entryModalType === "EXPENSE" || entryModalType === "DEVOLUTION" || entryModalType === "REINFORCEMENT") && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {entryModalType === "REINFORCEMENT" ? "Origem dos Fundos" : "Fornecedor / Credor / Beneficiário"}
                  </label>
                  <input
                    type="text"
                    value={entrySupplier}
                    onChange={(e) => setEntrySupplier(e.target.value)}
                    placeholder={entryModalType === "REINFORCEMENT" ? "Ex: Cofre Geral ou Banco" : "Ex: Papelaria Moderna, Lda ou Nome do Cliente"}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold outline-none text-xs"
                  />
                </div>
              )}

              {entryError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold text-xs">
                  ⚠️ {entryError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCloseEntryModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold shadow-sm transition cursor-pointer"
                >
                  Confirmar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: CALCULADORA DE CÉDULAS & MOEDAS */}
      {showDenomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Conferência Física da Gaveta (Denominações em Meticais)
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseDenomModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <DenominationCounter
              denomCounts={denomCounts}
              onChangeCount={onChangeDenomCount}
              onResetCounts={onResetDenomCounts}
              currency={currency}
              isInteractive={true}
            />

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onCloseDenomModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer text-xs"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyDenomToPhysical(calculatedFromDenoms);
                  onCloseDenomModal();
                }}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-sm transition cursor-pointer"
              >
                Actualizar Saldo Físico ({calculatedFromDenoms.toLocaleString()} {currency})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: AJUSTE MANUAL DO FUNDO DE GAVETA / SALDO TEÓRICO */}
      {showAdjustFloatModal && onCloseAdjustFloatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Definir Fundo Inicial da Gaveta (Manual)
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseAdjustFloatModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustFloatSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl text-orange-800 dark:text-orange-300 space-y-1">
                <span className="font-extrabold block text-xs">Definição Manual do Saldo de Fundo</span>
                <p className="text-[11px] leading-relaxed">
                  Insira manualmente a quantia exata de trocos existente na gaveta de caixa para compor o cálculo do Saldo Teórico Esperado.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Novo Fundo de Trocos ({currency}) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={adjustFloatVal === 0 ? "" : adjustFloatVal}
                  onChange={(e) => setAdjustFloatVal(Number(e.target.value))}
                  placeholder="0.00 (Introduza o valor manual)"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono font-extrabold text-slate-900 dark:text-white text-sm outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / Observação
                </label>
                <input
                  type="text"
                  value={adjustFloatReason}
                  onChange={(e) => setAdjustFloatReason(e.target.value)}
                  placeholder="Ex: Contagem inicial de notas pequenas na gaveta"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-medium outline-none text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Supervisor Responsável *
                </label>
                <select
                  value={adjustFloatSupervisor}
                  onChange={(e) => setAdjustFloatSupervisor(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 outline-none"
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
                  value={adjustFloatPin}
                  onChange={(e) => setAdjustFloatPin(e.target.value)}
                  placeholder="PIN de autorização"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-center tracking-widest outline-none"
                />
              </div>

              {adjustFloatError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{adjustFloatError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={onCloseAdjustFloatModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold shadow-sm transition cursor-pointer"
                >
                  Salvar Fundo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

