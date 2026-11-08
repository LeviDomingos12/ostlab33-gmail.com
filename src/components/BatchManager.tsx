import React, { useState, useMemo } from "react";
import { 
  Search, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Info
} from "lucide-react";
import { Product, SystemSettings, ProductBatch } from "../types";

interface BatchManagerProps {
  products: Product[];
  settings?: SystemSettings;
  onUpdateSettings?: (settings: Partial<SystemSettings>) => void;
  onUpdateProduct: (p: Product) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  currency: string;
}

export default function BatchManager({
  products,
  settings,
  onUpdateSettings,
  onUpdateProduct,
  onAddAuditLog,
  onShowToast,
  currency
}: BatchManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "EXPIRED" | "CRITICAL" | "SAFE">("ALL");
  
  // Row inline editing state
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editExpiryDate, setEditExpiryDate] = useState<string>("");

  const batches = useMemo(() => {
    return settings?.batches || [];
  }, [settings?.batches]);

  // Expiry Calculations & Filter
  const processedBatches = useMemo(() => {
    const today = new Date();
    
    return batches.map((batch) => {
      const expiry = new Date(batch.expiryDate);
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      let status: "EXPIRED" | "CRITICAL" | "SAFE" | "NORMAL" = "NORMAL";
      if (daysLeft < 0) {
        status = "EXPIRED";
      } else if (daysLeft <= 30) {
        status = "CRITICAL";
      } else if (daysLeft > 90) {
        status = "SAFE";
      }

      return {
        ...batch,
        daysLeft,
        status
      };
    });
  }, [batches]);

  // Apply filters & Search
  const filteredBatches = useMemo(() => {
    return processedBatches.filter((batch) => {
      // 1. Search filter (product name or batch code)
      const matchesSearch = 
        batch.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batch.batchCode.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Status filter
      let matchesStatus = true;
      if (statusFilter === "EXPIRED") {
        matchesStatus = batch.status === "EXPIRED";
      } else if (statusFilter === "CRITICAL") {
        matchesStatus = batch.status === "CRITICAL";
      } else if (statusFilter === "SAFE") {
        matchesStatus = batch.status === "SAFE";
      }

      return matchesSearch && matchesStatus;
    });
  }, [processedBatches, searchTerm, statusFilter]);

  // Start Inline Editing
  const startEdit = (batch: ProductBatch) => {
    setEditingBatchId(batch.id);
    setEditQty(batch.quantity);
    setEditExpiryDate(batch.expiryDate);
  };

  // Cancel Inline Editing
  const cancelEdit = () => {
    setEditingBatchId(null);
  };

  // Save Inline Edits
  const saveEdit = (batchId: string) => {
    const originalBatch = batches.find(b => b.id === batchId);
    if (!originalBatch) return;

    if (editQty < 0) {
      if (onShowToast) onShowToast("A quantidade do lote não pode ser negativa.", "error");
      return;
    }

    if (!editExpiryDate) {
      if (onShowToast) onShowToast("A data de validade é obrigatória.", "error");
      return;
    }

    const qtyDiff = editQty - originalBatch.quantity;
    const correspondingProduct = products.find(p => p.id === originalBatch.productId);

    // 1. Update the batch list
    const updatedBatches = batches.map((b) => {
      if (b.id === batchId) {
        return {
          ...b,
          quantity: editQty,
          expiryDate: editExpiryDate
        };
      }
      return b;
    });

    if (onUpdateSettings) {
      onUpdateSettings({ batches: updatedBatches });
    }

    // 2. Sync the corresponding product stock
    if (correspondingProduct) {
      const updatedStock = Math.max(0, correspondingProduct.stock + qtyDiff);
      onUpdateProduct({
        ...correspondingProduct,
        stock: updatedStock
      });

      onAddAuditLog(
        "Atualizar Lote Manual",
        "STOCK",
        `Lote ${originalBatch.batchCode} de ${originalBatch.productName} editado manualmente. Qtd alterada de ${originalBatch.quantity} para ${editQty} (dif: ${qtyDiff >= 0 ? "+" : ""}${qtyDiff}, stock do produto ajustado para ${updatedStock}). Validade alterada de ${originalBatch.expiryDate} para ${editExpiryDate}.`
      );
    } else {
      onAddAuditLog(
        "Atualizar Lote Manual",
        "STOCK",
        `Lote ${originalBatch.batchCode} de ${originalBatch.productName} editado manualmente. Qtd alterada de ${originalBatch.quantity} para ${editQty}. Validade alterada de ${originalBatch.expiryDate} para ${editExpiryDate}.`
      );
    }

    if (onShowToast) {
      onShowToast(`Lote ${originalBatch.batchCode} atualizado com sucesso e estoque sincronizado!`, "success");
    }

    setEditingBatchId(null);
  };

  // Remove Batch
  const deleteBatch = (batch: ProductBatch) => {
    const updatedBatches = batches.filter(b => b.id !== batch.id);
    const correspondingProduct = products.find(p => p.id === batch.productId);

    if (onUpdateSettings) {
      onUpdateSettings({ batches: updatedBatches });
    }

    if (correspondingProduct) {
      const updatedStock = Math.max(0, correspondingProduct.stock - batch.quantity);
      onUpdateProduct({
        ...correspondingProduct,
        stock: updatedStock
      });

      onAddAuditLog(
        "Remover Lote Manual",
        "STOCK",
        `Lote ${batch.batchCode} de ${batch.productName} removido do inventário. Estoque do produto deduzido em ${batch.quantity} un (novo estoque: ${updatedStock}).`
      );
    } else {
      onAddAuditLog(
        "Remover Lote Manual",
        "STOCK",
        `Lote ${batch.batchCode} de ${batch.productName} removido do inventário.`
      );
    }

    if (onShowToast) {
      onShowToast(`Lote ${batch.batchCode} removido e estoque sincronizado com sucesso.`, "info");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por lote ou produto..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-200"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/10"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
            }`}
          >
            Todos ({processedBatches.length})
          </button>
          <button
            onClick={() => setStatusFilter("EXPIRED")}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
              statusFilter === "EXPIRED"
                ? "bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10"
                : "bg-red-50 text-red-700 border-red-100 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-950"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Expirados ({processedBatches.filter(b => b.status === "EXPIRED").length})
          </button>
          <button
            onClick={() => setStatusFilter("CRITICAL")}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
              statusFilter === "CRITICAL"
                ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10"
                : "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-950"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Críticos &lt; 30d ({processedBatches.filter(b => b.status === "CRITICAL").length})
          </button>
          <button
            onClick={() => setStatusFilter("SAFE")}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
              statusFilter === "SAFE"
                ? "bg-green-600 text-white border-green-600 shadow-md shadow-green-600/10"
                : "bg-green-50 text-green-700 border-green-100 hover:bg-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-950"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Seguros &gt; 90d ({processedBatches.filter(b => b.status === "SAFE").length})
          </button>
        </div>
      </div>

      {/* Batches Table List */}
      <div className="overflow-x-auto border border-slate-100 rounded-2xl dark:border-zinc-800">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase text-slate-400 dark:border-zinc-800 dark:bg-zinc-900/40">
              <th className="py-3 px-4">Produto</th>
              <th className="py-3 px-4">Lote</th>
              <th className="py-3 px-4 text-center">Quantidade Ativa</th>
              <th className="py-3 px-4 text-center">Data de Validade</th>
              <th className="py-3 px-4 text-center">Estado / Prazo</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs font-medium text-slate-600 dark:divide-zinc-800/50">
            {filteredBatches.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                  Nenhum lote correspondente encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch) => {
                const isEditing = editingBatchId === batch.id;
                
                // Expiry Visuals
                let badgeBg = "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
                let badgeText = `${batch.daysLeft} dias`;
                let dotColor = "bg-slate-400";

                if (batch.status === "EXPIRED") {
                  badgeBg = "bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
                  badgeText = "VENCIDO / EXPIRADO";
                  dotColor = "bg-red-550 animate-pulse";
                } else if (batch.status === "CRITICAL") {
                  badgeBg = "bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900";
                  badgeText = `CRÍTICO: ${batch.daysLeft}d`;
                  dotColor = "bg-yellow-500";
                } else if (batch.status === "SAFE") {
                  badgeBg = "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900";
                  badgeText = `SEGURO: ${batch.daysLeft}d`;
                  dotColor = "bg-green-500";
                }

                return (
                  <tr key={batch.id} className={`hover:bg-slate-50/40 transition dark:hover:bg-zinc-850/20 ${isEditing ? "bg-orange-50/10 dark:bg-orange-950/5" : ""}`}>
                    {/* Product Name */}
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-extrabold text-slate-800 dark:text-zinc-200">{batch.productName}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {batch.productId.slice(0, 8)}...</p>
                      </div>
                    </td>

                    {/* Batch Code */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-500 dark:text-zinc-400">
                      {batch.batchCode}
                    </td>

                    {/* Active Quantity */}
                    <td className="py-3 px-4 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1.5 max-w-[100px] mx-auto">
                          <input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-200"
                            min="0"
                          />
                          <span className="text-[10px] text-slate-400">un</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-extrabold text-slate-800 dark:text-zinc-100">
                            {batch.quantity} <span className="text-slate-400 text-[10px] font-normal">/ {batch.initialQuantity} un</span>
                          </span>
                          <div className="w-12 bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
                            <div 
                              className={`h-full ${batch.quantity <= batch.initialQuantity * 0.15 ? "bg-red-500" : "bg-orange-500"}`} 
                              style={{ width: `${Math.min(100, (batch.quantity / batch.initialQuantity) * 100)}%` }} 
                            />
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Expiration Date */}
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editExpiryDate}
                          onChange={(e) => setEditExpiryDate(e.target.value)}
                          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-orange-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-200"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 text-slate-700 dark:text-zinc-300">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          <span>{new Date(batch.expiryDate).toLocaleDateString("pt-MZ", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                        </div>
                      )}
                    </td>

                    {/* State / Days Remaining */}
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-wide uppercase ${badgeBg}`}>
                        {badgeText}
                      </span>
                    </td>

                    {/* Quick Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(batch.id)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-1.5 rounded-xl transition cursor-pointer border border-emerald-200/50"
                            title="Salvar alterações"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-500 p-1.5 rounded-xl transition cursor-pointer border border-slate-200/50"
                            title="Cancelar edição"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(batch)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-600 p-1.5 rounded-xl transition cursor-pointer border border-slate-200/50 inline-flex items-center gap-1"
                            title="Editar lote manualmente"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-[10px] font-bold">Editar</span>
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Deseja realmente excluir o lote ${batch.batchCode}? O estoque do produto correspondente será reduzido.`)) {
                                deleteBatch(batch);
                              }
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded-xl transition cursor-pointer border border-red-200/50 inline-flex items-center"
                            title="Excluir este lote"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3.5 bg-amber-50/40 rounded-2xl border border-amber-200/50 flex items-start gap-2.5 text-amber-850 text-[11px] leading-relaxed dark:bg-zinc-900/40 dark:border-amber-950/35 dark:text-amber-400">
        <Info className="w-4 h-4 shrink-0 text-amber-600" />
        <p>
          <strong>Sincronização Ativa de Estoque:</strong> Ao editar a quantidade de um lote manualmente, a diferença em relação à quantidade anterior será automaticamente acrescida ou deduzida do estoque geral do produto no catálogo, garantindo precisão absoluta na contagem de estoques.
        </p>
      </div>
    </div>
  );
}
