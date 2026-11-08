import React from "react";
import { 
  Smartphone, 
  CreditCard, 
  Landmark, 
  Banknote, 
  TrendingUp, 
  Clock
} from "lucide-react";

interface CashReconciliationPanelProps {
  cashSales: number;
  mpesaSales: number;
  emolaSales: number;
  posCardSales: number;
  transferSales: number;
  debtSales?: number;
  quebras?: number;
  sobras?: number;
  currency: string;
}

export const CashReconciliationPanel: React.FC<CashReconciliationPanelProps> = ({
  cashSales,
  mpesaSales,
  emolaSales,
  posCardSales,
  transferSales,
  debtSales = 0,
  quebras = 0,
  sobras = 0,
  currency
}) => {
  const totalSales = cashSales + mpesaSales + emolaSales + posCardSales + transferSales + debtSales;
  const digitalTotal = mpesaSales + emolaSales + posCardSales + transferSales;

  const channels = [
    {
      id: "CASH",
      name: "Dinheiro Físico",
      provider: "Gaveta de Caixa",
      amount: cashSales,
      icon: Banknote,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      percentage: totalSales > 0 ? (cashSales / totalSales) * 100 : 0
    },
    {
      id: "MPESA",
      name: "Vodacom M-Pesa",
      provider: "Carteira Móvel Vodacom",
      amount: mpesaSales,
      icon: Smartphone,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/20",
      percentage: totalSales > 0 ? (mpesaSales / totalSales) * 100 : 0
    },
    {
      id: "EMOLA",
      name: "Movitel e-Mola",
      provider: "Carteira Móvel Movitel",
      amount: emolaSales,
      icon: Smartphone,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      percentage: totalSales > 0 ? (emolaSales / totalSales) * 100 : 0
    },
    {
      id: "CARD",
      name: "POS / Cartão Bancário",
      provider: "BCI / BIM / Standard Bank",
      amount: posCardSales,
      icon: CreditCard,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      percentage: totalSales > 0 ? (posCardSales / totalSales) * 100 : 0
    },
    {
      id: "TRANSFER",
      name: "Transferência Bancária",
      provider: "Depósito / IZI / SIMO",
      amount: transferSales,
      icon: Landmark,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      percentage: totalSales > 0 ? (transferSales / totalSales) * 100 : 0
    },
    {
      id: "DEBT",
      name: "Venda a Prazo (Crédito)",
      provider: "Conta Corrente Cliente",
      amount: debtSales,
      icon: Clock,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
      percentage: totalSales > 0 ? (debtSales / totalSales) * 100 : 0
    }
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-4">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
        <div>
          <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            Reconciliação e Conferência de Pagamentos (Moçambique)
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Discriminação de faturamento: Dinheiro em caixa vs. Valores digitais vs. Contas a Receber
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Faturado</span>
            <span className="text-sm font-extrabold font-mono text-slate-900 dark:text-white">
              {totalSales.toLocaleString()} {currency}
            </span>
          </div>
          <div className="text-right pl-3 border-l border-slate-200 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-bold text-blue-500 block">Total Digital</span>
            <span className="text-sm font-extrabold font-mono text-blue-600 dark:text-blue-400">
              {digitalTotal.toLocaleString()} {currency}
            </span>
          </div>
          {(quebras > 0 || sobras > 0) && (
            <div className="text-right pl-3 border-l border-slate-200 dark:border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Diferenças</span>
              <div className="flex items-center gap-1 text-xs font-mono font-bold">
                {quebras > 0 && <span className="text-rose-500">Quebra: -{quebras.toLocaleString()}</span>}
                {sobras > 0 && <span className="text-emerald-500">Sobra: +{sobras.toLocaleString()}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {channels.map(ch => {
          const Icon = ch.icon;
          return (
            <div 
              key={ch.id}
              className={`p-3.5 rounded-xl border ${ch.borderColor} bg-slate-50/50 dark:bg-zinc-950/40 space-y-2 relative overflow-hidden flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {ch.name}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {ch.provider}
                  </span>
                </div>
                <div className={`w-7 h-7 rounded-lg ${ch.bgColor} ${ch.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <div className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                  {ch.amount.toLocaleString()} <span className="text-xs font-normal text-slate-400">{currency}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div 
                    className={`h-full rounded-full ${ch.bgColor.replace('/10', '')} transition-all duration-300`}
                    style={{ width: `${Math.min(100, ch.percentage)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9.5px] text-slate-400 mt-1 font-mono">
                  <span>Participação</span>
                  <span className="font-bold">{ch.percentage.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

