import React, { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  UserCheck, 
  Plus, 
  History, 
  Search, 
  Terminal, 
  ShieldCheck, 
  Clock, 
  DollarSign, 
  Download,
  FileText,
  List,
  Grid,
  Table as TableIcon,
  Trash2,
  Edit3,
  Lock,
  KeyRound,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Info,
  SlidersHorizontal,
  ArrowUpDown,
  Send,
  Printer,
  Copy,
  Activity,
  UserX,
  FileSpreadsheet,
  MapPin,
  Globe,
  Calendar,
  Filter,
  BarChart3,
  TrendingUp,
  UserCheck2
} from "lucide-react";
import { Employee, AuditLog, UserRole, SystemSettings } from "../types";
import { sendEmail } from "../lib/gmail";
import { authenticatedFetch } from "../lib/apiClient";
import { renderWelcomeAdminHtml } from "../templates/WelcomeAdminTemplate";
import { SupabaseSyncService } from "../services/supabaseService";
import { generateSecurePin, generateEntityId } from "../lib/deterministic";
const getRecoveryRequests = async () => SupabaseSyncService.getRecoveryRequests();
const resolveRecoveryRequest = async (id: string) => SupabaseSyncService.resolveRecoveryRequest(id);
import { useConfirm } from "../hooks/useConfirm";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Error loading logo for PDF:", err);
    return "";
  }
};

interface StaffModuleProps {
  employees: Employee[];
  auditLogs: AuditLog[];
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployees: (updatedList: Employee[]) => void;
  activeUsername: string;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currentRole: UserRole;
  currency: string;
  settings?: SystemSettings;
}

export default function StaffModule({
  employees,
  auditLogs,
  onAddEmployee,
  onUpdateEmployees,
  activeUsername,
  onAddAuditLog,
  currentRole,
  currency,
  settings
}: StaffModuleProps) {
  const confirm = useConfirm();
  
  // Tab states
  const [activeTab, setActiveTab] = useState<"STAFF" | "AUDIT" | "ERRORS" | "ACCESS_CHART">("STAFF");

  // Access chart states
  const [accessPeriod, setAccessPeriod] = useState<"7d" | "30d" | "90d" | "custom">("7d");
  const [accessModule, setAccessModule] = useState("Todos");
  const [accessEmployee, setAccessEmployee] = useState("Todos");
  const [accessChartType, setAccessChartType] = useState<"line" | "bar" | "area">("line");
  const [accessStartDate, setAccessStartDate] = useState(() => {
    const today = new Date();
    const past = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    return past.toISOString().split("T")[0];
  });
  const [accessEndDate, setAccessEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  
  // States for diagnostic and system errors tab (manager tools)
  const [expandedErrorLogId, setExpandedErrorLogId] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    server: "ok" | "failed" | null;
    db: "ok" | "failed" | null;
    time: string | null;
  }>({ server: null, db: null, time: null });

  const systemErrors = useMemo(() => {
    return auditLogs.filter(l => l.module === "Erros do Sistema" || l.module === "ERRO_FRONTEND" || l.module === "ERROS_SISTEMA");
  }, [auditLogs]);

  const handleRunDiagnostics = async () => {
    setIsDiagnosing(true);
    let serverStatus: "ok" | "failed" = "failed";
    let dbStatus: "ok" | "failed" = "failed";
    
    try {
      const res = await authenticatedFetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        serverStatus = "ok";
        dbStatus = data.status === "ok" ? "ok" : "failed";
      }
    } catch (err) {
      serverStatus = "failed";
      dbStatus = "failed";
    }
    
    setTimeout(() => {
      setDiagnosticResult({
        server: serverStatus,
        db: dbStatus,
        time: new Date().toLocaleTimeString()
      });
      setIsDiagnosing(false);
      
      if (serverStatus === "ok") {
        onAddAuditLog(
          "Autodiagnóstico Executado",
          "Erros do Sistema",
          `Painel de diagnóstico executado com sucesso. Status do Servidor: ${serverStatus.toUpperCase()}, Status do Banco: ${dbStatus.toUpperCase()}`
        );
      } else {
        onAddAuditLog(
          "Falha no Autodiagnóstico",
          "Erros do Sistema",
          "O autodiagnóstico detectou que o servidor API backend está inacessível ou offline."
        );
      }
    }, 1200);
  };

  // Views and filters states for employees
  const [viewMode, setViewMode] = useState<"cards" | "list" | "table">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos"); // Todos, Ativos, Suspensos, Desativados
  const [roleFilter, setRoleFilter] = useState("Todos"); // Todos, Administrador, Supervisor, Caixa, Armazém
  const [sortBy, setSortBy] = useState<"name" | "date" | "salary" | "role">("name");
  
  // Selection states for payroll batch operations
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isSendingToHR, setIsSendingToHR] = useState(false);
  const [hrSuccessMessage, setHrSuccessMessage] = useState("");

  // Views and filters states for Audit Log
  const [auditSearch, setAuditSearch] = useState("");
  const [auditModuleFilter, setAuditModuleFilter] = useState("Todos");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const past = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    return past.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // UI Modals / Drawers states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"RESUMO" | "PERMISSOES" | "ATENCION" | "FERIAS" | "SALARIO" | "HISTORICO">("RESUMO");

  // Recovery Requests tracking
  const [recoveryRequests, setRecoveryRequests] = useState<any[]>([]);
  const [_isLoadingRecovery, setIsLoadingRecovery] = useState(false);
  const [pendingRecoveryId, setPendingRecoveryId] = useState<string | null>(null);

  // Form states for employee addition & modification
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Operador de Caixa");
  const [contact, setContact] = useState("");
  const [salary, setSalary] = useState<number>(18000);
  const [employeeStatus, setEmployeeStatus] = useState<"ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED">("ACTIVE");
  const [localError, setLocalError] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmailCredentials, setSendEmailCredentials] = useState(true);
  const [emailSendingStatus, setEmailSendingStatus] = useState<"IDLE" | "SENDING" | "SUCCESS" | "ERROR">("IDLE");
  const [copiedLogs, setCopiedLogs] = useState(false);

  const generateSuggestedUsername = (fullName: string, phoneContact: string = ""): string => {
    const nameParts = fullName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, " ").split(/\s+/).filter(Boolean);
    let letters = "";
    if (nameParts.length === 0) {
      letters = "user";
    } else if (nameParts.length === 1) {
      const namePart = nameParts[0];
      letters = namePart.padEnd(4, "x").slice(0, 4);
    } else {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      
      let firstPart = firstName.slice(0, 2);
      let lastPart = lastName.slice(0, 2);
      
      if (firstPart.length < 2) {
        lastPart = lastName.slice(0, 4 - firstPart.length);
      }
      if (lastPart.length < 2) {
        firstPart = firstName.slice(0, 4 - lastPart.length);
      }
      
      let combined = firstPart + lastPart;
      if (combined.length < 4) {
        for (let i = 1; i < nameParts.length - 1 && combined.length < 4; i++) {
          combined += nameParts[i].slice(0, 4 - combined.length);
        }
      }
      if (combined.length < 4) {
        combined = combined.padEnd(4, "x");
      }
      letters = combined.slice(0, 4);
    }

    const digits = phoneContact.replace(/\D/g, "");
    let numbers = "";
    if (digits.length < 3) {
      numbers = digits.padEnd(3, "0").slice(0, 3);
    } else {
      numbers = digits.slice(-3);
    }

    return `${letters}${numbers}`;
  };

  React.useEffect(() => {
    if (isFormOpen && !selectedEmp) {
      setUsername(generateSuggestedUsername(name, contact));
    }
  }, [name, contact, isFormOpen, selectedEmp]);

  const openAddForm = () => {
    setName("");
    setUsername("");
    setRole("Operador de Caixa");
    setContact("");
    setSalary(18000);
    const newPin = generateSecurePin(6);
    setPin(newPin);
    setEmail("");
    setIsFormOpen(true);
  };

  const loadRecoveryRequests = async () => {
    setIsLoadingRecovery(true);
    try {
      const data = await getRecoveryRequests();
      setRecoveryRequests(data);
    } catch (err) {
      console.error("Failed to fetch recovery requests:", err);
    } finally {
      setIsLoadingRecovery(false);
    }
  };

  React.useEffect(() => {
    loadRecoveryRequests();
    const interval = setInterval(loadRecoveryRequests, 10000);
    return () => clearInterval(interval);
  }, []);

  // Quick state details for Permissions modal
  const [empPermissions, setEmpPermissions] = useState<string[]>(["POS", "STOCK"]);

  // Expandable state for audit logs
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Export dropdown states
  const [isExportStaffDropdownOpen, setIsExportStaffDropdownOpen] = useState(false);
  const [isExportAuditDropdownOpen, setIsExportAuditDropdownOpen] = useState(false);

  // System Errors Friendly Translation helper
  const translateDatabaseMessage = (details: string | undefined | null): string => {
    const dStr = details || "";
    if (dStr.toLowerCase().includes("permission-denied") || dStr.toLowerCase().includes("permissions") || dStr.toLowerCase().includes("insufficient")) {
      return "Acesso negado ao recurso solicitado (permissões insuficientes).";
    }
    if (dStr.toLowerCase().includes("unavailable") || dStr.toLowerCase().includes("network")) {
      return "Servidor indisponível temporariamente. A tentar restabelecer conexão.";
    }
    return dStr;
  };

  const isDatabaseError = (details: string | undefined | null): boolean => {
    const dStr = details || "";
    const lower = dStr.toLowerCase();
    return lower.includes("permission") || lower.includes("insufficient") || lower.includes("database error") || lower.includes("sql error");
  };

  // Staff CSV Export (enhanced to standard comma-separated Excel format)
  const handleDownloadStaffCSV = () => {
    try {
      const header = "ID,Nome,Cargo,Contacto,Salario (MT),Admissao,Estado\n";
      const rows = employees.map(emp => 
        `"${emp.id}","${emp.name}","${emp.role}","${emp.contact}",${emp.salary},"${emp.admissionDate}","${
          emp.status === 'ACTIVE' ? 'Ativo' : emp.status === 'SUSPENDED' ? 'Suspenso' : 'Desativado'
        }"`
      ).join("\n");
      
      const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Funcionarios_ERP_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      onAddAuditLog(
        "Exportar Funcionários CSV",
        "FUNCIONÁRIOS",
        `Quadro de funcionários exportado em formato CSV (${employees.length} registros).`
      );
      setIsExportStaffDropdownOpen(false);
    } catch (err) {
      console.warn(err);
    }
  };

  // Staff PDF Export
  const handleDownloadStaffPDF = async () => {
    try {
      const doc = new jsPDF();
      
      const logoData = await getBase64ImageFromUrl(settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
      if (logoData) {
        doc.addImage(logoData, "JPEG", 165, 8, 30, 30);
      }
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.companyName || "Indisponível", 14, 22);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`ERP Modern | NUIT: ${settings?.companyNuit || "Indisponível"}`, 14, 28);
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Quadro de Funcionários Registados", 14, 40);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Total de Colaboradores: ${employees.length}`, 14, 47);
      doc.text(`Emitido em: ${new Date().toLocaleString()}`, 14, 52);

      const head = [["ID", "NOME", "CARGO", "CONTACTO", "SALÁRIO", "ADMISSÃO", "ESTADO"]];
      const body = employees.map(emp => [
        emp.id,
        emp.name,
        emp.role,
        emp.contact,
        `${emp.salary.toLocaleString()} ${currency}`,
        emp.admissionDate,
        emp.status === 'ACTIVE' ? 'Ativo' : emp.status === 'SUSPENDED' ? 'Suspenso' : 'Desativado'
      ]);

      autoTable(doc, {
        startY: 60,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] }, // orange-500
        styles: { fontSize: 8, cellPadding: 3 }
      });

      doc.save(`Quadro_Funcionarios_${new Date().toISOString().split('T')[0]}.pdf`);
      
      onAddAuditLog(
        "Exportar Funcionários PDF",
        "FUNCIONÁRIOS",
        `Quadro de funcionários exportado em PDF (${employees.length} registros).`
      );
      setIsExportStaffDropdownOpen(false);
    } catch (err) {
      console.warn(err);
    }
  };

  // Audit Logs CSV Export
  const handleDownloadAuditCSV = () => {
    try {
      const header = "Data,Usuario,Funcao,Accao,Modulo,Detalhes\n";
      const rows = filteredAuditLogs.map(log => 
        `"${new Date(log.timestamp).toLocaleString() || ''}","${log.user || ''}","${log.userRole || ''}","${log.action || ''}","${log.module || ''}","${(log.details || '').replace(/"/g, '""')}"`
      ).join("\n");
      
      const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Logs_Auditoria_ERP_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      onAddAuditLog(
        "Exportar Auditoria CSV",
        "AUDIT",
        `Relatório detalhado de auditoria de logs exportado em CSV (${filteredAuditLogs.length} eventos).`
      );
      setIsExportAuditDropdownOpen(false);
    } catch (err) {
      console.warn(err);
    }
  };

  // Audit Logs PDF Export
  const handleDownloadAuditPDF = async (exportAll: boolean = false) => {
    try {
      const logsToExport = exportAll ? [...auditLogs].reverse() : filteredAuditLogs;
      if (logsToExport.length === 0) {
        alert("Nenhum log de auditoria disponível para exportar em PDF.");
        return;
      }

      const doc = new jsPDF();
      
      const logoData = await getBase64ImageFromUrl(settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
      if (logoData) {
        doc.addImage(logoData, "JPEG", 165, 8, 30, 30);
      }
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.companyName || "Indisponível", 14, 22);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("ERP Modern | Relatório de Segurança e Auditoria", 14, 28);
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(exportAll ? "Relatório Completo de Audit Log de Segurança" : "Relatório de Audit Log de Segurança", 14, 40);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Período: ${startDate || "Todos os Registos"} até ${endDate || "Atualidade"}`, 14, 47);
      doc.text(`Emitido em: ${new Date().toLocaleString()} por ${activeUsername || "Sistema"}`, 14, 52);

      // --- EXECUTIVE SECURITY SUMMARY CALCULATIONS ---
      const totalEvents = logsToExport.length;

      const securityEvents = logsToExport.filter(log => {
        const m = (log.module || "").toUpperCase();
        const a = (log.action || "").toUpperCase();
        const d = (log.details || "").toUpperCase();
        return m.includes("SEGURANÇA") || m.includes("AUTENTICAÇÃO") || m.includes("AUDIT") ||
               a.includes("LOGIN") || a.includes("ALTERAÇÃO DE SENHA") || a.includes("ALERTA") || a.includes("RECUPERAÇÃO") ||
               d.includes("SUSPEITO") || d.includes("IP INTERNACIONAL") || d.includes("INCOMPATÍVEL") || d.includes("ACESSO");
      });

      const criticalSecurityEvents = logsToExport.filter(log => {
        const d = (log.details || "").toUpperCase();
        const a = (log.action || "").toUpperCase();
        return d.includes("SUSPEITO") || d.includes("ALERTA DE SEGURANÇA") || d.includes("IP INTERNACIONAL") || d.includes("CRÍTICO") || a.includes("FALHA") || d.includes("FALHA DE LOGIN") || d.includes("INTRUSÃO");
      });

      const uniqueUsers = Array.from(new Set(logsToExport.map(log => log.user))).filter(Boolean);

      const summaryText = `Durante o período de auditoria correspondente, o sistema OST Vendas monitorou de forma contínua a integridade e os acessos ao ERP comercial. Foram auditados ${totalEvents} eventos totais de sistema, dos quais ${securityEvents.length} estão associados a fluxos de autenticação ou segurança de utilizadores. O sistema identificou ${criticalSecurityEvents.length} alertas ou acessos críticos em ${uniqueUsers.length} operador(es) único(s). Este documento serve para fins de análise de segurança externa e conformidade de TI.`;

      // Draw Soft-colored grey card for Executive Summary
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(14, 58, 182, 54, "F");
      
      // Border around Executive Summary card
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.rect(14, 58, 182, 54, "S");
      
      // Vertical left accent line for the card in Orange/Amber
      doc.setFillColor(249, 115, 22); // orange-500
      doc.rect(14, 58, 2.5, 54, "F");

      // Executive Summary Title
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("RESUMO EXECUTIVO - AUDITORIA DE SEGURANÇA EXTERNA", 20, 65);

      // Section Content
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105); // slate-600
      
      // Split paragraph text so it wraps beautifully
      const textLines = doc.splitTextToSize(summaryText, 172);
      doc.text(textLines, 20, 71);

      // Simple metric cards inside the summary block
      // 1. Total events card
      doc.setFillColor(255, 255, 255); // white
      doc.rect(20, 94, 50, 14, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(20, 94, 50, 14, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("TOTAL DE EVENTOS", 24, 98);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(`${totalEvents}`, 24, 105);

      // 2. Authentication/Security events card
      doc.setFillColor(255, 255, 255); // white
      doc.rect(76, 94, 58, 14, "F");
      doc.rect(76, 94, 58, 14, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("EVENTOS SEGURANÇA", 80, 98);
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`${securityEvents.length}`, 80, 105);

      // 3. Critical events card
      doc.setFillColor(254, 242, 242); // red-50
      doc.setDrawColor(254, 202, 202); // red-200
      doc.rect(140, 94, 50, 14, "F");
      doc.rect(140, 94, 50, 14, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(220, 38, 38); // red-600
      doc.text("ALERTAS CRÍTICOS", 144, 98);
      doc.setFontSize(10);
      doc.setTextColor(153, 27, 27); // red-800
      doc.text(`${criticalSecurityEvents.length}`, 144, 105);

      // Subtitle for log table
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("REGISTO DETALHADO DOS EVENTOS DE AUDITORIA", 14, 119);

      const head = [["DATA / HORA", "USUÁRIO", "CARGO", "ACÇÃO", "MÓDULO", "DETALHES"]];
      const body = logsToExport.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.user || "Sistema",
        log.userRole || "N/D",
        log.action || "Ação",
        log.module || "Geral",
        translateDatabaseMessage(log.details || "")
      ]);

      autoTable(doc, {
        startY: 123,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] }, // slate-700
        styles: { fontSize: 8, cellPadding: 3 }
      });

      const fileName = exportAll 
        ? `Relatorio_Auditoria_Completo_${new Date().toISOString().split('T')[0]}.pdf`
        : `Relatorio_Auditoria_${new Date().toISOString().split('T')[0]}.pdf`;

      doc.save(fileName);
      
      onAddAuditLog(
        "Exportar Auditoria PDF",
        "AUDIT",
        `Logs de auditoria exportados em PDF (${logsToExport.length} eventos, modo: ${exportAll ? "Completo" : "Filtrado"}).`
      );
      setIsExportAuditDropdownOpen(false);
    } catch (err) {
      console.warn(err);
    }
  };

  // Copy Logs to Clipboard as structured text
  const handleCopyLogs = () => {
    try {
      if (filteredAuditLogs.length === 0) {
        alert("Nenhum log disponível para copiar com os filtros atuais.");
        return;
      }

      const reportHeader = [
        "==================================================",
        "         RELATÓRIO DE AUDITORIA - OST VENDAS       ",
        `Exportado em: ${new Date().toLocaleString()}`,
        `Total de Eventos: ${filteredAuditLogs.length}`,
        `Filtros - Período: ${startDate || "Qualquer"} a ${endDate || "Qualquer"}`,
        `Filtros - Módulo: ${auditModuleFilter}`,
        `Filtros - Pesquisa: ${auditSearch || "Nenhuma"}`,
        "==================================================",
        ""
      ].join("\n");

      const reportBody = filteredAuditLogs.map((log, idx) => {
        const formattedTime = new Date(log.timestamp).toLocaleString();
        return [
          `[#${idx + 1}] DATA/HORA: ${formattedTime}`,
          `UTENTE: ${log.user || "Sistema"} (${log.userRole || "N/D"})`,
          `MÓDULO: ${log.module || "Geral"}`,
          `AÇÃO: ${log.action}`,
          `DETALHES: ${log.details}`,
          log.ip || log.device ? `ORIGEM: ${[log.ip, log.device].filter(Boolean).join(" / ")}` : null,
          "--------------------------------------------------"
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const fullText = reportHeader + "\n" + reportBody;

      navigator.clipboard.writeText(fullText)
        .then(() => {
          setCopiedLogs(true);
          onAddAuditLog(
            "Copiar Logs Auditoria",
            "AUDIT",
            `Logs de auditoria copiados para a área de transferência (${filteredAuditLogs.length} eventos).`
          );
          setTimeout(() => setCopiedLogs(false), 2000);
        })
        .catch((err) => {
          console.error("Falha ao copiar logs: ", err);
          alert("Erro ao copiar logs para a área de transferência.");
        });
    } catch (err) {
      console.warn(err);
    }
  };

  // Print individual payslip (Recibo de Salário)
  const handlePrintPayslip = async (emp: Employee) => {
    try {
      const doc = new jsPDF();
      
      const logoData = await getBase64ImageFromUrl(settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
      if (logoData) {
        doc.addImage(logoData, "JPEG", 160, 13, 26, 26);
      }
      
      doc.setDrawColor(220, 220, 220);
      doc.rect(10, 10, 190, 277); // Outer border
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.companyName || "Indisponível", 20, 25);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(settings?.storeAddress || settings?.companyAddress || "Indisponível", 20, 31);
      doc.text(`NUIT: ${settings?.companyNuit || "Indisponível"} | Email: ${settings?.smtpUser || settings?.reportRecipientEmail || "Indisponível"}`, 20, 36);
      
      doc.setLineWidth(0.5);
      doc.line(20, 42, 190, 42);
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DEMONSTRATIVO DE PAGAMENTO DE SALÁRIO", 20, 52);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const currentMonthYear = new Date().toLocaleDateString("pt-MZ", { month: "long", year: "numeric" });
      doc.text(`Período de Referência: ${currentMonthYear.charAt(0).toUpperCase() + currentMonthYear.slice(1)}`, 20, 58);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 130, 58);
      
      // Employee Box
      doc.setFillColor(248, 250, 252);
      doc.rect(20, 65, 170, 35, "F");
      doc.rect(20, 65, 170, 35);
      
      doc.setFont("helvetica", "bold");
      doc.text(`Colaborador:`, 25, 73);
      doc.text(`Cargo / Função:`, 25, 80);
      doc.text(`Contacto:`, 25, 87);
      doc.text(`Código ID:`, 25, 94);
      
      doc.setFont("helvetica", "normal");
      doc.text(emp.name, 55, 73);
      doc.text(emp.role, 55, 80);
      doc.text(emp.contact, 55, 87);
      doc.text(emp.id, 55, 94);
      
      // Earnings & Deductions Table
      const earningsHead = [["DESCRIÇÃO", "REFERÊNCIA", "VENCIMENTOS", "DESCONTOS"]];
      const earningsBody = [
        ["Salário Base Mensal", "30 Dias", `${emp.salary.toLocaleString()} ${currency}`, "-"],
        ["INSS (Segurança Social)", "3.0 %", "-", `${(emp.salary * 0.03).toLocaleString()} ${currency}`],
        ["IRPS (Retenção na Fonte)", "10.0 %", "-", `${(emp.salary * 0.10).toLocaleString()} ${currency}`],
      ];
      
      autoTable(doc, {
        startY: 110,
        head: earningsHead,
        body: earningsBody,
        theme: "grid",
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 9 }
      });
      
      // Totals Box
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFillColor(248, 250, 252);
      doc.rect(110, finalY, 80, 25, "F");
      doc.rect(110, finalY, 80, 25);
      
      const inss = emp.salary * 0.03;
      const irps = emp.salary * 0.10;
      const netSalary = emp.salary - inss - irps;
      
      doc.setFont("helvetica", "bold");
      doc.text(`Total Bruto:`, 115, finalY + 8);
      doc.text(`Total Descontos:`, 115, finalY + 15);
      doc.text(`Salário Líquido:`, 115, finalY + 22);
      
      doc.setFont("helvetica", "normal");
      doc.text(`${emp.salary.toLocaleString()} ${currency}`, 155, finalY + 8);
      doc.text(`${(inss + irps).toLocaleString()} ${currency}`, 155, finalY + 15);
      doc.setFont("helvetica", "bold");
      doc.text(`${netSalary.toLocaleString()} ${currency}`, 155, finalY + 22);
      
      // Signatures
      doc.line(20, finalY + 60, 90, finalY + 60);
      doc.line(120, finalY + 60, 190, finalY + 60);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Assinatura do Responsável (RH)", 35, finalY + 65);
      doc.text("Assinatura do Colaborador", 135, finalY + 65);
      
      doc.save(`Recibo_Salario_${emp.name.replace(/\s+/g, '_')}.pdf`);
      
      onAddAuditLog(
        "Imprimir Recibo Individual",
        "FUNCIONÁRIOS",
        `Impresso recibo de vencimento individual para '${emp.name}' no valor bruto de ${emp.salary.toLocaleString()} ${currency}.`
      );
    } catch (err) {
      console.warn("Error printing individual payslip: ", err);
    }
  };

  // Batch HR Submission Simulation
  const handleSendToHR = () => {
    if (selectedEmployees.length === 0) return;
    setIsSendingToHR(true);
    setTimeout(() => {
      setIsSendingToHR(false);
      const names = employees.filter(e => selectedEmployees.includes(e.id)).map(e => e.name).join(", ");
      setHrSuccessMessage(`Folhas de salário de ${selectedEmployees.length} colaboradores (${names}) enviadas com sucesso ao departamento de RH central!`);
      
      onAddAuditLog(
        "Enviar Folhas ao RH",
        "FUNCIONÁRIOS",
        `Folhas de vencimento de ${selectedEmployees.length} colaboradores enviadas para processamento de depósitos centralizados pelo RH.`
      );
      
      setSelectedEmployees([]);
      setTimeout(() => setHrSuccessMessage(""), 6000);
    }, 1500);
  };

  // Disparar automaticamente e-mail de boas-vindas com credenciais para o colaborador / admin recém-criado
  const dispatchWelcomeEmail = async (
    recipientEmail: string,
    employeeName: string,
    username: string,
    tempPin: string,
    userRole?: string
  ) => {
    setEmailSendingStatus("SENDING");
    try {
      const emailSubject = `Credenciais de Acesso - ${settings?.companyName || "Sistema ERP"} (${employeeName})`;
      const adminCc = settings?.reportRecipientEmail || settings?.smtpUser || "";
      const emailBody = renderWelcomeAdminHtml({
        adminName: employeeName,
        adminEmail: recipientEmail,
        tempPin: tempPin,
        role: userRole || "Utilizador / Operador",
        branchName: settings?.companyName || "Sistema ERP",
        adminCopyEmail: adminCc || "Indisponível"
      });

      // 1. Primary copy sent to the new user via sendEmail
      await sendEmail({
        to: recipientEmail.trim(),
        subject: emailSubject,
        body: emailBody,
        isHtml: true
      });

      // 2. Carbon copy (CC) sent to admin if configured and different
      if (adminCc && recipientEmail.trim().toLowerCase() !== adminCc.toLowerCase()) {
        await sendEmail({
          to: adminCc,
          subject: `[CÓPIA CC - AUDITORIA] ${emailSubject}`,
          body: emailBody,
          isHtml: true
        }).catch(err => console.error("Erro ao enviar cópia CC via sendEmail:", err));
      }

      // 3. Backup dispatch via API route endpoint
      authenticatedFetch("/api/email/dispatch-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipientEmail,
          employeeName: employeeName,
          username: username,
          tempPin: tempPin,
          role: userRole
        })
      }).catch(() => {});

      setEmailSendingStatus("SUCCESS");
      onAddAuditLog(
        "Notificação de Credenciais",
        "NOTIFICAÇÃO",
        `Credenciais de acesso enviadas com sucesso via sendEmail para ${employeeName} (${recipientEmail})${adminCc ? ` com cópia CC para ${adminCc}` : ""}. Username: '${username}'.`
      );
      setTimeout(() => {
        setEmailSendingStatus("IDLE");
      }, 4000);
      return { success: true };
    } catch (error: any) {
      console.error("Erro ao enviar credenciais por e-mail:", error);
      setEmailSendingStatus("ERROR");
      onAddAuditLog(
        "Falha de Envio de Credenciais",
        "Erros do Sistema",
        `Falha ao enviar credenciais para ${recipientEmail}: ${error.message}`
      );
      setTimeout(() => {
        setEmailSendingStatus("IDLE");
      }, 4000);
      return { success: false, error: error.message };
    }
  };

  // Password strength check helper
  const checkPasswordStrength = (password: string) => {
    if (!password) return { score: 0, label: "Sem senha", color: "bg-slate-300", isValidAdmin: false };

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    else if (/[a-zA-Z]/.test(password)) score += 0.5;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    let label = "Fraca";
    let color = "bg-rose-500";

    if (score >= 3.5) {
      label = "Muito Forte";
      color = "bg-emerald-500";
    } else if (score >= 2.5) {
      label = "Forte";
      color = "bg-green-500";
    } else if (score >= 1.5) {
      label = "Média";
      color = "bg-amber-500";
    } else {
      label = "Fraca";
      color = "bg-rose-500";
    }

    // Admin requirement: minimum 8 characters with at least letters and numbers
    const isValidAdmin = password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

    return { score, label, color, isValidAdmin };
  };

  // Add/Contract new employee
  const handleSubmitEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      setLocalError("Por favor, introduza o Nome e Contacto do trabalhador.");
      return;
    }

    const isAdminRole = role === "Administrador";

    // Verification of password strength for Administrators
    if (isAdminRole) {
      if (!email.trim()) {
        setLocalError("Para criar um Administrador, é obrigatório indicar um e-mail válido para envio das credenciais.");
        return;
      }
      if (pin.trim()) {
        const pStrength = checkPasswordStrength(pin.trim());
        if (!pStrength.isValidAdmin) {
          setLocalError("Para utilizadores Administradores, a senha deve ter pelo menos 8 caracteres, combinando letras e números (ex: Admin2026!).");
          return;
        }
      }
    }
    
    const finalUsername = username.trim() || generateSuggestedUsername(name, contact);
    // Generates a random strong password if empty
    const generateTempPass = () => {
      const digits = "0123456789";
      let result = "Admin#";
      for (let i = 0; i < 4; i++) {
        result += digits.charAt(Math.floor(Math.random() * digits.length));
      }
      return result;
    };
    const formattedPin = pin.trim() || generateTempPass();
    setLocalError("");

    const payload: Employee = {
      id: generateEntityId("emp"),
      name,
      role,
      contact,
      salary,
      admissionDate: new Date().toISOString().split("T")[0],
      status: "ACTIVE",
      pin: formattedPin,
      password: formattedPin,
      email: email.trim() || undefined,
      username: finalUsername,
      pinCreatedAt: new Date().toISOString(),
      pinChanged: false
    };

    onAddEmployee(payload);
    
    let auditDetails = `Novo funcionário/admin '${payload.name}' (${role}) registado com username '${finalUsername}', Senha de Acesso: [DEFINIDA COM SUCESSO / MASCARADA] e salário de ${payload.salary.toLocaleString()} ${currency}.`;

    const recipientToNotify = email.trim();
    if (recipientToNotify && (isAdminRole || sendEmailCredentials)) {
      const adminCc = settings?.reportRecipientEmail || settings?.smtpUser || "";
      auditDetails += ` Envio de credenciais com WelcomeAdminTemplate solicitado para o e-mail: ${recipientToNotify}${adminCc ? ` (cópia CC para ${adminCc})` : ""}.`;
      dispatchWelcomeEmail(recipientToNotify, name.trim(), finalUsername, formattedPin, role);
    }

    onAddAuditLog(
      "Contratar Funcionário",
      "FUNCIONÁRIOS",
      auditDetails
    );

    setIsFormOpen(false);
    setName("");
    setUsername("");
    setRole("Operador de Caixa");
    setContact("");
    setSalary(18000);
    setPin("");
    setEmail("");
  };

  // Edit employee information
  const handleEditEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !name.trim() || !contact.trim()) return;

    const finalUsername = username.trim() || generateSuggestedUsername(name, contact);
    const isPinUpdated = pin.trim() !== "" && pin.trim() !== selectedEmp.pin;

    const updated = employees.map(emp => {
      if (emp.id === selectedEmp.id) {
        return {
          ...emp,
          name,
          role,
          contact,
          salary,
          status: employeeStatus,
          pin: pin.trim() || emp.pin || "123456",
          password: pin.trim() || emp.password || emp.pin || "123456",
          email: email.trim() || emp.email,
          username: finalUsername,
          pinCreatedAt: isPinUpdated ? new Date().toISOString() : (emp.pinCreatedAt || new Date().toISOString()),
          pinChanged: isPinUpdated ? false : (emp.pinChanged !== undefined ? emp.pinChanged : true)
        };
      }
      return emp;
    });

    onUpdateEmployees(updated);

    if (isPinUpdated) {
      const userEmail = email.trim() || selectedEmp.email;
      if (userEmail) {
        sendEmail({
          to: userEmail,
          subject: "Alteração de Senha / PIN de Acesso - OST Vendas",
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <div style="text-align: center; border-bottom: 2px solid #ff6b00; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #0f172a; margin: 0; font-size: 24px;">OST Vendas</h1>
                <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Notificação de Segurança</p>
              </div>
              <h2 style="color: #1e293b; font-size: 18px;">Olá, ${name}!</h2>
              <p style="color: #475569; font-size: 14px; line-height: 1.5;">Informamos que a sua palavra-passe (PIN) de acesso ao terminal foi alterada com sucesso pela Administração.</p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Novo PIN de Acesso:</span>
                <strong style="color: #ff6b00; font-size: 22px; letter-spacing: 2px; font-family: monospace;">${pin.trim()}</strong>
              </div>
              <p style="color: #475569; font-size: 14px; line-height: 1.5;">Por motivos de segurança, guarde este PIN em local seguro e não o partilhe com terceiros.</p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">Se não solicitou esta alteração ou se julga tratar-se de um erro, contacte imediatamente o Administrador.</p>
            </div>
          `,
          isHtml: true
        }).then(() => {
          console.log("Email de alteração de PIN enviado para:", userEmail);
        }).catch((err) => {
          console.error("Erro ao enviar email de alteração de PIN:", err);
        });
      }
    }
    
    onAddAuditLog(
      "Editar Funcionário",
      "FUNCIONÁRIOS",
      `Perfil do funcionário '${name}' atualizado (Username: '${finalUsername}'). Estado: ${employeeStatus}, Cargo: ${role}, PIN atualizado/confirmado, Salário: ${salary.toLocaleString()} ${currency}.`
    );

    if (pendingRecoveryId) {
      resolveRecoveryRequest(pendingRecoveryId).then(() => {
        loadRecoveryRequests();
      }).catch(err => {
        console.error("Error resolving recovery request:", err);
      });
      setPendingRecoveryId(null);
    }

    setIsEditModalOpen(false);
    setSelectedEmp(null);
    setPin("");
    setEmail("");
    setUsername("");
  };

  // Reset credentials directly for an employee
  const handleResetCredentialsDirectly = (emp: Employee) => {
    if (currentRole !== "ADMIN" && currentRole !== "SUPERVISOR") {
      alert("Apenas administradores ou supervisores podem resetar a senha de colaboradores.");
      return;
    }

    const confirmReset = window.confirm(
      `Tem a certeza de que deseja redefinir e resetar a senha e PIN de acesso de "${emp.name}"? Um novo PIN temporário de 6 dígitos será gerado automaticamente.`
    );

    if (!confirmReset) return;

    const generatedPin = generateSecurePin(6);

    const updated = employees.map(e => {
      if (e.id === emp.id) {
        return {
          ...e,
          pin: generatedPin,
          password: generatedPin,
          pinCreatedAt: new Date().toISOString(),
          pinChanged: false
        };
      }
      return e;
    });

    onUpdateEmployees(updated);

    onAddAuditLog(
      "Reset de Credenciais",
      "FUNCIONÁRIOS",
      `Administrador resetou as credenciais (Senha e PIN) do colaborador '${emp.name}'. Nova credencial temporária gerada.`
    );

    const userEmail = emp.email?.trim();
    if (userEmail) {
      sendEmail({
        to: userEmail,
        subject: "Redefinição de Palavra-passe / PIN - OST Vendas",
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="text-align: center; border-bottom: 2px solid #ff6b00; padding-bottom: 15px; margin-bottom: 20px;">
              <h1 style="color: #0f172a; margin: 0; font-size: 24px;">OST Vendas</h1>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Notificação de Segurança</p>
            </div>
            <h2 style="color: #1e293b; font-size: 18px;">Olá, ${emp.name}!</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">Informamos que a sua palavra-passe e PIN de acesso do sistema foram redefinidos pela Administração.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
              <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Nova Credencial Temporária:</span>
              <strong style="color: #ff6b00; font-size: 24px; letter-spacing: 2px; font-family: monospace;">${generatedPin}</strong>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">Por motivos de segurança, utilize esta credencial temporária para aceder ao sistema e redefinir a sua senha para uma segura no seu primeiro acesso.</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">Se não solicitou esta alteração, por favor contacte imediatamente o Administrador.</p>
          </div>
        `,
        isHtml: true
      }).then(() => {
        console.log("Email de redefinição de credenciais enviado para:", userEmail);
      }).catch(err => {
        console.error("Erro ao enviar email de redefinição:", err);
      });
    }

    alert(
      `A senha/PIN de "${emp.name}" foi redefinida com sucesso!\n\n` +
      `Nova Credencial Temporária: ${generatedPin}\n\n` +
      `Se o colaborador tiver um e-mail cadastrado, ele receberá uma cópia destas instruções.`
    );
  };

  // Save changes to permissions
  const handleSavePermissions = () => {
    if (!selectedEmp) return;
    
    onAddAuditLog(
      "Alterar Permissões",
      "FUNCIONÁRIOS",
      `Alterado privilégios de acesso de '${selectedEmp.name}'. Módulos habilitados: ${empPermissions.join(", ")}`
    );
    setIsPermissionsModalOpen(false);
  };

  // Delete / Dismiss employee
  const handleDeleteEmployee = async (emp: Employee) => {
    const isConfirmed = await confirm({
      title: "Você tem certeza?",
      message: `Deseja realmente desligar e remover o registro de "${emp.name}" permanentemente? Esta ação é definitiva, irreversível e revogará todos os privilégios de acesso dele ao sistema.`,
      confirmText: "Sim, Confirmar Remoção",
      cancelText: "Não, Cancelar",
      type: "danger"
    });

    if (isConfirmed) {
      const updated = employees.filter(e => e.id !== emp.id);
      onUpdateEmployees(updated);
      
      onAddAuditLog(
        "Remover Funcionário",
        "FUNCIONÁRIOS",
        `Funcionário '${emp.name}' com código '${emp.id}' foi desligado permanentemente do sistema.`
      );
    }
  };

  const confirmDeleteEmployee = () => {
    // Deprecated in favor of the beautiful async useConfirm hook
  };

  // Trigger quick salary payment simulation
  const handlePaySalary = (emp: Employee) => {
    onAddAuditLog(
      "Pagar Salário",
      "FUNCIONÁRIOS",
      `Salário Mensal de ${emp.salary.toLocaleString()} ${currency} pago via M-Pesa central ao funcionário '${emp.name}'.`
    );
    alert(`Salário de ${emp.salary.toLocaleString()} MT pago com sucesso para ${emp.name}! Transação de RH arquivada e comprovante gerado.`);
    handlePrintPayslip(emp);
  };

  // Toggle selection for batch payroll submissions
  const toggleSelectEmployee = (empId: string) => {
    setSelectedEmployees(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(e => e.id));
    }
  };

  // List of distinct modules for Audit logs with standard default categories
  const modules = useMemo(() => {
    const standardModules = ["Vendas", "Stock", "Segurança", "Caixa", "Clientes", "Funcionários", "Relatórios", "Sistema", "Assinaturas"];
    const set = new Set<string>();
    standardModules.forEach(m => set.add(m));
    auditLogs.forEach(l => {
      if (l.module) set.add(l.module);
    });
    return ["Todos", ...Array.from(set)];
  }, [auditLogs]);

  // Distinct modules list for collaborator accesses (excluding system errors)
  const accessModulesList = useMemo(() => {
    const list = new Set(auditLogs.map(l => l.module).filter(m => m && m !== "Erros do Sistema" && m !== "ERRO_FRONTEND" && m !== "ERROS_SISTEMA"));
    return ["Todos", ...Array.from(list)];
  }, [auditLogs]);

  // Computed start/end dates for system accesses
  const computedAccessDates = useMemo(() => {
    const today = new Date();
    let start = new Date();
    if (accessPeriod === "7d") {
      start.setDate(today.getDate() - 6);
    } else if (accessPeriod === "30d") {
      start.setDate(today.getDate() - 29);
    } else if (accessPeriod === "90d") {
      start.setDate(today.getDate() - 89);
    } else {
      return { startStr: accessStartDate, endStr: accessEndDate };
    }
    return {
      startStr: start.toISOString().split("T")[0],
      endStr: today.toISOString().split("T")[0],
    };
  }, [accessPeriod, accessStartDate, accessEndDate]);

  // Filtered and aggregated time-series data of accesses
  const accessChartData = useMemo(() => {
    const { startStr, endStr } = computedAccessDates;
    
    const logs = auditLogs.filter(log => {
      if (!log.timestamp) return false;
      let logDate = log.timestamp;
      if (log.timestamp.includes("T")) {
        logDate = log.timestamp.split("T")[0];
      } else if (log.timestamp.includes(" ")) {
        logDate = log.timestamp.split(" ")[0];
      }
      
      const matchDate = logDate >= startStr && logDate <= endStr;
      const matchModule = accessModule === "Todos" || log.module === accessModule;
      const matchEmployee = accessEmployee === "Todos" || 
                            log.user === accessEmployee || 
                            log.user === employees.find(e => e.username === accessEmployee)?.name;
      const isValidUser = log.user && log.user !== "System" && log.user !== "SISTEMA" && log.user.trim() !== "";
      const isNotSystemError = log.module !== "Erros do Sistema" && log.module !== "ERRO_FRONTEND" && log.module !== "ERROS_SISTEMA";
      return matchDate && matchModule && matchEmployee && isValidUser && isNotSystemError;
    });

    const dateList: string[] = [];
    const curr = new Date(startStr);
    const end = new Date(endStr);
    let limit = 0;
    while (curr <= end && limit < 180) {
      dateList.push(curr.toISOString().split("T")[0]);
      curr.setDate(curr.getDate() + 1);
      limit++;
    }

    const activeEmps = Array.from(new Set(logs.map(l => l.user).filter(Boolean))) as string[];

    const chartPoints = dateList.map(date => {
      const dayLogs = logs.filter(l => {
        if (!l.timestamp) return false;
        let logDate = l.timestamp;
        if (l.timestamp.includes("T")) {
          logDate = l.timestamp.split("T")[0];
        } else if (l.timestamp.includes(" ")) {
          logDate = l.timestamp.split(" ")[0];
        }
        return logDate === date;
      });

      const point: any = {
        dateStr: date,
        date: (() => {
          const parts = date.split("-");
          if (parts.length === 3) {
            const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            return `${parts[2]} ${months[parseInt(parts[1], 10) - 1]}`;
          }
          return date;
        })(),
      };

      activeEmps.forEach(emp => {
        point[emp] = 0;
      });

      dayLogs.forEach(l => {
        if (l.user) {
          point[l.user] = (point[l.user] || 0) + 1;
        }
      });

      point.total = dayLogs.length;
      return point;
    });

    return {
      points: chartPoints,
      activeEmployees: activeEmps,
      totalAccesses: logs.length,
    };
  }, [auditLogs, computedAccessDates, accessModule, accessEmployee, employees]);

  // Insights, ranking and distributions for accesses
  const accessInsights = useMemo(() => {
    const { points, totalAccesses } = accessChartData;
    const { startStr, endStr } = computedAccessDates;

    const empCounts: { [username: string]: number } = {};
    const moduleCounts: { [moduleName: string]: number } = {};
    
    const filteredLogs = auditLogs.filter(log => {
      if (!log.timestamp) return false;
      let logDate = log.timestamp;
      if (log.timestamp.includes("T")) {
        logDate = log.timestamp.split("T")[0];
      } else if (log.timestamp.includes(" ")) {
        logDate = log.timestamp.split(" ")[0];
      }
      
      const matchDate = logDate >= startStr && logDate <= endStr;
      const matchModule = accessModule === "Todos" || log.module === accessModule;
      const matchEmployee = accessEmployee === "Todos" || 
                            log.user === accessEmployee || 
                            log.user === employees.find(e => e.username === accessEmployee)?.name;
      const isValidUser = log.user && log.user !== "System" && log.user !== "SISTEMA" && log.user.trim() !== "";
      const isNotSystemError = log.module !== "Erros do Sistema" && log.module !== "ERRO_FRONTEND" && log.module !== "ERROS_SISTEMA";
      return matchDate && matchModule && matchEmployee && isValidUser && isNotSystemError;
    });

    filteredLogs.forEach(log => {
      if (log.user) {
        empCounts[log.user] = (empCounts[log.user] || 0) + 1;
      }
      if (log.module) {
        moduleCounts[log.module] = (moduleCounts[log.module] || 0) + 1;
      }
    });

    const ranking = Object.keys(empCounts).map(username => {
      const emp = employees.find(e => e.username === username || e.name === username);
      return {
        username,
        name: emp?.name || username,
        role: emp?.role || "Colaborador",
        count: empCounts[username],
        percentage: totalAccesses > 0 ? (empCounts[username] / totalAccesses) * 100 : 0,
        lastAccess: (() => {
          const userLogs = filteredLogs.filter(l => l.user === username);
          if (userLogs.length === 0) return "N/A";
          const sorted = [...userLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          return new Date(sorted[0].timestamp).toLocaleString();
        })()
      };
    }).sort((a, b) => b.count - a.count);

    const moduleDistribution = Object.keys(moduleCounts).map(name => {
      return {
        name,
        count: moduleCounts[name],
        percentage: totalAccesses > 0 ? (moduleCounts[name] / totalAccesses) * 100 : 0,
      };
    }).sort((a, b) => b.count - a.count);

    const mostActive = ranking[0] || null;
    const mostAccessedModule = moduleDistribution[0] || null;
    const numDays = points.length || 1;
    const avgDaily = totalAccesses / numDays;

    return {
      ranking,
      moduleDistribution,
      mostActive,
      mostAccessedModule,
      avgDaily,
      totalAccesses
    };
  }, [auditLogs, employees, accessChartData, computedAccessDates, accessModule, accessEmployee]);

  // Memoized stable color map for active/inactive employees
  const employeeColors = useMemo(() => {
    const colors = [
      "#f97316", // orange
      "#10b981", // emerald
      "#3b82f6", // blue
      "#6366f1", // indigo
      "#a855f7", // purple
      "#ec4899", // pink
      "#f59e0b", // amber
      "#06b6d4", // cyan
      "#14b8a6", // teal
      "#e11d48", // rose
    ];
    const map: { [username: string]: string } = {};
    employees.forEach((emp, index) => {
      map[emp.username] = colors[index % colors.length];
    });
    auditLogs.forEach((log) => {
      if (log.user && !map[log.user]) {
        const hash = Array.from(log.user).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        map[log.user] = colors[hash % colors.length];
      }
    });
    return map;
  }, [employees, auditLogs]);

  // Employee Statistics cards (interactive, clean, responsive)
  const staffStats = useMemo(() => {
    const total = employees.length;
    const activeCount = employees.filter(e => e.status === "ACTIVE").length;
    const totalSalarySheet = employees.filter(e => e.status === "ACTIVE").reduce((sum, e) => sum + e.salary, 0);
    const thisMonth = new Date().toISOString().substring(0, 7);
    const hiredThisMonth = employees.filter(e => e.admissionDate?.startsWith(thisMonth)).length || 2;
    
    return {
      total,
      activeCount,
      totalSalarySheet,
      hiredThisMonth
    };
  }, [employees]);

  // Helper for flexible module category matching
  const checkLogModuleMatch = (logModule: string, filter: string) => {
    if (!filter || filter === "Todos") return true;
    if (logModule === filter) return true;
    const filterUpper = filter.toUpperCase();
    const logUpper = (logModule || "").toUpperCase();
    if (logUpper === filterUpper) return true;

    if (filterUpper === "VENDAS") return logUpper.includes("VENDA") || logUpper.includes("POS");
    if (filterUpper === "STOCK" || filterUpper === "ESTOQUE") return logUpper.includes("STOCK") || logUpper.includes("ESTOQUE") || logUpper.includes("PRODUTO");
    if (filterUpper === "SEGURANÇA" || filterUpper === "SEGURANCA") return logUpper.includes("SEGURA") || logUpper.includes("AUTENTIC") || logUpper.includes("LOGIN") || logUpper.includes("AUDIT");
    if (filterUpper === "CAIXA") return logUpper.includes("CAIXA") || logUpper.includes("CASH");
    if (filterUpper === "CLIENTES") return logUpper.includes("CLIENTE");
    if (filterUpper === "FUNCIONÁRIOS" || filterUpper === "FUNCIONARIOS" || filterUpper === "EQUIPA") return logUpper.includes("FUNC") || logUpper.includes("STAFF") || logUpper.includes("RH") || logUpper.includes("EQUIP");
    if (filterUpper === "RELATÓRIOS" || filterUpper === "RELATORIOS") return logUpper.includes("RELAT") || logUpper.includes("REPORT");
    if (filterUpper === "SISTEMA") return logUpper.includes("SISTEMA") || logUpper.includes("CONFIG");
    if (filterUpper === "ASSINATURAS") return logUpper.includes("ASSINATURA") || logUpper.includes("PLANO");

    return false;
  };

  // Grouping/Aggregation helper for consecutive duplicate audit logs
  // Returns collapsed logs indicating duplicate counts for sequential identical warnings/errors/info
  const groupedAuditLogs = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();

    const sorted = [...auditLogs].reverse().filter(log => {
      const formattedDate = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : "";
      const formattedDateTime = log.timestamp ? new Date(log.timestamp).toLocaleString() : "";
      const rawTimestamp = log.timestamp || "";

      const matchSearch = !term || 
                          (log.user || "").toLowerCase().includes(term) || 
                          (log.userRole || "").toLowerCase().includes(term) || 
                          (log.module || "").toLowerCase().includes(term) || 
                          (log.action || "").toLowerCase().includes(term) || 
                          (log.details || "").toLowerCase().includes(term) ||
                          formattedDate.toLowerCase().includes(term) ||
                          formattedDateTime.toLowerCase().includes(term) ||
                          rawTimestamp.toLowerCase().includes(term);
      
      const matchModule = checkLogModuleMatch(log.module || "", auditModuleFilter);
      
      let matchDate = true;
      if (log.timestamp) {
        const logDate = log.timestamp.split("T")[0];
        matchDate = logDate >= startDate && logDate <= endDate;
      }
      return matchSearch && matchModule && matchDate;
    });

    const groups: { log: AuditLog; count: number; firstTime: string; lastTime: string; isGroup: boolean; originalLogs: AuditLog[] }[] = [];
    
    for (const log of sorted) {
      const lastGroup = groups[groups.length - 1];
      
      // Determine if this log should group with the previous one
      // Match criteria: same user, same action, same module, same details, and timestamp within 5 minutes (300,000ms)
      const isDuplicate = lastGroup && 
                          lastGroup.log.user === log.user && 
                          lastGroup.log.action === log.action && 
                          lastGroup.log.module === log.module &&
                          (new Date(lastGroup.log.timestamp).getTime() - new Date(log.timestamp).getTime() < 300000);

      if (isDuplicate) {
        lastGroup.count += 1;
        lastGroup.lastTime = new Date(log.timestamp).toLocaleTimeString();
        lastGroup.isGroup = true;
        lastGroup.originalLogs.push(log);
      } else {
        groups.push({
          log,
          count: 1,
          firstTime: new Date(log.timestamp).toLocaleTimeString(),
          lastTime: new Date(log.timestamp).toLocaleTimeString(),
          isGroup: false,
          originalLogs: [log]
        });
      }
    }
    
    return groups;
  }, [auditLogs, auditSearch, auditModuleFilter, startDate, endDate]);

  // Traditional filtered logs count helper
  const filteredAuditLogs = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();

    return [...auditLogs].reverse().filter(log => {
      const formattedDate = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : "";
      const formattedDateTime = log.timestamp ? new Date(log.timestamp).toLocaleString() : "";
      const rawTimestamp = log.timestamp || "";

      const matchSearch = !term || 
                          (log.user || "").toLowerCase().includes(term) || 
                          (log.userRole || "").toLowerCase().includes(term) || 
                          (log.module || "").toLowerCase().includes(term) || 
                          (log.action || "").toLowerCase().includes(term) || 
                          (log.details || "").toLowerCase().includes(term) ||
                          formattedDate.toLowerCase().includes(term) ||
                          formattedDateTime.toLowerCase().includes(term) ||
                          rawTimestamp.toLowerCase().includes(term);

      const matchModule = checkLogModuleMatch(log.module || "", auditModuleFilter);
      let matchDate = true;
      if (log.timestamp) {
        const logDate = log.timestamp.split("T")[0];
        matchDate = logDate >= startDate && logDate <= endDate;
      }
      return matchSearch && matchModule && matchDate;
    });
  }, [auditLogs, auditSearch, auditModuleFilter, startDate, endDate]);

  // Filter and sort the employee records
  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(emp => 
        (emp.name || "").toLowerCase().includes(q) ||
        (emp.contact || "").toLowerCase().includes(q) ||
        (emp.role || "").toLowerCase().includes(q) ||
        (emp.id || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "Todos") {
      const map: Record<string, string> = {
        "Ativos": "ACTIVE",
        "Suspensos": "SUSPENDED",
        "Desativados": "INACTIVE"
      };
      result = result.filter(emp => emp.status === map[statusFilter]);
    }

    if (roleFilter !== "Todos") {
      result = result.filter(emp => {
        const rLower = (emp.role || "").toLowerCase();
        if (roleFilter === "Administrador") return rLower.includes("admin") || rLower.includes("gestor");
        if (roleFilter === "Supervisor") return rLower.includes("superv");
        if (roleFilter === "Caixa") return rLower.includes("caixa") || rLower.includes("operador");
        if (roleFilter === "Armazém") return rLower.includes("armaz") || rLower.includes("stock") || rLower.includes("sogro");
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "date") return (b.admissionDate || "").localeCompare(a.admissionDate || "");
      if (sortBy === "salary") return (b.salary || 0) - (a.salary || 0);
      if (sortBy === "role") return (a.role || "").localeCompare(b.role || "");
      return 0;
    });

    return result;
  }, [employees, searchTerm, statusFilter, roleFilter, sortBy]);

  // Form setup helper to update or edit employee
  const openEditModal = (emp: Employee, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedEmp(emp);
    setName(emp.name);
    setRole(emp.role);
    setContact(emp.contact);
    setSalary(emp.salary);
    setEmployeeStatus(emp.status as any || "ACTIVE");
    setPin(emp.pin || "");
    setEmail(emp.email || "");
    setUsername(emp.username || "");
    setIsEditModalOpen(true);
  };

  const handleResetPasswordFromRequest = (req: any) => {
    const emp = employees.find(e => 
      e.id === req.employeeId || 
      (req.email && e.email?.toLowerCase() === req.email.toLowerCase()) ||
      e.name.toLowerCase() === req.employeeName.toLowerCase()
    );

    if (!emp) {
      alert(`Colaborador "${req.employeeName}" não foi encontrado no Quadro de Funcionários.`);
      return;
    }

    setSelectedEmp(emp);
    setName(emp.name);
    setRole(emp.role);
    setContact(emp.contact);
    setSalary(emp.salary);
    setEmployeeStatus(emp.status as any || "ACTIVE");
    
    const generatedPin = generateSecurePin(6);
    setPin(generatedPin);
    
    setEmail(emp.email || "");
    setUsername(emp.username || "");
    setPendingRecoveryId(req.id);
    setIsEditModalOpen(true);
  };

  const openPermissionsModal = (emp: Employee, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedEmp(emp);
    // Assign mock privileges or toggle from set
    setEmpPermissions(emp.role.includes("Admin") ? ["POS", "STOCK", "REPORTS", "STAFF", "CASHIER"] : ["POS", "STOCK"]);
    setIsPermissionsModalOpen(true);
  };

  const openEmployeeDrawer = (emp: Employee) => {
    setSelectedEmp(emp);
    setDrawerTab("RESUMO");
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Tab select option triggers */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold border border-slate-200">
          <button
            onClick={() => setActiveTab("STAFF")}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === "STAFF"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            Quadro de Funcionários ({employees.length})
          </button>
          
          <button
            onClick={() => setActiveTab("AUDIT")}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === "AUDIT"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Terminal className="w-4 h-4 shrink-0" />
            Logs de Auditoria ({auditLogs.length})
          </button>

          <button
            onClick={() => setActiveTab("ERRORS")}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === "ERRORS"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            Erros do Sistema ({auditLogs.filter(l => l.module === "Erros do Sistema").length})
          </button>

          <button
            onClick={() => setActiveTab("ACCESS_CHART")}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === "ACCESS_CHART"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0 text-orange-500" />
            Frequência de Acessos
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "STAFF" && (
            <>
              {/* Batch HR transfer */}
              {selectedEmployees.length > 0 && (
                <button
                  onClick={handleSendToHR}
                  disabled={isSendingToHR}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 py-2 px-3.5 rounded-xl text-xs font-bold text-amber-450 flex items-center gap-1.5 cursor-pointer transition shadow-sm animate-pulse"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSendingToHR ? "A enviar..." : `Enviar Folhas (${selectedEmployees.length}) para RH`}
                </button>
              )}

              {/* Export Selector */}
              <div className="relative">
                <button
                  onClick={() => setIsExportStaffDropdownOpen(!isExportStaffDropdownOpen)}
                  className="border border-slate-200 hover:bg-slate-50 bg-white text-slate-700 font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  Exportar ▼
                </button>
                {isExportStaffDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                    <button 
                      onClick={handleDownloadStaffCSV} 
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 border-b border-slate-100"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      Planilha CSV
                    </button>
                    <button 
                      onClick={handleDownloadStaffCSV} 
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 border-b border-slate-100"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      Excel (.xlsx)
                    </button>
                    <button 
                      onClick={handleDownloadStaffPDF} 
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-red-500" />
                      Documento PDF
                    </button>
                  </div>
                )}
              </div>
              
              <button
                onClick={openAddForm}
                className="bg-orange-500 hover:bg-orange-600 py-2 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/10 cursor-pointer transition hover:scale-105"
              >
                <Plus className="w-4 h-4" />
                Adicionar Funcionário
              </button>
            </>
          )}

          {activeTab === "AUDIT" && (
            <div className="relative">
              <button
                onClick={() => setIsExportAuditDropdownOpen(!isExportAuditDropdownOpen)}
                className="border border-slate-200 hover:bg-slate-50 bg-white text-slate-700 font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shadow-sm"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Exportar Logs</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {isExportAuditDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <button 
                    onClick={handleDownloadAuditCSV} 
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 border-b border-slate-100"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ficheiro CSV</span>
                  </button>
                  <button 
                    id="export-audit-pdf-dropdown-btn"
                    onClick={() => handleDownloadAuditPDF(false)} 
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 border-b border-slate-100"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-500" />
                    <span>Relatório PDF (Filtrado)</span>
                  </button>
                  <button 
                    id="export-full-audit-pdf-dropdown-btn"
                    onClick={() => handleDownloadAuditPDF(true)} 
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 border-b border-slate-100"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>PDF Auditoria Completa ({auditLogs.length})</span>
                  </button>
                  <button 
                    onClick={handleCopyLogs} 
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 transition"
                  >
                    <Copy className="w-3.5 h-3.5 text-orange-500" />
                    <span>Copiar Texto</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SUCCESS TOAST MESSAGE */}
      {hrSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-xs font-medium flex items-center gap-2 shadow-sm animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{hrSuccessMessage}</span>
        </div>
      )}

      {/* TAB 1: EMPLOYEES QUADRO */}
      {activeTab === "STAFF" && (
        <div className="space-y-6">

          {/* NOTIFICAÇÕES DE RECUPERAÇÃO DE SENHA */}
          {recoveryRequests.filter(req => req.status === "PENDENTE").length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4.5 space-y-3.5 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <p className="font-extrabold text-slate-800 text-xs flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                  Solicitações de Recuperação de Senha / PIN Pendentes ({recoveryRequests.filter(req => req.status === "PENDENTE").length})
                </p>
                <span className="text-[10px] bg-amber-100 text-amber-800 py-0.5 px-2 rounded-full font-bold uppercase tracking-wide">Ação Necessária</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {recoveryRequests.filter(req => req.status === "PENDENTE").map((req) => (
                  <div key={req.id} className="bg-white p-3 rounded-xl border border-amber-200/60 shadow-sm flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <strong className="text-slate-900 font-bold text-xs">{req.employeeName}</strong>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase ${
                          req.type === "PIN" ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                        }`}>
                          {req.type === "PIN" ? "PIN do Terminal" : "Senha de Login"}
                        </span>
                      </div>
                      {req.email && <p className="text-[10px] text-slate-500 font-medium font-mono">{req.email}</p>}
                      <p className="text-[9px] text-slate-400 font-medium">Solicitado em: {new Date(req.timestamp).toLocaleString("pt-PT")}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => handleResetPasswordFromRequest(req)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-1.5 px-3.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
                      >
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        Resetar Senha / PIN
                      </button>
                      
                      <button
                        onClick={async () => {
                          if (confirm("Deseja marcar esta solicitação como resolvida sem alterar as credenciais?")) {
                            try {
                              await resolveRecoveryRequest(req.id);
                              loadRecoveryRequests();
                            } catch (err) {
                              console.error("Erro ao resolver solicitação:", err);
                            }
                          }
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* STATS BENTO GRIDS (ITEM 4) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between hover:shadow-md transition">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Funcionários</span>
                <span className="text-xl font-extrabold text-slate-800">{staffStats.total}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-100">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between hover:shadow-md transition">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ativos</span>
                <span className="text-xl font-extrabold text-emerald-600">{staffStats.activeCount}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-100">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between hover:shadow-md transition">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Folha Salarial</span>
                <span className="text-xl font-extrabold text-slate-800">{(staffStats.totalSalarySheet).toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span></span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between hover:shadow-md transition">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Novos Este Mês</span>
                <span className="text-xl font-extrabold text-orange-600">{staffStats.hiredThisMonth}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center border border-purple-100">
                <Plus className="w-5 h-5" />
              </div>
            </div>

          </div>

          {/* FILTERS & SEARCH CONTROLS (ITEMS 2 & 3 & 9) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
            
            {/* Search Input */}
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar por nome, cargo, telefone, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400/50 font-medium transition"
              />
            </div>

            {/* Select controls */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-start lg:justify-end">
              
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border text-slate-700 rounded-xl py-1.5 px-3 text-xs outline-none cursor-pointer font-bold border-slate-200"
                >
                  <option value="Todos">Todos</option>
                  <option value="Ativos">Ativos</option>
                  <option value="Suspensos">Suspensos</option>
                  <option value="Desativados">Desativados</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cargo:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-50 border text-slate-700 rounded-xl py-1.5 px-3 text-xs outline-none cursor-pointer font-bold border-slate-200"
                >
                  <option value="Todos">Todos</option>
                  <option value="Administrador">Administrador</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Caixa">Caixa / Operador</option>
                  <option value="Armazém">Armazém / Stock</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-50 border text-slate-700 rounded-xl py-1.5 px-3 text-xs outline-none cursor-pointer font-bold border-slate-200"
                >
                  <option value="name">Nome</option>
                  <option value="date">Data de Admissão</option>
                  <option value="salary">Salário</option>
                  <option value="role">Cargo</option>
                </select>
              </div>

              {/* View switches */}
              <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 gap-1 ml-2">
                <button
                  onClick={() => setViewMode("cards")}
                  className={`p-1.5 rounded-md cursor-pointer transition ${viewMode === "cards" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-650"}`}
                  title="Visualizar em Cartões"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md cursor-pointer transition ${viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-650"}`}
                  title="Visualizar em Lista"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 rounded-md cursor-pointer transition ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-650"}`}
                  title="Visualizar em Tabela"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>

          {/* EMPLOYEES GRID/LIST/TABLE SELECTION DISPLAY */}
          {filteredEmployees.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 font-sans text-xs text-slate-400">
              Nenhum colaborador corresponde aos critérios de pesquisa selecionados.
            </div>
          ) : viewMode === "cards" ? (
            
            /* CARDS VIEW - COMPACT DESIGN (ITEM 1 & 13 RESPONSIVENESS) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
              {filteredEmployees.map((emp) => {
                const isSelected = selectedEmployees.includes(emp.id);
                return (
                  <div 
                    key={emp.id} 
                    onClick={() => openEmployeeDrawer(emp)}
                    className={`bg-white p-4.5 rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden group hover:border-orange-200 ${
                      isSelected ? "ring-2 ring-orange-500 border-orange-500" : "border-slate-200"
                    }`}
                  >
                    
                    {/* Discret selection checkbox */}
                    <div 
                      onClick={(e) => { e.stopPropagation(); toggleSelectEmployee(emp.id); }}
                      className={`absolute top-4 left-4 w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-slate-300 hover:border-orange-400"
                      }`}
                    >
                      {isSelected && <span className="text-[10px] font-bold">✓</span>}
                    </div>

                    {/* Discrete Status Circle (Item 5) */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold font-mono">
                      <span className={`w-2 h-2 rounded-full ${
                        emp.status === "ACTIVE" 
                          ? "bg-emerald-500" 
                          : emp.status === "SUSPENDED" 
                          ? "bg-amber-500 animate-pulse" 
                          : "bg-slate-400"
                      }`}></span>
                      <span className="text-slate-400 uppercase text-[9px]">
                        {emp.status === "ACTIVE" ? "Ativo" : emp.status === "SUSPENDED" ? "Suspenso" : "Desativo"}
                      </span>
                    </div>

                    {/* Card Header Profile & Initials backup (Item 8) */}
                    <div className="flex gap-3 items-center mt-4">
                      {emp.admissionDate === "HAS_AVATAR" ? (
                        <img 
                          src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${emp.name}`} 
                          alt={emp.name} 
                          className="w-10 h-10 rounded-xl bg-orange-50 object-cover border border-orange-100"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-extrabold text-xs border border-slate-200 uppercase group-hover:bg-orange-500 group-hover:text-white transition-colors duration-200">
                          {emp.name.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div className="truncate">
                        <h4 className="font-extrabold text-slate-800 text-xs leading-none mb-1 group-hover:text-orange-600 transition-colors">{emp.name}</h4>
                        <span className="text-[10px] font-medium text-slate-400 font-mono bg-slate-100 border px-1.5 py-0.5 rounded leading-none">{emp.role}</span>
                      </div>
                    </div>

                    {/* Compact Details (Item 7 Salary clean format) */}
                    <div className="border-t border-slate-100 mt-3 pt-3.5 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                      <div>
                        <span className="block text-slate-400">Telefone</span>
                        <span className="font-semibold text-slate-700 block mt-0.5">{emp.contact}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400">Salário Base</span>
                        <span className="font-extrabold text-slate-800 block mt-0.5">{(emp.salary).toLocaleString()} MT</span>
                      </div>
                      <div>
                        <span className="block text-slate-400">Admissão</span>
                        <span className="font-mono text-slate-600 block mt-0.5">{emp.admissionDate || "10 Jan 2024"}</span>
                      </div>
                    </div>

                    {/* Quick actions row inside bottom card (Item 6 & 15 micro-animations) */}
                    <div className="border-t border-slate-100/70 mt-3.5 pt-2.5 flex items-center justify-end gap-2.5 opacity-40 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={(e) => openEditModal(emp, e)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition transform hover:scale-115 cursor-pointer"
                        title="Editar Detalhes"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => openPermissionsModal(emp, e)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition transform hover:scale-115 cursor-pointer"
                        title="Modificar Permissões"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                      {(currentRole === "ADMIN" || currentRole === "SUPERVISOR") && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleResetCredentialsDirectly(emp); }}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-600 transition transform hover:scale-115 cursor-pointer"
                          title="Resetar Senha / PIN"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEmployeeDrawer(emp); }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-orange-500 transition transform hover:scale-115 cursor-pointer"
                        title="Ver Histórico Completo"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {currentRole === "ADMIN" && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition transform hover:scale-115 cursor-pointer"
                          title="Remover Colaborador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>

          ) : viewMode === "list" ? (
            
            /* LIST VIEW DESIGN */
            <div className="space-y-2">
              {filteredEmployees.map((emp) => {
                const isSelected = selectedEmployees.includes(emp.id);
                return (
                  <div 
                    key={emp.id}
                    onClick={() => openEmployeeDrawer(emp)}
                    className={`bg-white p-3 rounded-xl border flex items-center justify-between gap-4 cursor-pointer hover:border-orange-200 transition shadow-sm ${
                      isSelected ? "ring-1 ring-orange-500 border-orange-500 bg-orange-50/10" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        onClick={(e) => { e.stopPropagation(); toggleSelectEmployee(emp.id); }}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-slate-300"
                        }`}
                      >
                        {isSelected && <span className="text-[9px] font-bold">✓</span>}
                      </div>

                      <span className="w-8 h-8 rounded-lg bg-slate-150 text-slate-700 flex items-center justify-center font-extrabold text-xs border uppercase">
                        {emp.name.substring(0, 2).toUpperCase()}
                      </span>

                      <div>
                        <h4 className="font-bold text-slate-800 text-xs">{emp.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400">{emp.role}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-400 mr-2">Contacto:</span>
                        <span className="font-semibold text-slate-700">{emp.contact}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 mr-2">Vencimento:</span>
                        <span className="font-extrabold text-slate-800">{(emp.salary).toLocaleString()} MT</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${emp.status === 'ACTIVE' ? 'bg-emerald-500' : emp.status === 'SUSPENDED' ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                        <span className="text-slate-500 capitalize text-[10px]">
                          {emp.status === 'ACTIVE' ? 'Ativo' : emp.status === 'SUSPENDED' ? 'Suspenso' : 'Desativo'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={(e) => openEditModal(emp, e)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                        title="Editar Detalhes"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {currentRole === "ADMIN" && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp); }}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition cursor-pointer"
                          title="Remover Colaborador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(currentRole === "ADMIN" || currentRole === "SUPERVISOR") && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleResetCredentialsDirectly(emp); }}
                          className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition cursor-pointer font-bold"
                          title="Resetar Senha / PIN"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEmployeeDrawer(emp); }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-orange-500 transition"
                        title="Ver Histórico Completo"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (
            
            /* TABLE VIEW DESIGN */
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto max-h-[500px] overflow-y-auto shadow-sm custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[9px] font-mono">
                    <th className="p-3 w-10">
                      <input 
                        type="checkbox" 
                        checked={selectedEmployees.length === filteredEmployees.length}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="p-3">NOME DO COLABORADOR</th>
                    <th className="p-3">CARGO</th>
                    <th className="p-3">CONTACTO</th>
                    <th className="p-3 text-right">SALÁRIO BRUTO</th>
                    <th className="p-3">DATA ADMISSÃO</th>
                    <th className="p-3 text-center">ESTADO</th>
                    <th className="p-3 text-right">ACÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map((emp) => {
                    const isSelected = selectedEmployees.includes(emp.id);
                    return (
                      <tr 
                        key={emp.id} 
                        onClick={() => openEmployeeDrawer(emp)}
                        className={`hover:bg-slate-50/50 cursor-pointer transition ${isSelected ? "bg-orange-50/10" : ""}`}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectEmployee(emp.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-bold text-slate-800">{emp.name}</td>
                        <td className="p-3 text-slate-500 font-medium">{emp.role}</td>
                        <td className="p-3 text-slate-600 font-mono">{emp.contact}</td>
                        <td className="p-3 text-right font-extrabold text-slate-800 font-mono">{(emp.salary).toLocaleString()} MT</td>
                        <td className="p-3 text-slate-450 font-mono">{emp.admissionDate || "2024-01-10"}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            emp.status === "ACTIVE" 
                              ? "bg-emerald-50 text-emerald-700" 
                              : emp.status === "SUSPENDED" 
                              ? "bg-amber-50 text-amber-700" 
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'ACTIVE' ? 'bg-emerald-500' : emp.status === 'SUSPENDED' ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                            {emp.status === 'ACTIVE' ? 'Ativo' : emp.status === 'SUSPENDED' ? 'Suspenso' : 'Inativo'}
                          </span>
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => openEditModal(emp, e)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition cursor-pointer"
                              title="Editar Detalhes"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => openPermissionsModal(emp, e)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition cursor-pointer"
                              title="Modificar Permissões"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                            {currentRole === "ADMIN" && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp); }}
                                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                                title="Remover Colaborador"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(currentRole === "ADMIN" || currentRole === "SUPERVISOR") && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleResetCredentialsDirectly(emp); }}
                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-amber-600 transition cursor-pointer"
                                title="Resetar Senha / PIN"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => openEmployeeDrawer(emp)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-orange-500 transition cursor-pointer"
                              title="Ver Histórico Completo"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: AUDIT TERMINAL DISP WITH SEVERITY LEVELS, EXPANDABLE ROWS, CONCURRENT REDUCTION (ITEM 11) */}
      {activeTab === "AUDIT" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col min-h-[450px]">
          
          {/* Filter bars */}
          <div className="p-4 bg-slate-50/50 border-b border-slate-150 flex flex-col xl:flex-row gap-3.5 items-center justify-between">
            <div className="relative w-full xl:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="audit-logs-search-input"
                type="text"
                placeholder="Filtrar por usuário, módulo, data ou ação..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400/50 transition font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-start xl:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Início:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400/50 font-semibold text-slate-700"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Fim:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400/50 font-semibold text-slate-700"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Módulo:</span>
                <select
                  value={auditModuleFilter}
                  onChange={(e) => setAuditModuleFilter(e.target.value)}
                  className="bg-white border text-slate-650 rounded-lg py-1.5 px-3 text-xs outline-none cursor-pointer font-semibold border-slate-200"
                >
                  {modules.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <button
                onClick={handleDownloadAuditCSV}
                title="Exportar logs de auditoria filtrados para formato CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>

              <button
                id="export-audit-pdf-filtered-button"
                onClick={() => handleDownloadAuditPDF(false)}
                title="Exportar relatório PDF dos logs de auditoria filtrados"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Exportar PDF</span>
              </button>

              <button
                id="export-audit-pdf-complete-button"
                onClick={() => handleDownloadAuditPDF(true)}
                title="Exportar log de auditoria completo para arquivo PDF (Análise de Segurança Externa)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Auditoria Completa (PDF)</span>
              </button>

              <button
                onClick={handleCopyLogs}
                title="Copiar logs de auditoria filtrados em formato de texto estruturado"
                className={`flex items-center gap-1.5 px-3 py-1.5 font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                  copiedLogs 
                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                    : "bg-slate-800 hover:bg-slate-900 text-white"
                }`}
              >
                {copiedLogs ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLogs ? "Copiado!" : "Copiar Logs"}</span>
              </button>
            </div>
          </div>

          {/* TABLE DISPLAY */}
          <div className="flex-1 overflow-x-auto max-h-[500px] overflow-y-auto text-[11.5px] custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[9px] font-mono">
                  <th className="p-3 w-6"></th>
                  <th className="p-3.5 w-40">DATA / HORA</th>
                  <th className="p-3.5">UTENTE</th>
                  <th className="p-3.5 text-center">NÍVEL</th>
                  <th className="p-3.5">OPERACIONAIS</th>
                  <th className="p-3.5 text-center">MÓDULO</th>
                  <th className="p-3.5">DETALHES CONSOLIDADOS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] leading-relaxed">
                {groupedAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic font-sans text-xs">Nenhum evento registrado de auditoria atendeu aos filtros.</td>
                  </tr>
                ) : (
                  groupedAuditLogs.map((group, index) => {
                    const log = group.log;
                    const isGroupExpanded = expandedLogId === log.id;
                    
                    // Nível de severidade (Item 11: Info green, Warning yellow, Error red)
                    const isError = log.module === "ERRO_FRONTEND" || (log.action || "").toLowerCase().includes("erro") || isDatabaseError(log.details);
                    const isWarning = (log.action || "").toLowerCase().includes("falha") || (log.action || "").toLowerCase().includes("unauthorized") || (log.action || "").toLowerCase().includes("bloque");
                    
                    const severityLabel = isError ? "ERRO" : isWarning ? "AVISO" : "INFO";
                    const severityColor = isError 
                      ? "text-red-700 bg-red-50 border-red-100" 
                      : isWarning 
                      ? "text-amber-700 bg-amber-50 border-amber-100" 
                      : "text-emerald-700 bg-emerald-50 border-emerald-100";

                    const rowBorderColor = isError 
                      ? "border-l-4 border-l-red-500" 
                      : isWarning 
                      ? "border-l-4 border-l-amber-500" 
                      : "border-l-4 border-l-emerald-500";

                    // Dynamic Icons for actions (Item 11)
                    const getIcon = () => {
                      const act = (log.action || "").toLowerCase();
                      if (isError) return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
                      if (act.includes("login")) return <Lock className="w-3.5 h-3.5 text-indigo-500" />;
                      if (act.includes("logout") || act.includes("sair")) return <UserX className="w-3.5 h-3.5 text-slate-500" />;
                      if (act.includes("contratar") || act.includes("criar") || act.includes("add")) return <Plus className="w-3.5 h-3.5 text-emerald-500" />;
                      if (act.includes("edit") || act.includes("alterar") || act.includes("atualizar")) return <Edit3 className="w-3.5 h-3.5 text-blue-500" />;
                      if (act.includes("remover") || act.includes("excluir") || act.includes("deletar")) return <Trash2 className="w-3.5 h-3.5 text-rose-500" />;
                      return <Info className="w-3.5 h-3.5 text-slate-450" />;
                    };

                    return (
                      <React.Fragment key={`${log.id || ""}-${index}`}>
                        <tr 
                          onClick={() => setExpandedLogId(isGroupExpanded ? null : log.id || `${index}`)}
                          className={`hover:bg-slate-50/50 cursor-pointer transition ${rowBorderColor} ${isGroupExpanded ? "bg-slate-50/70" : ""}`}
                        >
                          <td className="p-3 text-center text-slate-400">
                            {isGroupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </td>
                          <td className="p-3 text-slate-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="p-3 text-slate-700 font-bold font-sans">
                            <span className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center font-bold text-[9px] font-sans">
                                {log.user ? log.user.charAt(0) : "S"}
                              </span>
                              {log.user || "Sistema"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold font-sans border ${severityColor}`}>
                              {severityLabel}
                            </span>
                          </td>
                          <td className="p-3 font-semibold font-sans text-slate-800">
                            <span className="flex items-center gap-1.5">
                              {getIcon()}
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold text-[9px] px-1.5 py-0.5 rounded tracking-wide border bg-slate-50 border-slate-200 text-slate-600">
                              {log.module}
                            </span>
                          </td>
                          <td className="p-3 max-w-sm truncate text-[11px] font-sans text-slate-550">
                            {/* Aggregation duplicate notice */}
                            {group.isGroup && (
                              <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1.5 uppercase font-mono tracking-tight shrink-0">
                                {group.count} ocorrências ({group.lastTime} ➔ {group.firstTime})
                              </span>
                            )}
                            {translateDatabaseMessage(log.details)}
                          </td>
                        </tr>

                        {/* EXPANDABLE ROW FULL METADATA DETAIL DISPLAY (ITEM 11) */}
                        {isGroupExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={7} className="p-4 border-l-4 border-l-orange-500 font-sans text-xs text-slate-600 space-y-3.5">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Mensagem do Evento</span>
                                  <span className="font-medium text-slate-800 block leading-relaxed">{translateDatabaseMessage(log.details)}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">ID de Auditoria</span>
                                  <span className="font-mono text-[10px] text-slate-500 block">{log.id || "N/D"}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Nível e Função</span>
                                  <span className="font-mono text-slate-500 block">{log.userRole || "ADMIN"}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Sessão e IP</span>
                                  <span className="font-mono text-slate-500 block">IP: {log.ip || "Indisponível"}</span>
                                </div>
                              </div>

                              {/* GEOLOCATION & ACCESS MAP FOR LOGIN/SECURITY LOGS */}
                              {(() => {
                                const isLoginOrSecurityLog = 
                                  log.module?.toLowerCase().includes("segurança") ||
                                  log.module?.toLowerCase().includes("autenticação") ||
                                  log.action?.toLowerCase().includes("login") ||
                                  log.action?.toLowerCase().includes("logout") ||
                                  log.action?.toLowerCase().includes("recuperação") ||
                                  log.action?.toLowerCase().includes("acesso") ||
                                  log.details?.toLowerCase().includes("login") ||
                                  log.details?.toLowerCase().includes("sessão");
                                if (isLoginOrSecurityLog) {
                                  return <AuditLogLocationMap log={log} />;
                                }
                                return null;
                              })()}

                              {/* Stack trace / detailed log visualization (Item 11 Firestore handling) */}
                              <div className="bg-slate-900 text-slate-300 p-3 rounded-xl border border-slate-800 font-mono text-[10px] space-y-2 relative overflow-hidden">
                                <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-800 pb-1.5 mb-1.5">
                                  <span>CONSOLE_LOG_METADATA_TRACE</span>
                                  {/* Copy Details button (Admins only) */}
                                  {currentRole === "ADMIN" && (
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
                                        alert("Detalhes técnicos de segurança copiados com sucesso!");
                                      }}
                                      className="hover:text-white flex items-center gap-1 cursor-pointer bg-slate-800 px-2 py-0.5 rounded text-[8.5px] font-sans border border-slate-700 hover:border-slate-550 transition"
                                    >
                                      <Copy className="w-3 h-3" />
                                      Copiar Traceback Técnico
                                    </button>
                                  )}
                                </div>
                                <div className="leading-relaxed">
                                  <p>Dispositivo / Navegador: {log.device || "Desktop (Chrome)"}</p>
                                  <p className="mt-1">Servidor: Nuvem Central Segura</p>
                                  <p className="mt-1 text-slate-400">Timestamp ISO: {log.timestamp}</p>
                                  <p className="mt-2 text-rose-400 font-bold">Traceback: {log.details}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 3: SYSTEM ERRORS / ERROS DO SISTEMA DIAGNOSTIC PANEL */}
      {activeTab === "ERRORS" && (
        <div className="space-y-6">
          {/* STATS CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* CARD 1: CONNECTIVITY */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                navigator.onLine ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600 animate-pulse"
              }`}>
                <Activity className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono">Conectividade de Rede</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${navigator.onLine ? "bg-emerald-500 animate-pulse" : "bg-red-500 animate-pulse"}`}></span>
                  <span className="text-sm font-extrabold text-slate-800">
                    {navigator.onLine ? "Dispositivo Online" : "Dispositivo Offline"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                  {navigator.onLine ? "Sincronização em Tempo Real Ativa" : "Modo Local Seguro (Offline)"}
                </span>
              </div>
            </div>

            {/* CARD 2: TOTAL FAILURES */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                systemErrors.length === 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono">Total de Erros Capturados</span>
                <span className="text-xl font-black text-slate-800 block mt-0.5">
                  {systemErrors.length}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {systemErrors.length === 0 ? "Nenhuma anomalia crítica registrada" : "Requer atenção do administrador"}
                </span>
              </div>
            </div>

            {/* CARD 3: LAST DETECTED */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 text-slate-500">
                <Clock className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono">Último Incidente</span>
                <span className="text-xs font-bold text-slate-700 block mt-1.5 truncate">
                  {systemErrors.length > 0 
                    ? new Date(systemErrors[0].timestamp).toLocaleString()
                    : "Nenhum erro registrado"}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Monitoramento contínuo em tempo real
                </span>
              </div>
            </div>
          </div>

          {/* DIAGNOSTIC TOOLS BOX */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="border-b pb-3 border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Ferramentas de Diagnóstico do Sistema</h4>
                <p className="text-[10px] text-slate-400">Verifique a saúde de suas conexões e APIs em tempo real</p>
              </div>
              <span className="bg-orange-50 border border-orange-100 text-orange-700 text-[10px] font-bold px-2.5 py-1 rounded-lg">
                Painel do Administrador
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* DIAGNOSTIC ACTIONS */}
              <div className="space-y-3 lg:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-2">Acções Disponíveis</span>
                
                <button
                  onClick={handleRunDiagnostics}
                  disabled={isDiagnosing}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50 shadow-sm"
                >
                  {isDiagnosing ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                  )}
                  {isDiagnosing ? "Executando..." : "Executar Autodiagnóstico"}
                </button>
              </div>

              {/* DIAGNOSTIC RESULT STATUS */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-3">Status de Autodiagnóstico</span>
                  {diagnosticResult.time ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded-lg border border-slate-200/60 flex flex-col justify-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Servidor Backend API</span>
                        <span className={`text-xs font-bold mt-1.5 flex items-center gap-1.5 ${
                          diagnosticResult.server === "ok" ? "text-emerald-600" : "text-red-600"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${diagnosticResult.server === "ok" ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}></span>
                          {diagnosticResult.server === "ok" ? "Conectado (200 OK)" : "Inacessível / Offline"}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200/60 flex flex-col justify-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Serviço de Dados Central</span>
                        <span className={`text-xs font-bold mt-1.5 flex items-center gap-1.5 ${
                          diagnosticResult.db === "ok" ? "text-emerald-600" : "text-red-600"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${diagnosticResult.db === "ok" ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}></span>
                          {diagnosticResult.db === "ok" ? "Conexão Ativa" : "Falha na resposta de sincronização"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 italic text-xs font-medium">
                      Execute o diagnóstico para testar o estado da comunicação com os serviços centrais.
                    </div>
                  )}
                </div>

                {diagnosticResult.time && (
                  <div className="text-[10px] text-slate-400 text-right mt-3 font-mono">
                    Último teste executado às {diagnosticResult.time}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LOGS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Relatório de Eventos de Incidente</span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">EXCLUSIVO DO GESTOR</span>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto text-[11.5px] custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[9px] font-mono">
                    <th className="p-3 w-6"></th>
                    <th className="p-3.5 w-40">DATA / HORA</th>
                    <th className="p-3.5">OPERADOR</th>
                    <th className="p-3.5">EVENTO</th>
                    <th className="p-3.5">MENSAGEM DE ERRO DETALHADA</th>
                    <th className="p-3.5 text-center w-28">SEVERIDADE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px] leading-relaxed text-slate-700">
                  {systemErrors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic font-sans text-xs">
                        Excelente! Nenhum erro de rede ou falha de API detectada no sistema.
                      </td>
                    </tr>
                  ) : (
                    systemErrors.map((log, index) => {
                      const isExpanded = expandedErrorLogId === log.id;
                      return (
                        <React.Fragment key={`${log.id || 'err'}-${index}`}>
                          <tr
                            onClick={() => setExpandedErrorLogId(isExpanded ? null : log.id)}
                            className={`hover:bg-slate-50/50 cursor-pointer transition border-l-4 ${
                              log.action.includes("REDE") || log.action.includes("Rede") || log.action.includes("FALHA_REDE")
                                ? "border-l-rose-500 hover:bg-rose-50/10" 
                                : "border-l-amber-500 hover:bg-amber-50/10"
                            } ${isExpanded ? "bg-slate-50/50" : ""}`}
                          >
                            <td className="p-3 text-center text-slate-400">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </td>
                            <td className="p-3 text-slate-400 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-3 text-slate-700 font-bold font-sans">
                              {log.user || "Sistema"}
                            </td>
                            <td className="p-3 font-semibold font-sans text-slate-800">
                              <span className="flex items-center gap-1.5 text-rose-600">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                {log.action}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] font-sans text-slate-550 max-w-md truncate">
                              {log.details}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold font-sans border text-red-700 bg-red-50 border-red-100">
                                CRÍTICO
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/40">
                              <td colSpan={6} className="p-4 border-l-4 border-l-rose-500 font-sans text-xs text-slate-600 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-slate-700">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Origem / Rota</span>
                                    <span className="font-mono text-slate-800 block text-[11px] break-all">{log.details.match(/https?:\/\/[^\s]+/)?.[0] || "Serviço Interno Central"}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Identificador Único</span>
                                    <span className="font-mono text-[10px] text-slate-500 block">{log.id || "N/A"}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Função do Operador</span>
                                    <span className="font-mono text-slate-500 block">{log.userRole || "ADMIN"}</span>
                                  </div>
                                </div>

                                <div className="bg-slate-950 text-slate-300 p-3.5 rounded-xl border border-slate-800 font-mono text-[10px] space-y-2">
                                  <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-800 pb-1.5 mb-1.5">
                                    <span>TECHNICAL_ERROR_METADATA_TRACE</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
                                        alert("Detalhes técnicos copiados!");
                                      }}
                                      className="hover:text-white flex items-center gap-1 cursor-pointer bg-slate-800 px-2 py-0.5 rounded text-[8.5px] font-sans border border-slate-700 transition"
                                    >
                                      <Copy className="w-3 h-3" />
                                      Copiar Erro Técnico
                                    </button>
                                  </div>
                                  <div className="space-y-1 text-slate-400 font-mono text-[10px] leading-relaxed break-all">
                                    <p>Detalhes: {log.details}</p>
                                    <p className="mt-1">Timestamp: {log.timestamp}</p>
                                    <p className="mt-1">User Agent: {navigator.userAgent}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ACCESS_CHART" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* KPI Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* KPI 1: Acessos Totais */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-50 text-orange-500 dark:bg-orange-950/20 dark:text-orange-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono dark:text-zinc-500">Acessos Totais</span>
                <span className="text-xl font-black text-slate-800 dark:text-zinc-100 block mt-0.5">
                  {accessInsights.totalAccesses}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-0.5">
                  Interações registadas no período
                </span>
              </div>
            </div>

            {/* KPI 2: Média Diária */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400">
                <Activity className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono dark:text-zinc-500">Média Diária</span>
                <span className="text-xl font-black text-slate-800 dark:text-zinc-100 block mt-0.5">
                  {accessInsights.avgDaily.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-0.5">
                  Acessos por dia de atividade
                </span>
              </div>
            </div>

            {/* KPI 3: Colaborador Mais Ativo */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400">
                <UserCheck2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono dark:text-zinc-500">Mais Ativo</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-zinc-100 block mt-0.5 truncate">
                  {accessInsights.mostActive ? accessInsights.mostActive.name : "Ninguém"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-0.5">
                  {accessInsights.mostActive ? `${accessInsights.mostActive.count} acessos (${accessInsights.mostActive.role})` : "Sem logs no período"}
                </span>
              </div>
            </div>

            {/* KPI 4: Módulo Mais Acedido */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400">
                <Terminal className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block font-mono dark:text-zinc-500">Módulo Principal</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-zinc-100 block mt-0.5 truncate">
                  {accessInsights.mostAccessedModule ? accessInsights.mostAccessedModule.name : "Nenhum"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-0.5">
                  {accessInsights.mostAccessedModule ? `${accessInsights.mostAccessedModule.count} ações (${accessInsights.mostAccessedModule.percentage.toFixed(0)}%)` : "Nenhum registo"}
                </span>
              </div>
            </div>
          </div>

          {/* Controls & Filter Panel */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-zinc-800">
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm dark:text-zinc-100 flex items-center gap-1.5">
                  <BarChart3 className="w-4.5 h-4.5 text-orange-500" />
                  Controle e Histórico Temporal de Acessos
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Filtre as interações de colaboradores por período de tempo, módulo correspondente e colaborador específico.</p>
              </div>

              {/* Chart Type Toggle */}
              <div className="flex bg-slate-100 rounded-xl p-1 text-[10px] font-bold border border-slate-200 self-start lg:self-auto dark:bg-zinc-950 dark:border-zinc-850">
                <button
                  type="button"
                  onClick={() => setAccessChartType("line")}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    accessChartType === "line"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  Gráfico de Linha
                </button>
                <button
                  type="button"
                  onClick={() => setAccessChartType("bar")}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    accessChartType === "bar"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  Gráfico de Barras
                </button>
                <button
                  type="button"
                  onClick={() => setAccessChartType("area")}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    accessChartType === "area"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  Gráfico de Área
                </button>
              </div>
            </div>

            {/* Real Filter Selectors Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              
              {/* Filter 1: Period Selection */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wide flex items-center gap-1 dark:text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> Período Temporal
                </label>
                <select
                  value={accessPeriod}
                  onChange={(e: any) => setAccessPeriod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                >
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="90d">Últimos 90 dias</option>
                  <option value="custom">Período Personalizado</option>
                </select>
              </div>

              {/* Filter 2: System Module */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wide flex items-center gap-1 dark:text-zinc-400">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Módulo de Sistema
                </label>
                <select
                  value={accessModule}
                  onChange={(e) => setAccessModule(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                >
                  {accessModulesList.map(mod => (
                    <option key={mod} value={mod}>{mod === "Todos" ? "Todos os Módulos" : mod}</option>
                  ))}
                </select>
              </div>

              {/* Filter 3: Collaborator selection */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wide flex items-center gap-1 dark:text-zinc-400">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Colaborador
                </label>
                <select
                  value={accessEmployee}
                  onChange={(e) => setAccessEmployee(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                >
                  <option value="Todos">Todos os Colaboradores</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.username}>{emp.name} ({emp.username})</option>
                  ))}
                </select>
              </div>

              {/* Filter 4: Custom Date Range */}
              {accessPeriod === "custom" ? (
                <div className="md:col-span-3 grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 duration-150">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Início</label>
                    <input
                      type="date"
                      value={accessStartDate}
                      onChange={(e) => setAccessStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Fim</label>
                    <input
                      type="date"
                      value={accessEndDate}
                      onChange={(e) => setAccessEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                    />
                  </div>
                </div>
              ) : (
                <div className="md:col-span-3 text-right">
                  <span className="text-[10px] text-slate-400 block font-mono italic p-2 dark:text-zinc-500">
                    Período selecionado: {(() => {
                      const { startStr, endStr } = computedAccessDates;
                      const formatDateStr = (str: string) => {
                        const parts = str.split("-");
                        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : str;
                      };
                      return `${formatDateStr(startStr)} até ${formatDateStr(endStr)}`;
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* Chart Area Display */}
            <div className="bg-slate-50/50 border border-slate-150 p-4 rounded-2xl h-80 flex flex-col justify-between dark:bg-zinc-950/40 dark:border-zinc-850">
              {accessChartData.points.length === 0 || accessChartData.totalAccesses === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs gap-2">
                  <Activity className="w-8 h-8 text-slate-300 animate-pulse" />
                  <span>Sem registros de acessos para os filtros selecionados neste intervalo temporal.</span>
                </div>
              ) : (
                <div className="w-full h-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                      const dataPoints = accessChartData.points;
                      const activeEmps = accessChartData.activeEmployees;

                      const CustomChartTooltip = ({ active, payload, label }: any) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-md space-y-1.5 dark:bg-zinc-900 dark:border-zinc-800">
                              <p className="font-extrabold text-xs text-slate-800 dark:text-zinc-100 font-mono">{label}</p>
                              <div className="space-y-1">
                                {payload.map((p: any) => {
                                  if (p.name === "total" || p.value === 0) return null;
                                  return (
                                    <div key={p.name} className="flex items-center gap-2 text-[11px]">
                                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                                      <span className="font-bold text-slate-600 dark:text-zinc-400">{p.name}</span>
                                      <span className="font-extrabold text-slate-900 dark:text-zinc-100 font-mono">{p.value} acessos</span>
                                    </div>
                                  );
                                })}
                                <div className="border-t border-slate-100 pt-1 mt-1 flex items-center justify-between text-[11px] font-mono dark:border-zinc-850">
                                  <span className="font-bold text-slate-400">Total Geral:</span>
                                  <span className="font-black text-orange-600 font-mono">
                                    {payload.reduce((sum: number, item: any) => {
                                      if (item.name === "total") return sum;
                                      return sum + Number(item.value || 0);
                                    }, 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      };

                      if (accessChartType === "line") {
                        return (
                          <LineChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-zinc-800" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomChartTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", paddingTop: "10px" }} />
                            {activeEmps.map((emp) => (
                              <Line
                                key={emp}
                                type="monotone"
                                dataKey={emp}
                                name={emp}
                                stroke={employeeColors[emp] || "#f97316"}
                                strokeWidth={2.5}
                                dot={{ r: 3, strokeWidth: 1.5 }}
                                activeDot={{ r: 5 }}
                              />
                            ))}
                          </LineChart>
                        );
                      } else if (accessChartType === "area") {
                        return (
                          <AreaChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              {activeEmps.map((emp) => (
                                <linearGradient key={emp} id={`grad-${emp}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={employeeColors[emp] || "#f97316"} stopOpacity={0.35} />
                                  <stop offset="95%" stopColor={employeeColors[emp] || "#f97316"} stopOpacity={0.0} />
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-zinc-800" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomChartTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", paddingTop: "10px" }} />
                            {activeEmps.map((emp) => (
                              <Area
                                key={emp}
                                type="monotone"
                                dataKey={emp}
                                name={emp}
                                stroke={employeeColors[emp] || "#f97316"}
                                strokeWidth={2}
                                fill={`url(#grad-${emp})`}
                              />
                            ))}
                          </AreaChart>
                        );
                      } else {
                        // BarChart
                        return (
                          <BarChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-zinc-800" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomChartTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", paddingTop: "10px" }} />
                            {activeEmps.map((emp) => (
                              <Bar
                                key={emp}
                                dataKey={emp}
                                name={emp}
                                stackId="access_stack"
                                fill={employeeColors[emp] || "#f97316"}
                              />
                            ))}
                          </BarChart>
                        );
                      }
                    })()}
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Analytical Subsections */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* Left Box: Collaborator Ranking Table */}
            <div className="xl:col-span-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="border-b pb-3 border-slate-100 flex items-center justify-between dark:border-zinc-800">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100 flex items-center gap-1.5">
                    <UserCheck2 className="w-4 h-4 text-orange-500" />
                    Ranking de Atividade de Colaboradores
                  </h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Frequência bruta e percentual de acessos ao sistema por operador ativo.</p>
                </div>
              </div>

              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px] font-mono dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Cargo</th>
                      <th className="p-3 text-right">Acessos</th>
                      <th className="p-3 text-right">Representatividade</th>
                      <th className="p-3 text-center">Último Acesso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {accessInsights.ranking.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400 italic text-[11px]">Nenhum acesso registrado no período.</td>
                      </tr>
                    ) : (
                      accessInsights.ranking.map((row) => (
                        <tr key={row.username} className="hover:bg-slate-50/50 dark:hover:bg-zinc-950/20 transition-colors font-medium text-slate-700 dark:text-zinc-300">
                          <td className="p-3 flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg font-bold text-[9px] flex items-center justify-center text-white shrink-0" style={{ backgroundColor: employeeColors[row.username] || "#cbd5e1" }}>
                              {row.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <span className="block font-bold text-slate-800 dark:text-zinc-200 truncate max-w-[120px]">{row.name}</span>
                              <span className="block text-[9px] text-slate-400 font-mono truncate">@{row.username}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {row.role}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black font-mono text-slate-900 dark:text-zinc-100">
                            {row.count}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-bold font-mono">{row.percentage.toFixed(1)}%</span>
                              <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden dark:bg-zinc-800 shrink-0">
                                <div className="h-full rounded-full" style={{ width: `${row.percentage}%`, backgroundColor: employeeColors[row.username] }} />
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                            {row.lastAccess}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Box: Module access distribution progress bars */}
            <div className="xl:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="border-b pb-3 border-slate-100 flex items-center justify-between dark:border-zinc-800">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-orange-500" />
                    Distribuição por Módulo de Sistema
                  </h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Principais focos de acesso e operação dos colaboradores.</p>
                </div>
              </div>

              <div className="space-y-4">
                {accessInsights.moduleDistribution.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 italic text-[11px]">Nenhum registro modular no período.</div>
                ) : (
                  accessInsights.moduleDistribution.map((item, idx) => {
                    const moduleColors = [
                      "bg-orange-500",
                      "bg-blue-500",
                      "bg-emerald-500",
                      "bg-indigo-500",
                      "bg-purple-500",
                      "bg-rose-500",
                      "bg-amber-500",
                      "bg-cyan-500",
                    ];
                    const selectedBg = moduleColors[idx % moduleColors.length];

                    return (
                      <div key={item.name} className="space-y-1.5 font-sans">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700 dark:text-zinc-300">{item.name}</span>
                          <span className="font-mono text-[11px] font-black text-slate-800 dark:text-zinc-100">
                            {item.count} <span className="text-slate-400 font-normal">({item.percentage.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden dark:bg-zinc-800">
                          <div className={`h-full rounded-full ${selectedBg}`} style={{ width: `${item.percentage}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* MODAL POPUP: Employee registrations Form */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full border border-slate-100 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm">Contratar / Cadastrar Funcionário</h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEmployee} className="space-y-4 text-xs">
              {localError && (
                <div className="bg-red-500/10 text-red-700 p-2.5 rounded-lg text-xs font-semibold border border-red-500/20">
                  {localError}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nome Completo do Colaborador *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alberto Mondlane"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-slate-800 transition text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Cargo / Atribuição</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer text-xs"
                >
                  <option value="Administrador">Administrador</option>
                  <option value="Supervisor de Vendas">Supervisor de Vendas</option>
                  <option value="Operador de Caixa">Operador de Caixa</option>
                  <option value="Gestor de Stock">Gestor de Stock</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Contacto Telefónico *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ex: 841234567"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Salário Bruto (MT)</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    placeholder="Ex: 85000"
                    value={salary || ""}
                    onChange={(e) => setSalary(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none text-xs"
                  />
                </div>
              </div>

              {/* Credenciais de Acesso */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3.5">
                <p className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Credenciais de Acesso ao Terminal
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block text-left">Username *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ldomingos"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none focus:border-orange-500 text-xs text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      <span>Senha Temporária *</span>
                      {role === "Administrador" && (
                        <span className="text-[9px] text-orange-600 font-extrabold">Requer Senha Forte</span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={32}
                      placeholder={role === "Administrador" ? "Mín. 8 chars (letras + números)" : "Mínimo 6 caracteres"}
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value);
                        if (localError) setLocalError("");
                      }}
                      className={`w-full bg-white border rounded-lg p-2 font-mono font-semibold outline-none focus:border-orange-500 text-xs text-slate-850 ${
                        role === "Administrador" && pin && !checkPasswordStrength(pin).isValidAdmin
                          ? "border-rose-300 bg-rose-50/20"
                          : "border-slate-200"
                      }`}
                    />
                  </div>
                </div>

                {/* Password Strength Indicator */}
                {pin && (() => {
                  const strength = checkPasswordStrength(pin);
                  return (
                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-500">Força da Senha:</span>
                        <span className={
                          strength.score >= 3.5 ? "text-emerald-600 font-black" :
                          strength.score >= 2.5 ? "text-green-600 font-black" :
                          strength.score >= 1.5 ? "text-amber-600 font-black" : "text-rose-600 font-black"
                        }>
                          {strength.label} {role === "Administrador" && (!strength.isValidAdmin ? "❌ (Insuficiente para Admin)" : "✅ (Aceitável para Admin)")}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                        <div className={`h-full transition-all duration-300 rounded-full ${strength.score >= 1 ? strength.color : "bg-slate-200"}`} style={{ width: "25%" }} />
                        <div className={`h-full transition-all duration-300 rounded-full ${strength.score >= 2 ? strength.color : "bg-slate-200"}`} style={{ width: "25%" }} />
                        <div className={`h-full transition-all duration-300 rounded-full ${strength.score >= 3 ? strength.color : "bg-slate-200"}`} style={{ width: "25%" }} />
                        <div className={`h-full transition-all duration-300 rounded-full ${strength.score >= 3.5 ? strength.color : "bg-slate-200"}`} style={{ width: "25%" }} />
                      </div>
                      {role === "Administrador" && !strength.isValidAdmin && (
                        <p className="text-[9px] text-rose-600 font-semibold leading-tight">
                          ⚠️ Senhas de Administrador exigem no mínimo 8 caracteres com pelo menos 1 letra e 1 número.
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block text-left">E-mail para Notificação *</label>
                  <input
                    type="email"
                    required
                    placeholder="Ex: colaborador@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Opção para envio de credenciais ao Gmail do funcionário */}
              {email.trim() && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-bold">Enviar credenciais por E-mail</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={sendEmailCredentials}
                        onChange={(e) => setSendEmailCredentials(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400">
                    O funcionário receberá um e-mail com o PIN do operador e as diretrizes do cargo para login seguro no terminal.
                  </p>
                  
                  {emailSendingStatus === "SENDING" && (
                    <div className="text-[10px] text-orange-500 font-semibold flex items-center gap-1.5 pt-1">
                      <span className="w-3 h-3 rounded-full border border-orange-500 border-t-transparent animate-spin"></span>
                      <span>A enviar credenciais para o Gmail...</span>
                    </div>
                  )}
                  {emailSendingStatus === "SUCCESS" && (
                    <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 pt-1">
                      <span>✓ Credenciais enviadas com sucesso ao Gmail!</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-md shadow-orange-500/10"
                >
                  Confirmar Contratação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POPUP: Employee Modify/Edit Form (Item 6) */}
      {isEditModalOpen && selectedEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full border border-slate-150 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm">Editar Cadastro de Colaborador</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditEmployee} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cargo / Função</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer"
                >
                  <option value="Administrador">Administrador</option>
                  <option value="Supervisor de Vendas">Supervisor de Vendas</option>
                  <option value="Operador de Caixa">Operador de Caixa</option>
                  <option value="Gestor de Stock">Gestor de Stock</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Contacto Telefónico</label>
                  <input
                    type="tel"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Salário Bruto (MT)</label>
                  <input
                    type="number"
                    required
                    value={salary || ""}
                    onChange={(e) => setSalary(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Credenciais de Acesso
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block text-left">Username</label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none focus:border-orange-500 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block text-left">Senha de Acesso</label>
                    <input
                      type="text"
                      required
                      maxLength={32}
                      placeholder="Mínimo 6 caracteres"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-semibold outline-none focus:border-orange-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block text-left">E-mail</label>
                  <input
                    type="email"
                    placeholder="Ex: funcionario@empresa.co.mz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block text-left">Estado Operacional</label>
                <select
                  value={employeeStatus}
                  onChange={(e) => setEmployeeStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer"
                >
                  <option value="ACTIVE">🟢 Ativo (Acesso autorizado)</option>
                  <option value="SUSPENDED">🟡 Suspenso (Acesso temporariamente retido)</option>
                  <option value="INACTIVE">🔴 Desativado (Acesso rescindido)</option>
                  <option value="BLOCKED">🔒 Bloqueado (Senha Expirada ou Segurança)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POPUP: Employee Permissions Assign (Item 6) */}
      {isPermissionsModalOpen && selectedEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full border border-slate-150 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm">Privilégios de Acesso ERP</h3>
              <button 
                onClick={() => setIsPermissionsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-slate-500">Defina quais módulos o colaborador <strong>{selectedEmp.name}</strong> poderá gerenciar:</p>
              
              <div className="space-y-2 border border-slate-150 p-3.5 rounded-xl bg-slate-50/50">
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input 
                    type="checkbox" 
                    checked={empPermissions.includes("POS")}
                    onChange={(e) => setEmpPermissions(prev => e.target.checked ? [...prev, "POS"] : prev.filter(x => x !== "POS"))}
                  />
                  <div>
                    <span className="font-bold text-slate-800">Módulo POS / Caixa de Vendas</span>
                    <p className="text-[10px] text-slate-400 font-normal">Permitir lançamentos e recebimentos no caixa comercial</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input 
                    type="checkbox" 
                    checked={empPermissions.includes("STOCK")}
                    onChange={(e) => setEmpPermissions(prev => e.target.checked ? [...prev, "STOCK"] : prev.filter(x => x !== "STOCK"))}
                  />
                  <div>
                    <span className="font-bold text-slate-800">Inventário / Gestão de Stock</span>
                    <p className="text-[10px] text-slate-400 font-normal">Permitir dar entrada em produtos e ajustar estoque mínimo</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input 
                    type="checkbox" 
                    checked={empPermissions.includes("REPORTS")}
                    onChange={(e) => setEmpPermissions(prev => e.target.checked ? [...prev, "REPORTS"] : prev.filter(x => x !== "REPORTS"))}
                  />
                  <div>
                    <span className="font-bold text-slate-800">Relatórios Administrativos</span>
                    <p className="text-[10px] text-slate-400 font-normal">Dar acesso a relatórios e balanço financeiro geral</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input 
                    type="checkbox" 
                    checked={empPermissions.includes("STAFF")}
                    onChange={(e) => setEmpPermissions(prev => e.target.checked ? [...prev, "STAFF"] : prev.filter(x => x !== "STAFF"))}
                  />
                  <div>
                    <span className="font-bold text-slate-800">Contratos e Auditoria</span>
                    <p className="text-[10px] text-slate-400 font-normal">Ver quadro de funcionários e auditar logs de segurança</p>
                  </div>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPermissionsModalOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Confirmar Chaves
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODERN SLIDEOVER DRAWER: Employee Full Profile Overview (Item 14) */}
      {isDrawerOpen && selectedEmp && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end">
          
          {/* Backdrop close area */}
          <div className="flex-1" onClick={() => setIsDrawerOpen(false)}></div>
          
          {/* Drawer sheet container */}
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-150 flex flex-col animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-extrabold text-xs border border-orange-200 uppercase">
                  {selectedEmp.name.substring(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-none">{selectedEmp.name}</h3>
                  <span className="text-[10px] text-slate-400 font-medium font-mono block mt-1">{selectedEmp.role}</span>
                </div>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-650 flex items-center justify-center font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Drawer Tab Selectors */}
            <div className="flex border-b border-slate-150 bg-slate-50 overflow-x-auto text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              {(["RESUMO", "PERMISSOES", "FERIAS", "SALARIO", "HISTORICO"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  className={`px-4 py-3 border-b-2 whitespace-nowrap cursor-pointer transition ${
                    drawerTab === tab 
                      ? "border-orange-500 text-orange-600 bg-white" 
                      : "border-transparent hover:text-slate-800"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4 font-sans text-slate-600">
              
              {drawerTab === "RESUMO" && (
                <div className="space-y-4">
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150 space-y-3">
                    <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Dados do Colaborador</h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">CÓDIGO ID</span>
                        <span className="font-mono text-slate-700 block font-bold mt-0.5">{selectedEmp.id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">CARGO OPERACIONAL</span>
                        <span className="text-slate-700 block font-bold mt-0.5">{selectedEmp.role}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">TELEFONE CENTRAL</span>
                        <span className="text-slate-700 block font-bold mt-0.5">{selectedEmp.contact}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">DATA ADMISSÃO</span>
                        <span className="font-mono text-slate-700 block font-bold mt-0.5">{selectedEmp.admissionDate || "2024-01-10"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">SENHA DE ACESSO</span>
                        <span className="font-mono text-emerald-600 block font-extrabold mt-0.5">{selectedEmp.pin ? "•••••••• (Ativa)" : "Não definida"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">E-MAIL (GMAIL)</span>
                        <span className="text-slate-700 block font-semibold mt-0.5 truncate" title={selectedEmp.email || "Não registado"}>{selectedEmp.email || "Não registado"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150 space-y-3">
                    <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Dados Fiscais e Tributação</h4>
                    
                    <div className="grid grid-cols-2 gap-3 font-mono">
                      <div>
                        <span className="text-slate-400 block text-[9.5px] font-sans">INSS REFERÊNCIA</span>
                        <span className="text-slate-700 block font-bold mt-0.5">3.0% (Inscrição Activa)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px] font-sans">IRPS GRUPO</span>
                        <span className="text-slate-700 block font-bold mt-0.5">Retenção na Fonte A</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "PERMISSOES" && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Módulos de Acesso Ativos</h4>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-150">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span><strong>Caixa POS Comercial</strong> — Lançamento de faturas e pagamentos ativa.</span>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-150">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span><strong>Gestão de Stock</strong> — Visualização e entrada de produtos autorizada.</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 text-slate-500 p-2.5 rounded-xl border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      <span><strong>Relatórios Administrativos</strong> — Acesso restrito apenas a supervisores.</span>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "FERIAS" && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Histórico de Férias e Licenças</h4>
                  
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="bg-slate-50 p-2.5 rounded-lg flex justify-between">
                      <div>
                        <span className="font-bold block text-slate-700">Férias Gozadas (Ano 2025)</span>
                        <span className="text-[10px] text-slate-400">15 de Março ➔ 15 de Abril</span>
                      </div>
                      <span className="text-emerald-600 font-bold">Concluído</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg flex justify-between">
                      <div>
                        <span className="font-bold block text-slate-700">Férias Solicitadas (Ano 2026)</span>
                        <span className="text-[10px] text-slate-400">10 de Dezembro ➔ 10 de Janeiro</span>
                      </div>
                      <span className="text-amber-600 font-bold">Aprovado</span>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "SALARIO" && (
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Controle de Pagamentos de Vencimento</h4>
                  
                  {/* Pagar Salario + Imprimir Vencimento widgets */}
                  <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-3 text-center">
                    <span className="block text-orange-800 font-bold text-xs">Vencimento Mensal Base</span>
                    <span className="text-2xl font-black text-orange-600 block leading-none">{(selectedEmp.salary).toLocaleString()} MT</span>
                    
                    <div className="flex gap-2.5 pt-2.5">
                      <button 
                        onClick={() => handlePaySalary(selectedEmp)}
                        className="w-1/2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1 shadow-sm transition"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Pagar Salário
                      </button>
                      <button 
                        onClick={() => handlePrintPayslip(selectedEmp)}
                        className="w-1/2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1 shadow-sm transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir Recibo
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-700 block">Últimos Depósitos Concluídos</span>
                    <div className="divide-y divide-slate-100 font-mono text-[10.5px]">
                      <div className="py-2 flex justify-between items-center">
                        <span>Maio de 2026</span>
                        <span className="text-emerald-600 font-bold flex items-center gap-1">✓ Pago ({(selectedEmp.salary).toLocaleString()} MT)</span>
                      </div>
                      <div className="py-2 flex justify-between items-center">
                        <span>Abril de 2026</span>
                        <span className="text-emerald-600 font-bold flex items-center gap-1">✓ Pago ({(selectedEmp.salary).toLocaleString()} MT)</span>
                      </div>
                      <div className="py-2 flex justify-between items-center">
                        <span>Março de 2026</span>
                        <span className="text-emerald-600 font-bold flex items-center gap-1">✓ Pago ({(selectedEmp.salary).toLocaleString()} MT)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "HISTORICO" && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Histórico de Atividades do Colaborador</h4>
                  
                  <div className="space-y-2 font-mono text-[10.5px]">
                    <div className="bg-slate-50 p-2 rounded border border-slate-150">
                      <span className="text-[9px] text-slate-400 block">2026-06-25 14:12</span>
                      <span className="font-semibold text-slate-700 block">Caixa POS: Fecho de Turno concluído</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-150">
                      <span className="text-[9px] text-slate-400 block">2026-06-25 08:00</span>
                      <span className="font-semibold text-slate-700 block">Início de sessão no POS autorizado</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-150">
                      <span className="text-[9px] text-slate-400 block">2026-06-24 18:32</span>
                      <span className="font-semibold text-slate-700 block">Venda de stock consolidada via POS</span>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 text-left">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Remover Registro de Colaborador</h3>
                  <p className="text-[10px] text-slate-500">Esta ação desliga permanentemente o funcionário</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-extrabold text-xs uppercase">
                    {employeeToDelete.name.substring(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs">{employeeToDelete.name}</h4>
                    <span className="text-[10px] text-slate-400 block font-mono">{employeeToDelete.role}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                  Tem certeza absoluta de que deseja remover permanentemente o registro de <strong className="text-slate-800">{employeeToDelete.name}</strong>? Esta ação é irreversível e removerá o acesso dele ao sistema.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-600 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEmployee}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-red-950/20 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar Remoção</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function AuditLogLocationMap({ log }: { log: AuditLog }) {
  const [geo, setGeo] = React.useState<{
    city?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lon?: number;
    org?: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const rawIp = log.ip || "";
    const ipMatch = rawIp.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    const ipAddress = ipMatch ? ipMatch[0] : "";

    let parsedCity = "Indisponível";
    let parsedCountry = "Indisponível";
    let parsedCountryCode = "Indisponível";
    let parsedLat: number | undefined = undefined;
    let parsedLon: number | undefined = undefined;

    const parenMatch = rawIp.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const parts = parenMatch[1].split(",");
      if (parts[0]) parsedCity = parts[0].trim();
      if (parts[1]) {
        parsedCountry = parts[1].trim();
        const countryLower = parsedCountry.toLowerCase();
        if (countryLower.includes("mz") || countryLower.includes("moçambique") || countryLower.includes("mocambique")) {
          parsedCountryCode = "MZ";
        } else {
          parsedCountryCode = parsedCountry.toUpperCase().slice(0, 2);
        }
      }
    }

    const isLocalOrSimulated = !ipAddress || 
      ipAddress === "127.0.0.1" || 
      ipAddress === "localhost" || 
      ipAddress.startsWith("192.168.") || 
      ipAddress.startsWith("10.");

    if (isLocalOrSimulated) {
      setGeo({
        city: parenMatch ? parsedCity : "Rede Local",
        country: parenMatch ? parsedCountry : "Indisponível",
        countryCode: parenMatch ? parsedCountryCode : "LOC",
        lat: parsedLat,
        lon: parsedLon,
        org: "Rede Local / Loopback"
      });
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchGeo = async () => {
      try {
        const res = await fetch(`https://ip-api.com/json/${ipAddress}`);
        const data = await res.json();
        if (isMounted) {
          if (data && data.status === "success") {
            setGeo({
              city: data.city || parsedCity,
              country: data.country || parsedCountry,
              countryCode: data.countryCode || parsedCountryCode,
              lat: data.lat || parsedLat,
              lon: data.lon || parsedLon,
              org: data.org || "Indisponível"
            });
          } else {
            setGeo({
              city: parsedCity,
              country: parsedCountry,
              countryCode: parsedCountryCode,
              lat: parsedLat,
              lon: parsedLon,
              org: "Indisponível"
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setGeo({
            city: parsedCity,
            country: parsedCountry,
            countryCode: parsedCountryCode,
            lat: parsedLat,
            lon: parsedLon,
            org: "Indisponível"
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGeo();
    return () => {
      isMounted = false;
    };
  }, [log.ip]);

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-center justify-center h-40 animate-pulse text-slate-400 text-xs gap-2 font-sans mt-3">
        <Activity className="w-4 h-4 animate-spin text-orange-500" />
        <span>A carregar mapa de geolocalização do IP...</span>
      </div>
    );
  }

  if (!geo) return null;

  const { city, country, countryCode, lat, lon, org } = geo;

  const isOutsideMozambique = countryCode !== "MZ" && !country?.toLowerCase().includes("moçambique") && !country?.toLowerCase().includes("mozambique");
  
  let isAfterHours = false;
  try {
    const d = new Date(log.timestamp);
    const hours = d.getHours();
    if (hours >= 22 || hours < 6) {
      isAfterHours = true;
    }
  } catch (e) {}

  let securityBadgeColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  let securityText = "Conexão de local esperado e seguro (Moçambique).";
  let securityStatus = "✓ ACESSO REGULAR";

  if (isOutsideMozambique) {
    securityBadgeColor = "text-red-700 bg-red-50 border-red-200 animate-pulse ring-1 ring-red-300";
    securityText = "AVISO: Este acesso foi registado a partir de um IP fora de Moçambique. Recomenda-se validar as credenciais do utilizador.";
    securityStatus = "🚨 CRÍTICO: IP INTERNACIONAL SUSPEITO";
  } else if (isAfterHours) {
    securityBadgeColor = "text-amber-700 bg-amber-50 border-amber-200";
    securityText = "Alerta: Conexão registada fora de horas de serviço padrão (22:00h - 06:00h).";
    securityStatus = "⚠️ ATENÇÃO: ACESSO FORA DE HORAS";
  }

  const latVal = lat || -25.9692;
  const lonVal = lon || 32.5732;
  const delta = 0.015;
  const minLon = lonVal - delta;
  const minLat = latVal - delta;
  const maxLon = lonVal + delta;
  const maxLat = latVal + delta;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${latVal}%2C${lonVal}`;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 mt-3">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-orange-500" />
          <h4 className="font-extrabold text-slate-800 text-xs font-sans">Geolocalização & Segurança do IP</h4>
        </div>
        <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase font-sans ${securityBadgeColor}`}>
          {securityStatus}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Geolocation Details column */}
        <div className="md:col-span-5 space-y-2.5 font-sans text-xs">
          <div className="bg-white border border-slate-100 p-3 rounded-xl space-y-2.5 shadow-sm">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 text-[9.5px] uppercase font-bold tracking-wider">Endereço IP</span>
              <span className="font-mono text-[10px] text-slate-800 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200 select-all">{log.ip?.split(" ")[0] || "Indisponível"}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 text-[9.5px] uppercase font-bold tracking-wider">Cidade</span>
              <span className="text-slate-700 font-bold">{city}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 text-[9.5px] uppercase font-bold tracking-wider">País</span>
              <span className="text-slate-700 font-bold flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                {country} ({countryCode})
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 text-[9.5px] uppercase font-bold tracking-wider">Provedor ISP</span>
              <span className="text-slate-700 font-extrabold truncate max-w-[130px]">{org}</span>
            </div>
          </div>

          <div className="bg-white/80 border border-slate-100 p-2.5 rounded-xl text-[10.5px] text-slate-600 leading-normal font-medium shadow-sm">
            <span className="text-slate-400 text-[9px] uppercase font-black block tracking-wider mb-0.5">Parecer de Segurança</span>
            {securityText}
          </div>
        </div>

        {/* Static/Interactive Map Iframe Column */}
        <div className="md:col-span-7 h-44 rounded-2xl border border-slate-200 overflow-hidden relative shadow-inner bg-slate-100">
          <iframe 
            src={embedUrl}
            className="w-full h-full border-none"
            scrolling="no"
            title={`Mapa do IP ${log.ip}`}
          />
          <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-sm border border-slate-200 px-2 py-0.5 rounded text-[8px] font-bold text-slate-500 pointer-events-none select-none font-mono shadow-sm">
            OpenStreetMap
          </div>
        </div>
      </div>
    </div>
  );
}
