import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
  Legend,
  ComposedChart
} from "recharts";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  ChevronLeft,
  ChevronRight,
  Sliders
} from "lucide-react";
import { SystemUser } from "../../types";

interface DashboardPerformanceTabProps {
  carouselIndex: number;
  carouselDirection: number;
  isAutoPlaying: boolean;
  setIsAutoPlaying: (val: boolean) => void;
  handleSelectSlide: (idx: number) => void;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
  lastHourMetrics: { total: number; count: number };
  averageTicket: number;
  averageTicketComparison: number;
  targetProgress: { pct: number; isMet: boolean; remaining: number; target: number };
  targetGoal: number;
  setTargetGoal: (val: number) => void;
  isEditingGoal: boolean;
  setIsEditingGoal: (val: boolean) => void;
  tempGoalStr: string;
  setTempGoalStr: (val: string) => void;
  stats: {
    salesToday: number;
    salesGrowthRate: number;
    salesMonth: number;
    monthlyGrowthRate: number;
    profitToday: number;
    currentCashDesk: number;
  };
  currency: string;
  todayStr: string;
  selectedDateStr: string;
  activeUser: SystemUser | null;
  chartSalesVsGoals: Array<{ data: string; Vendas: number; Meta: number }>;
  chartWeeklyRevenue: Array<{ dayName: string; fullDateLabel: string; Receita: number; dateStr: string }>;
  chartMonthlySales: Array<{ Mes: string; Valor: number }>;
  chartCurrentMonthDailySales: Array<{ Dia: string; Valor: number }>;
  chartLast6MonthsSales: Array<{ Mes: string; Valor: number }>;
  employeeSalesProgress: Array<{ name: string; sales: number; goal: number; percentage: number }>;
  handleOpenEditGoals: () => void;
  weekBounds: { start: string; end: string };
  onShowToast?: (msg: string, type: "success" | "danger" | "warning") => void;
  onAddAuditLog?: (action: string, category: string, details: string) => void;
}

export const DashboardPerformanceTab: React.FC<DashboardPerformanceTabProps> = ({
  carouselIndex,
  carouselDirection,
  isAutoPlaying,
  setIsAutoPlaying,
  handleSelectSlide,
  handlePrevSlide,
  handleNextSlide,
  lastHourMetrics,
  averageTicket,
  averageTicketComparison,
  targetProgress,
  targetGoal,
  setTargetGoal,
  isEditingGoal,
  setIsEditingGoal,
  tempGoalStr,
  setTempGoalStr,
  stats,
  currency,
  todayStr,
  selectedDateStr: _selectedDateStr,
  activeUser,
  chartSalesVsGoals,
  chartWeeklyRevenue,
  chartMonthlySales,
  chartCurrentMonthDailySales,
  chartLast6MonthsSales,
  employeeSalesProgress,
  handleOpenEditGoals,
  weekBounds,
  onShowToast,
  onAddAuditLog,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Live Performance Overview Banner */}
      <div className="relative bg-white border border-slate-200/85 rounded-3xl p-5 shadow-sm overflow-hidden min-h-[155px] flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-100/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-50/40 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

        <div className="flex items-center justify-between w-full z-10">
          <div className="flex items-center gap-1.5">
            <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-mono">Desempenho Comercial</span>
          </div>
          <button 
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className={`text-[9px] px-2 py-0.5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer ${
              isAutoPlaying 
                ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            <span className={`w-1 h-1 rounded-full ${isAutoPlaying ? "bg-emerald-500 animate-ping" : "bg-slate-400"}`} />
            {isAutoPlaying ? "Auto-Play" : "Pausado"}
          </button>
        </div>

        <div className="relative my-3 min-h-[70px] flex items-center">
          <AnimatePresence mode="wait" custom={carouselDirection}>
            {carouselIndex === 0 && (
              <motion.div
                key="slide-0"
                custom={carouselDirection}
                initial={{ opacity: 0, y: carouselDirection * 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -carouselDirection * 15 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full"
              >
                <div className="md:col-span-8 flex items-center gap-4">
                  <div className="bg-orange-50 text-orange-600 p-3 rounded-2xl shrink-0 shadow-inner">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Vendas da Última Hora</span>
                    <h3 className="text-2xl font-black font-mono text-slate-800">
                      {lastHourMetrics.total.toLocaleString()} <span className="text-sm font-bold text-slate-400">{currency}</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Total de <strong className="text-orange-600 font-mono">{lastHourMetrics.count} transações</strong> registadas nos últimos 60 minutos.
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex md:col-span-4 justify-end">
                  <span className="text-xs bg-orange-50/80 border border-orange-100/50 text-orange-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                    Monitorizando ao Vivo
                  </span>
                </div>
              </motion.div>
            )}

            {carouselIndex === 1 && (
              <motion.div
                key="slide-1"
                custom={carouselDirection}
                initial={{ opacity: 0, y: carouselDirection * 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -carouselDirection * 15 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full"
              >
                <div className="md:col-span-8 flex items-center gap-4">
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl shrink-0 shadow-inner">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Ticket Médio Atual</span>
                    <h3 className="text-2xl font-black font-mono text-slate-800">
                      {averageTicket.toLocaleString()} <span className="text-sm font-bold text-slate-400">{currency}</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Média do valor faturado por cliente nas compras registadas.
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex md:col-span-4 justify-end">
                  <div className="text-right">
                    <span className={`text-xs px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1 ${
                      averageTicketComparison >= 0 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                        : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {averageTicketComparison >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {averageTicketComparison >= 0 ? "+" : ""}{averageTicketComparison.toFixed(1)}% vs anterior
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {carouselIndex === 2 && (
              <motion.div
                key="slide-2"
                custom={carouselDirection}
                initial={{ opacity: 0, y: carouselDirection * 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -carouselDirection * 15 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full"
              >
                <div className="md:col-span-8 flex items-center gap-4 w-full">
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl shrink-0 shadow-inner">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 w-full">
                    {isEditingGoal ? (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input 
                            type="number"
                            value={tempGoalStr}
                            onChange={(e) => setTempGoalStr(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl py-1 px-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
                            placeholder="Nova Meta"
                            autoFocus
                          />
                          <span className="absolute right-2 top-1 text-[9px] text-slate-400 font-bold uppercase">{currency}</span>
                        </div>
                        <button 
                          onClick={() => {
                            const val = Number(tempGoalStr);
                            if (val > 0) {
                              setTargetGoal(val);
                              localStorage.setItem("erp_daily_revenue_goal", val.toString());
                              setIsEditingGoal(false);
                              if (onShowToast) onShowToast("Meta diária de receita atualizada com sucesso!", "success");
                              if (onAddAuditLog) onAddAuditLog("Atualizar Meta de Receita", "DASHBOARD", `Meta diária de receita alterada para ${val.toLocaleString()} ${currency}.`);
                            } else {
                              if (onShowToast) onShowToast("A meta deve ser maior que zero.", "warning");
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-lg text-[11px] cursor-pointer transition active:scale-95"
                        >
                          Salvar
                        </button>
                        <button 
                          onClick={() => {
                            setTempGoalStr(targetGoal.toString());
                            setIsEditingGoal(false);
                          }}
                          className="text-slate-400 hover:text-slate-600 font-bold py-1 px-2 text-[11px] cursor-pointer transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500">Meta de Venda Batida</span>
                          <button 
                            onClick={() => {
                              setTempGoalStr(targetGoal.toString());
                              setIsEditingGoal(true);
                              setIsAutoPlaying(false);
                            }}
                            className="text-[10px] text-blue-500 hover:text-blue-700 font-bold underline cursor-pointer"
                          >
                            (Ajustar Meta)
                          </button>
                        </div>
                        <span className="text-xs font-black text-emerald-600 font-mono">{targetProgress.pct}%</span>
                      </div>
                    )}
                    
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mr-4 mt-1 flex">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${targetProgress.pct}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${targetProgress.isMet ? "bg-gradient-to-r from-emerald-400 to-teal-500 animate-pulse" : "bg-gradient-to-r from-orange-400 to-emerald-500"}`}
                      />
                    </div>
                    
                    <p className="text-[11px] text-slate-400 mt-1">
                      Faturado: <strong className="text-slate-700 font-mono">{stats.salesToday.toLocaleString()} {currency}</strong> de uma meta de <strong className="text-slate-700 font-mono">{targetProgress.target.toLocaleString()} {currency}</strong>.
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex md:col-span-4 justify-end">
                  {targetProgress.isMet ? (
                    <span className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                      Meta Batida! 🎉
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl font-semibold border border-slate-150">
                      Faltam {targetProgress.remaining.toLocaleString()} {currency}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                onClick={() => handleSelectSlide(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  carouselIndex === idx 
                    ? "bg-orange-500 w-6" 
                    : "bg-slate-200 hover:bg-slate-300 w-1.5"
                }`}
                title={`Ver métrica ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevSlide}
              className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer transition"
              title="Métrica Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextSlide}
              className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer transition"
              title="Próxima Métrica"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Vendas vs Metas & Análise */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="col-span-1 lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Vendas vs. Metas</h3>
              <p className="text-xs text-slate-400 mt-0.5">Visão comparativa de desempenho comercial dos últimos 7 dias.</p>
            </div>
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${
              activeUser?.role?.toUpperCase().includes("ADMINISTRADOR") || activeUser?.role?.toUpperCase().includes("GESTOR")
                ? "bg-emerald-50 text-emerald-700 border-emerald-150" 
                : "bg-blue-50 text-blue-700 border-blue-150"
            }`}>
              {activeUser?.role?.toUpperCase().includes("ADMINISTRADOR") || activeUser?.role?.toUpperCase().includes("GESTOR")
                ? "Visão: Geral (Administrador)" 
                : "Visão: Própria (Caixa)"}
            </span>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartSalesVsGoals} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} ${currency}`, name === "Vendas" ? "Vendido" : "Meta"]} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="Vendas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} name="Vendas Realizadas" />
                <Line type="monotone" dataKey="Meta" stroke="#ef4444" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4 }} name="Meta de Vendas" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col justify-between h-96">
          <div className="mb-2">
            <h3 className="font-bold text-slate-800 text-sm">Análise de Metas</h3>
            <p className="text-xs text-slate-400 mt-0.5">Indicadores chave de desempenho comercial.</p>
          </div>
          <div className="space-y-4 flex-1 mt-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Meta Diária Atual</span>
              <p className="text-lg font-black text-slate-800 mt-0.5">
                {(activeUser?.role?.toUpperCase().includes("CAIXA") || activeUser?.role?.toUpperCase().includes("VENDEDOR"))
                  ? (targetGoal / 4).toLocaleString()
                  : targetGoal.toLocaleString()} {currency}
              </p>
              <span className="text-[9.5px] text-slate-500 block mt-1">
                {(activeUser?.role?.toUpperCase().includes("CAIXA") || activeUser?.role?.toUpperCase().includes("VENDEDOR"))
                  ? "Sua cota individual (25% da meta global da empresa)"
                  : "Meta global de vendas da empresa"}
              </span>
            </div>
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <span className="text-[10px] text-emerald-600 font-bold uppercase block">Vendas Recorrentes</span>
              <p className="text-lg font-black text-emerald-700 mt-0.5">
                {chartSalesVsGoals.reduce((sum, item) => sum + item.Vendas, 0).toLocaleString()} {currency}
              </p>
              <span className="text-[9.5px] text-emerald-600/80 block mt-1">
                Total acumulado nos últimos 7 dias de registos ativos.
              </span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3">
            Atualizado automaticamente com base nas permissões de utilizador.
          </div>
        </div>
      </div>

      {/* 3. Metas por Colaborador */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                Metas de Vendas por Colaborador
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Progresso em tempo real das cotas de faturamento individuais para o mês activo.
              </p>
            </div>
            <button
              onClick={handleOpenEditGoals}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1 cursor-pointer active:scale-95"
            >
              <Sliders className="w-3.5 h-3.5" />
              Definir Metas
            </button>
          </div>

          <div className="space-y-4">
            {employeeSalesProgress.map((ep, idx) => {
              const getGradient = (percentage: number) => {
                if (percentage >= 100) return "from-emerald-500 to-teal-400";
                if (percentage >= 75) return "from-indigo-500 to-indigo-400";
                if (percentage >= 40) return "from-amber-500 to-amber-400";
                return "from-red-500 to-orange-400";
              };

              const getBgBadge = (percentage: number) => {
                if (percentage >= 100) return "bg-emerald-50 text-emerald-700 border-emerald-150";
                if (percentage >= 75) return "bg-indigo-50 text-indigo-700 border-indigo-150";
                if (percentage >= 40) return "bg-amber-50 text-amber-700 border-amber-150";
                return "bg-red-50 text-red-700 border-red-150";
              };

              return (
                <div key={ep.name} className="p-3.5 rounded-2xl bg-slate-50/65 border border-slate-100/80 hover:shadow-md hover:shadow-slate-100/50 transition duration-250 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center border border-indigo-100">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-extrabold text-slate-800">{ep.name}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getBgBadge(ep.percentage)}`}>
                      {ep.percentage}% atingido
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 h-3.5 rounded-full overflow-hidden p-[2px]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getGradient(ep.percentage)} transition-all duration-750 ease-out`}
                      style={{ width: `${Math.min(ep.percentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                    <span>Vendido: <strong className="text-slate-800 font-mono">{ep.sales.toLocaleString()} {currency}</strong></span>
                    <span>Meta: <strong className="text-slate-600 font-mono">{ep.goal.toLocaleString()} {currency}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 lg:min-w-[420px] bg-slate-50/50 border border-slate-100 p-4 rounded-2xl flex flex-col h-[380px] xl:h-auto">
          <div className="mb-4">
            <h4 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
              Desempenho: Realizado vs Planeado
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Gráfico comparativo de vendas acumuladas contra as metas individuais ({currency}).
            </p>
          </div>
          
          <div className="flex-1 min-h-0 text-[10px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={employeeSalesProgress} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} ${currency}`, name === "sales" ? "Realizado" : "Meta"]} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="sales" name="Vendas Atuais" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="goal" name="Meta Estipulada" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Weekly Revenue & Monthly Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekly Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Receita Semanal</h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribuição da receita diária ({weekBounds.start} a {weekBounds.end}).</p>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartWeeklyRevenue} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dayName" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  formatter={(value) => [`${Number(value).toLocaleString()} ${currency}`, 'Receita']} 
                  labelFormatter={(label, items) => {
                    const item = items[0]?.payload;
                    return item ? `${item.dayName} (${item.fullDateLabel})` : label;
                  }} 
                />
                <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]}>
                  {chartWeeklyRevenue.map((entry, index) => (
                    <Cell 
                      key={`cell-week-${index}`} 
                      fill={entry.dateStr === todayStr ? "#f97316" : "#10b981"} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Annual Month comparison */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Vendas por Mês (Histórico)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Comparativo do volume comercial anual ({currency}).</p>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartMonthlySales} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="Mes" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} ${currency}`]} />
                <Bar dataKey="Valor" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Daily sales current month & Last 6 Months */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="col-span-1 lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Vendas Diárias do Mês Atual</h3>
            <p className="text-xs text-slate-400 mt-0.5">Faturamento dia a dia ({currency}).</p>
          </div>
          <div className="flex-1 min-h-0 text-[10px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartCurrentMonthDailySales} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="Dia" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} ${currency}`, 'Volume']} />
                <Bar dataKey="Valor" fill="#10b981" radius={[3, 3, 0, 0]}>
                  {chartCurrentMonthDailySales.map((entry, index) => {
                    const maxVal = Math.max(...chartCurrentMonthDailySales.map(d => d.Valor)) || 1;
                    const ratio = entry.Valor / maxVal;
                    const fill = ratio > 0.8 ? "#059669" : ratio > 0.4 ? "#10b981" : "#6ee7b7";
                    return <Cell key={`cell-curr-month-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 bg-white p-5 rounded-2xl border border-slate-200 outline-none overflow-hidden shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Últimos 6 Meses</h3>
            <p className="text-xs text-slate-400 mt-0.5">Evolução do faturamento total ({currency}).</p>
          </div>
          <div className="flex-1 min-h-0 text-[11px] font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartLast6MonthsSales} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="Mes" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} ${currency}`, 'Vendas']} />
                <Bar dataKey="Valor" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {chartLast6MonthsSales.map((_, index) => {
                    const colors = ["#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#4f46e5", "#6366f1"];
                    return <Cell key={`cell-6m-${index}`} fill={colors[index % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
