import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Trash2, HelpCircle, X } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info" | "success";
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}

interface ConfirmProviderProps {
  children: React.ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    if (resolveRef.current) {
      resolveRef.current(true);
    }
    setOptions(null);
  };

  const handleCancel = () => {
    if (resolveRef.current) {
      resolveRef.current(false);
    }
    setOptions(null);
  };

  // Keyboard navigation support: Esc to cancel, Enter to confirm
  useEffect(() => {
    if (!options) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [options]);

  const type = options?.type || "danger";
  const confirmText = options?.confirmText || "Confirmar";
  const cancelText = options?.cancelText || "Cancelar";

  // Accent colors based on type
  const getColors = () => {
    switch (type) {
      case "danger":
        return {
          iconBg: "bg-red-50 text-red-600 border border-red-100",
          buttonBg: "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-lg shadow-red-900/10",
          icon: <Trash2 className="w-5 h-5" />,
          focusRing: "focus:ring-red-500"
        };
      case "warning":
        return {
          iconBg: "bg-amber-50 text-amber-600 border border-amber-100",
          buttonBg: "bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-lg shadow-amber-900/10",
          icon: <AlertTriangle className="w-5 h-5" />,
          focusRing: "focus:ring-amber-500"
        };
      case "success":
        return {
          iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-100",
          buttonBg: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-850 text-white shadow-lg shadow-emerald-900/10",
          icon: <AlertTriangle className="w-5 h-5" />, // can use standard checked icon or same alert
          focusRing: "focus:ring-emerald-500"
        };
      default:
        return {
          iconBg: "bg-blue-50 text-blue-600 border border-blue-100",
          buttonBg: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg shadow-blue-900/10",
          icon: <HelpCircle className="w-5 h-5" />,
          focusRing: "focus:ring-blue-500"
        };
    }
  };

  const colors = getColors();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {options && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancel}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl p-6 font-sans flex flex-col gap-4 text-slate-800"
            >
              {/* Top Row: Icon & Title */}
              <div className="flex gap-4 items-start">
                <div className={`p-2.5 rounded-xl shrink-0 ${colors.iconBg}`}>
                  {colors.icon}
                </div>
                <div className="space-y-1.5 flex-1 pr-6">
                  <h3 className="text-sm font-extrabold text-slate-800 tracking-tight leading-none">
                    {options.title}
                  </h3>
                  <div className="text-[11.5px] text-slate-500 leading-relaxed font-semibold">
                    {options.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 font-bold rounded-xl text-xs transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={`px-4 py-2 font-extrabold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${colors.buttonBg} ${colors.focusRing}`}
                >
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
