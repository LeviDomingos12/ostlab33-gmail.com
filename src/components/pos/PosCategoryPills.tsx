import React, { memo } from "react";

export interface PosCategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  isMinimized?: boolean;
}

export const PosCategoryPills = memo(function PosCategoryPills({
  categories,
  selectedCategory,
  onSelectCategory,
  isMinimized = false,
}: PosCategoryPillsProps) {
  if (isMinimized) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onSelectCategory(cat)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-all ${
            selectedCategory === cat
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white hover:bg-slate-100 border border-slate-200 text-slate-600"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
});
