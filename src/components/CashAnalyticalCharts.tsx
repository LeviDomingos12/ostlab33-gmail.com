import React, { useMemo } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HourlyData {
  hour: string;
  Entradas: number;
  Saídas: number;
}

interface CashAnalyticalChartsProps {
  data: HourlyData[];
  currency: string;
}

export default function CashAnalyticalCharts({ data, currency }: CashAnalyticalChartsProps) {
  // Calculate trend comparing second half of the day vs first half
  const trend = useMemo(() => {
    if (!data || data.length === 0) return { pct: 0, dir: "neutral" };
    
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid).reduce((sum, d) => sum + d.Entradas, 0);
    const secondHalf = data.slice(mid).reduce((sum, d) => sum + d.Entradas, 0);

    if (firstHalf === 0 && secondHalf === 0) return { pct: 0, dir: "neutral" };
    if (firstHalf === 0) return { pct: 100, dir: "up" };

    const diff = secondHalf - firstHalf;
    const pct = Math.abs(Math.round((diff / firstHalf) * 100));

    if (diff > 0) return { pct, dir: "up" };
    if (diff < 0) return { pct, dir: "down" };
    return { pct: 0, dir: "neutral" };
  }, [data]);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider dark:text-zinc-300">
              Fluxo de Caixa por Hora
            </h4>
            
            {/* Trend Indicator */}
            <div 
              className={`flex items-center gap-1 text-[9.5px] px-2 py-0.5 rounded-full font-mono font-extrabold border transition-all ${
                trend.dir === "up"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-900/30"
                  : trend.dir === "down"
                  ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-400 dark:border-rose-900/30"
                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {trend.dir === "up" && <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />}
              {trend.dir === "down" && <TrendingDown className="w-3 h-3 text-rose-600 shrink-0" />}
              {trend.dir === "neutral" && <Minus className="w-3 h-3 text-slate-400 shrink-0" />}
              <span>
                {trend.dir === "up" ? `+${trend.pct}%` : trend.dir === "down" ? `-${trend.pct}%` : "0%"} tendência
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Entradas e Saídas distribuídas ao longo das horas do turno atual.
          </p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-zinc-800" />
            <XAxis 
              dataKey="hour" 
              stroke="#94a3b8" 
              fontSize={10}
              tickLine={false}
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${v.toLocaleString()}`}
            />
            <Tooltip 
              formatter={(value: any) => [`${value.toLocaleString()} ${currency}`, ""]}
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "none",
                borderRadius: "8px",
                fontSize: "11px",
                color: "#f8fafc"
              }}
            />
            <Legend 
              verticalAlign="top" 
              height={36} 
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
            />
            <Bar dataKey="Entradas" name="Entradas (Vendas / Reforços)" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Saídas" name="Saídas (Despesas / Sangrias)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
