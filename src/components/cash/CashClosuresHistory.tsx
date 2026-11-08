import React, { useState } from "react";
import { History, Download, Printer, Search } from "lucide-react";
import { CashClosure, SystemSettings } from "../../types";
import { exportSingleClosurePdf, printThermalSlip } from "./cashPdfService";

interface CashClosuresHistoryProps {
  closures: CashClosure[];
  currency: string;
  settings?: SystemSettings;
  onAuditLog?: (action: string, module: string, details: string) => void;
}

export const CashClosuresHistory: React.FC<CashClosuresHistoryProps> = ({
  closures,
  currency,
  settings,
  onAuditLog
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredClosures = closures.filter(c => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (c.id || "").toLowerCase().includes(q) ||
      (c.closedBy || c.openedBy || "").toLowerCase().includes(q) ||
      (c.closingSupervisor || c.openingSupervisor || "").toLowerCase().includes(q) ||
      (c.closingNotes || "").toLowerCase().includes(q)
    );
  });

  const handleExportPdf = (closure: CashClosure) => {
    exportSingleClosurePdf(closure, currency, settings);
    onAuditLog?.("Exportar Auto de Fecho PDF", "CAIXA", `Comprovativo de fecho ${closure.id} exportado em PDF.`);
  };

  const handlePrintSlip = (closure: CashClosure) => {
    printThermalSlip(closure, currency, settings);
    onAuditLog?.("Imprimir Talão Térmico Fecho", "CAIXA", `Talão de fecho ${closure.id} enviado para impressão.`);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div>
          <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-orange-500" />
            Histórico de Fechamentos de Caixa & Auditoria de Turnos
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Registos consolidados e imutáveis de turnos fechados, saldos teóricos vs. físicos e homologações
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por operador, ID ou supervisor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-zinc-800/80 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-zinc-800">
              <th className="p-3">Data / Hora Fecho</th>
              <th className="p-3">Operador Caixa</th>
              <th className="p-3">Supervisor Homologador</th>
              <th className="p-3 text-right">Saldo Teórico</th>
              <th className="p-3 text-right">Saldo Físico</th>
              <th className="p-3 text-center">Diferença (Desvio)</th>
              <th className="p-3">Observações</th>
              <th className="p-3 text-center">Comprovativos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {filteredClosures.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  Nenhum fechamento de turno localizado no histórico.
                </td>
              </tr>
            ) : (
              filteredClosures.map(c => {
                const diff = c.difference || 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(c.closedAt || c.openedAt || Date.now()).toLocaleString("pt-MZ")}
                    </td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {c.closedBy || c.openedBy || "Operador"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {c.closingSupervisor || c.openingSupervisor || "Supervisor"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {Number(c.theoreticalBalance || 0).toLocaleString()} {currency}
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                      {Number(c.physicalBalance || 0).toLocaleString()} {currency}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
                        diff === 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : diff > 0
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400"
                      }`}>
                        {diff > 0 ? "+" : ""}{diff.toLocaleString()} {currency}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 italic max-w-[200px] truncate">
                      {c.closingNotes || "Fechamento regular"}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleExportPdf(c)}
                          className="px-2 py-1 text-[10.5px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/40 rounded-lg flex items-center gap-1 transition cursor-pointer"
                          title="Baixar Auto de Fecho em PDF"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintSlip(c)}
                          className="px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-slate-300 rounded-lg flex items-center gap-1 transition cursor-pointer"
                          title="Imprimir Talão Térmico 80mm"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Talão</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
