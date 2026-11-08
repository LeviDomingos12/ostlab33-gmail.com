import React from "react";
import { ShieldAlert, Lock, ShoppingCart, PiggyBank, Users, LayoutDashboard, ArrowRight, UserCheck } from "lucide-react";
import { UserRole, Employee } from "../types";
import { getRoleDisplayName, ROLE_MODULE_PERMISSIONS } from "../lib/rolePermissions";

interface RoleAccessDeniedScreenProps {
  moduleId: string;
  userRole: UserRole;
  activeUser?: Employee | null;
  theme?: string;
  onNavigateToModule: (moduleId: string) => void;
  onSwitchUser?: () => void;
}

export function RoleAccessDeniedScreen({
  moduleId,
  userRole,
  activeUser,
  theme = "day",
  onNavigateToModule,
  onSwitchUser,
}: RoleAccessDeniedScreenProps) {
  const isNight = theme === "night";
  const roleName = activeUser?.role || getRoleDisplayName(userRole);
  const targetRule = ROLE_MODULE_PERMISSIONS[moduleId.toLowerCase()];
  const moduleTitle = targetRule?.name || moduleId.toUpperCase();

  // Define allowed quick navigation modules for the current role
  const quickNav = React.useMemo(() => {
    if (userRole === "CASHIER") {
      return [
        { id: "POS", label: "Vendas (POS)", icon: ShoppingCart, desc: "Faturação e venda rápida no balcão" },
        { id: "CASH", label: "Gestão de Caixa", icon: PiggyBank, desc: "Abertura, fecho e lançamentos" },
        { id: "CUSTOMERS", label: "Gestão de Clientes", icon: Users, desc: "Consulta e registo de clientes" },
      ];
    }
    return [
      { id: "POS", label: "Vendas (POS)", icon: ShoppingCart, desc: "Faturação e venda rápida" },
      { id: "DASHBOARD", label: "Dashboard", icon: LayoutDashboard, desc: "Painel inicial" },
    ];
  }, [userRole]);

  return (
    <div
      className={`min-h-[70vh] flex items-center justify-center p-6 transition-all ${
        isNight ? "bg-zinc-950 text-slate-100" : "bg-slate-50 text-slate-800"
      }`}
    >
      <div
        className={`w-full max-w-xl rounded-2xl border p-8 md:p-10 shadow-2xl transition-all text-center flex flex-col items-center ${
          isNight
            ? "bg-zinc-900/90 border-zinc-800 shadow-black/60"
            : "bg-white border-slate-200/80 shadow-orange-500/5"
        }`}
      >
        {/* Shield Icon Container */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
            <ShieldAlert className="w-10 h-10 stroke-[1.8]" />
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-md">
            <Lock className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/25 mb-3 font-mono">
          <span>Acesso Restrito</span>
          <span>•</span>
          <span>Privilégios Insuficientes</span>
        </div>

        {/* Main Headings */}
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-2">
          Módulo Bloqueado para o seu Perfil
        </h2>

        <p className={`text-xs md:text-sm leading-relaxed max-w-md mb-6 ${isNight ? "text-slate-400" : "text-slate-600"}`}>
          O seu utilizador atual (<strong className="text-orange-500 font-bold">{activeUser?.name || "Operador"}</strong>, perfil <span className="font-mono font-bold text-slate-300 dark:text-slate-200 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded border dark:border-zinc-700">{roleName}</span>) não possui permissão para aceder ao módulo de <strong className="text-slate-900 dark:text-slate-100 font-bold">{moduleTitle}</strong>.
        </p>

        {/* Info Box */}
        <div
          className={`w-full rounded-xl p-4 mb-6 text-left border ${
            isNight
              ? "bg-zinc-950/60 border-zinc-800/80 text-slate-300"
              : "bg-slate-50 border-slate-200/70 text-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              Módulos Autorizados para {roleName}
            </span>
            <span className="text-[10px] font-mono text-emerald-500 font-bold">
              Proteção Ativa
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
            Os dados deste módulo são estritamente confidenciais. Utilize os botões abaixo para navegar para os módulos autorizados:
          </p>
        </div>

        {/* Quick Nav Cards */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {quickNav.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigateToModule(item.id)}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer group ${
                isNight
                  ? "bg-zinc-950/60 border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-850 text-slate-200"
                  : "bg-slate-50/70 border-slate-200 hover:border-orange-500/50 hover:bg-orange-50/40 text-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all">
                  <item.icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold">{item.label}</p>
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Switch User Button */}
        {onSwitchUser && (
          <div className="w-full pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400 text-center sm:text-left">
              Necessita de aceder como Administrador?
            </span>
            <button
              type="button"
              onClick={onSwitchUser}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-500/20 transition cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Trocar de Operador</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
