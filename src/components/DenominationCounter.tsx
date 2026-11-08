import React, { useMemo } from "react";
import { Coins, Plus, Minus, RotateCcw } from "lucide-react";

export interface Denomination {
  value: number;
  label: string;
  type: "note" | "coin";
}

export const DENOMINATIONS: Denomination[] = [
  { value: 1000, label: "1000 MT", type: "note" },
  { value: 500, label: "500 MT", type: "note" },
  { value: 200, label: "200 MT", type: "note" },
  { value: 100, label: "100 MT", type: "note" },
  { value: 50, label: "50 MT", type: "note" },
  { value: 20, label: "20 MT", type: "note" },
  { value: 10, label: "10 MT", type: "coin" },
  { value: 5, label: "5 MT", type: "coin" },
  { value: 2, label: "2 MT", type: "coin" },
  { value: 1, label: "1 MT", type: "coin" },
  { value: 0.5, label: "0.5 MT", type: "coin" }
];

interface DenominationCounterProps {
  denomCounts: { [key: string]: number };
  onChangeCount: (value: number, count: number) => void;
  onResetCounts?: () => void;
  currency: string;
  isInteractive?: boolean;
}

export default function DenominationCounter({
  denomCounts,
  onChangeCount,
  onResetCounts,
  currency,
  isInteractive = true
}: DenominationCounterProps) {

  const totalCalculated = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      const qty = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * qty);
    }, 0);
  }, [denomCounts]);

  const totalNotes = useMemo(() => {
    return DENOMINATIONS.filter(d => d.type === "note").reduce((sum, d) => {
      const qty = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * qty);
    }, 0);
  }, [denomCounts]);

  const totalCoins = useMemo(() => {
    return DENOMINATIONS.filter(d => d.type === "coin").reduce((sum, d) => {
      const qty = denomCounts[d.value.toString()] || 0;
      return sum + (d.value * qty);
    }, 0);
  }, [denomCounts]);

  return (
    <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:bg-zinc-900/70 dark:border-zinc-800 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider">
              Contagem Física de Cédulas & Moedas
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Metical Moçambicano (MZN / MT)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isInteractive && onResetCounts && (
            <button
              type="button"
              onClick={onResetCounts}
              className="px-2.5 py-1 text-[10.5px] font-bold text-slate-500 hover:text-rose-600 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg flex items-center gap-1 transition cursor-pointer"
              title="Zerar todas as contagens"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Zerar</span>
            </button>
          )}

          <div className="bg-orange-500 text-white px-3.5 py-1.5 rounded-xl font-mono font-extrabold text-xs shadow-sm flex items-center gap-1.5">
            <span>Total:</span>
            <span>{totalCalculated.toLocaleString()} {currency}</span>
          </div>
        </div>
      </div>

      {/* Breakdown Pills */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Total em Cédulas:</span>
          <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200">{totalNotes.toLocaleString()} {currency}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Total em Moedas:</span>
          <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200">{totalCoins.toLocaleString()} {currency}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Notes (Notas) Column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
              💵 Cédulas / Notas (MT)
            </span>
          </div>
          <div className="space-y-1.5">
            {DENOMINATIONS.filter(d => d.type === "note").map(d => {
              const qty = denomCounts[d.value.toString()] || 0;
              return (
                <div key={d.value} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200/70 dark:bg-zinc-950 dark:border-zinc-800/80 text-xs hover:border-orange-300 transition">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono w-20">{d.label}</span>
                  
                  {isInteractive ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeCount(d.value, Math.max(0, qty - 1))}
                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 flex items-center justify-center font-bold dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={qty || ""}
                        onChange={(e) => onChangeCount(d.value, Math.max(0, Number(e.target.value)))}
                        className="w-12 text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg py-1 outline-none dark:bg-zinc-900 dark:border-zinc-800 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => onChangeCount(d.value, qty + 1)}
                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 flex items-center justify-center font-bold dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono text-slate-400 font-bold">{qty} un</span>
                  )}

                  <span className="w-20 text-right font-mono font-extrabold text-slate-900 dark:text-zinc-100">
                    {(qty * d.value).toLocaleString()} MT
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coins (Moedas) Column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
              🪙 Moedas (MT)
            </span>
          </div>
          <div className="space-y-1.5">
            {DENOMINATIONS.filter(d => d.type === "coin").map(d => {
              const qty = denomCounts[d.value.toString()] || 0;
              return (
                <div key={d.value} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200/70 dark:bg-zinc-950 dark:border-zinc-800/80 text-xs hover:border-orange-300 transition">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono w-20">{d.label}</span>
                  
                  {isInteractive ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeCount(d.value, Math.max(0, qty - 1))}
                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 flex items-center justify-center font-bold dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={qty || ""}
                        onChange={(e) => onChangeCount(d.value, Math.max(0, Number(e.target.value)))}
                        className="w-12 text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg py-1 outline-none dark:bg-zinc-900 dark:border-zinc-800 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => onChangeCount(d.value, qty + 1)}
                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 flex items-center justify-center font-bold dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono text-slate-400 font-bold">{qty} un</span>
                  )}

                  <span className="w-20 text-right font-mono font-extrabold text-slate-900 dark:text-zinc-100">
                    {(qty * d.value).toLocaleString()} MT
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

