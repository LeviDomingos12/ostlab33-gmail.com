import React from "react";
import { 
  Lock, 
  Unlock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Coins, 
  FileText, 
  FileSpreadsheet, 
  TrendingDown, 
  RotateCcw
} from "lucide-react";

interface CashQuickActionsProps {
  shiftStatus: "OPEN" | "CLOSED";
  onOpenShiftModal: () => void;
  onCloseShiftModal: () => void;
  onOpenSangriaModal: () => void;
  onOpenEntryModal: (type: "REINFORCEMENT" | "EXPENSE" | "INPUT" | "DEVOLUTION" | "QUEBRA") => void;
  onOpenDenomModal: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  isManagerOrAdmin: boolean;
}

export const CashQuickActions: React.FC<CashQuickActionsProps> = ({
  shiftStatus,
  onOpenShiftModal,
  onCloseShiftModal,
  onOpenSangriaModal,
  onOpenEntryModal,
  onOpenDenomModal,
  onExportPdf,
  onExportCsv,
  isManagerOrAdmin: _isManagerOrAdmin
}) => {
  const isShiftOpen = shiftStatus === "OPEN";

  return (
    <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider">
            Operações Rápidas de Caixa
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${
            isShiftOpen 
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
              : "bg-slate-500/10 text-slate-600 border-slate-500/30"
          }`}>
            {isShiftOpen ? "🟢 Caixa Aberto" : "🔒 Caixa Fechado"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExportCsv}
            className="px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            title="Exportar dados em formato CSV / Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Excel</span> (CSV)
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="px-2.5 py-1 text-xs font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 bg-orange-500/10 border border-orange-200 dark:border-orange-900/40 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            title="Exportar Livro de Caixa em PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Grid of Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Abertura / Fecho de Turno */}
        {!isShiftOpen ? (
          <button
            type="button"
            onClick={onOpenShiftModal}
            className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm flex flex-col items-center justify-center gap-1 transition cursor-pointer transform active:scale-95"
          >
            <Unlock className="w-4 h-4" />
            <span>Abrir Turno</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onCloseShiftModal}
            className="p-3 rounded-xl bg-slate-900 dark:bg-zinc-800 hover:bg-slate-800 dark:hover:bg-zinc-700 text-white font-extrabold text-xs shadow-sm flex flex-col items-center justify-center gap-1 transition cursor-pointer border border-slate-700 active:scale-95"
          >
            <Lock className="w-4 h-4 text-orange-400" />
            <span>Fechar Caixa</span>
          </button>
        )}

        {/* Reforço de Trocos */}
        <button
          type="button"
          disabled={!isShiftOpen}
          onClick={() => onOpenEntryModal("REINFORCEMENT")}
          className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
            isShiftOpen
              ? "bg-blue-50/50 hover:bg-blue-100/60 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-400"
              : "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
          }`}
          title="Inserir trocos ou suprimentos no caixa"
        >
          <ArrowDownLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Reforço (Trocos)</span>
        </button>

        {/* Sangria Rápida */}
        <button
          type="button"
          disabled={!isShiftOpen}
          onClick={onOpenSangriaModal}
          className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
            isShiftOpen
              ? "bg-amber-50/50 hover:bg-amber-100/60 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400"
              : "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
          }`}
          title="Retirada de dinheiro para cofre ou depósito bancário"
        >
          <ArrowUpRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Sangria (Cofre)</span>
        </button>

        {/* Lançar Despesa */}
        <button
          type="button"
          disabled={!isShiftOpen}
          onClick={() => onOpenEntryModal("EXPENSE")}
          className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
            isShiftOpen
              ? "bg-rose-50/50 hover:bg-rose-100/60 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400"
              : "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
          }`}
          title="Despesa operacional paga em dinheiro vivo"
        >
          <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <span>Despesa Caixa</span>
        </button>

        {/* Devolução / Reembolso */}
        <button
          type="button"
          disabled={!isShiftOpen}
          onClick={() => onOpenEntryModal("DEVOLUTION")}
          className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
            isShiftOpen
              ? "bg-orange-50/50 hover:bg-orange-100/60 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/40 dark:text-orange-400"
              : "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
          }`}
          title="Reembolso pago ao cliente por devolução de mercadoria"
        >
          <RotateCcw className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span>Devolução</span>
        </button>

        {/* Contagem Física */}
        <button
          type="button"
          onClick={onOpenDenomModal}
          className="p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-750 text-slate-800 dark:text-slate-200 text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer"
          title="Abrir calculadora de cédulas e moedas de Meticais"
        >
          <Coins className="w-4 h-4 text-orange-500" />
          <span>Conferir Gaveta</span>
        </button>
      </div>
    </div>
  );
};
