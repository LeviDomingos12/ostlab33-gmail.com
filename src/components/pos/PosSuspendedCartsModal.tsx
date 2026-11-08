import React from "react";
import { Clock, Play, Trash2, X, ShoppingCart } from "lucide-react";
import { SuspendedCartRecord } from "./posTypes";

interface PosSuspendedCartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suspendedCarts: SuspendedCartRecord[];
  onResumeCart: (cart: SuspendedCartRecord) => void;
  onDeleteCart: (cartId: string) => void;
  currency: string;
}

export const PosSuspendedCartsModal: React.FC<PosSuspendedCartsModalProps> = ({
  isOpen,
  onClose,
  suspendedCarts,
  onResumeCart,
  onDeleteCart,
  currency
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">Carrinhos de Venda Suspensos</h3>
            <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold">
              {suspendedCarts.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto divide-y divide-slate-100">
          {suspendedCarts.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Não existem vendas em espera no momento.</p>
              <p className="text-xs text-slate-500 mt-1">Pressione F8 no POS para suspender o carrinho atual.</p>
            </div>
          ) : (
            suspendedCarts.map((cart) => {
              const totalItems = cart.items.reduce((acc, it) => acc + it.quantity, 0);
              return (
                <div
                  key={cart.id}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 p-2 rounded-xl transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">
                        {cart.customer ? cart.customer.name : "Consumidor Geral"}
                      </span>
                      {cart.note && (
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                          {cart.note}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{new Date(cart.savedAt).toLocaleTimeString("pt-MZ")}</span>
                      <span>•</span>
                      <span>{totalItems} {totalItems === 1 ? "artigo" : "artigos"}</span>
                      <span>•</span>
                      <span className="font-bold text-orange-600">
                        {cart.total.toLocaleString("pt-MZ")} {currency}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDeleteCart(cart.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Eliminar este carrinho"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onResumeCart(cart)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Retomar Venda
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
