import React, { useState, useMemo } from "react";
import { 
  Search, 
  Calendar, 
  User, 
  FileSpreadsheet, 
  FileText,
  Info,
  X,
  ShieldCheck,
  Monitor
} from "lucide-react";

interface CashbookLedgerProps {
  entries: any[];
  startDate: string;
  endDate: string;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  currency: string;
  onExportPdf: () => void;
  onExportCsv: () => void;
}

export const CashbookLedger: React.FC<CashbookLedgerProps> = ({
  entries,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  currency,
  onExportPdf,
  onExportCsv
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("TODOS");
  const [selectedTerminal, setSelectedTerminal] = useState<string>("TODOS");
  const [selectedOperator, setSelectedOperator] = useState<string>("TODOS");
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  // Extract unique operators and terminals
  const availableOperators = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      if (e.responsibleUser) set.add(e.responsibleUser);
    });
    return Array.from(set);
  }, [entries]);

  const availableTerminals = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      if (e.registerId) set.add(e.registerId);
    });
    return Array.from(set);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter(item => {
      // Type Filter
      if (filterType !== "TODOS") {
        if (filterType === "VENDAS" && item.type !== "SALE" && item.type !== "DIGITAL_SALE") return false;
        if (filterType === "REFORCOS" && item.type !== "REINFORCEMENT") return false;
        if (filterType === "SANGRIAS" && item.type !== "SANGRIA" && !(item.reason || "").toLowerCase().includes("sangria")) return false;
        if (filterType === "DESPESAS" && item.type !== "EXPENSE") return false;
        if (filterType === "DEVOLUCOES" && item.type !== "DEVOLUTION" && !(item.reason || "").toLowerCase().includes("devolução")) return false;
        if (filterType === "QUEBRAS" && item.type !== "QUEBRA") return false;
        if (filterType === "SOBRAS" && item.type !== "SOBRA" && !(item.reason || "").toLowerCase().includes("sobra")) return false;
      }

      // Terminal Filter
      if (selectedTerminal !== "TODOS" && item.registerId && item.registerId !== selectedTerminal) {
        return false;
      }

      // Operator Filter
      if (selectedOperator !== "TODOS" && item.responsibleUser !== selectedOperator) {
        return false;
      }

      // Search Query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const reasonMatch = (item.reason || "").toLowerCase().includes(q);
        const userMatch = (item.responsibleUser || "").toLowerCase().includes(q);
        const suppMatch = (item.supplier || "").toLowerCase().includes(q);
        const amountMatch = (item.amount || 0).toString().includes(q);
        const idMatch = (item.id || "").toLowerCase().includes(q);
        const refMatch = (item.reference || "").toLowerCase().includes(q);
        const catMatch = (item.category || "").toLowerCase().includes(q);
        if (!reasonMatch && !userMatch && !suppMatch && !amountMatch && !idMatch && !refMatch && !catMatch) return false;
      }

      return true;
    });
  }, [entries, filterType, selectedTerminal, selectedOperator, searchQuery]);

  const filterChips = [
    { id: "TODOS", label: "Todos os Movimentos" },
    { id: "VENDAS", label: "Vendas Registadas" },
    { id: "REFORCOS", label: "Reforços / Trocos" },
    { id: "SANGRIAS", label: "Sangrias (Cofre)" },
    { id: "DESPESAS", label: "Despesas Caixa" },
    { id: "DEVOLUCOES", label: "Devoluções" },
    { id: "QUEBRAS", label: "Quebras" },
    { id: "SOBRAS", label: "Sobras" }
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-sm overflow-hidden space-y-4 p-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div>
          <span className="text-xs uppercase font-extrabold text-slate-800 dark:text-slate-200 tracking-wider">
            Livro de Caixa & Extrato Financeiro
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Registro cronológico contínuo de todas as entradas, saídas, suprimentos, sangrias e quebras/sobras
          </p>
        </div>

        {/* Date Filter & Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200"
            />
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="px-2.5 py-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Search & Secondary Filter Dropdowns */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Pesquisar por motivo, operador, comprovante ou valor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-750 rounded-xl outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition"
          />
        </div>

        {/* Dropdown Filters: Terminal & Operator */}
        <div className="flex flex-wrap items-center gap-2">
          {availableTerminals.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-zinc-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs">
              <Monitor className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedTerminal}
                onChange={(e) => setSelectedTerminal(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200 text-xs"
              >
                <option value="TODOS">Todos os Terminais</option>
                {availableTerminals.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {availableOperators.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-zinc-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200 text-xs"
              >
                <option value="TODOS">Todos os Operadores</option>
                {availableOperators.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
        {filterChips.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilterType(chip.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
              filterType === chip.id
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-750"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-zinc-800/80 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-zinc-800">
              <th className="p-3">Data / Hora</th>
              <th className="p-3">Tipo / Terminal</th>
              <th className="p-3">Descrição / Categoria</th>
              <th className="p-3">Operador</th>
              <th className="p-3">Destino / Fornecedor</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3 text-center">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                  Nenhum movimento de caixa localizado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredEntries.map(item => {
                const isPositive = item.isInput || item.type === "SALE" || item.type === "REINFORCEMENT" || item.type === "INPUT" || item.type === "SOBRA";
                let typeBadge = "";
                let typeLabel = "";

                if (item.type === "SALE" || item.type === "DIGITAL_SALE") {
                  typeBadge = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400";
                  typeLabel = item.paymentMethod === "CASH" ? "Venda Dinheiro" : `Venda ${item.paymentMethod || "Digital"}`;
                } else if (item.type === "REINFORCEMENT") {
                  typeBadge = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400";
                  typeLabel = "Reforço";
                } else if (item.type === "SANGRIA" || (item.reason || "").toLowerCase().includes("sangria")) {
                  typeBadge = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400";
                  typeLabel = "Sangria";
                } else if (item.type === "EXPENSE") {
                  typeBadge = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400";
                  typeLabel = "Despesa";
                } else if (item.type === "DEVOLUTION") {
                  typeBadge = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400";
                  typeLabel = "Devolução";
                } else if (item.type === "SOBRA") {
                  typeBadge = "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-400";
                  typeLabel = "Sobra de Caixa";
                } else {
                  typeBadge = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400";
                  typeLabel = "Quebra";
                }

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString("pt-MZ")}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-block w-max ${typeBadge}`}>
                          {typeLabel}
                        </span>
                        {item.registerId && (
                          <span className="text-[9.5px] font-mono text-slate-400">
                            {item.registerId}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[240px]">
                      <div className="truncate">{item.reason}</div>
                      {item.reference && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Ref: {item.reference}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">
                      {item.responsibleUser}
                    </td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {item.destination || item.supplier || item.supplierOrClient || "—"}
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold whitespace-nowrap">
                      <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {isPositive ? "+" : "-"}{Number(item.amount || 0).toLocaleString()} {currency}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(item)}
                        className="p-1 text-slate-400 hover:text-orange-600 transition cursor-pointer"
                        title="Ver detalhes completos do lançamento"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Movement Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Auditoria do Movimento de Caixa
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500">ID de Auditoria:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedEntry.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500">Data e Hora:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {new Date(selectedEntry.timestamp).toLocaleString("pt-MZ")}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500">Tipo de Operação:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEntry.type}</span>
              </div>
              {selectedEntry.registerId && (
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500">Terminal / Caixa:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedEntry.registerId}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500">Operador Autor:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEntry.responsibleUser}</span>
              </div>
              {selectedEntry.authorizedSupervisor && (
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500">Supervisor Homologador:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEntry.authorizedSupervisor}</span>
                </div>
              )}
              {(selectedEntry.destination || selectedEntry.supplier) && (
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500">Destinatário / Fornecedor:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEntry.destination || selectedEntry.supplier}</span>
                </div>
              )}
              {selectedEntry.reference && (
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500">Comprovativo / Fatura:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedEntry.reference}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500">Motivo / Descrição:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-right max-w-[200px]">{selectedEntry.reason}</span>
              </div>
              <div className="flex justify-between py-1 pt-2 text-sm font-extrabold">
                <span>Valor Registado:</span>
                <span className={selectedEntry.isInput || selectedEntry.type === "SALE" || selectedEntry.type === "REINFORCEMENT" || selectedEntry.type === "SOBRA" ? "text-emerald-600 font-mono" : "text-rose-600 font-mono"}>
                  {Number(selectedEntry.amount || 0).toLocaleString()} {currency}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedEntry(null)}
              className="w-full py-2.5 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl transition cursor-pointer"
            >
              Fechar Detalhes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

