import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Package, 
  Search, 
  Plus, 
  Minus, 
  Check, 
  AlertTriangle, 
  History, 
  Layers,
  Sparkles
} from "lucide-react";
import { Product } from "../types";

interface StockReplenishModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onUpdateProduct: (product: Product) => void;
  activeBranchId: string;
  onShowToast?: (message: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
  theme?: "night" | "light" | "cosmic";
}

interface ReplenishedItem {
  timestamp: string;
  productId: string;
  productName: string;
  addedQty: number;
  previousStock: number;
  newStock: number;
  note: string;
}

export default function StockReplenishModal({
  isOpen,
  onClose,
  products,
  onUpdateProduct,
  activeBranchId,
  onShowToast,
  theme = "light"
}: StockReplenishModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [replenishQty, setReplenishQty] = useState<number>(10);
  const [note, setNote] = useState("Compra de Fornecedor");
  const [customCostPrice, setCustomCostPrice] = useState<string>("");
  const [recentReplenishments, setRecentReplenishments] = useState<ReplenishedItem[]>([]);

  // Find currently selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.includes(q))
    ).slice(0, 5); // Limit to top 5 results for sleek UI
  }, [products, searchQuery]);

  // Handle quantity quick presets
  const applyPreset = (qty: number) => {
    setReplenishQty(prev => Math.max(1, prev + qty));
  };

  const isNight = theme === "night";

  // Perform replenishment
  const handleConfirmReplenish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      if (onShowToast) onShowToast("Por favor, selecione um produto.", "warning");
      return;
    }
    if (replenishQty <= 0) {
      if (onShowToast) onShowToast("A quantidade de reposição deve ser maior que zero.", "warning");
      return;
    }

    const previousStock = selectedProduct.stock;
    const addedQty = replenishQty;
    const newStock = previousStock + addedQty;

    // Update branch stocks if branchStocks structure exists
    const updatedBranchStocks = { ...(selectedProduct.branchStocks || {}) };
    const targetBranch = activeBranchId || "central";
    const currentBranchStock = updatedBranchStocks[targetBranch] || 0;
    updatedBranchStocks[targetBranch] = currentBranchStock + addedQty;

    // Build the updated product
    const updatedProduct: Product = {
      ...selectedProduct,
      stock: newStock,
      branchStocks: updatedBranchStocks
    };

    // If custom cost price is defined, update it
    if (customCostPrice.trim()) {
      const parsedCost = parseFloat(customCostPrice);
      if (!isNaN(parsedCost) && parsedCost > 0) {
        updatedProduct.costPrice = parsedCost;
      }
    }

    // Call central hook update
    onUpdateProduct(updatedProduct);

    // Save to session history
    const newItem: ReplenishedItem = {
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      addedQty,
      previousStock,
      newStock,
      note: note || "Reposição rápida"
    };

    setRecentReplenishments(prev => [newItem, ...prev]);

    if (onShowToast) {
      onShowToast(
        `Reposição concluída com sucesso! Novo estoque: ${newStock} un.`,
        "success",
        selectedProduct.name
      );
    }

    // Reset inputs but keep selected product for potential consecutive additions
    setReplenishQty(10);
    setCustomCostPrice("");
    setSearchQuery("");
  };

  // Undo the last action
  const handleUndoReplenishment = (item: ReplenishedItem) => {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      if (onShowToast) onShowToast("Produto correspondente não encontrado para desfazer.", "error");
      return;
    }

    // Reverse the stock addition
    const targetBranch = activeBranchId || "central";
    const updatedBranchStocks = { ...(product.branchStocks || {}) };
    if (updatedBranchStocks[targetBranch] !== undefined) {
      updatedBranchStocks[targetBranch] = Math.max(0, (updatedBranchStocks[targetBranch] || 0) - item.addedQty);
    }

    const reversedProduct: Product = {
      ...product,
      stock: Math.max(0, product.stock - item.addedQty),
      branchStocks: updatedBranchStocks
    };

    onUpdateProduct(reversedProduct);

    // Remove from recent list
    setRecentReplenishments(prev => prev.filter(r => r !== item));

    if (onShowToast) {
      onShowToast(
        `Reposição desfeita! Estoque de ${product.name} revertido para ${reversedProduct.stock} un.`,
        "info",
        "Ação Desfeita"
      );
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[999] p-4 font-sans text-slate-800">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
            isNight 
              ? "bg-zinc-950 border-zinc-800 text-slate-200" 
              : "bg-white border-slate-100 text-slate-800"
          }`}
          id="stock-replenish-modal"
        >
          {/* Header */}
          <div className={`p-6 border-b flex items-center justify-between ${
            isNight ? "border-zinc-800 bg-zinc-900/40" : "border-slate-100 bg-orange-50/20"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md ${
                isNight ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "bg-orange-500 text-white shadow-orange-500/20"
              }`}>
                <Package className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
                  Reposição Rápida de Stock
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 uppercase tracking-widest font-black animate-pulse">
                    Ctrl + S
                  </span>
                </h3>
                <p className={`text-[11px] font-medium ${isNight ? "text-zinc-400" : "text-slate-500"}`}>
                  Atualize o inventário de qualquer produto instantaneamente de forma global.
                </p>
              </div>
            </div>
            <button
              type="button"
              id="close-replenish-modal-btn"
              onClick={onClose}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer text-xs font-bold font-mono ${
                isNight 
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800" 
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Fechar (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Main Grid Content */}
          <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
            {/* Left Column: Form & Search */}
            <div className="md:col-span-7 flex flex-col gap-4 text-left">
              {/* Product Search Input */}
              <div className="relative">
                <label className={`text-xs font-black uppercase tracking-wider block mb-1.5 ${
                  isNight ? "text-zinc-400" : "text-slate-500"
                }`}>
                  Pesquisar Artigo ou Código
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="replenish-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Escreva nome, código, marca..."
                    className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-xs outline-none font-medium transition-all ${
                      isNight 
                        ? "bg-zinc-900 border-zinc-800 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                        : "bg-slate-50 border-slate-200 text-slate-850 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    }`}
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-3 text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* Dropdown search results */}
                <AnimatePresence>
                  {filteredProducts.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className={`absolute left-0 right-0 mt-1.5 rounded-2xl border shadow-xl z-50 overflow-hidden divide-y ${
                        isNight 
                          ? "bg-zinc-900 border-zinc-800 divide-zinc-800 text-slate-200" 
                          : "bg-white border-slate-200 divide-slate-100 text-slate-800"
                      }`}
                    >
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          id={`search-result-prod-${p.id}`}
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setSearchQuery("");
                          }}
                          className={`w-full text-left p-3 flex items-center justify-between text-xs transition cursor-pointer hover:bg-orange-500 hover:text-white group`}
                        >
                          <div className="flex flex-col">
                            <span className="font-extrabold line-clamp-1">{p.name}</span>
                            <span className="text-[10px] opacity-75 font-mono">Cód: {p.code} | {p.brand || "Genérico"}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10px] font-bold">
                            <span className="opacity-80">Stock: {p.stock}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[9px] group-hover:bg-orange-600 group-hover:text-white">
                              {p.salePrice.toLocaleString()} MT
                            </span>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {selectedProduct ? (
                <form onSubmit={handleConfirmReplenish} className="space-y-4">
                  {/* Selected Product Summary Card */}
                  <div className={`p-4 rounded-2xl border flex items-start gap-3.5 relative overflow-hidden ${
                    isNight 
                      ? "bg-zinc-900/40 border-zinc-800" 
                      : "bg-slate-50/50 border-slate-150"
                  }`}>
                    <div className="text-3xl select-none pt-1 shrink-0">
                      {selectedProduct.emoji || "📦"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[8.5px] font-black uppercase tracking-widest font-mono ${
                        isNight ? "text-zinc-500" : "text-slate-400"
                      }`}>
                        {selectedProduct.code} · {selectedProduct.brand || "Marca Geral"}
                      </span>
                      <h4 className="font-extrabold text-xs text-slate-850 dark:text-slate-100 truncate mt-0.5 leading-snug">
                        {selectedProduct.name}
                      </h4>
                      <div className="flex items-center gap-4 mt-2 font-mono text-[10.5px]">
                        <div>
                          <span className={`block text-[9px] font-bold uppercase ${isNight ? "text-zinc-500" : "text-slate-400"}`}>Stock Atual</span>
                          <span className={`font-black ${selectedProduct.stock <= (selectedProduct.minStock || 0) ? "text-red-500 animate-pulse font-extrabold" : "text-slate-700 dark:text-slate-300"}`}>
                            {selectedProduct.stock} un
                          </span>
                        </div>
                        <div className="border-l pl-4 border-slate-200 dark:border-zinc-800">
                          <span className={`block text-[9px] font-bold uppercase ${isNight ? "text-zinc-500" : "text-slate-400"}`}>Estoque Crítico</span>
                          <span className="font-bold text-slate-500 dark:text-slate-400">
                            {selectedProduct.minStock || 0} un
                          </span>
                        </div>
                        <div className="border-l pl-4 border-slate-200 dark:border-zinc-800">
                          <span className={`block text-[9px] font-bold uppercase ${isNight ? "text-zinc-500" : "text-slate-400"}`}>Preço Venda</span>
                          <span className="font-extrabold text-orange-600 dark:text-orange-400">
                            {selectedProduct.salePrice.toLocaleString()} MT
                          </span>
                        </div>
                      </div>

                      {/* Warning indicator if stock is currently low */}
                      {selectedProduct.stock <= (selectedProduct.minStock || 0) && (
                        <div className="flex items-center gap-1.5 mt-2.5 text-[9.5px] font-black text-red-500 bg-red-500/10 border border-red-500/15 py-1 px-2.5 rounded-lg w-fit">
                          <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                          <span>STOCK EM ALERTA CRÍTICO! REPOSIÇÃO URGENTE</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quantity Input with adjustment buttons */}
                  <div>
                    <label className={`text-xs font-black uppercase tracking-wider block mb-1.5 ${
                      isNight ? "text-zinc-400" : "text-slate-500"
                    }`}>
                      Quantidade a Adicionar
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        id="replenish-qty-dec"
                        onClick={() => setReplenishQty(prev => Math.max(1, prev - 1))}
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold text-base transition active:scale-95 cursor-pointer ${
                          isNight 
                            ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-white" 
                            : "bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        id="replenish-qty-input"
                        value={replenishQty}
                        onChange={(e) => setReplenishQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className={`w-24 h-11 text-center font-mono font-black text-sm rounded-xl border outline-none ${
                          isNight 
                            ? "bg-zinc-900 border-zinc-800 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                            : "bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        }`}
                      />
                      <button
                        type="button"
                        id="replenish-qty-inc"
                        onClick={() => setReplenishQty(prev => prev + 1)}
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold text-base transition active:scale-95 cursor-pointer ${
                          isNight 
                            ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-white" 
                            : "bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      {/* Quick preset buttons */}
                      <div className="flex gap-1.5 ml-2">
                        {[5, 10, 50, 100].map(val => (
                          <button
                            key={val}
                            type="button"
                            id={`replenish-preset-${val}`}
                            onClick={() => applyPreset(val)}
                            className={`px-2.5 h-8 text-[10.5px] font-black rounded-lg transition active:scale-95 cursor-pointer border ${
                              isNight 
                                ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-orange-400" 
                                : "bg-orange-50 border-orange-100 hover:bg-orange-100 text-orange-600"
                            }`}
                          >
                            +{val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Advanced settings: Custom Cost Price & Reason/Note */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className={`text-xs font-black uppercase tracking-wider block mb-1.5 ${
                        isNight ? "text-zinc-400" : "text-slate-500"
                      }`}>
                        Novo Preço Custo (Opcional)
                      </label>
                      <input
                        type="number"
                        id="replenish-cost-price"
                        value={customCostPrice}
                        onChange={(e) => setCustomCostPrice(e.target.value)}
                        placeholder={`Custo Atual: ${selectedProduct.costPrice} MT`}
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs outline-none font-mono transition-all ${
                          isNight 
                            ? "bg-zinc-900 border-zinc-800 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                            : "bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`text-xs font-black uppercase tracking-wider block mb-1.5 ${
                        isNight ? "text-zinc-400" : "text-slate-500"
                      }`}>
                        Motivo / Justificação
                      </label>
                      <select
                        id="replenish-reason-select"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs outline-none font-bold text-slate-700 cursor-pointer ${
                          isNight 
                            ? "bg-zinc-900 border-zinc-800 text-slate-300 focus:border-orange-500" 
                            : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-orange-500"
                        }`}
                      >
                        <option value="Compra de Fornecedor">📦 Compra de Fornecedor</option>
                        <option value="Ajuste de Inventário">⚖️ Ajuste de Inventário</option>
                        <option value="Retorno de Artigo">🔄 Retorno de Cliente</option>
                        <option value="Produção Própria">🏗️ Produção Interna</option>
                        <option value="Doação ou Brinde">🎁 Oferta / Amostra</option>
                      </select>
                    </div>
                  </div>

                  {/* Calculations breakdown info card */}
                  <div className={`p-3.5 rounded-2xl border text-[11px] leading-relaxed ${
                    isNight ? "bg-zinc-900/30 border-zinc-800/80 text-zinc-400" : "bg-orange-50/10 border-orange-100/50 text-slate-650"
                  }`}>
                    <div className="flex justify-between items-center py-1">
                      <span>Quantidade a Adicionar:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">+{replenishQty} un</strong>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 dark:border-zinc-800">
                      <span>Projeção Novo Stock Total:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {selectedProduct.stock + replenishQty} un
                      </strong>
                    </div>
                    {customCostPrice.trim() && (
                      <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 dark:border-zinc-800">
                        <span>Atualizar Preço de Custo para:</span>
                        <strong className="text-orange-500 font-mono">
                          {parseFloat(customCostPrice).toLocaleString()} MT
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      id="replenish-cancel-btn"
                      onClick={() => setSelectedProductId("")}
                      className={`flex-1 py-3 px-4 rounded-xl border font-extrabold text-xs transition cursor-pointer active:scale-98 ${
                        isNight 
                          ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white" 
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                      }`}
                    >
                      Trocar Artigo
                    </button>
                    <button
                      type="submit"
                      id="replenish-submit-btn"
                      className="flex-2 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-orange-500/10 transition cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Confirmar Reposição</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* No selected product state */
                <div className={`p-8 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center py-16 ${
                  isNight ? "border-zinc-800 bg-zinc-900/10" : "border-slate-200 bg-slate-50/30"
                }`}>
                  <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-full flex items-center justify-center mb-3">
                    <Layers className="w-6 h-6 animate-pulse" />
                  </div>
                  <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">Pesquise e Selecione um Produto</h4>
                  <p className={`text-[10.5px] max-w-xs mt-1 ${isNight ? "text-zinc-500" : "text-slate-400"}`}>
                    Use a caixa de pesquisa acima para encontrar rapidamente o produto que deseja reabastecer por nome, código ou marca.
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Recent Replenishment List in Session */}
            <div className={`md:col-span-5 flex flex-col gap-4 border-l pl-6 ${
              isNight ? "border-zinc-800" : "border-slate-100"
            }`}>
              <div className="flex items-center justify-between">
                <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  isNight ? "text-zinc-400" : "text-slate-500"
                }`}>
                  <History className="w-3.5 h-3.5" />
                  <span>Histórico da Sessão</span>
                </h4>
                {recentReplenishments.length > 0 && (
                  <span className="text-[9px] font-bold text-slate-400 font-mono">
                    {recentReplenishments.length} ações
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] space-y-2.5 pr-1">
                {recentReplenishments.length === 0 ? (
                  <div className={`p-6 rounded-2xl border border-dashed text-center py-12 flex flex-col items-center justify-center ${
                    isNight ? "border-zinc-800 bg-zinc-900/5" : "border-slate-250 bg-slate-50/20"
                  }`}>
                    <Sparkles className="w-5 h-5 text-slate-350 mb-2" />
                    <p className={`text-[10px] font-bold ${isNight ? "text-zinc-500" : "text-slate-400"}`}>
                      Sem reposições registadas
                    </p>
                    <p className={`text-[9px] max-w-[150px] mt-0.5 ${isNight ? "text-zinc-600" : "text-slate-400"}`}>
                      As atualizações de stock feitas nesta sessão aparecerão listadas aqui.
                    </p>
                  </div>
                ) : (
                  recentReplenishments.map(item => (
                    <div 
                      key={item.timestamp + item.productId}
                      className={`p-3 rounded-xl border flex flex-col gap-1.5 text-left transition relative group ${
                        isNight 
                          ? "bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/60" 
                          : "bg-white border-slate-150 hover:bg-slate-50/50 hover:border-slate-200 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <h5 className="font-extrabold text-[11px] text-slate-800 dark:text-slate-200 line-clamp-1 pr-6 leading-tight">
                            {item.productName}
                          </h5>
                          <span className={`text-[8.5px] font-mono font-bold block ${isNight ? "text-zinc-500" : "text-slate-400"}`}>
                            Hora: {item.timestamp} | Motivo: {item.note}
                          </span>
                        </div>

                        {/* Undo button visible on hover/regular */}
                        <button
                          type="button"
                          id={`undo-replenish-${item.productId}-${item.timestamp}`}
                          onClick={() => handleUndoReplenishment(item)}
                          className={`absolute right-2.5 top-2.5 text-[8.5px] font-black text-red-500 hover:text-red-700 bg-red-500/10 border border-red-500/20 rounded-md py-0.5 px-2 transition cursor-pointer opacity-80 group-hover:opacity-100`}
                          title="Desfazer reposição de estoque"
                        >
                          Desfazer
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60 text-center text-[10px] font-mono font-bold">
                        <div className="bg-slate-50 dark:bg-zinc-900/60 p-1 rounded-md border border-slate-100 dark:border-zinc-800/40">
                          <span className="text-[8px] text-slate-400 block font-sans">Adicionado</span>
                          <span className="text-emerald-600 font-extrabold">+{item.addedQty} un</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-zinc-900/60 p-1 rounded-md border border-slate-100 dark:border-zinc-800/40">
                          <span className="text-[8px] text-slate-400 block font-sans">Novo Stock</span>
                          <span className="text-slate-700 dark:text-slate-300 font-black">{item.newStock} un</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer with keyboard hint */}
          <div className={`p-4 border-t text-center text-[10px] flex items-center justify-between ${
            isNight ? "border-zinc-800 bg-zinc-950 text-zinc-500" : "bg-slate-50 border-slate-100 text-slate-400"
          }`}>
            <span className="font-medium text-left">
              * Atualiza diretamente o stock no inventário e sincroniza com o servidor central.
            </span>
            <div className="flex items-center gap-1.5 font-bold font-mono">
              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-400">Ctrl + S</span>
              <span>Abrir/Fechar</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
