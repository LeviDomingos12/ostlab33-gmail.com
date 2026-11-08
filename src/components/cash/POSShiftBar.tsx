import React from "react";
import { 
  Lock, 
  Unlock, 
  Coins, 
  FileText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  AlertTriangle
} from "lucide-react";
import { ActiveCashShift, ShiftMetricsSummary } from "../../services/cashShiftService";

interface POSShiftBarProps {
  activeShift: ActiveCashShift | null;
  shiftMetrics: ShiftMetricsSummary;
  currency: string;
  onOpenShiftClick: () => void;
  onCloseShiftClick: () => void;
  onViewExtratoClick: () => void;
  onSangriaClick?: () => void;
  onSuprimentoClick?: () => void;
}

export const POSShiftBar: React.FC<POSShiftBarProps> = ({
  activeShift,
  shiftMetrics,
  currency,
  onOpenShiftClick,
  onCloseShiftClick,
  onViewExtratoClick,
  onSangriaClick,
  onSuprimentoClick
}) => {
  const isShiftOpen = activeShift && activeShift.status === "OPEN";

  if (!isShiftOpen) {
    return (
      <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-orange-500/15 border-y border-amber-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider text-[11px]">
                Caixa Fechado • Vendas Bloqueadas
              </span>
              <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                Obrigatório Abrir Turno
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              Antes de iniciar as vendas, o operador deve obrigatoriamente abrir o turno e informar o valor inicial do caixa.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenShiftClick}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <Unlock className="w-4 h-4" />
          <span>Abrir Turno de Caixa</span>
        </button>
      </div>
    );
  }

  // Turno Aberto: Barra de monitoramento em tempo real
  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm">
      {/* Informações do Turno e Operador */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-extrabold uppercase text-[10px] tracking-wide">
            Turno #{activeShift.shiftNumber || 1} Aberto
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-300">
          <span className="text-slate-400">Terminal:</span>
          <span className="font-bold text-white">{activeShift.registerId || "POS-01"}</span>
          <span className="text-slate-600 mx-1">•</span>
          <span className="text-slate-400">Operador:</span>
          <span className="font-bold text-white">{activeShift.openedBy}</span>
        </div>

        {/* Fundo Inicial */}
        <div className="bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Fundo Inicial:</span>
          <span className="font-mono font-black text-amber-300 text-xs">
            {activeShift.openingBalance.toLocaleString()} {currency}
          </span>
        </div>

        {/* Saldo Teórico em Gaveta */}
        <div className="bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Saldo Gaveta:</span>
          <span className="font-mono font-black text-emerald-400 text-xs">
            {shiftMetrics.expectedCashInDrawer.toLocaleString()} {currency}
          </span>
        </div>

        {/* Identificador de Troco: Fundo Inicial vs. Vendas */}
        <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] ${
          shiftMetrics.isInitialFloatExhausted
            ? "bg-rose-950/60 border-rose-500/40 text-rose-300 font-bold"
            : "bg-teal-950/60 border-teal-500/40 text-teal-300"
        }`}>
          {shiftMetrics.isInitialFloatExhausted ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>
                Troco: <strong>Vendas Acumuladas</strong> (Fundo inicial esgotado)
              </span>
            </>
          ) : (
            <>
              <Coins className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>
                Troco: <strong>Fundo Inicial</strong> ({shiftMetrics.initialFloatRemaining.toLocaleString()} {currency} rest.)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Ações Rápidas do Caixa */}
      <div className="flex items-center gap-1.5">
        {onSuprimentoClick && (
          <button
            type="button"
            onClick={onSuprimentoClick}
            title="Reforço ou Entrada Manual de Dinheiro"
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 transition flex items-center gap-1 text-[11px] font-bold cursor-pointer"
          >
            <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
            <span>Suprimento</span>
          </button>
        )}

        {onSangriaClick && (
          <button
            type="button"
            onClick={onSangriaClick}
            title="Retirada ou Sangria para Cofre"
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 transition flex items-center gap-1 text-[11px] font-bold cursor-pointer"
          >
            <ArrowUpRight className="w-3 h-3 text-rose-400" />
            <span>Sangria</span>
          </button>
        )}

        <button
          type="button"
          onClick={onViewExtratoClick}
          title="Ver Extrato Cronológico de Movimentos do Turno"
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 transition flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-amber-400" />
          <span>Extrato ({shiftMetrics.movements.length})</span>
        </button>

        <button
          type="button"
          onClick={onCloseShiftClick}
          title="Fechar Turno e Homologar Balancete com Contagem de Numerário"
          className="px-3 py-1 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-extrabold rounded-lg shadow-sm transition flex items-center gap-1.5 text-[11px] cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Fechar Turno</span>
        </button>
      </div>
    </div>
  );
};
