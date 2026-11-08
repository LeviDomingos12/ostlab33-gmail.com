import React from "react";
import { 
  Coins, 
  Receipt,
  Scale,
  Edit3
} from "lucide-react";

interface CashKpiCardsProps {
  shiftStatus: "OPEN" | "CLOSED";
  openingBalance: number;
  cashSalesAmount: number;
  digitalSalesAmount: number;
  reinforcements: number;
  inputs: number;
  sangrias: number;
  expenses: number;
  devolutions: number;
  quebras: number;
  theoreticalTotal: number;
  physicalCount: number;
  currency: string;
  onOpenDenomModal?: () => void;
  onEditOpeningBalance?: () => void;
}

export const CashKpiCards: React.FC<CashKpiCardsProps> = ({
  shiftStatus,
  openingBalance,
  cashSalesAmount,
  digitalSalesAmount,
  reinforcements,
  inputs,
  sangrias,
  expenses,
  devolutions,
  quebras,
  theoreticalTotal,
  physicalCount,
  currency,
  onOpenDenomModal,
  onEditOpeningBalance
}) => {
  const difference = physicalCount - theoreticalTotal;
  const isShiftOpen = shiftStatus === "OPEN";

  return (
    <div className="space-y-4">
      {/* Top Main Dual Balance (Theoretical vs Physical) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Saldo Teórico em Dinheiro */}
        <div className="p-5 rounded-2xl border bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
                  Saldo Teórico (Gaveta)
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Esperado no Caixa Físico
                </p>
              </div>
            </div>
            {onEditOpeningBalance && (
              <button
                type="button"
                onClick={onEditOpeningBalance}
                className="px-2 py-1 text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/40 rounded-lg transition cursor-pointer border border-orange-200 dark:border-orange-900/50 flex items-center gap-1"
                title="Ajustar manualmente o fundo de trocos ou saldo teórico"
              >
                <Edit3 className="w-3 h-3" />
                <span>Definir Fundo</span>
              </button>
            )}
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white tracking-tight">
              {theoreticalTotal.toLocaleString()} <span className="text-sm font-semibold text-slate-500">{currency}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
              Fundo ({openingBalance.toLocaleString()}) + Vendas ({cashSalesAmount.toLocaleString()}) + Reforços ({reinforcements.toLocaleString()}) − Saídas ({(sangrias + expenses + devolutions + quebras).toLocaleString()})
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Total Entradas Dinheiro:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              +{(cashSalesAmount + reinforcements + inputs).toLocaleString()} {currency}
            </span>
          </div>
        </div>

        {/* Card 2: Saldo Físico Apurado */}
        <div className="p-5 rounded-2xl border bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
                  Saldo Físico (Contagem)
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Cédulas & Moedas Contadas
                </p>
              </div>
            </div>

            {onOpenDenomModal && (
              <button
                type="button"
                onClick={onOpenDenomModal}
                className="px-2.5 py-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/40 rounded-lg transition cursor-pointer border border-orange-200 dark:border-orange-900/50"
              >
                Contar Cédulas
              </button>
            )}
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white tracking-tight">
              {physicalCount.toLocaleString()} <span className="text-sm font-semibold text-slate-500">{currency}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
              Total resultante da conferência de notas e moedas de Meticais.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Status da Gaveta:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {isShiftOpen ? "Turno Ativo" : "Turno Fechado"}
            </span>
          </div>
        </div>

        {/* Card 3: Diferença / Desvio de Caixa */}
        <div className={`p-5 rounded-2xl border shadow-sm relative overflow-hidden flex flex-col justify-between ${
          difference === 0
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
            : difference > 0
            ? "bg-amber-500/5 border-amber-500/20 text-amber-950 dark:text-amber-200"
            : "bg-rose-500/5 border-rose-500/20 text-rose-950 dark:text-rose-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                difference === 0
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : difference > 0
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              }`}>
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider opacity-80">
                  Diferença de Caixa
                </span>
                <p className="text-xs font-extrabold">
                  {difference === 0 ? "Balanço 100% Correto" : difference > 0 ? "Sobra de Caixa" : "Quebra de Caixa (Falta)"}
                </p>
              </div>
            </div>

            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
              difference === 0
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                : difference > 0
                ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                : "bg-rose-500/10 text-rose-600 border-rose-500/30"
            }`}>
              {difference === 0 ? "Sem Desvio" : difference > 0 ? "Excesso" : "Défice"}
            </span>
          </div>

          <div className="my-3">
            <div className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
              difference === 0
                ? "text-emerald-700 dark:text-emerald-400"
                : difference > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-rose-700 dark:text-rose-400"
            }`}>
              {difference > 0 ? "+" : ""}{difference.toLocaleString()} <span className="text-sm font-semibold opacity-70">{currency}</span>
            </div>
            <p className="text-[11px] opacity-80 mt-1">
              {difference === 0
                ? "O saldo físico coincide com o valor esperado."
                : difference > 0
                ? `Existem ${difference.toLocaleString()} ${currency} a mais na gaveta do que o apurado nas vendas.`
                : `Faltam ${Math.abs(difference).toLocaleString()} ${currency} para atingir o valor esperado do livro de caixa.`}
            </p>
          </div>

          <div className="pt-2 border-t border-current/10 flex items-center justify-between text-[11px]">
            <span>Estado de Auditoria:</span>
            <span className="font-bold">
              {difference === 0 ? "Aprovado" : "Requer Justificação"}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Fundo de Abertura */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate">Fundo de Abertura</span>
            {onEditOpeningBalance && (
              <button
                type="button"
                onClick={onEditOpeningBalance}
                className="text-slate-400 hover:text-orange-500 p-0.5 rounded transition cursor-pointer"
                title="Editar fundo inicial manualmente"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="text-base sm:text-lg font-extrabold font-mono text-slate-800 dark:text-slate-100 mt-1">
            {openingBalance.toLocaleString()} <span className="text-xs text-slate-400 font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Trocos manuais</span>
        </div>

        {/* Vendas Dinheiro */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block truncate">Vendas em Dinheiro</span>
          <div className="text-base sm:text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            +{cashSalesAmount.toLocaleString()} <span className="text-xs font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Recebido na gaveta</span>
        </div>

        {/* Pagamentos Digitais */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block truncate">Vendas Digitais</span>
          <div className="text-base sm:text-lg font-extrabold font-mono text-blue-600 dark:text-blue-400 mt-1">
            +{digitalSalesAmount.toLocaleString()} <span className="text-xs font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">M-Pesa / E-Mola / POS</span>
        </div>

        {/* Reforços */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-cyan-600 dark:text-cyan-400 block truncate">Reforços / Trocos</span>
          <div className="text-base sm:text-lg font-extrabold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
            +{reinforcements.toLocaleString()} <span className="text-xs font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Suprimento de caixa</span>
        </div>

        {/* Sangrias */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 block truncate">Sangrias / Cofre</span>
          <div className="text-base sm:text-lg font-extrabold font-mono text-orange-600 dark:text-orange-400 mt-1">
            -{sangrias.toLocaleString()} <span className="text-xs font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Retiradas de segurança</span>
        </div>

        {/* Despesas & Devoluções */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block truncate">Despesas / Devoluções</span>
          <div className="text-base sm:text-lg font-extrabold font-mono text-rose-600 dark:text-rose-400 mt-1">
            -{(expenses + devolutions + quebras).toLocaleString()} <span className="text-xs font-normal">{currency}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Gastos & reembolsos</span>
        </div>
      </div>
    </div>
  );
};
