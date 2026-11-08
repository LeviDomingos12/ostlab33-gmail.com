import React from "react";
import { Lock, Crown, Sparkles, ArrowRight } from "lucide-react";
import { SubscriptionPlan } from "../types";

interface PlanLockScreenProps {
  moduleName: string;
  requiredPlan: SubscriptionPlan;
  userPlan: SubscriptionPlan;
  description?: string;
  onUpgradeClick: () => void;
}

export default function PlanLockScreen({
  moduleName,
  requiredPlan,
  userPlan,
  description,
  onUpgradeClick
}: PlanLockScreenProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Crown className="w-3.5 h-3.5" />
            Requer Plano {requiredPlan}
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Módulo {moduleName} Bloqueado
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
            {description || `O seu plano atual (Plano ${userPlan}) não possui permissão para aceder ao módulo de ${moduleName}.`}
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-xs">
          <div className="text-slate-400 font-semibold flex items-center justify-between">
            <span>Seu Plano Atual:</span>
            <span className="font-bold text-amber-500 font-mono">Plano {userPlan}</span>
          </div>
          <div className="text-slate-400 font-semibold flex items-center justify-between">
            <span>Plano Necessário:</span>
            <span className="font-bold text-emerald-400 font-mono">Plano {requiredPlan}</span>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onUpgradeClick}
            className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade para Plano {requiredPlan}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
