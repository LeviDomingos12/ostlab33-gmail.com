import React, { memo, useCallback } from "react";
import { motion } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { Product } from "../../types";

export interface PosCartItem {
  product: Product;
  quantity: number;
  discount: number;
  vatRate?: number;
  observation?: string;
}

export interface PosCartItemRowProps {
  item: PosCartItem;
  currency: string;
  onIncrement: (product: Product) => void;
  onDecrement: (productId: string) => void;
  onDirectQuantityEdit: (productId: string, val: string) => void;
  onDeleteRow: (productId: string) => void;
}

export const PosCartItemRow = memo(function PosCartItemRow({
  item,
  currency,
  onIncrement,
  onDecrement,
  onDirectQuantityEdit,
  onDeleteRow,
}: PosCartItemRowProps) {
  const stockRemaining = Math.max(0, item.product.stock - item.quantity);
  const isInsufficient = item.quantity > item.product.stock;

  const handleDec = useCallback(() => {
    onDecrement(item.product.id);
  }, [onDecrement, item.product.id]);

  const handleInc = useCallback(() => {
    onIncrement(item.product);
  }, [onIncrement, item.product]);

  const handleDirectEdit = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onDirectQuantityEdit(item.product.id, e.target.value);
  }, [onDirectQuantityEdit, item.product.id]);

  const handleDelete = useCallback(() => {
    onDeleteRow(item.product.id);
  }, [onDeleteRow, item.product.id]);

  return (
    <motion.div 
      layout
      layoutId={`cart-item-${item.product.id}`}
      initial={{ opacity: 0, y: -12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -30, scale: 0.9, height: 0, marginBottom: 0, paddingBottom: 0, paddingTop: 0, overflow: "hidden" }}
      transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
        isInsufficient 
          ? "bg-red-50/70 border-red-200" 
          : "bg-slate-50/60 border-slate-150 hover:border-slate-300"
      }`}
    >
      <div className="flex-1 min-w-0 pr-1">
        <h5 className="text-xs font-bold text-slate-800 truncate leading-snug">{item.product.name}</h5>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-slate-500 font-mono">
            {item.product.salePrice.toLocaleString()} {currency}/un
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
            stockRemaining === 0 
              ? "bg-amber-100 text-amber-800 border-amber-300" 
              : "bg-emerald-50 text-emerald-700 border-emerald-150"
          }`}>
            {stockRemaining === 0 ? "Stock esgotado no carrinho" : `Resta: ${stockRemaining} un`}
          </span>
        </div>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button 
          onClick={handleDec}
          className="w-7 h-7 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer transition active:scale-95"
          title="Diminuir quantidade (Restitui ao stock)"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        
        <input
          type="number"
          step={item.product.weightBased ? "0.05" : "1"}
          value={item.quantity}
          onChange={handleDirectEdit}
          className="w-10 h-7 bg-white border border-slate-200 text-center font-mono font-bold text-xs rounded-lg outline-none focus:border-orange-500"
        />

        <button 
          onClick={handleInc}
          disabled={item.quantity >= item.product.stock}
          title={item.quantity >= item.product.stock ? "Stock esgotado para este produto" : "Adicionar mais 1 un (Deduz do stock)"}
          className="w-7 h-7 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer transition disabled:opacity-40 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Item Total */}
      <div className="text-right shrink-0 min-w-[65px]">
        <span className="text-xs font-black text-slate-900 block font-mono">
          {(item.product.salePrice * item.quantity).toLocaleString()} {currency}
        </span>
        <button
          onClick={handleDelete}
          className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer transition mt-0.5"
          title="Remover produto e repor stock total"
        >
          Remover
        </button>
      </div>
    </motion.div>
  );
});
