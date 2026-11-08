import React, { useState, useMemo, memo } from "react";
import { 
  Layers, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Sliders, 
  Sparkles,
  Check
} from "lucide-react";
import { SystemSettings, Product, UserRole } from "../types";

interface CategoryThresholdsSettingsTabProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  products: Product[];
  onUpdateProducts?: (products: Product[]) => void;
  onAddAuditLog?: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  currentRole?: UserRole;
  currency?: string;
}

export const CategoryThresholdsSettingsTab = memo(function CategoryThresholdsSettingsTab({
  settings,
  onUpdateSettings,
  products = [],
  onUpdateProducts,
  onAddAuditLog,
  onShowToast,
  currentRole = "ADMIN",
  currency = "MT"
}: CategoryThresholdsSettingsTabProps) {
  const canEdit = currentRole === "ADMIN" || currentRole === "SUPERVISOR";

  // Extract all unique categories from products + default categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>(["Mercearia", "Bebidas", "Eletrónicos", "Limpeza", "Vestuário", "Farmácia", "Geral"]);
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Local state for category thresholds: Record<categoryName, minStockNumber>
  const [thresholds, setThresholds] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = settings.categoryStockThresholds || {
      "Mercearia": 5,
      "Bebidas": 10,
      "Eletrónicos": 2,
      "Limpeza": 5,
      "Vestuário": 3,
      "Farmácia": 10,
      "Geral": 5
    };
    return initial;
  });

  const [applyToExistingProducts, setApplyToExistingProducts] = useState<boolean>(false);
  const [savedSuccessCategory, setSavedSuccessCategory] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleThresholdChange = (cat: string, val: number) => {
    const num = Math.max(0, Math.floor(val));
    setThresholds(prev => ({
      ...prev,
      [cat]: num
    }));
  };

  const handleSaveAll = () => {
    if (!canEdit) {
      onShowToast?.("Apenas Administradores e Supervisores podem alterar os limites de stock.", "warning");
      return;
    }

    setIsSavingAll(true);
    try {
      // 1. Update settings
      onUpdateSettings({
        categoryStockThresholds: thresholds
      });

      // 2. If applyToExistingProducts is checked, update all products matching each category
      if (applyToExistingProducts && products.length > 0 && onUpdateProducts) {
        const updatedProducts = products.map(p => {
          const cat = p.category || "Geral";
          const catThreshold = thresholds[cat] !== undefined ? thresholds[cat] : (thresholds["Geral"] ?? 5);
          return {
            ...p,
            minStock: catThreshold
          };
        });
        onUpdateProducts(updatedProducts);
      }

      onAddAuditLog?.(
        "Limites de Stock por Categoria",
        "CONFIGURAÇÕES",
        `Limites mínimos de stock por categoria atualizados com sucesso (${Object.keys(thresholds).length} categorias). Aplicado aos produtos existentes: ${applyToExistingProducts ? 'Sim' : 'Não'}`
      );

      onShowToast?.("Limites de stock por categoria guardados com sucesso!", "success", "Configurações Atualizadas");
      setSavedSuccessCategory("ALL");
      setTimeout(() => setSavedSuccessCategory(null), 3000);
    } catch (err: any) {
      onShowToast?.(`Erro ao guardar limites por categoria: ${err.message}`, "error");
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header Info Banner */}
      <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent p-5 rounded-2xl border border-orange-200/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-orange-500 text-white rounded-xl shadow-xs shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Limites de Stock Mínimo por Categoria</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Defina o limiar de alerta crítico para cada tipo de mercadoria. Quando o stock de um produto atingir este limite, o sistema acionará alertas visuais e automáticos no POS e relatórios.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSavingAll}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSavingAll ? "A Guardar..." : "Guardar Alterações"}</span>
          </button>
        </div>
      </div>

      {/* Options Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between flex-wrap gap-4">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={applyToExistingProducts}
            onChange={(e) => setApplyToExistingProducts(e.target.checked)}
            className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-700">
            Aplicar automaticamente estes limiares a todos os produtos existentes nas respetivas categorias
          </span>
        </label>

        {savedSuccessCategory === "ALL" && (
          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold animate-pulse">
            <CheckCircle2 className="w-4 h-4" />
            <span>Alterações aplicadas com sucesso!</span>
          </div>
        )}
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {categoriesList.map(cat => {
          const currentLimit = thresholds[cat] !== undefined ? thresholds[cat] : 5;
          const matchingProductsCount = products.filter(p => (p.category || "Geral") === cat).length;
          const lowStockCount = products.filter(p => (p.category || "Geral") === cat && p.stock <= currentLimit).length;

          return (
            <div 
              key={cat}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between gap-4 hover:border-orange-300 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900">{cat}</h3>
                    <span className="text-[10px] text-slate-400 font-medium block">
                      {matchingProductsCount} artigo(s) no inventário
                    </span>
                  </div>
                </div>

                {lowStockCount > 0 ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{lowStockCount} crítico(s)</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                    <Check className="w-3 h-3" />
                    <span>Estável</span>
                  </span>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Stock Mínimo de Alerta:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={currentLimit}
                      onChange={(e) => handleThresholdChange(cat, parseInt(e.target.value) || 0)}
                      className="w-16 px-2.5 py-1.5 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    <span className="text-[11px] font-bold text-slate-500">un</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Média de Stock Atual:</span>
                  <span>
                    {matchingProductsCount > 0 
                      ? Math.round(products.filter(p => (p.category || "Geral") === cat).reduce((acc, p) => acc + p.stock, 0) / matchingProductsCount) 
                      : 0} un
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
