import React, { useState } from "react";
import { ArrowLeftRight, CheckCircle2, Calendar } from "lucide-react";
import { Product, SystemSettings, StockTransfer } from "../../types";
import { generateEntityId } from "../../lib/deterministic";

interface StockTransfersTabProps {
  products: Product[];
  settings?: SystemSettings;
  onUpdateSettings?: (s: Partial<SystemSettings>) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  activeUsername?: string;
}

export const StockTransfersTab: React.FC<StockTransfersTabProps> = ({
  products,
  settings,
  onUpdateSettings,
  onAddAuditLog,
  onShowToast,
  activeUsername
}) => {
  const branches = settings?.branches && settings.branches.length > 0 ? settings.branches : [
    { id: "central", name: settings?.companyName || "Loja Principal / Sede", address: settings?.storeAddress || settings?.companyAddress || "Indisponível" },
    { id: "filial", name: "Filial", address: "Indisponível" }
  ];

  const [originBranchId, setOriginBranchId] = useState(branches[0]?.id || "central");
  const [destBranchId, setDestBranchId] = useState(branches[1]?.id || "filial_matola");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const existingTransfers: StockTransfer[] = settings?.stockTransfers || [];

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (originBranchId === destBranchId) {
      if (onShowToast) onShowToast("A filial de origem e destino não podem ser iguais.", "error");
      return;
    }

    const selectedProduct = products.find(p => p.id === productId);
    if (!selectedProduct) {
      if (onShowToast) onShowToast("Selecione um artigo válido.", "error");
      return;
    }

    if (quantity <= 0) {
      if (onShowToast) onShowToast("A quantidade transferida deve ser superior a zero.", "warning");
      return;
    }

    const originName = branches.find(b => b.id === originBranchId)?.name || originBranchId;
    const destName = branches.find(b => b.id === destBranchId)?.name || destBranchId;

    const newTransfer: StockTransfer = {
      id: generateEntityId("st"),
      originBranchId,
      destinationBranchId: destBranchId,
      productId,
      productName: selectedProduct.name,
      quantity,
      timestamp: new Date().toISOString(),
      status: "COMPLETED",
      responsibleUser: activeUsername || "Operador"
    };

    const updatedTransfers = [newTransfer, ...existingTransfers];
    if (onUpdateSettings) {
      onUpdateSettings({ stockTransfers: updatedTransfers });
    }

    onAddAuditLog(
      "Transferência de Stock",
      "STOCK",
      `Transferência de ${quantity} un. de ${selectedProduct.name} de "${originName}" para "${destName}".`
    );

    setQuantity(1);
    setNotes("");
    if (onShowToast) onShowToast(`Transferência de ${quantity} un. de ${selectedProduct.name} concluída com sucesso!`, "success");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="w-5 h-5 text-orange-600" />
          <h3 className="font-bold text-base text-slate-800">Nova Guia de Transferência Entre Filiais</h3>
        </div>

        <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Filial de Origem</label>
            <select
              value={originBranchId}
              onChange={(e) => setOriginBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Filial de Destino</label>
            <select
              value={destBranchId}
              onChange={(e) => setDestBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Artigo a Transferir</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Quantidade</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Observações da Guia (Opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Reforço de stock para promoção de fim de semana"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Emitir Transferência
            </button>
          </div>
        </form>
      </div>

      {/* Histórico de Transferências */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h4 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          Histórico de Movimentações entre Filiais
        </h4>

        {existingTransfers.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Nenhuma transferência registada até ao momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Artigo</th>
                  <th className="p-3">Origem</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3 text-right">Qtd</th>
                  <th className="p-3">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {existingTransfers.map((st) => {
                  const orig = branches.find(b => b.id === st.originBranchId)?.name || st.originBranchId;
                  const dest = branches.find(b => b.id === st.destinationBranchId)?.name || st.destinationBranchId;
                  return (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap">{new Date(st.timestamp).toLocaleString("pt-MZ")}</td>
                      <td className="p-3 font-bold text-slate-800">{st.productName}</td>
                      <td className="p-3">{orig}</td>
                      <td className="p-3">{dest}</td>
                      <td className="p-3 text-right font-bold text-orange-600">{st.quantity} un.</td>
                      <td className="p-3">{st.responsibleUser}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
