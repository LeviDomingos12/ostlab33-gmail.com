import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Users, X, ArrowLeft, Eye, EyeOff, ShieldCheck, ChevronRight, Search, KeyRound } from "lucide-react";
import { Employee, SystemSettings } from "../types";
import { verifySecurityPin } from "../lib/security";

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  employees: Employee[];
  activeUser: Employee | null;
  onSelectEmployee: (emp: Employee) => void;
  onAuditLog?: (action: string, module: string, details: string) => void;
  settings?: SystemSettings;
}

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({
  isOpen,
  onClose,
  theme,
  employees,
  activeUser,
  onSelectEmployee,
  onAuditLog,
  settings,
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [showPin, setShowPin] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedEmpId("");
      setEnteredPin("");
      setPinError("");
      setShowPin(false);
      setSearchQuery("");
      setIsVerifying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);

  const handleConfirmPin = async () => {
    if (!selectedEmployee) return;

    if (!enteredPin.trim()) {
      setPinError("Por favor, introduza o PIN de acesso.");
      return;
    }

    setIsVerifying(true);
    setPinError("");

    try {
      const employeePin = selectedEmployee.pin?.trim();
      const systemMasterPin = settings?.securityPin?.trim();
      const entered = enteredPin.trim();

      const matchEmp = employeePin ? await verifySecurityPin(entered, employeePin) : false;
      const matchSys = systemMasterPin ? await verifySecurityPin(entered, systemMasterPin) : false;

      const isMatch = matchEmp || matchSys;

      if (isMatch) {
        onSelectEmployee(selectedEmployee);
        if (onAuditLog) {
          onAuditLog(
            "Troca de Usuário Autenticada",
            "SEGURANÇA",
            `Operador ativo alterado para ${selectedEmployee.name} via autenticação por PIN seguro.`
          );
        }
        onClose();
      } else {
        setPinError("PIN incorreto. Verifique com o administrador ou tente novamente.");
        setEnteredPin("");
      }
    } catch {
      setPinError("Falha na validação de segurança. Tente novamente.");
    } finally {
      setIsVerifying(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return emp.name.toLowerCase().includes(q) || (emp.role && emp.role.toLowerCase().includes(q));
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
            theme === "night"
              ? "bg-zinc-950 text-slate-100 border-zinc-800"
              : "bg-white text-slate-800 border-slate-200"
          }`}
          id="user-switch-modal-container"
        >
          {/* Top Modal Bar */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedEmployee ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmpId("");
                    setEnteredPin("");
                    setPinError("");
                  }}
                  className="p-1.5 rounded-xl bg-white dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:text-orange-500 border border-slate-200 dark:border-zinc-700 transition cursor-pointer"
                  title="Voltar para a lista"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
              )}
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  {selectedEmployee ? "Autenticação de Operador" : "Alterar Usuário"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedEmployee ? `PIN de segurança para ${selectedEmployee.name}` : "Selecione o operador para assumir o terminal"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 text-left overflow-y-auto max-h-[72vh]">
            {!selectedEmployee ? (
              /* Step 1: Search and Select Collaborator */
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar operador por nome..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-orange-500 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-900 dark:text-white outline-none transition"
                  />
                </div>

                <div className="space-y-2 mt-2">
                  {filteredEmployees.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Nenhum operador encontrado com esse nome.
                    </div>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const isCurrent = activeUser?.id === emp.id;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setEnteredPin("");
                            setPinError("");
                          }}
                          className={`w-full p-3 rounded-xl border text-left transition-all duration-150 flex items-center justify-between cursor-pointer group ${
                            isCurrent
                              ? "bg-orange-500/10 border-orange-500/40 text-orange-950 dark:text-orange-200"
                              : theme === "night"
                              ? "bg-zinc-900/60 border-zinc-800/80 hover:border-orange-500/40 hover:bg-zinc-900 text-slate-200"
                              : "bg-slate-50/60 border-slate-200 hover:border-orange-400 hover:bg-white text-slate-800 shadow-sm"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-bold text-xs overflow-hidden shrink-0 shadow-sm">
                              {emp.fotoPerfil && (emp.fotoPerfil.startsWith("http") || emp.fotoPerfil.startsWith("data:")) ? (
                                <img
                                  src={emp.fotoPerfil}
                                  className="w-full h-full object-cover"
                                  alt={emp.name}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                emp.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-orange-500 transition">
                                  {emp.name}
                                </span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                                    Ativo
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Toque para selecionar
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition shrink-0" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Step 2: Enter PIN for Selected Collaborator */
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 shadow-md">
                    {selectedEmployee.fotoPerfil && (selectedEmployee.fotoPerfil.startsWith("http") || selectedEmployee.fotoPerfil.startsWith("data:")) ? (
                      <img
                        src={selectedEmployee.fotoPerfil}
                        className="w-full h-full object-cover"
                        alt={selectedEmployee.name}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      selectedEmployee.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {selectedEmployee.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Introduza o PIN de segurança pessoal
                    </p>
                  </div>
                </div>

                {/* PIN Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <KeyRound className="w-3.5 h-3.5 text-orange-500" />
                    PIN de Segurança
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      maxLength={12}
                      autoFocus
                      value={enteredPin}
                      onChange={(e) => {
                        setEnteredPin(e.target.value);
                        if (pinError) setPinError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleConfirmPin();
                        }
                      }}
                      placeholder="••••"
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-orange-500 rounded-xl py-3 pl-4 pr-10 text-base text-slate-900 dark:text-white outline-none transition font-mono tracking-widest text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 cursor-pointer"
                      title={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {pinError && (
                    <p className="text-xs text-rose-500 font-bold mt-1">
                      ⚠️ {pinError}
                    </p>
                  )}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setEnteredPin((prev) => prev + String(num));
                        if (pinError) setPinError("");
                      }}
                      className="py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-orange-500/10 hover:border-orange-500/40 text-slate-800 dark:text-white font-extrabold text-base transition active:scale-95 cursor-pointer shadow-sm"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEnteredPin("");
                      if (pinError) setPinError("");
                    }}
                    className="py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:bg-rose-500/10 text-rose-500 font-bold text-xs transition active:scale-95 cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnteredPin((prev) => prev + "0");
                      if (pinError) setPinError("");
                    }}
                    className="py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-orange-500/10 hover:border-orange-500/40 text-slate-800 dark:text-white font-extrabold text-base transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnteredPin((prev) => prev.slice(0, -1));
                      if (pinError) setPinError("");
                    }}
                    className="py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-400 font-bold text-sm transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    ⌫
                  </button>
                </div>

                {/* Confirm Action */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmpId("");
                      setEnteredPin("");
                      setPinError("");
                    }}
                    className="flex-1 py-3 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition cursor-pointer border border-slate-200 dark:border-zinc-800"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPin}
                    disabled={!enteredPin.trim() || isVerifying}
                    className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-1.5 ${
                      enteredPin.trim()
                        ? "bg-orange-500 hover:bg-orange-600 text-white active:scale-95"
                        : "bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirmar Troca</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

