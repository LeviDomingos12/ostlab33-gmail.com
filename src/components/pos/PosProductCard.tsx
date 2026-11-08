import React, { memo, useCallback } from "react";
import { Barcode } from "lucide-react";
import { Product } from "../../types";

export interface PosProductCardProps {
  product: Product;
  inCartQty: number;
  currency: string;
  onAddToCart: (product: Product) => void;
}

export const PosProductCard = memo(function PosProductCard({
  product,
  inCartQty,
  currency,
  onAddToCart,
}: PosProductCardProps) {
  const liveRemainingStock = Math.max(0, product.stock - inCartQty);
  const isOutOfStock = product.stock <= 0;
  const isCartExhausted = liveRemainingStock <= 0 && product.stock > 0;
  const isLowStock = liveRemainingStock > 0 && liveRemainingStock <= product.minStock;
  const isDisabled = isOutOfStock || isCartExhausted;

  const handleClick = useCallback(() => {
    onAddToCart(product);
  }, [onAddToCart, product]);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      id={`btn-product-${product.id}`}
      className={`group bg-white p-3 rounded-xl border relative text-left transition-all flex flex-col justify-between select-none h-40 ${
        isDisabled 
          ? isCartExhausted
            ? "border-amber-300 bg-amber-50/40 cursor-not-allowed opacity-90"
            : "border-slate-200 bg-slate-100/70 cursor-not-allowed opacity-60" 
          : inCartQty > 0
            ? "border-blue-300 bg-blue-50/20 hover:border-blue-400 hover:shadow-xs cursor-pointer active:scale-[0.98]"
            : "border-slate-200 hover:border-blue-400 hover:shadow-xs cursor-pointer active:scale-[0.98]"
      }`}
    >
      {/* Status & Barcode badge */}
      <div className="flex items-start justify-between w-full">
        <div className="relative">
          <span className="text-2xl p-1 bg-slate-50 group-hover:bg-blue-50 rounded-lg transition inline-block">
            {product.emoji || "📦"}
          </span>
          {inCartQty > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-xs">
              {inCartQty}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isOutOfStock ? (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-red-100 text-red-700">ESGOTADO</span>
          ) : isCartExhausted ? (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-mono">
              0 disp. (🛒 {inCartQty})
            </span>
          ) : inCartQty > 0 ? (
            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
              <span>{liveRemainingStock} un disp.</span>
            </span>
          ) : isLowStock ? (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{liveRemainingStock} un</span>
          ) : (
            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{liveRemainingStock} un</span>
          )}
          {product.barcode && (
            <span className="text-[7.5px] font-mono text-slate-400 flex items-center gap-0.5">
              <Barcode className="w-2.5 h-2.5 text-slate-300" />
              {product.barcode.slice(-5)}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug">{product.name}</h4>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[9.5px] text-slate-400 font-mono">{product.category}</p>
          {inCartQty > 0 && (
            <span className="text-[9px] font-bold text-blue-600 font-mono">
              🛒 {inCartQty} {product.weightBased ? "kg" : "un"}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="mt-1 pt-1.5 border-t border-slate-100 flex items-center justify-between">
        <span className="text-sm font-black text-slate-900">
          {product.salePrice.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">{currency}</span>
        </span>
        {isOutOfStock ? (
          <span className="text-[9.5px] font-bold text-slate-400">Esgotado</span>
        ) : isCartExhausted ? (
          <span className="text-[9.5px] font-bold text-amber-700">Máx. no Carrinho</span>
        ) : (
          <span className="text-[10px] font-bold text-blue-600 group-hover:translate-x-0.5 transition">
            {inCartQty > 0 ? `+ Adicionar (${liveRemainingStock})` : "+ Adicionar"}
          </span>
        )}
      </div>
    </button>
  );
});
