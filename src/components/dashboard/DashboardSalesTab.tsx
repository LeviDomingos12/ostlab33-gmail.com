import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
  PieChart,
  Pie,
  Legend
} from "recharts";
import { Star } from "lucide-react";

interface DashboardSalesTabProps {
  chartLast7DaysVolume: Array<{
    date: string;
    dayLabel: string;
    totalSales: number;
    transactionCount: number;
  }>;
  chartPaymentMethods: Array<{ name: string; value: number }>;
  COLORS: string[];
  paymentRevenueDetails: {
    overallTotal: number;
    chartData: Array<{
      key: string;
      name: string;
      value: number;
      count: number;
      avgTicket: number;
      percentage: string;
    }>;
  };
  topSalespeople: Array<{ name: string; total: number; count: number }>;
  topCustomers: Array<{ id: string; name: string; totalSpent: number }>;
  chartBestSellers: Array<{ name: string; value: number }>;
  currency: string;
  selectedDateStr: string;
}

export const DashboardSalesTab: React.FC<DashboardSalesTabProps> = ({
  chartLast7DaysVolume,
  chartPaymentMethods,
  COLORS,
  paymentRevenueDetails,
  topSalespeople,
  topCustomers,
  chartBestSellers,
  currency,
  selectedDateStr,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Main Charts: 7-day Sales & Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily sales volume for last 7 days */}
        <div className="col-span-1 lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                Volume de Vendas Diário (Últimos 7 Dias)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Volume de vendas diário acumulado e transações realizadas nos últimos 7 dias.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                {chartLast7DaysVolume.reduce((acc, curr) => acc + curr.totalSales, 0).toLocaleString()} {currency}
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartLast7DaysVolume} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dayLabel" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip 
                  formatter={(value: any, name: string) => [
                    name === "totalSales" ? `${Number(value).toLocaleString()} ${currency}` : `${value} vendas`,
                    name === "totalSales" ? "Volume de Vendas" : "Transações"
                  ]}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Bar dataKey="totalSales" name="totalSales" fill="#f97316" radius={[6, 6, 0, 0]}>
                  {chartLast7DaysVolume.map((entry, index) => (
                    <Cell key={`cell-vol-${index}`} fill={entry.date === selectedDateStr ? "#ea580c" : "#f97316"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment methods circular split */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Métodos de Pagamento</h3>
            <p className="text-xs text-slate-400 mt-0.5">Preferências transacionadas este mês.</p>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center text-[11px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartPaymentMethods}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartPaymentMethods.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} MT`]} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2. Detailed Payment Analytics (Donut + Table) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 flex flex-col h-80 justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
              Tendência de Pagamentos (Receita)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Percentagem do faturamento total por modalidade de pagamento no período.
            </p>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] font-mono relative">
            {paymentRevenueDetails.overallTotal > 0 ? (
              <div className="w-full h-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentRevenueDetails.chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {paymentRevenueDetails.chartData.map((_, index) => {
                        const trendColors = ["#10b981", "#6366f1", "#f59e0b", "#ef4444"];
                        return <Cell key={`cell-trend-${index}`} fill={trendColors[index % trendColors.length]} />;
                      })}
                    </Pie>
                    <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} ${currency}`, 'Receita Total']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Total</span>
                  <span className="text-xs font-black text-slate-800 font-mono">
                    {paymentRevenueDetails.overallTotal.toLocaleString()} {currency}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Nenhuma transação registrada no período.</p>
            )}
          </div>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Métricas por Tipo de Pagamento
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-500">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase">
                    <th className="py-2">Método</th>
                    <th className="py-2 text-right">Volume ({currency})</th>
                    <th className="py-2 text-right">Transações</th>
                    <th className="py-2 text-right">Ticket Médio</th>
                    <th className="py-2 text-right">Share (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paymentRevenueDetails.chartData.map((item, index) => {
                    const trendColorsText = ["text-emerald-500", "text-indigo-500", "text-amber-500", "text-red-500"];
                    const trendColorsBg = ["bg-emerald-500", "bg-indigo-500", "bg-amber-500", "bg-red-500"];
                    return (
                      <tr key={item.key} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 font-semibold text-slate-700 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${trendColorsBg[index % trendColorsBg.length]}`} />
                          {item.name}
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-slate-800">
                          {item.value.toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-slate-600">
                          {item.count}
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-slate-600">
                          {item.avgTicket.toLocaleString()} {currency}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-mono font-bold ${trendColorsText[index % trendColorsText.length]}`}>
                            {item.percentage}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed mt-4">
            💡 <strong>Dica Operacional:</strong> Métodos de carteira móvel (como <strong>M-Pesa</strong>) oferecem liquidez imediata com taxas de operação reduzidas, enquanto pagamentos em <strong>Dívida</strong> devem ser monitorados no módulo de clientes.
          </div>
        </div>
      </div>

      {/* 3. Top Sellers & Best Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Operators & VIP Customers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-3">Top Operadores & Vendedores</h3>
            <div className="space-y-2.5">
              {topSalespeople.slice(0, 3).map((sp, idx) => (
                <div key={sp.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{sp.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-slate-800">{sp.total.toLocaleString()} {currency}</p>
                    <span className="text-[9.5px] text-slate-400 font-mono">{sp.count} faturas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 mt-3">
            <h3 className="font-bold text-slate-800 text-sm mb-3">Top Clientes VIP</h3>
            <div className="space-y-2.5">
              {topCustomers.slice(0, 3).map((tc) => (
                <div key={tc.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
                      VIP
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{tc.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-orange-600">{tc.totalSpent.toLocaleString()} {currency}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Best Selling Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Produtos Mais Vendidos</h3>
            <p className="text-xs text-slate-400 mt-0.5">Categorias e itens em alta procura.</p>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartBestSellers} layout="vertical" margin={{ top: 10, right: 10, left: 35, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" stroke="#64748b" width={80} />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} un`, 'Vendidos']} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {chartBestSellers.map((_, index) => (
                    <Cell key={`cell-best-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
