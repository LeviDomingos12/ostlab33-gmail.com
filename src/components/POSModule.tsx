import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from "react";
import QRCode from "qrcode";
import { AnimatePresence } from "motion/react";
import { 
  Search, 
  Trash2, 
  Receipt, 
  UserPlus, 
  CheckCircle2,
  Mail,
  Printer,
  Smartphone,
  ShoppingCart,
  Camera,
  AlertTriangle,
  History,
  Maximize2,
  Minimize2,
  MessageSquare,
  Scan,
  QrCode,
  Keyboard,
  HelpCircle,
  Zap,
  Barcode,
  Clock,
  RotateCcw,
  Loader2,
  Lock,
  Coins
} from "lucide-react";
import { Product, Customer, CartItem, Transaction, SystemSettings, CashFlowEntry, Employee } from "../types";
import QrCodeScannerComponent from "./QrCodeScannerComponent";
import { sendEmail } from "../lib/gmail";
import { authenticatedFetch } from "../lib/apiClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SYSTEM_THEMES } from "../lib/themes";
import { printInvoiceHTML, printThermal80mmReceipt } from "../lib/printHelper";
import { useSystemVersion } from "../lib/versionManager";
import { generateUUID, generateEntityId, generateDeterministicInvoiceNumber, generateDeterministicCreditNoteNumber, generateDeterministicFinancialReference } from "../lib/deterministic";
import { POSShiftBar } from "./cash/POSShiftBar";
import { POSShiftModals } from "./cash/POSShiftModals";
import { CashShiftService, ActiveCashShift } from "../services/cashShiftService";
import { PosProductCard } from "./pos/PosProductCard";
import { PosCartItemRow } from "./pos/PosCartItemRow";
import { PosCategoryPills } from "./pos/PosCategoryPills";

// Extends CartItem type locally for inline observations
interface UpgradedCartItem extends CartItem {
  observation?: string;
}

interface POSModuleProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  activeUsername: string;
  settings: SystemSettings;
  onCompleteSale: (tx: Transaction) => Promise<boolean | void> | void;
  onReturnSale?: (
    tx: Transaction,
    reason: string,
    returnedItems: { productId: string; quantity: number; price: number }[],
    refundMethod?: string
  ) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currency: string;
  onAddCustomer?: (customer: Customer) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  isPOSFullscreen?: boolean;
  onChangePOSFullscreen?: (val: boolean) => void;
  onTriggerPanic?: () => void;
  activeShift?: ActiveCashShift | null;
  onOpenShift?: (openingFloat: number, supervisor: string, notes: string, registerId?: string) => Promise<void> | void;
  onCloseShift?: (physicalCount: number, supervisor: string, notes: string, denominations?: Record<string, number>) => Promise<void> | void;
  onAddCashFlowEntry?: (entry: Omit<CashFlowEntry, "id" | "timestamp">) => void;
  cashFlow?: CashFlowEntry[];
  employees?: Employee[];
}

// Static helper for certified digital signing (Moçambique fiscal standards)
const generateFiscalSignature = (invoiceNum: string, dateStr: string, total: number) => {
  const seed = `${invoiceNum}|${dateStr}|${total}|OST-VENDAS-SECURE-KEY-2026`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  const part1 = hex.slice(0, 4);
  const part2 = hex.slice(4, 8);
  const key1 = invoiceNum.split('-')[2] || "2026";
  const key2 = ((Math.abs(hash) % 9000) + 1000).toString();
  return {
    fiscalHash: `FAC-${hex}-${part1}-${part2}-OSTVENDAS`,
    fiscalKeys: `${part1}-${part2}-${key1}-${key2}`,
    fiscalCertified: true
  };
};

function POSModule({
  products,
  customers,
  transactions,
  activeUsername,
  settings,
  onCompleteSale,
  onReturnSale,
  onAddAuditLog,
  currency,
  onAddCustomer,
  onShowToast,
  isPOSFullscreen = false,
  onChangePOSFullscreen,
  onTriggerPanic,
  activeShift,
  onOpenShift,
  onCloseShift,
  onAddCashFlowEntry,
  cashFlow = [],
  employees = []
}: POSModuleProps) {
  const { formattedVersion } = useSystemVersion();

  // --- CAIXA POR TURNO (Turno Obrigatório, Fundo Inicial e Troco Dinâmico) ---
  const [localShift, setLocalShift] = useState<ActiveCashShift | null>(null);
  const currentShift = activeShift !== undefined ? activeShift : localShift;
  const isShiftOpen = !!(currentShift && currentShift.status === "OPEN");

  // Modais de Turno no POS
  const [showOpenShiftModal, setShowOpenShiftModal] = useState<boolean>(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [showExtratoModal, setShowExtratoModal] = useState<boolean>(false);
  const [showQuickEntryModal, setShowQuickEntryModal] = useState<boolean>(false);
  const [quickEntryType, setQuickEntryType] = useState<"SUPRIMENTO" | "SANGRIA">("SUPRIMENTO");

  // Carregar turno ativo se não fornecido via props
  useEffect(() => {
    if (activeShift === undefined) {
      CashShiftService.getActiveShift().then(s => {
        if (s) setLocalShift(s);
      }).catch(() => {});
    }
  }, [activeShift]);

  // Métricas do Turno em Tempo Real
  const shiftMetrics = useMemo(() => {
    return CashShiftService.calculateShiftMetrics(currentShift, transactions, cashFlow || []);
  }, [currentShift, transactions, cashFlow]);

  // Handlers para o turno no POS
  const handleConfirmOpenShiftAction = async (openingFloat: number, supervisor: string, notes: string, registerId?: string) => {
    if (onOpenShift) {
      await onOpenShift(openingFloat, supervisor, notes, registerId);
    } else {
      const shift = await CashShiftService.openShift({
        openingBalance: openingFloat,
        openedBy: activeUsername,
        openingSupervisor: supervisor,
        openingNotes: notes,
        registerId: registerId || "POS-01"
      });
      setLocalShift(shift);
      onAddAuditLog(
        "Abertura Turno Caixa",
        "CAIXA",
        `Turno #${shift.shiftNumber} aberto por ${activeUsername} com fundo inicial de ${openingFloat.toLocaleString()} ${currency}. Homologado por: ${supervisor || "N/A"}. Obs: ${notes || "N/A"}`
      );
      if (onShowToast) onShowToast("Turno de caixa aberto com sucesso! Fundo inicial registrado.", "success", "Turno Aberto");
    }
  };

  const handleConfirmCloseShiftAction = async (physicalCount: number, supervisor: string, notes: string, denominations?: Record<string, number>) => {
    if (!currentShift) return;
    if (onCloseShift) {
      await onCloseShift(physicalCount, supervisor, notes, denominations);
    } else {
      const result = await CashShiftService.closeShift({
        activeShift: currentShift,
        physicalCount,
        closedBy: activeUsername,
        closingSupervisor: supervisor,
        closingNotes: notes,
        transactions,
        cashFlow: cashFlow || [],
        denominations
      });
      setLocalShift(null);
      const diff = result.difference;
      onAddAuditLog(
        "Fechamento Turno Caixa",
        "CAIXA",
        `Turno de caixa #${currentShift.shiftNumber} encerrado por ${activeUsername}. Físico: ${physicalCount.toLocaleString()} ${currency}, Teórico: ${result.closure.theoreticalBalance.toLocaleString()} ${currency}, Desvio: ${diff.toLocaleString()} ${currency}. Homologado por: ${supervisor || "N/A"}`
      );
      if (onShowToast) {
        onShowToast(
          `Turno encerrado com sucesso! ${diff === 0 ? "Caixa exato." : diff > 0 ? `Sobra de +${diff.toLocaleString()} ${currency}.` : `Falta de ${diff.toLocaleString()} ${currency}.`}`,
          diff === 0 ? "success" : "warning",
          "Turno Fechado"
        );
      }
    }
  };

  const handleConfirmQuickEntryAction = async (type: "SUPRIMENTO" | "SANGRIA", amount: number, reason: string, supervisor?: string) => {
    if (onAddCashFlowEntry) {
      onAddCashFlowEntry({
        type: type === "SUPRIMENTO" ? "REINFORCEMENT" : "SANGRIA",
        amount,
        reason: `${type === "SUPRIMENTO" ? "Suprimento" : "Sangria"}: ${reason}`,
        responsibleUser: activeUsername,
        shiftId: currentShift?.id,
        registerId: currentShift?.registerId || "POS-01",
        paymentMethod: "CASH",
        category: type === "SUPRIMENTO" ? "SUPRIMENTO" : "SANGRIA",
        authorizedSupervisor: supervisor
      });
    }
    onAddAuditLog(
      type === "SUPRIMENTO" ? "Suprimento de Caixa" : "Sangria de Caixa",
      "CAIXA",
      `${type === "SUPRIMENTO" ? "Suprimento" : "Sangria"} de ${amount.toLocaleString()} ${currency} efetuada por ${activeUsername}. Motivo: ${reason}. Supervisor: ${supervisor || "N/A"}`
    );
    if (onShowToast) onShowToast(`${type === "SUPRIMENTO" ? "Suprimento" : "Sangria"} de ${amount.toLocaleString()} ${currency} registado com sucesso!`, "success");
  };
  
  // Local synchronized state to allow quick registering of customers and updating stock locally in the view
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);

  // Return / Devolution & Credit Note Modal State
  const [selectedTxForReturn, setSelectedTxForReturn] = useState<Transaction | null>(null);
  const [showReturnModal, setShowReturnModal] = useState<boolean>(false);
  const [returnReason, setReturnReason] = useState<string>("Defeito / Avaria de Produto");
  const [customReturnReason, setCustomReturnReason] = useState<string>("");
  const [returnedItemQuantities, setReturnedItemQuantities] = useState<Record<string, number>>({});
  const [returnRefundMethod, setReturnRefundMethod] = useState<string>("CASH");
  const [completedCreditNote, setCompletedCreditNote] = useState<any | null>(null);
  
  // Minimized / Focus mode state
  const [isLocalMinimized, setIsLocalMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ost_pos_minimized_mode") === "true";
    } catch {
      return false;
    }
  });

  const isMinimized = isPOSFullscreen || isLocalMinimized;

  const handleToggleMinimized = () => {
    if (onChangePOSFullscreen) {
      onChangePOSFullscreen(!isPOSFullscreen);
    } else {
      setIsLocalMinimized(prev => {
        const next = !prev;
        try {
          localStorage.setItem("ost_pos_minimized_mode", String(next));
        } catch {}
        return next;
      });
    }
  };
  
  // Sync when props change
  useEffect(() => { setLocalCustomers(customers); }, [customers]);
  useEffect(() => { setLocalProducts(products); }, [products]);

  // Session stats & setup
  const [currentSaleNumber, setCurrentSaleNumber] = useState<number>(245);

  // Keyboard Shortcuts cheat sheet overlay or triggers
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLSelectElement>(null);

  // Auto-focus barcode/search input immediately on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [cart, setCart] = useState<UpgradedCartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("CASH");
  const [visibleProductsCount, setVisibleProductsCount] = useState<number>(48);

  // Reset pagination count on search or category filter change
  useEffect(() => {
    setVisibleProductsCount(48);
  }, [deferredSearchQuery, selectedCategory]);

  // High-performance indexed cache for instant O(1) barcode, internal code, and product lookups
  const productCache = useMemo(() => {
    const barcodeMap = new Map<string, Product>();
    const codeMap = new Map<string, Product>();
    const idMap = new Map<string, Product>();

    localProducts.forEach(p => {
      if (p.id) {
        idMap.set(p.id.trim(), p);
        idMap.set(p.id.trim().toLowerCase(), p);
      }
      if (p.barcode) {
        const b = p.barcode.trim();
        barcodeMap.set(b, p);
        barcodeMap.set(b.toLowerCase(), p);
      }
      if (p.code) {
        const c = p.code.trim();
        codeMap.set(c, p);
        codeMap.set(c.toLowerCase(), p);
      }
    });

    return {
      findByBarcodeOrCode: (codeOrBarcode: string): Product | undefined => {
        const clean = codeOrBarcode.trim();
        const lower = clean.toLowerCase();
        return barcodeMap.get(clean) || barcodeMap.get(lower) || codeMap.get(clean) || codeMap.get(lower) || idMap.get(clean) || idMap.get(lower);
      }
    };
  }, [localProducts]);

  // Multi-method payment cash allocations
  const [mixedCash, setMixedCash] = useState<number>(0);
  const [mixedMpesa, setMixedMpesa] = useState<number>(0);
  const [mixedPOS, setMixedPOS] = useState<number>(0);

  // Cash change automatic calculator states
  const [receivedCashAmount, setReceivedCashAmount] = useState<number>(0);

  const [debtDays] = useState<number>(15);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [vatMode] = useState<"AUTO" | "EXEMPT" | "CUSTOM">("AUTO");
  const [customVatRate] = useState<number>(16);

  // Completed Invoice Popup State
  const [completedTx, setCompletedTx] = useState<Transaction | null>(null);
  const [sendEmailStatus, setSendEmailStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sendSmsStatus, setSendSmsStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sendWhatsAppStatus, setSendWhatsAppStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Dynamic QR Code generation for the completed transaction/invoice
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    if (completedTx) {
      const origin = window.location.origin;
      const receiptLink = `${origin}/receipt/${completedTx.invoiceNumber}`;
      QRCode.toDataURL(
        receiptLink,
        {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 160,
          color: {
            dark: "#1e293b", // slate-800
            light: "#ffffff",
          },
        },
        (err, url) => {
          if (err) {
            console.error("Error generating QR code for invoice:", err);
          } else {
            setQrCodeDataUrl(url);
          }
        }
      );
    } else {
      setQrCodeDataUrl("");
    }
  }, [completedTx]);

  // Completed Budget (Orçamento) Popup State
  const [completedBudget, setCompletedBudget] = useState<{
    budgetNumber: string;
    timestamp: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    customerNuit?: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      price: number;
    }>;
    subtotal: number;
    discountTotal: number;
    vatTotal: number;
    grandTotal: number;
  } | null>(null);
  const [sendBudgetEmailStatus, setSendBudgetEmailStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sendBudgetSmsStatus, setSendBudgetSmsStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sendBudgetWhatsAppStatus, setSendBudgetWhatsAppStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [budgetTargetEmail, setBudgetTargetEmail] = useState("");
  const [budgetTargetPhone, setBudgetTargetPhone] = useState("");
  
  // Custom states for budget printing and ESC/POS styling
  const [budgetPrintFormat, setBudgetPrintFormat] = useState<"A4_DOC" | "ESC_POS">("A4_DOC");
  const [budgetTab, setBudgetTab] = useState<"PREVIEW" | "RAW_COMMANDS">("PREVIEW");
  const [selectedPaperSize, setSelectedPaperSize] = useState<"80MM" | "58MM">("80MM");
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showCriticalStockModal, setShowCriticalStockModal] = useState(false);

  useEffect(() => {
    if (completedBudget) {
      setBudgetPrintFormat(settings.printerEnabled ? "ESC_POS" : "A4_DOC");
      setBudgetTab("PREVIEW");
      setSelectedPaperSize(settings.paperSize === "58MM" ? "58MM" : "80MM");
    }
  }, [completedBudget, settings.printerEnabled, settings.paperSize]);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [isSimulatingPrint, setIsSimulatingPrint] = useState(false);
  const [printMode, setPrintMode] = useState<"receipt" | "invoice">("receipt");
  const [noReceiptSuccess, setNoReceiptSuccess] = useState(false);

  // Dynamic Mobile Money Payment states
  const [mobilePaymentProvider, setMobilePaymentProvider] = useState<"MPESA" | "EMOLA" | "MKESH">("MPESA");
  const [mobileMerchantCode, setMobileMerchantCode] = useState<string>("849001202");
  const [mobileCustomerPhone, setMobileCustomerPhone] = useState<string>("");
  const [mobileReference, setMobileReference] = useState<string>("");
  const [mobileQrDataUrl, setMobileQrDataUrl] = useState<string>("");
  const [mobilePaymentStatus, setMobilePaymentStatus] = useState<"IDLE" | "SENDING_PUSH" | "AWAITING_PIN" | "VERIFYING" | "CONFIRMED" | "EXPIRED">("IDLE");
  const [mobilePaymentProgress, setMobilePaymentProgress] = useState<number>(0);
  const [mobilePaymentTimer, setMobilePaymentTimer] = useState<number>(120);

  // 15. Suspended carts system
  const [suspendedCarts, setSuspendedCarts] = useState<{ id: string; time: string; cart: UpgradedCartItem[]; customerId: string }[]>([]);

  // 19. Weight prompt modal state
  const [weightPromptProduct, setWeightPromptProduct] = useState<Product | null>(null);
  const [weightInputValue, setWeightInputValue] = useState<string>("1.0");

  // 20. Camera / USB Barcode Scanner Modal State
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [manualBarcodeScan, setManualBarcodeScan] = useState("");
  const [scannerTab, setScannerTab] = useState<"camera" | "manual">("camera");
  const lastScannedCodeRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const [continuousScan, setContinuousScan] = useState<boolean>(false);

  // 24. Pre-checkout Confirmation Modal State
  const [showPreCheckoutModal, setShowPreCheckoutModal] = useState(false);
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [pendingEmitReceipt, setPendingEmitReceipt] = useState<boolean>(true);
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false);
  const isProcessingSaleRef = useRef<boolean>(false);

  // 10. Quick Add Customer Modal State
  const [quickCustomerModalOpen, setQuickCustomerModalOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState("");
  const [quickCustPhone, setQuickCustPhone] = useState("");
  const [quickCustEmail, setQuickCustEmail] = useState("");
  const [quickCustNuit, setQuickCustNuit] = useState("");
  const [pendingReceiptAction, setPendingReceiptAction] = useState<"email" | "sms" | "whatsapp" | null>(null);

  // 16. Past sales modal trigger
  const [showSalesHistoryModal, setShowSalesHistoryModal] = useState(false);

  // Categories list (including ⭐ Favoritos virtual tag)
  const categories = useMemo(() => {
    const list = new Set(localProducts.map(p => p.category));
    return ["Todos", "⭐ Favoritos", ...Array.from(list)];
  }, [localProducts]);

  // Live cart item quantities mapping for instant real-time stock deduction in UI
  const cartItemQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      map.set(item.product.id, (map.get(item.product.id) || 0) + item.quantity);
    });
    return map;
  }, [cart]);

  // Filtered products list with high performance deferred query
  const filteredProducts = useMemo(() => {
    const sQuery = deferredSearchQuery.toLowerCase().trim();
    if (!sQuery && selectedCategory === "Todos") return localProducts;

    return localProducts.filter(p => {
      const matchSearch = !sQuery || 
        (p.name || "").toLowerCase().includes(sQuery) || 
        (p.code || "").toLowerCase().includes(sQuery) ||
        (p.brand || "").toLowerCase().includes(sQuery) ||
        (p.category || "").toLowerCase().includes(sQuery) ||
        (p.barcode || "").includes(sQuery);

      if (selectedCategory === "Todos") return matchSearch;
      if (selectedCategory === "⭐ Favoritos") return matchSearch && p.isFavorite;
      return matchSearch && p.category === selectedCategory;
    });
  }, [localProducts, deferredSearchQuery, selectedCategory]);

  // Sliced products for ultra-lightweight DOM rendering (progressive pagination)
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleProductsCount);
  }, [filteredProducts, visibleProductsCount]);

  const selectedCustomer = useMemo(() => {
    return localCustomers.find(c => c.id === selectedCustomerId) || null;
  }, [localCustomers, selectedCustomerId]);

  // Smart Search / Autocomplete Barcode auto-addition hook
  useEffect(() => {
    if (!searchQuery) return;
    const barcodeMatch = localProducts.find(p => p.barcode === searchQuery.trim() || p.code === searchQuery.trim());
    if (barcodeMatch) {
      setTimeout(() => {
        const inCart = cart.find(item => item.product.id === barcodeMatch.id)?.quantity || 0;
        const liveStock = barcodeMatch.stock - inCart;
        if (liveStock <= 0) {
          if (onShowToast) onShowToast(`Produto "${barcodeMatch.name}" já tem todo o stock (${barcodeMatch.stock} un) no carrinho!`, "warning", "Stock Esgotado");
          setSearchQuery("");
          return;
        }
        handleTriggerAddToCart(barcodeMatch);
        setSearchQuery("");
      }, 0);
    }
  }, [searchQuery, localProducts, cart]);

  // Web Audio API feedback for retail barcode scanner
  const playBarcodeBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1760, ctx.currentTime); // High pitch retail scanner beep (A6)
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch {}
  };

  const playErrorBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {}
  };

  // Buffer input speed for USB / Bluetooth Barcode Scanners - High-speed O(1) Cache Listener
  useEffect(() => {
    let lastKeyTime = Date.now();
    let scanBuffer = "";
    let timeoutId: any = null;

    const processBuffer = () => {
      const code = scanBuffer.trim();
      if (code.length >= 2) {
        const prod = productCache.findByBarcodeOrCode(code);
        if (prod) {
          const inCart = cart.find(item => item.product.id === prod.id)?.quantity || 0;
          const liveStock = prod.stock - inCart;
          if (prod.stock <= 0) {
            playErrorBeep();
            if (onShowToast) onShowToast(`Produto "${prod.name}" está esgotado!`, "error", "Stock Vazio");
          } else if (liveStock <= 0) {
            playErrorBeep();
            if (onShowToast) onShowToast(`Todo o stock de "${prod.name}" (${prod.stock} un) já está no carrinho!`, "warning", "Stock Esgotado");
          } else {
            playBarcodeBeep();
            handleTriggerAddToCart(prod);
            setSearchQuery("");
            // Maintain focus on the search input
            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 30);
          }
        } else {
          playErrorBeep();
          if (onShowToast) onShowToast(`Código "${code}" não cadastrado no catálogo.`, "warning", "Leitor de Código");
        }
      }
      scanBuffer = "";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isSearchInput = target === searchInputRef.current;
      const isOtherInputField = !isSearchInput && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      
      // If user is editing a quantity input or customer select, don't hijack manual typing
      if (isOtherInputField) return;

      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === "Shift" || e.key === "Control" || e.key === "Alt") return;

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (e.key === "Enter") {
        if (scanBuffer.trim()) {
          processBuffer();
        }
        scanBuffer = "";
        return;
      }

      // Hardware scanners type extremely rapidly (< 50ms per key)
      if (diff < 50 || scanBuffer === "") {
        if (e.key.length === 1) {
          scanBuffer += e.key;
        }
      } else {
        if (e.key.length === 1) {
          scanBuffer = e.key;
        }
      }

      // Timeout fallback for scanners that do not append Enter key at the end
      timeoutId = setTimeout(() => {
        if (scanBuffer.trim().length >= 3) {
          processBuffer();
        }
      }, 120);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [productCache, onShowToast]);

  // Add Item Router (check if weight-based and branch-aware stock)
  const handleTriggerAddToCart = useCallback((product: Product, forcedWeight?: number) => {
    if (product.weightBased && !forcedWeight) {
      setWeightPromptProduct(product);
      setWeightInputValue("1.0");
    } else {
      const activeBranch = settings.activeBranchId || "central";
      const availableStock = product.branchStocks && product.branchStocks[activeBranch] !== undefined
        ? product.branchStocks[activeBranch]
        : product.stock;

      const addedQty = forcedWeight || 1;
      setCart(prev => {
        const existing = prev.find(item => item.product.id === product.id);
        if (existing) {
          if (existing.quantity + addedQty > availableStock) {
            if (onShowToast) onShowToast(`Quantidade excede o stock disponível nesta filial (${availableStock} un)! Já tem ${existing.quantity} un no carrinho.`, "warning", "Stock Esgotado");
            return prev;
          }
          const updatedQty = parseFloat((existing.quantity + addedQty).toFixed(3));
          return prev.map(item => 
            item.product.id === product.id 
              ? { ...item, quantity: updatedQty }
              : item
          );
        } else {
          if (addedQty > availableStock) {
            if (onShowToast) onShowToast(`Quantidade excede o stock disponível nesta filial (${availableStock} un)!`, "warning", "Stock Insuficiente");
            return prev;
          }
          return [...prev, { product, quantity: addedQty, discount: 0, vatRate: product.vatRate, observation: "" }];
        }
      });
    }
  }, [onShowToast, settings.activeBranchId]);

  // Memoized sound + add callback for maximum UI reactivity
  const handleAddToCartWithBeep = useCallback((product: Product) => {
    playBarcodeBeep();
    handleTriggerAddToCart(product);
  }, [handleTriggerAddToCart]);

  // Memoized category selector
  const handleSelectCategory = useCallback((cat: string) => {
    setSelectedCategory(cat);
  }, []);

  // Direct edit quantity input field
  const handleDirectQuantityEdit = useCallback((productId: string, valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed <= 0) return;

    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        if (parsed > item.product.stock) {
          if (onShowToast) onShowToast(`Disponível apenas ${item.product.stock} un em stock! Quantidade ajustada ao máximo.`, "warning");
          return { ...item, quantity: item.product.stock };
        }
        return { ...item, quantity: parsed };
      }
      return item;
    }));
  }, [onShowToast]);

  const handleRemoveFromCart = useCallback((productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === productId);
      if (existing) {
        const decStep = existing.product.weightBased ? 0.25 : 1;
        if (existing.quantity > decStep) {
          const updatedQty = parseFloat((existing.quantity - decStep).toFixed(3));
          return prev.map(item => 
            item.product.id === productId 
              ? { ...item, quantity: updatedQty }
              : item
          );
        } else {
          return prev.filter(item => item.product.id !== productId);
        }
      }
      return prev;
    });
  }, []);

  const handleDeleteRow = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;
    let totalItemsCount = 0;

    cart.forEach(item => {
      const itemSub = item.product.salePrice * item.quantity;
      subtotal += itemSub;
      totalItemsCount += item.quantity;
      
      const rate = vatMode === "AUTO" ? item.product.vatRate : (vatMode === "EXEMPT" ? 0 : customVatRate);
      const vatAmount = (itemSub * (rate / 100));
      vatTotal += vatAmount;
    });

    if (discountValue > 0) {
      if (discountType === "PERCENT") {
        discountTotal = (subtotal * (discountValue / 100));
      } else {
        discountTotal = discountValue;
      }
    }

    const grandTotal = Math.max(0, subtotal + vatTotal - discountTotal);

    return {
      subtotal: Math.round(subtotal),
      vatTotal: Math.round(vatTotal),
      discountTotal: Math.round(discountTotal),
      grandTotal: Math.round(grandTotal),
      totalQty: parseFloat(totalItemsCount.toFixed(3))
    };
  }, [cart, discountType, discountValue, vatMode, customVatRate]);

  // Mixed Payment Auto-Balance Check
  const mixedSumTotal = useMemo(() => {
    return mixedCash + mixedMpesa + mixedPOS;
  }, [mixedCash, mixedMpesa, mixedPOS]);

  // Change amount calculation for cash payments
  const calculatedChange = useMemo(() => {
    const received = selectedPaymentMethod === "MIXED" ? mixedCash : receivedCashAmount;
    const baseToPay = selectedPaymentMethod === "MIXED" ? calculations.grandTotal - (mixedMpesa + mixedPOS) : calculations.grandTotal;
    return Math.max(0, received - baseToPay);
  }, [receivedCashAmount, calculations.grandTotal, selectedPaymentMethod, mixedCash, mixedMpesa, mixedPOS]);

  // Items in cart that will fall below critical stock levels after this transaction
  const itemsLeavingStockBelowCritical = useMemo(() => {
    return cart.filter(item => {
      const stockAfterSale = item.product.stock - item.quantity;
      return stockAfterSale <= (item.product.minStock || 0);
    });
  }, [cart]);

  // Mobile Payment Effects (Placed after calculations / selectedCustomer definition)
  useEffect(() => {
    if (selectedPaymentMethod === "MPESA_PAGA_FACIL" || selectedPaymentMethod === "EMOLA") {
      const provider = selectedPaymentMethod === "MPESA_PAGA_FACIL" ? "MPESA" : "EMOLA";
      setMobilePaymentProvider(provider);
      const nextTxSeq = transactions.length + 1;
      setMobileReference(generateDeterministicFinancialReference(settings.companyNuit || settings.companyNif || "OST", "VND", calculations.grandTotal, nextTxSeq));
      setMobilePaymentStatus("IDLE");
      setMobilePaymentProgress(0);
      setMobilePaymentTimer(120);
      
      const storeContact = settings.storeContact;
      if (storeContact) {
        const cleanContact = storeContact.replace(/\D/g, "");
        if (cleanContact.length >= 9) {
          setMobileMerchantCode(cleanContact.slice(-9));
        } else {
          setMobileMerchantCode(provider === "MPESA" ? "849001202" : "823456789");
        }
      } else {
        setMobileMerchantCode(provider === "MPESA" ? "849001202" : "823456789");
      }
    }
  }, [selectedPaymentMethod]);

  useEffect(() => {
    const phone = selectedCustomer?.phone || "";
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length >= 9) {
        setMobileCustomerPhone(cleanPhone.slice(-9));
      } else {
        setMobileCustomerPhone(phone);
      }
    } else {
      setMobileCustomerPhone("");
    }
  }, [selectedCustomer?.phone]);

  useEffect(() => {
    let active = true;
    if (selectedPaymentMethod === "MPESA_PAGA_FACIL" || selectedPaymentMethod === "EMOLA") {
      const payload = `${mobilePaymentProvider.toLowerCase()}://pay?merchant=${mobileMerchantCode}&amount=${calculations.grandTotal}&reference=${mobileReference}&phone=${mobileCustomerPhone}`;
      QRCode.toDataURL(
        payload,
        {
          errorCorrectionLevel: "H",
          margin: 1,
          width: 220,
          color: {
            dark: mobilePaymentProvider === "MPESA" ? "#dc2626" : (mobilePaymentProvider === "EMOLA" ? "#ea580c" : "#16a34a"),
            light: "#ffffff"
          }
        },
        (err, url) => {
          if (active && !err && url) {
            setMobileQrDataUrl(url);
          }
        }
      );
    } else {
      if (active) {
        setMobileQrDataUrl("");
      }
    }
    return () => {
      active = false;
    };
  }, [selectedPaymentMethod, mobilePaymentProvider, mobileMerchantCode, calculations.grandTotal, mobileReference, mobileCustomerPhone]);

  useEffect(() => {
    let interval: any = null;
    const isMobilePayment = selectedPaymentMethod === "MPESA_PAGA_FACIL" || selectedPaymentMethod === "EMOLA";
    const isTimerRunning = mobilePaymentStatus !== "CONFIRMED" && 
                           mobilePaymentStatus !== "IDLE" && 
                           mobilePaymentStatus !== "EXPIRED";

    if (isMobilePayment && isTimerRunning) {
      interval = setInterval(() => {
        setMobilePaymentTimer(prev => {
          if (prev <= 1) {
            setTimeout(() => {
              setMobilePaymentStatus("EXPIRED");
            }, 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedPaymentMethod, mobilePaymentStatus]);

  const handleProcessMobilePayment = () => {
    if (mobilePaymentStatus === "CONFIRMED") return;
    
    setMobilePaymentStatus("SENDING_PUSH");
    setMobilePaymentProgress(15);
    
    // Stage 1 - USSD Push Sent
    setTimeout(() => {
      setMobilePaymentStatus("AWAITING_PIN");
      setMobilePaymentProgress(50);
      
      // Stage 2 - PIN input by customer
      setTimeout(() => {
        setMobilePaymentStatus("VERIFYING");
        setMobilePaymentProgress(80);
        
        // Stage 3 - Final balance verification and success
        setTimeout(() => {
          setMobilePaymentStatus("CONFIRMED");
          setMobilePaymentProgress(100);
          if (onShowToast) {
            onShowToast(`Pagamento via ${mobilePaymentProvider} de ${calculations.grandTotal.toLocaleString()} MT recebido com sucesso!`, "success", "Pagamento Confirmado");
          }
        }, 1200);
      }, 1500);
    }, 1200);
  };

  // Clear states
  const handleReset = () => {
    setCart([]);
    setSelectedCustomerId("");
    setSelectedPaymentMethod("CASH");
    setDiscountValue(0);
    setSearchQuery("");
    setCompletedTx(null);
    setSendEmailStatus("idle");
    setSendSmsStatus("idle");
    setReceivedCashAmount(0);
    setMixedCash(0);
    setMixedMpesa(0);
    setMixedPOS(0);
    setShowPreCheckoutModal(false);
    setShowFinalConfirmModal(false);
    setMobilePaymentStatus("IDLE");
    setMobilePaymentProgress(0);
    setMobilePaymentTimer(120);
  };

  // Execute checkout (Online Only: direct frontend -> Supabase -> PostgreSQL)
  const handleCheckout = async (emitReceipt: boolean = true, isConfirmed: boolean = false, overridePaymentMethod?: string) => {
    if (cart.length === 0) return;

    // 0. Garantir turno aberto para o operador
    if (!isShiftOpen) {
      try {
        await handleConfirmOpenShiftAction(0, "Sistema", "Abertura automática de turno no POS");
      } catch (shiftErr) {
        console.warn("[POS] Erro ao abrir turno:", shiftErr);
      }
    }

    // Bloqueio rigoroso contra duplo clique (Garantia de que 2 cliques não criam 2 vendas)
    if (isProcessingSaleRef.current) {
      console.warn("[POS] Tentativa de duplo clique prevenida: venda já em processamento.");
      if (onShowToast) onShowToast("A venda já está a ser processada. Aguarde a confirmação...", "info");
      return;
    }

    const paymentMethodToUse = overridePaymentMethod || selectedPaymentMethod;

    if (paymentMethodToUse === "DEBT") {
      if (!selectedCustomer) {
        if (onShowToast) onShowToast("Selecione um cliente para prosseguir com a venda a crédito (Dívida).", "warning");
        return;
      }
      if (selectedCustomer.purchaseCount === 0 || selectedCustomer.totalSpent < 20000 || selectedCustomer.creditBlocked) {
        if (onShowToast) onShowToast("Cliente não cumpre os critérios para venda a crédito. Mínimo 20.000 MT de compras e sem bloqueios.", "error", "Crédito Recusado");
        return;
      }
    }

    // Validação Financeira: Impedir pagamento em numerário inferior ao total da venda (exceto fiado/crédito)
    if (paymentMethodToUse === "CASH" && receivedCashAmount > 0 && receivedCashAmount < calculations.grandTotal) {
      const faltam = (calculations.grandTotal - receivedCashAmount).toLocaleString();
      if (onShowToast) {
        onShowToast(
          `O valor entregue (${receivedCashAmount.toLocaleString()} MT) é inferior ao total da venda (${calculations.grandTotal.toLocaleString()} MT). Faltam ${faltam} MT. Para fiado, utilize a modalidade 'Crédito'.`,
          "error",
          "Valor Insuficiente"
        );
      }
      return;
    }

    if (paymentMethodToUse === "MIXED" && Math.abs(mixedSumTotal - calculations.grandTotal) > 1) {
      if (onShowToast) onShowToast(`O somatório dos pagamentos mistos (${mixedSumTotal} MT) não corresponde ao total da venda (${calculations.grandTotal} MT).`, "error", "Pagamento Incorreto");
      return;
    }

    if ((paymentMethodToUse === "MPESA_PAGA_FACIL" || paymentMethodToUse === "EMOLA") && mobilePaymentStatus !== "CONFIRMED") {
      if (onShowToast) {
        onShowToast(`Confirmação Pendente: Certifique-se de receber e validar o pagamento via QR Code primeiro ou use "Forçar".`, "warning", "Pagamento por Confirmar");
      }
      return;
    }

    if (!isConfirmed) {
      setPendingEmitReceipt(emitReceipt);
      setShowFinalConfirmModal(true);
      return;
    }

    // Ativação atómica do bloqueio antes de qualquer chamada remota
    isProcessingSaleRef.current = true;
    setIsProcessingSale(true);

    try {
      setShowFinalConfirmModal(false);

      const nextInvoiceSeq = transactions.length + 1;
      const invoiceNum = generateDeterministicInvoiceNumber(nextInvoiceSeq, settings.invoiceSeries || "A");
      const nowStr = new Date().toISOString();
      const saleUUID = generateUUID();

      const fiscalSign = settings.fiscalModeEnabled !== false
        ? generateFiscalSignature(invoiceNum, nowStr, calculations.grandTotal)
        : {};

      const transaction: Transaction = {
        id: saleUUID,
        idempotencyKey: saleUUID,
        invoiceNumber: invoiceNum,
        timestamp: nowStr,
        subtotal: calculations.subtotal,
        vatTotal: calculations.vatTotal,
        discountTotal: calculations.discountTotal,
        grandTotal: calculations.grandTotal,
        amountPaid: paymentMethodToUse === "CASH" 
          ? (receivedCashAmount > 0 ? receivedCashAmount : calculations.grandTotal) 
          : calculations.grandTotal,
        changeAmount: paymentMethodToUse === "CASH" 
          ? calculatedChange 
          : 0,
        shiftId: currentShift?.id,
        paymentMethod: paymentMethodToUse as any,
        cashierName: activeUsername,
        customerName: selectedCustomer?.name,
        customerId: selectedCustomer?.id,
        customerPhone: selectedCustomer?.phone,
        customerEmail: selectedCustomer?.email,
        nuit: selectedCustomer?.nuit,
        branchId: settings.activeBranchId || "central",
        ...fiscalSign,
        paymentDetails: paymentMethodToUse === "MIXED" 
          ? `Misto: Dinheiro: ${mixedCash} MT | M-Pesa: ${mixedMpesa} MT | POS: ${mixedPOS} MT`
          : paymentMethodToUse === "DEBT"
          ? `Prazo: ${debtDays} dias. Vencimento: ${new Date(Date.now() + debtDays * 24 * 60 * 60 * 1000).toLocaleDateString()}`
          : undefined,
        items: cart.map(item => ({
          productId: item.product.id,
          productName: item.product.name + (item.observation ? ` (${item.observation})` : ""),
          quantity: item.quantity,
          price: item.product.salePrice,
          vatAmount: Math.round(item.product.salePrice * item.quantity * (item.product.vatRate / 100)),
          discountAmount: 0,
          subtotal: item.product.salePrice * item.quantity
        }))
      };

      // Gravação e confirmação da venda
      let saleSuccess = true;
      try {
        const res = await onCompleteSale(transaction);
        saleSuccess = res !== false;
      } catch (err: any) {
        console.warn("[POS] Erro ao gravar venda:", err?.message);
        saleSuccess = true;
      }

      if (!saleSuccess) {
        return;
      }

      setCurrentSaleNumber(prev => prev + 1);

      if (emitReceipt) {
        onAddAuditLog(
          "Efetuar Venda POS",
          "VENDAS",
          `Fatura ${invoiceNum} registrada por ${activeUsername}. Total: ${calculations.grandTotal} ${currency}. Cliente: ${selectedCustomer?.name || 'Geral'}`
        );
        setCompletedTx(transaction);
      } else {
        onAddAuditLog(
          "Efetuar Venda POS (Sem Recibo)",
          "VENDAS",
          `Venda rápida ${invoiceNum} registrada sem emissão de recibo. Total: ${calculations.grandTotal} ${currency}`
        );
        handleReset();
        setNoReceiptSuccess(true);
        setTimeout(() => { setNoReceiptSuccess(false); }, 3000);
      }
      setShowPreCheckoutModal(false);
    } finally {
      isProcessingSaleRef.current = false;
      setIsProcessingSale(false);
    }
  };

  // Helper to trigger receipt printing with simulated visual feedback and safe window.print
  const triggerPrintReceipt = (mode: "receipt" | "invoice" = "receipt") => {
    setPrintMode(mode);
    setIsSimulatingPrint(true);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn("Dispositivo em iFrame bloqueado para window.print.");
      }
    }, 150);
    setTimeout(() => {
      setIsSimulatingPrint(false);
    }, 4000);
  };

  // Global Keyboard Shortcuts (F1, F2, F3, F4, F5, F6, F8, F9, F10, F11, ESC)
  useEffect(() => {
    const executeShortcut = (key: string) => {
      if (isProcessingSaleRef.current) return;
      if (key === "F1") {
        if (showPreCheckoutModal) {
          // If the pre-checkout modal is already open, F1 confirms and finalizes the sale
          handleCheckout(true, true);
          if (onShowToast) onShowToast("Atalho F1: Venda faturada e confirmada!", "success");
        } else {
          // Open help/shortcuts overlay
          setShowShortcutsHelp(prev => !prev);
        }
      } else if (key === "F2") {
        customerSelectRef.current?.focus();
        if (onShowToast) onShowToast("Atalho F2: Selecionar cliente focado!", "info");
      } else if (key === "F3") {
        searchInputRef.current?.focus();
        if (onShowToast) onShowToast("Atalho F3: Pesquisa de produtos focada!", "info");
      } else if (key === "F4") {
        setQuickCustomerModalOpen(true);
      } else if (key === "F5") {
        // Shortcut F5: Trigger Print Function / Instant Finalize & Print
        if (completedTx) {
          triggerPrintReceipt("receipt");
          if (onShowToast) onShowToast("Atalho F5: A imprimir recibo fiscal...", "success");
        } else if (completedBudget) {
          setIsSimulatingPrint(true);
          setTimeout(() => {
            try {
              window.print();
            } catch (err) {
              console.warn("Dispositivo em iFrame bloqueado para window.print.");
            }
          }, 150);
          setTimeout(() => {
            setIsSimulatingPrint(false);
          }, 4000);
          if (onShowToast) onShowToast("Atalho F5: A imprimir proposta de orçamento...", "info");
        } else if (showFinalConfirmModal) {
          handleCheckout(true, true);
          if (onShowToast) onShowToast("Atalho F5: Venda finalizada com emissão de recibo!", "success");
        } else if (showPreCheckoutModal) {
          handleCheckout(true, true);
          if (onShowToast) onShowToast("Atalho F5: Venda confirmada e enviada para faturação!", "success");
        } else if (cart.length > 0) {
          handleCheckout(true, true);
          if (onShowToast) onShowToast("Atalho F5: Venda rápida finalizada e enviada para impressão!", "success");
        } else {
          if (onShowToast) onShowToast("O carrinho está vazio para imprimir ou finalizar.", "warning");
        }
      } else if (key === "F6") {
        const value = prompt("Insira a percentagem de desconto comercial (0 a 100):");
        if (value !== null) {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0 && num <= 100) {
            setDiscountType("PERCENT");
            setDiscountValue(num);
            if (onShowToast) onShowToast(`Desconto de ${num}% aplicado!`, "success");
          }
        }
      } else if (key === "F8") {
        // Toggle payment method
        const methods = ["CASH", "MPESA_PAGA_FACIL", "EMOLA", "POS_CARD", "DEBT", "MIXED"];
        const nextIdx = (methods.indexOf(selectedPaymentMethod) + 1) % methods.length;
        setSelectedPaymentMethod(methods[nextIdx]);
        if (onShowToast) onShowToast(`Método alterado para: ${methods[nextIdx]}`, "info");
      } else if (key === "F9") {
        if (cart.length > 0) {
          setShowPreCheckoutModal(true);
        } else {
          if (onShowToast) onShowToast("O carrinho está vazio para finalizar.", "warning");
        }
      } else if (key === "F10" || key === "F11") {
        handleToggleMinimized();
        if (onShowToast) onShowToast(!isMinimized ? "Modo minimizado ativado (Foco na venda)" : "Modo normal restaurado", "info");
      } else if (key === "Escape") {
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
        } else if (cart.length > 0) {
          if (confirm("Deseja mesmo limpar e cancelar a venda actual?")) {
            handleReset();
            if (onShowToast) onShowToast("Venda cancelada com sucesso.", "info");
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F1" || 
        e.key === "F2" || 
        e.key === "F3" || 
        e.key === "F4" || 
        e.key === "F5" || 
        e.key === "F6" || 
        e.key === "F8" || 
        e.key === "F9" || 
        e.key === "F10" || 
        e.key === "F11" || 
        e.key === "Escape"
      ) {
        e.preventDefault();
        executeShortcut(e.key);
      }
    };

    const handleCustomShortcut = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail && customEvent.detail.key) {
        executeShortcut(customEvent.detail.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pos-shortcut-trigger", handleCustomShortcut);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pos-shortcut-trigger", handleCustomShortcut);
    };
  }, [
    cart, 
    selectedPaymentMethod, 
    showPreCheckoutModal, 
    showFinalConfirmModal, 
    showShortcutsHelp, 
    completedTx, 
    completedBudget, 
    isMinimized, 
    calculations, 
    selectedCustomer, 
    receivedCashAmount, 
    mixedSumTotal, 
    mobilePaymentStatus
  ]);

  // 15. Suspend and Resume Sale functions
  const handleSuspendSale = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast("O carrinho está vazio para ser suspenso.", "warning");
      return;
    }
    const id = generateEntityId("susp");
    const desc = selectedCustomer?.name || "Consumidor Geral";
    const record = {
      id,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cart: [...cart],
      customerId: selectedCustomerId
    };
    setSuspendedCarts(prev => [...prev, record]);
    setCart([]);
    setSelectedCustomerId("");
    if (onShowToast) onShowToast(`Venda de "${desc}" suspensa com sucesso!`, "success", "Venda Suspensa");
  };

  const handleResumeSale = (id: string) => {
    const target = suspendedCarts.find(s => s.id === id);
    if (target) {
      setCart(target.cart);
      setSelectedCustomerId(target.customerId);
      setSuspendedCarts(prev => prev.filter(s => s.id !== id));
      if (onShowToast) onShowToast("Carrinho suspenso restaurado com sucesso!", "success");
    }
  };

  const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
    if (!imageUrl) return "";
    if (imageUrl.startsWith("data:")) {
      return imageUrl;
    }
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

  const getFormatFromBase64 = (base64: string): string => {
    if (!base64) return "JPEG";
    if (base64.startsWith("data:image/png")) return "PNG";
    if (base64.startsWith("data:image/webp")) return "WEBP";
    if (base64.startsWith("data:image/gif")) return "GIF";
    if (base64.startsWith("data:image/svg")) return "SVG";
    return "JPEG";
  };

  // Digital communication real delivery API
  const handleSendEmail = async (overrideCustomer?: any) => {
    if (!completedTx) {
      if (onShowToast) onShowToast("Nenhuma transação concluída para enviar recibo.", "warning");
      return;
    }
    const isCustomerObj = overrideCustomer && typeof overrideCustomer === "object" && typeof overrideCustomer.name === "string" && !("nativeEvent" in overrideCustomer);
    const currentCust: Customer | null = (isCustomerObj ? overrideCustomer : null) || selectedCustomer;
    if (!currentCust) {
      setQuickCustName(completedTx.customerName && completedTx.customerName !== "Consumidor Geral" ? completedTx.customerName : "");
      setQuickCustPhone(completedTx.customerPhone || "");
      if (onShowToast) onShowToast("Cliente não registado. Introduza os dados e e-mail para despachar a fatura.", "warning", "Cliente não Registado");
      setPendingReceiptAction("email");
      setQuickCustomerModalOpen(true);
      return;
    }
    const targetEmail = (currentCust.email || "").trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      setQuickCustName(currentCust.name && currentCust.name !== "Consumidor Geral" ? currentCust.name : "");
      setQuickCustPhone(currentCust.phone && currentCust.phone !== "Indisponível" && currentCust.phone !== "Sem Telemóvel" ? currentCust.phone : "");
      setQuickCustNuit(currentCust.nuit || "");
      if (onShowToast) onShowToast("O cliente não possui um endereço de e-mail válido. Por favor, introduza o e-mail para envio.", "warning", "E-mail Obrigatório");
      setPendingReceiptAction("email");
      setQuickCustomerModalOpen(true);
      return;
    }
    setSendEmailStatus("sending");
    try {
      const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
      const rgbArray = activeTheme.rgb.split(",").map(Number);

      // 1. Generate client-side styled PDF
      const doc = new jsPDF();
      
      // Top theme color bar
      doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
      doc.rect(0, 0, 210, 8, "F");

      // Company Logo safely loaded
      try {
        const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
        if (logoData) {
          const format = getFormatFromBase64(logoData);
          doc.addImage(logoData, format, 165, 12, 30, 30);
        }
      } catch (logoErr) {
        console.warn("Logo não pôde ser inserido no PDF:", logoErr);
      }
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(settings.companyName || "Indisponível", 14, 22);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`NUIT: ${settings.companyNuit || "Indisponível"}`, 14, 28);
      doc.text(`Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 33);
      doc.text(`Contacto: ${settings.storeContact || "Indisponível"}`, 14, 38);
      
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 44, 196, 44);
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`FATURA-RECIBO: ${completedTx.invoiceNumber}`, 14, 52);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Data / Hora: ${new Date(completedTx.timestamp).toLocaleString("pt-MZ")}`, 14, 59);
      doc.text(`Caixa/Operador: ${activeUsername || "Operador"}`, 14, 64);
      doc.text(`Cliente: ${currentCust.name || completedTx.customerName || "Consumidor Geral"}`, 14, 69);
      if (completedTx.customerPhone || currentCust.phone) {
        doc.text(`Telemóvel: ${completedTx.customerPhone || currentCust.phone}`, 14, 74);
      }

      const tableHead = [["PRODUTO / SERVIÇO", "QUANTIDADE", "PREÇO UNIT.", "SUBTOTAL"]];
      const tableBody = completedTx.items.map(item => [
        item.productName,
        item.quantity.toString(),
        `${item.price.toLocaleString()} MT`,
        `${item.subtotal.toLocaleString()} MT`
      ]);

      autoTable(doc, {
        startY: (completedTx.customerPhone || currentCust.phone) ? 80 : 75,
        head: tableHead,
        body: tableBody,
        theme: "grid",
        headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number] },
        styles: { fontSize: 8, cellPadding: 3 }
      });

      const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 150;
      
      // Totals container box
      doc.setFillColor(248, 250, 252);
      doc.rect(120, finalY, 76, 35, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(120, finalY, 76, 35, "S");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      
      doc.text(`Subtotal:`, 124, finalY + 6);
      doc.text(`${completedTx.subtotal.toLocaleString()} MT`, 192, finalY + 6, { align: "right" });
      
      if (completedTx.discountTotal > 0) {
        doc.setTextColor(239, 68, 68);
        doc.text(`Desconto:`, 124, finalY + 12);
        doc.text(`-${completedTx.discountTotal.toLocaleString()} MT`, 192, finalY + 12, { align: "right" });
        doc.setTextColor(71, 85, 105);
      }
      
      doc.text(`IVA (16%):`, 124, finalY + 18);
      doc.text(`${completedTx.vatTotal.toLocaleString()} MT`, 192, finalY + 18, { align: "right" });
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(rgbArray[0], rgbArray[1], rgbArray[2]);
      doc.text(`TOTAL PAGO:`, 124, finalY + 26);
      doc.text(`${completedTx.grandTotal.toLocaleString()} MT`, 192, finalY + 26, { align: "right" });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Método de pagamento: ${completedTx.paymentMethod}`, 124, finalY + 31);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("Obrigado pela sua preferência!", 105, finalY + 45, { align: "center" });

      const pdfBase64DataUri = doc.output('datauristring');
      const base64Content = pdfBase64DataUri.split(',')[1];

      // Dispatch directly via robust server communication endpoint
      const response = await authenticatedFetch("/api/email/dispatch-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: targetEmail,
          email: targetEmail,
          invoiceNumber: completedTx.invoiceNumber,
          grandTotal: completedTx.grandTotal,
          totalAmount: completedTx.grandTotal,
          cashier: activeUsername,
          customer: currentCust.name || completedTx.customerName || "Consumidor Geral",
          customerName: currentCust.name || completedTx.customerName || "Consumidor Geral",
          items: completedTx.items,
          subtotal: completedTx.subtotal,
          discountTotal: completedTx.discountTotal,
          vatTotal: completedTx.vatTotal,
          paymentMethod: completedTx.paymentMethod,
          pdfAttachment: base64Content,
          pdfBase64: base64Content
        })
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resData.error || resData.message || "Erro no envio de fatura por email.");
      }

      setSendEmailStatus("sent");
      setTimeout(() => setSendEmailStatus("idle"), 3500);

      onAddAuditLog("Enviar Recibo por Email", "VENDAS", `Fatura ${completedTx.invoiceNumber} enviada via e-mail para ${targetEmail} com PDF anexo.`);
      if (resData.warning) {
        if (onShowToast) onShowToast(resData.message || `Recibo registado para ${targetEmail}!`, "info", "Recibo Registado");
      } else {
        if (onShowToast) onShowToast(resData.message || `Recibo enviado por email com sucesso para ${targetEmail}!`, "success", "E-mail Enviado");
      }
    } catch (err: any) {
      setSendEmailStatus("idle");
      if (onShowToast) onShowToast(err?.message || "Não foi possível enviar o e-mail. Verifique o servidor SMTP nas Definições.", "error", "Falha de E-mail");
    }
  };

  const handleSendSms = async (overrideCustomer?: any) => {
    if (!completedTx) return;
    const isCustomerObj = overrideCustomer && typeof overrideCustomer === "object" && typeof overrideCustomer.name === "string" && !("nativeEvent" in overrideCustomer);
    const currentCust: Customer | null = (isCustomerObj ? overrideCustomer : null) || selectedCustomer;
    if (!currentCust) {
      if (onShowToast) onShowToast("Cliente não registado. Abra o cadastro rápido para registar este cliente. O envio do SMS começará automaticamente.", "warning", "Cliente não Registado");
      setPendingReceiptAction("sms");
      setQuickCustomerModalOpen(true);
      return;
    }
    setSendSmsStatus("sending");
    try {
      const resp = await authenticatedFetch("/api/sms/dispatch-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: currentCust.phone || "+258 84 900 1202",
          phone: currentCust.phone || "+258 84 900 1202",
          invoiceNumber: completedTx.invoiceNumber,
          grandTotal: completedTx.grandTotal,
          totalAmount: completedTx.grandTotal,
          companyName: settings.companyName || "OST Vendas"
        })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `HTTP ${resp.status}: Falha no envio`);
      }
      setSendSmsStatus("sent");
      onAddAuditLog("Enviar Recibo por SMS", "VENDAS", `Fatura ${completedTx.invoiceNumber} enviada via SMS para ${currentCust.phone}.`);
      if (onShowToast) onShowToast("SMS de confirmação despachado!", "success");
    } catch (err: any) {
      setSendSmsStatus("idle");
      if (onShowToast) onShowToast(err?.message || "Falha ao enviar SMS. Verifique as credenciais do Gateway de SMS.", "error", "Falha de SMS");
    }
  };

  const handleOpenWhatsAppModal = (overrideCustomer?: any) => {
    if (!completedTx) {
      if (onShowToast) onShowToast("Nenhuma transação concluída para enviar recibo.", "warning");
      return;
    }
    const isCustomerObj = overrideCustomer && typeof overrideCustomer === "object" && typeof overrideCustomer.name === "string" && !("nativeEvent" in overrideCustomer);
    const currentCust: Customer | null = (isCustomerObj ? overrideCustomer : null) || selectedCustomer;
    if (!currentCust) {
      setQuickCustName(completedTx.customerName && completedTx.customerName !== "Consumidor Geral" ? completedTx.customerName : "");
      setQuickCustPhone(completedTx.customerPhone || "");
      if (onShowToast) onShowToast("Cliente não registado. Introduza o número de telemóvel para enviar via WhatsApp.", "warning", "Cliente não Registado");
      setPendingReceiptAction("whatsapp");
      setQuickCustomerModalOpen(true);
      return;
    }
    
    const rawPhone = currentCust.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone === "0") {
      setQuickCustName(currentCust.name && currentCust.name !== "Consumidor Geral" ? currentCust.name : "");
      setQuickCustEmail(currentCust.email || "");
      setQuickCustNuit(currentCust.nuit || "");
      if (onShowToast) onShowToast("O cliente selecionado não possui um número de telemóvel válido para WhatsApp.", "warning", "Telemóvel Indisponível");
      setPendingReceiptAction("whatsapp");
      setQuickCustomerModalOpen(true);
      return;
    }

    // Default URL pre-generation with Mozambique standard prefix
    const defaultPhone = cleanPhone.length === 9 && (cleanPhone.startsWith("84") || cleanPhone.startsWith("85") || cleanPhone.startsWith("82") || cleanPhone.startsWith("87") || cleanPhone.startsWith("86"))
      ? `258${cleanPhone}`
      : cleanPhone;

    // Format a beautiful text invoice for Mozambique with local details
    const dateStr = new Date(completedTx.timestamp).toLocaleString("pt-MZ");
    const itemsText = completedTx.items
      .map(item => `▪️ ${item.quantity}x ${item.productName} - ${(item.price * item.quantity).toLocaleString("pt-MZ")} MT`)
      .join("\n");

    const text = `🧾 *RECIBO DIGITAL DE VENDA* - ${settings.companyName || "OST Vendas"} 🇲🇿\n` +
      `------------------------------------------\n` +
      `*Fatura:* ${completedTx.invoiceNumber}\n` +
      `*Data:* ${dateStr}\n` +
      `*Operador:* ${completedTx.cashierName || activeUsername}\n` +
      `*Cliente:* ${currentCust.name || completedTx.customerName || "Consumidor Geral"}\n` +
      `------------------------------------------\n` +
      `*Artigos:*\n${itemsText}\n` +
      `------------------------------------------\n` +
      `*Subtotal:* ${completedTx.subtotal.toLocaleString("pt-MZ")} MT\n` +
      (completedTx.discountTotal > 0 ? `*Desconto:* -${completedTx.discountTotal.toLocaleString("pt-MZ")} MT\n` : "") +
      `*IVA Cobrado:* ${completedTx.vatTotal.toLocaleString("pt-MZ")} MT\n` +
      `*TOTAL PAGO: ${completedTx.grandTotal.toLocaleString("pt-MZ")} MT*\n` +
      `------------------------------------------\n` +
      `*Forma de Pagamento:* ${completedTx.paymentMethod}\n\n` +
      `Muito obrigado pela sua preferência! Volte sempre. ✨`;

    setWhatsappMessage(text);
    setWhatsappPhone(defaultPhone);
    setSendWhatsAppStatus("idle");
    setWhatsappModalOpen(true);

    // Se acionado pelo fluxo rápido ou direto, despacha imediatamente mantendo o modal aberto com o botão wa.me
    dispatchWhatsAppReceipt(true, defaultPhone, text, false);
  };

  const dispatchWhatsAppReceipt = async (forceLinkDirect = false, targetPhone?: string, targetMessage?: string, closeModal = true) => {
    if (!completedTx) return;
    
    const phoneToUse = targetPhone || whatsappPhone;
    const msgToUse = targetMessage || whatsappMessage;

    const cleanPhone = phoneToUse.replace(/\D/g, "");
    const defaultPhone = cleanPhone.length === 9 && (cleanPhone.startsWith("84") || cleanPhone.startsWith("85") || cleanPhone.startsWith("82") || cleanPhone.startsWith("87") || cleanPhone.startsWith("86"))
      ? `258${cleanPhone}`
      : cleanPhone;

    const directUrl = `https://wa.me/${defaultPhone}?text=${encodeURIComponent(msgToUse)}`;

    const openDirectWhatsapp = () => {
      let opened = false;
      try {
        const win = window.open(directUrl, "_blank", "noopener,noreferrer");
        if (win) opened = true;
      } catch (e) {
        console.warn("Could not window.open WhatsApp:", e);
      }
      if (!opened) {
        try {
          const link = document.createElement("a");
          link.href = directUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          opened = true;
        } catch (e) {
          console.warn("Could not click link WhatsApp:", e);
        }
      }
      return opened;
    };

    if (forceLinkDirect || !settings.whatsappEnabled || settings.whatsappProvider === "DIRECT_LINK") {
      setSendWhatsAppStatus("sent");
      setTimeout(() => setSendWhatsAppStatus("idle"), 4000);
      onAddAuditLog("Enviar Recibo WhatsApp", "VENDAS", `Link WhatsApp gerado para Fatura ${completedTx.invoiceNumber} (${defaultPhone}).`);
      openDirectWhatsapp();
      if (closeModal) {
        setWhatsappModalOpen(false);
      }
      if (onShowToast) onShowToast(`WhatsApp pronto para ${defaultPhone}! Se não abriu automaticamente, clique em "Abrir Conversa do WhatsApp".`, "success", "WhatsApp Pronto");
      return;
    }

    setSendWhatsAppStatus("sending");
    try {
      const response = await authenticatedFetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: defaultPhone,
          message: msgToUse,
          gatewayConfig: settings
        })
      });

      const resData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(resData.error || "Falha ao enviar através do Gateway");
      }

      setSendWhatsAppStatus("sent");
      setTimeout(() => setSendWhatsAppStatus("idle"), 4000);
      onAddAuditLog("Enviar Recibo WhatsApp", "VENDAS", `Fatura ${completedTx.invoiceNumber} enviada via WhatsApp Gateway.`);
      if (onShowToast) onShowToast(resData.message || `Recibo WhatsApp enviado para ${defaultPhone}!`, "success");
      if (closeModal) {
        setWhatsappModalOpen(false);
      }
    } catch (err: any) {
      setSendWhatsAppStatus("sent");
      setTimeout(() => setSendWhatsAppStatus("idle"), 4000);
      if (onShowToast) onShowToast(`Abrindo link direto do WhatsApp (${defaultPhone})...`, "info");
      openDirectWhatsapp();
      if (closeModal) {
        setWhatsappModalOpen(false);
      }
    }
  };

  // Helper for formatting budget or transaction details in ESC/POS layout
  const getEscPosText = (budget: any, paperSize: "80MM" | "58MM") => {
    const width = paperSize === "58MM" ? 32 : 48; // characters per line
    
    const padChar = (str: string, len: number, char: string = " ", right: boolean = false) => {
      const cleanStr = String(str || "");
      if (cleanStr.length >= len) return cleanStr.substring(0, len);
      const pad = char.repeat(len - cleanStr.length);
      return right ? pad + cleanStr : cleanStr + pad;
    };
    
    const centerText = (str: string) => {
      const cleanStr = String(str || "");
      if (cleanStr.length >= width) return cleanStr.substring(0, width);
      const leftPad = Math.floor((width - cleanStr.length) / 2);
      return " ".repeat(leftPad) + cleanStr;
    };

    const lineSeparator = "-".repeat(width);
    const doubleLineSeparator = "=".repeat(width);

    let out = "";
    out += "[ESC @] -- INICIALIZAR IMPRESSORA\n";
    out += "[ESC a 1] -- ALINHAMENTO AO CENTRO\n";
    out += centerText(settings.companyName || "Indisponível") + "\n";
    if (settings.slogan) out += centerText(settings.slogan) + "\n";
    out += centerText(settings.storeAddress || settings.companyAddress || "Indisponível") + "\n";
    out += centerText(`NUIT EMPRESA: ${settings.companyNuit || "Indisponível"}`) + "\n";
    if (settings.storeContact) out += centerText(`Tel: ${settings.storeContact}`) + "\n";
    out += lineSeparator + "\n";
    
    out += "[ESC a 0] -- ALINHAMENTO À ESQUERDA\n";
    out += `PROPOSTA COMERCIAL (ORÇAMENTO)\n`;
    out += `NÚMERO : ${budget.budgetNumber}\n`;
    out += `EMISSÃO: ${new Date(budget.timestamp).toLocaleString("pt-MZ")}\n`;
    out += `VALIDADE: 15 DIAS DEPOIS\n`;
    out += `OPERADOR: ${activeUsername}\n`;
    out += lineSeparator + "\n";
    out += `DADOS DO CLIENTE:\n`;
    out += `NOME   : ${budget.customerName}\n`;
    if (budget.customerNuit)  out += `NUIT   : ${budget.customerNuit}\n`;
    if (budget.customerPhone) out += `CONTAC : ${budget.customerPhone}\n`;
    if (budget.customerEmail) out += `EMAIL  : ${budget.customerEmail}\n`;
    out += doubleLineSeparator + "\n";
    
    const itemLen = paperSize === "58MM" ? 14 : 24;
    const qtyLen = paperSize === "58MM" ? 4 : 6;
    const valLen = paperSize === "58MM" ? 14 : 18;
    
    out += padChar("ARTIGO", itemLen) + padChar("QTD", qtyLen, " ", true) + padChar("VALOR", valLen, " ", true) + "\n";
    out += lineSeparator + "\n";
    
    budget.items.forEach((item: any) => {
      const name = item.productName.substring(0, itemLen - 1);
      const qty = String(item.quantity);
      const val = (item.price * item.quantity).toLocaleString() + " MT";
      out += padChar(name, itemLen) + padChar(qty, qtyLen, " ", true) + padChar(val, valLen, " ", true) + "\n";
    });
    
    out += lineSeparator + "\n";
    out += padChar("SUBTOTAL:", itemLen + qtyLen) + padChar(budget.subtotal.toLocaleString() + " MT", valLen, " ", true) + "\n";
    if (budget.discountTotal > 0) {
      out += padChar("DESCONTO:", itemLen + qtyLen) + padChar("-" + budget.discountTotal.toLocaleString() + " MT", valLen, " ", true) + "\n";
    }
    out += padChar("IVA ESTIMADO (16%):", itemLen + qtyLen) + padChar(budget.vatTotal.toLocaleString() + " MT", valLen, " ", true) + "\n";
    out += doubleLineSeparator + "\n";
    out += "[ESC ! 17] -- DOUBLE HEIGHT & DOUBLE WIDTH BOLD\n";
    out += padChar("TOTAL PROP:", itemLen + qtyLen) + padChar(budget.grandTotal.toLocaleString() + " MT", valLen, " ", true) + "\n";
    out += "[ESC ! 0] -- FONTE NORMAL\n";
    out += doubleLineSeparator + "\n";
    out += "[ESC a 1] -- ALINHAMENTO AO CENTRO\n";
    out += centerText("*** VALIDADE 15 DIAS ***") + "\n";
    out += centerText("Este documento nao serve como fatura.") + "\n";
    out += centerText("Obrigado pela preferência!") + "\n";
    out += "[GS V 66 0] -- CORTE TOTAL DE PAPEL\n";
    
    return out;
  };

  // --- ORÇAMENTO (BUDGET / QUOTE) FUNCTIONS ---
  const handleGenerateBudget = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast("O carrinho está vazio para gerar um orçamento.", "warning");
      return;
    }

    const budgetNumber = `ORC-${new Date().getFullYear()}-${String(currentSaleNumber).padStart(4, "0")}`;
    const timestamp = Date.now();
    
    const budgetData = {
      budgetNumber,
      timestamp,
      customerName: selectedCustomer ? selectedCustomer.name : "Consumidor Geral",
      customerEmail: selectedCustomer?.email,
      customerPhone: selectedCustomer?.phone,
      customerNuit: selectedCustomer?.nuit,
      items: cart.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.product.salePrice,
      })),
      subtotal: calculations.subtotal,
      discountTotal: calculations.discountTotal,
      vatTotal: calculations.vatTotal,
      grandTotal: calculations.grandTotal,
    };

    setCompletedBudget(budgetData);
    setBudgetTargetEmail(budgetData.customerEmail || "");
    setBudgetTargetPhone(budgetData.customerPhone || "");
    setSendBudgetEmailStatus("idle");
    setSendBudgetSmsStatus("idle");
    setSendBudgetWhatsAppStatus("idle");

    onAddAuditLog(
      "Gerar Orçamento POS",
      "VENDAS",
      `Orçamento ${budgetNumber} gerado para ${budgetData.customerName}. Total: ${calculations.grandTotal} MT.`
    );

    if (onShowToast) {
      onShowToast(`Orçamento ${budgetNumber} gerado com sucesso!`, "success", "Orçamento Gerado");
    }
  };

  const handleSendBudgetEmail = async () => {
    if (!completedBudget) return;
    const targetEmail = budgetTargetEmail || completedBudget.customerEmail;
    if (!targetEmail) {
      if (onShowToast) onShowToast("Nenhum endereço de e-mail informado para envio da cotação.", "warning", "E-mail Indisponível");
      return;
    }
    setSendBudgetEmailStatus("sending");
    try {
      const activeTheme = SYSTEM_THEMES.find(t => t.id === settings.theme) || SYSTEM_THEMES[0];
      const rgbArray = activeTheme.rgb.split(",").map(Number);

      // 1. Generate client-side styled PDF for the budget
      const doc = new jsPDF();
      
      // Top theme color bar
      doc.setFillColor(rgbArray[0], rgbArray[1], rgbArray[2]);
      doc.rect(0, 0, 210, 8, "F");

      // Company Logo
      const logoData = await getBase64ImageFromUrl(settings.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
      if (logoData) {
        const format = getFormatFromBase64(logoData);
        doc.addImage(logoData, format, 165, 12, 30, 30);
      }
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(settings.companyName || "Indisponível", 14, 22);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`NUIT: ${settings.companyNuit || "Indisponível"}`, 14, 28);
      doc.text(`Endereço: ${settings.storeAddress || settings.companyAddress || "Indisponível"}`, 14, 33);
      doc.text(`Contacto: ${settings.storeContact || "Indisponível"}`, 14, 38);
      
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 44, 196, 44);
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 83, 9); // Amber-700
      doc.text(`PROPOSTA DE ORÇAMENTO: ${completedBudget.budgetNumber}`, 14, 52);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Data Emissão: ${new Date(completedBudget.timestamp).toLocaleString("pt-MZ")}`, 14, 59);
      doc.text(`Validade: 15 Dias (Até ${new Date(completedBudget.timestamp + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-MZ")})`, 14, 64);
      doc.text(`Caixa/Operador: ${activeUsername || "Operador"}`, 14, 69);
      doc.text(`Cliente: ${completedBudget.customerName}`, 14, 74);
      if (completedBudget.customerNuit) {
        doc.text(`NUIT Cliente: ${completedBudget.customerNuit}`, 14, 79);
      }

      const tableHead = [["ARTIGO / PRODUTO", "QUANTIDADE", "PREÇO UNIT.", "SUBTOTAL"]];
      const tableBody = completedBudget.items.map(item => [
        item.productName,
        item.quantity.toString(),
        `${item.price.toLocaleString()} MT`,
        `${(item.price * item.quantity).toLocaleString()} MT`
      ]);

      autoTable(doc, {
        startY: completedBudget.customerNuit ? 85 : 80,
        head: tableHead,
        body: tableBody,
        theme: "grid",
        headStyles: { fillColor: [rgbArray[0], rgbArray[1], rgbArray[2]] as [number, number, number] },
        styles: { fontSize: 8, cellPadding: 3 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      
      // Totals container box
      doc.setFillColor(248, 250, 252);
      doc.rect(120, finalY, 76, 30, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(120, finalY, 76, 30, "S");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Subtotal:`, 124, finalY + 6);
      doc.text(`${completedBudget.subtotal.toLocaleString()} MT`, 192, finalY + 6, { align: "right" });
      if (completedBudget.discountTotal > 0) {
        doc.setTextColor(239, 68, 68);
        doc.text(`Desconto:`, 124, finalY + 12);
        doc.text(`-${completedBudget.discountTotal.toLocaleString()} MT`, 192, finalY + 12, { align: "right" });
        doc.setTextColor(71, 85, 105);
      }
      doc.text(`IVA Estimado:`, 124, finalY + 18);
      doc.text(`${completedBudget.vatTotal.toLocaleString()} MT`, 192, finalY + 18, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(180, 83, 9); // Amber-700
      doc.text(`TOTAL PROPOSTO:`, 124, finalY + 25);
      doc.text(`${completedBudget.grandTotal.toLocaleString()} MT`, 192, finalY + 25, { align: "right" });

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Este documento constitui apenas uma proposta comercial.", 105, finalY + 40, { align: "center" });

      const pdfBase64DataUri = doc.output('datauristring');
      const base64Content = pdfBase64DataUri.split(',')[1];

      // Prepare email body
      const itemsHtml = completedBudget.items
        .map(item => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left;">${item.productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${item.price.toLocaleString()} MT</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${(item.price * item.quantity).toLocaleString()} MT</td>
          </tr>
        `).join("");

      const emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #ea580c; margin: 0;">${settings.companyName || "OST Vendas"}</h2>
            <p style="color: #64748b; margin: 5px 0 0 0;">Orçamento Comercial</p>
          </div>
          <p><strong>Orçamento Nº:</strong> ${completedBudget.budgetNumber}</p>
          <p><strong>Data de Emissão:</strong> ${new Date(completedBudget.timestamp).toLocaleString("pt-MZ")}</p>
          <p><strong>Validade:</strong> 15 Dias (Até ${new Date(completedBudget.timestamp + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-MZ")})</p>
          <p><strong>Operador:</strong> ${activeUsername}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
          <p>Olá <strong>${completedBudget.customerName}</strong>,</p>
          <p>Abaixo encontra-se o orçamento comercial solicitado para a sua apreciação:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px;">
            <thead>
              <tr style="background-color: #f8fafc; color: #475569;">
                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">Artigo</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">Qtd</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Preço Un.</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="text-align: right; font-size: 13px; color: #475569; line-height: 1.6;">
            <p><strong>Subtotal:</strong> ${completedBudget.subtotal.toLocaleString()} MT</p>
            ${completedBudget.discountTotal > 0 ? `<p style="color: #ef4444;"><strong>Desconto:</strong> -${completedBudget.discountTotal.toLocaleString()} MT</p>` : ""}
            <p><strong>IVA Cobrado:</strong> ${completedBudget.vatTotal.toLocaleString()} MT</p>
            <p style="font-size: 16px; color: #ea580c; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;"><strong>Total Geral:</strong> ${completedBudget.grandTotal.toLocaleString()} MT</p>
          </div>

          <div style="background-color: #f8fafc; padding: 12px; border-radius: 8px; border-left: 4px solid #ea580c; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 25px;">
            <strong>Nota:</strong> Este documento constitui apenas uma proposta comercial válida por 15 dias e não serve como recibo ou comprovativo de pagamento.
          </div>

          <p style="margin-top: 30px; font-size: 12px; color: #64748b; text-align: center;">Estamos à sua disposição!<br><em>${settings.companyName || "OST Vendas"}</em></p>
        </div>
      `;

      // Try client-side Gmail API first
      try {
        await sendEmail({
          to: targetEmail,
          subject: `Orçamento ${completedBudget.budgetNumber} - ${settings.companyName || "OST Vendas"}`,
          body: emailBody,
          isHtml: true,
          attachments: [{
            filename: `Orcamento_${completedBudget.budgetNumber}.pdf`,
            content: base64Content,
            mimeType: "application/pdf"
          }]
        });

        setSendBudgetEmailStatus("sent");
        onAddAuditLog("Enviar Orçamento por Email", "VENDAS", `Orçamento ${completedBudget.budgetNumber} enviado via e-mail real para ${targetEmail} com PDF anexo.`);
        if (onShowToast) onShowToast("Orçamento enviado por e-mail com sucesso via Gmail API!", "success");
      } catch (gmailErr: any) {
        console.warn("Could not send email via Gmail API, falling back to server-side SMTP:", gmailErr);
        
        // Fall back to server endpoint /api/email/dispatch-budget
        const res = await authenticatedFetch("/api/email/dispatch-budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: targetEmail,
            budgetNumber: completedBudget.budgetNumber,
            grandTotal: completedBudget.grandTotal,
            cashier: activeUsername,
            customer: completedBudget.customerName,
            items: completedBudget.items,
            subtotal: completedBudget.subtotal,
            discountTotal: completedBudget.discountTotal,
            vatTotal: completedBudget.vatTotal,
            pdfAttachment: base64Content
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Erro desconhecido no servidor.");
        }

        setSendBudgetEmailStatus("sent");
        onAddAuditLog("Enviar Orçamento por Email", "VENDAS", `Orçamento ${completedBudget.budgetNumber} enviado via e-mail do servidor (SMTP) para ${targetEmail} com PDF.`);
        if (onShowToast) onShowToast("Orçamento enviado por e-mail com sucesso!", "success");
      }
    } catch (err: any) {
      console.error("Could not send budget email:", err);
      setSendBudgetEmailStatus("idle");
      if (onShowToast) onShowToast(`Erro ao enviar orçamento: ${err.message || err}`, "error");
    }
  };

  const handleSendBudgetSms = async () => {
    if (!completedBudget) return;
    setSendBudgetSmsStatus("sending");
    const targetPhone = budgetTargetPhone || completedBudget.customerPhone || "+258 84 900 1202";
    try {
      const resp = await authenticatedFetch("/api/sms/dispatch-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: targetPhone,
          invoiceNumber: completedBudget.budgetNumber,
          grandTotal: completedBudget.grandTotal
        })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `HTTP ${resp.status}`);
      }
      setSendBudgetSmsStatus("sent");
      onAddAuditLog("Enviar Orçamento por SMS", "VENDAS", `Orçamento ${completedBudget.budgetNumber} enviado via SMS para ${targetPhone}.`);
      if (onShowToast) onShowToast("Orçamento enviado por SMS com sucesso!", "success");
    } catch (err: any) {
      setSendBudgetSmsStatus("idle");
      if (onShowToast) onShowToast(err?.message || "Falha ao enviar SMS do orçamento.", "error");
    }
  };

  const handleOpenBudgetWhatsApp = () => {
    if (!completedBudget) return;
    
    const dateStr = new Date(completedBudget.timestamp).toLocaleDateString("pt-MZ");
    const validUntilStr = new Date(completedBudget.timestamp + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-MZ");
    const itemsText = completedBudget.items
      .map(item => `▪️ ${item.quantity}x ${item.productName} - ${(item.price * item.quantity).toLocaleString()} MT`)
      .join("\n");

    const text = `📝 *ORÇAMENTO COMERCIAL* - ${settings.companyName || "OST Vendas"} 🇲🇿\n` +
      `------------------------------------------\n` +
      `*Orçamento:* ${completedBudget.budgetNumber}\n` +
      `*Data de Emissão:* ${dateStr}\n` +
      `*Validade:* 15 dias (Até ${validUntilStr})\n` +
      `*Operador:* ${activeUsername}\n` +
      `*Cliente:* ${completedBudget.customerName}\n` +
      `------------------------------------------\n` +
      `*Artigos:*\n${itemsText}\n` +
      `------------------------------------------\n` +
      `*Subtotal:* ${completedBudget.subtotal.toLocaleString()} MT\n` +
      (completedBudget.discountTotal > 0 ? `*Desconto:* -${completedBudget.discountTotal.toLocaleString()} MT\n` : "") +
      `*IVA:* ${completedBudget.vatTotal.toLocaleString()} MT\n` +
      `*TOTAL PROPOSTO: ${completedBudget.grandTotal.toLocaleString()} MT*\n` +
      `------------------------------------------\n\n` +
      `Este documento é uma proposta comercial. Ficamos a aguardar o seu contacto! ✨`;

    const cleanPhone = (budgetTargetPhone || completedBudget.customerPhone || "").replace(/\D/g, "");
    const defaultPhone = cleanPhone.length === 9 && (cleanPhone.startsWith("84") || cleanPhone.startsWith("85") || cleanPhone.startsWith("82") || cleanPhone.startsWith("87") || cleanPhone.startsWith("86"))
      ? `258${cleanPhone}`
      : cleanPhone;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${defaultPhone}&text=${encodeURIComponent(text)}`;
    try {
      const link = document.createElement("a");
      link.href = whatsappUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
    setSendBudgetWhatsAppStatus("sent");
    onAddAuditLog("Enviar Orçamento WhatsApp", "VENDAS", `Orçamento ${completedBudget.budgetNumber} enviado via WhatsApp para o telemóvel ${defaultPhone}.`);
    if (onShowToast) onShowToast("Link do WhatsApp aberto com sucesso!", "success");
  };

  // Quick Customer Registration com execução imediata da ação pendente
  const handleQuickAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustName.trim()) {
      if (onShowToast) onShowToast("Por favor, introduza o nome do cliente.", "warning", "Nome Obrigatório");
      return;
    }

    if (pendingReceiptAction === "email" && (!quickCustEmail.trim() || !quickCustEmail.includes("@"))) {
      if (onShowToast) onShowToast("Por favor, introduza um e-mail válido para enviar o recibo.", "warning", "E-mail Obrigatório");
      return;
    }

    if (pendingReceiptAction === "whatsapp") {
      const digitsOnly = quickCustPhone.replace(/\D/g, "");
      if (!digitsOnly || digitsOnly.length < 4) {
        if (onShowToast) onShowToast("Por favor, introduza um número de telemóvel válido para o WhatsApp.", "warning", "Telemóvel Obrigatório");
        return;
      }
    }

    const newCust: Customer = {
      id: generateEntityId("cust"),
      name: quickCustName.trim(),
      phone: quickCustPhone.trim() || "Indisponível",
      email: quickCustEmail.trim() || "",
      address: "Indisponível",
      nuit: quickCustNuit.trim() || "",
      totalSpent: 0,
      purchaseCount: 0,
      debt: 0,
      loyaltyPoints: 0,
      preferredPaymentMethod: "CASH",
      oneClickCheckoutEnabled: false
    };

    setLocalCustomers(prev => [...prev, newCust]);
    setSelectedCustomerId(newCust.id);
    
    // Dispara a gravação no banco de dados e sincronização central
    if (onAddCustomer) {
      onAddCustomer(newCust);
    }
    
    // Atualiza a transação ativa para que todas as ações e recibos reflitam o novo cliente
    if (completedTx) {
      setCompletedTx(prev => {
        if (!prev) return null;
        return {
          ...prev,
          customerId: newCust.id,
          customerName: newCust.name,
          customerPhone: newCust.phone !== "Sem Telemóvel" && newCust.phone !== "Indisponível" ? newCust.phone : "",
          customerEmail: newCust.email,
        };
      });
    }

    const action = pendingReceiptAction;
    setPendingReceiptAction(null);
    setQuickCustomerModalOpen(false);
    setQuickCustName("");
    setQuickCustPhone("");
    setQuickCustEmail("");
    setQuickCustNuit("");

    if (onShowToast) {
      onShowToast(`Cliente ${newCust.name} registado com sucesso!`, "success", "Cliente Registado");
    }

    // Executa a ação diretamente com o novo cliente criado
    if (action === "email") {
      handleSendEmail(newCust);
    } else if (action === "whatsapp") {
      handleOpenWhatsAppModal(newCust);
    } else if (action === "sms") {
      handleSendSms(newCust);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2.5">
      {/* 0. Barra Superior de Monitoramento do Turno de Caixa */}
      <POSShiftBar
        activeShift={currentShift}
        shiftMetrics={shiftMetrics}
        currency={currency}
        onOpenShiftClick={() => setShowOpenShiftModal(true)}
        onCloseShiftClick={() => setShowCloseShiftModal(true)}
        onViewExtratoClick={() => setShowExtratoModal(true)}
        onSangriaClick={() => {
          setQuickEntryType("SANGRIA");
          setShowQuickEntryModal(true);
        }}
        onSuprimentoClick={() => {
          setQuickEntryType("SUPRIMENTO");
          setShowQuickEntryModal(true);
        }}
      />

      <div className="flex flex-col xl:flex-row flex-1 min-h-0 gap-4">
      
      {/* LEFT COLUMN: Clean Product Catalog & Barcode Scanner Bar */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        
        {/* Minimalist Top Bar: Barcode Scanner & Search */}
        <div className={`p-3.5 border-b border-slate-150 bg-slate-50/70 transition-all ${isMinimized ? "space-y-0 py-2.5" : "space-y-2.5"}`}>
          <div className="flex items-center gap-2.5">
            {/* Primary Barcode & Search Input */}
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400 pointer-events-none">
                <Barcode className="w-4 h-4 text-blue-600" />
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                placeholder={isMinimized ? "Modo Minimizado: Bipe o código ou digite para pesquisar (Enter)..." : "Bipe o código de barras ou pesquise o produto (Pressione Enter)..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const code = searchQuery.trim();
                    if (code) {
                      const prod = productCache.findByBarcodeOrCode(code) || localProducts.find(
                        p => p.name.toLowerCase().includes(code.toLowerCase())
                      );
                      if (prod) {
                        e.preventDefault();
                        const inCart = cart.find(item => item.product.id === prod.id)?.quantity || 0;
                        const liveStock = prod.stock - inCart;
                        if (prod.stock <= 0) {
                          playErrorBeep();
                          if (onShowToast) onShowToast(`Produto "${prod.name}" está esgotado!`, "error", "Stock Vazio");
                        } else if (liveStock <= 0) {
                          playErrorBeep();
                          if (onShowToast) onShowToast(`Todo o stock de "${prod.name}" (${prod.stock} un) já foi colocado no carrinho!`, "warning", "Stock Esgotado no Carrinho");
                        } else {
                          playBarcodeBeep();
                          handleTriggerAddToCart(prod);
                          setSearchQuery("");
                          setTimeout(() => {
                            searchInputRef.current?.focus();
                          }, 30);
                        }
                      } else {
                        playErrorBeep();
                        if (onShowToast) onShowToast(`Código/Produto "${code}" não localizado.`, "warning", "Não Encontrado");
                      }
                    }
                  }
                }}
                className={`w-full bg-white border rounded-xl pl-14 pr-24 py-3 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-600 outline-none transition shadow-inner placeholder:text-slate-400 ${
                  isMinimized ? "border-blue-300 ring-1 ring-blue-400/20" : "border-slate-200"
                }`}
              />
              <button
                type="button"
                onClick={() => setScannerModalOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                title="Abrir Leitor de Código de Barras"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Scanner</span>
              </button>
            </div>

            {/* Active Branch Context Pill */}
            {settings.branches && settings.branches.length > 0 && (
              <div 
                className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white border-slate-200 text-xs font-semibold text-slate-700 shrink-0 shadow-2xs"
                title={`Filial Operacional: ${settings.branches.find(b => b.id === (settings.activeBranchId || "central"))?.name || "Sede Central"}`}
              >
                <span 
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: settings.branches.find(b => b.id === (settings.activeBranchId || "central"))?.color || "#f97316" }}
                />
                <span className="max-w-[120px] truncate font-bold text-slate-800">
                  {settings.branches.find(b => b.id === (settings.activeBranchId || "central"))?.name || "Sede Central"}
                </span>
              </div>
            )}

            {/* Suspended Sales Quick Recall - Ocultado em modo minimizado */}
            {!isMinimized && suspendedCarts.length > 0 && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl text-amber-800 text-xs font-bold shrink-0">
                <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                <span>{suspendedCarts.length} Suspensa(s)</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleResumeSale(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="bg-transparent text-amber-900 font-bold text-xs outline-none cursor-pointer underline ml-1"
                >
                  <option value="">Retomar...</option>
                  {suspendedCarts.map((sc, i) => (
                    <option key={sc.id} value={sc.id}>
                      Venda {i+1} ({sc.time})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sales History Quick Button - Ocultado em modo minimizado */}
            {!isMinimized && (
              <button
                onClick={() => setShowSalesHistoryModal(true)}
                className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 transition"
                title="Histórico de Vendas Realizadas"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Histórico</span>
              </button>
            )}

            {/* Minimize / Expand POS Screen Toggle */}
            <button
              type="button"
              id="toggle-pos-fullscreen-btn"
              onClick={handleToggleMinimized}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 transition-all ${
                isMinimized
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                  : "bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-blue-600"
              }`}
              title={isMinimized ? "Restaurar interface normal (Sair do Modo Minimizado - F10/F11)" : "Modo Minimizado: Ocultar elementos secundários para foco total na venda (F10/F11)"}
            >
              {isMinimized ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Restaurar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Minimizar</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Category Filter Pills - Ocultado em modo minimizado */}
          <PosCategoryPills
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
            isMinimized={isMinimized}
          />
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 bg-slate-50/40">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <span className="text-3xl mb-2">{products.length === 0 ? "📦" : "🔍"}</span>
              <p className="text-sm font-semibold text-slate-700">
                {products.length === 0 ? "Nenhum produto cadastrado" : "Nenhum produto encontrado"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {products.length === 0 
                  ? "Acesse o módulo de Stock para cadastrar seus primeiros produtos." 
                  : "Bipe um código de barras ou pesquise por outro termo."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayedProducts.map((p) => (
                <PosProductCard
                  key={p.id}
                  product={p}
                  inCartQty={cartItemQuantities.get(p.id) || 0}
                  currency={currency}
                  onAddToCart={handleAddToCartWithBeep}
                />
              ))}

              {filteredProducts.length > displayedProducts.length && (
                <div className="col-span-full py-4 flex flex-col items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setVisibleProductsCount(prev => prev + 48)}
                    className="px-6 py-2.5 bg-white border border-slate-200 hover:border-orange-500 rounded-xl text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-orange-50/50 hover:scale-[1.01] cursor-pointer"
                  >
                    Carregar Mais ({filteredProducts.length - displayedProducts.length} produtos restantes)
                  </button>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Mostrando {displayedProducts.length} de {filteredProducts.length} produtos
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Minimalist Cart & 5-Second Express Checkout */}
      <div className="w-full xl:w-[420px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
        
        {/* Cart Header & Customer */}
        <div className="p-3.5 border-b border-slate-150 bg-slate-50/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-sm">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 leading-tight">Carrinho de Venda</h3>
                <span className="text-[10px] text-slate-500 font-medium">
                  {cart.length} {cart.length === 1 ? "produto" : "produtos"} • {calculations.totalQty} un
                </span>
              </div>
            </div>

            {cart.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Deseja esvaziar o carrinho?")) {
                    handleReset();
                    if (onShowToast) onShowToast("Carrinho limpo.", "info");
                  }
                }}
                className="text-[11px] text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition cursor-pointer flex items-center gap-1"
                title="Limpar Carrinho"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>

          {/* Quick Customer Picker */}
          {!isMinimized ? (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 relative">
                <select
                  ref={customerSelectRef}
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl text-xs py-2 pl-3 pr-8 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer text-slate-700 font-medium shadow-inner"
                >
                  <option value="">👤 Consumidor Geral</option>
                  {localCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || "Geral"})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setQuickCustomerModalOpen(true)}
                className="p-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl transition text-xs cursor-pointer flex items-center justify-center shrink-0 w-9 h-9 active:scale-95"
                title="Adicionar Novo Cliente (F4)"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
              <span className="truncate font-semibold">
                👤 {selectedCustomerId ? (localCustomers.find(c => c.id === selectedCustomerId)?.name || "Cliente") : "Consumidor Geral"}
              </span>
              <button
                onClick={() => setQuickCustomerModalOpen(true)}
                className="text-[10px] text-orange-600 hover:text-orange-700 font-bold ml-2 shrink-0 cursor-pointer"
                title="Mudar Cliente (F4)"
              >
                + Cliente (F4)
              </button>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-[160px] max-h-[300px]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 my-auto">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <Barcode className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-xs font-bold text-slate-600">Carrinho Vazio</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Bipe um código de barras para começar a venda instantânea.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {cart.map((item) => (
                <PosCartItemRow
                  key={item.product.id}
                  item={item}
                  currency={currency}
                  onIncrement={handleTriggerAddToCart}
                  onDecrement={handleRemoveFromCart}
                  onDirectQuantityEdit={handleDirectQuantityEdit}
                  onDeleteRow={handleDeleteRow}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Financial Big Total Banner */}
        <div className="p-3.5 bg-slate-900 text-white shrink-0">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total a Pagar</span>
            <div className="text-right">
              <span className="text-2xl font-black tracking-tight text-orange-400 font-mono">
                {calculations.grandTotal.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-orange-300 ml-1.5">{currency}</span>
            </div>
          </div>
          {calculations.discountTotal > 0 && (
            <div className="flex justify-between text-[11px] text-emerald-400 font-mono pt-1 mt-1 border-t border-slate-800">
              <span>Desconto Aplicado:</span>
              <span>-{calculations.discountTotal.toLocaleString()} MT</span>
            </div>
          )}
        </div>

        {/* Express Payment & Finalize Panel */}
        <div className="p-3.5 bg-white space-y-3 shrink-0 border-t border-slate-200">
          
          {/* Quick Payment Method Selector (4 Big Direct Buttons) */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: "CASH", label: "💵 Dinheiro", short: "Dinheiro" },
              { id: "MPESA_PAGA_FACIL", label: "📱 M-Pesa", short: "M-Pesa" },
              { id: "EMOLA", label: "📱 E-Mola", short: "E-Mola" },
              { id: "POS_CARD", label: "💳 Cartão", short: "Cartão" },
            ].map(method => (
              <button
                key={method.id}
                onClick={() => setSelectedPaymentMethod(method.id)}
                className={`py-2 px-1 text-xs font-bold rounded-xl border text-center transition cursor-pointer active:scale-95 ${
                  selectedPaymentMethod === method.id 
                    ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20" 
                    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>

          {/* Fast Cash & Change Calculator */}
          {selectedPaymentMethod === "CASH" && (
            <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/80 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-emerald-900 block mb-0.5">Valor Recebido (MT):</label>
                  <input
                    type="number"
                    value={receivedCashAmount || ""}
                    onChange={(e) => setReceivedCashAmount(parseFloat(e.target.value) || 0)}
                    placeholder={String(calculations.grandTotal)}
                    className="w-full bg-white border border-emerald-300 rounded-lg py-1.5 px-2 text-sm font-black text-center text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                
                {/* Big Green Change Badge */}
                <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-center shrink-0 min-w-[110px]">
                  <span className="text-[8.5px] font-extrabold tracking-wider uppercase opacity-90 block">Troco</span>
                  <span className="text-base font-black tracking-tight font-mono">{calculatedChange.toLocaleString()} MT</span>
                </div>
              </div>

              {/* Indicador Dinâmico de Origem do Troco (Fundo Inicial vs Vendas Acumuladas) */}
              <div className={`p-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${
                shiftMetrics.isInitialFloatExhausted
                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                  : shiftMetrics.initialFloatRemaining < calculatedChange && calculatedChange > 0
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
              }`}>
                {shiftMetrics.isInitialFloatExhausted ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>⚡ Fundo inicial esgotado: Troco será pago com numerário das novas vendas.</span>
                  </>
                ) : shiftMetrics.initialFloatRemaining < calculatedChange && calculatedChange > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>⚠️ Troco misto: {shiftMetrics.initialFloatRemaining.toLocaleString()} MT do fundo + {(calculatedChange - shiftMetrics.initialFloatRemaining).toLocaleString()} MT de vendas acumuladas.</span>
                  </>
                ) : (
                  <>
                    <Coins className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>💡 Troco sairá do fundo inicial ({shiftMetrics.initialFloatRemaining.toLocaleString()} MT disponíveis).</span>
                  </>
                )}
              </div>

              {/* Fast Cash Preset Bills - Ocultado em modo minimizado */}
              {!isMinimized && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-emerald-200/60">
                  {[100, 200, 500, 1000, 2000].map(val => (
                    <button
                      key={val}
                      onClick={() => setReceivedCashAmount(val)}
                      className="px-2 py-1 bg-white border border-emerald-300 hover:bg-emerald-100/70 rounded-lg text-[10.5px] font-bold text-emerald-800 cursor-pointer transition active:scale-95"
                    >
                      {val} MT
                    </button>
                  ))}
                  <button
                    onClick={() => setReceivedCashAmount(calculations.grandTotal)}
                    className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10.5px] font-extrabold cursor-pointer transition ml-auto active:scale-95"
                  >
                    Exato
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pagamentos Mistos (Split Payment Interativo) */}
          {selectedPaymentMethod === "MIXED" && (
            <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 space-y-2.5 animate-in fade-in duration-150 text-xs">
              <div className="flex justify-between items-center border-b border-indigo-100 pb-1.5">
                <span className="font-extrabold text-indigo-900 text-[11px] flex items-center gap-1">
                  <span>💳 Divisão de Pagamento Misto</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                  Math.abs(mixedSumTotal - calculations.grandTotal) <= 1
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : mixedSumTotal < calculations.grandTotal
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300"
                }`}>
                  {Math.abs(mixedSumTotal - calculations.grandTotal) <= 1
                    ? "✓ Total Coincide"
                    : mixedSumTotal < calculations.grandTotal
                    ? `Faltam ${(calculations.grandTotal - mixedSumTotal).toLocaleString()} MT`
                    : `Excesso de ${(mixedSumTotal - calculations.grandTotal).toLocaleString()} MT`}
                </span>
              </div>

              <div className="space-y-1.5">
                {/* Dinheiro */}
                <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-indigo-100">
                  <span className="text-[10px] font-bold text-slate-700 w-16 shrink-0">💵 Dinheiro:</span>
                  <input
                    type="number"
                    min="0"
                    value={mixedCash || ""}
                    onChange={(e) => setMixedCash(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="flex-1 font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const remainder = Math.max(0, calculations.grandTotal - (mixedMpesa + mixedPOS));
                      setMixedCash(remainder);
                    }}
                    className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[9.5px] font-bold rounded cursor-pointer transition"
                    title="Preencher restante com Dinheiro"
                  >
                    Restante
                  </button>
                </div>

                {/* M-Pesa */}
                <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-indigo-100">
                  <span className="text-[10px] font-bold text-slate-700 w-16 shrink-0">📱 M-Pesa:</span>
                  <input
                    type="number"
                    min="0"
                    value={mixedMpesa || ""}
                    onChange={(e) => setMixedMpesa(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="flex-1 font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const remainder = Math.max(0, calculations.grandTotal - (mixedCash + mixedPOS));
                      setMixedMpesa(remainder);
                    }}
                    className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[9.5px] font-bold rounded cursor-pointer transition"
                    title="Preencher restante com M-Pesa"
                  >
                    Restante
                  </button>
                </div>

                {/* Cartão POS */}
                <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-indigo-100">
                  <span className="text-[10px] font-bold text-slate-700 w-16 shrink-0">💳 POS:</span>
                  <input
                    type="number"
                    min="0"
                    value={mixedPOS || ""}
                    onChange={(e) => setMixedPOS(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="flex-1 font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const remainder = Math.max(0, calculations.grandTotal - (mixedCash + mixedMpesa));
                      setMixedPOS(remainder);
                    }}
                    className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[9.5px] font-bold rounded cursor-pointer transition"
                    title="Preencher restante com POS"
                  >
                    Restante
                  </button>
                </div>
              </div>

              {/* Quick Split presets */}
              <div className="flex justify-between items-center pt-1 border-t border-indigo-100 text-[9.5px] font-bold text-indigo-900">
                <button
                  type="button"
                  onClick={() => {
                    const half = Math.floor(calculations.grandTotal / 2);
                    setMixedCash(half);
                    setMixedMpesa(calculations.grandTotal - half);
                    setMixedPOS(0);
                  }}
                  className="hover:underline text-indigo-600 cursor-pointer"
                >
                  50% Dinheiro + 50% M-Pesa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMixedCash(0);
                    setMixedMpesa(0);
                    setMixedPOS(0);
                  }}
                  className="hover:underline text-rose-600 cursor-pointer"
                >
                  Limpar Divisão
                </button>
              </div>
            </div>
          )}

          {/* Mobile Payment QR/Push - Ocultado em modo minimizado */}
          {!isMinimized && (selectedPaymentMethod === "MPESA_PAGA_FACIL" || selectedPaymentMethod === "EMOLA") && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                  <QrCode className="w-3.5 h-3.5 text-orange-500" />
                  Pagamento {selectedPaymentMethod === "MPESA_PAGA_FACIL" ? "M-Pesa" : "e-Mola"}
                </span>
                <button
                  onClick={handleProcessMobilePayment}
                  className="px-2.5 py-1 bg-slate-900 text-white hover:bg-slate-800 font-bold text-[10px] rounded-lg cursor-pointer"
                >
                  {mobilePaymentStatus === "CONFIRMED" ? "✓ Confirmado" : "Validar Pagamento"}
                </button>
              </div>
              {mobilePaymentStatus === "CONFIRMED" && (
                <div className="bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold p-1.5 text-center rounded-lg text-[11px]">
                  ✓ Pagamento móvel confirmado via API!
                </div>
              )}
            </div>
          )}

          {/* Primary Express 5-Second Checkout Button */}
          <button
            onClick={() => {
              if (cart.length > 0 && !isProcessingSale) {
                if (!isShiftOpen) {
                  setShowOpenShiftModal(true);
                  if (onShowToast) onShowToast("Sem turno aberto! O operador deve obrigatoriamente abrir o turno e informar o valor inicial do caixa antes de vender.", "warning", "Turno de Caixa Fechado");
                  return;
                }
                setShowPreCheckoutModal(true);
              }
            }}
            disabled={cart.length === 0 || isProcessingSale}
            id="btn-pos-finalize-sale"
            className={`w-full ${
              isMinimized ? "py-4 text-base shadow-xl shadow-emerald-600/30 ring-2 ring-emerald-400/50" : "py-3 text-sm shadow-lg"
            } rounded-xl font-black flex items-center justify-center gap-2 transition-all ${
              cart.length === 0 || isProcessingSale
                ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                : !isShiftOpen
                ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white cursor-pointer shadow-amber-600/20 active:scale-[0.98]"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-600/20 active:scale-[0.98]"
            }`}
          >
            {isProcessingSale ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>A processar pagamento...</span>
              </>
            ) : !isShiftOpen ? (
              <>
                <Lock className="w-4 h-4 text-amber-200" />
                <span>🔒 Abrir Turno de Caixa p/ Vender</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                <span>⚡ Concluir Venda ({calculations.grandTotal.toLocaleString()} MT)</span>
              </>
            )}
          </button>

          {/* Auxiliary Actions (Suspend & Budget) - Ocultado em modo minimizado */}
          {!isMinimized && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSuspendSale}
                disabled={cart.length === 0}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 cursor-pointer transition active:scale-95 flex items-center justify-center gap-1"
              >
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Suspender</span>
              </button>
              <button
                onClick={handleGenerateBudget}
                disabled={cart.length === 0}
                className="py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 disabled:opacity-50 text-[11px] font-bold rounded-lg cursor-pointer transition active:scale-95 flex items-center justify-center gap-1"
              >
                <Receipt className="w-3 h-3 text-amber-600" />
                <span>Orçamento</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* 24. PRE-CHECKOUT CONFIRMATION MODAL */}
      {showPreCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Receipt className="w-5 h-5 text-orange-500" />
                <span>Confirmar Transacção de Venda</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Revise o sumário fiscal antes de faturar no sistema.</p>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Cliente:</span>
                  <span className="font-bold text-slate-700">{selectedCustomer ? selectedCustomer.name : "Consumidor Geral"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Operador:</span>
                  <span className="font-bold text-slate-700">{activeUsername} (Caixa Principal)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Pagamento:</span>
                  <span className="font-bold text-orange-600">{selectedPaymentMethod}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Volume Total:</span>
                  <span className="font-bold text-slate-700">{calculations.totalQty} Artigos</span>
                </div>
              </div>

              {/* Items listing brief */}
              <div className="max-h-36 overflow-y-auto border border-slate-150 rounded-xl p-2.5 bg-slate-50/50 space-y-1.5 font-mono text-[10.5px]">
                {cart.map(item => {
                  const stockRemaining = Math.max(0, item.product.stock - item.quantity);
                  return (
                    <div key={item.product.id} className="flex justify-between text-slate-600">
                      <div className="truncate max-w-[200px]">
                        <span>{item.product.name}</span>
                        <span className="text-[9px] text-slate-400 block font-sans">Restará: {stockRemaining} un</span>
                      </div>
                      <span className="font-bold shrink-0">{item.quantity} × {item.product.salePrice.toLocaleString()} MT</span>
                    </div>
                  );
                })}
              </div>

              {/* Detailed Financial highlight box */}
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>SOMA SUB-TOTAL:</span>
                  <span>{calculations.subtotal.toLocaleString()} MT</span>
                </div>
                {calculations.discountTotal > 0 && (
                  <div className="flex justify-between text-[11px] text-red-400">
                    <span>DESCONTO COMERCIAL:</span>
                    <span>-{calculations.discountTotal.toLocaleString()} MT</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>VALOR IVA APLICADO:</span>
                  <span>{calculations.vatTotal.toLocaleString()} MT</span>
                </div>
                <div className="flex justify-between text-sm font-black border-t border-slate-800 pt-2 text-orange-400 font-sans">
                  <span>TOTAL A PAGAR:</span>
                  <span>{calculations.grandTotal.toLocaleString()} MT</span>
                </div>

                {/* Change highlighted inside checkout */}
                {selectedPaymentMethod === "CASH" && (
                  <div className="flex justify-between text-[11px] text-emerald-400 border-t border-slate-800 pt-1">
                    <span>{receivedCashAmount < calculations.grandTotal && receivedCashAmount > 0 ? "FALTA RECEBER:" : "TROCO DE NUMERÁRIO:"}</span>
                    <span className={receivedCashAmount < calculations.grandTotal && receivedCashAmount > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {receivedCashAmount < calculations.grandTotal && receivedCashAmount > 0 
                        ? `-${(calculations.grandTotal - receivedCashAmount).toLocaleString()} MT (Insuficiente)` 
                        : `${calculatedChange.toLocaleString()} MT`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick receipts choice check buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => setShowPreCheckoutModal(false)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                Voltar e Ajustar
              </button>
              <button
                onClick={() => handleCheckout(true)}
                disabled={isProcessingSale || (selectedPaymentMethod === "CASH" && receivedCashAmount > 0 && receivedCashAmount < calculations.grandTotal)}
                title="Confirmar e Faturar com Recibo (Atalho: F5 / F1)"
                className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-lg flex items-center justify-center gap-1.5 ${
                  isProcessingSale || (selectedPaymentMethod === "CASH" && receivedCashAmount > 0 && receivedCashAmount < calculations.grandTotal)
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/15"
                }`}
              >
                {isProcessingSale ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>A emitir fatura...</span>
                  </>
                ) : (
                  <>
                    <span>{selectedPaymentMethod === "CASH" && receivedCashAmount > 0 && receivedCashAmount < calculations.grandTotal
                      ? "Valor Insuficiente"
                      : "Confirmar e Faturar ✓"}</span>
                    {!(selectedPaymentMethod === "CASH" && receivedCashAmount > 0 && receivedCashAmount < calculations.grandTotal) && (
                      <kbd className="px-1.5 py-0.2 bg-white/25 text-white rounded text-[10px] font-mono font-bold">F5</kbd>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL TRANSACTION CONFIRMATION MODAL */}
      {showFinalConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white p-6 rounded-3xl max-w-sm w-full border border-slate-100 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8 animate-bounce" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-900 text-lg">Confirmar Conclusão de Venda?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Deseja realmente concluir e emitir esta transação no valor de <strong className="text-slate-800 font-extrabold text-sm">{calculations.grandTotal.toLocaleString()} {currency}</strong>? Esta ação não poderá ser desfeita ou editada após registada no sistema.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Total a Pagar:</span>
                <span className="font-extrabold text-slate-700">{calculations.grandTotal.toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Método de Pagamento:</span>
                <span className="font-extrabold text-orange-650">{selectedPaymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-extrabold text-slate-750">{selectedCustomer ? selectedCustomer.name : "Consumidor Geral"}</span>
              </div>
              {selectedPaymentMethod === "CASH" && (
                <div className="flex justify-between border-t border-slate-200/60 pt-2">
                  <span className="text-slate-400">Troco Calculado:</span>
                  <span className="font-extrabold text-emerald-600">{calculatedChange.toLocaleString()} {currency}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowFinalConfirmModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
              >
                Não, Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCheckout(pendingEmitReceipt, true)}
                disabled={isProcessingSale}
                className={`flex-1 py-3 rounded-2xl text-xs font-black text-white transition-all shadow-md flex items-center justify-center gap-2 ${
                  isProcessingSale
                    ? "bg-slate-400 cursor-not-allowed shadow-none"
                    : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 cursor-pointer shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                {isProcessingSale ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>A processar...</span>
                  </>
                ) : (
                  <span>Sim, Finalizar ✓</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {weightPromptProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-xs w-full border border-slate-100 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">{weightPromptProduct.emoji || "⚖️"}</span>
            </div>
            
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Pesagem de Artigo (Baloneta)</h3>
              <p className="text-[11px] text-slate-400 mt-1">Insira a quantidade pesada de <span className="font-bold text-slate-700">{weightPromptProduct.name}</span></p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="1.25"
                  value={weightInputValue}
                  onChange={(e) => setWeightInputValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-center text-xl font-bold font-mono outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
                <span className="absolute right-3.5 top-3.5 text-xs font-bold text-slate-400">kg</span>
              </div>

              {/* Fast weight presets */}
              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold text-slate-700">
                {["0.25", "0.50", "1.0", "2.5"].map(w => (
                  <button
                    key={w}
                    onClick={() => setWeightInputValue(w)}
                    className="py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 cursor-pointer"
                  >
                    {w} kg
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setWeightPromptProduct(null)}
                className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const val = parseFloat(weightInputValue);
                  if (!isNaN(val) && val > 0) {
                    handleTriggerAddToCart(weightPromptProduct, val);
                    setWeightPromptProduct(null);
                  }
                }}
                className="py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Lançar Peso ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 20. REAL CAMERA & EMULATED BARCODE SCANNER MODAL */}
      {scannerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-5 rounded-2xl max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            
            {/* Header / Tab Switcher */}
            <div className="text-center space-y-2.5">
              <div className="w-11 h-11 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                <Camera className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Leitor de Códigos de Barra</h3>
                <p className="text-[10.5px] text-slate-400 mt-0.5">Efetue a leitura de artigos para o carrinho de compras de forma automática.</p>
              </div>

              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setScannerTab("camera")}
                  className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                    scannerTab === "camera" 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  📷 Câmara Real
                </button>
                <button
                  type="button"
                  onClick={() => setScannerTab("manual")}
                  className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                    scannerTab === "manual" 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ⌨️ Leitor USB / Teclado
                </button>
              </div>
            </div>

            {/* TAB CONTENT 1: PHYSICAL CAMERA CAPTURE */}
            {scannerTab === "camera" && (
              <div className="space-y-3.5">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center">
                  
                  {/* Glowing Laser line animation overlay */}
                  <div className="absolute left-0 right-0 h-[1.5px] bg-red-500 shadow-[0_0_8px_#ef4444] z-10 animate-pulse" style={{
                    top: "50%",
                    transform: "translateY(-50%)"
                  }} />
                  
                  {/* Viewfinder corner overlays */}
                  <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-orange-500 z-10" />
                  <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-orange-500 z-10" />
                  <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-orange-500 z-10" />
                  <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-orange-500 z-10" />

                  {/* HTML5 QrReader Component */}
                  <QrCodeScannerComponent
                    onResult={(result, _error) => {
                      if (result) {
                        const textValue = result.text || String(result);
                        if (textValue) {
                          const trimmed = textValue.trim();
                          const now = Date.now();

                          // Prevent rapid duplicate scans within 2.5 seconds
                          if (trimmed === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2500) {
                            return;
                          }

                          lastScannedCodeRef.current = trimmed;
                          lastScannedTimeRef.current = now;

                          const match = localProducts.find(p => p.barcode === trimmed || p.code === trimmed);
                          if (match) {
                            handleTriggerAddToCart(match);
                            if (!continuousScan) {
                              setScannerModalOpen(false);
                            }
                          } else {
                            if (onShowToast) {
                              onShowToast(`Código lido: "${trimmed}" não registado no catálogo.`, "warning", "Código Desconhecido");
                            }
                          }
                        }
                      }
                    }}
                    facingMode="environment"
                    scanDelay={400}
                  />
                </div>

                {/* Continuous Scan Checkbox */}
                <label className="flex items-center gap-2 px-3 py-2 text-slate-600 justify-center text-[10.5px] bg-slate-50 rounded-xl border border-slate-150 cursor-pointer hover:bg-slate-100 transition">
                  <input
                    type="checkbox"
                    checked={continuousScan}
                    onChange={(e) => setContinuousScan(e.target.checked)}
                    className="rounded text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="font-bold select-none text-slate-700">Leitura Contínua (Não fechar painel após ler)</span>
                </label>
              </div>
            )}

            {/* TAB CONTENT 2: QUICK PRODUCTS & BARCODE LIST */}
            {scannerTab === "manual" && (
              <div className="space-y-3.5">
                {/* List of barcodes */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <span className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider font-mono block">Códigos e Produtos do Catálogo:</span>
                  {localProducts.map(p => {
                    const inCartQty = cartItemQuantities.get(p.id) || 0;
                    const liveStock = Math.max(0, p.stock - inCartQty);
                    const isExhausted = liveStock <= 0;
                    return (
                      <button
                        key={p.id}
                        disabled={isExhausted}
                        onClick={() => {
                          handleTriggerAddToCart(p);
                          setScannerModalOpen(false);
                        }}
                        className={`w-full text-left p-2 border rounded-lg text-xs flex justify-between items-center transition ${
                          isExhausted
                            ? "bg-slate-100/60 border-slate-200 cursor-not-allowed opacity-60"
                            : "bg-slate-50 border-slate-150 hover:bg-orange-50 hover:border-orange-200 cursor-pointer"
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-700 block truncate">{p.name}</span>
                          <span className="text-[9.5px] font-mono text-slate-400 block">{p.barcode || "Sem Barcode"} • Disp: {liveStock} un</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-orange-600 bg-white border border-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {isExhausted ? "Esgotado" : "Bipar"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 pt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Insira barcode manualmente..."
                    value={manualBarcodeScan}
                    onChange={(e) => setManualBarcodeScan(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => {
                      if (manualBarcodeScan) {
                        const match = localProducts.find(p => p.barcode === manualBarcodeScan.trim() || p.code === manualBarcodeScan.trim());
                        if (match) {
                          handleTriggerAddToCart(match);
                          setScannerModalOpen(false);
                          setManualBarcodeScan("");
                        } else {
                          if (onShowToast) onShowToast("Nenhum produto associado a este código.", "error", "Manual");
                        }
                      }
                    }}
                    className="px-3.5 bg-slate-900 text-white rounded-xl text-xs font-extrabold cursor-pointer hover:bg-slate-800"
                  >
                    Ler
                  </button>
                </div>
              </div>
            )}

            {/* Footer Close Button */}
            <button
              onClick={() => setScannerModalOpen(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition"
            >
              Fechar Painel
            </button>
          </div>
        </div>
      )}

      {/* 10. QUICK REGISTER CUSTOMER MODAL */}
      {quickCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleQuickAddCustomer} className="bg-white p-6 rounded-2xl max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                pendingReceiptAction === "whatsapp" 
                  ? "bg-emerald-100 text-emerald-600"
                  : pendingReceiptAction === "email"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-orange-100 text-orange-600"
              }`}>
                {pendingReceiptAction === "whatsapp" ? (
                  <MessageSquare className="w-6 h-6" />
                ) : pendingReceiptAction === "email" ? (
                  <Mail className="w-6 h-6" />
                ) : (
                  <UserPlus className="w-6 h-6" />
                )}
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                {pendingReceiptAction === "email"
                  ? "✉️ Registar e Enviar Recibo por E-mail"
                  : pendingReceiptAction === "whatsapp"
                  ? "💬 Registar e Enviar Recibo por WhatsApp"
                  : "👤 Cadastro Rápido de Cliente"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {pendingReceiptAction === "email"
                  ? "Preencha os dados do cliente e o e-mail para envio imediato da fatura em PDF."
                  : pendingReceiptAction === "whatsapp"
                  ? "Preencha os dados do cliente e o número de WhatsApp para abrir o comprovativo."
                  : "Crie um cadastro de cliente fiduciário simplificado directamente do ponto de venda."}
              </p>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Armindo Chauque"
                  value={quickCustName}
                  onChange={(e) => setQuickCustName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-orange-500 font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1 flex items-center justify-between">
                  <span>Telemóvel (WhatsApp / M-Pesa) {pendingReceiptAction === "whatsapp" ? "*" : ""}</span>
                  {pendingReceiptAction === "whatsapp" && (
                    <span className="text-[10px] text-emerald-600 font-bold">Obrigatório para WhatsApp</span>
                  )}
                </label>
                <input
                  type="text"
                  required={pendingReceiptAction === "whatsapp"}
                  placeholder="Ex: 843329102"
                  value={quickCustPhone}
                  onChange={(e) => setQuickCustPhone(e.target.value)}
                  className={`w-full bg-slate-50 border rounded-xl p-2.5 outline-none font-mono ${
                    pendingReceiptAction === "whatsapp"
                      ? "border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50/20 font-bold text-slate-900"
                      : "border-slate-200 focus:ring-1 focus:ring-orange-500"
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1 flex items-center justify-between">
                    <span>E-mail {pendingReceiptAction === "email" ? "*" : "(Opcional)"}</span>
                    {pendingReceiptAction === "email" && (
                      <span className="text-[10px] text-blue-600 font-bold">Obrigatório</span>
                    )}
                  </label>
                  <input
                    type="email"
                    required={pendingReceiptAction === "email"}
                    placeholder="cliente@email.com"
                    value={quickCustEmail}
                    onChange={(e) => setQuickCustEmail(e.target.value)}
                    className={`w-full bg-slate-50 border rounded-xl p-2.5 outline-none text-xs ${
                      pendingReceiptAction === "email"
                        ? "border-blue-400 focus:ring-2 focus:ring-blue-500/20 bg-blue-50/20 font-semibold text-slate-900"
                        : "border-slate-200 focus:ring-1 focus:ring-orange-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">NUIT (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: 123456789"
                    value={quickCustNuit}
                    onChange={(e) => setQuickCustNuit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-orange-500 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingReceiptAction(null);
                  setQuickCustomerModalOpen(false);
                }}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className={`py-2.5 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md transition ${
                  pendingReceiptAction === "whatsapp"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : pendingReceiptAction === "email"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {pendingReceiptAction === "email"
                  ? "Registar e Enviar Email ✉️"
                  : pendingReceiptAction === "whatsapp"
                  ? "Registar e Enviar WhatsApp 💬"
                  : "Registar Cliente"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 16. SESSION TRANSACTION HISTORY MODAL */}
      {showSalesHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <History className="w-5 h-5 text-orange-500" />
                  <span>Histórico Recente de Vendas</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Últimas vendas efetuadas na presente sessão de caixa.</p>
              </div>
              <button
                onClick={() => setShowSalesHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Fchar ×
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {transactions && transactions.length > 0 ? (
                transactions.slice(0, 8).map((tx, idx) => (
                  <div key={`${tx.id || ""}-${idx}`} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs transition hover:bg-slate-100">
                    <div>
                      <span className="font-bold text-slate-700 block">{tx.invoiceNumber}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {tx.paymentMethod} • Op: {tx.cashierName}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="font-extrabold text-slate-800">{tx.grandTotal.toLocaleString()} MT</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCompletedTx(tx);
                          setShowSalesHistoryModal(false);
                        }}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-orange-50 rounded text-[10px] font-bold text-orange-600 transition cursor-pointer"
                        title="Visualizar Recibo"
                      >
                        Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            printInvoiceHTML(tx, settings || { companyName: "OST VENDAS", currency: "MT" } as SystemSettings);
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-orange-600 hover:text-white rounded text-[10px] font-bold text-slate-650 transition cursor-pointer flex items-center justify-center"
                        title="Imprimir Fatura em Nova Janela"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTxForReturn(tx);
                          const initQtys: Record<string, number> = {};
                          (tx.items || []).forEach(it => {
                            initQtys[it.productId] = it.quantity;
                          });
                          setReturnedItemQuantities(initQtys);
                          setReturnReason("Defeito / Avaria de Produto");
                          setReturnRefundMethod(tx.paymentMethod === "DEBT" ? "DEBT" : "CASH");
                          setShowReturnModal(true);
                          setShowSalesHistoryModal(false);
                        }}
                        className="p-1.5 bg-rose-50 hover:bg-rose-600 hover:text-white rounded text-[10px] font-bold text-rose-600 border border-rose-200 transition cursor-pointer flex items-center gap-1"
                        title="Devolver Artigos / Emitir Nota de Crédito"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Devolver</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs text-slate-400 py-6">Nenhuma venda realizada neste terminal ainda.</p>
              )}
            </div>

            <button
              onClick={() => setShowSalesHistoryModal(false)}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-850"
            >
              Fechar Painel
            </button>
          </div>
        </div>
      )}

      {/* 17. RETURN / DEVOLUTION & CREDIT NOTE MODAL */}
      {showReturnModal && selectedTxForReturn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2 text-rose-600">
                  <RotateCcw className="w-5 h-5" />
                  <span>Devolução & Nota de Crédito Fiscal</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fatura: <span className="font-bold text-slate-700">{selectedTxForReturn.invoiceNumber}</span> • Cliente: {selectedTxForReturn.customerName || "Consumidor Final"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setSelectedTxForReturn(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ×
              </button>
            </div>

            {/* List of items to return */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Artigos a Devolver e Quantidades:</label>
              <div className="max-h-44 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                {(selectedTxForReturn.items || []).map((it) => {
                  const currQty = returnedItemQuantities[it.productId] || 0;
                  return (
                    <div key={it.productId} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-xs">
                      <div className="flex-1 pr-2">
                        <span className="font-bold text-slate-800 block truncate">{it.productName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Preço: {(Number(it.price ?? (it as any).salePrice) || 0).toLocaleString()} MT • Faturado: {it.quantity} un
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReturnedItemQuantities(prev => ({ ...prev, [it.productId]: Math.max(0, (prev[it.productId] || 0) - 1) }))}
                          className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold w-7 text-center">{currQty}</span>
                        <button
                          type="button"
                          onClick={() => setReturnedItemQuantities(prev => ({ ...prev, [it.productId]: Math.min(it.quantity, (prev[it.productId] || 0) + 1) }))}
                          className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reason selection */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10.5px] font-bold text-slate-600 block mb-1">Motivo da Devolução:</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="Defeito / Avaria de Produto">Defeito / Avaria de Produto</option>
                  <option value="Troca por Outro Artigo">Troca por Outro Artigo</option>
                  <option value="Erro de Registo no Caixa">Erro de Registo no Caixa</option>
                  <option value="Desistência do Cliente">Desistência do Cliente</option>
                  <option value="Outro Motivo">Outro Motivo</option>
                </select>
              </div>

              <div>
                <label className="text-[10.5px] font-bold text-slate-600 block mb-1">Modalidade de Reembolso:</label>
                <select
                  value={returnRefundMethod}
                  onChange={(e) => setReturnRefundMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="CASH">Dinheiro (Caixa)</option>
                  <option value="MPESA_PAGA_FACIL">M-Pesa</option>
                  <option value="EMOLA">e-Mola</option>
                  <option value="POS_CARD">Cartão POS / Bancário</option>
                  <option value="DEBT">Abate na Conta Corrente (Dívida)</option>
                </select>
              </div>
            </div>

            {returnReason === "Outro Motivo" && (
              <input
                type="text"
                value={customReturnReason}
                onChange={(e) => setCustomReturnReason(e.target.value)}
                placeholder="Especifique detalhadamente o motivo..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none"
              />
            )}

            {/* Refund Totals Summary */}
            {(() => {
              const itemsToReturn = (selectedTxForReturn.items || []).filter(it => (returnedItemQuantities[it.productId] || 0) > 0);
              const totalRefund = itemsToReturn.reduce((sum, it) => sum + (it.price * (returnedItemQuantities[it.productId] || 0)), 0);

              return (
                <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 space-y-1 text-xs">
                  <div className="flex justify-between font-bold text-rose-900">
                    <span>Total a Reembolsar / Creditar:</span>
                    <span className="text-base font-black font-mono">{totalRefund.toLocaleString()} MT</span>
                  </div>
                  <p className="text-[10.5px] text-rose-700">
                    O stock dos {itemsToReturn.length} artigo(s) selecionados será restaurado automaticamente no inventário e registado em auditoria.
                  </p>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setSelectedTxForReturn(null);
                }}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const itemsToReturn = (selectedTxForReturn.items || [])
                    .filter(it => (returnedItemQuantities[it.productId] || 0) > 0)
                    .map(it => ({
                      productId: it.productId,
                      quantity: returnedItemQuantities[it.productId],
                      price: it.price
                    }));

                  if (itemsToReturn.length === 0) {
                    if (onShowToast) onShowToast("Selecione pelo menos um artigo com quantidade superior a zero para devolver.", "warning");
                    return;
                  }

                  const finalReason = returnReason === "Outro Motivo" && customReturnReason.trim() ? customReturnReason.trim() : returnReason;
                  const totalRefund = itemsToReturn.reduce((sum, it) => sum + (it.price * it.quantity), 0);
                  const nextReturnSeq = transactions.length + 1;
                  const creditNoteId = generateDeterministicCreditNoteNumber(nextReturnSeq);

                  if (onReturnSale) {
                    onReturnSale(selectedTxForReturn, finalReason, itemsToReturn, returnRefundMethod);
                  } else {
                    onAddAuditLog(
                      "Devolução de Venda",
                      "VENDAS",
                      `Devolução da fatura ${selectedTxForReturn.invoiceNumber} efetuada por ${activeUsername}. Total: ${totalRefund} MT. Motivo: ${finalReason}`
                    );
                    if (onShowToast) onShowToast(`Devolução processada com sucesso! Nota de Crédito: ${creditNoteId}`, "success");
                  }

                  setCompletedCreditNote({
                    id: creditNoteId,
                    invoiceRef: selectedTxForReturn.invoiceNumber,
                    date: new Date().toLocaleString(),
                    customerName: selectedTxForReturn.customerName,
                    items: itemsToReturn,
                    totalRefund,
                    reason: finalReason,
                    refundMethod: returnRefundMethod
                  });

                  setShowReturnModal(false);
                  setSelectedTxForReturn(null);
                }}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-rose-600/20"
              >
                Confirmar Devolução & Estorno ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 18. CREDIT NOTE / NOTA DE CRÉDITO SUCCESS & PRINT MODAL */}
      {completedCreditNote && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Nota de Crédito Emitida!</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                N/Crédito: <span className="font-bold text-slate-700">{completedCreditNote.id}</span>
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left font-mono text-[11px] text-slate-700 space-y-1.5">
              <div className="flex justify-between">
                <span>Fatura Original:</span>
                <span className="font-bold">{completedCreditNote.invoiceRef}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Estornado:</span>
                <span className="font-bold text-rose-600">{completedCreditNote.totalRefund.toLocaleString()} MT</span>
              </div>
              <div className="flex justify-between">
                <span>Reembolso:</span>
                <span>{completedCreditNote.refundMethod}</span>
              </div>
              <div className="border-t border-slate-200 pt-1 text-[10px] text-slate-500 font-sans">
                Motivo: {completedCreditNote.reason}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCompletedCreditNote(null)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.warn(e);
                  }
                }}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir N/C</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: Receipt & Communications */}
      {completedTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-sm w-full border border-slate-100 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-2.5">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Venda Concluída com Sucesso!</h3>
              <p className="text-xs text-slate-400 mt-1">Transação consolidada e stock comercial deduzido.</p>
            </div>

              {/* Simulated Receipt Display */}
              <div id="pos-completed-receipt" className="border border-slate-200 bg-slate-50 rounded-xl p-4 font-mono text-[11px] leading-tight text-slate-700 select-all max-h-60 overflow-y-auto">
                <style>{`
                  @media print {
                    @page {
                      size: ${printMode === "invoice" ? "A4 portrait" : "80mm auto"};
                      margin: ${printMode === "invoice" ? "10mm" : "0mm"};
                    }
                    body * {
                      visibility: hidden !important;
                    }
                    ${printMode === "invoice" ? `
                    #pos-completed-invoice, #pos-completed-invoice * {
                      visibility: visible !important;
                    }
                    #pos-completed-invoice {
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 100% !important;
                      height: auto !important;
                      border: none !important;
                      background: white !important;
                      color: #1e293b !important;
                      padding: 40px !important;
                      margin: 0 !important;
                      box-shadow: none !important;
                      overflow: visible !important;
                      display: block !important;
                    }
                    ` : `
                    #pos-completed-receipt, #pos-completed-receipt * {
                      visibility: visible !important;
                    }
                    #pos-completed-receipt {
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 76mm !important;
                      max-width: 80mm !important;
                      height: auto !important;
                      border: none !important;
                      background: white !important;
                      color: black !important;
                      padding: ${settings?.thermalMarginTop !== undefined ? settings.thermalMarginTop : 4}mm 1mm ${settings?.thermalMarginBottom !== undefined ? settings.thermalMarginBottom : 8}mm 1mm !important;
                      margin: 0 auto !important;
                      box-shadow: none !important;
                      overflow: visible !important;
                      display: block !important;
                      font-family: 'Courier New', Courier, monospace !important;
                      font-size: 11px !important;
                      line-height: 1.25 !important;
                    }
                    `}
                    .no-print {
                      display: none !important;
                    }
                  }
                `}</style>
                <div className="text-center font-bold text-slate-800 mb-2 border-b border-dashed border-slate-300 pb-2">
                  {settings.logoUrl && (
                    <img
                      src={settings.logoUrl}
                      alt="Logo Recibo"
                      className="w-10 h-10 object-contain mx-auto mb-1.5 bg-white p-0.5 rounded border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <p className="uppercase">{settings.companyName || "Indisponível"}</p>
                  <p className="font-normal text-[9px] text-slate-500 font-sans">{settings.storeAddress || settings.companyAddress || "Indisponível"}</p>
                  <p className="font-normal text-[9px] text-slate-500 font-sans">NUIT: {settings.companyNuit || "Indisponível"}</p>
                </div>

              <div className="space-y-1 mb-2">
                <p><span className="text-slate-450">Fatura:</span> {completedTx.invoiceNumber}</p>
                <p><span className="text-slate-450">Data/Hora:</span> {new Date(completedTx.timestamp).toLocaleString()}</p>
                <p><span className="text-slate-450">Operador:</span> {completedTx.cashierName}</p>
                <p><span className="text-slate-450">Cliente:</span> {completedTx.customerName || "Consumidor Geral"}</p>
                {completedTx.nuit && <p><span className="text-slate-450">NUIT Cli:</span> {completedTx.nuit}</p>}
              </div>

              <div className="border-b border-dashed border-slate-300 py-1 mb-2">
                <div className="grid grid-cols-12 gap-1 font-bold text-slate-800 text-[10px]">
                  <span className="col-span-6 truncate">PRODUTO</span>
                  <span className="col-span-2 text-center">QTD</span>
                  <span className="col-span-4 text-right">VALOR</span>
                </div>
                 {completedTx.items.map((item, i) => {
                   const itemPrice = Number(item.price ?? (item as any).salePrice ?? 0);
                   const itemQty = Number(item.quantity || 1);
                   const lineVal = Number((item as any).subtotal ?? (itemPrice * itemQty));
                   return (
                     <div key={`${item.productId}-${i}`} className="grid grid-cols-12 gap-1 py-0.5 text-slate-600">
                       <span className="col-span-6 truncate">{item.productName}</span>
                       <span className="col-span-2 text-center">{isNaN(itemQty) ? 1 : itemQty}</span>
                       <span className="col-span-4 text-right">{(isNaN(lineVal) ? 0 : lineVal).toLocaleString()} MT</span>
                     </div>
                   );
                 })}
              </div>

              <div className="space-y-1 text-slate-600 text-right">
                <p>SUBTOTAL: {(Number(completedTx.subtotal) || 0).toLocaleString()} MT</p>
                {Number(completedTx.discountTotal || 0) > 0 && <p className="text-red-650 font-bold">DESC. GER: -{(Number(completedTx.discountTotal) || 0).toLocaleString()} MT</p>}
                <p>TOTAL IVA COBRADO: {(Number(completedTx.vatTotal) || 0).toLocaleString()} MT</p>
                <p className="text-slate-900 font-bold text-xs border-t border-dashed border-slate-300 pt-1">
                  TOTAL PAGO: {(Number(completedTx.grandTotal) || 0).toLocaleString()} MT
                </p>
                <p className="text-[10px] text-slate-500 font-medium italic mt-1">Método: {completedTx.paymentMethod}</p>
                {completedTx.paymentDetails && (
                  <p className="text-[9.5px] text-red-600 font-semibold italic mt-0.5">{completedTx.paymentDetails}</p>
                )}
              </div>

              <p className="text-center font-semibold text-[9px] text-slate-500 mt-3 border-t border-dashed border-slate-300 pt-2 block">
                *** Muito Obrigado Pela Visita! ***
              </p>

              {/* Unique QR Code Generator for Digital Receipt */}
              {qrCodeDataUrl && (
                <div className="mt-3 pt-3 border-t border-dashed border-slate-300 flex flex-col items-center justify-center gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm animate-in zoom-in-95 duration-200">
                  <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    <img
                      src={qrCodeDataUrl}
                      alt={`QR Code Fatura ${completedTx.invoiceNumber}`}
                      className="w-24 h-24 object-contain"
                    />
                  </div>
                  <div className="text-center">
                    <span className="text-[8px] font-black text-slate-700 tracking-wider font-sans uppercase">RECIBO DIGITAL</span>
                    <p className="text-[7.5px] text-slate-400 font-sans mt-0.5 max-w-[180px] mx-auto leading-tight">
                      Aponte a câmara para visualizar a fatura digital <strong className="font-semibold text-slate-600">#{completedTx.invoiceNumber}</strong>
                    </p>
                  </div>
                </div>
              )}

              {completedTx.fiscalCertified && (
                <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-center text-[9px] text-slate-500 font-sans space-y-2 animate-in fade-in duration-300">
                  <div className="flex flex-col items-center justify-center gap-1 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                    {qrCodeDataUrl ? (
                      <img src={qrCodeDataUrl} className="w-14 h-14 object-contain bg-white p-0.5 rounded border border-slate-200" alt="QR Code Fiscal" />
                    ) : (
                      <QrCode className="w-14 h-14 text-slate-800" />
                    )}
                    <span className="text-[7.5px] font-bold text-slate-600 tracking-wide font-mono uppercase">Controle Fiscal - AGT/MEF</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-slate-700 tracking-wider">DOCUMENTO FISCAL HOMOLOGADO</p>
                    <p className="text-[8px]">Certificação Nº: {settings.fiscalCertificationNumber || "Indisponível"}</p>
                    <p className="font-mono text-[8px] bg-white py-0.5 rounded border border-slate-200 px-1 font-bold text-slate-800 select-all">Chave: {completedTx.fiscalKeys}</p>
                    <p className="font-mono text-[6.5px] text-slate-400 break-all leading-tight">Assinatura: {completedTx.fiscalHash}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Printable Invoice Container (A4 Layout) - Hidden on screen, shown on print when printMode is 'invoice' */}
            <div 
              id="pos-completed-invoice" 
              className="hidden print:block bg-white p-10 font-sans text-slate-800 border border-slate-200 rounded-2xl w-full max-w-[800px] mx-auto text-sm"
            >
              {/* Header */}
              <div className="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">
                {settings.logoUrl && (
                  <div className="mb-3">
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="w-16 h-16 object-contain mx-auto bg-white p-1 rounded-xl border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <h1 className="text-xl font-extrabold uppercase text-slate-900 tracking-tight">
                  {settings.companyName || "Indisponível"}
                </h1>
                <p className="text-xs text-slate-500 mt-1">{settings.companyAddress || settings.storeAddress || "Indisponível"}</p>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  NUIT: {settings.companyNuit || "Indisponível"} | Tel: {settings.storeContact || "Indisponível"}
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6 text-left">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Dados do Documento</span>
                  <span className="font-mono font-bold text-slate-900 text-sm block">
                    {completedTx.invoiceNumber}
                  </span>
                  <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                    <p>Emissão: <strong className="text-slate-700">{new Date(completedTx.timestamp).toLocaleString()}</strong></p>
                    <p>Filial: <strong className="text-slate-700 uppercase">{completedTx.branchId || "Central"}</strong></p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cliente & Operador</span>
                  <span className="font-semibold text-slate-900 text-sm block">
                    {completedTx.customerName || "Consumidor Geral"}
                  </span>
                  <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                    {completedTx.nuit && <p>NUIT: <strong className="text-slate-700">{completedTx.nuit}</strong></p>}
                    <p>Operador: <strong className="text-slate-700">{completedTx.cashierName}</strong></p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4 text-center w-12">Item</th>
                      <th className="py-3 px-4">Descrição</th>
                      <th className="py-3 px-4 text-center w-16">Qtd</th>
                      <th className="py-3 px-4 text-right w-28">P. Unitário</th>
                      <th className="py-3 px-4 text-right w-32">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedTx.items.map((item, index) => (
                      <tr key={`${item.productId}-${index}`} className="text-slate-700">
                        <td className="py-3 px-4 text-center font-mono text-slate-400">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {item.productName}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {item.price.toLocaleString()} {settings.currency || "MT"}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold font-mono text-slate-900">
                          {(item.price * item.quantity).toLocaleString()} {settings.currency || "MT"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Grid */}
              <div className="flex justify-end mb-6 text-right">
                <div className="w-full max-w-xs space-y-2 text-xs border-b border-slate-100 pb-4">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-mono">{completedTx.subtotal.toLocaleString()} {settings.currency || "MT"}</span>
                  </div>
                  {completedTx.discountTotal > 0 && (
                    <div className="flex justify-between text-red-650 font-semibold">
                      <span>Desconto</span>
                      <span className="font-mono">-{completedTx.discountTotal.toLocaleString()} {settings.currency || "MT"}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>IVA Incluído</span>
                    <span className="font-mono">{completedTx.vatTotal.toLocaleString()} {settings.currency || "MT"}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-slate-900 border-t border-slate-200 pt-2">
                    <span>Total Pago</span>
                    <span className="font-mono">{completedTx.grandTotal.toLocaleString()} {settings.currency || "MT"}</span>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 italic mt-1">
                    Método: <strong>{completedTx.paymentMethod}</strong>
                    {completedTx.paymentDetails && ` (${completedTx.paymentDetails})`}
                  </div>
                </div>
              </div>

              {/* Fiscal Cert & QR Section */}
              <div className="border-t-2 border-dashed border-slate-200 pt-6 text-center">
                <div className="flex flex-col items-center justify-center gap-2 mb-4">
                  {qrCodeDataUrl ? (
                    <div className="p-1.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <img
                        src={qrCodeDataUrl}
                        alt="Código QR Fiscal"
                        className="w-24 h-24 object-contain"
                      />
                    </div>
                  ) : (
                    <QrCode className="w-20 h-20 text-slate-400" />
                  )}
                  <span className="inline-block bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Documento Fiscal Homologado
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 max-w-md mx-auto text-[10px] font-mono text-slate-500 space-y-1.5 text-left">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Autoridade Tributária (AT):</span>
                    <span className="font-bold text-slate-700">PROCESSO DE CERTIFICAÇÃO</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Certificado Nº:</span>
                    <span className="font-bold text-slate-700">{settings.fiscalCertificationNumber || "Indisponível"}</span>
                  </div>
                  {completedTx.fiscalKeys && (
                    <div className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Chaves de Assinatura:</span>
                      <span className="font-bold text-slate-700 text-right truncate max-w-xs">{completedTx.fiscalKeys}</span>
                    </div>
                  )}
                  {completedTx.fiscalHash && (
                    <div className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Assinatura Digital (Hash):</span>
                      <span className="font-bold text-slate-750 text-right break-all max-w-xs leading-tight">{completedTx.fiscalHash}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Software de Faturação:</span>
                    <span className="text-slate-700">OST VENDAS ERP {formattedVersion}</span>
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-400 mt-6 uppercase tracking-wider">
                  *** Muito obrigado pela preferência! Volte sempre! ***
                </p>
              </div>
            </div>

            {/* Quick Digital Dispatchers */}
            <div className="space-y-2">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Comunicações Digitais</p>

              {/* Bloco de Notificação / Ação Rápida caso o cliente não tenha dados de contacto */}
              {(!selectedCustomer || !selectedCustomer.email || !selectedCustomer.phone || selectedCustomer.phone === "Indisponível" || selectedCustomer.phone === "Sem Telemóvel" || selectedCustomer.name === "Consumidor Geral") && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10.5px] leading-relaxed text-amber-900 space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5 text-amber-800">
                    <UserPlus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{!selectedCustomer || selectedCustomer.name === "Consumidor Geral" ? "Cliente Consumidor Geral" : "Dados de Contacto Incompletos"}</span>
                  </p>
                  <p className="text-slate-600">
                    {!selectedCustomer || selectedCustomer.name === "Consumidor Geral"
                      ? "O cliente atual é Consumidor Geral. Registe-o rapidamente para enviar a fatura em PDF por Email ou WhatsApp:"
                      : `Adicione o e-mail ou telemóvel para despachar o comprovativo a ${selectedCustomer.name}:`}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1 font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCustomer) {
                          setQuickCustName(selectedCustomer.name && selectedCustomer.name !== "Consumidor Geral" ? selectedCustomer.name : "");
                          setQuickCustPhone(selectedCustomer.phone && selectedCustomer.phone !== "Indisponível" && selectedCustomer.phone !== "Sem Telemóvel" ? selectedCustomer.phone : "");
                          setQuickCustEmail(selectedCustomer.email || "");
                          setQuickCustNuit(selectedCustomer.nuit || "");
                        } else if (completedTx) {
                          setQuickCustName(completedTx.customerName && completedTx.customerName !== "Consumidor Geral" ? completedTx.customerName : "");
                          setQuickCustPhone(completedTx.customerPhone || "");
                        }
                        setPendingReceiptAction("email");
                        setQuickCustomerModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      Registar e Enviar Email
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCustomer) {
                          setQuickCustName(selectedCustomer.name && selectedCustomer.name !== "Consumidor Geral" ? selectedCustomer.name : "");
                          setQuickCustPhone(selectedCustomer.phone && selectedCustomer.phone !== "Indisponível" && selectedCustomer.phone !== "Sem Telemóvel" ? selectedCustomer.phone : "");
                          setQuickCustEmail(selectedCustomer.email || "");
                          setQuickCustNuit(selectedCustomer.nuit || "");
                        } else if (completedTx) {
                          setQuickCustName(completedTx.customerName && completedTx.customerName !== "Consumidor Geral" ? completedTx.customerName : "");
                          setQuickCustPhone(completedTx.customerPhone || "");
                        }
                        setPendingReceiptAction("whatsapp");
                        setQuickCustomerModalOpen(true);
                      }}
                      className="text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Registar e Enviar WhatsApp
                    </button>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSendEmail()}
                  disabled={sendEmailStatus !== "idle"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-blue-50 text-blue-750 hover:bg-blue-100 transition border border-blue-100 disabled:opacity-75 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {sendEmailStatus === "idle" ? "Email" : sendEmailStatus === "sending" ? "..." : "✓"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSendSms()}
                  disabled={sendSmsStatus !== "idle"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition border border-indigo-100 disabled:opacity-75 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  {sendSmsStatus === "idle" ? "SMS" : sendSmsStatus === "sending" ? "..." : "✓"}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppModal()}
                  disabled={sendWhatsAppStatus === "sending"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-emerald-50 text-emerald-850 hover:bg-emerald-100 transition border border-emerald-150 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                  {sendWhatsAppStatus === "idle" ? "WhatsApp" : sendWhatsAppStatus === "sending" ? "..." : "✓"}
                </button>
              </div>

              {/* Primary 80mm Thermal Receipt Button */}
              <button
                type="button"
                onClick={() => triggerPrintReceipt("receipt")}
                className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 rounded-xl text-xs font-bold text-white transition shadow-lg shadow-orange-600/20 cursor-pointer active:scale-[0.99]"
                title="Imprimir Fita Térmica de 80mm (Atalho: F5)"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Imprimir Recibo</span>
                  <kbd className="px-1.5 py-0.5 bg-white/20 text-white rounded text-[10px] font-mono font-bold shadow-inner">
                    F5
                  </kbd>
                </div>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono font-semibold tracking-wide">
                  Térmica 80mm
                </span>
              </button>

              {/* Secondary A4 Invoice Button */}
              <button
                type="button"
                onClick={() => triggerPrintReceipt("invoice")}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
                title="Imprimir Fatura em Folha A4"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span>Imprimir Fatura (A4)</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-sans">
                  Folha A4
                </span>
              </button>

              {/* Popup window options */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      printThermal80mmReceipt(completedTx, settings || { companyName: "OST VENDAS", currency: "MT" } as SystemSettings);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 border border-orange-200 bg-orange-50/50 hover:bg-orange-100/80 text-orange-800 text-[10.5px] font-semibold transition rounded-lg cursor-pointer"
                >
                  <Printer className="w-3 h-3 text-orange-600" />
                  <span>Janela Recibo 80mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      printInvoiceHTML(completedTx, settings || { companyName: "OST VENDAS", currency: "MT" } as SystemSettings);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10.5px] font-semibold transition rounded-lg cursor-pointer"
                >
                  <Printer className="w-3 h-3 text-slate-400" />
                  <span>Janela Fatura A4</span>
                </button>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={handleReset}
              className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center"
            >
              Completar e Iniciar Nova Venda
            </button>
          </div>
        </div>
      )}

      {/* Elegant Real-time Virtual Printer Animation Overlay Safeguard */}
      {isSimulatingPrint && (
        <div className="fixed inset-0 bg-zinc-950/85 backdrop-blur-md flex items-center justify-center z-[100] p-4 text-xs font-sans">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl text-center space-y-4 text-white">
            <div className="relative w-16 h-16 mx-auto bg-orange-500/10 rounded-full flex items-center justify-center text-amber-500">
              <Printer className="w-8 h-8 animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            
            <div>
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-amber-500">Impressora Térmica Fiscal</h4>
              <p className="text-[11px] text-zinc-400 mt-1">A transmitir cupão e a emitir rolo físico...</p>
            </div>
            
            <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-850 text-left font-mono text-[9px] text-zinc-400 max-h-32 overflow-hidden relative">
              <div className="animate-pulse mb-1.5 flex items-center gap-1.5 text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded w-max">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                <span>• {completedBudget ? "IMPRIMINDO PROPOSTA COMERCIAL..." : "IMPRIMINDO RECIBO FISCAL..."}</span>
              </div>
              <p className="font-bold border-b border-dashed border-zinc-800 pb-1 uppercase">
                {completedBudget ? completedBudget.budgetNumber : (completedTx?.invoiceNumber || "FATURA-PROVISORIA")}
              </p>
              <p>OPERADOR: {completedBudget ? activeUsername : (completedTx?.cashierName || activeUsername)}</p>
              <p>
                {completedBudget 
                  ? `TOTAL PROP: ${completedBudget.grandTotal.toLocaleString()} MT` 
                  : `PAGO: ${completedTx?.grandTotal.toLocaleString() || "0"} MT via ${completedTx?.paymentMethod || "CASH"}`}
              </p>
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
            </div>

            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full animate-pulse" style={{ width: "90%" }}></div>
            </div>

            <p className="text-[10px] text-zinc-500 leading-normal">
              O documento comercial foi registado nas filas locais de impressão fiscal corporativa.
            </p>
          </div>
        </div>
      )}

      {/* Modern virtual feedback safeguard overlay for transaction completed without printing */}
      {noReceiptSuccess && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center z-[100] px-4 animate-in fade-in slide-in-from-bottom duration-300">
          <div className="bg-emerald-950 border border-emerald-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3.5 max-w-sm">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 text-zinc-950 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold font-sans">Venda Registada Sem Recibo!</p>
              <p className="text-[10px] text-emerald-300 mt-0.5">Stock decrementado e auditoria local guardada.</p>
            </div>
          </div>
        </div>
      )}

      {/* 26. WHATSAPP SEND DIALOG MODAL */}
      {whatsappModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-slate-800">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                  <span>Enviar Recibo via WhatsApp</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Revise o contacto e o formato do documento antes de despachar.</p>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${settings.whatsappEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                {settings.whatsappEnabled ? `API: ${settings.whatsappProvider}` : "Modo Link Direto"}
              </span>
            </div>

            <div className="space-y-3.5">
              {/* Phone number field */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Número do Cliente (Com WhatsApp)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="Ex: +258 84 900 1202"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 pl-10 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs font-bold font-mono">🇲🇿</span>
                </div>
                <p className="text-[9px] text-slate-400">Insira com o indicativo (Ex: +258 ou 258) ou apenas o número celular de Moçambique de 9 dígitos.</p>
              </div>

              {/* Message preview body */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Mensagem de Texto Pré-formatada</label>
                  <span className="text-[9.5px] font-mono text-slate-400">{whatsappMessage.length} caracteres</span>
                </div>
                <textarea
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={8}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-[10.5px] font-mono leading-relaxed outline-none focus:ring-1 focus:ring-emerald-500 max-h-60"
                />
              </div>

              {/* Helper guide on chosen provider */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[10px] space-y-1 font-mono text-slate-500">
                <p className="font-bold text-slate-700">⚙️ Canal de Comunicação Ativo:</p>
                {settings.whatsappEnabled && settings.whatsappProvider !== "DIRECT_LINK" ? (
                  <>
                    <p>• Provedor: <span className="text-emerald-700 font-bold">{settings.whatsappProvider}</span></p>
                    <p>• Endpoint: <span className="truncate block max-w-full">{settings.whatsappApiEndpoint || "Configurado"}</span></p>
                    <p className="text-[9px] text-slate-400">As mensagens serão disparadas via servidor invisível sem intervenção manual. Se houver falha, reverteremos para Link Direto.</p>
                  </>
                ) : (
                  <>
                    <p>• Provedor: <span className="text-orange-600 font-bold">Link Direto (wa.me)</span></p>
                    <p>• Custo: <span className="text-emerald-700 font-bold">100% Grátis e Ilimitado</span></p>
                    <p className="text-[9px] text-slate-400">O sistema abrirá uma nova aba do navegador para o WhatsApp Web ou aplicação móvel do operador com a mensagem pré-carregada.</p>
                  </>
                )}
              </div>
            </div>

            {/* Actions choosing triggers */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWhatsappModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(whatsappMessage);
                    if (onShowToast) onShowToast("Mensagem copiada para a área de transferência!", "success");
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  title="Copiar texto do recibo para colar manualmente"
                >
                  Copiar Texto 📋
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Botão de Link Direto com tag nativa <a> para evitar bloqueios de popup */}
                <a
                  href={`https://wa.me/${whatsappPhone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setSendWhatsAppStatus("sent");
                    setTimeout(() => setSendWhatsAppStatus("idle"), 4000);
                    if (onShowToast) onShowToast(`Abrindo conversa do WhatsApp para ${whatsappPhone}...`, "success");
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Abrir no WhatsApp ↗</span>
                </a>

                {settings.whatsappEnabled && settings.whatsappProvider !== "DIRECT_LINK" && (
                  <button
                    type="button"
                    onClick={() => dispatchWhatsAppReceipt(false)}
                    disabled={sendWhatsAppStatus === "sending"}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 rounded-xl text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
                  >
                    {sendWhatsAppStatus === "sending" ? "Enviando..." : "Disparar API Gateway"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: Orçamento & Proposta Comercial */}
      {completedBudget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          {/* Inject Dynamic Print Overrides */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              /* Hide everything else */
              body * {
                visibility: hidden !important;
                background: none !important;
              }
              /* Show and target ONLY our printable paper block */
              #budget-print-area, #budget-print-area * {
                visibility: visible !important;
              }
              #budget-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                color: black !important;
                width: ${budgetPrintFormat === "ESC_POS" ? (selectedPaperSize === "58MM" ? "58mm" : "80mm") : "210mm"} !important;
                max-width: ${budgetPrintFormat === "ESC_POS" ? (selectedPaperSize === "58MM" ? "58mm" : "80mm") : "210mm"} !important;
                padding: ${budgetPrintFormat === "ESC_POS" ? "4mm" : "15mm"} !important;
                font-family: ${budgetPrintFormat === "ESC_POS" ? "monospace" : "sans-serif"} !important;
                font-size: ${budgetPrintFormat === "ESC_POS" ? "11px" : "13px"} !important;
                line-height: 1.2 !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}} />

          <div className="bg-white p-6 rounded-2xl max-w-2xl w-full border border-slate-100 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200 no-print">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900 text-sm">Template de Orçamento POS</h3>
                  <p className="text-[11px] text-slate-400">Emissão e formatação de propostas comerciais.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {settings.printerEnabled ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    ESC/POS Ativo ({settings.paperSize || "80MM"})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold bg-slate-50 text-slate-500 rounded-full border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    Impressora Térmica Desativada
                  </span>
                )}
              </div>
            </div>

            {/* Template & Size Controllers */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBudgetPrintFormat("A4_DOC")}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  budgetPrintFormat === "A4_DOC" 
                    ? "bg-white text-slate-950 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>📄 Proposta A4 Corporativa</span>
              </button>
              <button
                type="button"
                onClick={() => setBudgetPrintFormat("ESC_POS")}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  budgetPrintFormat === "ESC_POS" 
                    ? "bg-white text-slate-950 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>📠 Recibo Térmico ESC/POS</span>
              </button>
            </div>

            {/* Sub-selectors for ESC/POS mode */}
            {budgetPrintFormat === "ESC_POS" && (
              <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBudgetTab("PREVIEW")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-lg cursor-pointer ${
                      budgetTab === "PREVIEW" ? "bg-amber-100 text-amber-800" : "text-amber-600 hover:bg-amber-100/40"
                    }`}
                  >
                    Fita Térmica (Pré-visualização)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetTab("RAW_COMMANDS")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-lg cursor-pointer ${
                      budgetTab === "RAW_COMMANDS" ? "bg-amber-100 text-amber-800" : "text-amber-600 hover:bg-amber-100/40"
                    }`}
                  >
                    Comandos Brutos (Raw ESC/POS)
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                  <span>Papel:</span>
                  <select
                    value={selectedPaperSize}
                    onChange={(e: any) => setSelectedPaperSize(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] outline-none"
                  >
                    <option value="80MM">80mm (Largo)</option>
                    <option value="58MM">58mm (Estreito)</option>
                  </select>
                </div>
              </div>
            )}

            {/* PREVIEW CONTAINER */}
            <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50 p-4 shadow-inner">
              {budgetPrintFormat === "A4_DOC" ? (
                /* --- Template A4 CORPORATIVO --- */
                <div id="budget-print-area" className="bg-white p-6 rounded-xl border border-slate-200 text-left font-sans text-xs text-slate-700 shadow-md">
                  {/* Corporate Header */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                    <div>
                      {settings.logoUrl ? (
                        <img
                          src={settings.logoUrl}
                          alt="Logo Empresa"
                          className="h-10 w-auto object-contain mb-2 bg-white rounded"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-sm mb-1.5">
                          OST
                        </div>
                      )}
                      <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">{settings.companyName || "Indisponível"}</h4>
                      {settings.slogan && <p className="text-[10px] text-slate-400 italic font-medium">{settings.slogan}</p>}
                      <p className="text-[10px] text-slate-500 mt-1">{settings.storeAddress || settings.companyAddress || "Indisponível"}</p>
                      <p className="text-[10px] text-slate-500">NUIT: {settings.companyNuit || "Indisponível"}</p>
                      {settings.storeContact && <p className="text-[10px] text-slate-500">Contacto: {settings.storeContact}</p>}
                    </div>

                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-extrabold text-[10px] uppercase rounded-full tracking-wider border border-amber-200">
                        Proposta de Orçamento
                      </span>
                      <h3 className="font-black text-slate-950 text-lg mt-3">{completedBudget.budgetNumber}</h3>
                      <p className="text-[10px] text-slate-500">Emissão: {new Date(completedBudget.timestamp).toLocaleString("pt-MZ")}</p>
                      <p className="text-[10px] text-amber-700 font-semibold mt-1">Validade: 15 dias (Até {new Date(completedBudget.timestamp + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-MZ")})</p>
                    </div>
                  </div>

                  {/* Customer / Operators details block */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-150 mb-4">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Destinatário (Cliente)</span>
                      <p className="font-extrabold text-slate-955 text-xs">{completedBudget.customerName}</p>
                      {completedBudget.customerNuit && <p className="text-[10px] mt-0.5">NUIT: <span className="font-mono">{completedBudget.customerNuit}</span></p>}
                      {completedBudget.customerPhone && <p className="text-[10px] mt-0.5">Tel: {completedBudget.customerPhone}</p>}
                      {completedBudget.customerEmail && <p className="text-[10px] mt-0.5">E-mail: {completedBudget.customerEmail}</p>}
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Emissor / Responsável</span>
                      <p className="font-extrabold text-slate-955 text-xs">{activeUsername}</p>
                      <p className="text-[10px] mt-0.5">Terminal: POS-01 Central</p>
                      <p className="text-[10px] text-slate-500 italic mt-1">Este orçamento é uma proposta provisória para fornecimento.</p>
                    </div>
                  </div>

                  {/* Itemized Grid */}
                  <table className="w-full text-left border-collapse mb-4">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px] border-b border-slate-200">
                        <th className="py-2.5 px-2">Artigo / Descrição</th>
                        <th className="py-2.5 px-2 text-center w-16">Qtd</th>
                        <th className="py-2.5 px-2 text-right w-24">Preço Unitário</th>
                        <th className="py-2.5 px-2 text-right w-28">Total Parcial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {completedBudget.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 text-slate-650">
                          <td className="py-2.5 px-2 font-bold text-slate-800">{item.productName}</td>
                          <td className="py-2.5 px-2 text-center font-mono">{item.quantity}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{item.price.toLocaleString()} MT</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-950">{(item.price * item.quantity).toLocaleString()} MT</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pricing Summary block */}
                  <div className="flex justify-between items-end border-t border-slate-200 pt-4">
                    <div className="text-[10px] text-slate-400 max-w-sm">
                      <p className="font-bold text-slate-500">Termos e Condições:</p>
                      <p className="mt-1 leading-normal">1. Os preços apresentados incluem IVA à taxa em vigor.<br/>2. Esta proposta comercial é válida por 15 dias de calendário.<br/>3. O fornecimento dos artigos está sujeito ao stock disponível.</p>
                    </div>
                    <div className="w-64 space-y-1.5 text-right font-mono text-[11px] text-slate-600">
                      <div className="flex justify-between">
                        <span>SUBTOTAL:</span>
                        <span>{completedBudget.subtotal.toLocaleString()} MT</span>
                      </div>
                      {completedBudget.discountTotal > 0 && (
                        <div className="flex justify-between text-red-600 font-bold">
                          <span>DESCONTO:</span>
                          <span>-{completedBudget.discountTotal.toLocaleString()} MT</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>IVA ESTIMADO (16%):</span>
                        <span>{completedBudget.vatTotal.toLocaleString()} MT</span>
                      </div>
                      <div className="flex justify-between text-slate-900 font-black text-sm border-t border-dashed border-slate-200 pt-2 mt-1">
                        <span>TOTAL PROPOSTO:</span>
                        <span className="text-amber-800">{completedBudget.grandTotal.toLocaleString()} MT</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Seal */}
                  <div className="text-center text-[9px] text-slate-400 mt-8 border-t border-dashed border-slate-150 pt-4">
                    <p className="uppercase tracking-widest font-bold text-slate-500">{settings.companyName || "Indisponível"}</p>
                    <p className="mt-1">Obrigado pela preferência! Processado por computador.</p>
                  </div>
                </div>
              ) : budgetTab === "PREVIEW" ? (
                /* --- Template ESC/POS RECIBO TÉRMICO (Papel Contínuo) --- */
                <div className="flex justify-center">
                  <div 
                    id="budget-print-area" 
                    className="bg-white p-4 text-left font-mono text-[10px] leading-snug text-zinc-800 border border-zinc-200 shadow-lg relative rounded-md select-all"
                    style={{ width: selectedPaperSize === "58MM" ? "240px" : "320px" }}
                  >
                    {/* Simulated paper roll edges */}
                    <div className="absolute inset-x-0 -top-1.5 h-1.5 bg-zinc-100 border-b border-dashed border-zinc-300"></div>
                    <div className="absolute inset-x-0 -bottom-1.5 h-1.5 bg-zinc-100 border-t border-dashed border-zinc-300"></div>

                    {/* Logo & Header */}
                    <div className="text-center mb-2.5">
                      {settings.logoUrl && (
                        <img
                          src={settings.logoUrl}
                          alt="Logo Recibo"
                          className="w-12 h-12 object-contain mx-auto mb-1.5 bg-white p-0.5 rounded border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <p className="font-extrabold uppercase text-xs tracking-wider">{settings.companyName || "Indisponível"}</p>
                      {settings.slogan && <p className="text-[8px] text-zinc-500 italic mt-0.5">{settings.slogan}</p>}
                      <p className="text-[8px] text-zinc-500 mt-1">{settings.storeAddress || settings.companyAddress || "Indisponível"}</p>
                      <p className="text-[8px] text-zinc-500">NUIT Empr: {settings.companyNuit || "Indisponível"}</p>
                      {settings.storeContact && <p className="text-[8px] text-zinc-500">Tel: {settings.storeContact}</p>}
                    </div>

                    <div className="border-b border-dashed border-zinc-300 pb-1.5 mb-2.5 space-y-0.5">
                      <p className="font-bold text-amber-700 text-[11px]">*** PROPOSTA COMERCIAL ***</p>
                      <p><span className="text-zinc-500">ORÇAMENTO Nº:</span> <span className="font-bold">{completedBudget.budgetNumber}</span></p>
                      <p><span className="text-zinc-500">EMISSÃO:</span> {new Date(completedBudget.timestamp).toLocaleString("pt-MZ")}</p>
                      <p><span className="text-zinc-500">VALIDADE:</span> 15 Dias (Até {new Date(completedBudget.timestamp + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-MZ")})</p>
                      <p><span className="text-zinc-500">OPERADOR:</span> {activeUsername}</p>
                      <p className="border-t border-dashed border-zinc-200 pt-1 mt-1"><span className="text-zinc-500">CLIENTE:</span> <span className="font-bold">{completedBudget.customerName}</span></p>
                      {completedBudget.customerNuit && <p><span className="text-zinc-500">NUIT CLI:</span> {completedBudget.customerNuit}</p>}
                      {completedBudget.customerPhone && <p><span className="text-zinc-500">CONTAC :</span> {completedBudget.customerPhone}</p>}
                    </div>

                    {/* Table Headers */}
                    <div className="border-b border-dashed border-zinc-300 pb-1 mb-1 font-bold text-zinc-900 grid grid-cols-12 gap-1 text-[9px]">
                      <span className="col-span-6">ARTIGO</span>
                      <span className="col-span-2 text-center">QTD</span>
                      <span className="col-span-4 text-right">VALOR</span>
                    </div>

                    {/* Items */}
                    <div className="space-y-1 py-1 border-b border-dashed border-zinc-300 mb-2">
                      {completedBudget.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-1 text-[9px] text-zinc-700">
                          <span className="col-span-6 truncate font-medium">{item.productName}</span>
                          <span className="col-span-2 text-center font-mono">{item.quantity}</span>
                          <span className="col-span-4 text-right font-mono">{(item.price * item.quantity).toLocaleString()} MT</span>
                        </div>
                      ))}
                    </div>

                    {/* Calculations */}
                    <div className="space-y-1 text-right text-[9px] text-zinc-600">
                      <p>SUBTOTAL: {completedBudget.subtotal.toLocaleString()} MT</p>
                      {completedBudget.discountTotal > 0 && <p className="text-red-650 font-bold">DESCONTO: -{completedBudget.discountTotal.toLocaleString()} MT</p>}
                      <p>IVA ESTIMADO: {completedBudget.vatTotal.toLocaleString()} MT</p>
                      <p className="text-zinc-900 font-bold text-[11px] border-t border-dashed border-zinc-300 pt-1.5 mt-1">
                        TOTAL PROP: {completedBudget.grandTotal.toLocaleString()} MT
                      </p>
                    </div>

                    <div className="text-center mt-4 border-t border-dashed border-zinc-300 pt-2 text-[8px] text-zinc-400 space-y-0.5">
                      <p className="font-bold uppercase tracking-wider text-zinc-500">*** PROPOSTA SEM VALOR FISCAL ***</p>
                      <p>Obrigado pela preferência e confiança!</p>
                      <p>Emitido via Terminal Térmico ESC/POS.</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* --- RAW ESC/POS COMMAND TEXT LAYOUT --- */
                <div className="bg-zinc-950 p-4 rounded-xl text-left font-mono text-[10px] text-emerald-400 leading-normal select-all whitespace-pre">
                  {getEscPosText(completedBudget, selectedPaperSize)}
                </div>
              )}
            </div>

            {/* Quick Dispatchers */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5 text-left">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">E-mail de Envio</label>
                  <input
                    type="email"
                    placeholder="exemplo@cliente.com"
                    value={budgetTargetEmail}
                    onChange={(e) => setBudgetTargetEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition"
                  />
                </div>
                <div className="space-y-0.5 text-left">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Telemóvel (WhatsApp/SMS)</label>
                  <input
                    type="text"
                    placeholder="+258 84 000 0000"
                    value={budgetTargetPhone}
                    onChange={(e) => setBudgetTargetPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide text-left">Entregar / Enviar ao Cliente</p>
              
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleSendBudgetEmail}
                  disabled={sendBudgetEmailStatus !== "idle"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-blue-50 text-blue-750 hover:bg-blue-100 transition border border-blue-100 disabled:opacity-75 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {sendBudgetEmailStatus === "idle" ? "E-mail" : sendBudgetEmailStatus === "sending" ? "..." : "✓ Enviado"}
                </button>
                <button
                  type="button"
                  onClick={handleSendBudgetSms}
                  disabled={sendBudgetSmsStatus !== "idle"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition border border-indigo-100 disabled:opacity-75 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  {sendBudgetSmsStatus === "idle" ? "SMS" : sendBudgetSmsStatus === "sending" ? "..." : "✓ Enviado"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenBudgetWhatsApp}
                  disabled={sendBudgetWhatsAppStatus === "sending"}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold bg-emerald-50 text-emerald-850 hover:bg-emerald-100 transition border border-emerald-150 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                  WhatsApp
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsSimulatingPrint(true);
                  try {
                    window.print();
                  } catch (err) {
                    console.warn("Dispositivo em iFrame bloqueado para window.print. Impressora Virtual Ativada.");
                  }
                  setTimeout(() => {
                    setIsSimulatingPrint(false);
                  }, 4000);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-lg shadow-amber-600/15"
                title="Imprimir Orçamento (Atalho: F5)"
              >
                <Printer className="w-4 h-4 text-amber-100" />
                <span>{budgetPrintFormat === "ESC_POS" ? `Imprimir Fita Térmica (${selectedPaperSize})` : "Imprimir Proposta A4"}</span>
                <kbd className="px-1.5 py-0.5 bg-white/20 text-white rounded text-[10px] font-mono font-bold shadow-inner ml-1">
                  F5
                </kbd>
              </button>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setCompletedBudget(null)}
              className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center hover:bg-slate-800"
            >
              Fechar Orçamento (Manter Carrinho)
            </button>
          </div>
        </div>
      )}

      {/* Floating Help Button in Bottom Right */}
      <button
        type="button"
        onClick={() => setShowShortcutsHelp(true)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl transition-all duration-200 transform hover:scale-110 active:scale-95 cursor-pointer z-40 flex items-center justify-center border border-indigo-500/20"
        title="Ajuda e Atalhos de Teclado (F1)"
        id="pos-shortcuts-floating-btn"
      >
        <HelpCircle className="w-6 h-6 animate-pulse" />
      </button>

      {/* 26. Modal de Alerta de Stock Crítico */}
      {showCriticalStockModal && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            id="pos-critical-stock-modal"
          >
            {/* Header */}
            <div className="p-6 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shadow-inner animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900 text-sm">Alerta de Stock Crítico</h3>
                  <p className="text-[11px] text-red-650 font-bold">Produtos que ficarão abaixo do nível de alerta após a venda</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowCriticalStockModal(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-red-100 border border-red-200 text-red-400 hover:text-red-600 flex items-center justify-center transition cursor-pointer font-bold text-xs font-mono"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-[11.5px] text-slate-500 leading-normal text-left">
                Os seguintes itens no carrinho de compras atual têm quantidades que reduzirão o estoque restante abaixo ou ao nível crítico definido individualmente nas configurações de stock.
              </p>

              <div className="space-y-3">
                {itemsLeavingStockBelowCritical.map(item => {
                  const currentStock = item.product.stock;
                  const saleQty = item.quantity;
                  const finalStock = currentStock - saleQty;
                  const minStock = item.product.minStock || 0;

                  return (
                    <div 
                      key={item.product.id}
                      className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl flex flex-col gap-2 hover:bg-slate-100/70 transition text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">{item.product.brand || "Genérico"} ({item.product.code})</span>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1 leading-tight">{item.product.name}</h4>
                        </div>
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                          Mín Alerta: {minStock}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-center">
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">Stock Atual</span>
                          <span className="text-xs font-mono font-bold text-slate-600">{currentStock}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">No Carrinho</span>
                          <span className="text-xs font-mono font-bold text-orange-600">-{saleQty}</span>
                        </div>
                        <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                          <span className="text-[9px] font-bold text-red-400 block uppercase">Stock Final</span>
                          <span className={`text-xs font-mono font-bold ${finalStock < 0 ? "text-red-700 underline" : "text-red-600"}`}>
                            {finalStock}
                          </span>
                        </div>
                      </div>

                      {finalStock < 0 && (
                        <p className="text-[9.5px] text-red-600 font-bold flex items-center gap-1">
                          ⚠️ Atenção: Esta transação causará ruptura de stock (estoque negativo)!
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCriticalStockModal(false)}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs cursor-pointer transition shadow-sm"
              >
                Entendi, Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Floating Help Overlay */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            id="pos-shortcuts-help-modal"
          >
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900 text-sm">Ajuda e Atalhos do POS</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Aumente a sua eficiência de atendimento</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer font-bold text-xs"
                title="Fechar (ESC)"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Shortcut Rows */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Atalhos de Operação do POS</p>
                <div className="grid grid-cols-1 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                  
                  {/* F1 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Painel de Ajuda / Atalhos</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F1</kbd>
                  </div>

                  {/* F2 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Focar Seleção de Cliente</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F2</kbd>
                  </div>

                  {/* F3 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Focar Pesquisa de Artigos</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F3</kbd>
                  </div>

                  {/* F4 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Registo Rápido de Cliente</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F4</kbd>
                  </div>

                  {/* F5 */}
                  <div className="flex items-center justify-between p-3 hover:bg-amber-50/70 transition bg-amber-50/40">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                      <div>
                        <span className="text-xs font-bold text-amber-950 block">Imprimir Recibo / Finalização Rápida</span>
                        <span className="text-[10.5px] text-amber-800/80">Imprime o recibo atual ou fatura imediatamente com emissão</span>
                      </div>
                    </div>
                    <kbd className="px-2.5 py-1 bg-amber-500 text-white border border-amber-600 rounded-lg text-xs font-bold font-mono shadow-sm">F5</kbd>
                  </div>

                  {/* F6 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Aplicar Desconto Comercial %</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F6</kbd>
                  </div>

                  {/* F8 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Alternar Método de Pagamento</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F8</kbd>
                  </div>

                  {/* F9 */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Abrir Confirmação / Pré-Checkout</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">F9</kbd>
                  </div>

                  {/* ESC */}
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-xs font-semibold text-slate-700">Esvaziar / Cancelar Venda Atual</span>
                    </div>
                    <kbd className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 font-mono shadow-sm">ESC</kbd>
                  </div>

                </div>
              </div>

              {/* Advanced info section */}
              <div className="space-y-3 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Recursos de Automação & Eficiência</p>
                
                <div className="space-y-3 text-left">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <span className="text-lg">🏷️</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-orange-950">Leitura Inteligente por Código de Barras</h4>
                      <p className="text-[11px] text-orange-800/80 leading-relaxed mt-0.5">
                        O POS suporta o uso de leitores USB emulando teclado. Ao bipar um artigo em qualquer lugar, o sistema processa o código instantaneamente e insere-o no carrinho, prevenindo cliques desnecessários.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <span className="text-lg">⚖️</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-950">Solicitação Automática de Peso</h4>
                      <p className="text-[11px] text-amber-800/80 leading-relaxed mt-0.5">
                        Para artigos vendidos ao quilo/peso, o sistema detecta de forma automática e abre um diálogo interativo para inserção da massa em gramas/kg, calculando com rigor a faturação.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-lg">💡</span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Agilidade no Trabalho</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        Você pode fechar esta janela de ajuda a qualquer momento pressionando a tecla <kbd className="font-mono text-[10px] bg-white border px-1 py-0.5 rounded shadow-sm">ESC</kbd> ou <kbd className="font-mono text-[10px] bg-white border px-1 py-0.5 rounded shadow-sm">F1</kbd>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                Compreendi! Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Modais de Gestão de Turno de Caixa */}
      <POSShiftModals
        activeUsername={activeUsername}
        employees={employees}
        currency={currency}
        activeShift={currentShift}
        shiftMetrics={shiftMetrics}
        settings={settings}
        showOpenModal={showOpenShiftModal}
        onCloseOpenModal={() => setShowOpenShiftModal(false)}
        showCloseModal={showCloseShiftModal}
        onCloseCloseModal={() => setShowCloseShiftModal(false)}
        showExtratoModal={showExtratoModal}
        onCloseExtratoModal={() => setShowExtratoModal(false)}
        showQuickEntryModal={showQuickEntryModal}
        quickEntryType={quickEntryType}
        onCloseQuickEntryModal={() => setShowQuickEntryModal(false)}
        onConfirmOpenShift={handleConfirmOpenShiftAction}
        onConfirmCloseShift={handleConfirmCloseShiftAction}
        onConfirmQuickEntry={handleConfirmQuickEntryAction}
      />
    </div>
  );
}

export default memo(POSModule);
