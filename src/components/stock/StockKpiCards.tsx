import React from "react";
import { 
  Package, 
  DollarSign, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  TrendingUp 
} from "lucide-react";
import { StockKpis } from "./stockTypes";

interface StockKpiCardsProps {
  kpis: StockKpis;
  currency: string;
}

export const StockKpiCards: React.FC<StockKpiCardsProps> = ({ kpis, currency }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* 1. Total Produtos */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold">Artigos</span>
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Package className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-xl font-bold text-slate-800">{kpis.totalItems}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{kpis.totalUnits.toLocaleString("pt-MZ")} un. totais</p>
        </div>
      </div>

      {/* 2. Valor de Venda do Stock */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold">Valor Venda</span>
          <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-lg font-bold text-emerald-700">
            {kpis.totalSaleValue.toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} <span className="text-xs">{currency}</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Preço final de prateleira</p>
        </div>
      </div>

      {/* 3. Custo do Stock */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold">Custo Total</span>
          <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-lg font-bold text-slate-800">
            {kpis.totalCostValue.toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} <span className="text-xs">{currency}</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Capital imobilizado</p>
        </div>
      </div>

      {/* 4. Stock Baixo */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-amber-600 mb-2">
          <span className="text-xs font-semibold">Stock Baixo</span>
          <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-xl font-bold text-amber-700">{kpis.lowStockCount}</h4>
          <p className="text-[11px] text-amber-600/80 mt-0.5">Abaixo do mínimo</p>
        </div>
      </div>

      {/* 5. Esgotados */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-rose-600 mb-2">
          <span className="text-xs font-semibold">Esgotados</span>
          <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-xl font-bold text-rose-700">{kpis.outOfStockCount}</h4>
          <p className="text-[11px] text-rose-600/80 mt-0.5">Rutura completa</p>
        </div>
      </div>

      {/* 6. A Expirar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-purple-600 mb-2">
          <span className="text-xs font-semibold">A Expirar</span>
          <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h4 className="text-xl font-bold text-purple-700">{kpis.expiringSoonCount}</h4>
          <p className="text-[11px] text-purple-600/80 mt-0.5">&lt; 30 dias</p>
        </div>
      </div>
    </div>
  );
};
