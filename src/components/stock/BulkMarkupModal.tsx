import React, { useState, useMemo } from "react";
import { 
  Percent, 
  ArrowRight, 
  X, 
  AlertTriangle, 
  Layers, 
  Sliders, 
  Search, 
  RefreshCw, 
  Zap, 
  CheckCircle2, 
  Package
} from "lucide-react";
import { Product } from "../../types";
import { 
  BulkMarkupOptions, 
  MarkupBaseType, 
  MarkupCalculationMethod, 
  RoundingStrategy, 
  calculateProductPricesWithMarkup
} from "../../lib/pricingUtils";

interface BulkMarkupModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  selectedProductIds?: string[];
  currency: string;
  onApplyBulkUpdate: (updatedProducts: Product[], summaryText: string) => Promise<void>;
  onAddAuditLog?: (action: string, module: string, details: string) => void;
}

const PRESET_MARKUPS = [10, 15, 20, 25, 30, 35, 40, 50];

export const BulkMarkupModal: React.FC<BulkMarkupModalProps> = ({
  isOpen,
  onClose,
  products,
  selectedProductIds = [],
  currency,
  onApplyBulkUpdate,
  onAddAuditLog
}) => {
  const [markupPercent, setMarkupPercent] = useState<number>(25);
  const [baseType, setBaseType] = useState<MarkupBaseType>("cost_price");
  const [calculationMethod, setCalculationMethod] = useState<MarkupCalculationMethod>("markup");
  const [roundingStrategy, setRoundingStrategy] = useState<RoundingStrategy>("round_integer");
  const [scope, setScope] = useState<"all" | "category" | "selected">(
    selectedProductIds.length > 0 ? "selected" : "all"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [fallbackWhenNoCost, setFallbackWhenNoCost] = useState<"use_current_price" | "keep_unchanged" | "skip">("use_current_price");
  
  const [previewSearch, setPreviewSearch] = useState<string>("");
  const [excludedProductIds, setExcludedProductIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Categorias disponíveis no inventário
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Opções computadas para o cálculo
  const bulkOptions: BulkMarkupOptions = useMemo(() => {
    return {
      markupPercentage: Number(markupPercent) || 0,
      baseType,
      calculationMethod,
      roundingStrategy,
      fallbackWhenNoCost,
      category: scope === "category" ? selectedCategory : undefined,
      targetProductIds: scope === "selected" ? selectedProductIds : undefined
    };
  }, [
    markupPercent,
    baseType,
    calculationMethod,
    roundingStrategy,
    fallbackWhenNoCost,
    scope,
    selectedCategory,
    selectedProductIds
  ]);

  // Executa o cálculo em tempo real sobre todo o catálogo
  const calculationResult = useMemo(() => {
    return calculateProductPricesWithMarkup(products, bulkOptions);
  }, [products, bulkOptions]);

  const finalProductsToUpdate = useMemo(() => {
    return calculationResult.updatedProducts.filter(p => !excludedProductIds.has(p.id));
  }, [calculationResult.updatedProducts, excludedProductIds]);

  // Itens visíveis com filtro de busca na tabela de pré-visualização
  const visiblePreviewItems = useMemo(() => {
    const q = previewSearch.toLowerCase().trim();
    if (!q) return calculationResult.items;
    return calculationResult.items.filter(i => 
      i.product.name.toLowerCase().includes(q) ||
      (i.product.code || "").toLowerCase().includes(q) ||
      (i.product.category || "").toLowerCase().includes(q)
    );
  }, [calculationResult.items, previewSearch]);

  const toggleExcludeProduct = (id: string) => {
    setExcludedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (finalProductsToUpdate.length === 0) {
      setErrorMessage("Nenhum produto selecionado ou elegível para alteração de preço.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const summaryText = `Reajuste em lote de ${finalProductsToUpdate.length} produtos aplicado (${markupPercent}% ${baseType === "cost_price" ? "Markup sobre Custo" : "sobre Preço Atual"}).`;

      await onApplyBulkUpdate(finalProductsToUpdate, summaryText);

      if (onAddAuditLog) {
        onAddAuditLog(
          "REAJUSTE_PRECOS_LOTE",
          "STOCK",
          `Reajuste em lote aplicado a ${finalProductsToUpdate.length} produtos com ${markupPercent}% (${baseType}). Variação total no património: ${calculationResult.summary.potentialRevenueDiff.toLocaleString()} ${currency}`
        );
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao gravar reajuste de preços no servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white p-5 px-6 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs border border-white/20">
              <Percent className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                Reajuste e Cálculo de Preços em Lote
                <span className="text-[11px] font-semibold bg-white/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Inventário Total
                </span>
              </h3>
              <p className="text-xs text-orange-100 font-medium">
                Calcule e aplique margens de lucro (markup) a todo o inventário simultaneamente sem alteração manual unitária.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50 dark:bg-zinc-950/40">
          
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 rounded-xl text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Configurações do Reajuste em Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Bloco 1: Percentual de Markup */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-orange-500" />
                  Percentual de Markup / Margem
                </span>
                <span className="text-[11px] font-mono text-orange-600 font-bold">
                  {markupPercent > 0 ? `+${markupPercent}%` : `${markupPercent}%`}
                </span>
              </label>

              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(Number(e.target.value))}
                  className="w-full pl-3 pr-12 py-2 text-base font-bold text-slate-800 dark:text-white bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                  placeholder="Ex: 25"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 dark:text-zinc-500">
                  %
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_MARKUPS.map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMarkupPercent(pct)}
                    className={`text-[11px] font-bold px-2 py-1 rounded-md transition cursor-pointer ${
                      markupPercent === pct
                        ? "bg-orange-500 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
                    }`}
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Bloco 2: Base e Método de Cálculo */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-orange-500" />
                Base de Cálculo
              </label>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="baseType"
                    checked={baseType === "cost_price" && calculationMethod === "markup"}
                    onChange={() => {
                      setBaseType("cost_price");
                      setCalculationMethod("markup");
                    }}
                    className="accent-orange-500"
                  />
                  <span>
                    <strong>Markup sobre Custo</strong> (Custo × [1 + %])
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="baseType"
                    checked={baseType === "cost_price" && calculationMethod === "margin"}
                    onChange={() => {
                      setBaseType("cost_price");
                      setCalculationMethod("margin");
                    }}
                    className="accent-orange-500"
                  />
                  <span>
                    <strong>Margem Alvo</strong> (Custo ÷ [1 - %])
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="baseType"
                    checked={baseType === "current_price"}
                    onChange={() => setBaseType("current_price")}
                    className="accent-orange-500"
                  />
                  <span>
                    <strong>Reajuste sobre Preço Atual</strong> (Preço × [1 + %])
                  </span>
                </label>
              </div>

              {/* Tratamento para itens sem custo */}
              {baseType === "cost_price" && (
                <div className="pt-1 border-t border-slate-100 dark:border-zinc-800">
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                    Se o produto não tiver custo:
                  </span>
                  <select
                    value={fallbackWhenNoCost}
                    onChange={(e) => setFallbackWhenNoCost(e.target.value as any)}
                    className="w-full text-xs p-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-md text-slate-700 dark:text-zinc-300"
                  >
                    <option value="use_current_price">Reajustar sobre preço de venda atual</option>
                    <option value="keep_unchanged">Manter preço atual inalterado</option>
                    <option value="skip">Ignorar produto</option>
                  </select>
                </div>
              )}
            </div>

            {/* Bloco 3: Escopo e Arredondamento */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-orange-500" />
                Escopo do Inventário
              </label>

              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="w-full text-xs p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-300 font-medium"
              >
                <option value="all">📦 Todo o Inventário ({products.length} produtos)</option>
                <option value="category">🏷️ Filtrar por Categoria</option>
                {selectedProductIds.length > 0 && (
                  <option value="selected">🎯 Apenas Selecionados ({selectedProductIds.length} produtos)</option>
                )}
              </select>

              {scope === "category" && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-300"
                >
                  <option value="ALL">Todas as Categorias</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}

              <div className="pt-1 border-t border-slate-100 dark:border-zinc-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block">
                  Regra de Arredondamento:
                </span>
                <select
                  value={roundingStrategy}
                  onChange={(e) => setRoundingStrategy(e.target.value as any)}
                  className="w-full text-xs p-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-md text-slate-700 dark:text-zinc-300"
                >
                  <option value="round_integer">Inteiro mais próximo (ex: 150 MT)</option>
                  <option value="round_5">Múltiplo de 5 MT (ex: 145 MT)</option>
                  <option value="round_9_ending">Preço Psicológico final 9 (ex: 149 MT)</option>
                  <option value="round_two_decimals">Exato com 2 Decimais (ex: 149.50 MT)</option>
                  <option value="none">Sem arredondamento</option>
                </select>
              </div>
            </div>

          </div>

          {/* Resumo de Impacto Financeiro (KPIs) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Produtos a Atualizar
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
                  {finalProductsToUpdate.length}
                </span>
                <span className="text-[11px] text-slate-500">
                  de {calculationResult.summary.eligibleCount} elegíveis
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Variação Média de Preço
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-black font-mono ${
                  calculationResult.summary.averagePriceChangePercent >= 0 ? "text-emerald-600" : "text-amber-600"
                }`}>
                  {calculationResult.summary.averagePriceChangePercent >= 0 ? "+" : ""}
                  {calculationResult.summary.averagePriceChangePercent.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Margem de Lucro Média
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-slate-400 line-through">
                  {calculationResult.summary.averageOldMargin.toFixed(1)}%
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-xl font-black text-emerald-600 font-mono">
                  {calculationResult.summary.averageNewMargin.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Impacto Potencial em Vendas
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-lg font-black font-mono ${
                  calculationResult.summary.potentialRevenueDiff >= 0 ? "text-emerald-600" : "text-red-600"
                }`}>
                  {calculationResult.summary.potentialRevenueDiff >= 0 ? "+" : ""}
                  {calculationResult.summary.potentialRevenueDiff.toLocaleString()} {currency}
                </span>
              </div>
            </div>
          </div>

          {/* Tabela de Pré-visualização com Pesquisa */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-xs">
            
            {/* Barra superior da tabela */}
            <div className="p-3 px-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-orange-500" />
                  Pré-visualização dos Preços Calculados
                </h4>
                <span className="text-[10px] bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 px-2 py-0.5 rounded-full font-bold">
                  {visiblePreviewItems.length} itens listados
                </span>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="Pesquisar produto no preview..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Container da tabela com rolagem */}
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 sticky top-0 z-10">
                    <th className="p-2.5 text-center w-10">Aplicar</th>
                    <th className="p-2.5">Código / Produto</th>
                    <th className="p-2.5">Categoria</th>
                    <th className="p-2.5 text-right">Custo Atual</th>
                    <th className="p-2.5 text-right">Preço Atual</th>
                    <th className="p-2.5 text-right font-black text-orange-600">Novo Preço</th>
                    <th className="p-2.5 text-right">Diferença</th>
                    <th className="p-2.5 text-right">Nova Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium">
                  {visiblePreviewItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Nenhum produto encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    visiblePreviewItems.map((item) => {
                      const isExcluded = excludedProductIds.has(item.product.id);
                      return (
                        <tr 
                          key={item.product.id}
                          className={`hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition ${
                            isExcluded ? "opacity-40 bg-slate-50/50" : ""
                          }`}
                        >
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!isExcluded && item.isChanged}
                              disabled={!item.isChanged}
                              onChange={() => toggleExcludeProduct(item.product.id)}
                              className="rounded cursor-pointer accent-orange-500"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-slate-800 dark:text-zinc-200">
                              {item.product.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {item.product.code || item.product.id}
                              {!item.hasCostPrice && (
                                <span className="ml-1 text-amber-500 font-semibold">(sem custo)</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-500 dark:text-zinc-400">
                            {item.product.category || "Geral"}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600 dark:text-zinc-400">
                            {item.originalCostPrice.toLocaleString()} {currency}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-500 line-through">
                            {item.originalSalePrice.toLocaleString()} {currency}
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-orange-600 dark:text-orange-400">
                            {item.newSalePrice.toLocaleString()} {currency}
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                              item.priceDifference > 0 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : item.priceDifference < 0
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                : "text-slate-400"
                            }`}>
                              {item.priceDifference > 0 ? "+" : ""}
                              {item.priceDifference.toLocaleString()} {currency}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-700 dark:text-zinc-300">
                            {item.newMarginPercent.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>
              {finalProductsToUpdate.length} produto(s) serão atualizados no sistema.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isSubmitting || finalProductsToUpdate.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>A gravar reajuste...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Aplicar Reajuste a {finalProductsToUpdate.length} Produtos</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
