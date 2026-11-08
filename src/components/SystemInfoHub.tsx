import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  Building2,
  GitBranch,
  Clock,
  Calendar,
  Image as ImageIcon,
  BookOpen,
  X,
  ShieldCheck
} from "lucide-react";
import { useSystemVersion } from "../lib/versionManager";

interface SystemInfoHubProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  companyName: string;
  logoUrl?: string;
  version: string;
  sessionSeconds: number;
  activeUser?: any;
  onSwitchUser: () => void;
  onOpenLogoModal: () => void;
  onOpenTutorial: () => void;
  theme?: string;
}

export const SystemInfoHub: React.FC<SystemInfoHubProps> = ({
  isOpen,
  onClose,
  isOnline,
  companyName,
  logoUrl,
  version,
  sessionSeconds,
  activeUser,
  onSwitchUser,
  onOpenLogoModal,
  onOpenTutorial,
  theme = "daily"
}) => {
  const { formattedVersion } = useSystemVersion();
  const [currentSessionSecs, setCurrentSessionSecs] = React.useState(sessionSeconds);

  React.useEffect(() => {
    setCurrentSessionSecs(sessionSeconds);
  }, [sessionSeconds, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setCurrentSessionSecs(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const isNight = theme === "night";

  // Format session duration
  const formatSessionTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
    }
    return `${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  };

  // Format current date and day of week in Portuguese
  const now = new Date();
  const daysOfWeek = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
  ];
  const monthsPt = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];

  const currentDayOfWeek = daysOfWeek[now.getDay()];
  const currentFormattedDate = `${now.getDate()} de ${monthsPt[now.getMonth()]} de ${now.getFullYear()}`;
  const currentTime = now.toLocaleTimeString("pt-MZ", { hour: "2-digit", minute: "2-digit" });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm cursor-pointer"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`relative w-full max-w-xl rounded-2xl p-6 shadow-2xl overflow-hidden z-10 ${
            isNight
              ? "bg-zinc-950 text-slate-100 border border-zinc-800"
              : "bg-white text-slate-800 border border-slate-100 shadow-slate-300/40"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-850">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight leading-tight">
                  Central de Informações do Sistema
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  Visão consolidada de status, sessão, empresa e atalhos rápidos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isNight
                  ? "hover:bg-zinc-900 text-slate-400 hover:text-white"
                  : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              }`}
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid of Information & Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
            
            {/* 1. Sistema ON / Status */}
            <div
              className={`p-4 rounded-xl flex flex-col justify-between ${
                isNight ? "bg-zinc-900/60" : "bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  Estado do Sistema
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isOnline
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-rose-500/15 text-rose-500"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                    }`}
                  />
                  {isOnline ? "Sistema Online" : "Modo Offline"}
                </span>
              </div>
              <div className="mt-3">
                <p className="font-extrabold text-xs">
                  {isOnline ? "Conectado & Sincronizado" : "Trabalhando Offline"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Armazenamento local persistente ativo
                </p>
              </div>
            </div>

            {/* 2. Empresa */}
            <div
              className={`p-4 rounded-xl flex flex-col justify-between ${
                isNight ? "bg-zinc-900/60" : "bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-orange-500" />
                  Empresa
                </span>
                <span className="text-[10px] font-bold text-orange-500 font-mono">
                  {activeUser?.subscriptionPlan || "Plano Ouro"}
                </span>
              </div>
              <div className="mt-3">
                <p className="font-extrabold text-xs truncate">
                  {companyName || "OST Vendas Comercial"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Moçambique • Retalho & Facturação
                </p>
              </div>
            </div>

            {/* 3. Versão */}
            <div
              className={`p-4 rounded-xl flex flex-col justify-between ${
                isNight ? "bg-zinc-900/60" : "bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-orange-500" />
                  Versão
                </span>
                <span className="text-[10px] font-mono text-emerald-500 font-bold">
                  Estável
                </span>
              </div>
              <div className="mt-3">
                <p className="font-extrabold text-xs font-mono">
                  {version || formattedVersion}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Edição Comercial Cloud + POS
                </p>
              </div>
            </div>

            {/* 4. Sessão */}
            <div
              className={`p-4 rounded-xl flex flex-col justify-between ${
                isNight ? "bg-zinc-900/60" : "bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-orange-500" />
                  Sessão Ativa
                </span>
                <span className="text-[10px] font-mono text-orange-500 font-bold">
                  Em Curso
                </span>
              </div>
              <div className="mt-3">
                <p className="font-extrabold text-xs font-mono">
                  {formatSessionTime(currentSessionSecs)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tempo decorrido no terminal
                </p>
              </div>
            </div>

            {/* 5. Dia / Data */}
            <div
              className={`p-4 rounded-xl sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isNight ? "bg-zinc-900/60" : "bg-slate-50/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Dia e Horário Oficial
                  </p>
                  <p className="font-extrabold text-xs">
                    {currentDayOfWeek}, {currentFormattedDate}
                  </p>
                </div>
              </div>
              <div className="sm:text-right font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Hora local: {currentTime}</span>
              </div>
            </div>

          </div>

          {/* Quick Action Buttons (Troca de Usuário, Logotipo, Tutorial) */}
          <div className="pt-2 border-t border-slate-100 dark:border-zinc-850 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            
            {/* Troca de Usuário */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSwitchUser();
              }}
              className={`p-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left ${
                isNight
                  ? "bg-zinc-900 hover:bg-zinc-850 text-slate-200"
                  : "bg-slate-50 hover:bg-orange-50/80 text-slate-700 hover:text-orange-600"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                {activeUser?.fotoPerfil ? (
                  <img
                    src={activeUser.fotoPerfil}
                    alt="User"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  (activeUser?.name || "OP").substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-xs truncate">
                  {activeUser?.name || "Operador"}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  Trocar Usuário 🔄
                </p>
              </div>
            </button>

            {/* Logotipo */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLogoModal();
              }}
              className={`p-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left ${
                isNight
                  ? "bg-zinc-900 hover:bg-zinc-850 text-slate-200"
                  : "bg-slate-50 hover:bg-orange-50/80 text-slate-700 hover:text-orange-600"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="w-full h-full object-contain p-0.5"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="w-4 h-4 text-orange-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-xs">Logotipo</p>
                <p className="text-[10px] text-slate-400 truncate">
                  Atualizar Marca 🖼️
                </p>
              </div>
            </button>

            {/* Tutorial */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTutorial();
              }}
              className={`p-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left ${
                isNight
                  ? "bg-zinc-900 hover:bg-zinc-850 text-slate-200"
                  : "bg-slate-50 hover:bg-orange-50/80 text-slate-700 hover:text-orange-600"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-500 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-xs">Tutorial</p>
                <p className="text-[10px] text-slate-400 truncate">
                  Guia & Atalhos (F1) 💡
                </p>
              </div>
            </button>

          </div>

          {/* Minimalist Footer Bar */}
          <div className="mt-4 pt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-zinc-850">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Sessão encriptada e segura</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="font-bold text-orange-500 hover:text-orange-600 cursor-pointer"
            >
              Fechar Painel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
