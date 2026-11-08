import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Users,
  Calendar,
  BadgePercent,
  Trash2,
  Bell,
  Volume2,
  List,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckCircle,
  Circle,
  Plus,
  RefreshCw
} from "lucide-react";
import { Product, ProductBatch, Reminder, RecurringReminder } from "../../types";

interface DashboardOperationsTabProps {
  lowStockProducts: Product[];
  onChangeModule?: (module: string) => void;
  stats: {
    totalOutstandingDebt: number;
    activeDebtsCount: number;
    debtsSettledMonth: number;
    recoveryRate: number;
  };
  currency: string;
  expiringBatches: Array<ProductBatch & { daysLeft: number; isExpired: boolean; product?: Product }>;
  setPromoProduct: (prod: Product | null) => void;
  setPromoBatch: (batch: ProductBatch | null) => void;
  setCustomPromoPrice: (price: string) => void;
  setDiscountPercent: (pct: number) => void;
  setConfirmDiscardBatch: (batch: ProductBatch | null) => void;
  activeReminderTab: "diarios" | "recorrentes";
  setActiveReminderTab: (tab: "diarios" | "recorrentes") => void;
  recurringViewMode: "list" | "calendar";
  setRecurringViewMode: (mode: "list" | "calendar") => void;
  reminders: Reminder[];
  recurringReminders: RecurringReminder[];
  handleToggleReminder: (id: string) => void;
  handleDeleteReminder: (id: string) => void;
  handleToggleRecurringReminder: (id: string) => void;
  handleDeleteRecurringReminder: (id: string) => void;
  calendarMonth: number;
  setCalendarMonth: React.Dispatch<React.SetStateAction<number>>;
  calendarYear: number;
  setCalendarYear: React.Dispatch<React.SetStateAction<number>>;
  MONTHS_PT: string[];
  calendarDays: Array<{ dayNum: number; isCurrentMonth: boolean; dateStr: string }>;
  getTasksForDay: (dayNum: number, isCurrentMonth: boolean) => RecurringReminder[];
  selectedDayReminders: { day: number; tasks: RecurringReminder[] } | null;
  setSelectedDayReminders: (val: { day: number; tasks: RecurringReminder[] } | null) => void;
  draggedOverDay: number | null;
  setDraggedOverDay: (val: number | null) => void;
  handleRescheduleTask: (taskId: string, newDay: number) => void;
  playGentleNotificationSound: () => void;
  newReminderTitle: string;
  setNewReminderTitle: (val: string) => void;
  newReminderCategory: "geral" | "vendas" | "estoque" | "financeiro";
  setNewReminderCategory: (val: "geral" | "vendas" | "estoque" | "financeiro") => void;
  handleAddReminder: (e: React.FormEvent) => void;
  newRecurTitle: string;
  setNewRecurTitle: (val: string) => void;
  newRecurFrequency: "daily" | "weekly" | "monthly";
  setNewRecurFrequency: (val: "daily" | "weekly" | "monthly") => void;
  newRecurCategory: "geral" | "vendas" | "estoque" | "financeiro";
  setNewRecurCategory: (val: "geral" | "vendas" | "estoque" | "financeiro") => void;
  newRecurEnablePopup: boolean;
  setNewRecurEnablePopup: (val: boolean) => void;
  handleAddRecurringReminder: (e: React.FormEvent) => void;
}

export const DashboardOperationsTab: React.FC<DashboardOperationsTabProps> = ({
  lowStockProducts,
  onChangeModule,
  stats,
  currency,
  expiringBatches,
  setPromoProduct,
  setPromoBatch,
  setCustomPromoPrice,
  setDiscountPercent,
  setConfirmDiscardBatch,
  activeReminderTab,
  setActiveReminderTab,
  recurringViewMode,
  setRecurringViewMode,
  reminders,
  recurringReminders,
  handleToggleReminder,
  handleDeleteReminder,
  handleToggleRecurringReminder,
  handleDeleteRecurringReminder,
  calendarMonth,
  setCalendarMonth,
  calendarYear,
  setCalendarYear,
  MONTHS_PT,
  calendarDays,
  getTasksForDay,
  selectedDayReminders,
  setSelectedDayReminders,
  draggedOverDay,
  setDraggedOverDay,
  handleRescheduleTask,
  playGentleNotificationSound,
  newReminderTitle,
  setNewReminderTitle,
  newReminderCategory,
  setNewReminderCategory,
  handleAddReminder,
  newRecurTitle,
  setNewRecurTitle,
  newRecurFrequency,
  setNewRecurFrequency,
  newRecurCategory,
  setNewRecurCategory,
  newRecurEnablePopup,
  setNewRecurEnablePopup,
  handleAddRecurringReminder,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Critical Inventory & Debt Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low Stock Warning Card */}
        <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-orange-100 pb-2">
              <div className="flex gap-2 items-center">
                <AlertTriangle className="w-5 h-5 text-orange-600 animate-pulse" />
                <h4 className="text-sm font-bold text-orange-800 tracking-tight">Central de Alertas (Risco de Ruptura)</h4>
              </div>
              <span className="bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {lowStockProducts.length} itens críticos
              </span>
            </div>
            
            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-orange-700 font-medium py-3 text-center">Nenhum produto em nível crítico de stock.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
                {lowStockProducts.map(prod => (
                  <div key={prod.id} className="bg-white/90 p-2.5 rounded-xl border border-orange-150 flex justify-between items-center shadow-xs">
                    <div>
                      <p className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <span>{prod.emoji || "📦"}</span> {prod.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">SKU: {prod.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-orange-700 text-xs">Stock: {prod.stock}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-mono">Min: {prod.minStock}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-orange-100/80 mt-3">
            <button 
              onClick={() => onChangeModule && onChangeModule("STOCK")}
              className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-600/10 transition cursor-pointer"
            >
              Atualizar Inventário Agora
            </button>
          </div>
        </div>

        {/* Customer Debts Summary */}
        <div className="bg-red-50 border border-red-100 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex gap-3.5 items-center border-b border-red-100 pb-3">
              <div className="p-2.5 bg-red-100 text-red-700 rounded-xl">
                <Users className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Créditos de Clientes (Dívidas)</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Visão geral do crédito concedido na praça.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total em Dívida</p>
                <p className="text-lg font-bold text-red-700">{stats.totalOutstandingDebt.toLocaleString()} {currency}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Dívidas Ativas</p>
                <p className="text-lg font-bold text-slate-800">{stats.activeDebtsCount} Clientes</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Liquidadas (Mês)</p>
                <p className="text-lg font-bold text-emerald-600">{stats.debtsSettledMonth.toLocaleString()} {currency}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Recuperação</p>
                <p className="text-lg font-bold text-emerald-600">{stats.recoveryRate}%</p>
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-red-100 flex justify-end mt-3">
            <button
              onClick={() => onChangeModule && onChangeModule("CUSTOMERS")}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Ver Devedores
            </button>
          </div>
        </div>
      </div>

      {/* 2. Product Expiry Batches */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">Controlo de Validade e Lotes Críticos (30 Dias)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Lotes próximos ao vencimento com criação rápida de promoções ou registo de perdas.</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
            expiringBatches.length > 0 
              ? "bg-amber-100 text-amber-800 animate-pulse" 
              : "bg-emerald-100 text-emerald-800"
          }`}>
            {expiringBatches.length === 0 ? "Tudo Regularizado" : `${expiringBatches.length} Lotes em Alerta`}
          </span>
        </div>

        {expiringBatches.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="text-3xl">🎉</div>
            <p className="text-xs font-semibold text-slate-500">Excelente! Nenhum lote de produto está a menos de 30 dias de expirar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider">
                  <th className="pb-3 pl-2">Produto</th>
                  <th className="pb-3 text-center">Lote / Qtd Ativa</th>
                  <th className="pb-3 text-center">Validade</th>
                  <th className="pb-3 text-center">Estado</th>
                  <th className="pb-3 text-right pr-2">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {expiringBatches.map((batch) => {
                  const daysLeft = batch.daysLeft;
                  const isExpired = batch.isExpired;
                  const prod = batch.product;

                  const rowClass = isExpired 
                    ? "bg-red-50/20 hover:bg-red-50/40" 
                    : daysLeft <= 10 
                      ? "bg-amber-50/10 hover:bg-amber-50/30"
                      : "hover:bg-slate-50/40";

                  return (
                    <tr key={batch.id} className={`transition ${rowClass}`}>
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{prod?.emoji || "📦"}</span>
                          <div>
                            <p className="font-extrabold text-xs text-slate-800">{batch.productName}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {prod?.code || "N/A"}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 text-center">
                        <span className="font-bold font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {batch.batchCode}
                        </span>
                        <p className="text-[10px] text-slate-500 font-bold font-mono mt-1">{batch.quantity} un restantes</p>
                      </td>

                      <td className="py-3.5 text-center font-mono text-xs font-bold text-slate-700">
                        {new Date(batch.expiryDate).toLocaleDateString("pt-MZ", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>

                      <td className="py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          isExpired
                            ? "bg-red-100 text-red-800"
                            : daysLeft <= 10
                              ? "bg-orange-100 text-orange-800"
                              : "bg-amber-100 text-amber-800"
                        }`}>
                          {isExpired ? "Expirado" : `${daysLeft} dias rest.`}
                        </span>
                      </td>

                      <td className="py-3.5 text-right pr-2 space-x-1 whitespace-nowrap">
                        {prod && (
                          <button
                            onClick={() => {
                              setPromoProduct(prod);
                              setPromoBatch(batch);
                              const discounted = Math.round(prod.salePrice * 0.8);
                              setCustomPromoPrice(String(discounted));
                              setDiscountPercent(20);
                            }}
                            className="bg-orange-50 hover:bg-orange-100 text-orange-700 font-black px-2.5 py-1.5 rounded-xl text-[10.5px] cursor-pointer transition inline-flex items-center gap-1 shadow-xs border border-orange-200/50"
                            title="Colocar produto em promoção"
                          >
                            <BadgePercent className="w-3.5 h-3.5 text-orange-600" />
                            Promoção
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDiscardBatch(batch)}
                          className="bg-red-50 hover:bg-red-100 text-red-700 font-black px-2.5 py-1.5 rounded-xl text-[10.5px] cursor-pointer transition inline-flex items-center gap-1 shadow-xs border border-red-200/50"
                          title="Descartar lote vencido"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          Descarte
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. System Tasks and Reminders Component */}
      <div id="management-reminders-section" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 scroll-mt-6">
        <div className="flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <span className="relative">
                  <Bell className="w-5 h-5 text-amber-500 animate-bounce" />
                  {activeReminderTab === "diarios" ? (
                    reminders.filter(r => !r.completed).length > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                    )
                  ) : (
                    recurringReminders.filter(r => !r.completed).length > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" />
                    )
                  )}
                </span>
                Lembretes e Tarefas do Sistema
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeReminderTab === "diarios" 
                  ? "Acompanhe e cumpra as obrigações operacionais para hoje." 
                  : "Gerencie tarefas automáticas cíclicas diárias, semanais ou mensais."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={playGentleNotificationSound}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Testar sinal sonoro de notificações"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                <span>Testar Som</span>
              </button>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setActiveReminderTab("diarios")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${activeReminderTab === "diarios" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Lembretes Diários
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReminderTab("recorrentes")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${activeReminderTab === "recorrentes" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Recorrentes Agendados
                </button>
              </div>

              {activeReminderTab === "recorrentes" && (
                <div className="flex items-center gap-1 bg-indigo-50/50 p-1 rounded-xl text-xs border border-indigo-100">
                  <button
                    type="button"
                    onClick={() => setRecurringViewMode("list")}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${recurringViewMode === "list" ? "bg-indigo-600 text-white shadow-xs" : "text-indigo-600 hover:bg-indigo-100/40"}`}
                    title="Visão de Lista"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Lista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecurringViewMode("calendar")}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${recurringViewMode === "calendar" ? "bg-indigo-600 text-white shadow-xs" : "text-indigo-600 hover:bg-indigo-100/40"}`}
                    title="Visão Mensal"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mensal</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeReminderTab === "diarios" ? (
            reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs font-medium text-slate-400">Nenhum lembrete registrado para hoje!</p>
                <p className="text-[10px] text-slate-300">Use o formulário ao lado para programar novos afazeres.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {reminders.map((reminder) => {
                  let badgeColor = "bg-slate-100 text-slate-700";
                  if (reminder.category === "vendas") badgeColor = "bg-orange-100 text-orange-700";
                  if (reminder.category === "estoque") badgeColor = "bg-amber-100 text-amber-800";
                  if (reminder.category === "financeiro") badgeColor = "bg-emerald-100 text-emerald-800";

                  return (
                    <div 
                      key={reminder.id}
                      className={`flex items-start justify-between p-3 rounded-xl border transition ${
                        reminder.completed 
                          ? "bg-slate-50/50 border-slate-100 opacity-60 line-through text-slate-400" 
                          : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <button 
                          type="button"
                          onClick={() => handleToggleReminder(reminder.id)}
                          className="mt-0.5 text-slate-400 hover:text-emerald-500 transition cursor-pointer shrink-0"
                        >
                          {reminder.completed ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 fill-emerald-50" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 break-words leading-tight">
                            {reminder.title}
                          </p>
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeColor}`}>
                            {reminder.category}
                          </span>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleDeleteReminder(reminder.id)}
                        className="text-slate-300 hover:text-red-500 p-1 rounded transition ml-2 cursor-pointer shrink-0"
                        title="Eliminar lembrete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            recurringViewMode === "calendar" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-indigo-50/50 p-2.5 rounded-2xl border border-indigo-100/55">
                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonth === 0) {
                        setCalendarMonth(11);
                        setCalendarYear(prev => prev - 1);
                      } else {
                        setCalendarMonth(prev => prev - 1);
                      }
                      setSelectedDayReminders(null);
                    }}
                    className="p-1.5 hover:bg-white rounded-lg border border-slate-200 bg-slate-50 transition cursor-pointer text-slate-600"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    {MONTHS_PT[calendarMonth]} {calendarYear}
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonth === 11) {
                        setCalendarMonth(0);
                        setCalendarYear(prev => prev + 1);
                      } else {
                        setCalendarMonth(prev => prev + 1);
                      }
                      setSelectedDayReminders(null);
                    }}
                    className="p-1.5 hover:bg-white rounded-lg border border-slate-200 bg-slate-50 transition cursor-pointer text-slate-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(dayLabel => (
                    <span key={dayLabel} className="text-[9px] font-extrabold uppercase text-slate-400 py-1">
                      {dayLabel}
                    </span>
                  ))}

                  {calendarDays.map((dayObj, idx) => {
                    const tasksForThisDay = getTasksForDay(dayObj.dayNum, dayObj.isCurrentMonth);
                    const isToday = dayObj.isCurrentMonth && 
                      dayObj.dayNum === new Date().getDate() && 
                      calendarMonth === new Date().getMonth() && 
                      calendarYear === new Date().getFullYear();
                    
                    const isSelected = selectedDayReminders?.day === dayObj.dayNum && dayObj.isCurrentMonth;
                    const isDraggedOver = draggedOverDay === dayObj.dayNum && dayObj.isCurrentMonth;

                    return (
                      <button
                        key={`${dayObj.dateStr}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (dayObj.isCurrentMonth) {
                            setSelectedDayReminders({
                              day: dayObj.dayNum,
                              tasks: tasksForThisDay
                            });
                          }
                        }}
                        onDragOver={(e) => {
                          if (dayObj.isCurrentMonth) {
                            e.preventDefault();
                            if (draggedOverDay !== dayObj.dayNum) {
                              setDraggedOverDay(dayObj.dayNum);
                            }
                          }
                        }}
                        onDragLeave={() => {
                          setDraggedOverDay(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDraggedOverDay(null);
                          if (dayObj.isCurrentMonth) {
                            const taskId = e.dataTransfer.getData("text/plain");
                            if (taskId) {
                              handleRescheduleTask(taskId, dayObj.dayNum);
                            }
                          }
                        }}
                        className={`relative min-h-[44px] p-1 rounded-xl border flex flex-col items-center justify-between transition-all duration-250 cursor-pointer group ${
                          !dayObj.isCurrentMonth 
                            ? "bg-slate-50/20 border-slate-100 text-slate-300 pointer-events-none" 
                            : isDraggedOver
                              ? "bg-indigo-100 border-indigo-500 scale-[1.04] shadow-md ring-2 ring-indigo-400/50"
                              : isSelected
                                ? "bg-indigo-50 border-indigo-400 text-indigo-950 ring-1 ring-indigo-400/30"
                                : isToday
                                  ? "bg-amber-50/60 border-amber-300 text-amber-900 font-bold"
                                  : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <span className={`text-[10px] font-bold ${isToday ? "bg-amber-500 text-white px-1.5 py-0.5 rounded-full" : ""}`}>
                          {dayObj.dayNum}
                        </span>

                        {tasksForThisDay.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 justify-center mt-1 w-full max-w-[28px]">
                            {tasksForThisDay.slice(0, 3).map(task => {
                              let dotColor = "bg-slate-400";
                              if (task.category === "vendas") dotColor = "bg-orange-500";
                              if (task.category === "estoque") dotColor = "bg-amber-500";
                              if (task.category === "financeiro") dotColor = "bg-emerald-500";
                              if (task.completed) dotColor = "bg-slate-300/80";

                              return (
                                <span 
                                  key={task.id} 
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData("text/plain", task.id);
                                  }}
                                  className={`w-1.5 h-1.5 rounded-full cursor-grab active:cursor-grabbing hover:scale-125 transition-transform ${dotColor}`}
                                  title={`Arraste para reagendar: ${task.title}`}
                                />
                              );
                            })}
                            {tasksForThisDay.length > 3 && (
                              <span className="text-[6px] font-black text-indigo-600 -mt-0.5">+</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {selectedDayReminders && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="bg-indigo-50/30 border border-indigo-100/70 rounded-2xl p-3.5 space-y-3 mt-2"
                    >
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                        <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-indigo-600" />
                          <span>Agenda para {selectedDayReminders.day} de {MONTHS_PT[calendarMonth]}</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setSelectedDayReminders(null)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold text-xs cursor-pointer"
                        >
                          Fechar
                        </button>
                      </div>

                      {selectedDayReminders.tasks.length === 0 ? (
                        <p className="text-[11px] text-slate-400 text-center py-2">
                          Sem tarefas recorrentes programadas para este dia.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                          {selectedDayReminders.tasks.map(task => {
                            let badgeColor = "bg-slate-100 text-slate-700";
                            if (task.category === "vendas") badgeColor = "bg-orange-100 text-orange-700";
                            if (task.category === "estoque") badgeColor = "bg-amber-100 text-amber-800";
                            if (task.category === "financeiro") badgeColor = "bg-emerald-100 text-emerald-800";

                            let freqLabel = "Diária";
                            if (task.frequency === "weekly") freqLabel = "Semanal";
                            if (task.frequency === "monthly") freqLabel = "Mensal";

                            return (
                              <div 
                                key={task.id} 
                                draggable={true}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", task.id);
                                }}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-150 shadow-xs cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-all"
                              >
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  <div className="text-slate-300 hover:text-slate-400 cursor-grab shrink-0 mt-0.5 mr-0.5">
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleToggleRecurringReminder(task.id);
                                      setSelectedDayReminders(prev => {
                                        if (!prev) return null;
                                        return {
                                          ...prev,
                                          tasks: prev.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t)
                                        };
                                      });
                                    }}
                                    className="mt-0.5 text-slate-400 hover:text-indigo-600 transition shrink-0"
                                  >
                                    {task.completed ? (
                                      <CheckCircle className="w-3.5 h-3.5 text-indigo-500 fill-indigo-50" />
                                    ) : (
                                      <Circle className="w-3.5 h-3.5 text-slate-300" />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold leading-tight truncate ${task.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                                      {task.title}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase ${badgeColor}`}>
                                        {task.category}
                                      </span>
                                      <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        {freqLabel}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              recurringReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-xs font-medium text-slate-400">Nenhuma tarefa recorrente configurada!</p>
                  <p className="text-[10px] text-slate-300">Use o formulário ao lado para programar obrigações periódicas.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                  {recurringReminders.map((reminder) => {
                    let badgeColor = "bg-slate-100 text-slate-700";
                    if (reminder.category === "vendas") badgeColor = "bg-orange-100 text-orange-700";
                    if (reminder.category === "estoque") badgeColor = "bg-amber-100 text-amber-800";
                    if (reminder.category === "financeiro") badgeColor = "bg-emerald-100 text-emerald-800";

                    let freqLabel = "Diária";
                    if (reminder.frequency === "weekly") freqLabel = "Semanal";
                    if (reminder.frequency === "monthly") freqLabel = "Mensal";

                    return (
                      <div 
                        key={reminder.id} 
                        className={`flex items-start justify-between p-3 rounded-xl border transition ${
                          reminder.completed 
                            ? "bg-slate-50/50 border-slate-150 opacity-60 line-through text-slate-400" 
                            : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
                        }`}
                      >
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <button 
                            type="button"
                            onClick={() => handleToggleRecurringReminder(reminder.id)}
                            className="mt-0.5 text-slate-400 hover:text-indigo-500 transition cursor-pointer shrink-0"
                          >
                            {reminder.completed ? (
                              <CheckCircle className="w-4 h-4 text-indigo-500 fill-indigo-50" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                          <div className="space-y-0.5 flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 break-words leading-tight">
                              {reminder.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeColor}`}>
                                {reminder.category}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                                <RefreshCw className="w-2.5 h-2.5" />
                                {freqLabel}
                              </span>
                              {reminder.enablePopup && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                  <Bell className="w-2 h-2 animate-pulse" />
                                  Pop-up
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleDeleteRecurringReminder(reminder.id)}
                          className="text-slate-300 hover:text-red-500 p-1 rounded transition ml-2 cursor-pointer shrink-0"
                          title="Eliminar lembrete recorrente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )
          )}
        </div>

        {/* Quick Add Form */}
        <div className="w-full md:w-72 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
          {activeReminderTab === "diarios" ? (
            <>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-500" />
                Agendar Nova Tarefa
              </h4>
              <form onSubmit={handleAddReminder} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Descrição</label>
                  <input 
                    type="text"
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    placeholder="Ex: Pagar fornecedor, conferir caixa..."
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Categoria</label>
                  <select
                    value={newReminderCategory}
                    onChange={(e: any) => setNewReminderCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700 cursor-pointer"
                  >
                    <option value="geral">Geral</option>
                    <option value="vendas">Vendas</option>
                    <option value="estoque">Estoque</option>
                    <option value="financeiro">Financeiro</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs cursor-pointer transition shadow-sm active:scale-95 flex items-center justify-center gap-1 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar Lembrete
                </button>
              </form>
            </>
          ) : (
            <>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" style={{ animationDuration: '10s' }} />
                Agendar Recorrência Fixas
              </h4>
              <form onSubmit={handleAddRecurringReminder} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Descrição do Afazer</label>
                  <input 
                    type="text"
                    value={newRecurTitle}
                    onChange={(e) => setNewRecurTitle(e.target.value)}
                    placeholder="Ex: Balanço mensal, inventário semanal..."
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-medium text-slate-800"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Frequência</label>
                    <select
                      value={newRecurFrequency}
                      onChange={(e: any) => setNewRecurFrequency(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="daily">Diária</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Categoria</label>
                    <select
                      value={newRecurCategory}
                      onChange={(e: any) => setNewRecurCategory(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="geral">Geral</option>
                      <option value="vendas">Vendas</option>
                      <option value="estoque">Estoque</option>
                      <option value="financeiro">Financeiro</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <input 
                    type="checkbox"
                    id="enablePopupCheck"
                    checked={newRecurEnablePopup}
                    onChange={(e) => setNewRecurEnablePopup(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <label htmlFor="enablePopupCheck" className="text-[10px] font-bold text-slate-500 cursor-pointer uppercase select-none">
                    Notificação Pop-up
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs cursor-pointer transition shadow-sm active:scale-95 flex items-center justify-center gap-1 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agendar Recorrente
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
