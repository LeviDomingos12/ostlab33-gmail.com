import React, { useState, useMemo, memo } from "react";
import { 
  Plus, 
  Edit3, 
  AlertTriangle, 
  TrendingUp, 
  Upload, 
  Trash2, 
  CheckCircle,
  Search,
  Calendar,
  MoreVertical,
  Copy,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Info,
  Filter,
  BarChart3,
  List,
  Eye,
  PlusCircle,
  MinusCircle,
  Sparkles,
  Layers,
  DollarSign,
  Download,
  Percent,
  RefreshCw,
  X,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  Mail,
  Send,
  Save,
  MapPin,
  ArrowLeftRight,
  Truck,
  UserCheck,
  ShoppingCart,
  Printer,
  CreditCard,
  Sliders
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Product, UserRole, Transaction, SystemSettings, StockTransfer, SupplierOrder, ReceiptStatus } from "../types";
import { authenticatedFetch } from "../lib/apiClient";
import BatchManager from "./BatchManager";
import { useConfirm } from "../hooks/useConfirm";
import { PromoFlyerGenerator } from "./PromoFlyerGenerator";
import StockThresholdsSettings from "./StockThresholdsSettings";
import { BulkMarkupModal } from "./stock/BulkMarkupModal";
import { CommercialDataService } from "../services/dataService";
import { imageStorageService } from "../services/imageStorageService";
import { 
  generateEntityId, 
  generateProductCode, 
  generateDeterministicBarcodeEan13, 
  generateSecurePin 
} from "../lib/deterministic";

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

interface StockModuleProps {
  products: Product[];
  transactions?: Transaction[];
  onAddProduct: (p: Product) => void | Promise<void>;
  onUpdateProduct: (p: Product) => void | Promise<void>;
  onUpdateProductsBatch?: (products: Product[]) => Promise<void>;
  onDeleteProduct: (pId: string) => void | Promise<void>;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currentRole: UserRole;
  currency: string;
  settings?: SystemSettings;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  onUpdateSettings?: (settings: Partial<SystemSettings>) => void;
}

function StockModule({
  products,
  transactions = [],
  onAddProduct,
  onUpdateProduct,
  onUpdateProductsBatch,
  onDeleteProduct,
  onAddAuditLog,
  currentRole,
  currency,
  settings,
  onShowToast,
  onUpdateSettings
}: StockModuleProps) {
  const confirm = useConfirm();
  
  // Local sub-tabs inside Stock module: "list" | "charts" | "reports" | "batches" | "branches" | "suppliers" | "thresholds"
  const [activeModuleTab, setActiveModuleTab] = useState<"list" | "charts" | "reports" | "batches" | "branches" | "suppliers" | "thresholds">("list");
  const [supplierSubTab, setSupplierSubTab] = useState<"orders" | "finance" | "config">("orders");
  const [selectedFinanceSupplierId, setSelectedFinanceSupplierId] = useState<string | null>(null);
  const [supplierChartLayout, setSupplierChartLayout] = useState<"grouped" | "stacked">("grouped");

  // Suppliers states and handlers
  const registeredSuppliers = useMemo(() => settings?.suppliers || [], [settings?.suppliers]);
  const supplierOrders = useMemo(() => settings?.supplierOrders || [], [settings?.supplierOrders]);

  const supplierMonthlyChartData = useMemo(() => {
    const paidOrders = supplierOrders.filter((o: any) => o.paymentStatus === "Pago" && o.status !== "Cancelado");
    const monthLabels: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, "0");
      const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][d.getMonth()];
      monthLabels.push({
        key: `${year}-${monthNum}`,
        label: `${monthShort}/${String(year).slice(-2)}`
      });
    }

    return monthLabels.map(({ key, label }) => {
      const item: any = { month: label, rawMonth: key };
      registeredSuppliers.forEach((s: any) => {
        item[s.name] = 0;
      });
      
      const ordersInMonth = paidOrders.filter((o: any) => o.requestDate && o.requestDate.startsWith(key));
      ordersInMonth.forEach((o: any) => {
        if (item[o.supplierName] !== undefined) {
          item[o.supplierName] += o.totalValue;
        } else {
          item[o.supplierName] = o.totalValue;
        }
      });
      return item;
    });
  }, [supplierOrders, registeredSuppliers]);

  const supplierDependencyStats = useMemo(() => {
    const paidOrders = supplierOrders.filter((o: any) => o.paymentStatus === "Pago" && o.status !== "Cancelado");
    const totalPaid = paidOrders.reduce((sum: number, o: any) => sum + o.totalValue, 0);
    
    if (totalPaid === 0) return { totalPaid: 0, items: [], dominant: null };

    const items = registeredSuppliers.map((s: any) => {
      const paid = paidOrders.filter((o: any) => o.supplierId === s.id).reduce((sum: number, o: any) => sum + o.totalValue, 0);
      const percentage = (paid / totalPaid) * 100;
      return {
        id: s.id,
        name: s.name,
        totalPaid: paid,
        percentage
      };
    }).sort((a: any, b: any) => b.totalPaid - a.totalPaid);

    const dominant = items[0] && items[0].percentage >= 40 ? items[0] : null;

    return {
      totalPaid,
      items,
      dominant
    };
  }, [supplierOrders, registeredSuppliers]);

  const [supplierNameInput, setSupplierNameInput] = useState("");
  const [supplierPhoneInput, setSupplierPhoneInput] = useState("");
  const [supplierEmailInput, setSupplierEmailInput] = useState("");
  const [supplierAddressInput, setSupplierAddressInput] = useState("");
  const [supplierNuitInput, setSupplierNuitInput] = useState("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);

  // Stock Request / Orders states
  const [orderSupplierId, setOrderSupplierId] = useState("");
  const [orderProductId, setOrderProductId] = useState("");
  const [orderQtyRequested, setOrderQtyRequested] = useState<number>(0);
  const [orderUnitCost, setOrderUnitCost] = useState<number>(0);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<"Pago" | "Crédito" | "Pendente">("Pendente");
  const [orderPaymentDueDate, setOrderPaymentDueDate] = useState("");
  const [orderDispatchChannel, setOrderDispatchChannel] = useState<"WHATSAPP" | "EMAIL" | "NONE">("WHATSAPP");
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);

  // Email Dispatch Modal state
  const [isOrderEmailModalOpen, setIsOrderEmailModalOpen] = useState(false);
  const [selectedOrderForEmail, setSelectedOrderForEmail] = useState<any>(null);
  const [orderEmailRecipient, setOrderEmailRecipient] = useState("");
  const [orderEmailSubject, setOrderEmailSubject] = useState("");
  const [orderEmailBody, setOrderEmailBody] = useState("");

  // Filtering states
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState("Todos");
  const [selectedPaymentStatusFilter, setSelectedPaymentStatusFilter] = useState("Todos");
  const [selectedOrderStatusFilter, setSelectedOrderStatusFilter] = useState("Todos");
  const [selectedReceiptStatusFilter, setSelectedReceiptStatusFilter] = useState("Todos");

  // Delivery confirmation modal state ("Confirmar Entrega" workflow)
  const [deliveryConfirmOrder, setDeliveryConfirmOrder] = useState<SupplierOrder | null>(null);
  const [deliveryQty, setDeliveryQty] = useState<number>(0);
  const [deliveryCost, setDeliveryCost] = useState<number>(0);
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [deliveryNotes, setDeliveryNotes] = useState<string>("");
  const [updateProductCostPrice, setUpdateProductCostPrice] = useState<boolean>(false);
  const [isProcessingDelivery, setIsProcessingDelivery] = useState<boolean>(false);

  // Handler to open and pre-fill "Solicitar Stock" directly for a product
  const handleRequestStockFromSupplier = (product: Product) => {
    setActiveModuleTab("suppliers");
    setOrderProductId(product.id);
    setOrderUnitCost(product.costPrice);
    setOrderQtyRequested(product.minStock * 2 || 10);
    setOrderPaymentDueDate("");
    
    if (product.supplier) {
      const matchSupp = (settings?.suppliers || []).find((s: any) => s.name.toLowerCase() === product.supplier.toLowerCase());
      if (matchSupp) {
        setOrderSupplierId(matchSupp.id);
      } else {
        setOrderSupplierId("");
      }
    } else {
      setOrderSupplierId("");
    }
    
    setIsOrderFormOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierNameInput.trim()) {
      onShowToast?.("O nome do fornecedor é obrigatório.", "error");
      return;
    }

    const currentSuppliers = settings?.suppliers || [];
    let updated: any[];

    if (editingSupplierId) {
      updated = currentSuppliers.map((s: any) => 
        s.id === editingSupplierId 
          ? { ...s, name: supplierNameInput, phone: supplierPhoneInput, email: supplierEmailInput, address: supplierAddressInput, nuit: supplierNuitInput }
          : s
      );
      onShowToast?.("Fornecedor atualizado com sucesso!", "success");
      onAddAuditLog("Editar Fornecedor", "STOCK", `Atualizado fornecedor ${supplierNameInput}.`);
    } else {
      const newSupplier = {
        id: generateEntityId("supp"),
        name: supplierNameInput,
        phone: supplierPhoneInput,
        email: supplierEmailInput,
        address: supplierAddressInput,
        nuit: supplierNuitInput,
        status: "Ativo" as const
      };
      updated = [...currentSuppliers, newSupplier];
      onShowToast?.("Fornecedor registado com sucesso!", "success");
      onAddAuditLog("Registar Fornecedor", "STOCK", `Registado novo fornecedor ${supplierNameInput}.`);
    }

    onUpdateSettings?.({ suppliers: updated });
    
    // Reset form
    setSupplierNameInput("");
    setSupplierPhoneInput("");
    setSupplierEmailInput("");
    setSupplierAddressInput("");
    setSupplierNuitInput("");
    setEditingSupplierId(null);
    setIsSupplierFormOpen(false);
  };

  const handleEditSupplierClick = (supp: any) => {
    setEditingSupplierId(supp.id);
    setSupplierNameInput(supp.name);
    setSupplierPhoneInput(supp.phone || "");
    setSupplierEmailInput(supp.email || "");
    setSupplierAddressInput(supp.address || "");
    setSupplierNuitInput(supp.nuit || "");
    setIsSupplierFormOpen(true);
  };

  const handleDeleteSupplier = async (suppId: string, name: string) => {
    const ok = await confirm({
      title: "Eliminar Fornecedor",
      message: `Tem certeza de que deseja remover o fornecedor "${name}"? Os produtos associados não serão removidos.`
    });
    if (!ok) return;

    const currentSuppliers = settings?.suppliers || [];
    const updated = currentSuppliers.filter((s: any) => s.id !== suppId);
    onUpdateSettings?.({ suppliers: updated });
    onShowToast?.("Fornecedor removido com sucesso.", "success");
    onAddAuditLog("Eliminar Fornecedor", "STOCK", `Removido fornecedor ${name}.`);
  };

  const handleSendSupplierOrderWhatsApp = (order: any, supplierOverride?: any) => {
    const currentSuppliers = settings?.suppliers || [];
    const supp = supplierOverride || currentSuppliers.find((s: any) => s.id === order.supplierId || s.name.toLowerCase() === order.supplierName.toLowerCase());
    const phone = supp?.phone || "";

    if (!phone.trim()) {
      onShowToast?.(`O fornecedor "${order.supplierName}" não possui contacto telefónico/WhatsApp cadastrado.`, "warning");
      return;
    }

    let cleanPhone = phone.replace(/[^\d+]/g, "");
    if (!cleanPhone.startsWith("+") && !cleanPhone.startsWith("258") && cleanPhone.length === 9) {
      cleanPhone = `258${cleanPhone}`;
    } else if (cleanPhone.startsWith("+")) {
      cleanPhone = cleanPhone.substring(1);
    }

    const companyName = settings?.companyName || "Indisponível";
    const msg = 
`*SOLICITAÇÃO DE MATERIAL / PEDIDO DE COMPRA*
--------------------------------------------
*Empresa:* ${companyName}
*Para Fornecedor:* ${order.supplierName}
*Nº do Pedido:* ${order.id}
*Data:* ${order.requestDate || new Date().toISOString().split("T")[0]}

*Item Solicitado:*
• *Produto:* ${order.productName}
• *Quantidade:* ${order.quantityRequested} un.
• *Preço Unitário de Custo:* ${(order.unitCost || 0).toLocaleString("pt-MZ")} MT
• *Valor Total:* ${(order.totalValue || 0).toLocaleString("pt-MZ")} MT

*Condições de Pagamento:* ${order.paymentStatus || "Pendente"} ${order.paymentDueDate ? `(Vencimento: ${order.paymentDueDate})` : ""}

Por favor, confirme a recepção deste pedido, a disponibilidade do material e a previsão de entrega.

Atenciosamente,
${companyName}`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
    onShowToast?.(`Acessando WhatsApp para enviar pedido a ${order.supplierName}...`, "success");
    onAddAuditLog("Enviar Pedido WhatsApp", "STOCK", `Pedido ${order.id} enviado via WhatsApp para ${order.supplierName}.`);
  };

  const handleGenerateSupplierOrderPDF = async (order: any, supplierOverride?: any) => {
    const currentSuppliers = settings?.suppliers || [];
    const supp = supplierOverride || currentSuppliers.find((s: any) => s.id === order.supplierId || s.name.toLowerCase() === order.supplierName.toLowerCase());

    const doc = new jsPDF();
    const companyName = settings?.companyName || "Indisponível";
    const storeContact = settings?.storeContact || "";
    const storeAddress = settings?.storeAddress || "";
    const storeNuit = settings?.nuit || settings?.companyNuit || "";
    const storeEmail = settings?.email || settings?.storeEmail || "";

    // Load Company Logo
    let logoData = "";
    try {
      const rawLogo = settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg";
      logoData = await getBase64ImageFromUrl(rawLogo);
    } catch (err) {
      console.error("Erro ao carregar logotipo para PDF:", err);
    }

    // Header Background
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 48, "F");

    // Company Logo
    if (logoData) {
      try {
        doc.addImage(logoData, "JPEG", 14, 8, 30, 30);
      } catch (e1) {
        try {
          doc.addImage(logoData, "PNG", 14, 8, 30, 30);
        } catch (e2) {}
      }
    }

    // Company Info Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text(companyName.toUpperCase(), 48, 16);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    let yPos = 22;
    if (storeNuit) { doc.text(`NUIT: ${storeNuit}`, 48, yPos); yPos += 4.5; }
    if (storeContact) { doc.text(`Contacto: ${storeContact}`, 48, yPos); yPos += 4.5; }
    if (storeAddress) { doc.text(`Endereço: ${storeAddress}`, 48, yPos); yPos += 4.5; }
    if (storeEmail) { doc.text(`E-mail: ${storeEmail}`, 48, yPos); }

    // Orange Badge Document Box
    doc.setFillColor(234, 88, 12);
    doc.rect(130, 10, 66, 30, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text("ORDEM DE COMPRA", 135, 18);
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.text(`Ref: ${order.id}`, 135, 25);
    doc.text(`Data: ${order.requestDate || new Date().toISOString().split("T")[0]}`, 135, 31);

    // Supplier Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, 54, 182, 32, 2, 2, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("DADOS DO FORNECEDOR / DESTINATÁRIO", 18, 62);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Empresa / Nome: ${supp?.name || order.supplierName}`, 18, 70);
    doc.text(`E-mail: ${supp?.email || orderEmailRecipient || "Não informado"}`, 18, 77);
    doc.text(`Telefone: ${supp?.phone || supp?.contact || "Não informado"}`, 115, 70);
    doc.text(`Endereço: ${supp?.address || "Não informado"}`, 115, 77);

    // Item Table
    autoTable(doc, {
      startY: 92,
      head: [["Ref / Código", "Descrição do Item Solicitado", "Qtd Solicitada", "Preço Unit. (MT)", "Valor Total (MT)"]],
      body: [
        [
          order.productId || "-",
          order.productName || "Produto Solicitado",
          `${order.quantityRequested} un`,
          `${(order.unitCost || 0).toLocaleString("pt-MZ")} MT`,
          `${(order.totalValue || 0).toLocaleString("pt-MZ")} MT`
        ]
      ],
      theme: "grid",
      headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 68 },
        2: { cellWidth: 25, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 29, halign: "right" }
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 120;

    // Total Summary Box
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(120, finalY + 8, 76, 22, 2, 2, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text("TOTAL DO PEDIDO:", 124, finalY + 18);
    doc.setFontSize(11.5);
    doc.text(`${(order.totalValue || 0).toLocaleString("pt-MZ")} MT`, 192, finalY + 18, { align: "right" });

    // Payment Conditions & Notes
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("CONDIÇÕES DE FORNECIMENTO & PAGAMENTO:", 14, finalY + 15);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`• Status de Pagamento Acordado: ${order.paymentStatus || "Pendente"}`, 14, finalY + 21);
    if (order.paymentDueDate) {
      doc.text(`• Data de Vencimento do Pagamento: ${order.paymentDueDate}`, 14, finalY + 26);
    }
    doc.text(`• Solicitamos a gentileza de confirmar a recepção e informar a previsão de entrega.`, 14, finalY + 31);

    // Signatures / Stamps
    const sigY = finalY + 52;
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 90, sigY);
    doc.line(120, sigY, 190, sigY);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Aprovação - Gestão de Stock / ${companyName}`, 55, sigY + 5, { align: "center" });
    doc.text("Assinatura e Carimbo do Fornecedor", 155, sigY + 5, { align: "center" });

    return doc;
  };

  const handleSendSupplierOrderEmail = async (order: any, supplierOverride?: any) => {
    const currentSuppliers = settings?.suppliers || [];
    const supp = supplierOverride || currentSuppliers.find((s: any) => s.id === order.supplierId || s.name.toLowerCase() === order.supplierName.toLowerCase());
    const email = supp?.email || order.supplierEmail || "";

    setSelectedOrderForEmail(order);
    setOrderEmailRecipient(email);

    const companyName = settings?.companyName || "Indisponível";
    const subject = `Solicitação de Material / Ordem de Compra - ${companyName} (Ref: ${order.id})`;
    const body = 
`Prezado(a) ${order.supplierName},

Pela presente, a empresa ${companyName} formaliza a solicitação de fornecimento do seguinte material/produto:

DETALHES DO PEDIDO:
--------------------------------------------
- Código da Solicitação: ${order.id}
- Data de Emissão: ${order.requestDate || new Date().toISOString().split("T")[0]}
- Produto Solicitado: ${order.productName}
- Quantidade Requerida: ${order.quantityRequested} unidades
- Preço Unitário de Custo: ${(order.unitCost || 0).toLocaleString("pt-MZ")} MT
- Valor Total Estimado: ${(order.totalValue || 0).toLocaleString("pt-MZ")} MT
- Condição de Pagamento: ${order.paymentStatus || "Pendente"} ${order.paymentDueDate ? `(Vencimento: ${order.paymentDueDate})` : ""}

Encontra-se disponível o documento oficial da Ordem de Compra em formato PDF com o logotipo da empresa para formalização. Solicitamos a gentileza de confirmar a recepção e informar a previsão de entrega física.

Atenciosamente,
${companyName}
${settings?.storeAddress ? `Endereço: ${settings.storeAddress}` : ""}
${settings?.storeContact ? `Contacto: ${settings.storeContact}` : ""}`;

    setOrderEmailSubject(subject);
    setOrderEmailBody(body);
    setIsOrderEmailModalOpen(true);

    // Automatically trigger PDF download with company logo!
    try {
      const doc = await handleGenerateSupplierOrderPDF(order, supp);
      doc.save(`Ordem_de_Compra_${order.id}_${(order.supplierName || "Fornecedor").replace(/\s+/g, "_")}.pdf`);
      onShowToast?.(`Documento PDF da Ordem de Compra gerado e descarregado com logotipo!`, "success");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    }
  };

  const handleConfirmSendEmail = () => {
    if (!orderEmailRecipient.trim()) {
      onShowToast?.("Insira o e-mail do fornecedor.", "warning");
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(orderEmailRecipient.trim())}?subject=${encodeURIComponent(orderEmailSubject)}&body=${encodeURIComponent(orderEmailBody)}`;
    window.location.href = mailtoUrl;

    onShowToast?.(`Cliente de e-mail ativado para enviar ao destinatário ${orderEmailRecipient}!`, "success");
    if (onAddAuditLog && selectedOrderForEmail) {
      onAddAuditLog("Enviar Pedido E-mail", "STOCK", `Pedido ${selectedOrderForEmail.id} enviado via E-mail para ${selectedOrderForEmail.supplierName} (${orderEmailRecipient}).`);
    }
    setIsOrderEmailModalOpen(false);
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderSupplierId) {
      onShowToast?.("Selecione um fornecedor.", "error");
      return;
    }
    if (!orderProductId) {
      onShowToast?.("Selecione um produto.", "error");
      return;
    }
    if (orderQtyRequested <= 0) {
      onShowToast?.("A quantidade deve ser maior que zero.", "error");
      return;
    }

    const currentSuppliers = settings?.suppliers || [];
    const chosenSupplier = currentSuppliers.find((s: any) => s.id === orderSupplierId);
    const chosenProduct = products.find((p: any) => p.id === orderProductId);

    if (!chosenSupplier || !chosenProduct) {
      onShowToast?.("Fornecedor ou produto inválido.", "error");
      return;
    }

    const calcDefaultDueDate = () => {
      const d = new Date();
      d.setDate(d.getDate() + 15);
      return d.toISOString().split("T")[0];
    };

    const currentOrders = settings?.supplierOrders || [];
    const newOrder = {
      id: generateEntityId("order"),
      supplierId: orderSupplierId,
      supplierName: chosenSupplier.name,
      productId: orderProductId,
      productName: chosenProduct.name,
      quantityRequested: orderQtyRequested,
      unitCost: orderUnitCost || chosenProduct.costPrice,
      totalValue: (orderQtyRequested * (orderUnitCost || chosenProduct.costPrice)),
      status: "Pendente" as const,
      receiptStatus: "Aguardando Envio" as const,
      paymentStatus: orderPaymentStatus,
      paymentDueDate: orderPaymentStatus === "Pago" ? "" : (orderPaymentDueDate || calcDefaultDueDate()),
      requestDate: new Date().toISOString().split("T")[0]
    };

    const updated = [newOrder, ...currentOrders];
    onUpdateSettings?.({ supplierOrders: updated });
    onShowToast?.("Solicitação de material/stock gravada com sucesso!", "success");
    onAddAuditLog("Solicitação de Stock", "STOCK", `Solicitado ${orderQtyRequested} un de ${chosenProduct.name} ao fornecedor ${chosenSupplier.name}.`);

    // Automatic dispatch if selected
    if (orderDispatchChannel === "WHATSAPP") {
      handleSendSupplierOrderWhatsApp(newOrder, chosenSupplier);
    } else if (orderDispatchChannel === "EMAIL") {
      handleSendSupplierOrderEmail(newOrder, chosenSupplier);
    }

    // Reset Form
    setOrderSupplierId("");
    setOrderProductId("");
    setOrderQtyRequested(0);
    setOrderUnitCost(0);
    setOrderPaymentStatus("Pendente");
    setOrderPaymentDueDate("");
    setIsOrderFormOpen(false);
  };

  const isPaymentOverdue = (order: any) => {
    if (order.status === "Cancelado" || order.paymentStatus === "Pago") return false;
    
    let dueDateStr = order.paymentDueDate;
    if (!dueDateStr && order.requestDate) {
      const reqDate = new Date(order.requestDate);
      if (!isNaN(reqDate.getTime())) {
        reqDate.setDate(reqDate.getDate() + 15);
        dueDateStr = reqDate.toISOString().split("T")[0];
      }
    }
    
    if (!dueDateStr) return false;

    // Apply tolerance days if configured
    const tolerance = Number(settings?.supplierOverdueToleranceDays ?? 0);
    if (tolerance > 0) {
      const parts = dueDateStr.split("-");
      if (parts.length === 3) {
        const yr = parseInt(parts[0], 10);
        const mo = parseInt(parts[1], 10) - 1;
        const dy = parseInt(parts[2], 10);
        const d = new Date(yr, mo, dy);
        d.setDate(d.getDate() + tolerance);
        
        const resYr = d.getFullYear();
        const resMo = String(d.getMonth() + 1).padStart(2, "0");
        const resDy = String(d.getDate()).padStart(2, "0");
        dueDateStr = `${resYr}-${resMo}-${resDy}`;
      }
    }
    
    const todayStr = new Date().toISOString().split("T")[0];
    return dueDateStr < todayStr;
  };

  const handleOpenDeliveryConfirmModal = (order: SupplierOrder) => {
    setDeliveryConfirmOrder(order);
    setDeliveryQty(order.quantityRequested);
    setDeliveryCost(order.unitCost);
    setDeliveryDate(new Date().toISOString().split("T")[0]);
    setDeliveryNotes(order.deliveryNotes || "");
    setUpdateProductCostPrice(false);
  };

  const handleConfirmPhysicalDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryConfirmOrder) return;

    if (deliveryQty <= 0) {
      onShowToast?.("A quantidade entregue deve ser superior a zero.", "error");
      return;
    }

    setIsProcessingDelivery(true);
    try {
      const productToUpdate = products.find((p: any) => p.id === deliveryConfirmOrder.productId);
      const oldStock = productToUpdate ? productToUpdate.stock : 0;
      const newStock = oldStock + deliveryQty;

      if (productToUpdate) {
        const updatedProduct: Product = {
          ...productToUpdate,
          stock: newStock,
          costPrice: updateProductCostPrice && deliveryCost > 0 ? deliveryCost : productToUpdate.costPrice
        };
        await onUpdateProduct(updatedProduct);
      } else {
        onShowToast?.("Aviso: Produto original não encontrado para incremento direto.", "warning");
      }

      const currentOrders = settings?.supplierOrders || [];
      const updatedOrders = currentOrders.map((o: any) => {
        if (o.id === deliveryConfirmOrder.id) {
          return {
            ...o,
            status: "Recebido" as const,
            receiptStatus: "Entregue" as const,
            receivedDate: deliveryDate || new Date().toISOString().split("T")[0],
            receivedQuantity: deliveryQty,
            unitCost: deliveryCost > 0 ? deliveryCost : o.unitCost,
            totalValue: deliveryQty * (deliveryCost > 0 ? deliveryCost : o.unitCost),
            deliveryNotes: deliveryNotes.trim() || undefined,
            deliveryConfirmedDate: new Date().toISOString()
          };
        }
        return o;
      });

      onUpdateSettings?.({ supplierOrders: updatedOrders });
      onAddAuditLog(
        "Confirmação de Entrega",
        "STOCK",
        `Entrega física confirmada da ordem ${deliveryConfirmOrder.id}. Produto: "${deliveryConfirmOrder.productName}" (+${deliveryQty} un). Fornecedor: ${deliveryConfirmOrder.supplierName}. Stock anterior: ${oldStock} -> Novo stock final: ${newStock}.${deliveryNotes ? ` Observações: ${deliveryNotes}` : ""}`
      );

      onShowToast?.(`Entrega física confirmada com sucesso! +${deliveryQty} un adicionadas ao stock final de "${deliveryConfirmOrder.productName}".`, "success", "Stock Atualizado");
      setDeliveryConfirmOrder(null);
    } catch (err) {
      console.error("Erro ao confirmar entrega:", err);
      onShowToast?.("Erro ao confirmar entrega física. Tente novamente.", "error");
    } finally {
      setIsProcessingDelivery(false);
    }
  };

  const handleUpdateOrderReceiptStatus = async (orderId: string, newReceiptStatus: ReceiptStatus) => {
    const currentOrders = settings?.supplierOrders || [];
    const order = currentOrders.find((o: any) => o.id === orderId);
    if (!order) return;

    if (newReceiptStatus === "Entregue") {
      // Physical delivery confirmation is required before adding to stock
      handleOpenDeliveryConfirmModal(order);
      return;
    }

    if (newReceiptStatus === "Cancelado") {
      const ok = await confirm({
        title: "Cancelar Ordem",
        message: `Deseja realmente cancelar a ordem de compra de "${order.productName}"?`
      });
      if (!ok) return;

      const updated = currentOrders.map((o: any) => 
        o.id === orderId ? { ...o, status: "Cancelado" as const, receiptStatus: "Cancelado" as const } : o
      );
      onUpdateSettings?.({ supplierOrders: updated });
      onShowToast?.("Ordem cancelada.", "info");
      onAddAuditLog("Cancelar Ordem", "STOCK", `Ordem ${orderId} (${order.productName}) cancelada.`);
      return;
    }

    // For "Aguardando Envio" or "Em Trânsito", update status without altering stock!
    const updated = currentOrders.map((o: any) => 
      o.id === orderId ? { ...o, receiptStatus: newReceiptStatus } : o
    );
    onUpdateSettings?.({ supplierOrders: updated });
    onShowToast?.(`Status de Recebimento atualizado para "${newReceiptStatus}". O stock final permanece intacto até confirmação da entrega física.`, "success");
    onAddAuditLog("Status de Recebimento", "STOCK", `Status de recebimento da ordem ${orderId} alterado para "${newReceiptStatus}".`);
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: "Pendente" | "Recebido" | "Cancelado") => {
    const currentOrders = settings?.supplierOrders || [];
    const order = currentOrders.find((o: any) => o.id === orderId);
    if (!order) return;

    if (newStatus === "Recebido" && order.status !== "Recebido") {
      // Require physical delivery confirmation flow to prevent automatic/unverified stock additions
      handleOpenDeliveryConfirmModal(order);
      return;
    }

    if (newStatus === "Cancelado") {
      const ok = await confirm({
        title: "Cancelar Solicitação de Stock",
        message: `Deseja cancelar o pedido de "${order.productName}"?`
      });
      if (!ok) return;

      const updated = currentOrders.map((o: any) => 
        o.id === orderId 
          ? { ...o, status: "Cancelado" as const, receiptStatus: "Cancelado" as const }
          : o
      );
      onUpdateSettings?.({ supplierOrders: updated });
      onShowToast?.(`Estado da solicitação alterado para "Cancelado".`, "info");
      onAddAuditLog("Cancelar Solicitação de Stock", "STOCK", `Solicitação de stock ${orderId} (${order.productName}) cancelada.`);
      return;
    }

    const updated = currentOrders.map((o: any) => 
      o.id === orderId 
        ? { ...o, status: newStatus }
        : o
    );

    onUpdateSettings?.({ supplierOrders: updated });
    onShowToast?.(`Estado da solicitação alterado para "${newStatus}".`, "success");
    onAddAuditLog("Atualizar Solicitação de Stock", "STOCK", `Solicitação de stock ${orderId} (${order.productName}) marcada como ${newStatus}.`);
  };

  const handleUpdateOrderPaymentStatus = (orderId: string, newPaymentStatus: "Pago" | "Crédito" | "Pendente") => {
    const currentOrders = settings?.supplierOrders || [];
    const updated = currentOrders.map((o: any) => 
      o.id === orderId ? { ...o, paymentStatus: newPaymentStatus } : o
    );
    onUpdateSettings?.({ supplierOrders: updated });
    onShowToast?.(`Estado do pagamento alterado para "${newPaymentStatus}".`, "success");
  };

  const handleLiquidateAllDebts = async (supplierId: string, supplierName: string) => {
    const currentOrders = settings?.supplierOrders || [];
    const supplierPendingOrders = currentOrders.filter(
      (o: any) => o.supplierId === supplierId && (o.paymentStatus === "Crédito" || o.paymentStatus === "Pendente") && o.status !== "Cancelado"
    );

    if (supplierPendingOrders.length === 0) {
      onShowToast?.("Este fornecedor não possui pagamentos ou dívidas pendentes.", "info");
      return;
    }

    const totalDebtAmount = supplierPendingOrders.reduce((sum: number, o: any) => sum + o.totalValue, 0);

    const ok = await confirm({
      title: `Liquidar Dívidas - ${supplierName}`,
      message: `Deseja marcar todas as ${supplierPendingOrders.length} transações pendentes/a crédito como PAGAS? Valor Total: ${totalDebtAmount.toLocaleString()} MT.`
    });
    if (!ok) return;

    const updated = currentOrders.map((o: any) => 
      o.supplierId === supplierId && (o.paymentStatus === "Crédito" || o.paymentStatus === "Pendente") && o.status !== "Cancelado"
        ? { ...o, paymentStatus: "Pago" as const }
        : o
    );

    onUpdateSettings?.({ supplierOrders: updated });
    onShowToast?.(`Todas as dívidas com ${supplierName} foram liquidadas!`, "success");
    if (onAddAuditLog) {
      onAddAuditLog("Liquidação de Dívidas", "STOCK", `Todas as dívidas do fornecedor ${supplierName} (${totalDebtAmount.toLocaleString()} MT) foram liquidadas.`);
    }
  };

  const handleExportSupplierLedgerPDF = (supplier: any) => {
    const doc = new jsPDF();
    const sOrders = supplierOrders.filter((o: any) => o.supplierId === supplier.id && o.status !== "Cancelado");
    
    const totalPurchased = sOrders.reduce((sum: number, o: any) => sum + o.totalValue, 0);
    const paidAmount = sOrders.filter((o: any) => o.paymentStatus === "Pago").reduce((sum: number, o: any) => sum + o.totalValue, 0);
    const creditDebt = sOrders.filter((o: any) => o.paymentStatus === "Crédito").reduce((sum: number, o: any) => sum + o.totalValue, 0);
    const pendingPayment = sOrders.filter((o: any) => o.paymentStatus === "Pendente").reduce((sum: number, o: any) => sum + o.totalValue, 0);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.text("OST VENDAS - EXTRATO DE FORNECEDOR", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-MZ")} ${new Date().toLocaleTimeString("pt-MZ")}`, 14, 26);
    
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 30, 196, 30);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text("FORNECEDOR:", 14, 38);
    doc.setFont("Helvetica", "normal");
    doc.text(`${supplier.name}`, 45, 38);
    
    doc.setFont("Helvetica", "bold");
    doc.text("NUIT:", 14, 44);
    doc.setFont("Helvetica", "normal");
    doc.text(`${supplier.nuit || "N/A"}`, 45, 44);
    
    doc.setFont("Helvetica", "bold");
    doc.text("Contacto:", 14, 50);
    doc.setFont("Helvetica", "normal");
    doc.text(`${supplier.phone || "N/A"} | ${supplier.email || "N/A"}`, 45, 50);
    
    doc.line(14, 55, 196, 55);
    
    doc.setFont("Helvetica", "bold");
    doc.text("RESUMO FINANCEIRO", 14, 63);
    
    doc.setFont("Helvetica", "normal");
    doc.text(`Total Comprado: ${totalPurchased.toLocaleString()} MT`, 14, 71);
    doc.text(`Total Pago: ${paidAmount.toLocaleString()} MT`, 14, 77);
    doc.text(`Dívida em Crédito: ${creditDebt.toLocaleString()} MT`, 110, 71);
    doc.text(`Pagamentos Pendentes: ${pendingPayment.toLocaleString()} MT`, 110, 77);
    
    doc.line(14, 83, 196, 83);
    
    const tableData = sOrders.map((o: any) => [
      o.requestDate,
      o.productName,
      `${o.quantityRequested} un`,
      `${o.unitCost.toLocaleString()} MT`,
      `${o.totalValue.toLocaleString()} MT`,
      o.status,
      o.paymentStatus
    ]);
    
    autoTable(doc, {
      startY: 88,
      head: [["Data", "Produto", "Qtd", "Custo Unit.", "Total", "Estado Pedido", "Estado Pagto"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 9 }
    });
    
    doc.save(`extrato_fornecedor_${supplier.name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
    onShowToast?.(`Extrato de ${supplier.name} exportado com sucesso!`, "success");
  };

  const handleExportAllSuppliersFinance = (format: "pdf" | "csv") => {
    if (registeredSuppliers.length === 0) {
      onShowToast?.("Não existem fornecedores para exportar.", "error");
      return;
    }

    const data = registeredSuppliers.map((supp) => {
      const sOrders = supplierOrders.filter((o: any) => o.supplierId === supp.id && o.status !== "Cancelado");
      const totalPurchased = sOrders.reduce((sum: number, o: any) => sum + o.totalValue, 0);
      const paidAmount = sOrders.filter((o: any) => o.paymentStatus === "Pago").reduce((sum: number, o: any) => sum + o.totalValue, 0);
      const creditDebt = sOrders.filter((o: any) => o.paymentStatus === "Crédito").reduce((sum: number, o: any) => sum + o.totalValue, 0);
      const pendingPayment = sOrders.filter((o: any) => o.paymentStatus === "Pendente").reduce((sum: number, o: any) => sum + o.totalValue, 0);
      const hasOverduePayment = sOrders.some((o: any) => isPaymentOverdue(o));
      
      let status = "Regular";
      if (creditDebt > 0 && hasOverduePayment) {
        status = "Crédito em Atraso";
      } else if (creditDebt > 0) {
        status = "Crédito Ativo";
      } else if (pendingPayment > 0) {
        status = "Pendente";
      }

      return {
        name: supp.name,
        nuit: supp.nuit || "N/A",
        totalPurchased,
        paidAmount,
        creditDebt,
        pendingPayment,
        status,
      };
    });

    if (format === "csv") {
      let csvContent = "\uFEFF"; // UTF-8 BOM
      csvContent += "Fornecedor;NUIT;Total Compras (MT);Total Pago (MT);Dívida Crédito (MT);Pendente Pagamento (MT);Estado\n";
      
      data.forEach((item) => {
        csvContent += `"${item.name.replace(/"/g, '""')}";"${item.nuit}";${item.totalPurchased};${item.paidAmount};${item.creditDebt};${item.pendingPayment};"${item.status}"\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `balanco_financeiro_fornecedores_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast?.("Balanço financeiro exportado em CSV!", "success");
    } else {
      // PDF export
      const doc = new jsPDF();
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text("BALANCO FINANCEIRO DE FORNECEDORES", 14, 20);

      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      doc.text(`Data de Emissao: ${new Date().toLocaleDateString("pt-MZ")} ${new Date().toLocaleTimeString("pt-MZ")}`, 14, 26);
      doc.text("Relatorio unificado de contas a pagar, pagamentos efetuados e dividas ativas por parceiro comercial.", 14, 31);

      doc.setDrawColor(220, 220, 220);
      doc.line(14, 35, 196, 35);

      // Financial totals block
      const grandTotalPurchases = data.reduce((sum, item) => sum + item.totalPurchased, 0);
      const grandTotalPaid = data.reduce((sum, item) => sum + item.paidAmount, 0);
      const grandTotalDebt = data.reduce((sum, item) => sum + item.creditDebt, 0);
      const grandTotalPending = data.reduce((sum, item) => sum + item.pendingPayment, 0);

      doc.setFont("Helvetica", "bold");
      doc.text("RESUMO CONSOLIDADO DO CAIXA:", 14, 43);
      doc.setFont("Helvetica", "normal");
      doc.text(`Total em Compras de Stock: ${grandTotalPurchases.toLocaleString()} MT`, 14, 50);
      doc.text(`Total Liquidado (Pago): ${grandTotalPaid.toLocaleString()} MT`, 14, 56);
      doc.text(`Total em Divida Ativa (Credito): ${grandTotalDebt.toLocaleString()} MT`, 110, 50);
      doc.text(`Total Pendente de Liquidacao: ${grandTotalPending.toLocaleString()} MT`, 110, 56);

      doc.line(14, 62, 196, 62);

      const tableRows = data.map((item) => [
        item.name,
        item.nuit,
        `${item.totalPurchased.toLocaleString()} MT`,
        `${item.paidAmount.toLocaleString()} MT`,
        `${item.creditDebt.toLocaleString()} MT`,
        `${item.pendingPayment.toLocaleString()} MT`,
        item.status
      ]);

      autoTable(doc, {
        startY: 67,
        head: [["Fornecedor", "NUIT", "Total Compras", "Total Pago", "Divida Credito", "Pendente Pgto", "Estado"]],
        body: tableRows,
        theme: "striped",
        headStyles: { fillColor: [249, 115, 22] }, // orange color matching theme
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 20 },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "center" }
        }
      });

      doc.save(`balanco_financeiro_fornecedores_${new Date().toISOString().split("T")[0]}.pdf`);
      onShowToast?.("Relatorio PDF exportado com sucesso!", "success");
    }
  };

  // Automated Batch Expiry Detection for real inventory items
  const expiringBatchesInfo = useMemo(() => {
    const today = new Date();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 30);

    // Extract batches ONLY from active products currently in the catalog
    const activeBatches: any[] = [];
    products.forEach((prod) => {
      if (prod && Array.isArray(prod.batches)) {
        prod.batches.forEach((b) => {
          if (b && Number(b.quantity) > 0 && b.expiryDate) {
            activeBatches.push({
              ...b,
              productId: prod.id,
              productName: prod.name,
              product: prod
            });
          }
        });
      }
    });

    const expiring = activeBatches.filter((batch: any) => {
      const expiry = new Date(batch.expiryDate);
      return expiry <= limitDate;
    });

    const expired = expiring.filter((batch: any) => {
      const expiry = new Date(batch.expiryDate);
      return expiry < today;
    });

    const warning = expiring.filter((batch: any) => {
      const expiry = new Date(batch.expiryDate);
      return expiry >= today;
    });

    return {
      all: expiring,
      expired,
      warning,
      count: expiring.length
    };
  }, [products]);

  // Local state for filters and search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedSupplier, setSelectedSupplier] = useState("Todos");
  const [stockFilter, setStockFilter] = useState<"ALL" | "LOW_STOCK" | "EXPIRED" | "OUT_OF_STOCK">("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [minMarginFilter, setMinMarginFilter] = useState<number>(0);

  // States for Stock Reports tab
  const [reportStartDate, setReportStartDate] = useState(() => {
    const today = new Date();
    const past = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    return past.toISOString().split("T")[0];
  });
  const [reportEndDate, setReportEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [reportType, setReportType] = useState<"MOVEMENTS" | "VALUATION" | "EXPIRATION">("VALUATION");
  const [reportCategory, setReportCategory] = useState("Todos");
  const [reportSearchQuery, setReportSearchQuery] = useState("");

  // Sorting state
  const [sortField, setSortField] = useState<keyof Product | "profit" | "stockValue" | "">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Selection states
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkMarkupModal, setShowBulkMarkupModal] = useState<boolean>(false);

  const handleApplyBulkMarkup = async (updatedBatch: Product[], summaryText: string) => {
    if (onUpdateProductsBatch) {
      await onUpdateProductsBatch(updatedBatch);
    } else {
      await CommercialDataService.saveProductsBatch(updatedBatch);
      for (const p of updatedBatch) {
        await onUpdateProduct(p);
      }
    }
    setSelectedProductIds([]);
    if (onShowToast) {
      onShowToast(summaryText, "success", "Preços Atualizados em Lote");
    }
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Slide-over detail panel state
  const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);

  // Quick Adjustment Modal state
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"IN" | "OUT">("IN");
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  // Action Dropdowns open state (stores productId of open dropdown)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [_sendingProductAlertId, setSendingProductAlertId] = useState<string | null>(null);

  // New replenishment order system states
  const [isReplenishmentModalOpen, setIsReplenishmentModalOpen] = useState(false);
  const [replenishSuccessMsg, setReplenishSuccessMsg] = useState("");
  const [isConfirmingReplenish, setIsConfirmingReplenish] = useState(false);

  // Batch management form states
  const [batchProductId, setBatchProductId] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [batchQty, setBatchQty] = useState<number>(50);
  const [batchCost, setBatchCost] = useState<number>(0);
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchSupplier, setBatchSupplier] = useState("");

  // Stock transfer form states
  const [transferOriginBranchId, setTransferOriginBranchId] = useState("central");
  const [transferDestBranchId, setTransferDestBranchId] = useState("matola");
  const [transferProductId, setTransferProductId] = useState("");
  const [transferQty, setTransferQty] = useState<number>(10);

  const handleSendWhatsAppStockAlert = async (product: Product) => {
    if (!settings || !settings.managerWhatsappPhone) {
      if (onShowToast) onShowToast("Contacto do Gestor não configurado nas definições de Gateway de Integração.", "warning");
      return;
    }

    const text = `⚠️ *Alerta de Reposição - ${settings?.companyName || "Gestão de Stock"}* ⚠️\n\n*Produto:* ${product.name}\n*Referência/SKU:* ${product.code}\n*Quantidade em Stock:* ${product.stock} un\n*Nível de Alerta Mínimo:* ${product.minStock} un\n\nPor favor, providencie a reposição imediata deste item comercial.`;
    const targetPhone = settings.managerWhatsappPhone;

    const cleanPhone = targetPhone.replace(/\D/g, "");
    const defaultPhone = cleanPhone.length === 9 && (cleanPhone.startsWith("84") || cleanPhone.startsWith("85") || cleanPhone.startsWith("82") || cleanPhone.startsWith("87") || cleanPhone.startsWith("86"))
      ? `258${cleanPhone}`
      : cleanPhone;

    const directUrl = `https://api.whatsapp.com/send?phone=${defaultPhone}&text=${encodeURIComponent(text)}`;

    setSendingProductAlertId(product.id);

    try {
      if (!settings.whatsappEnabled || settings.whatsappProvider === "DIRECT_LINK") {
        window.open(directUrl, "_blank", "noopener,noreferrer");
        if (onShowToast) onShowToast("Link direto do WhatsApp aberto com sucesso!", "success");
        onAddAuditLog("Enviar Alerta Stock WhatsApp", "ESTOQUE", `Notificação de reposição gerada para ${product.name}.`);
        return;
      }

      const response = await authenticatedFetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: defaultPhone,
          message: text,
          gatewayConfig: settings
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Falha ao enviar através do Gateway de Integração");
      }

      if (resData.mode === "DIRECT_LINK") {
        window.open(resData.directUrl || directUrl, "_blank", "noopener,noreferrer");
        if (onShowToast) onShowToast("Link direto do WhatsApp aberto!", "success");
      } else {
        if (onShowToast) onShowToast(resData.message || "Notificação de reposição enviada com sucesso!", "success");
      }
      onAddAuditLog("Enviar Alerta Stock WhatsApp", "ESTOQUE", `Notificação de reposição de ${product.name} enviada via WhatsApp para o Gestor.`);
    } catch (err: any) {
      if (onShowToast) onShowToast(`Erro no Gateway: ${err.message}. Redirecionando para Link Direto...`, "warning");
      window.open(directUrl, "_blank", "noopener,noreferrer");
    } finally {
      setSendingProductAlertId(null);
    }
  };

  // Excel import sheet state
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "processing" | "success">("idle");
  const [importedRowCount, setImportedRowCount] = useState(0);

  // Add/Edit drawer state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Form Fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("Mercearia");
  const [supplier, setSupplier] = useState("");
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(16);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(10);
  const [expiryDate, setExpiryDate] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [imageUrl, setImageUrl] = useState("");
  const [promotion, setPromotion] = useState("");
  const [isFlyerGeneratorOpen, setIsFlyerGeneratorOpen] = useState(false);
  const [flyerProduct, setFlyerProduct] = useState<Product | null>(null);

  // Categories and Suppliers lists
  const categoriesList = useMemo(() => {
    const list = new Set(products.map(p => p.category));
    return ["Todos", ...Array.from(list)];
  }, [products]);

  const suppliersList = useMemo(() => {
    const list = new Set(products.map(p => p.supplier).filter(Boolean));
    return ["Todos", ...Array.from(list)];
  }, [products]);

  // Is Supervisor/Admin checks for mutations
  const canMutate = useMemo(() => {
    return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
  }, [currentRole]);

  // Handle column sorting
  const handleSort = (field: keyof Product | "profit" | "stockValue") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Main stats calculations
  const stats = useMemo(() => {
    const total = products.length;
    const totalCost = products.reduce((acc, p) => {
      const c = Number(p.costPrice || 0);
      const s = Number(p.stock || 0);
      return acc + (isNaN(c) || isNaN(s) ? 0 : c * s);
    }, 0);
    const totalSale = products.reduce((acc, p) => {
      const sp = Number(p.salePrice || 0);
      const s = Number(p.stock || 0);
      return acc + (isNaN(sp) || isNaN(s) ? 0 : sp * s);
    }, 0);
    const potentialProfit = totalSale - totalCost;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
    const outOfStock = products.filter(p => p.stock <= 0).length;
    const upcomingExpiry = products.filter(p => {
      if (!p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      const limit = new Date();
      limit.setDate(limit.getDate() + 30);
      return exp <= limit;
    }).length;

    return {
      total,
      totalCost,
      totalSale,
      potentialProfit,
      lowStock,
      outOfStock,
      upcomingExpiry
    };
  }, [products]);

  // Filtered and sorted products list
  const processedProducts = useMemo(() => {
    let result = products.filter(p => {
      // 1. Search Query
      const q = searchQuery.toLowerCase();
      const matchSearch = 
        (p.name || "").toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.supplier && p.supplier.toLowerCase().includes(q));
      
      // 2. Category
      const matchCat = selectedCategory === "Todos" || p.category === selectedCategory;

      // 3. Supplier
      const matchSupp = selectedSupplier === "Todos" || p.supplier === selectedSupplier;

      // 4. Quick Stock Filter
      let matchStock = true;
      if (stockFilter === "LOW_STOCK") {
        matchStock = p.stock > 0 && p.stock <= p.minStock;
      } else if (stockFilter === "OUT_OF_STOCK") {
        matchStock = p.stock <= 0;
      } else if (stockFilter === "EXPIRED") {
        if (!p.expiryDate) {
          matchStock = false;
        } else {
          const exp = new Date(p.expiryDate);
          const limit = new Date();
          limit.setDate(limit.getDate() + 30);
          matchStock = exp <= limit;
        }
      }

      // 5. Margin profit filter
      const profitAmt = p.salePrice - p.costPrice;
      const profitPct = p.costPrice > 0 ? (profitAmt / p.costPrice) * 100 : 0;
      const matchMargin = profitPct >= minMarginFilter;

      return matchSearch && matchCat && matchSupp && matchStock && matchMargin;
    });

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortField === "profit") {
          valA = a.salePrice - a.costPrice;
          valB = b.salePrice - b.costPrice;
        } else if (sortField === "stockValue") {
          valA = a.stock * a.costPrice;
          valB = b.stock * b.costPrice;
        } else {
          valA = a[sortField as keyof Product] ?? "";
          valB = b[sortField as keyof Product] ?? "";
        }

        if (typeof valA === "string") {
          return sortDirection === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        } else {
          return sortDirection === "asc"
            ? (valA as number) - (valB as number)
            : (valB as number) - (valA as number);
        }
      });
    }

    return result;
  }, [products, searchQuery, selectedCategory, selectedSupplier, stockFilter, minMarginFilter, sortField, sortDirection]);

  // Paginated list
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [processedProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(processedProducts.length / itemsPerPage) || 1;

  // Handle single and multi selection
  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId) 
        : [...prev, productId]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === paginatedProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(paginatedProducts.map(p => p.id));
    }
  };

  // Forms setup
  const openCreateForm = () => {
    setEditingProduct(null);
    setName("");
    setCode(generateProductCode());
    setBarcode(generateDeterministicBarcodeEan13("560", products.length + 1));
    setCategory("Mercearia");
    setSupplier("");
    setCostPrice(0);
    setSalePrice(0);
    setVatRate(16);
    setStock(10);
    setMinStock(5);
    setExpiryDate("");
    setEmoji("📦");
    setImageUrl("");
    setPromotion("");
    setValidationError("");
    setIsFormOpen(true);
  };

  const openEditForm = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCode(p.code);
    setBarcode(p.barcode || "");
    setCategory(p.category);
    setSupplier(p.supplier || "");
    setCostPrice(p.costPrice);
    setSalePrice(p.salePrice);
    setVatRate(p.vatRate || 16);
    setStock(p.stock);
    setMinStock(p.minStock);
    setExpiryDate(p.expiryDate || "");
    setEmoji(p.emoji || "📦");
    setImageUrl(p.image || "");
    setPromotion(p.promotion || "");
    setValidationError("");
    setIsFormOpen(true);
  };

  const handleDuplicateProduct = (p: Product) => {
    const duplicated: Product = {
      ...p,
      id: generateEntityId("prod"),
      name: `${p.name} (Cópia)`,
      code: `${p.code}-COP`,
      barcode: p.barcode ? `${p.barcode}-1` : generateDeterministicBarcodeEan13("560", products.length + 2),
      stock: 0
    };
    onAddProduct(duplicated);
    onAddAuditLog(
      "Duplicar Produto",
      "STOCK",
      `O produto '${p.name}' foi duplicado como '${duplicated.name}' por ${currentRole}.`
    );
    setSelectedProductIds([]);
  };

  // Submit additions/edits
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!name.trim() || !code.trim() || !supplier.trim()) {
      setValidationError("Por favor, preencha todos os campos obrigatórios (Nome, Código e Fornecedor).");
      return;
    }

    if (salePrice <= costPrice) {
      setValidationError("O preço de venda deve ser estritamente superior ao preço de custo operacional.");
      return;
    }

    const payload: Product = {
      id: editingProduct ? editingProduct.id : generateEntityId("prod"),
      name,
      code,
      barcode: barcode.trim() || undefined,
      category,
      supplier,
      costPrice,
      salePrice,
      vatRate,
      stock,
      minStock,
      expiryDate: expiryDate || undefined,
      emoji,
      image: imageUrl || undefined,
      promotion: promotion || undefined
    };

    try {
      if (imageUrl) {
        imageStorageService.saveProductImage(payload.id, imageUrl, payload.name).catch(console.warn);
      }

      if (editingProduct) {
        await onUpdateProduct(payload);
        onAddAuditLog(
          "Modificar Produto",
          "STOCK",
          `O produto '${payload.name}' foi atualizado por ${currentRole}. Stock: ${payload.stock}, Preço de Venda: ${payload.salePrice} ${currency}`
        );
      } else {
        await onAddProduct(payload);
        onAddAuditLog(
          "Adicionar Produto",
          "STOCK",
          `Novo produto '${payload.name}' cadastrado por ${currentRole}. Custo: ${payload.costPrice}, Preço: ${payload.salePrice}`
        );
      }

      setIsFormOpen(false);
    } catch (err: any) {
      console.error("[StockModule] Erro ao gravar produto no PostgreSQL:", err);
      // Mantém o formulário aberto para preservar os dados digitados caso o banco falhe
    }
  };

  // Delete product action
  const handleDeleteProductClick = async (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const isConfirmed = await confirm({
      title: "Você tem certeza?",
      message: `Deseja realmente apagar permanentemente o produto "${prod.name}" do stock? Esta ação é definitiva e irreversível.`,
      confirmText: "Sim, Excluir",
      cancelText: "Não, Cancelar",
      type: "danger"
    });

    if (isConfirmed) {
      try {
        await onDeleteProduct(productId);
        onAddAuditLog(
          "Excluir Produto",
          "STOCK",
          `Produto '${prod.name}' excluído permanentemente por ${currentRole}.`
        );
        setSelectedProductIds(prev => prev.filter(id => id !== productId));
      } catch (err) {
        console.error("[StockModule] Erro ao excluir produto:", err);
      }
    }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;

    const isConfirmed = await confirm({
      title: "Você tem certeza?",
      message: `Deseja realmente excluir permanentemente os ${selectedProductIds.length} produtos selecionados do stock? Esta ação é definitiva e não poderá ser desfeita.`,
      confirmText: `Sim, Excluir ${selectedProductIds.length} Itens`,
      cancelText: "Não, Cancelar",
      type: "danger"
    });

    if (isConfirmed) {
      selectedProductIds.forEach(id => {
        const prod = products.find(p => p.id === id);
        if (prod) {
          onDeleteProduct(id);
        }
      });
      onAddAuditLog(
        "Excluir Produtos em Massa",
        "STOCK",
        `${selectedProductIds.length} produtos foram excluídos em lote por ${currentRole}.`
      );
      setSelectedProductIds([]);
    }
  };

  const handleBulkExport = () => {
    const headers = ["CÓDIGO", "NOME", "CATEGORIA", "FORNECEDOR", "CUSTO (MT)", "VENDA (MT)", "STOCK", "MÍNIMO"];
    const rows = products
      .filter(p => selectedProductIds.length === 0 || selectedProductIds.includes(p.id))
      .map(p => [
        p.code,
        p.name,
        p.category,
        p.supplier || "",
        p.costPrice.toString(),
        p.salePrice.toString(),
        p.stock.toString(),
        p.minStock.toString()
      ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_stock_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddAuditLog(
      "Exportar Stock",
      "STOCK",
      `Exportado planilha de stock (${rows.length} produtos) por ${currentRole}.`
    );
  };

  // Quick adjustment submission
  const handleQuickAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct || adjustmentQty <= 0) return;

    const currentQty = adjustingProduct.stock;
    const newQty = adjustmentType === "IN" ? currentQty + adjustmentQty : Math.max(0, currentQty - adjustmentQty);

    const updated: Product = {
      ...adjustingProduct,
      stock: newQty
    };

    onUpdateProduct(updated);
    onAddAuditLog(
      `Ajuste de Stock (${adjustmentType === "IN" ? "Entrada" : "Saída"})`,
      "STOCK",
      `Ajuste feito no produto '${adjustingProduct.name}'. Quantidade anterior: ${currentQty}, Nova: ${newQty}. Motivo: ${adjustmentReason || "Inventário rápido"}. Operador: ${currentRole}`
    );

    setAdjustingProduct(null);
    setAdjustmentQty(0);
    setAdjustmentReason("");
  };

  // Download CSV Template for products import
  const handleDownloadCSVTemplate = () => {
    const csvContent = "Nome;Código;Categoria;Fornecedor;Preço de Custo;Preço de Venda;Taxa de IVA;Stock Inicial;Stock Mínimo;Código de Barras\n" +
      "Arroz Top Star 25kg;ARR-TOP-25;Mercearia;Distribuidor Norte;1450;1850;16;50;10;6001234567890\n" +
      "Óleo de Cozinha 1L;OLE-1L;Mercearia;Distribuidor Central;120;165;16;100;20;6001234567891\n" +
      "Sabão em Barra 1kg;SAB-1KG;Higiene e Limpeza;Fábrica Sul;45;70;16;80;15;6001234567892";

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `modelo_importacao_produtos.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onShowToast) onShowToast("Modelo CSV de produtos descarregado com sucesso!", "success", "Download Concluído");
  };

  // Real File Import Processor for CSV / TSV / TXT
  const handleParseAndImportFile = async (file: File) => {
    setImportStatus("processing");
    try {
      const text = await file.text();
      const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

      if (rawLines.length === 0) {
        throw new Error("O ficheiro carregado está vazio.");
      }

      // Detect separator: comma, semicolon, or tab
      const firstLine = rawLines[0];
      const separator = firstLine.includes(";") ? ";" : (firstLine.includes("\t") ? "\t" : ",");

      const cleanNumber = (val: string | undefined): number => {
        if (!val) return 0;
        const cleaned = val.replace(/[^0-9.,-]/g, "").trim();
        if (cleaned.includes(",") && cleaned.includes(".")) {
          if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
            return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
          } else {
            return parseFloat(cleaned.replace(/,/g, "")) || 0;
          }
        } else if (cleaned.includes(",")) {
          return parseFloat(cleaned.replace(",", ".")) || 0;
        }
        return parseFloat(cleaned) || 0;
      };

      const rows: Product[] = [];
      const headerCols = firstLine.split(separator).map(c => c.trim().replace(/^["']|["']$/g, "").toLowerCase());
      const hasHeader = headerCols.some(h => 
        h.includes("nome") || h.includes("name") || h.includes("artigo") || h.includes("descri") || h.includes("código") || h.includes("preço") || h.includes("preco")
      );

      // Smart column index lookup
      let nameIdx = headerCols.findIndex(h => h.includes("nome") || h.includes("name") || h.includes("artigo") || h.includes("descri"));
      let codeIdx = headerCols.findIndex(h => h.includes("código") || h.includes("codigo") || h.includes("code") || h.includes("ref"));
      let catIdx = headerCols.findIndex(h => h.includes("categor") || h.includes("família") || h.includes("familia"));
      let suppIdx = headerCols.findIndex(h => h.includes("fornecedor") || h.includes("supplier") || h.includes("marca"));
      let costIdx = headerCols.findIndex(h => h.includes("custo") || h.includes("cost") || h.includes("compra"));
      let priceIdx = headerCols.findIndex(h => (h.includes("venda") || h.includes("preço") || h.includes("preco") || h.includes("price") || h.includes("pvp")) && !h.includes("custo"));
      let vatIdx = headerCols.findIndex(h => h.includes("iva") || h.includes("taxa") || h.includes("vat"));
      let stockIdx = headerCols.findIndex(h => (h.includes("stock") || h.includes("estoque") || h.includes("qtd") || h.includes("quantidade")) && !h.includes("mín") && !h.includes("min"));
      let minStockIdx = headerCols.findIndex(h => h.includes("mínimo") || h.includes("minimo") || h.includes("min"));
      let barcodeIdx = headerCols.findIndex(h => h.includes("barra") || h.includes("barcode") || h.includes("ean"));

      // Default fallback indexes if headers not present
      if (!hasHeader || nameIdx === -1) {
        nameIdx = 0; codeIdx = 1; catIdx = 2; suppIdx = 3; costIdx = 4; priceIdx = 5; vatIdx = 6; stockIdx = 7; minStockIdx = 8; barcodeIdx = 9;
      } else {
        if (codeIdx === -1) codeIdx = 1;
        if (catIdx === -1) catIdx = 2;
        if (suppIdx === -1) suppIdx = 3;
        if (costIdx === -1) costIdx = 4;
        if (priceIdx === -1) priceIdx = 5;
        if (vatIdx === -1) vatIdx = 6;
        if (stockIdx === -1) stockIdx = 7;
        if (minStockIdx === -1) minStockIdx = 8;
        if (barcodeIdx === -1) barcodeIdx = 9;
      }

      const startIndex = hasHeader ? 1 : 0;

      for (let i = startIndex; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line) continue;

        const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
        if (cols.length === 0 || !cols[nameIdx]) continue;

        const name = cols[nameIdx];
        const code = (codeIdx >= 0 ? cols[codeIdx] : "") || generateProductCode("PRD", i + 1);
        const category = (catIdx >= 0 ? cols[catIdx] : "") || "Geral";
        const supplier = (suppIdx >= 0 ? cols[suppIdx] : "") || "Fornecedor Local";
        const costPrice = costIdx >= 0 ? cleanNumber(cols[costIdx]) : 0;
        let salePrice = priceIdx >= 0 ? cleanNumber(cols[priceIdx]) : 0;
        if (salePrice <= 0 && costPrice > 0) {
          salePrice = Math.round(costPrice * 1.3);
        } else if (salePrice <= 0) {
          salePrice = 50; // Fallback valor padrão seguro para evitar produtos com preço 0
        }
        const vatRate = vatIdx >= 0 ? cleanNumber(cols[vatIdx]) || 16 : 16;
        const stock = stockIdx >= 0 ? cleanNumber(cols[stockIdx]) : 0;
        const minStock = minStockIdx >= 0 ? cleanNumber(cols[minStockIdx]) || 5 : 5;
        const barcode = barcodeIdx >= 0 ? cols[barcodeIdx] : "";

        const newProd: Product = {
          id: generateEntityId("imp"),
          name,
          code,
          category,
          supplier,
          costPrice,
          salePrice,
          vatRate,
          stock,
          minStock,
          barcode: barcode || undefined,
          emoji: "📦"
        };

        rows.push(newProd);
      }

      if (rows.length === 0) {
        throw new Error("Não foi possível extrair nenhum produto válido do ficheiro. Verifique o formato.");
      }

      rows.forEach(p => onAddProduct(p));

      onAddAuditLog(
        "Importação de Produtos CSV",
        "STOCK",
        `Ficheiro '${file.name}' processado. ${rows.length} produtos importados e integrados no catálogo por ${currentRole}.`
      );

      setImportedRowCount(rows.length);
      setImportStatus("success");
      if (onShowToast) onShowToast(`Importados com sucesso ${rows.length} produtos reais do ficheiro ${file.name}!`, "success", "Importação Concluída");
    } catch (err: any) {
      console.error("Erro na importação:", err);
      setImportStatus("idle");
      if (onShowToast) onShowToast(err?.message || "Falha ao processar o ficheiro.", "error", "Erro de Importação");
    }
  };

  // Automated replenishment order handler - Creates orders with "Status de Recebimento: Aguardando Envio" WITHOUT adding to final stock
  const handleConfirmReplenishOrder = (criticalAlertProducts: Product[]) => {
    setIsConfirmingReplenish(true);
    setTimeout(() => {
      const calcDefaultDueDate = () => {
        const d = new Date();
        d.setDate(d.getDate() + 15);
        return d.toISOString().split("T")[0];
      };

      const currentOrders = settings?.supplierOrders || [];
      const newOrders: SupplierOrder[] = criticalAlertProducts.map(p => {
        const replenishQty = Math.max(1, p.minStock * 2);
        const supplierMatch = registeredSuppliers.find(
          s => s.name.toLowerCase() === (p.supplier || "").toLowerCase() || s.id === p.supplier
        ) || registeredSuppliers[0] || { id: "supp-general", name: p.supplier || "Fornecedor Geral" };

        const cost = p.costPrice || 0;
        return {
          id: generateEntityId("order"),
          supplierId: supplierMatch.id,
          supplierName: supplierMatch.name,
          productId: p.id,
          productName: p.name,
          quantityRequested: replenishQty,
          unitCost: cost,
          totalValue: replenishQty * cost,
          status: "Pendente" as const,
          receiptStatus: "Aguardando Envio" as const,
          paymentStatus: "Pendente" as const,
          paymentDueDate: calcDefaultDueDate(),
          requestDate: new Date().toISOString().split("T")[0],
          isReplenishmentOrder: true
        };
      });

      // Crucial: Stock is NOT modified automatically! Products remain at their current stock levels.
      const updatedOrders = [...newOrders, ...currentOrders];
      onUpdateSettings?.({ supplierOrders: updatedOrders });

      onAddAuditLog(
        "Ordem de Reposição Gerada",
        "STOCK",
        `Gerada ordem de reposição para ${criticalAlertProducts.length} itens. Foram criados pedidos de compra com Status de Recebimento 'Aguardando Envio'. O stock final NÃO foi modificado e aguarda confirmação de entrega física.`
      );

      if (onShowToast) {
        onShowToast(`Ordem de reposição gerada com sucesso! ${criticalAlertProducts.length} pedidos emitidos com Status de Recebimento 'Aguardando Envio'. O stock só será atualizado após clicar em 'Confirmar Entrega'.`, "success", "Ordem de Reposição");
      }

      setReplenishSuccessMsg(`Ordem de reposição emitida com sucesso para ${criticalAlertProducts.length} produtos! O Status de Recebimento foi definido como 'Aguardando Envio'. O stock final NÃO foi alterado e só receberá as mercadorias quando a entrega física for confirmada pelo botão 'Confirmar Entrega'.`);
      setIsConfirmingReplenish(false);
      setIsReplenishmentModalOpen(false);

      // Clear success message after 7 seconds
      setTimeout(() => {
        setReplenishSuccessMsg("");
      }, 7000);
    }, 1200);
  };

  // Recharts aggregation data
  const chartsData = useMemo(() => {
    // 1. Stock cost vs sale value per category
    const categoryTotals: { [cat: string]: { name: string, Custo: number, Venda: number, Lucro: number } } = {};
    products.forEach(p => {
      if (!categoryTotals[p.category]) {
        categoryTotals[p.category] = { name: p.category, Custo: 0, Venda: 0, Lucro: 0 };
      }
      categoryTotals[p.category].Custo += p.costPrice * p.stock;
      categoryTotals[p.category].Venda += p.salePrice * p.stock;
      categoryTotals[p.category].Lucro += (p.salePrice - p.costPrice) * p.stock;
    });
    const categoryData = Object.values(categoryTotals);

    // 2. Critical products list
    const criticalProducts = products
      .filter(p => p.stock <= p.minStock)
      .slice(0, 8)
      .map(p => ({
        name: p.name.length > 18 ? p.name.substring(0, 16) + "..." : p.name,
        Stock: p.stock,
        Minimo: p.minStock
      }));

    // 3. Margin range statistics
    let highMargin = 0; // > 40%
    let midMargin = 0;  // 20% - 40%
    let lowMargin = 0;  // < 20%
    products.forEach(p => {
      const margin = p.costPrice > 0 ? ((p.salePrice - p.costPrice) / p.costPrice) * 100 : 0;
      if (margin > 40) highMargin++;
      else if (margin >= 20) midMargin++;
      else lowMargin++;
    });

    const marginPieData = [
      { name: "Margem Alta (>40%)", value: highMargin, color: "#10b981" },
      { name: "Margem Média (20-40%)", value: midMargin, color: "#f59e0b" },
      { name: "Margem Baixa (<20%)", value: lowMargin, color: "#ef4444" }
    ].filter(d => d.value > 0);

    return {
      categoryData,
      criticalProducts,
      marginPieData
    };
  }, [products]);

  // Memoized calculations for stock reports
  const reportsData = useMemo(() => {
    // Helper: calculate quantities sold per product within reportStartDate and reportEndDate
    const salesInPeriod: { [prodId: string]: { qty: number; totalSalesVal: number; vatVal: number; profitVal: number } } = {};
    
    transactions.forEach(t => {
      if (!t.timestamp) return;
      const tDate = t.timestamp.split("T")[0];
      if (tDate >= reportStartDate && tDate <= reportEndDate) {
        t.items.forEach(item => {
          if (!salesInPeriod[item.productId]) {
            salesInPeriod[item.productId] = { qty: 0, totalSalesVal: 0, vatVal: 0, profitVal: 0 };
          }
          salesInPeriod[item.productId].qty += item.quantity;
          salesInPeriod[item.productId].totalSalesVal += item.subtotal;
          salesInPeriod[item.productId].vatVal += item.vatAmount;
        });
      }
    });

    // Now build lists for each report type
    let filteredList = products.filter(p => {
      // Category filter
      if (reportCategory !== "Todos" && p.category !== reportCategory) return false;
      
      // Search query filter
      if (reportSearchQuery.trim() !== "") {
        const query = reportSearchQuery.toLowerCase();
        return (
          (p.name || "").toLowerCase().includes(query) ||
          (p.code || "").toLowerCase().includes(query) ||
          (p.supplier && p.supplier.toLowerCase().includes(query))
        );
      }
      return true;
    });

    if (reportType === "EXPIRATION") {
      // Filter products expiring between reportStartDate and reportEndDate
      filteredList = filteredList.filter(p => {
        if (!p.expiryDate) return false;
        return p.expiryDate >= reportStartDate && p.expiryDate <= reportEndDate;
      });
    } else if (reportType === "MOVEMENTS") {
      // Filter products that had sales (movements) in the period
      filteredList = filteredList.filter(p => {
        const sales = salesInPeriod[p.id];
        return sales && sales.qty > 0;
      });
    }

    // Map to final items with rich metrics
    const items = filteredList.map(p => {
      const sales = salesInPeriod[p.id] || { qty: 0, totalSalesVal: 0, vatVal: 0 };
      const currentStockValCost = p.stock * p.costPrice;
      const currentStockValSale = p.stock * p.salePrice;
      const currentStockProfitPotential = currentStockValSale - currentStockValCost;
      const marginPct = p.costPrice > 0 ? ((p.salePrice - p.costPrice) / p.costPrice) * 100 : 0;
      
      // Estimated profit of sales in period (based on cost price of sold qty)
      const costOfSales = sales.qty * p.costPrice;
      const salesProfit = sales.totalSalesVal - costOfSales;

      // Rotation / Giro rate: (qty sold in period) / (average stock or current stock + sold)
      const rotationRate = (p.stock + sales.qty) > 0 ? (sales.qty / (p.stock + sales.qty)) * 100 : 0;

      return {
        product: p,
        salesQty: sales.qty,
        salesValue: sales.totalSalesVal,
        salesVat: sales.vatVal,
        salesProfit,
        currentStockValCost,
        currentStockValSale,
        currentStockProfitPotential,
        marginPct,
        rotationRate
      };
    });

    // Summary Totals
    const totals = items.reduce((acc, item) => {
      acc.totalStockQty += item.product.stock;
      acc.totalCostVal += item.currentStockValCost;
      acc.totalSaleVal += item.currentStockValSale;
      acc.totalProfitPotential += item.currentStockProfitPotential;
      acc.totalSalesQty += item.salesQty;
      acc.totalSalesValue += item.salesValue;
      acc.totalSalesProfit += item.salesProfit;
      return acc;
    }, {
      totalStockQty: 0,
      totalCostVal: 0,
      totalSaleVal: 0,
      totalProfitPotential: 0,
      totalSalesQty: 0,
      totalSalesValue: 0,
      totalSalesProfit: 0
    });

    return {
      items,
      totals
    };
  }, [products, transactions, reportStartDate, reportEndDate, reportType, reportCategory, reportSearchQuery]);

  const handleExportReportPDF = async () => {
    const doc = new jsPDF();
    
    const logoData = await getBase64ImageFromUrl(settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
    if (logoData) {
      doc.addImage(logoData, "JPEG", 165, 8, 30, 30);
    }
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("SISTEMA GESTAO COMERCIAL - RELATORIO DE ESTOQUE", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    const reportTitle = 
      reportType === "VALUATION" ? "RELATÓRIO DE AVALIAÇÃO PATRIMONIAL DO ESTOQUE" :
      reportType === "MOVEMENTS" ? "RELATÓRIO DE MOVIMENTAÇÃO E GIRO DE ESTOQUE" :
      "RELATÓRIO DE VALIDADE E VENCIMENTOS DE LOTES";
    
    doc.text(`Tipo de Relatorio: ${reportTitle}`, 14, 22);
    doc.text(`Periodo: ${reportStartDate} ate ${reportEndDate}  |  Categoria: ${reportCategory}`, 14, 27);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 32);

    // Dynamic columns and rows based on reportType
    let headers: string[] = [];
    let body: any[][] = [];

    if (reportType === "VALUATION") {
      headers = ["Codigo", "Nome", "Categoria", "Stock", "Preco Custo", "Preco Venda", "Val. Custo", "Val. Venda", "Margem"];
      body = reportsData.items.map(item => [
        item.product.code,
        item.product.name,
        item.product.category,
        `${item.product.stock} un`,
        `${item.product.costPrice.toFixed(2)} ${currency}`,
        `${item.product.salePrice.toFixed(2)} ${currency}`,
        `${item.currentStockValCost.toFixed(2)} ${currency}`,
        `${item.currentStockValSale.toFixed(2)} ${currency}`,
        `${item.marginPct.toFixed(0)}%`
      ]);
    } else if (reportType === "MOVEMENTS") {
      headers = ["Codigo", "Nome", "Categoria", "Stock Atual", "Qtd Vendida", "Faturado", "Lucro Periodo", "Giro Estoque"];
      body = reportsData.items.map(item => [
        item.product.code,
        item.product.name,
        item.product.category,
        `${item.product.stock} un`,
        `${item.salesQty} un`,
        `${item.salesValue.toFixed(2)} ${currency}`,
        `${item.salesProfit.toFixed(2)} ${currency}`,
        `${item.rotationRate.toFixed(1)}%`
      ]);
    } else { // EXPIRATION
      headers = ["Codigo", "Nome", "Categoria", "Fornecedor", "Data Validade", "Qtd Stock", "Valor Custo", "Estado"];
      body = reportsData.items.map(item => {
        const daysLeft = Math.ceil((new Date(item.product.expiryDate || "").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const statusText = daysLeft < 0 ? "VENCIDO" : `${daysLeft} dias restantes`;
        return [
          item.product.code,
          item.product.name,
          item.product.category,
          item.product.supplier || "-",
          item.product.expiryDate || "-",
          `${item.product.stock} un`,
          `${item.currentStockValCost.toFixed(2)} ${currency}`,
          statusText
        ];
      });
    }

    // Call autotable
    autoTable(doc, {
      startY: 38,
      head: [headers],
      body: body,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22] }, // orange-500 equivalent
      foot: [
        reportType === "VALUATION" ? [
          "TOTAL", "", "", 
          `${reportsData.totals.totalStockQty} un`, "", "", 
          `${reportsData.totals.totalCostVal.toFixed(2)} ${currency}`, 
          `${reportsData.totals.totalSaleVal.toFixed(2)} ${currency}`, 
          `Lucro Potencial: ${reportsData.totals.totalProfitPotential.toFixed(2)} ${currency}`
        ] : reportType === "MOVEMENTS" ? [
          "TOTAL", "", "", `${reportsData.totals.totalStockQty} un`, 
          `${reportsData.totals.totalSalesQty} un`, 
          `${reportsData.totals.totalSalesValue.toFixed(2)} ${currency}`, 
          `${reportsData.totals.totalSalesProfit.toFixed(2)} ${currency}`, ""
        ] : [
          "TOTAL", "", "", "", "", 
          `${reportsData.totals.totalStockQty} un`, 
          `${reportsData.totals.totalCostVal.toFixed(2)} ${currency}`, ""
        ]
      ],
      footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" }
    });

    doc.save(`Relatorio_Estoque_${reportType.toLowerCase()}_${Date.now()}.pdf`);
    
    onAddAuditLog(
      "Exportar Relatório PDF",
      "STOCK",
      `Exportado relatório PDF (${reportType}) para o período de ${reportStartDate} a ${reportEndDate} por ${currentRole}.`
    );
  };

  const handleExportReportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];

    if (reportType === "VALUATION") {
      headers = ["CÓDIGO", "NOME", "CATEGORIA", "ESTOQUE ATUAL", "PREÇO CUSTO (MT)", "PREÇO VENDA (MT)", "VALOR TOTAL CUSTO (MT)", "VALOR TOTAL VENDA (MT)", "MARGEM (%)"];
      rows = reportsData.items.map(item => [
        item.product.code,
        item.product.name,
        item.product.category,
        item.product.stock.toString(),
        item.product.costPrice.toString(),
        item.product.salePrice.toString(),
        item.currentStockValCost.toString(),
        item.currentStockValSale.toString(),
        item.marginPct.toFixed(0)
      ]);
    } else if (reportType === "MOVEMENTS") {
      headers = ["CÓDIGO", "NOME", "CATEGORIA", "ESTOQUE ATUAL", "QUANTIDADE VENDIDA", "FATURADO (MT)", "LUCRO NO PERÍODO (MT)", "TAXA DE GIRO (%)"];
      rows = reportsData.items.map(item => [
        item.product.code,
        item.product.name,
        item.product.category,
        item.product.stock.toString(),
        item.salesQty.toString(),
        item.salesValue.toString(),
        item.salesProfit.toString(),
        item.rotationRate.toFixed(1)
      ]);
    } else { // EXPIRATION
      headers = ["CÓDIGO", "NOME", "CATEGORIA", "FORNECEDOR", "DATA VENCIMENTO", "ESTOQUE ATUAL", "VALOR CUSTO (MT)", "DIAS RESTANTES"];
      rows = reportsData.items.map(item => {
        const daysLeft = Math.ceil((new Date(item.product.expiryDate || "").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return [
          item.product.code,
          item.product.name,
          item.product.category,
          item.product.supplier || "-",
          item.product.expiryDate || "-",
          item.product.stock.toString(),
          item.currentStockValCost.toString(),
          daysLeft.toString()
        ];
      });
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_estoque_${reportType.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddAuditLog(
      "Exportar Relatório CSV",
      "STOCK",
      `Exportado planilha CSV do relatório de estoque (${reportType}) para o período de ${reportStartDate} a ${reportEndDate} por ${currentRole}.`
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Module Navtabs (List View vs Graphs/Analytics) */}
      <div className="flex border-b border-slate-200/80 pb-px mb-4 overflow-x-auto scrollbar-none gap-1">
        <button
          type="button"
          onClick={() => setActiveModuleTab("list")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "list"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <List className="w-4 h-4" />
          Lista de Inventário
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("charts")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "charts"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Análise de Stock & Gráficos
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("reports")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "reports"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Relatórios de Estoque
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("batches")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "batches"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Layers className="w-4 h-4" />
          Lotes, Validades & FIFO
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("branches")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "branches"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <MapPin className="w-4 h-4" />
          Filiais & Transferências
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("suppliers")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "suppliers"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Truck className="w-4 h-4" />
          Fornecedores & Pedidos
        </button>
        <button
          type="button"
          onClick={() => setActiveModuleTab("thresholds")}
          className={`px-3.5 py-2 text-xs font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer shrink-0 ${
            activeModuleTab === "thresholds"
              ? "border-blue-600 text-blue-600 bg-blue-50/30 dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Limiares & Alertas
        </button>
      </div>

      {/* CRITICAL STOCK LEVEL ALERT BANNER (ITEM: STOCK ALERT COMPONENT) */}
      {products.filter(p => p.stock <= 0.20 * p.minStock).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4.5 shadow-sm space-y-3.5 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-red-800 text-xs">ALERTA CRÍTICO: Stock Abaixo de 20% do Mínimo Declarado!</h4>
                <p className="text-[10.5px] text-red-650 mt-1 leading-relaxed">
                  Foram identificados <strong>{products.filter(p => p.stock <= 0.20 * p.minStock).length} produtos</strong> com níveis de estoque extremamente reduzidos ou totalmente esgotados. Providencie o reabastecimento imediato.
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setActiveModuleTab("suppliers");
                  setOrderSupplierId("");
                  setOrderProductId("");
                  setOrderQtyRequested(0);
                  setOrderUnitCost(0);
                  setOrderPaymentStatus("Pendente");
                  setOrderPaymentDueDate("");
                  setIsOrderFormOpen(true);
                }}
                className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs cursor-pointer transition whitespace-nowrap shadow-md shadow-orange-600/10 active:scale-95 flex items-center gap-1.5"
              >
                <Truck className="w-3.5 h-3.5" />
                Solicitar aos Fornecedores
              </button>
              <button
                onClick={() => setIsReplenishmentModalOpen(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs cursor-pointer transition whitespace-nowrap shadow-md shadow-red-600/10 active:scale-95 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "12s" }} />
                Gerar Ordem de Reposição
              </button>
            </div>
          </div>

          {/* List critical items in compact grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
            {products.filter(p => p.stock <= 0.20 * p.minStock).slice(0, 8).map(p => (
              <div key={p.id} className="bg-white border border-red-100 p-2.5 rounded-xl text-[10.5px] flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sm shrink-0">{p.emoji || "📦"}</span>
                  <div className="truncate">
                    <span className="font-bold text-slate-800 block truncate leading-tight" title={p.name}>{p.name}</span>
                    <span className="text-[9.5px] font-mono text-red-600 block mt-0.5">Estoque: {p.stock} un (Mín: {p.minStock})</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRequestStockFromSupplier(p)}
                  className="py-1 px-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition shrink-0 font-bold text-[9px] flex items-center gap-1"
                  title="Solicitar stock no Fornecedor"
                >
                  <Truck className="w-3 h-3" />
                  Solicitar
                </button>
              </div>
            ))}
            {products.filter(p => p.stock <= 0.20 * p.minStock).length > 8 && (
              <div className="bg-red-100/50 border border-red-200/40 p-2.5 rounded-xl text-[10.5px] flex items-center justify-center font-bold text-red-700 shadow-sm">
                +{products.filter(p => p.stock <= 0.20 * p.minStock).length - 8} mais itens...
              </div>
            )}
          </div>
        </div>
      )}

      {/* BATCH EXPIRY ALERT BANNER */}
      {expiringBatchesInfo.count > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4.5 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-4 duration-300 dark:bg-zinc-900/60 dark:border-amber-950/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 dark:bg-amber-950/40 dark:text-amber-400">
                <Calendar className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-extrabold text-amber-900 text-xs dark:text-amber-300">ALERTA DE VALIDADE: Lotes Próximos ao Vencimento ou Expirados!</h4>
                <p className="text-[10.5px] text-amber-800 mt-1 leading-relaxed dark:text-amber-400/90">
                  Existem <strong>{expiringBatchesInfo.count} lotes ativos</strong> com menos de 30 dias de validade ou já vencidos. Considere realizar promoções, rebaixar ou dar saída programada.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setActiveModuleTab("batches")}
              className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold py-2 px-4 rounded-xl text-xs cursor-pointer transition whitespace-nowrap shadow-md shadow-amber-600/10 active:scale-95 flex items-center gap-1.5 dark:bg-amber-700 dark:hover:bg-amber-800"
            >
              <Layers className="w-3.5 h-3.5" />
              Gerenciar Lotes & Validades
            </button>
          </div>

          {/* List expiring batches in a beautiful compact grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
            {expiringBatchesInfo.all.slice(0, 8).map((batch: any) => {
              const expiry = new Date(batch.expiryDate);
              const today = new Date();
              const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isExpired = daysLeft < 0;

              return (
                <div key={batch.id} className={`p-3 rounded-xl border flex flex-col justify-between gap-1.5 transition ${
                  isExpired 
                    ? "bg-red-50/50 border-red-200 text-red-950 dark:bg-red-950/20 dark:border-red-900/50" 
                    : "bg-white border-amber-200 text-amber-950 dark:bg-zinc-950 dark:border-amber-950/40"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-[11px] truncate dark:text-white" title={batch.productName}>
                      {batch.productName}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                      isExpired 
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-350" 
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-350"
                    }`}>
                      {isExpired ? "Expirado" : `${daysLeft}d rest.`}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span>Lote: <strong className="text-slate-700 dark:text-zinc-300">{batch.batchCode}</strong></span>
                    <span>Qtd: <strong className="text-slate-700 dark:text-zinc-300">{batch.quantity} un</strong></span>
                  </div>
                </div>
              );
            })}
            
            {expiringBatchesInfo.count > 8 && (
              <button 
                onClick={() => setActiveModuleTab("batches")}
                className="bg-amber-100/50 border border-amber-200 p-3 rounded-xl text-[11px] flex items-center justify-center font-bold text-amber-800 hover:bg-amber-100 transition cursor-pointer dark:bg-amber-950/20 dark:border-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/35"
              >
                +{expiringBatchesInfo.count - 8} mais lotes críticos...
              </button>
            )}
          </div>
        </div>
      )}

      {/* REPLENISH SUCCESS TOAST NOTICE */}
      {replenishSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-xs font-semibold flex items-center gap-2 shadow-sm animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{replenishSuccessMsg}</span>
        </div>
      )}

      {/* REPLENISHMENT PURCHASE ORDER DRAFT MODAL */}
      {isReplenishmentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-slate-950 p-5 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-extrabold text-sm leading-none">Rascunho de Ordem de Compra de Reposição</h3>
                  <span className="text-[10px] font-mono text-slate-400 mt-1 block">OST-PURCHASE-ORDER-DRAFT-2026</span>
                </div>
              </div>
              <button 
                onClick={() => setIsReplenishmentModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto text-xs text-slate-600 leading-relaxed">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block font-mono">EMITENTE</span>
                  <span className="font-bold text-slate-800 block">{settings?.companyName || "Indisponível"}</span>
                  <span className="text-slate-500 block">{settings?.storeAddress || settings?.companyAddress || "Indisponível"} | NUIT: {settings?.companyNuit || "Indisponível"}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block font-mono">DATA DE EMISSÃO</span>
                  <span className="font-mono text-slate-800 font-bold block">{new Date().toLocaleDateString()}</span>
                  <span className="text-slate-500 block">Moeda de Liquidação: Metical (MT)</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block font-mono">Lista de Itens Solicitados</span>
                
                <div className="border border-slate-150 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px] leading-normal border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <th className="p-2.5">CÓDIGO</th>
                        <th className="p-2.5">PRODUTO</th>
                        <th className="p-2.5">FORNECEDOR</th>
                        <th className="p-2.5 text-center">STOCK ATUAL</th>
                        <th className="p-2.5 text-center">QTD REPOSIÇÃO</th>
                        <th className="p-2.5 text-right">PREÇO CUSTO</th>
                        <th className="p-2.5 text-right">VALOR BRUTO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.filter(p => p.stock <= 0.20 * p.minStock).map(p => {
                        const replenishQty = p.minStock * 2;
                        const lineCost = replenishQty * p.costPrice;
                        return (
                          <tr key={p.id}>
                            <td className="p-2.5 font-mono text-slate-400">{p.code}</td>
                            <td className="p-2.5 font-bold text-slate-800">{p.name}</td>
                            <td className="p-2.5 text-slate-500">{p.supplier || "Geral Central"}</td>
                            <td className="p-2.5 text-center text-red-650 font-semibold">{p.stock}</td>
                            <td className="p-2.5 text-center font-bold text-slate-800">{replenishQty}</td>
                            <td className="p-2.5 text-right font-mono">{p.costPrice.toLocaleString()} MT</td>
                            <td className="p-2.5 text-right font-bold text-slate-800 font-mono">{lineCost.toLocaleString()} MT</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order total costs */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-700">Total Geral da Ordem</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Calculado automaticamente com base nos preços de custo de contrato dos fornecedores.</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-850 font-mono">
                    {products.filter(p => p.stock <= 0.20 * p.minStock).reduce((sum, p) => sum + (p.minStock * 2 * p.costPrice), 0).toLocaleString()} MT
                  </span>
                </div>
              </div>

              {/* Strict stock integrity notice */}
              <div className="bg-amber-50 border border-amber-250 p-3.5 rounded-xl text-amber-900 text-[11px] leading-relaxed dark:bg-amber-950/25 dark:border-amber-900/50 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Controle e Segurança de Entrada de Stock:</strong>
                  Ao emitir esta ordem, as solicitações serão registradas com Status de Recebimento <strong>"Aguardando Envio"</strong>. Os produtos <strong>NÃO</strong> serão adicionados automaticamente ao stock final. A entrada no stock só será concluída quando o fornecedor realizar a entrega física e você clicar no botão <strong>"Confirmar Entrega"</strong>.
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3.5">
              <button
                type="button"
                onClick={() => setIsReplenishmentModalOpen(false)}
                className="py-2 px-4 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-100 transition"
              >
                Descartar Rascunho
              </button>
              <button
                type="button"
                onClick={() => handleConfirmReplenishOrder(products.filter(p => p.stock <= 0.20 * p.minStock))}
                disabled={isConfirmingReplenish}
                className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold py-2 px-5 rounded-xl text-xs cursor-pointer transition shadow-md shadow-orange-500/10 disabled:opacity-50"
              >
                {isConfirmingReplenish ? "Emitindo Pedidos de Reposição..." : "Emitir Ordem de Reposição (Aguardando Envio)"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PENDING ORDERS & REPLENISHMENTS BANNER (Aguardando Entrega Física) */}
      {supplierOrders.some((o: any) => o.status === "Pendente" && o.receiptStatus !== "Entregue") && (
        <div className="bg-gradient-to-r from-sky-50 via-sky-50/80 to-blue-50/60 border border-sky-200 rounded-2xl p-4.5 shadow-sm space-y-3 animate-in fade-in duration-300 dark:bg-zinc-900/60 dark:border-sky-950/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 dark:bg-sky-950/40 dark:text-sky-400">
                <Truck className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sky-950 text-xs dark:text-sky-300">
                    STATUS DE RECEBIMENTO: Encomendas e Ordens de Reposição Aguardando Entrega
                  </h4>
                  <span className="bg-sky-200 text-sky-900 text-[10px] font-black px-2 py-0.5 rounded-full dark:bg-sky-900 dark:text-sky-200">
                    {supplierOrders.filter((o: any) => o.status === "Pendente" && o.receiptStatus !== "Entregue").length} aguardando
                  </span>
                </div>
                <p className="text-[10.5px] text-sky-850 mt-1 leading-relaxed dark:text-sky-400/90">
                  Os produtos encomendados aos fornecedores <strong>não entram no stock final</strong> até a mercadoria ser recebida fisicamente. Quando os produtos chegarem, clique em <strong>Confirmar Entrega</strong> para dar entrada no stock.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveModuleTab("suppliers");
                setSupplierSubTab("orders");
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold py-2 px-4 rounded-xl text-xs cursor-pointer transition whitespace-nowrap shadow-md shadow-sky-600/10 active:scale-95 flex items-center gap-1.5"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Painel de Fornecedores & Encomendas
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
            {supplierOrders
              .filter((o: any) => o.status === "Pendente" && o.receiptStatus !== "Entregue")
              .slice(0, 4)
              .map((order: any) => (
                <div key={order.id} className="bg-white border border-sky-150 p-3 rounded-xl shadow-xs flex flex-col justify-between gap-2.5 dark:bg-zinc-950 dark:border-sky-900/40">
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="font-extrabold text-[11px] text-slate-800 truncate dark:text-zinc-100" title={order.productName}>
                        {order.productName}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                        order.receiptStatus === "Em Trânsito"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {order.receiptStatus || "Aguardando Envio"}
                      </span>
                    </div>
                    <span className="text-[9.5px] text-slate-500 font-mono block mt-1">
                      Fornecedor: <strong>{order.supplierName}</strong>
                    </span>
                    <span className="text-[10px] text-slate-700 font-mono font-bold block mt-0.5 dark:text-zinc-300">
                      Qtd: {order.quantityRequested} un • {(order.totalValue).toLocaleString()} MT
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenDeliveryConfirmModal(order)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold py-1.5 px-2.5 rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                    title="Confirmar entrega física e lançar produtos no stock final"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Confirmar Entrega</span>
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 1. Resumo KPI Cards Group */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition">
          <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Produtos</p>
          <p className="text-xl font-bold text-slate-800 dark:text-zinc-100 mt-1 font-mono">{stats.total}</p>
          <span className="text-[9px] text-slate-400 font-medium">Itens cadastrados</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition">
          <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Investimento</p>
          <p className="text-xl font-bold text-orange-600 dark:text-amber-400 mt-1 font-mono">
            {stats.totalCost.toLocaleString()} <span className="text-[10px]">{currency}</span>
          </p>
          <span className="text-[9px] text-slate-400 font-medium">Custo total em stock</span>
        </div>

        <button 
          onClick={() => { setStockFilter("LOW_STOCK"); setActiveModuleTab("list"); }}
          className={`p-4 rounded-2xl border text-left shadow-sm hover:shadow-md transition cursor-pointer ${
            stockFilter === "LOW_STOCK" ? "bg-amber-50/50 border-amber-300" : "bg-white border-slate-200/60"
          }`}
        >
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Stock Baixo</p>
            {stats.lowStock > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
          </div>
          <p className="text-xl font-bold text-amber-600 mt-1 font-mono">{stats.lowStock}</p>
          <span className="text-[9px] text-slate-400 font-medium">Próximos do limite</span>
        </button>

        <button 
          onClick={() => { setStockFilter("OUT_OF_STOCK"); setActiveModuleTab("list"); }}
          className={`p-4 rounded-2xl border text-left shadow-sm hover:shadow-md transition cursor-pointer ${
            stockFilter === "OUT_OF_STOCK" ? "bg-red-50/50 border-red-300" : "bg-white border-slate-200/60"
          }`}
        >
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Esgotados</p>
            {stats.outOfStock > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
          </div>
          <p className="text-xl font-bold text-red-600 mt-1 font-mono">{stats.outOfStock}</p>
          <span className="text-[9px] text-slate-400 font-medium">Stock zerado</span>
        </button>

        <button 
          onClick={() => { setStockFilter("EXPIRED"); setActiveModuleTab("list"); }}
          className={`p-4 rounded-2xl border text-left shadow-sm hover:shadow-md transition cursor-pointer ${
            stockFilter === "EXPIRED" ? "bg-purple-50/50 border-purple-300" : "bg-white border-slate-200/60"
          }`}
        >
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Vencimento</p>
            {stats.upcomingExpiry > 0 && <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>}
          </div>
          <p className="text-xl font-bold text-purple-600 mt-1 font-mono">{stats.upcomingExpiry}</p>
          <span className="text-[9px] text-slate-400 font-medium">Prazo &lt; 30 dias</span>
        </button>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition">
          <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Potencial Venda</p>
          <p className="text-xl font-bold text-emerald-600 mt-1 font-mono">
            {stats.totalSale.toLocaleString()} <span className="text-[10px]">{currency}</span>
          </p>
          <span className="text-[9px] text-emerald-500 font-bold">+{stats.potentialProfit.toLocaleString()} MT lucro</span>
        </div>

      </div>

      {activeModuleTab === "list" && (
        <>
          {/* Main Action Bar */}
          <div className="flex flex-col md:flex-row gap-3.5 justify-between items-start md:items-center">
            
            {/* Quick stock states selector buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStockFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                  stockFilter === "ALL"
                    ? "bg-slate-900 border-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                }`}
              >
                Todos ({products.length})
              </button>
              
              <button
                onClick={() => setStockFilter("LOW_STOCK")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border flex items-center gap-1.5 transition-colors ${
                  stockFilter === "LOW_STOCK"
                    ? "bg-amber-600 border-amber-600 text-white"
                    : "bg-white border-slate-200 text-amber-700 hover:bg-amber-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-amber-400"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Stock Baixo ({stats.lowStock})
              </button>

              <button
                onClick={() => setStockFilter("OUT_OF_STOCK")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border flex items-center gap-1.5 transition-colors ${
                  stockFilter === "OUT_OF_STOCK"
                    ? "bg-red-600 border-red-600 text-white"
                    : "bg-white border-slate-200 text-red-650 hover:bg-red-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-red-400"
                }`}
              >
                Esgotados ({stats.outOfStock})
              </button>

              <button
                onClick={() => setStockFilter("EXPIRED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border flex items-center gap-1.5 transition-colors ${
                  stockFilter === "EXPIRED"
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "bg-white border-slate-200 text-purple-700 hover:bg-purple-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-purple-400"
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                Vencimento ({stats.upcomingExpiry})
              </button>
            </div>

            {/* Main top buttons */}
            <div className="flex gap-2.5 items-center w-full md:w-auto">
              <button
                onClick={() => setShowImportPanel(!showImportPanel)}
                className="flex-1 md:flex-initial bg-slate-100 hover:bg-slate-200 py-2 px-3.5 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <Upload className="w-4 h-4 shrink-0" />
                Importar Planilha
              </button>

              {canMutate && (
                <button
                  onClick={() => setShowBulkMarkupModal(true)}
                  className="flex-1 md:flex-initial bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 py-2 px-3.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/15 cursor-pointer transition"
                  title="Calcular preços e aplicar percentual de markup em lote a todo o inventário"
                >
                  <Percent className="w-4 h-4 shrink-0" />
                  Reajuste de Preços (Markup)
                </button>
              )}

              {canMutate ? (
                <button
                  onClick={openCreateForm}
                  className="flex-1 md:flex-initial bg-orange-500 hover:bg-orange-600 py-2 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/10 cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  Novo Produto
                </button>
              ) : (
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 bg-slate-50 border p-2 rounded-lg leading-none dark:bg-zinc-900 dark:border-zinc-800">
                  ⚠️ Supervisor ou Admin
                </div>
              )}
            </div>

          </div>

          {/* Excel Import Panel */}
          {showImportPanel && (
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl animate-in slide-in-from-top duration-200 space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-xs dark:text-zinc-200">Importação de Ficheiros XLS / CSV</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Carregue catálogos de fornecedores em massa com preços e quantidades do stock.</p>
                </div>
                <button 
                  onClick={() => { setShowImportPanel(false); setImportStatus("idle"); }}
                  className="text-slate-450 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Fechar Painel X
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  onClick={() => document.getElementById("native-excel-picker")?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl bg-white p-5 text-center space-y-2 flex flex-col justify-center items-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/5 transition-colors dark:bg-zinc-950 dark:border-zinc-800"
                >
                  <input 
                    id="native-excel-picker"
                    type="file"
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleParseAndImportFile(file);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Upload className="w-8 h-8 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Clique para selecionar ficheiro CSV / TXT real</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Lê e importa produtos reais com nomes, preços e stocks</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between dark:bg-zinc-950 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Modelo Oficial</span>
                    <h4 className="text-xs font-bold text-slate-700 mt-1 dark:text-zinc-300">Descarregar Modelo CSV</h4>
                    <p className="text-[11px] text-slate-400">Baixe a planilha modelo pré-formatada para preencher os seus produtos reais.</p>
                  </div>

                  {importStatus === "idle" ? (
                    <button
                      type="button"
                      onClick={handleDownloadCSVTemplate}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-3 rounded-lg mt-3 cursor-pointer text-center transition flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar Template CSV
                    </button>
                  ) : importStatus === "processing" ? (
                    <div className="text-xs font-bold text-orange-600 flex items-center gap-2 mt-3">
                      <span className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>
                      Processando e importando ficheiro real...
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 text-green-800 text-xs p-2 rounded-lg mt-3 flex items-center gap-2 dark:bg-green-950/20 dark:border-green-800/50 dark:text-green-400">
                      <CheckCircle className="w-4 h-4 text-green-700 shrink-0" />
                      <div>
                        <p className="font-bold">Ficheiro Processado!</p>
                        <p className="text-[10px]">+{importedRowCount} produtos reais importados com sucesso.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Advanced Search / Filter Box */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
            
            {/* Search Tool Line */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between dark:bg-zinc-900 dark:border-zinc-800">
              <div className="relative w-full md:flex-1 max-w-xl">
                <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisa por Nome, SKU/Código, Categoria ou Fornecedor..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2 text-sm outline-none focus:border-orange-500 dark:bg-zinc-950 dark:border-zinc-850"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpar pesquisa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2 w-full md:w-auto items-center">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 cursor-pointer transition ${
                    showAdvancedFilters || minMarginFilter > 0 || selectedSupplier !== "Todos"
                      ? "bg-orange-50 border-orange-300 text-orange-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filtros Avançados
                  {(minMarginFilter > 0 || selectedSupplier !== "Todos") && <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>}
                </button>

                <div className="flex gap-1.5 items-center flex-1 md:flex-initial">
                  <select
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                    className="bg-white border rounded-xl py-2 px-3 text-xs font-medium text-slate-600 cursor-pointer outline-none focus:border-orange-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <option value="Todos">Categoria: Todas</option>
                    {categoriesList.filter(c => c !== "Todos").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Advanced Filters Expandable Container */}
            {showAdvancedFilters && (
              <div className="bg-slate-50/50 p-4 border-b border-slate-150 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-150 dark:bg-zinc-950 dark:border-zinc-800">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor</label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => { setSelectedSupplier(e.target.value); setCurrentPage(1); }}
                    className="bg-white border rounded-xl p-2 text-xs w-full outline-none"
                  >
                    <option value="Todos">Todos os Fornecedores</option>
                    {suppliersList.filter(s => s !== "Todos").map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                    <span>Margem Mínima de Lucro</span>
                    <span className="font-mono text-orange-600">{minMarginFilter}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={minMarginFilter}
                    onChange={(e) => { setMinMarginFilter(Number(e.target.value)); setCurrentPage(1); }}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div className="flex items-end pb-1.5">
                  <button
                    onClick={() => {
                      setSelectedSupplier("Todos");
                      setSelectedCategory("Todos");
                      setMinMarginFilter(0);
                      setStockFilter("ALL");
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="text-xs text-red-600 hover:text-red-700 font-bold transition flex items-center gap-1.5 cursor-pointer ml-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Limpar Filtros
                  </button>
                </div>
              </div>
            )}

            {/* Bulk Action Bar (Visible when items selected) */}
            {selectedProductIds.length > 0 && (
              <div className="bg-orange-50 border-b border-orange-100 p-3 px-4 flex items-center justify-between animate-in slide-in-from-top duration-200 dark:bg-amber-950/20 dark:border-amber-900/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-orange-850 dark:text-amber-300">
                    {selectedProductIds.length} produto(s) selecionado(s)
                  </span>
                  <button
                    onClick={() => setSelectedProductIds([])}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold underline cursor-pointer"
                  >
                    Desmarcar todos
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleBulkExport}
                    className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 flex items-center gap-1.5 cursor-pointer dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar Lote
                  </button>
                  {canMutate && (
                    <button
                      onClick={() => setShowBulkMarkupModal(true)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs py-1.5 px-3 rounded-lg border border-amber-200 flex items-center gap-1.5 cursor-pointer dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300"
                      title="Calcular e aplicar markup aos produtos selecionados"
                    >
                      <Percent className="w-3.5 h-3.5" />
                      Reajustar Preços (% Markup)
                    </button>
                  )}
                  {canMutate && (
                    <button
                      onClick={handleBulkDelete}
                      className="bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-red-200 flex items-center gap-1.5 cursor-pointer dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Lote
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Main Table Container (Sticky Headers & Custom Scrollbar) */}
            <div className="overflow-x-auto max-h-[550px] relative scrollbar-thin">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wide text-[9.5px] sticky top-0 z-10 dark:bg-zinc-950 dark:border-zinc-800">
                    <th className="p-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={paginatedProducts.length > 0 && selectedProductIds.length === paginatedProducts.length}
                        onChange={handleToggleSelectAll}
                        className="rounded cursor-pointer accent-orange-500"
                      />
                    </th>
                    <th className="p-3.5 text-center w-12">IMAGEM</th>
                    <th className="p-3.5 cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("code")}>
                      <div className="flex items-center gap-1">
                        CÓDIGO
                        {sortField === "code" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1">
                        PRODUTO
                        {sortField === "name" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("category")}>
                      <div className="flex items-center gap-1">
                        CATEGORIA
                        {sortField === "category" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 text-right cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("costPrice")}>
                      <div className="flex items-center justify-end gap-1">
                        PREÇOS (LUCRO)
                        {sortField === "costPrice" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 text-center cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("stock")}>
                      <div className="flex items-center justify-center gap-1">
                        ESTADO STOCK
                        {sortField === "stock" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 text-right cursor-pointer hover:bg-slate-150 select-none transition" onClick={() => handleSort("stockValue")}>
                      <div className="flex items-center justify-end gap-1">
                        VALOR EM STOCK
                        {sortField === "stockValue" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="p-3.5 text-center w-24">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-800">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">Nenhum produto atendeu aos critérios comerciais de pesquisa selecionados.</td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => {
                      const isOutOfStock = p.stock <= 0;
                      const isLowStock = p.stock > 0 && p.stock <= p.minStock;
                      
                      // Margin profit calculation
                      const safeCost = isNaN(Number(p.costPrice)) ? 0 : Number(p.costPrice);
                      const safeSale = isNaN(Number(p.salePrice)) ? 0 : Number(p.salePrice);
                      const safeStock = isNaN(Number(p.stock)) ? 0 : Number(p.stock);
                      const profitAmt = safeSale - safeCost;
                      const profitPct = safeCost > 0 ? Math.round((profitAmt / safeCost) * 100) : 0;

                      // Stock ratio for progress bar
                      const ratio = Math.min(100, (p.stock / Math.max(p.minStock * 3, p.stock || 1)) * 100);

                      // Date Validity calculations
                      let expiryBadge = null;
                      if (p.expiryDate) {
                        const daysLeft = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        if (daysLeft < 0) {
                          expiryBadge = <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-red-100 text-red-700 uppercase">Vencido</span>;
                        } else if (daysLeft <= 30) {
                          expiryBadge = <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-700">Vence {daysLeft}d</span>;
                        } else {
                          expiryBadge = <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-500">Val: {daysLeft}d</span>;
                        }
                      }

                      // Check for batches of this product that are expiring soon or expired
                      const productBatches = (settings?.batches || []).filter((b: any) => b.productId === p.id && b.quantity > 0);
                      const hasExpiredBatch = productBatches.some((b: any) => {
                        const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return daysLeft < 0;
                      });
                      const hasExpiringBatch = productBatches.some((b: any) => {
                        const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return daysLeft >= 0 && daysLeft <= 30;
                      });

                      let batchExpiryBadge = null;
                      if (hasExpiredBatch) {
                        batchExpiryBadge = (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-100 text-red-800 border border-red-200 animate-pulse flex items-center gap-0.5"
                            title="Este produto possui lotes ativos expirados no inventário!"
                          >
                            LOTE EXPIRADO ⚠️
                          </span>
                        );
                      } else if (hasExpiringBatch) {
                        batchExpiryBadge = (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5"
                            title="Este produto possui lotes ativos que vencem em menos de 30 dias!"
                          >
                            LOTE CRÍTICO ⏳
                          </span>
                        );
                      }

                      return (
                        <tr 
                          key={p.id} 
                          className="hover:bg-slate-50/40 transition group dark:hover:bg-zinc-800/40"
                        >
                          {/* Selection Checkbox */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(p.id)}
                              onChange={() => handleToggleSelectProduct(p.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded cursor-pointer accent-orange-500"
                            />
                          </td>

                          {/* Image or emoji avatar */}
                          <td className="p-3 text-center">
                            <div className="w-9 h-9 mx-auto rounded-xl flex items-center justify-center border border-slate-200 bg-slate-50 select-none overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
                              {p.image ? (
                                <img 
                                  src={p.image} 
                                  alt={p.name} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    // Fallback to emoji if image fails
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="text-lg">{p.emoji || "📦"}</span>
                              )}
                            </div>
                          </td>

                          {/* Code */}
                          <td className="p-3 font-mono text-slate-500 font-semibold dark:text-zinc-400">{p.code}</td>

                          {/* Product Details & Click to open slide panel */}
                          <td 
                            className="p-3 cursor-pointer"
                            onClick={() => setDetailedProduct(p)}
                          >
                            <div className="font-bold text-slate-850 dark:text-zinc-100 group-hover:text-orange-600 transition-colors flex items-center gap-1.5">
                              {p.name}
                              <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                              <span>SKU: {p.code}</span>
                              {p.supplier && <span>• F: {p.supplier}</span>}
                              {expiryBadge}
                              {batchExpiryBadge}
                            </div>
                          </td>

                          {/* Category */}
                          <td className="p-3 font-mono text-slate-450 dark:text-zinc-400">{p.category}</td>

                          {/* Pricing details */}
                          <td className="p-3 text-right">
                            <div className="font-mono text-slate-600 dark:text-zinc-450 text-[10px]">C: {safeCost.toLocaleString()} MT</div>
                            <div className="font-mono font-bold text-slate-800 dark:text-zinc-200">V: {safeSale.toLocaleString()} MT</div>
                            <div className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded-full inline-block mt-0.5 dark:bg-emerald-950/20 dark:text-emerald-400">
                              Lucro: {profitAmt.toLocaleString()} MT ({profitPct}%)
                            </div>
                          </td>

                          {/* Quantities & horizontal progress bar */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-between gap-2 max-w-[130px] mx-auto">
                              <span className={`font-mono font-bold text-xs ${
                                isOutOfStock 
                                  ? "text-red-700 bg-red-50 px-1 rounded" 
                                  : isLowStock 
                                  ? "text-amber-700 bg-amber-50 px-1 rounded" 
                                  : "text-slate-800 dark:text-zinc-200"
                              }`}>
                                {safeStock} un
                              </span>
                              
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                                isOutOfStock ? "bg-red-100 text-red-700" :
                                isLowStock ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {isOutOfStock ? "🔴 Esgotado" : isLowStock ? "🟠 Baixo" : "🟢 OK"}
                              </span>
                            </div>

                            {/* Horizontal stock level slider */}
                            <div className="w-full max-w-[130px] bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden mx-auto dark:bg-zinc-800">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isOutOfStock ? "bg-red-500 w-0" :
                                  isLowStock ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                            <p className="text-[8px] text-slate-400 font-mono mt-0.5">Min Alerta: {p.minStock}</p>
                          </td>

                          {/* Total Financial Value in stock */}
                          <td className="p-3 text-right font-mono">
                            <div className="font-bold text-slate-700 dark:text-zinc-200">{(safeStock * safeSale).toLocaleString()} MT</div>
                            <div className="text-[9px] text-slate-400">Custo: {(safeStock * safeCost).toLocaleString()} MT</div>
                          </td>

                          {/* Custom context-dropdown actions menu */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5 relative">
                              
                              {/* Quick Adjustment Buttons inline */}
                              <button
                                onClick={() => { setAdjustingProduct(p); setAdjustmentType("IN"); }}
                                className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition"
                                title="Dar Entrada"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setAdjustingProduct(p); setAdjustmentType("OUT"); }}
                                className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                                title="Dar Saída"
                              >
                                <MinusCircle className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Dropdown Menu button */}
                              <button
                                onClick={() => setOpenDropdownId(openDropdownId === p.id ? null : p.id)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer dark:hover:bg-zinc-750"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {/* Dropdown Floating Window */}
                              {openDropdownId === p.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setOpenDropdownId(null)}></div>
                                  <div className="absolute right-0 top-7 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-left text-xs animate-in fade-in duration-100 dark:bg-zinc-900 dark:border-zinc-800">
                                    <button
                                      onClick={() => { setDetailedProduct(p); setOpenDropdownId(null); }}
                                      className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Ver Detalhes
                                    </button>

                                    <button
                                      onClick={() => { handleSendWhatsAppStockAlert(p); setOpenDropdownId(null); }}
                                      className="w-full px-3 py-1.5 hover:bg-slate-50 text-emerald-700 font-semibold flex items-center gap-2 dark:text-emerald-400 dark:hover:bg-zinc-800"
                                      title="Notificar stock deste produto por WhatsApp"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                      Notificar Stock
                                    </button>

                                    <button
                                      onClick={() => { setFlyerProduct(p); setIsFlyerGeneratorOpen(true); setOpenDropdownId(null); }}
                                      className="w-full px-3 py-1.5 hover:bg-slate-50 text-orange-700 font-semibold flex items-center gap-2 dark:text-orange-400 dark:hover:bg-zinc-800"
                                      title="Gerar cartaz publicitário para este produto"
                                    >
                                      <Sparkles className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                                      Gerar Cartaz Promo
                                    </button>
                                    
                                    {canMutate && (
                                      <>
                                        <button
                                          onClick={() => { openEditForm(p); setOpenDropdownId(null); }}
                                          className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                          Editar
                                        </button>
                                        <button
                                          onClick={() => { handleDuplicateProduct(p); setOpenDropdownId(null); }}
                                          className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                          Duplicar
                                        </button>
                                        <div className="border-t border-slate-100 my-1 dark:border-zinc-800"></div>
                                        <button
                                          onClick={() => { handleDeleteProductClick(p.id); setOpenDropdownId(null); }}
                                          className="w-full px-3 py-1.5 hover:bg-red-50 text-red-600 font-bold flex items-center gap-2 dark:hover:bg-red-950/35"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          Eliminar
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 3. Paginação Profissional com Ellipsis & Jump to Page */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between text-xs text-slate-500 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Mostrando <span className="font-bold text-slate-700 dark:text-zinc-300">{processedProducts.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(processedProducts.length, currentPage * itemsPerPage)}</span> de <span className="font-bold text-slate-700 dark:text-zinc-300">{processedProducts.length}</span> produtos
                </span>
                
                <div className="flex items-center gap-1.5">
                  <span>Itens/página:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="bg-white border rounded px-2 py-1 text-xs outline-none dark:bg-zinc-950 dark:border-zinc-800"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              {/* Page Navigation with Ellipsis */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 border rounded bg-white font-bold hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer dark:bg-zinc-950 dark:border-zinc-850"
                >
                  &lt; Anterior
                </button>

                {(() => {
                  const getPageNumbers = (current: number, total: number) => {
                    if (total <= 7) {
                      return Array.from({ length: total }, (_, i) => i + 1);
                    }
                    if (current <= 4) {
                      return [1, 2, 3, 4, 5, '...', total];
                    }
                    if (current >= total - 3) {
                      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
                    }
                    return [1, '...', current - 1, current, current + 1, '...', total];
                  };

                  return getPageNumbers(currentPage, totalPages).map((p, idx) => 
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-slate-400 font-bold">...</span>
                    ) : (
                      <button
                        key={`page-${p}`}
                        onClick={() => setCurrentPage(Number(p))}
                        className={`px-3 py-1 border rounded font-bold cursor-pointer transition ${
                          currentPage === p
                            ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                            : "bg-white hover:bg-slate-50 dark:bg-zinc-950 dark:border-zinc-850 text-slate-600"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}

                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2.5 py-1 border rounded bg-white font-bold hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer dark:bg-zinc-950 dark:border-zinc-850"
                >
                  Seguinte &gt;
                </button>

                {/* Jump to page */}
                {totalPages > 5 && (
                  <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 dark:border-zinc-800">
                    <span className="text-[10px]">Ir para:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      defaultValue={currentPage}
                      key={currentPage}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (!isNaN(val) && val >= 1 && val <= totalPages) {
                            setCurrentPage(val);
                          }
                        }
                      }}
                      className="w-12 bg-white border rounded px-1.5 py-0.5 text-xs text-center font-mono outline-none dark:bg-zinc-950 dark:border-zinc-800"
                      title="Digite o número da página e pressione Enter"
                    />
                  </div>
                )}
              </div>
            </div>

          </div>
        </>
      )}

      {/* Sub-tab Charts and Analytics Dashboard */}
      {activeModuleTab === "charts" && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Value by Category BarChart */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <h3 className="font-bold text-slate-800 text-sm mb-1.5 dark:text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-4.5 h-4.5 text-orange-500" />
                Valor Comercial de Stock por Categoria (MT)
              </h3>
              <p className="text-xs text-slate-400 mb-4">Investimento (Preço de Custo) vs Retorno Potencial (Preço de Venda).</p>
              
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartsData.categoryData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip cursor={{ fill: 'rgba(244, 245, 246, 0.4)' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Custo" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Custo Total" />
                    <Bar dataKey="Venda" fill="#f97316" radius={[4, 4, 0, 0]} name="Venda Estimada" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Profit margin donut distribution chart */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <h3 className="font-bold text-slate-800 text-sm mb-1.5 dark:text-zinc-200 flex items-center gap-1.5">
                <Percent className="w-4.5 h-4.5 text-emerald-500" />
                Distribuição de Margens de Lucro
              </h3>
              <p className="text-xs text-slate-400 mb-4">Classificação de produtos baseada no percentual de retorno do custo.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartsData.marginPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {chartsData.marginPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {chartsData.marginPieData.map((d, index) => (
                    <div key={index} className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-600 dark:text-zinc-300">{d.name}</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-zinc-100 font-mono">{d.value} un</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Critical Replenishment Stocks List Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
            <h3 className="font-bold text-slate-800 text-sm mb-1.5 dark:text-zinc-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
              Níveis Críticos: Stock Real vs Nível de Alerta Mínimo
            </h3>
            <p className="text-xs text-slate-400 mb-4">Produtos abaixo do limite mínimo de reabastecimento comercial.</p>

            {chartsData.criticalProducts.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400 italic">Nenhum produto em nível crítico de stock no momento. Excelente!</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartsData.criticalProducts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={9.5} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Stock" fill="#ef4444" radius={[4, 4, 0, 0]} name="Stock Atual" />
                    <Bar dataKey="Minimo" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Nível Mínimo" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 3. Detailed Stock Reports View Tab */}
      {activeModuleTab === "reports" && (
        <div className="space-y-6">
          
          {/* Controls & Filter Panel */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 border-b border-slate-150 pb-4 dark:border-zinc-850">
              <div>
                <h3 className="font-bold text-slate-900 text-sm dark:text-zinc-100 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                  Relatórios Detalhados de Estoque
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gere e exporte relatórios consolidados de valorização patrimonial, movimentação de vendas e validades de lotes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportReportPDF}
                  className="px-3.5 py-2 text-xs font-bold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                >
                  <Download className="w-4 h-4" />
                  Exportar PDF
                </button>
                <button
                  onClick={handleExportReportCSV}
                  className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Planilha CSV
                </button>
              </div>
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
              
              {/* Report type selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Tipo de Relatório</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  <option value="VALUATION">💰 Avaliação Patrimonial</option>
                  <option value="MOVEMENTS">📈 Giro & Movimentação</option>
                  <option value="EXPIRATION">📅 Validade & Lotes</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Data Inicial</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-700 dark:text-zinc-200"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Data Final</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-700 dark:text-zinc-200"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Categoria</label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-orange-500 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Search filter within report */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Filtrar por Termo</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar..."
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5 pl-9 text-xs font-medium outline-none focus:border-orange-500 text-slate-700 dark:text-zinc-200"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Quick Metrics Header Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-slate-450">Itens em Relatório</span>
              <p className="text-xl font-bold text-slate-800 dark:text-zinc-200 font-mono mt-1">
                {reportsData.items.length} <span className="text-xs font-normal text-slate-400">produtos</span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-slate-450">Quantidade de Stock</span>
              <p className="text-xl font-bold text-slate-800 dark:text-zinc-200 font-mono mt-1">
                {reportsData.totals.totalStockQty} <span className="text-xs font-normal text-slate-400">unidades</span>
              </p>
            </div>

            {reportType === "VALUATION" && (
              <>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Investimento Total (Custo)</span>
                  <p className="text-xl font-bold text-orange-600 dark:text-amber-400 font-mono mt-1">
                    {reportsData.totals.totalCostVal.toLocaleString()} <span className="text-xs">{currency}</span>
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Potencial de Lucro</span>
                  <p className="text-xl font-bold text-emerald-600 font-mono mt-1">
                    {reportsData.totals.totalProfitPotential.toLocaleString()} <span className="text-xs">{currency}</span>
                  </p>
                </div>
              </>
            )}

            {reportType === "MOVEMENTS" && (
              <>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Faturado no Período</span>
                  <p className="text-xl font-bold text-orange-600 dark:text-amber-400 font-mono mt-1">
                    {reportsData.totals.totalSalesValue.toLocaleString()} <span className="text-xs">{currency}</span>
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Lucro Comercial no Período</span>
                  <p className="text-xl font-bold text-emerald-600 font-mono mt-1">
                    {reportsData.totals.totalSalesProfit.toLocaleString()} <span className="text-xs">{currency}</span>
                  </p>
                </div>
              </>
            )}

            {reportType === "EXPIRATION" && (
              <>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Valor sob Risco de Vencimento</span>
                  <p className="text-xl font-bold text-red-600 font-mono mt-1">
                    {reportsData.totals.totalCostVal.toLocaleString()} <span className="text-xs">{currency}</span>
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-slate-450">Total de Lotes Filtrados</span>
                  <p className="text-xl font-bold text-slate-800 dark:text-zinc-200 font-mono mt-1">
                    {reportsData.items.length} <span className="text-xs font-normal text-slate-400">lotes</span>
                  </p>
                </div>
              </>
            )}

          </div>

          {/* Report Detailed Data Table Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center dark:bg-zinc-950 dark:border-zinc-850">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Registros gerados pelo filtro ({reportsData.items.length})
              </span>
              <span className="text-[10px] bg-slate-200 dark:bg-zinc-800 px-2 py-1 rounded font-bold text-slate-600 dark:text-zinc-400 font-mono uppercase">
                {reportType}
              </span>
            </div>

            {reportsData.items.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <p className="text-sm text-slate-400 italic">Nenhum registro encontrado para os filtros selecionados.</p>
                <p className="text-xs text-slate-400">Tente ajustar o intervalo de datas ou a categoria de produtos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 dark:bg-zinc-950 dark:border-zinc-850">
                      <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300">Código</th>
                      <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300">Nome do Produto</th>
                      <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300">Categoria</th>

                      {reportType === "VALUATION" && (
                        <>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Qtd Estoque</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Preço Custo</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Preço Venda</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Val. Custo</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Val. Venda</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Margem</th>
                        </>
                      )}

                      {reportType === "MOVEMENTS" && (
                        <>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Estoque Atual</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Qtd Vendida</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Faturado</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Lucro Período</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Giro de Estoque</th>
                        </>
                      )}

                      {reportType === "EXPIRATION" && (
                        <>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300">Fornecedor</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Vencimento</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Qtd Estoque</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-right">Val. Custo</th>
                          <th className="p-3.5 font-bold text-slate-700 dark:text-zinc-300 text-center">Estado</th>
                        </>
                      )}

                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-850">
                    {reportsData.items.map((item) => {
                      const daysLeft = item.product.expiryDate 
                        ? Math.ceil((new Date(item.product.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <tr key={item.product.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40">
                          <td className="p-3.5 font-mono text-slate-500 font-bold">{item.product.code}</td>
                          <td className="p-3.5 font-bold text-slate-800 dark:text-zinc-100">
                            <span className="mr-1.5">{item.product.emoji || "📦"}</span>
                            {item.product.name}
                          </td>
                          <td className="p-3.5">
                            <span className="bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-650 dark:text-zinc-300">
                              {item.product.category}
                            </span>
                          </td>

                          {reportType === "VALUATION" && (
                            <>
                              <td className="p-3.5 text-center font-bold font-mono">{item.product.stock} un</td>
                              <td className="p-3.5 text-right font-mono text-slate-600 dark:text-zinc-350">{item.product.costPrice.toFixed(2)} {currency}</td>
                              <td className="p-3.5 text-right font-mono text-slate-600 dark:text-zinc-350">{item.product.salePrice.toFixed(2)} {currency}</td>
                              <td className="p-3.5 text-right font-bold font-mono text-orange-600 dark:text-amber-400">{item.currentStockValCost.toLocaleString()} {currency}</td>
                              <td className="p-3.5 text-right font-bold font-mono text-slate-800 dark:text-zinc-100">{item.currentStockValSale.toLocaleString()} {currency}</td>
                              <td className="p-3.5 text-center font-bold font-mono text-emerald-600">{item.marginPct.toFixed(0)}%</td>
                            </>
                          )}

                          {reportType === "MOVEMENTS" && (
                            <>
                              <td className="p-3.5 text-center font-semibold font-mono">{item.product.stock} un</td>
                              <td className="p-3.5 text-center font-bold font-mono text-orange-600 dark:text-amber-400">{item.salesQty} un</td>
                              <td className="p-3.5 text-right font-bold font-mono text-slate-800 dark:text-zinc-100">{item.salesValue.toLocaleString()} {currency}</td>
                              <td className="p-3.5 text-right font-bold font-mono text-emerald-600">{item.salesProfit.toLocaleString()} {currency}</td>
                              <td className="p-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <div className="w-12 bg-slate-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-orange-500 h-2" style={{ width: `${Math.min(100, item.rotationRate)}%` }} />
                                  </div>
                                  <span className="font-bold font-mono text-[10px] w-8 text-right">{item.rotationRate.toFixed(1)}%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {reportType === "EXPIRATION" && (
                            <>
                              <td className="p-3.5 text-slate-600 dark:text-zinc-300 font-semibold">{item.product.supplier || "-"}</td>
                              <td className="p-3.5 text-center font-bold font-mono text-slate-700 dark:text-zinc-200">{item.product.expiryDate || "-"}</td>
                              <td className="p-3.5 text-center font-bold font-mono">{item.product.stock} un</td>
                              <td className="p-3.5 text-right font-bold font-mono text-slate-800 dark:text-zinc-100">{item.currentStockValCost.toLocaleString()} {currency}</td>
                              <td className="p-3.5 text-center">
                                {daysLeft !== null ? (
                                  daysLeft < 0 ? (
                                    <span className="bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 px-2 py-0.5 rounded font-bold uppercase text-[9px]">
                                      Vencido
                                    </span>
                                  ) : daysLeft <= 15 ? (
                                    <span className="bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 px-2 py-0.5 rounded font-bold uppercase text-[9px]">
                                      Expira em {daysLeft}d
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 px-2 py-0.5 rounded font-bold uppercase text-[9px]">
                                      {daysLeft} dias rest.
                                    </span>
                                  )
                                ) : (
                                  <span className="text-slate-450 italic">Sem data</span>
                                )}
                              </td>
                            </>
                          )}

                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200 dark:bg-zinc-950 dark:border-zinc-850 text-slate-800 dark:text-zinc-200">
                      <td colSpan={3} className="p-3.5">TOTAL CONSOLIDADO NO FILTRO</td>

                      {reportType === "VALUATION" && (
                        <>
                          <td className="p-3.5 text-center font-mono">{reportsData.totals.totalStockQty} un</td>
                          <td colSpan={2} />
                          <td className="p-3.5 text-right font-mono text-orange-600 dark:text-amber-400">{reportsData.totals.totalCostVal.toLocaleString()} {currency}</td>
                          <td className="p-3.5 text-right font-mono">{reportsData.totals.totalSaleVal.toLocaleString()} {currency}</td>
                          <td className="p-3.5 text-center font-mono text-emerald-600">Lucro: {reportsData.totals.totalProfitPotential.toLocaleString()} {currency}</td>
                        </>
                      )}

                      {reportType === "MOVEMENTS" && (
                        <>
                          <td className="p-3.5 text-center font-mono">{reportsData.totals.totalStockQty} un</td>
                          <td className="p-3.5 text-center font-mono text-orange-600 dark:text-amber-400">{reportsData.totals.totalSalesQty} un</td>
                          <td className="p-3.5 text-right font-mono text-slate-800 dark:text-zinc-100">{reportsData.totals.totalSalesValue.toLocaleString()} {currency}</td>
                          <td className="p-3.5 text-right font-mono text-emerald-600">{reportsData.totals.totalSalesProfit.toLocaleString()} {currency}</td>
                          <td />
                        </>
                      )}

                      {reportType === "EXPIRATION" && (
                        <>
                          <td colSpan={2} />
                          <td className="p-3.5 text-center font-mono">{reportsData.totals.totalStockQty} un</td>
                          <td className="p-3.5 text-right font-mono text-orange-600 dark:text-amber-400">{reportsData.totals.totalCostVal.toLocaleString()} {currency}</td>
                          <td />
                        </>
                      )}

                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 4. Batches & Expiry (FIFO/LIFO) Sub-tab */}
      {activeModuleTab === "batches" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Top Panel: Strategy and Explanation */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 dark:bg-zinc-950 dark:border-zinc-800">
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-800 text-sm dark:text-zinc-100 flex items-center gap-1.5">
                <Layers className="w-5 h-5 text-orange-500" />
                Estratégia de Consumo de Lotes (Validade/Giro)
              </h4>
              <p className="text-xs text-slate-500">
                O motor do sistema utiliza esta estratégia no checkout POS para deduzir automaticamente as validades adequadas.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Estratégia:</span>
              <select
                value={settings?.inventoryStrategy || "FIFO"}
                onChange={(e) => {
                  if (onUpdateSettings) {
                    onUpdateSettings({ inventoryStrategy: e.target.value as any });
                    if (onShowToast) onShowToast(`Estratégia de stock atualizada para ${e.target.value}!`, "success");
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700"
              >
                <option value="FIFO">FIFO (First-In, First-Out - Validade mais antiga)</option>
                <option value="LIFO">LIFO (Last-In, First-Out - Lote mais recente)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form: Register New Batch */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 dark:text-zinc-100 dark:border-zinc-800">
                Cadastrar Novo Lote & Entrada
              </h4>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!batchProductId) {
                  if (onShowToast) onShowToast("Por favor, selecione um produto.", "error");
                  return;
                }
                if (!batchCode) {
                  if (onShowToast) onShowToast("Por favor, introduza o código do lote.", "error");
                  return;
                }
                if (batchQty <= 0) {
                  if (onShowToast) onShowToast("A quantidade deve ser maior que zero.", "error");
                  return;
                }
                if (!batchExpiry) {
                  if (onShowToast) onShowToast("Por favor, defina uma data de validade.", "error");
                  return;
                }

                const prod = products.find(p => p.id === batchProductId);
                if (!prod) return;

                const newBatch = {
                  id: generateEntityId("batch"),
                  productId: batchProductId,
                  productName: prod.name,
                  batchCode: batchCode,
                  quantity: batchQty,
                  initialQuantity: batchQty,
                  costPrice: batchCost || prod.costPrice,
                  receivedDate: new Date().toISOString().split("T")[0],
                  expiryDate: batchExpiry,
                  supplier: batchSupplier || prod.supplier || "Geral"
                };

                const currentBatches = settings?.batches || [];
                const updatedBatches = [...currentBatches, newBatch];

                // Increment general stock
                onUpdateProduct({
                  ...prod,
                  stock: prod.stock + batchQty
                });

                if (onUpdateSettings) {
                  onUpdateSettings({ batches: updatedBatches });
                }

                onAddAuditLog(
                  "Registrar Novo Lote",
                  "STOCK",
                  `Lote ${batchCode} (${batchQty} un) adicionado ao produto ${prod.name} com validade ${batchExpiry}. Estoque geral incrementado.`
                );

                if (onShowToast) onShowToast(`Lote ${batchCode} registrado com sucesso e adicionado ao stock!`, "success");

                setBatchProductId("");
                setBatchCode("");
                setBatchQty(50);
                setBatchCost(0);
                setBatchExpiry("");
                setBatchSupplier("");
              }} className="space-y-3.5">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Selecione o Produto</label>
                  <select
                    value={batchProductId}
                    onChange={(e) => {
                      setBatchProductId(e.target.value);
                      const prod = products.find(p => p.id === e.target.value);
                      if (prod) {
                        setBatchCost(prod.costPrice);
                        // Generate a suggestion code
                        setBatchCode(`LT-${prod.name.slice(0, 3).toUpperCase()}-${generateSecurePin(4)}`);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs text-slate-700 outline-none"
                  >
                    <option value="">-- Escolha um Produto --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Código do Lote</label>
                    <input
                      type="text"
                      placeholder="LOTE-XYZ"
                      value={batchCode}
                      onChange={(e) => setBatchCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade Entrada</label>
                    <input
                      type="number"
                      value={batchQty}
                      onChange={(e) => setBatchQty(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço de Custo (MT)</label>
                    <input
                      type="number"
                      value={batchCost}
                      onChange={(e) => setBatchCost(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Validade</label>
                    <input
                      type="date"
                      value={batchExpiry}
                      onChange={(e) => setBatchExpiry(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 px-1.5 font-bold text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor / Origem</label>
                  <input
                    type="text"
                    placeholder="Distribuidor Oficial"
                    value={batchSupplier}
                    onChange={(e) => setBatchSupplier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs transition shadow-md cursor-pointer"
                >
                  Registrar Entrada de Lote (+ Stock)
                </button>
              </form>
            </div>

            {/* List: Registered Batches Grid */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3 dark:border-zinc-800">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm dark:text-zinc-100">
                    Gestão de Lotes & Rastreabilidade de Validades (BatchManager)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Acompanhamento rigoroso de lotes ativos de produtos perecíveis.</p>
                </div>
                <span className="self-start sm:self-auto text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-mono">
                  {(settings?.batches || []).length} lotes ativos
                </span>
              </div>

              <BatchManager
                products={products}
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                onUpdateProduct={onUpdateProduct}
                onAddAuditLog={onAddAuditLog}
                onShowToast={onShowToast}
                currency={currency}
              />
            </div>

          </div>

        </div>
      )}

      {/* 5. Branches & Geographical Stock Sub-tab */}
      {activeModuleTab === "branches" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Active Branch Selector Info */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 dark:bg-zinc-950 dark:border-zinc-800">
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-800 text-sm dark:text-zinc-100 flex items-center gap-1.5">
                <MapPin className="w-5 h-5 text-orange-500" />
                Filial de Operação Ativa
              </h4>
              <p className="text-xs text-slate-500">
                Esta é a filial geográfica para a qual todas as vendas do POS atual serão imputadas e os stocks deduzidos.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Filial Ativa:</span>
              <select
                value={settings?.activeBranchId || "central"}
                onChange={(e) => {
                  if (onUpdateSettings) {
                    onUpdateSettings({ activeBranchId: e.target.value });
                    if (onShowToast) onShowToast(`Filial de vendas atualizada para: [${e.target.value.toUpperCase()}]!`, "success");
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700"
              >
                {(settings?.branches || []).map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards Grid: Branch Listing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
            {(settings?.branches || []).map((branch) => {
              // Calculate total stocks inside this branch
              const totalItems = products.length;
              const totalQty = products.reduce((sum, p) => {
                const bStock = p.branchStocks?.[branch.id];
                return sum + (bStock !== undefined ? bStock : p.stock);
              }, 0);

              const isActive = (settings?.activeBranchId || "central") === branch.id;

              return (
                <div
                  key={branch.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isActive 
                      ? "bg-orange-50/40 border-orange-200 shadow-sm" 
                      : "bg-white border-slate-100 hover:border-slate-200"
                  } dark:bg-zinc-900 dark:border-zinc-800`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-slate-400 font-extrabold text-[9px] font-mono uppercase tracking-widest">{branch.code}</span>
                      <h4 className="font-bold text-slate-800 text-sm dark:text-zinc-100 mt-0.5">{branch.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-1">{branch.address}, {branch.city}</p>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-orange-500 animate-pulse' : 'bg-slate-350'}`} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4.5 pt-3.5 border-t border-slate-100 font-mono text-slate-650 dark:border-zinc-800">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-sans">Variedade Itens</p>
                      <p className="font-bold text-slate-700 dark:text-zinc-200 text-xs mt-0.5">{totalItems} prods</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-sans">Stock Consolidado</p>
                      <p className="font-bold text-slate-800 dark:text-zinc-100 text-xs mt-0.5">{totalQty.toLocaleString()} un</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form: Stock Transfer between stores */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 dark:text-zinc-100 dark:border-zinc-800">
                Transferência de Stock Inter-Filial
              </h4>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (transferOriginBranchId === transferDestBranchId) {
                  if (onShowToast) onShowToast("A filial de origem e destino não podem ser iguais.", "error");
                  return;
                }
                if (!transferProductId) {
                  if (onShowToast) onShowToast("Por favor, selecione o produto para transferir.", "error");
                  return;
                }
                if (transferQty <= 0) {
                  if (onShowToast) onShowToast("A quantidade deve ser maior que zero.", "error");
                  return;
                }

                const prod = products.find(p => p.id === transferProductId);
                if (!prod) return;

                const originStocks = prod.branchStocks || {};
                const currentOriginQty = originStocks[transferOriginBranchId] !== undefined 
                  ? originStocks[transferOriginBranchId] 
                  : prod.stock;

                if (currentOriginQty < transferQty) {
                  if (onShowToast) onShowToast(`Quantidade insuficiente na filial de origem. Stock disponível: ${currentOriginQty} un.`, "error");
                  return;
                }

                const destStocks = prod.branchStocks || {};
                const currentDestQty = destStocks[transferDestBranchId] !== undefined
                  ? destStocks[transferDestBranchId]
                  : 0;

                const updatedBranchStocks = {
                  ...originStocks,
                  [transferOriginBranchId]: currentOriginQty - transferQty,
                  [transferDestBranchId]: currentDestQty + transferQty
                };

                onUpdateProduct({
                  ...prod,
                  branchStocks: updatedBranchStocks
                });

                const newTransfer: StockTransfer = {
                  id: generateEntityId("st"),
                  originBranchId: transferOriginBranchId,
                  destinationBranchId: transferDestBranchId,
                  productId: transferProductId,
                  productName: prod.name,
                  quantity: transferQty,
                  timestamp: new Date().toISOString(),
                  status: "COMPLETED",
                  responsibleUser: "Gerente de Logística"
                };

                const currentTransfers = settings?.stockTransfers || [];
                const updatedTransfers = [newTransfer, ...currentTransfers];

                if (onUpdateSettings) {
                  onUpdateSettings({ stockTransfers: updatedTransfers });
                }

                onAddAuditLog(
                  "Transferência de Stock Inter-Filial",
                  "STOCK",
                  `Transferência de ${transferQty} un de ${prod.name} de [${transferOriginBranchId.toUpperCase()}] para [${transferDestBranchId.toUpperCase()}] concluída.`
                );

                if (onShowToast) onShowToast(`Transferência de ${transferQty} un de ${prod.name} realizada!`, "success");
                setTransferProductId("");
                setTransferQty(10);
              }} className="space-y-3.5">
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Origem</label>
                    <select
                      value={transferOriginBranchId}
                      onChange={(e) => setTransferOriginBranchId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs text-slate-700 outline-none cursor-pointer"
                    >
                      {(settings?.branches || []).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Destino</label>
                    <select
                      value={transferDestBranchId}
                      onChange={(e) => setTransferDestBranchId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs text-slate-700 outline-none cursor-pointer"
                    >
                      {(settings?.branches || []).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Selecione o Produto</label>
                  <select
                    value={transferProductId}
                    onChange={(e) => setTransferProductId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="">-- Escolha o Produto --</option>
                    {products.map(p => {
                      const branchQty = p.branchStocks?.[transferOriginBranchId] !== undefined
                        ? p.branchStocks[transferOriginBranchId]
                        : p.stock;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} (Disp: {branchQty} un)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade a Transferir</label>
                  <input
                    type="number"
                    value={transferQty}
                    onChange={(e) => setTransferQty(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs transition shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Efetuar Guia de Transferência
                </button>
              </form>
            </div>

            {/* List of recent stock transfers */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 dark:text-zinc-100 dark:border-zinc-800">
                Histórico de Guias e Transferências de Stock
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400 dark:border-zinc-800">
                      <th className="py-2.5">Data/Hora</th>
                      <th className="py-2.5">Produto</th>
                      <th className="py-2.5 text-center">Origem</th>
                      <th className="py-2.5 text-center">Destino</th>
                      <th className="py-2.5 text-center">Quantidade</th>
                      <th className="py-2.5 text-center">Responsável</th>
                      <th className="py-2.5 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px] font-medium text-slate-650 dark:divide-zinc-800/50">
                    {(settings?.stockTransfers || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-medium italic">
                          Nenhuma guia de transferência inter-filial gerada até ao momento.
                        </td>
                      </tr>
                    ) : (
                      (settings?.stockTransfers || []).map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 font-mono text-slate-450">{new Date(st.timestamp).toLocaleString()}</td>
                          <td className="py-2.5 font-bold text-slate-800 dark:text-zinc-200">{st.productName}</td>
                          <td className="py-2.5 text-center uppercase font-bold text-slate-600">{st.originBranchId}</td>
                          <td className="py-2.5 text-center uppercase font-bold text-slate-600">{st.destinationBranchId}</td>
                          <td className="py-2.5 text-center font-bold text-slate-800 dark:text-zinc-100">{st.quantity} un</td>
                          <td className="py-2.5 text-center text-slate-500">{st.responsibleUser}</td>
                          <td className="py-2.5 text-right">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-green-50 text-green-700 tracking-wide uppercase">
                              Concluído
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Floating Action Button (FAB) on bottom right */}
      {canMutate && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={openCreateForm}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white p-3.5 rounded-full shadow-2xl flex items-center gap-2 group cursor-pointer transition-all duration-300"
            title="Adicionar Novo Produto"
          >
            <Plus className="w-6 h-6" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold text-xs whitespace-nowrap uppercase tracking-wider">
              Adicionar Produto
            </span>
          </button>
        </div>
      )}

      {/* 4. SLIDE-OVER DETAIL DRAWER PANEL (Product Card Details) */}
      {detailedProduct && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-55 transition-opacity" onClick={() => setDetailedProduct(null)} />
          
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white border-l border-slate-200 shadow-2xl z-55 flex flex-col animate-in slide-in-from-right duration-200 dark:bg-zinc-900 dark:border-zinc-800 text-xs text-slate-600">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{detailedProduct.emoji || "📦"}</span>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm dark:text-zinc-100">{detailedProduct.name}</h3>
                  <span className="text-[10px] font-mono text-slate-400">SKU / ID: {detailedProduct.code}</span>
                </div>
              </div>
              <button 
                onClick={() => setDetailedProduct(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Image Banner if available, else big emoji */}
              {detailedProduct.image ? (
                <div className="w-full h-40 rounded-xl overflow-hidden border border-slate-200">
                  <img src={detailedProduct.image} alt={detailedProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <div className="w-full h-24 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center select-none dark:bg-zinc-950 dark:border-zinc-800">
                  <span className="text-4xl">{detailedProduct.emoji || "📦"}</span>
                </div>
              )}

              {/* Financial Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5 dark:bg-zinc-950 dark:border-zinc-800">
                <h4 className="font-bold text-[10px] text-slate-400 uppercase font-mono tracking-wider">Tabela de Preços & Margens</h4>
                
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <p className="text-[10px] text-slate-400">Preço de Custo</p>
                    <p className="font-bold text-slate-700 dark:text-zinc-200 mt-0.5">{detailedProduct.costPrice.toLocaleString()} {currency}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Preço de Venda</p>
                    <p className="font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{detailedProduct.salePrice.toLocaleString()} {currency}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Lucro Unitário</p>
                    <p className="font-bold text-emerald-600 mt-0.5">{(detailedProduct.salePrice - detailedProduct.costPrice).toLocaleString()} {currency}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Margem Comercial</p>
                    <p className="font-bold text-emerald-600 mt-0.5">
                      {detailedProduct.costPrice > 0 ? Math.round(((detailedProduct.salePrice - detailedProduct.costPrice) / detailedProduct.costPrice) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Inventory Box */}
              <div className="space-y-3">
                <h4 className="font-bold text-[10px] text-slate-400 uppercase font-mono tracking-wider">Métricas de Stock</h4>
                
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="border border-slate-200 p-3 rounded-xl dark:border-zinc-800">
                    <p className="text-slate-400 text-[10px]">Stock Atual</p>
                    <p className="text-xl font-bold font-mono text-slate-800 dark:text-zinc-100 mt-0.5">{detailedProduct.stock} un</p>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-xl dark:border-zinc-800">
                    <p className="text-slate-400 text-[10px]">Mínimo Alerta</p>
                    <p className="text-xl font-bold font-mono text-slate-800 dark:text-zinc-100 mt-0.5">{detailedProduct.minStock} un</p>
                  </div>
                </div>

                <div className="border border-slate-200 p-3.5 rounded-xl space-y-2 dark:border-zinc-800">
                  <div className="flex justify-between items-center text-xs">
                    <span>Validade:</span>
                    <span className="font-bold font-mono">
                      {detailedProduct.expiryDate ? new Date(detailedProduct.expiryDate).toLocaleDateString() : "Sem vencimento"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span>Imposto IVA:</span>
                    <span className="font-bold font-mono">{detailedProduct.vatRate || 16}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span>Fornecedor:</span>
                    <span className="font-bold text-slate-700 dark:text-zinc-300">{detailedProduct.supplier || "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span>Categoria:</span>
                    <span className="font-bold font-mono text-slate-500">{detailedProduct.category}</span>
                  </div>
                </div>
              </div>

              {/* Simulated Stock Movement History Logs */}
              <div className="space-y-3">
                <h4 className="font-bold text-[10px] text-slate-400 uppercase font-mono tracking-wider">Histórico de Movimentações</h4>
                
                <div className="space-y-2.5">
                  <div className="flex gap-2.5 items-start border-l-2 border-green-500 pl-3 py-0.5">
                    <div className="flex-1">
                      <p className="font-bold text-slate-700 dark:text-zinc-300">Inventário Inicial de Cadastro</p>
                      <p className="text-[10px] text-slate-400">Criado com semente padrão ou XLS</p>
                    </div>
                    <span className="font-bold font-mono text-green-600 text-xs">+{detailedProduct.stock}</span>
                  </div>

                  <div className="flex gap-2.5 items-start border-l-2 border-slate-300 pl-3 py-0.5">
                    <div className="flex-1">
                      <p className="font-bold text-slate-700 dark:text-zinc-300">Auditoria Regular OST</p>
                      <p className="text-[10px] text-slate-400">Conformidade de Stock</p>
                    </div>
                    <span className="font-bold font-mono text-slate-500 text-xs">OK</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Drawer Actions Footer */}
            {canMutate && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 dark:bg-zinc-950 dark:border-zinc-800">
                <button
                  onClick={() => { openEditForm(detailedProduct); setDetailedProduct(null); }}
                  className="w-1/2 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar Produto
                </button>
                <button
                  onClick={() => { handleDuplicateProduct(detailedProduct); setDetailedProduct(null); }}
                  className="w-1/2 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Copy className="w-4 h-4" />
                  Duplicar
                </button>
              </div>
            )}

          </div>
        </>
      )}

      {/* 5. QUICK ADJUSTMENT INPUT DIALOG MODAL */}
      {adjustingProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-5 rounded-2xl max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 dark:bg-zinc-900">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2 dark:border-zinc-800">
              <h3 className="font-bold text-slate-800 dark:text-zinc-100">
                Ajustar Stock: <span className="text-orange-500">{adjustingProduct.name}</span>
              </h3>
              <button 
                onClick={() => setAdjustingProduct(null)}
                className="text-slate-400 hover:text-slate-650 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAdjust} className="space-y-4 text-xs">
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentType("IN")}
                  className={`w-1/2 py-2 rounded-xl font-bold border transition ${
                    adjustmentType === "IN"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  📥 Entrada (+)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType("OUT")}
                  className={`w-1/2 py-2 rounded-xl font-bold border transition ${
                    adjustmentType === "OUT"
                      ? "bg-red-50 border-red-300 text-red-700"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  📤 Saída (-)
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade do Ajuste</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Ex: 5"
                  value={adjustmentQty || ""}
                  onChange={(e) => setAdjustmentQty(Number(e.target.value))}
                  className="w-full border rounded-xl p-2.5 font-bold font-mono text-center text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Motivo Comercial</label>
                <input
                  type="text"
                  placeholder="Ex: Reposição de Fornecedor, Quebra, etc."
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full border rounded-xl p-2.5 font-medium"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border font-mono dark:bg-zinc-950 dark:border-zinc-850">
                <p className="text-[10px] text-slate-400">Previsão Comercial</p>
                <div className="flex justify-between items-center text-xs mt-1">
                  <span>Quantidade Atual:</span>
                  <span className="font-bold">{adjustingProduct.stock} un</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Resultado Ajustado:</span>
                  <span className="font-bold text-orange-600">
                    {adjustmentType === "IN" 
                      ? adjustingProduct.stock + adjustmentQty 
                      : Math.max(0, adjustingProduct.stock - adjustmentQty)} un
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="w-1/2 py-2.5 border rounded-xl font-bold hover:bg-slate-50 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl"
                >
                  Aplicar Ajuste
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DOCKER DRAWER MODAL: Add / Edit Product */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl max-w-xl w-full border border-slate-100 shadow-2xl space-y-4 animate-in fade-in duration-200 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-zinc-800">
              <h3 className="font-bold text-slate-950 text-sm dark:text-zinc-100">
                {editingProduct ? `Editar Detalhes: ${editingProduct.name}` : "Cadastrar Novo Produto para Stock"}
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-450 hover:text-slate-650 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitProduct} className="space-y-4">
              {validationError && (
                <p className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg font-semibold">{validationError}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Comercial do Produto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Óleo Alimentar Maçaroca 5L"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-slate-850"
                  />
                </div>

                {/* SKU Code */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Código / SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: OLE-MAÇ-05"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500"
                  />
                </div>

                {/* Barcode (EAN / Scanner) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <span>🏷️ Código de Barras (EAN)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setBarcode(generateDeterministicBarcodeEan13("560", products.length + 1))}
                      className="text-[9.5px] text-orange-600 hover:text-orange-700 font-bold hover:underline cursor-pointer"
                    >
                      ⚡ Gerar EAN-13
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Bipe com o leitor ou digite o código de barras"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold font-mono text-slate-800 outline-none focus:border-orange-500"
                  />
                </div>

                {/* Category selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer"
                  >
                    <option value="Mercearia">Mercearia</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Eletrónicos">Eletrónicos</option>
                    <option value="Construção">Construção</option>
                    <option value="Vestuário">Vestuário</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                {/* Supplier */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor Distribuidor *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: CDM Moçambique ou MozAlimentos"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-slate-850"
                  />
                </div>

                {/* Cost price */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Preço de Custo (MT) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ex: 110"
                    value={costPrice || ""}
                    onChange={(e) => setCostPrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold font-mono outline-none"
                  />
                </div>

                {/* Sale price */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Preço de Venda (MT) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ex: 165"
                    value={salePrice || ""}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold font-mono outline-none"
                  />
                </div>

                {/* Stock default */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Estoque Inicial (Unidades) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ex: 30"
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold font-mono outline-none"
                  />
                </div>

                {/* Stock limit minimum */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Estoque Mínimo de Alerta *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ex: 5"
                    value={minStock}
                    onChange={(e) => setMinStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold font-mono outline-none"
                  />
                </div>

                {/* Expiry Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Validade/Vencimento</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none"
                  />
                </div>

                {/* Image URL or Local File Upload */}
                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Imagem do Produto (Carregar Foto ou Link)
                    </label>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl("")}
                        className="text-[9.5px] text-rose-500 hover:underline cursor-pointer"
                      >
                        Remover Foto
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Link da imagem ou carregue abaixo..."
                      value={imageUrl.startsWith("data:") ? "Foto guardada na memória local" : imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none focus:border-orange-500 text-xs"
                    />
                    <label className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      Carregar Foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const saved = await imageStorageService.saveImage(file, {
                              category: "PRODUCT",
                              name: name ? `Foto ${name}` : file.name,
                              maxWidth: 1000,
                              maxHeight: 1000,
                              quality: 0.85
                            });
                            setImageUrl(saved.dataUrl);
                            if (onShowToast) onShowToast("Foto do produto carregada e otimizada!", "success");
                          } catch (err) {
                            console.error(err);
                            if (onShowToast) onShowToast("Erro ao processar imagem.", "error");
                          }
                        }}
                      />
                    </label>
                    {imageUrl && (
                      <div className="w-9 h-9 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 flex items-center justify-center">
                        <img src={imageUrl} alt="Prévia" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Emoji visual selector */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Emoji do Produto / Decorador</label>
                  <select
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer"
                  >
                    <option value="🍙">🍙 Arroz / Grãos</option>
                    <option value="🧴">🧴 Garrafas / Óleo</option>
                    <option value="🌾">🌾 Sacos / Farinhas</option>
                    <option value="🍺">🍺 Garrafas / Laurentina</option>
                    <option value="🍻">🍻 Latas / Cervejas</option>
                    <option value="🧃">🧃 Sumos / Tetrapaks</option>
                    <option value="🔌">🔌 Acessórios USB</option>
                    <option value="📱">📱 Celulares / Smartphones</option>
                    <option value="🧱">🧱 Cimento / Tijolo</option>
                    <option value="👕">👕 Roupas / Vestuário</option>
                    <option value="🥫">🥫 Enlatados / Tomate</option>
                    <option value="📦">📦 Outros Genericamente</option>
                  </select>
                </div>

                {/* Promotion Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Campanha Promocional</label>
                  <select
                    value={promotion}
                    onChange={(e) => setPromotion(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold outline-none cursor-pointer text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">Nenhuma</option>
                    <option value="PROMO">PROMO - Promoção Geral</option>
                    <option value="DESCONTO">DESCONTO - Oferta / Liquidação</option>
                    <option value="MAIS_VENDIDO">MAIS VENDIDO - Destaque de Vendas</option>
                    <option value="NOVO">NOVO - Lançamento</option>
                  </select>
                </div>

                {/* Promotional Image Creator Button inside form */}
                <div className="space-y-1 flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!name.trim()) {
                        setValidationError("Por favor, preencha pelo menos o nome do produto para gerar o cartaz publicitário.");
                        return;
                      }
                      const tempProduct: Product = {
                        id: editingProduct ? editingProduct.id : generateEntityId("temp"),
                        name,
                        code: code || "PROMO-CODE",
                        category,
                        supplier: supplier || "Indisponível",
                        costPrice: costPrice || 0,
                        salePrice: salePrice || 0,
                        vatRate: vatRate || 16,
                        stock: stock || 0,
                        minStock: minStock || 0,
                        emoji,
                        image: imageUrl || undefined,
                        promotion: promotion || "PROMO"
                      };
                      setFlyerProduct(tempProduct);
                      setIsFlyerGeneratorOpen(true);
                    }}
                    className="w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black rounded-lg text-xs cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm border border-orange-200/50"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-200" />
                    Gerar Cartaz de Promoção
                  </button>
                </div>

              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer transition"
                >
                  {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPLIERS AND ORDERS MODULE TAB VIEW */}
      {activeModuleTab === "suppliers" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Header Dashboard Stats for Suppliers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-11 h-11 rounded-xl bg-orange-105 bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 dark:bg-orange-950/20 dark:text-orange-400">
                <Truck className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Total Fornecedores</span>
                <span className="text-xl font-black text-slate-800 dark:text-zinc-100">{registeredSuppliers.length}</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 dark:bg-amber-950/20 dark:text-amber-400">
                <ShoppingCart className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Pedidos Pendentes</span>
                <span className="text-xl font-black text-amber-600">{supplierOrders.filter(o => o.status === "Pendente").length}</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 dark:bg-emerald-950/20 dark:text-emerald-400">
                <DollarSign className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Total Pago aos F.</span>
                <span className="text-sm font-black text-slate-800 dark:text-zinc-100">
                  {supplierOrders.filter(o => o.paymentStatus === "Pago").reduce((sum, o) => sum + o.totalValue, 0).toLocaleString()} MT
                </span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 dark:bg-zinc-900 dark:border-zinc-800">
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-650 flex items-center justify-center shrink-0 dark:bg-red-950/20 dark:text-red-400">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Total a Crédito</span>
                <span className="text-sm font-black text-red-600">
                  {supplierOrders.filter(o => o.paymentStatus === "Crédito").reduce((sum, o) => sum + o.totalValue, 0).toLocaleString()} MT
                </span>
              </div>
            </div>
          </div>

          {/* Sub Tab Navigation inside Suppliers */}
          <div className="flex border-b border-slate-150 dark:border-zinc-800 gap-6">
            <button
              onClick={() => setSupplierSubTab("orders")}
              className={`pb-2.5 font-extrabold text-xs transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                supplierSubTab === "orders"
                  ? "border-orange-500 text-orange-500 dark:text-orange-400 dark:border-orange-400 font-black"
                  : "border-transparent text-slate-400 hover:text-slate-650 dark:hover:text-zinc-300"
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Encomendas & Pedidos de Stock
            </button>
            <button
              onClick={() => setSupplierSubTab("finance")}
              className={`pb-2.5 font-extrabold text-xs transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                supplierSubTab === "finance"
                  ? "border-orange-500 text-orange-500 dark:text-orange-400 dark:border-orange-400 font-black"
                  : "border-transparent text-slate-400 hover:text-slate-650 dark:hover:text-zinc-300"
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Histórico Financeiro & Dívidas Pendentes
            </button>
            <button
              onClick={() => setSupplierSubTab("config")}
              className={`pb-2.5 font-extrabold text-xs transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                supplierSubTab === "config"
                  ? "border-orange-500 text-orange-500 dark:text-orange-400 dark:border-orange-400 font-black"
                  : "border-transparent text-slate-400 hover:text-slate-650 dark:hover:text-zinc-300"
              }`}
            >
              <Sliders className="w-4 h-4" />
              Configurações
            </button>
          </div>

          {supplierSubTab === "orders" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
              
              {/* 1. Suppliers List Container */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3 dark:border-zinc-800">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100">Fornecedores Parceiros</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Parceiros comerciais cadastrados.</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingSupplierId(null);
                        setSupplierNameInput("");
                        setSupplierPhoneInput("");
                        setSupplierEmailInput("");
                        setSupplierAddressInput("");
                        setSupplierNuitInput("");
                        setIsSupplierFormOpen(true);
                      }}
                      className="p-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Registar
                    </button>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar fornecedor..."
                      value={supplierSearchQuery}
                      onChange={(e) => setSupplierSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-orange-500 dark:bg-zinc-950 dark:border-zinc-850"
                    />
                  </div>

                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                    {registeredSuppliers.filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase())).length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic text-center py-6">Nenhum fornecedor cadastrado.</p>
                    ) : (
                      registeredSuppliers
                        .filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()))
                        .map((supp) => (
                          <div key={supp.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between gap-2.5 dark:bg-zinc-950/40 dark:border-zinc-800 dark:hover:bg-zinc-800/20">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <span className="font-bold text-slate-800 text-xs dark:text-zinc-100 flex items-center gap-1">
                                  <UserCheck className="w-3.5 h-3.5 text-orange-500" />
                                  {supp.name}
                                </span>
                                <div className="text-[10px] text-slate-500 space-y-0.5 mt-1 font-mono">
                                  {supp.phone && <p>📞 {supp.phone}</p>}
                                  {supp.email && <p>✉️ {supp.email}</p>}
                                  {supp.nuit && <p>📄 NUIT: {supp.nuit}</p>}
                                  {supp.address && <p>📍 {supp.address}</p>}
                                </div>
                              </div>
                              <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                                {supp.status}
                              </span>
                            </div>

                            <div className="flex justify-end gap-1.5 border-t border-slate-100 pt-2 dark:border-zinc-800">
                              <button
                                onClick={() => handleEditSupplierClick(supp)}
                                className="px-2 py-1 text-[10px] text-slate-600 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(supp.id, supp.name)}
                                className="px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer dark:hover:bg-red-950/20"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Supplier Orders (Solicitações de Stock) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-slate-100 pb-3 dark:border-zinc-800">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100">Historial de Solicitações e Pagamentos</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Gestão de entregas, pagamentos de crédito e encomendas de fornecedores.</p>
                    </div>
                    <button
                      onClick={() => {
                        setOrderSupplierId("");
                        setOrderProductId("");
                        setOrderQtyRequested(0);
                        setOrderUnitCost(0);
                        setOrderPaymentStatus("Pendente");
                        setOrderPaymentDueDate("");
                        setIsOrderFormOpen(true);
                      }}
                      className="py-1.5 px-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] rounded-xl flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      Nova Solicitação
                    </button>
                  </div>

                  {/* Filters Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="relative sm:col-span-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Search className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar produto/fornecedor..."
                        value={orderSearchQuery}
                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-9 pr-3 text-xs outline-none focus:border-orange-500 dark:bg-zinc-950 dark:border-zinc-850"
                      />
                    </div>

                    <div>
                      <select
                        value={selectedSupplierFilter}
                        onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                      >
                        <option value="Todos">Todos Fornecedores</option>
                        {registeredSuppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        value={selectedOrderStatusFilter}
                        onChange={(e) => setSelectedOrderStatusFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                      >
                        <option value="Todos">Todos os Estados</option>
                        <option value="Pendente">Pendentes ⏳</option>
                        <option value="Recebido">Recebidos ✅</option>
                        <option value="Cancelado">Cancelados ❌</option>
                      </select>
                    </div>

                    <div>
                      <select
                        value={selectedReceiptStatusFilter}
                        onChange={(e) => setSelectedReceiptStatusFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                      >
                        <option value="Todos">Status Recebimento (Todos)</option>
                        <option value="Aguardando Envio">Aguardando Envio 📦</option>
                        <option value="Em Trânsito">Em Trânsito 🚚</option>
                        <option value="Entregue">Entregue / No Stock ✅</option>
                        <option value="Cancelado">Cancelado ❌</option>
                      </select>
                    </div>

                    <div>
                      <select
                        value={selectedPaymentStatusFilter}
                        onChange={(e) => setSelectedPaymentStatusFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-xs outline-none cursor-pointer text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                      >
                        <option value="Todos">Todos Pagamentos</option>
                        <option value="Pago">Pagos 🟢</option>
                        <option value="Crédito">A Crédito 🔴</option>
                        <option value="Pendente">Pendentes de Pagto 🟡</option>
                      </select>
                    </div>
                  </div>

                  {/* Orders Table */}
                  <div className="overflow-x-auto border border-slate-150/80 rounded-2xl dark:border-zinc-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider dark:bg-zinc-950">
                          <th className="p-3.5">PRODUTO / FORNECEDOR</th>
                          <th className="p-3.5 text-center">QUANTIDADE</th>
                          <th className="p-3.5 text-right">VALOR TOTAL</th>
                          <th className="p-3.5 text-center">ESTADO PAGTO</th>
                          <th className="p-3.5 text-center">STATUS DE RECEBIMENTO</th>
                          <th className="p-3.5 text-center">ESTADO PEDIDO</th>
                          <th className="p-3.5 text-center">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-zinc-800 text-[11px]">
                        {supplierOrders
                          .filter(order => {
                            const matchesQuery = order.productName.toLowerCase().includes(orderSearchQuery.toLowerCase()) || order.supplierName.toLowerCase().includes(orderSearchQuery.toLowerCase());
                            const matchesSupplier = selectedSupplierFilter === "Todos" || order.supplierId === selectedSupplierFilter;
                            const matchesStatus = selectedOrderStatusFilter === "Todos" || order.status === selectedOrderStatusFilter;
                            const matchesPayment = selectedPaymentStatusFilter === "Todos" || order.paymentStatus === selectedPaymentStatusFilter;
                            const matchesReceipt = selectedReceiptStatusFilter === "Todos" || (order.receiptStatus || "Aguardando Envio") === selectedReceiptStatusFilter;
                            return matchesQuery && matchesSupplier && matchesStatus && matchesPayment && matchesReceipt;
                          }).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 italic">Nenhum registro de pedido encontrado.</td>
                          </tr>
                        ) : (
                          supplierOrders
                            .filter(order => {
                              const matchesQuery = order.productName.toLowerCase().includes(orderSearchQuery.toLowerCase()) || order.supplierName.toLowerCase().includes(orderSearchQuery.toLowerCase());
                              const matchesSupplier = selectedSupplierFilter === "Todos" || order.supplierId === selectedSupplierFilter;
                              const matchesStatus = selectedOrderStatusFilter === "Todos" || order.status === selectedOrderStatusFilter;
                              const matchesPayment = selectedPaymentStatusFilter === "Todos" || order.paymentStatus === selectedPaymentStatusFilter;
                              const matchesReceipt = selectedReceiptStatusFilter === "Todos" || (order.receiptStatus || "Aguardando Envio") === selectedReceiptStatusFilter;
                              return matchesQuery && matchesSupplier && matchesStatus && matchesPayment && matchesReceipt;
                            })
                            .map((order) => {
                              const isOverdue = isPaymentOverdue(order);
                              const calculatedDueDate = order.paymentDueDate || (order.requestDate ? (() => {
                                const d = new Date(order.requestDate);
                                d.setDate(d.getDate() + 15);
                                return d.toISOString().split("T")[0];
                              })() : "");

                              return (
                                <tr key={order.id} className={`transition ${
                                  isOverdue 
                                    ? "bg-red-50/50 hover:bg-red-50/70 border-l-4 border-l-red-500 dark:bg-red-950/15 dark:hover:bg-red-950/25" 
                                    : "hover:bg-slate-50/50 dark:hover:bg-zinc-800/30"
                                }`}>
                                  <td className="p-3.5">
                                    <span className="font-extrabold text-slate-800 dark:text-zinc-100 block">{order.productName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono flex flex-wrap items-center gap-1 mt-0.5">
                                      <Truck className="w-3 h-3 text-slate-400" />
                                      Fornecedor: {order.supplierName} • Solic.: {order.requestDate}
                                      {order.isReplenishmentOrder && (
                                        <span className="bg-purple-150 text-purple-750 px-1.5 py-0.2 rounded text-[8.5px] font-bold dark:bg-purple-950/40 dark:text-purple-300">
                                          Ordem Reposição
                                        </span>
                                      )}
                                      {order.paymentStatus !== "Pago" && (
                                        isOverdue ? (
                                          <span className="text-red-600 dark:text-red-400 font-bold ml-1 flex items-center gap-1 animate-pulse">
                                            ⚠️ ATRASADO (Venceu em: {calculatedDueDate})
                                          </span>
                                        ) : (
                                          <span className="text-slate-500 font-medium ml-1">
                                            • Vencimento: {calculatedDueDate}
                                          </span>
                                        )
                                      )}
                                    </span>
                                  </td>
                                <td className="p-3.5 text-center font-bold font-mono">
                                  {order.quantityRequested} un
                                  <span className="text-[9px] text-slate-400 block font-normal">Custo: {order.unitCost.toLocaleString()} MT</span>
                                </td>
                                <td className="p-3.5 text-right font-black font-mono text-slate-800 dark:text-zinc-100">
                                  {order.totalValue.toLocaleString()} MT
                                </td>
                                
                                {/* Payment Status Dropdown / Badge */}
                                <td className="p-3.5 text-center">
                                  <select
                                    value={order.paymentStatus}
                                    onChange={(e) => handleUpdateOrderPaymentStatus(order.id, e.target.value as any)}
                                    className={`px-2 py-1 rounded-full text-[9px] font-bold border outline-none text-center cursor-pointer ${
                                      order.paymentStatus === "Pago" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" :
                                      order.paymentStatus === "Crédito" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30" :
                                      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30"
                                    }`}
                                  >
                                    <option value="Pago">Pago 🟢</option>
                                    <option value="Crédito">Crédito 🔴</option>
                                    <option value="Pendente">Pendente 🟡</option>
                                  </select>
                                </td>

                                {/* Status de Recebimento */}
                                <td className="p-3.5 text-center">
                                  {order.status === "Cancelado" || order.receiptStatus === "Cancelado" ? (
                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 text-slate-600 dark:bg-zinc-850 dark:text-zinc-400">
                                      Cancelado
                                    </span>
                                  ) : order.receiptStatus === "Entregue" || order.status === "Recebido" ? (
                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 inline-flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                      Entregue {order.receivedDate ? `(${order.receivedDate})` : ""}
                                    </span>
                                  ) : (
                                    <select
                                      value={order.receiptStatus || "Aguardando Envio"}
                                      onChange={(e) => handleUpdateOrderReceiptStatus(order.id, e.target.value as any)}
                                      className={`px-2 py-1 rounded-full text-[9px] font-bold border outline-none text-center cursor-pointer ${
                                        order.receiptStatus === "Em Trânsito"
                                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30"
                                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30"
                                      }`}
                                    >
                                      <option value="Aguardando Envio">Aguardando Envio 📦</option>
                                      <option value="Em Trânsito">Em Trânsito 🚚</option>
                                      <option value="Entregue">Confirmar Entrega... ✅</option>
                                    </select>
                                  )}
                                </td>

                                {/* Order Status Badge */}
                                <td className="p-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase ${
                                    order.status === "Recebido" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" :
                                    order.status === "Cancelado" ? "bg-slate-100 text-slate-700 dark:bg-zinc-850 dark:text-zinc-400" :
                                    "bg-amber-100 text-amber-850 animate-pulse dark:bg-amber-950/30 dark:text-amber-450"
                                  }`}>
                                    {order.status === "Recebido" ? "✓ Recebido" :
                                     order.status === "Cancelado" ? "✗ Cancelado" :
                                     "⏳ Pendente"}
                                  </span>
                                </td>

                                {/* Actions */}
                                <td className="p-3.5 text-center">
                                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleSendSupplierOrderWhatsApp(order)}
                                      className="px-2 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                      title={`Enviar pedido de ${order.productName} via WhatsApp para ${order.supplierName}`}
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      <span>WhatsApp</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendSupplierOrderEmail(order)}
                                      className="px-2 py-1 bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                      title={`Enviar pedido de ${order.productName} via E-mail para ${order.supplierName}`}
                                    >
                                      <Mail className="w-3 h-3" />
                                      <span>E-mail</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const doc = await handleGenerateSupplierOrderPDF(order);
                                        doc.save(`Ordem_de_Compra_${order.id}_${(order.supplierName || "Fornecedor").replace(/\s+/g, "_")}.pdf`);
                                        onShowToast?.("Documento PDF da Ordem de Compra baixado com logotipo!", "success");
                                      }}
                                      className="px-2 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white rounded-lg transition font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                      title={`Baixar Ordem de Compra oficial em PDF com logotipo`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>PDF (Logo)</span>
                                    </button>
                                    {order.status === "Pendente" && order.receiptStatus !== "Entregue" ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenDeliveryConfirmModal(order)}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-bold text-[9.5px] flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                                          title="Confirmar a entrega física deste pedido e lançar os produtos no stock final"
                                        >
                                          <CheckCircle className="w-3 h-3" />
                                          <span>Confirmar Entrega</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateOrderStatus(order.id, "Cancelado")}
                                          className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-bold text-[9px] cursor-pointer dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                        >
                                          Cancelar
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        {order.status === "Recebido" ? `Recebido em ${order.receivedDate || "Data confirmada"}` : "Pedido Cancelado"}
                                      </span>
                                    )}
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
              </div>
            </div>
          )}

          {supplierSubTab === "finance" && (
            /* NEW FINANCE & DEBT VIEW */
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Chart Comparison of Monthly Payments per Supplier */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3 dark:border-zinc-800">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-orange-500" />
                      Fluxo de Caixa Mensal por Fornecedor (Volume de Pagamentos)
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Comparativo dos valores totais pagos mensalmente para cada fornecedor parceiro nos últimos 6 meses.
                    </p>
                  </div>
                  
                  {/* Layout Selector */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold dark:bg-zinc-950">
                    <button
                      type="button"
                      onClick={() => setSupplierChartLayout("grouped")}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                        supplierChartLayout === "grouped"
                          ? "bg-white text-slate-850 shadow-xs dark:bg-zinc-800 dark:text-zinc-200"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Lado a Lado
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplierChartLayout("stacked")}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                        supplierChartLayout === "stacked"
                          ? "bg-white text-slate-850 shadow-xs dark:bg-zinc-800 dark:text-zinc-200"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Empilhado
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
                  {/* Chart view column */}
                  <div className="lg:col-span-3 min-h-[280px] flex items-center justify-center relative">
                    {supplierOrders.filter((o: any) => o.paymentStatus === "Pago" && o.status !== "Cancelado").length === 0 ? (
                      <div className="text-center space-y-2 py-8">
                        <TrendingUp className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-[11px] text-slate-400 italic">Sem registros de ordens pagas para exibir no gráfico.</p>
                        <p className="text-[10px] text-slate-500">Registre pagamentos como "Pago" para preencher o histórico.</p>
                      </div>
                    ) : (
                      <div className="w-full h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={supplierMonthlyChartData}
                            margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-zinc-800" />
                            <XAxis 
                              dataKey="month" 
                              tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis 
                              tickFormatter={(value) => `${value >= 1000 ? (value / 1000) + 'k' : value} MT`}
                              tick={{ fontSize: 9, fontWeight: 600, fill: '#64748b' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip 
                              formatter={(value: any) => [`${Number(value).toLocaleString()} MT`, 'Volume Pago']}
                              contentStyle={{
                                fontSize: '11px',
                                fontWeight: 'bold',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#ffffff',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                              }}
                              itemStyle={{ color: '#0f172a' }}
                            />
                            <Legend 
                              wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }}
                              iconSize={8}
                              iconType="circle"
                            />
                            {registeredSuppliers.map((supp, index) => {
                              const colors = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4", "#14b8a6", "#a855f7", "#f43f5e"];
                              const color = colors[index % colors.length];
                              return (
                                <Bar 
                                  key={supp.id} 
                                  dataKey={supp.name} 
                                  name={supp.name} 
                                  fill={color} 
                                  stackId={supplierChartLayout === "stacked" ? "a" : undefined}
                                  radius={supplierChartLayout === "stacked" ? 0 : [4, 4, 0, 0]}
                                />
                              );
                            })}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Dependency Insights Column */}
                  <div className="lg:col-span-1 bg-slate-50 p-4 rounded-2xl dark:bg-zinc-950/40 border border-slate-150/40 dark:border-zinc-850 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 text-slate-800 dark:text-zinc-200">
                        <TrendingUp className="w-4 h-4 text-orange-500" />
                        <h4 className="font-extrabold text-[11px] uppercase tracking-wider">Dependência Financeira</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                        Esta análise ajuda a identificar o nível de risco operacional de acordo com a distribuição de pagamentos aos parceiros.
                      </p>

                      {supplierDependencyStats.totalPaid > 0 ? (
                        <div className="space-y-3 pt-2">
                          <div className="border-t border-slate-200/60 dark:border-zinc-800/60 pt-2 space-y-1">
                            <span className="text-[9px] text-slate-400 uppercase font-bold">Total Liquidado</span>
                            <p className="text-sm font-black text-slate-800 dark:text-zinc-100 font-mono">
                              {supplierDependencyStats.totalPaid.toLocaleString()} MT
                            </p>
                          </div>

                          {supplierDependencyStats.dominant ? (
                            <div className="bg-red-50/75 border border-red-150 p-2.5 rounded-xl dark:bg-red-950/15 dark:border-red-900/30 text-[10px] text-red-850 dark:text-red-300 leading-relaxed font-medium">
                              <span className="font-extrabold block text-red-900 dark:text-red-450 flex items-center gap-1">
                                ⚠️ Concentração Elevada
                              </span>
                              O fornecedor <strong className="font-extrabold text-slate-800 dark:text-zinc-100">"{supplierDependencyStats.dominant.name}"</strong> representa <strong className="font-extrabold text-slate-800 dark:text-zinc-100">{supplierDependencyStats.dominant.percentage.toFixed(1)}%</strong> do total pago. Considere diversificar para reduzir o risco.
                            </div>
                          ) : (
                            <div className="bg-emerald-50/75 border border-emerald-150 p-2.5 rounded-xl dark:bg-emerald-950/15 dark:border-emerald-900/30 text-[10px] text-emerald-850 dark:text-emerald-300 leading-relaxed font-medium">
                              <span className="font-extrabold block text-emerald-900 dark:text-emerald-450 flex items-center gap-1">
                                ✅ Risco Controlado
                              </span>
                              Seus pagamentos estão distribuídos de forma saudável. Nenhum parceiro individual supera 40% dos custos liquidados.
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10.5px] italic text-slate-400">Aguardando dados de liquidação para gerar diagnósticos.</p>
                      )}
                    </div>

                    {supplierDependencyStats.totalPaid > 0 && (
                      <div className="space-y-1.5 border-t border-slate-200/60 dark:border-zinc-800/60 pt-3">
                        <span className="text-[9px] text-slate-400 uppercase font-extrabold block">Participação no Caixa (%)</span>
                        <div className="space-y-2">
                          {supplierDependencyStats.items.slice(0, 3).map((item) => (
                            <div key={item.id} className="space-y-1">
                              <div className="flex justify-between items-center text-[10px] font-bold text-slate-700 dark:text-zinc-300">
                                <span className="truncate max-w-[120px]">{item.name}</span>
                                <span className="font-mono">{item.percentage.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1 dark:bg-zinc-800">
                                <div 
                                  className="bg-orange-500 h-1 rounded-full" 
                                  style={{ width: `${Math.min(item.percentage, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
              {/* Left / Main table column */}
              <div className="xl:col-span-2 space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3 dark:border-zinc-800">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100">Balanço Financeiro por Fornecedor</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Acompanhamento consolidado de compras, pagamentos liquidados e contas a crédito.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportAllSuppliersFinance("csv")}
                        className="px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 font-bold rounded-xl text-[10px] flex items-center gap-1.5 transition cursor-pointer"
                        title="Exportar em formato CSV (Excel)"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        Exportar CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportAllSuppliersFinance("pdf")}
                        className="px-2.5 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/20 dark:text-orange-400 dark:hover:bg-orange-950/45 font-bold rounded-xl text-[10px] flex items-center gap-1.5 transition cursor-pointer"
                        title="Exportar Relatório PDF Detalhado"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Exportar PDF
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-150/80 rounded-2xl dark:border-zinc-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider dark:bg-zinc-950">
                          <th className="p-3.5">FORNECEDOR</th>
                          <th className="p-3.5 text-center">TOTAL COMPRAS</th>
                          <th className="p-3.5 text-right text-emerald-600 dark:text-emerald-450">TOTAL PAGO</th>
                          <th className="p-3.5 text-right text-red-600 dark:text-red-450">DÍVIDA CRÉDITO</th>
                          <th className="p-3.5 text-right text-amber-650 dark:text-amber-450">PENDENTE PGTO</th>
                          <th className="p-3.5 text-center">ESTADO</th>
                          <th className="p-3.5 text-center">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-zinc-800 text-[11px]">
                        {registeredSuppliers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 italic">Nenhum fornecedor cadastrado para balanço financeiro.</td>
                          </tr>
                        ) : (
                          registeredSuppliers.map((supp) => {
                            const sOrders = supplierOrders.filter((o: any) => o.supplierId === supp.id && o.status !== "Cancelado");
                            const totalPurchased = sOrders.reduce((sum: number, o: any) => sum + o.totalValue, 0);
                            const paidAmount = sOrders.filter((o: any) => o.paymentStatus === "Pago").reduce((sum: number, o: any) => sum + o.totalValue, 0);
                            const creditDebt = sOrders.filter((o: any) => o.paymentStatus === "Crédito").reduce((sum: number, o: any) => sum + o.totalValue, 0);
                            const pendingPayment = sOrders.filter((o: any) => o.paymentStatus === "Pendente").reduce((sum: number, o: any) => sum + o.totalValue, 0);
                            const hasActiveDebt = creditDebt > 0;
                            const hasPendingPayment = pendingPayment > 0;
                            const hasOverduePayment = sOrders.some((o: any) => isPaymentOverdue(o));

                            return (
                              <tr
                                key={supp.id}
                                className={`hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 cursor-pointer transition ${
                                  selectedFinanceSupplierId === supp.id 
                                    ? "bg-orange-50/25 dark:bg-orange-950/10 font-bold" 
                                    : hasOverduePayment 
                                      ? "bg-red-50/20 dark:bg-red-950/5 border-l-2 border-l-red-500 font-medium text-red-900 dark:text-red-300" 
                                      : ""
                                }`}
                                onClick={() => setSelectedFinanceSupplierId(supp.id)}
                              >
                                <td className="p-3.5">
                                  <span className="font-extrabold text-slate-800 dark:text-zinc-100 block">{supp.name}</span>
                                  <span className="text-[9px] text-slate-400 block font-mono">NUIT: {supp.nuit || "N/A"}</span>
                                </td>
                                <td className="p-3.5 text-center font-bold font-mono">
                                  {sOrders.length} ped.
                                  <span className="text-[9px] text-slate-400 block font-normal">{totalPurchased.toLocaleString()} MT</span>
                                </td>
                                <td className="p-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                  {paidAmount.toLocaleString()} MT
                                </td>
                                <td className="p-3.5 text-right font-black text-red-600 dark:text-red-400 font-mono">
                                  {creditDebt.toLocaleString()} MT
                                </td>
                                <td className="p-3.5 text-right font-bold text-amber-650 dark:text-amber-400 font-mono">
                                  {pendingPayment.toLocaleString()} MT
                                </td>
                                <td className="p-3.5 text-center">
                                  {hasOverduePayment ? (
                                    <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md bg-red-600 text-white dark:bg-red-700 dark:text-white animate-pulse inline-flex items-center gap-0.5">
                                      ⚠️ Atrasado
                                    </span>
                                  ) : creditDebt === 0 && pendingPayment === 0 ? (
                                    <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                                      Regularizado
                                    </span>
                                  ) : hasActiveDebt ? (
                                    <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 animate-pulse">
                                      Dívida Ativa
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md bg-amber-100 text-amber-850 dark:bg-amber-950/30 dark:text-amber-400">
                                      Pendente
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-1.5 justify-center">
                                    <button
                                      onClick={() => setSelectedFinanceSupplierId(supp.id)}
                                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-slate-700 dark:text-zinc-200 rounded-lg transition font-bold text-[9px] cursor-pointer"
                                    >
                                      Extrato
                                    </button>
                                    {(hasActiveDebt || hasPendingPayment) && (
                                      <button
                                        onClick={() => handleLiquidateAllDebts(supp.id, supp.name)}
                                        className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition font-bold text-[9px] cursor-pointer"
                                      >
                                        Liquidar
                                      </button>
                                    )}
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
              </div>

              {/* Right / Ledger detailed panel column */}
              <div className="xl:col-span-1">
                {selectedFinanceSupplierId ? (
                  (() => {
                    const supp = registeredSuppliers.find((s: any) => s.id === selectedFinanceSupplierId);
                    if (!supp) return (
                      <div className="bg-white p-5 rounded-2xl border border-slate-100 text-center text-xs dark:bg-zinc-900 dark:border-zinc-800 text-slate-400">
                        Selecione um parceiro para carregar as transações.
                      </div>
                    );

                    const sOrders = supplierOrders.filter((o: any) => o.supplierId === supp.id && o.status !== "Cancelado");
                    const paidAmount = sOrders.filter((o: any) => o.paymentStatus === "Pago").reduce((sum: number, o: any) => sum + o.totalValue, 0);
                    const creditDebt = sOrders.filter((o: any) => o.paymentStatus === "Crédito").reduce((sum: number, o: any) => sum + o.totalValue, 0);
                    const pendingPayment = sOrders.filter((o: any) => o.paymentStatus === "Pendente").reduce((sum: number, o: any) => sum + o.totalValue, 0);

                    return (
                      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 dark:bg-zinc-900 dark:border-zinc-800 animate-in slide-in-from-right duration-300">
                        <div className="border-b border-slate-100 pb-3 dark:border-zinc-800 flex justify-between items-start">
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-xs dark:text-zinc-100">Extrato Consolidado</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">{supp.name}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleExportSupplierLedgerPDF(supp)}
                              title="Exportar PDF do Extrato"
                              className="p-1.5 bg-slate-100 hover:bg-slate-250 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl transition cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedFinanceSupplierId(null)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-250 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-400 rounded-xl transition cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Supplier Metadata info */}
                        <div className="p-3 bg-slate-50 dark:bg-zinc-950/40 rounded-xl space-y-1 text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                          {supp.phone && <p>📞 {supp.phone}</p>}
                          {supp.email && <p>✉️ {supp.email}</p>}
                          {supp.nuit && <p>📄 NUIT: {supp.nuit}</p>}
                          {supp.address && <p>📍 {supp.address}</p>}
                        </div>

                        {/* Mini Balances Display */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-emerald-50/50 border border-emerald-100 p-2 rounded-xl text-center dark:bg-emerald-950/10 dark:border-emerald-900/30">
                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">PAGO</span>
                            <span className="text-[10px] font-mono font-black text-emerald-600 block">{paidAmount.toLocaleString()}</span>
                          </div>
                          <div className="bg-red-50/50 border border-red-100 p-2 rounded-xl text-center dark:bg-red-950/10 dark:border-red-900/30">
                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">CRÉDITO</span>
                            <span className="text-[10px] font-mono font-black text-red-600 block">{creditDebt.toLocaleString()}</span>
                          </div>
                          <div className="bg-amber-50/50 border border-amber-100 p-2 rounded-xl text-center dark:bg-amber-950/10 dark:border-amber-900/30">
                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">PENDENTE</span>
                            <span className="text-[10px] font-mono font-black text-amber-600 block">{pendingPayment.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Transaction History Items */}
                        <div className="space-y-2.5 max-h-[290px] overflow-y-auto custom-scrollbar pr-1">
                          <h5 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-50 pb-1.5 dark:border-zinc-800">Historial de Transações</h5>
                          {sOrders.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic text-center py-6">Nenhum pedido efetuado com este parceiro.</p>
                          ) : (
                            sOrders.map((order: any) => {
                              const isOverdue = isPaymentOverdue(order);
                              const calculatedDueDate = order.paymentDueDate || (order.requestDate ? (() => {
                                const d = new Date(order.requestDate);
                                d.setDate(d.getDate() + 15);
                                return d.toISOString().split("T")[0];
                              })() : "");

                              return (
                                <div
                                  key={order.id}
                                  className={`p-2.5 rounded-xl border space-y-2 transition ${
                                    isOverdue
                                      ? "bg-red-50/60 border-red-200 dark:bg-red-950/15 dark:border-red-900/30 shadow-sm shadow-red-500/5"
                                      : "bg-slate-50/30 border-slate-100 dark:bg-zinc-950/20 dark:border-zinc-800"
                                  }`}
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <span className="font-extrabold text-slate-800 dark:text-zinc-100 text-[11px] block">{order.productName}</span>
                                      <span className="text-[9px] text-slate-400 block font-mono">{order.requestDate} • {order.quantityRequested} un</span>
                                      {order.paymentStatus !== "Pago" && isOverdue && (
                                        <span className="text-red-600 dark:text-red-400 font-bold text-[9px] block mt-0.5 animate-pulse">
                                          ⚠️ ATRASADO (Prazo: {calculatedDueDate})
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-black text-slate-800 dark:text-zinc-100 text-[11px] font-mono shrink-0">
                                      {order.totalValue.toLocaleString()} MT
                                    </span>
                                  </div>

                                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100/50 dark:border-zinc-850">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                    order.status === "Recebido" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-450" :
                                    order.status === "Cancelado" ? "bg-slate-100 text-slate-600 dark:bg-zinc-850 dark:text-zinc-400" :
                                    "bg-amber-50 text-amber-850 dark:bg-amber-950/30 dark:text-amber-450"
                                  }`}>
                                    {order.status}
                                  </span>

                                  {/* Payment status dropdown for individual order inside details */}
                                  <select
                                    value={order.paymentStatus}
                                    onChange={(e) => handleUpdateOrderPaymentStatus(order.id, e.target.value as any)}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold border outline-none text-center cursor-pointer ${
                                      order.paymentStatus === "Pago" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/20" :
                                      order.paymentStatus === "Crédito" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-450 dark:border-red-900/20" :
                                      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-450 dark:border-amber-900/20"
                                    }`}
                                  >
                                    <option value="Pago">Pago</option>
                                    <option value="Crédito">Crédito</option>
                                    <option value="Pendente">Pendente</option>
                                  </select>
                                </div>
                              </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center dark:bg-zinc-900 dark:border-zinc-800 flex flex-col items-center justify-center gap-3 text-slate-400 py-16 h-full shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-450 dark:bg-zinc-950">
                      <CreditCard className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-700 dark:text-zinc-200">Nenhum Extrato Selecionado</h4>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">Clique no botão "Extrato" de qualquer fornecedor para carregar o histórico consolidado de faturamento.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {supplierSubTab === "config" && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 dark:bg-zinc-900 dark:border-zinc-800">
                <div className="flex items-start gap-4 border-b border-slate-100 pb-4 dark:border-zinc-800">
                  <div className="p-3 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-450 shrink-0">
                    <Sliders className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                      Configurações do Módulo de Fornecedores
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Personalize regras globais de faturamento, prazos de pagamento e critérios de tolerância para alertas de atraso.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      Dias de Tolerância para Pagamento Vencido
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        min="0"
                        max="180"
                        value={settings?.supplierOverdueToleranceDays ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          onUpdateSettings?.({ supplierOverdueToleranceDays: val });
                          onShowToast?.(`Tolerância atualizada para ${val} dias.`, "success");
                        }}
                        className="w-32 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 text-slate-800 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                      />
                      <span className="flex items-center text-xs text-slate-400 font-bold">Dias de tolerância</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                      Este número de dias será adicionado à data de vencimento combinada de cada pedido de stock antes de o sistema destacar o fornecedor e o pedido com o status <span className="text-red-500 font-extrabold">⚠️ Atrasado</span> nas tabelas de controle e painéis de dependência financeira.
                    </p>
                  </div>

                  {/* Visual Calculation / Interactive Preview Card */}
                  <div className="bg-slate-50 border border-slate-150 p-4.5 rounded-2xl dark:bg-zinc-950/40 dark:border-zinc-850 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-orange-500" /> Cálculo Prático de Prazo de Alerta
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-100 dark:bg-zinc-900 dark:border-zinc-800">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Data de Vencimento</span>
                        <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 font-mono">20/07/2026</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-100 dark:bg-zinc-900 dark:border-zinc-800">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Tolerância Aplicada</span>
                        <span className="text-xs font-extrabold text-orange-600 font-mono">+{settings?.supplierOverdueToleranceDays ?? 0} dias</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-100 dark:bg-zinc-900 dark:border-zinc-800">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Início dos Alertas</span>
                        <span className="text-xs font-extrabold text-red-600 font-mono">
                          {(() => {
                            const d = new Date(2026, 6, 20); // July 20th, 2026
                            d.setDate(d.getDate() + Number(settings?.supplierOverdueToleranceDays ?? 0));
                            const day = String(d.getDate()).padStart(2, "0");
                            const month = String(d.getMonth() + 1).padStart(2, "0");
                            return `${day}/${month}/${d.getFullYear()}`;
                          })()}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-[10px] text-slate-500 leading-relaxed text-center italic">
                      {(settings?.supplierOverdueToleranceDays ?? 0) === 0 ? (
                        "Nenhuma tolerância configurada: cobranças não liquidadas serão marcadas como atrasadas imediatamente no dia seguinte ao vencimento."
                      ) : (
                        `Com ${settings?.supplierOverdueToleranceDays} dias de carência, as faturas só receberão destaque vermelho de cobrança vencida a partir do dia ${(() => {
                          const d = new Date(2026, 6, 20);
                          d.setDate(d.getDate() + Number(settings?.supplierOverdueToleranceDays ?? 0));
                          const day = String(d.getDate()).padStart(2, "0");
                          const month = String(d.getMonth() + 1).padStart(2, "0");
                          return `${day}/${month}/${d.getFullYear()}`;
                        })()}.`
                      )}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-between items-center dark:border-zinc-800">
                  <span className="text-[10px] text-slate-400 font-mono">Configuração instantânea • Persistida localmente</span>
                  <button
                    type="button"
                    onClick={() => {
                      onShowToast?.("Configurações do módulo salvas com sucesso!", "success");
                    }}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-sm"
                  >
                    Confirmar & Guardar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Register/Edit Supplier Modal Overlay */}
      {isSupplierFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="bg-slate-950 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-orange-500" />
                  {editingSupplierId ? "Editar Fornecedor" : "Cadastrar Novo Fornecedor"}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Cadastre os canais de comunicação direta para reposições de estoque.</p>
              </div>
              <button
                onClick={() => setIsSupplierFormOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Comercial / Fornecedor *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CDM - Cervejas de Moçambique, Distribuidora Sul"
                  value={supplierNameInput}
                  onChange={(e) => setSupplierNameInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Telemóvel / Telefone</label>
                  <input
                    type="text"
                    placeholder="Ex: +258 84 123 4567"
                    value={supplierPhoneInput}
                    onChange={(e) => setSupplierPhoneInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Email Comercial</label>
                  <input
                    type="email"
                    placeholder="Ex: comercial@cdm.co.mz"
                    value={supplierEmailInput}
                    onChange={(e) => setSupplierEmailInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">NIF / NUIT (Moçambique)</label>
                  <input
                    type="text"
                    placeholder="Ex: 400123456"
                    value={supplierNuitInput}
                    onChange={(e) => setSupplierNuitInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Endereço Comercial / Sede</label>
                  <input
                    type="text"
                    placeholder="Ex: Av. de Moçambique, Maputo"
                    value={supplierAddressInput}
                    onChange={(e) => setSupplierAddressInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsSupplierFormOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 bg-white text-slate-750 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-350"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-md shadow-orange-500/10"
                >
                  {editingSupplierId ? "Salvar Alterações" : "Registrar Fornecedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Stock Request (Supplier Order) Modal Overlay */}
      {isOrderFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="bg-slate-950 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-orange-500 animate-bounce" />
                  Efetuar Pedido de Stock ao Fornecedor
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Crie uma ordem de compra para reabastecer seu inventário.</p>
              </div>
              <button
                onClick={() => setIsOrderFormOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Selecione o Fornecedor *</label>
                <select
                  required
                  value={orderSupplierId}
                  onChange={(e) => setOrderSupplierId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none cursor-pointer text-slate-800 dark:bg-zinc-950 dark:border-zinc-850"
                >
                  <option value="">-- Escolher Fornecedor Cadastrado --</option>
                  {registeredSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} (NUIT: {s.nuit || "N/A"})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Selecione o Produto *</label>
                <select
                  required
                  value={orderProductId}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    setOrderProductId(prodId);
                    const prod = products.find(p => p.id === prodId);
                    if (prod) {
                      setOrderUnitCost(prod.costPrice);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none cursor-pointer text-slate-800 dark:bg-zinc-950 dark:border-zinc-850"
                >
                  <option value="">-- Escolher Produto do Inventário --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (SKU: {p.code} | Stock: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade Solicitada *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Quantidade"
                    value={orderQtyRequested || ""}
                    onChange={(e) => setOrderQtyRequested(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Preço de Custo (MT) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="Preço Unitário"
                    value={orderUnitCost || ""}
                    onChange={(e) => setOrderUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Estado do Pagamento inicial</label>
                <select
                  value={orderPaymentStatus}
                  onChange={(e) => setOrderPaymentStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none cursor-pointer text-slate-800 dark:bg-zinc-950 dark:border-zinc-850"
                >
                  <option value="Pago">Pago à Vista 🟢</option>
                  <option value="Crédito">Comprar a Crédito (Fornecedor) 🔴</option>
                  <option value="Pendente">Pagamento Pendente 🟡</option>
                </select>
              </div>

              {orderPaymentStatus !== "Pago" && (
                <div className="space-y-1 animate-in slide-in-from-top duration-200">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Prazo de Vencimento do Pagamento</label>
                  <input
                    type="date"
                    value={orderPaymentDueDate}
                    onChange={(e) => setOrderPaymentDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850 text-slate-800"
                  />
                  <p className="text-[9px] text-slate-400">Deixe em branco para assumir o prazo padrão de 15 dias.</p>
                </div>
              )}

              <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-zinc-800">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">
                  Canal de Envio ao Fornecedor:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderDispatchChannel("WHATSAPP")}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      orderDispatchChannel === "WHATSAPP"
                        ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderDispatchChannel("EMAIL")}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      orderDispatchChannel === "EMAIL"
                        ? "bg-blue-600 text-white border-blue-700 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>E-mail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderDispatchChannel("NONE")}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      orderDispatchChannel === "NONE"
                        ? "bg-slate-700 text-white border-slate-800 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Só Salvar</span>
                  </button>
                </div>
              </div>

              {orderQtyRequested > 0 && orderUnitCost > 0 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-[11px] font-bold text-orange-850 flex justify-between items-center">
                  <span>Valor Estimado do Pedido:</span>
                  <span className="font-mono text-xs">{(orderQtyRequested * orderUnitCost).toLocaleString()} MT</span>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsOrderFormOpen(false)}
                  className="w-1/3 py-2.5 border border-slate-200 bg-white text-slate-750 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-350"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`w-2/3 py-2.5 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-md flex items-center justify-center gap-1.5 ${
                    orderDispatchChannel === "WHATSAPP"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10"
                      : orderDispatchChannel === "EMAIL"
                      ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
                      : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/10"
                  }`}
                >
                  {orderDispatchChannel === "WHATSAPP" ? (
                    <>
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Gravar & Enviar WhatsApp</span>
                    </>
                  ) : orderDispatchChannel === "EMAIL" ? (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>Gravar & Enviar E-mail</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Apenas Gravar Pedido</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Supplier Order Email Modal Overlay */}
      {isOrderEmailModalOpen && selectedOrderForEmail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  Enviar Pedido ao Fornecedor por E-mail
                </h3>
                <p className="text-[10px] text-blue-200 mt-0.5">
                  Ref do Pedido: <span className="font-mono font-bold text-white">{selectedOrderForEmail.id}</span> • {selectedOrderForEmail.supplierName}
                </p>
              </div>
              <button
                onClick={() => setIsOrderEmailModalOpen(false)}
                className="p-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* PDF Document Status Badge */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 dark:bg-emerald-950/30 dark:border-emerald-800/40">
                <div className="p-2 bg-emerald-500 text-white rounded-lg shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    PDF com Logotipo Gerado
                  </h4>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">
                    O documento oficial da Ordem de Compra foi descarregado com o logotipo da sua empresa. Anexe este ficheiro ao enviar o e-mail.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const doc = await handleGenerateSupplierOrderPDF(selectedOrderForEmail);
                    doc.save(`Ordem_de_Compra_${selectedOrderForEmail.id}_${(selectedOrderForEmail.supplierName || "Fornecedor").replace(/\s+/g, "_")}.pdf`);
                    onShowToast?.("PDF baixado novamente com logotipo!", "success");
                  }}
                  className="px-2.5 py-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg text-[10px] font-bold cursor-pointer transition shrink-0 dark:bg-zinc-800 dark:border-emerald-700 dark:text-emerald-300"
                  title="Descarregar PDF do pedido novamente"
                >
                  Re-descarregar
                </button>
              </div>

              {/* Recipient Email Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                  <span>E-mail do Fornecedor (Destinatário) *</span>
                  {!orderEmailRecipient.trim() && (
                    <span className="text-rose-500 text-[10px] font-normal">Insira o e-mail de destino</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={orderEmailRecipient}
                    onChange={(e) => setOrderEmailRecipient(e.target.value)}
                    placeholder="ex: fornecedor@empresa.co.mz"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-8 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-white"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              {/* Email Subject */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Assunto do E-mail</label>
                <input
                  type="text"
                  value={orderEmailSubject}
                  onChange={(e) => setOrderEmailSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-white"
                />
              </div>

              {/* Email Body Text */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Conteúdo da Mensagem</label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(orderEmailBody);
                      onShowToast?.("Texto do pedido copiado para a área de transferência!", "info");
                    }}
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold dark:text-blue-400 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copiar Texto
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={orderEmailBody}
                  onChange={(e) => setOrderEmailBody(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-200"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsOrderEmailModalOpen(false)}
                  className="w-1/3 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSendEmail}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Abrir Cliente de E-mail (Enviar)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ENTREGA FÍSICA & ATUALIZAR STOCK */}
      {deliveryConfirmOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 dark:bg-zinc-900 dark:border-zinc-800">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                    Confirmar Entrega Física da Ordem
                  </h3>
                  <p className="text-[10px] text-emerald-200 mt-0.5">
                    Ref: <span className="font-mono font-bold text-white">{deliveryConfirmOrder.id}</span> • Fornecedor: {deliveryConfirmOrder.supplierName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeliveryConfirmOrder(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmPhysicalDelivery} className="p-5 space-y-4 text-xs">
              {/* Product and Stock Info Banner */}
              {(() => {
                const product = products.find(p => p.id === deliveryConfirmOrder.productId);
                const currentStock = product ? product.stock : 0;
                const projectedStock = currentStock + (deliveryQty || 0);

                return (
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 dark:bg-zinc-950 dark:border-zinc-800">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9.5px] uppercase font-bold text-slate-400 font-mono block">Item a Receber</span>
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-zinc-100">{deliveryConfirmOrder.productName}</strong>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        Pedido em: {deliveryConfirmOrder.requestDate}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 dark:border-zinc-800 text-center font-mono">
                      <div className="bg-white p-2 rounded-lg border border-slate-150 dark:bg-zinc-900 dark:border-zinc-800">
                        <span className="text-[9px] text-slate-400 block font-sans">Stock Atual</span>
                        <span className="font-bold text-slate-700 dark:text-zinc-200">{currentStock} un</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-150 dark:bg-zinc-900 dark:border-zinc-800">
                        <span className="text-[9px] text-slate-400 block font-sans">Solicitado</span>
                        <span className="font-bold text-orange-600">{deliveryConfirmOrder.quantityRequested} un</span>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50">
                        <span className="text-[9px] text-emerald-700 block font-sans font-bold">Stock Final Previsto</span>
                        <span className="font-black text-emerald-700 dark:text-emerald-400">{projectedStock} un</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Quantities & Costs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase dark:text-zinc-300">
                    Quantidade Entregue (un) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={deliveryQty || ""}
                    onChange={(e) => setDeliveryQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none focus:border-emerald-500 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                    placeholder="Quantidade"
                  />
                  <p className="text-[9px] text-slate-400">Quantidade física contada e conferida na recepção.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase dark:text-zinc-300">
                    Preço de Custo Efetivo (MT) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={deliveryCost || ""}
                    onChange={(e) => setDeliveryCost(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-xs outline-none focus:border-emerald-500 dark:bg-zinc-950 dark:border-zinc-850 dark:text-zinc-100"
                    placeholder="Custo unitário"
                  />
                  <p className="text-[9px] text-slate-400">Total: {((deliveryQty || 0) * (deliveryCost || 0)).toLocaleString()} MT</p>
                </div>
              </div>

              {/* Cost Price Update Checkbox */}
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition dark:bg-zinc-950 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={updateProductCostPrice}
                  onChange={(e) => setUpdateProductCostPrice(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                  Atualizar preço de custo no cadastro do produto para <strong>{deliveryCost.toLocaleString()} MT</strong>
                </span>
              </label>

              {/* Delivery Date & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase dark:text-zinc-300">
                    Data da Entrega Física
                  </label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850 text-slate-800 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase dark:text-zinc-300">
                    Nº Guia / Fatura de Entrega
                  </label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Ex: Guia #9823 / Lote A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs outline-none dark:bg-zinc-950 dark:border-zinc-850 text-slate-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Assurance Banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[10.5px] text-emerald-900 leading-relaxed dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Garantia de Integridade de Stock:</strong>
                  Ao clicar em <em>Confirmar Entrega</em>, o Status de Recebimento passará para <strong>"Entregue"</strong> e o stock final receberá exatamente <strong>+{deliveryQty} unidades</strong>.
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDeliveryConfirmOrder(null)}
                  disabled={isProcessingDelivery}
                  className="w-1/3 py-2.5 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingDelivery || deliveryQty <= 0}
                  className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs cursor-pointer transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isProcessingDelivery ? "Creditando no Stock..." : "Confirmar Entrega & Entrar no Stock"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-TAB: THRESHOLDS & ALERTS */}
      {activeModuleTab === "thresholds" && (
        <div className="animate-in fade-in-50 duration-150">
          <StockThresholdsSettings
            products={products}
            settings={settings || ({} as SystemSettings)}
            onUpdateSettings={onUpdateSettings || (() => {})}
            onUpdateProduct={onUpdateProduct}
            onAddAuditLog={onAddAuditLog}
            onShowToast={onShowToast}
            currentRole={currentRole}
            currency={currency}
          />
        </div>
      )}

      {flyerProduct && (
        <PromoFlyerGenerator
          product={flyerProduct}
          allProducts={products}
          isOpen={isFlyerGeneratorOpen}
          onClose={() => {
            setIsFlyerGeneratorOpen(false);
            setFlyerProduct(null);
          }}
          currency={currency}
          onShowToast={(msg, type) => {
            if (onShowToast) onShowToast(msg, type === "success" ? "success" : type === "error" ? "error" : "info");
          }}
          settings={settings}
        />
      )}

      {showBulkMarkupModal && (
        <BulkMarkupModal
          isOpen={showBulkMarkupModal}
          onClose={() => setShowBulkMarkupModal(false)}
          products={products}
          selectedProductIds={selectedProductIds}
          currency={currency}
          onApplyBulkUpdate={handleApplyBulkMarkup}
          onAddAuditLog={onAddAuditLog}
        />
      )}

    </div>
  );
}

export default memo(StockModule);
