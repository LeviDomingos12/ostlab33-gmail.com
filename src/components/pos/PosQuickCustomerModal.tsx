import React, { useState } from "react";
import { UserPlus, X, Phone, User } from "lucide-react";
import { Customer } from "../../types";
import { generateEntityId } from "../../lib/deterministic";

interface PosQuickCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
}

export const PosQuickCustomerModal: React.FC<PosQuickCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
  onShowToast
}) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nuit, setNuit] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      if (onShowToast) onShowToast("O nome do cliente é obrigatório.", "warning");
      return;
    }

    const newCust: Customer = {
      id: generateEntityId("cust"),
      name: name.trim(),
      phone: phone.trim() || "",
      email: "",
      address: "Indisponível",
      nuit: nuit.trim() || "",
      totalSpent: 0,
      purchaseCount: 0,
      debt: 0,
      loyaltyPoints: 0,
      preferredPaymentMethod: "CASH",
      oneClickCheckoutEnabled: false
    };

    onCustomerCreated(newCust);
    setName("");
    setPhone("");
    setNuit("");
    onClose();
    if (onShowToast) onShowToast(`Cliente ${newCust.name} registado com sucesso!`, "success");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-400" />
            <h3 className="font-bold text-base">Registo Rápido de Cliente</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nome Completo *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Machel"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all font-medium text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Telemóvel (M-Pesa / E-Mola)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="84/85/86/87 XXX XXXX"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all font-medium text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              NUIT (Opcional - Fatura Fiscal)
            </label>
            <input
              type="text"
              value={nuit}
              onChange={(e) => setNuit(e.target.value)}
              placeholder="Ex: 400123456"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all font-medium text-slate-800"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-lg shadow-orange-600/20 transition-all active:scale-95 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Salvar e Selecionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
