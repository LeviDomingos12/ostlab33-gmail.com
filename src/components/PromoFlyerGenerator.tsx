import React, { useState, useEffect, useRef } from "react";
import { 
  Printer, Copy, Sparkles, 
  Download, MessageSquare, Check, RefreshCw, Palette, Trash2, Search
} from "lucide-react";
import { Product } from "../types";
import { authenticatedFetch } from "../lib/apiClient";

interface PromoFlyerGeneratorProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  currency?: string;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
  settings?: any; // App settings including company logo, name, and slogan
  allProducts?: Product[]; // Available products list for multi-product poster mode
}

type ThemeType = "SIGNATURE_ORANGE" | "SUPERMARKET_RED" | "COSMIC_DARK" | "NEON_CYBER" | "MINIMALIST_LIGHT";

// Helper function to load images asynchronously on Canvas without blocking
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
};

export function PromoFlyerGenerator({ 
  product, 
  isOpen, 
  onClose, 
  currency = "MT",
  onShowToast,
  settings,
  allProducts = []
}: PromoFlyerGeneratorProps) {
  
  // Layout and mode selection
  const [posterMode, setPosterMode] = useState<"SINGLE" | "MULTI">("SINGLE");
  
  // Selected products for MULTI mode (starts with the active product)
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  
  // Custom price overrides per product ID
  const [productPrices, setProductPrices] = useState<Record<string, { promoPrice: number; originalPrice: number }>>({});
  
  // Slogans and details
  const [slogan, setSlogan] = useState("SUPER PROMOÇÃO IMPERDÍVEL!");
  const [customInfo, setCustomInfo] = useState("Aproveite hoje mesmo! Estoque limitado.");
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>("SIGNATURE_ORANGE");
  
  // Searching and list filtering inside the customizer
  const [searchQuery, setSearchQuery] = useState("");
  const [aiSlogans, setAiSlogans] = useState<string[]>([]);
  const [isGeneratingSlogans, setIsGeneratingSlogans] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const flyerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize selected product and prices
  useEffect(() => {
    if (product) {
      setSelectedProducts([product]);
      const defaultOriginal = product.costPrice && product.costPrice > 0
        ? Math.round(product.costPrice * 1.4)
        : Math.round(product.salePrice * 1.25);
      const original = defaultOriginal > product.salePrice ? defaultOriginal : Math.round(product.salePrice * 1.25);

      setProductPrices({
        [product.id]: {
          promoPrice: product.salePrice,
          originalPrice: original
        }
      });
    }
  }, [product]);

  if (!isOpen) return null;

  // Single mode prices helpers (backward compatible, linked directly to product[0])
  const getSinglePrices = () => {
    const prices = productPrices[product.id] || { promoPrice: product.salePrice, originalPrice: Math.round(product.salePrice * 1.25) };
    const discount = Math.max(0, Math.round(((prices.originalPrice - prices.promoPrice) / prices.originalPrice) * 100));
    return { ...prices, discount };
  };

  // Get pricing details for a product
  const getProductPricesAndDiscount = (prod: Product) => {
    const prices = productPrices[prod.id] || {
      promoPrice: prod.salePrice,
      originalPrice: prod.costPrice && prod.costPrice > 0 
        ? Math.round(prod.costPrice * 1.4) 
        : Math.round(prod.salePrice * 1.25)
    };
    if (prices.originalPrice <= prices.promoPrice) {
      prices.originalPrice = Math.round(prices.promoPrice * 1.25);
    }
    const discount = Math.max(0, Math.round(((prices.originalPrice - prices.promoPrice) / prices.originalPrice) * 100));
    return { ...prices, discount };
  };

  // Update specific product pricing
  const handleUpdatePrice = (prodId: string, field: "promoPrice" | "originalPrice", value: number) => {
    setProductPrices(prev => ({
      ...prev,
      [prodId]: {
        ...prev[prodId] || { promoPrice: 0, originalPrice: 0 },
        [field]: value
      }
    }));
  };

  // Add product to poster
  const handleAddProduct = (prod: Product) => {
    if (selectedProducts.find(p => p.id === prod.id)) {
      if (onShowToast) onShowToast("Este produto já foi adicionado ao cartaz.", "warning");
      return;
    }
    if (selectedProducts.length >= 4) {
      if (onShowToast) onShowToast("O cartaz comporta um limite máximo de 4 produtos.", "warning");
      return;
    }

    const defaultOriginal = prod.costPrice && prod.costPrice > 0
      ? Math.round(prod.costPrice * 1.4)
      : Math.round(prod.salePrice * 1.25);
    const original = defaultOriginal > prod.salePrice ? defaultOriginal : Math.round(prod.salePrice * 1.25);

    setProductPrices(prev => ({
      ...prev,
      [prod.id]: {
        promoPrice: prod.salePrice,
        originalPrice: original
      }
    }));

    setSelectedProducts(prev => [...prev, prod]);
    setSearchQuery("");
    if (onShowToast) onShowToast(`${prod.name} adicionado ao cartaz!`, "success");
  };

  // Remove product from poster
  const handleRemoveProduct = (prodId: string) => {
    if (selectedProducts.length <= 1) {
      if (onShowToast) onShowToast("É necessário manter pelo menos um produto no cartaz.", "warning");
      return;
    }
    setSelectedProducts(prev => prev.filter(p => p.id !== prodId));
  };

  // Generate Slogans with Gemini AI (Server-Side Key)
  const handleGenerateSlogans = async () => {
    setIsGeneratingSlogans(true);
    try {
      const activeP = selectedProducts[0] || product;
      const { discount } = getProductPricesAndDiscount(activeP);
      
      const response = await authenticatedFetch("/api/gemini/marketing/slogan", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName: activeP.name,
          discountPercent: discount > 0 ? discount : 20,
          price: productPrices[activeP.id]?.promoPrice || activeP.salePrice
        })
      });

      if (!response.ok) throw new Error("Falha de resposta");
      
      const data = await response.json();
      if (data.slogans && data.slogans.length > 0) {
        setAiSlogans(data.slogans);
        setSlogan(data.slogans[0]);
        if (onShowToast) {
          onShowToast("Slogans promocionais gerados usando IA! 🚀", "success");
        }
      }
    } catch (error) {
      console.error("Error generating slogans:", error);
      const fallbacks = [
        "PROMOÇÕES ESPECIAIS DA SEMANA!",
        "PREÇO BAIXO E QUALIDADE MÁXIMA!",
        "DESCONTOS ARRASADORES HOJE!",
        "SÓ HOJE - ESTOQUE IMbatível!"
      ];
      setAiSlogans(fallbacks);
      setSlogan(fallbacks[0]);
      if (onShowToast) {
        onShowToast("Slogans locais alternativos carregados.", "info");
      }
    } finally {
      setIsGeneratingSlogans(false);
    }
  };

  // Generate WhatsApp message and copy
  const getShareableText = () => {
    const companyLabel = settings?.companyName || "OST Vendas";
    let text = `🔥 *SUPER PROMOÇÕES ${companyLabel.toUpperCase()}!* 🔥\n\n`;
    text += `📢 *${slogan}*\n\n`;

    selectedProducts.forEach((p, idx) => {
      const { promoPrice, originalPrice, discount } = getProductPricesAndDiscount(p);
      text += `🛍️ *${idx + 1}. ${p.name}*\n`;
      text += `💰 De ~${originalPrice.toLocaleString()} ${currency}~ por apenas *${promoPrice.toLocaleString()} ${currency}*!\n`;
      if (discount > 0) text += `📉 Economize *${discount}%* de desconto real!\n`;
      text += `\n`;
    });

    text += `📌 _${customInfo}_\n`;
    text += `💳 Aceitamos M-Pesa, E-Mola, Cartões e Cash.\n`;
    text += `📍 Visite-nos e aproveite hoje mesmo!`;
    return text;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getShareableText());
    setCopiedText(true);
    if (onShowToast) onShowToast("Mensagem publicitária copiada para a área de transferência!", "success");
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getShareableText());
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Print function
  const handlePrint = () => {
    const printContent = flyerRef.current?.innerHTML;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      if (onShowToast) onShowToast("Por favor, permita popups para imprimir.", "warning");
      return;
    }

    const themeStyles = `
      body {
        margin: 0;
        padding: 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #ffffff;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
      }
      .printable-card {
        width: 600px;
        min-height: 800px;
        border: 1px solid #e2e8f0;
        border-radius: 28px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
        overflow: hidden;
        page-break-inside: avoid;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @media print {
        body { padding: 0; background: none; }
        .printable-card { border: none; box-shadow: none; margin: 0 auto; width: 100%; max-width: 800px; }
      }
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Cartaz Promocional - ${settings?.companyName || "OST Vendas"}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>${themeStyles}</style>
        </head>
        <body>
          <div class="printable-card">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Drawing helper for individual product in high-resolution canvas
  const drawProductInBox = async (
    ctx: CanvasRenderingContext2D,
    p: Product,
    px: number,
    py: number,
    pw: number,
    ph: number,
    isFeatured: boolean
  ) => {
    const { promoPrice, originalPrice, discount } = getProductPricesAndDiscount(p);

    // Draw card background
    ctx.save();
    ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#ffffff" : "rgba(255, 255, 255, 0.08)";
    ctx.strokeStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#cbd5e1" : "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isFeatured) {
      // Landscape layout for top featured item in 3-product layout
      const imgX = px + 120;
      const imgY = py + ph / 2;
      const imgSize = 160;

      // Draw background circle for image
      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f1f5f9" : "rgba(255, 255, 255, 0.1)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(imgX, imgY, imgSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (p.image) {
        try {
          const prodImg = await loadImage(p.image);
          ctx.save();
          ctx.beginPath();
          ctx.arc(imgX, imgY, imgSize / 2 - 2, 0, Math.PI * 2);
          ctx.clip();
          const ratio = Math.max(imgSize / prodImg.width, imgSize / prodImg.height);
          const w = prodImg.width * ratio;
          const h = prodImg.height * ratio;
          ctx.drawImage(prodImg, imgX - w / 2, imgY - h / 2, w, h);
          ctx.restore();
        } catch (err) {
          ctx.save();
          ctx.font = "65px serif";
          ctx.textAlign = "center";
          ctx.fillText(p.emoji || "📦", imgX, imgY + 22);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.font = "65px serif";
        ctx.textAlign = "center";
        ctx.fillText(p.emoji || "📦", imgX, imgY + 22);
        ctx.restore();
      }

      // Details right side
      const rx = px + 220;
      
      // Name
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#0f172a" : "#ffffff";
      ctx.font = "black 25px 'Inter', sans-serif";
      ctx.fillText(p.name.toUpperCase(), rx, py + 52);

      // Category
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "#ffffff";
      ctx.font = "bold 13px 'Inter', sans-serif";
      ctx.fillText(`CATEGORIA: ${p.category.toUpperCase()}`, rx, py + 80);
      ctx.restore();

      // Prices frame
      const prY = py + 105;
      const prW = pw - 240;
      const prH = 110;

      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f8fafc" : "rgba(0, 0, 0, 0.15)";
      ctx.strokeStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(rx, prY, prW, prH, 16);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Old price left
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "#ffffff";
      ctx.font = "bold 11px 'Inter', sans-serif";
      ctx.fillText("PREÇO ANTERIOR", rx + 18, prY + 32);
      ctx.font = "bold 18px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#94a3b8" : "#ffffff";
      const oldPText = `${originalPrice.toLocaleString()} ${currency}`;
      ctx.fillText(oldPText, rx + 18, prY + 60);
      const oldPWidth = ctx.measureText(oldPText).width;
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(rx + 18 - 2, prY + 54);
      ctx.lineTo(rx + 18 + oldPWidth + 2, prY + 54);
      ctx.stroke();
      ctx.restore();

      // Promo Price right
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff";
      ctx.font = "bold 11px 'Inter', sans-serif";
      ctx.fillText("OFERTA ESPECIAL", rx + prW - 18, prY + 32);
      ctx.font = "black 30px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : selectedTheme === "NEON_CYBER" ? "#22d3ee" : selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff";
      ctx.fillText(`${promoPrice.toLocaleString()} ${currency}`, rx + prW - 18, prY + 74);
      ctx.restore();

      // Discount overlay
      if (discount > 0) {
        ctx.save();
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(rx + 18, prY + 74, 96, 24, 6);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#1e293b" : "#ffffff";
        ctx.font = "black 10px 'Inter', sans-serif";
        ctx.fillText(`-${discount}% OFF`, rx + 18 + 48, prY + 90);
        ctx.restore();
      }

    } else {
      // Normal portrait box layout (grid style)
      const imgX = px + pw / 2;
      const imgY = py + 78;
      const imgSize = 110;

      // Draw background circle for image
      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f1f5f9" : "rgba(255, 255, 255, 0.1)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(imgX, imgY, imgSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (p.image) {
        try {
          const prodImg = await loadImage(p.image);
          ctx.save();
          ctx.beginPath();
          ctx.arc(imgX, imgY, imgSize / 2 - 1.5, 0, Math.PI * 2);
          ctx.clip();
          const ratio = Math.max(imgSize / prodImg.width, imgSize / prodImg.height);
          const w = prodImg.width * ratio;
          const h = prodImg.height * ratio;
          ctx.drawImage(prodImg, imgX - w / 2, imgY - h / 2, w, h);
          ctx.restore();
        } catch (err) {
          ctx.save();
          ctx.font = "46px serif";
          ctx.textAlign = "center";
          ctx.fillText(p.emoji || "📦", imgX, imgY + 16);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.font = "46px serif";
        ctx.textAlign = "center";
        ctx.fillText(p.emoji || "📦", imgX, imgY + 16);
        ctx.restore();
      }

      // Title
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#0f172a" : "#ffffff";
      ctx.font = "black 15px 'Inter', sans-serif";
      let displayName = p.name.toUpperCase();
      if (ctx.measureText(displayName).width > pw - 30) {
        displayName = p.name.substring(0, 16).toUpperCase() + "...";
      }
      ctx.fillText(displayName, px + pw / 2, py + 154);
      ctx.restore();

      // Pricing container
      const prY = py + 174;
      const prW = pw - 32;
      const prH = 78;
      const prX = px + 16;

      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f8fafc" : "rgba(0, 0, 0, 0.15)";
      ctx.strokeStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(prX, prY, prW, prH, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Original price
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "#ffffff";
      ctx.font = "bold 9px 'Inter', sans-serif";
      ctx.fillText("DE", prX + 14, prY + 26);
      ctx.font = "bold 13px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#94a3b8" : "#ffffff";
      const oldPText = `${originalPrice.toLocaleString()} ${currency}`;
      ctx.fillText(oldPText, prX + 14, prY + 48);
      const oldPWidth = ctx.measureText(oldPText).width;
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prX + 14 - 1, prY + 43);
      ctx.lineTo(prX + 14 + oldPWidth + 1, prY + 43);
      ctx.stroke();
      ctx.restore();

      // Promo price
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff";
      ctx.font = "bold 9px 'Inter', sans-serif";
      ctx.fillText("POR APENAS", prX + prW - 14, prY + 26);
      ctx.font = "black 19px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : selectedTheme === "NEON_CYBER" ? "#ffffff" : selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff";
      ctx.fillText(`${promoPrice.toLocaleString()} ${currency}`, prX + prW - 14, prY + 52);
      ctx.restore();

      // Discount label
      if (discount > 0) {
        ctx.save();
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(px + 16, py + 14, 62, 20, 6);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#1e293b" : "#ffffff";
        ctx.font = "black 9px 'Inter', sans-serif";
        ctx.fillText(`-${discount}%`, px + 16 + 31, py + 27);
        ctx.restore();
      }
    }
  };

  // High Resolution Image Download Handler
  const handleDownloadImage = async () => {
    if (isRendering) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsRendering(true);
    if (onShowToast) {
      onShowToast("A carregar imagens institucionais para o cartaz...", "info");
    }

    // High resolution layout: 800 x 1000 pixels
    const width = 800;
    const height = 1000;
    canvas.width = width;
    canvas.height = height;

    // Load logo image
    let logoImg: HTMLImageElement | null = null;
    const actualLogoUrl = settings?.logoUrl || "/src/assets/images/app_logo_1782658148089.jpg";

    try {
      logoImg = await loadImage(actualLogoUrl);
    } catch (e) {
      console.warn("Logo load failed for canvas draw:", e);
    }

    // Background selection
    let bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (selectedTheme === "SIGNATURE_ORANGE") {
      bgGrad.addColorStop(0, "#f97316");
      bgGrad.addColorStop(1, "#ea580c");
    } else if (selectedTheme === "SUPERMARKET_RED") {
      bgGrad.addColorStop(0, "#dc2626");
      bgGrad.addColorStop(1, "#991b1b");
    } else if (selectedTheme === "COSMIC_DARK") {
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(1, "#020617");
    } else if (selectedTheme === "NEON_CYBER") {
      bgGrad.addColorStop(0, "#2e0854");
      bgGrad.addColorStop(1, "#090514");
    } else { // Clean light
      bgGrad.addColorStop(0, "#ffffff");
      bgGrad.addColorStop(1, "#f1f5f9");
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Graphic design accents
    ctx.save();
    if (selectedTheme !== "MINIMALIST_LIGHT") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.beginPath();
      ctx.arc(width, 0, 420, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, height, 320, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Border
    ctx.strokeStyle = selectedTheme === "MINIMALIST_LIGHT" ? "rgba(15, 23, 42, 0.05)" : "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // 1. Branding Header
    const headerX = 65;
    const headerY = 95;
    const storeName = settings?.companyName || "OST Vendas";
    const storeSlogan = settings?.slogan || "Controle Total do Seu Negócio";

    if (logoImg) {
      const logoFrameSize = 74;
      const logoSize = 66;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f1f5f9" : "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.roundRect(headerX, headerY - 37, logoFrameSize, logoFrameSize, 16);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(headerX + 4, headerY - 33, logoSize, logoSize, 12);
      ctx.clip();
      ctx.drawImage(logoImg, headerX + 4, headerY - 33, logoSize, logoSize);
      ctx.restore();

      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#0f172a" : "#ffffff";
      ctx.font = "black 32px 'Inter', sans-serif";
      ctx.fillText(storeName.toUpperCase(), headerX + 95, headerY - 3);

      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "rgba(255, 255, 255, 0.75)";
      ctx.font = "bold 17px 'Inter', sans-serif";
      ctx.fillText(storeSlogan, headerX + 95, headerY + 22);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#0f172a" : "#ffffff";
      ctx.font = "black 36px 'Inter', sans-serif";
      ctx.fillText(`🛒 ${storeName.toUpperCase()}`, width / 2, headerY - 5);
      ctx.restore();
    }

    // 2. Banner with Slogan
    const badgeY = 175;
    const badgeW = 670;
    const badgeH = 76;
    const badgeX = (width - badgeW) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    let bannerBg = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
    if (selectedTheme === "SIGNATURE_ORANGE") {
      bannerBg.addColorStop(0, "#ffffff");
      bannerBg.addColorStop(1, "#fffbeb");
    } else if (selectedTheme === "SUPERMARKET_RED") {
      bannerBg.addColorStop(0, "#facc15");
      bannerBg.addColorStop(1, "#fde047");
    } else if (selectedTheme === "COSMIC_DARK") {
      bannerBg.addColorStop(0, "#f97316");
      bannerBg.addColorStop(1, "#f59e0b");
    } else if (selectedTheme === "NEON_CYBER") {
      bannerBg.addColorStop(0, "#ec4899");
      bannerBg.addColorStop(1, "#d946ef");
    } else {
      bannerBg.addColorStop(0, "#0f172a");
      bannerBg.addColorStop(1, "#1e293b");
    }

    ctx.fillStyle = bannerBg;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    if (selectedTheme === "SIGNATURE_ORANGE") {
      ctx.fillStyle = "#ea580c";
    } else if (selectedTheme === "SUPERMARKET_RED") {
      ctx.fillStyle = "#1e293b";
    } else {
      ctx.fillStyle = "#ffffff";
    }
    ctx.font = "black 25px 'Inter', sans-serif";
    ctx.fillText(slogan.toUpperCase(), width / 2, badgeY + 47);
    ctx.restore();

    // 3. Render Product(s)
    if (posterMode === "SINGLE" || selectedProducts.length === 1) {
      // Re-use premium layout designed for single product
      const p = selectedProducts[0] || product;
      const { promoPrice, originalPrice, discount } = getProductPricesAndDiscount(p);
      const avatarSize = 310;
      const avatarX = width / 2;
      const avatarY = 415;

      // Card frame
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#ffffff" : "rgba(255, 255, 255, 0.1)";
      ctx.strokeStyle = selectedTheme === "NEON_CYBER" ? "#f43f5e" : selectedTheme === "COSMIC_DARK" ? "#ea580c" : "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (p.image) {
        try {
          const prodImg = await loadImage(p.image);
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarX, avatarY, avatarSize / 2 - 4, 0, Math.PI * 2);
          ctx.clip();
          const ratio = Math.max(avatarSize / prodImg.width, avatarSize / prodImg.height);
          ctx.drawImage(prodImg, avatarX - (prodImg.width * ratio) / 2, avatarY - (prodImg.height * ratio) / 2, prodImg.width * ratio, prodImg.height * ratio);
          ctx.restore();
        } catch (e) {
          ctx.save();
          ctx.font = "120px serif";
          ctx.textAlign = "center";
          ctx.fillText(p.emoji || "📦", avatarX, avatarY + 42);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.font = "120px serif";
        ctx.textAlign = "center";
        ctx.fillText(p.emoji || "📦", avatarX, avatarY + 42);
        ctx.restore();
      }

      // Title
      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#0f172a" : "#ffffff";
      ctx.font = "black 38px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name.toUpperCase(), width / 2, 615);

      // Category
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "rgba(255, 255, 255, 0.65)";
      ctx.font = "black 18px 'Inter', sans-serif";
      ctx.fillText(`CATEGORIA: ${p.category.toUpperCase()}`, width / 2, 655);
      ctx.restore();

      // Pricing Ticket
      const priceY = 690;
      const priceW = 670;
      const priceH = 126;
      const priceX = (width - priceW) / 2;

      ctx.save();
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#f8fafc" : "rgba(0, 0, 0, 0.22)";
      ctx.strokeStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#cbd5e1" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(priceX, priceY, priceW, priceH, 22);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // De
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#64748b" : "#ffffff";
      ctx.font = "bold 18px 'Inter', sans-serif";
      ctx.fillText("PREÇO ANTERIOR", priceX + 40, priceY + 45);
      ctx.font = "bold 32px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#94a3b8" : "#ffffff";
      const oldPriceText = `${originalPrice.toLocaleString()} ${currency}`;
      ctx.fillText(oldPriceText, priceX + 40, priceY + 86);
      const oldPriceWidth = ctx.measureText(oldPriceText).width;
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(priceX + 40 - 4, priceY + 75);
      ctx.lineTo(priceX + 40 + oldPriceWidth + 4, priceY + 75);
      ctx.stroke();
      ctx.restore();

      // Por apenas
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff"; 
      ctx.font = "bold 18px 'Inter', sans-serif";
      ctx.fillText("OFERTA ESPECIAL", priceX + priceW - 40, priceY + 45);
      ctx.font = "black 56px 'Inter', sans-serif";
      ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : selectedTheme === "NEON_CYBER" ? "#ffffff" : selectedTheme === "MINIMALIST_LIGHT" ? "#ea580c" : "#ffffff";
      ctx.fillText(`${promoPrice.toLocaleString()} ${currency}`, priceX + priceW - 40, priceY + 96);
      ctx.restore();

      // Discount overlay
      if (discount > 0) {
        ctx.save();
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#facc15" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(priceX + 40, priceY - 18, 200, 44, 10);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = selectedTheme === "SUPERMARKET_RED" ? "#1e293b" : "#ffffff";
        ctx.font = "black 18px 'Inter', sans-serif";
        ctx.fillText(`${discount}% DE DESCONTO`, priceX + 140, priceY + 12);
        ctx.restore();
      }

    } else {
      // MULTI mode grid drawing
      const N = selectedProducts.length;
      
      if (N === 2) {
        // Layout 2 items: 2 columns side by side
        await drawProductInBox(ctx, selectedProducts[0], 65, 270, 320, 560, false);
        await drawProductInBox(ctx, selectedProducts[1], 415, 270, 320, 560, false);
      } else if (N === 3) {
        // Layout 3 items: 1 Featured item full-width on top, 2 smaller side-by-side underneath
        await drawProductInBox(ctx, selectedProducts[0], 65, 270, 670, 260, true);
        await drawProductInBox(ctx, selectedProducts[1], 65, 550, 320, 280, false);
        await drawProductInBox(ctx, selectedProducts[2], 415, 550, 320, 280, false);
      } else if (N === 4) {
        // Layout 4 items: Clean 2x2 grid
        await drawProductInBox(ctx, selectedProducts[0], 65, 270, 320, 270, false);
        await drawProductInBox(ctx, selectedProducts[1], 415, 270, 320, 270, false);
        await drawProductInBox(ctx, selectedProducts[2], 65, 560, 320, 270, false);
        await drawProductInBox(ctx, selectedProducts[3], 415, 560, 320, 270, false);
      }
    }

    // 4. Poster Footer Section
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#475569" : "rgba(255, 255, 255, 0.8)";
    ctx.font = "italic 20px 'Inter', sans-serif";
    ctx.fillText(customInfo, width / 2, height - 120);

    ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#cbd5e1" : "rgba(255, 255, 255, 0.15)";
    ctx.fillRect((width - 440) / 2, height - 75, 440, 12);

    ctx.font = "bold 13px monospace";
    ctx.fillStyle = selectedTheme === "MINIMALIST_LIGHT" ? "#94a3b8" : "rgba(255, 255, 255, 0.4)";
    const randomCode = selectedProducts.map(p => p.code).join("-").substring(0, 15);
    ctx.fillText(`POSTER-${randomCode}-OSTVENDAS-PROMO`, width / 2, height - 45);
    ctx.restore();

    // Export Canvas to PNG and Trigger Download
    try {
      const imageUri = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `cartaz_promocional_${new Date().toISOString().split("T")[0]}.png`;
      link.href = imageUri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (onShowToast) {
        onShowToast("Cartaz promocional baixado como imagem PNG de alta resolução! 🚀", "success");
      }
    } catch (err: any) {
      console.error("Flyer creation failed:", err);
      if (onShowToast) {
        onShowToast("Falha de permissão ao criar arquivo de imagem.", "error");
      }
    } finally {
      setIsRendering(false);
    }
  };

  // Theme styles selector for live HTML preview card
  const getThemeClasses = () => {
    switch (selectedTheme) {
      case "SIGNATURE_ORANGE":
        return {
          wrapper: "bg-gradient-to-b from-orange-500 to-orange-600 text-white shadow-orange-500/25",
          badge: "bg-white text-orange-600 border border-orange-100 shadow",
          sloganText: "text-orange-600",
          backdrop: "bg-white/10 border-white/20 backdrop-blur-sm shadow-inner",
          oldPrice: "text-orange-100/85",
          promoPrice: "text-white drop-shadow",
          customText: "text-orange-50/90",
          discountBadge: "bg-red-500 text-white font-extrabold shadow",
          cardInside: "bg-white/10 border border-white/10 shadow",
          priceText: "text-white"
        };
      case "SUPERMARKET_RED":
        return {
          wrapper: "bg-gradient-to-b from-red-600 to-red-800 text-white shadow-red-650/25",
          badge: "bg-yellow-400 text-slate-950 border border-yellow-300 shadow",
          sloganText: "text-slate-950",
          backdrop: "bg-white/10 border-white/20 backdrop-blur-sm shadow-inner",
          oldPrice: "text-red-100/85",
          promoPrice: "text-yellow-300 font-extrabold drop-shadow",
          customText: "text-red-50/90",
          discountBadge: "bg-yellow-400 text-slate-950 font-black shadow",
          cardInside: "bg-white/10 border border-white/10 shadow",
          priceText: "text-yellow-300"
        };
      case "COSMIC_DARK":
        return {
          wrapper: "bg-gradient-to-b from-slate-900 via-slate-950 to-zinc-950 text-white border border-slate-800/80 shadow-slate-950/40",
          badge: "bg-gradient-to-r from-orange-500 to-amber-500 text-white border border-orange-400/25 shadow-lg",
          sloganText: "text-white font-extrabold",
          backdrop: "bg-white/10 border-white/20 backdrop-blur-md shadow-inner",
          oldPrice: "text-white/90 font-medium",
          promoPrice: "text-white font-black drop-shadow",
          customText: "text-white font-medium",
          discountBadge: "bg-gradient-to-r from-red-500 to-rose-600 text-white font-extrabold shadow",
          cardInside: "bg-slate-900/60 border border-slate-800 shadow-sm text-white",
          priceText: "text-white font-black"
        };
      case "NEON_CYBER":
        return {
          wrapper: "bg-gradient-to-b from-purple-950 via-zinc-950 to-indigo-950 text-white border border-fuchsia-900/40 shadow-fuchsia-950/20",
          badge: "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white border border-fuchsia-400/20 shadow-lg",
          sloganText: "text-white font-extrabold",
          backdrop: "bg-fuchsia-950/30 border-white/20 backdrop-blur-md shadow-inner",
          oldPrice: "text-white/90 font-medium",
          promoPrice: "text-white font-black drop-shadow",
          customText: "text-white font-medium",
          discountBadge: "bg-pink-500 text-white font-extrabold shadow",
          cardInside: "bg-purple-950/50 border border-purple-900/40 shadow-sm text-white",
          priceText: "text-white font-black"
        };
      case "MINIMALIST_LIGHT":
        return {
          wrapper: "bg-white text-slate-900 border border-slate-200/90 shadow-slate-200/60",
          badge: "bg-slate-900 text-white shadow-md border border-slate-800",
          sloganText: "text-white",
          backdrop: "bg-slate-50 border border-slate-200 shadow-inner",
          oldPrice: "text-slate-400 font-medium",
          promoPrice: "text-orange-600 font-black",
          customText: "text-slate-500",
          discountBadge: "bg-rose-500 text-white font-extrabold shadow",
          cardInside: "bg-slate-50/80 border border-slate-200 shadow-sm",
          priceText: "text-orange-600"
        };
    }
  };

  const themeStyle = getThemeClasses();

  // Filter available products based on query and already selected
  const availableToSelect = allProducts.filter(p => {
    const isSelected = selectedProducts.some(sp => sp.id === p.id);
    if (isSelected) return false;
    if (!searchQuery) return true;
    return p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
           p.code.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col lg:flex-row dark:bg-zinc-950 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
        
        {/* Left Side: Dynamic Customization Controls */}
        <div className="p-6 lg:w-1/2 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-zinc-800 space-y-4 max-h-[85vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm dark:text-white flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-orange-500 animate-pulse" />
                  Criador de Cartaz & Poster Promocional
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Gere panfletos atraentes de produtos individuais ou bento-posters multiprodutos.</p>
              </div>
              <button 
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-850 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition cursor-pointer font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Layout Mode Selector Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setPosterMode("SINGLE")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-250 cursor-pointer ${
                  posterMode === "SINGLE" 
                    ? "bg-white text-slate-900 shadow dark:bg-zinc-800 dark:text-white" 
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Produto Individual
              </button>
              <button
                type="button"
                onClick={() => {
                  setPosterMode("MULTI");
                  if (selectedProducts.length === 0) {
                    setSelectedProducts([product]);
                  }
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-250 cursor-pointer ${
                  posterMode === "MULTI" 
                    ? "bg-white text-slate-900 shadow dark:bg-zinc-800 dark:text-white" 
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Poster Multiprodutos (2 a 4)
              </button>
            </div>

            {/* Inputs Form */}
            <div className="space-y-4 text-xs">
              
              {/* Slogan with AI Assist */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Slogan Principal (Rodapé / Banner)</label>
                  <button
                    onClick={handleGenerateSlogans}
                    disabled={isGeneratingSlogans}
                    className="text-orange-600 hover:text-orange-700 font-extrabold flex items-center gap-1 cursor-pointer select-none"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGeneratingSlogans ? 'animate-spin' : ''}`} />
                    {isGeneratingSlogans ? "Gerando..." : "Slogans com Gemini AI 🤖"}
                  </button>
                </div>
                
                {aiSlogans.length > 0 && (
                  <div className="grid grid-cols-1 gap-1 mb-2 max-h-[85px] overflow-y-auto bg-slate-50 p-1.5 rounded-lg border border-slate-100 dark:bg-zinc-900/40 dark:border-zinc-800">
                    {aiSlogans.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSlogan(s)}
                        className={`text-left px-2 py-1.5 rounded-md text-[11px] font-bold transition ${
                          slogan === s 
                            ? 'bg-orange-500 text-white' 
                            : 'hover:bg-slate-200 text-slate-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  maxLength={50}
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 outline-none focus:border-orange-500"
                />
              </div>

              {/* Dynamic Product Management Grid */}
              {posterMode === "SINGLE" ? (
                // SINGLE MODE: Simple Price Fields
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 dark:bg-zinc-900/30 dark:border-zinc-800">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço Original ({currency})</label>
                    <input
                      type="number"
                      value={getSinglePrices().originalPrice}
                      onChange={(e) => handleUpdatePrice(product.id, "originalPrice", Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold font-mono text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço de Promoção ({currency})</label>
                    <input
                      type="number"
                      value={getSinglePrices().promoPrice}
                      onChange={(e) => handleUpdatePrice(product.id, "promoPrice", Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold font-mono text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              ) : (
                // MULTI MODE: Product List and Search Selector
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-3 dark:border-zinc-800 dark:bg-zinc-900/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Produtos no Cartaz ({selectedProducts.length}/4)</span>
                      <span className="text-[10px] text-slate-400 font-medium">Selecione até 4 produtos</span>
                    </div>

                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {selectedProducts.map((p, index) => {
                        const { promoPrice, originalPrice } = getProductPricesAndDiscount(p);
                        return (
                          <div key={p.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-2 dark:bg-zinc-900 dark:border-zinc-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xl shrink-0">{p.image ? "🖼️" : p.emoji || "📦"}</span>
                                <div className="leading-tight truncate">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] block truncate">{index + 1}. {p.name}</span>
                                  <span className="text-[9px] text-slate-400 block truncate uppercase">{p.category}</span>
                                </div>
                              </div>
                              {selectedProducts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProduct(p.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
                                  title="Remover produto do poster"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Prices edit block for each product */}
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <label className="text-slate-400 font-bold block mb-0.5">Preço Original ({currency})</label>
                                <input
                                  type="number"
                                  value={originalPrice}
                                  onChange={(e) => handleUpdatePrice(p.id, "originalPrice", Number(e.target.value))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1 font-bold font-mono text-slate-700 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                                />
                              </div>
                              <div>
                                <label className="text-slate-400 font-bold block mb-0.5">Preço Promoção ({currency})</label>
                                <input
                                  type="number"
                                  value={promoPrice}
                                  onChange={(e) => handleUpdatePrice(p.id, "promoPrice", Number(e.target.value))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1 font-bold font-mono text-slate-700 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add More Products Trigger Block */}
                    {selectedProducts.length < 4 && (
                      <div className="space-y-1.5 border-t border-slate-200 pt-2.5 dark:border-zinc-800">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Adicionar Outro Produto</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                            <Search className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="text"
                            placeholder="Buscar por nome, código ou categoria..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>

                        {/* Dropdown list of filtered stock products */}
                        {searchQuery && (
                          <div className="bg-white border border-slate-200 rounded-xl max-h-[140px] overflow-y-auto shadow-lg z-20 absolute w-full left-0 dark:bg-zinc-900 dark:border-zinc-800">
                            {availableToSelect.length === 0 ? (
                              <div className="p-3 text-center text-slate-400 italic">Nenhum produto correspondente disponível.</div>
                            ) : (
                              availableToSelect.map(prodItem => (
                                <button
                                  key={prodItem.id}
                                  type="button"
                                  onClick={() => handleAddProduct(prodItem)}
                                  className="w-full text-left p-2 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-b-0 dark:hover:bg-zinc-800 dark:border-zinc-800 transition"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-lg shrink-0">{prodItem.image ? "🖼️" : prodItem.emoji || "📦"}</span>
                                    <div className="leading-tight truncate">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block truncate">{prodItem.name}</span>
                                      <span className="text-[10px] text-slate-400 block truncate uppercase">{prodItem.category} • {prodItem.salePrice} {currency}</span>
                                    </div>
                                  </div>
                                  <span className="p-1 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-extrabold text-[10px] shrink-0">
                                    + Adicionar
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Slogan details / terms */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Informações Extras (Rodapé)</label>
                <input
                  type="text"
                  maxLength={70}
                  placeholder="Ex: Promoção válida até o fim do estoque."
                  value={customInfo}
                  onChange={(e) => setCustomInfo(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-850 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 outline-none focus:border-orange-500"
                />
              </div>

              {/* Theme Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tema Visual & Paleta de Cores</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <button
                    onClick={() => setSelectedTheme("SIGNATURE_ORANGE")}
                    className={`p-2 rounded-xl text-left border flex items-center gap-1.5 font-bold transition ${
                      selectedTheme === "SIGNATURE_ORANGE"
                        ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/25 dark:text-orange-400"
                        : "border-slate-100 dark:border-zinc-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    Laranja OST
                  </button>
                  <button
                    onClick={() => setSelectedTheme("SUPERMARKET_RED")}
                    className={`p-2 rounded-xl text-left border flex items-center gap-1.5 font-bold transition ${
                      selectedTheme === "SUPERMARKET_RED"
                        ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/25 dark:text-red-400"
                        : "border-slate-100 dark:border-zinc-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    Super Saldos
                  </button>
                  <button
                    onClick={() => setSelectedTheme("COSMIC_DARK")}
                    className={`p-2 rounded-xl text-left border flex items-center gap-1.5 font-bold transition ${
                      selectedTheme === "COSMIC_DARK"
                        ? "border-slate-800 bg-slate-900 text-white"
                        : "border-slate-100 dark:border-zinc-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
                    Cosmic Dark
                  </button>
                  <button
                    onClick={() => setSelectedTheme("NEON_CYBER")}
                    className={`p-2 rounded-xl text-left border flex items-center gap-1.5 font-bold transition ${
                      selectedTheme === "NEON_CYBER"
                        ? "border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/25 dark:text-purple-400"
                        : "border-slate-100 dark:border-zinc-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
                    Cyber Neon
                  </button>
                  <button
                    onClick={() => setSelectedTheme("MINIMALIST_LIGHT")}
                    className={`p-2 rounded-xl text-left border flex items-center gap-1.5 font-bold transition ${
                      selectedTheme === "MINIMALIST_LIGHT"
                        ? "border-slate-400 bg-slate-100 text-slate-900"
                        : "border-slate-100 dark:border-zinc-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                    Clean Light
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Social Sharing & Action Buttons */}
          <div className="border-t border-slate-200 pt-4 dark:border-zinc-800 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Partilhar com os Clientes</p>
            
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={handleCopyText}
                className="p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2 cursor-pointer dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {copiedText ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    Copiar Texto
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="p-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition rounded-xl flex items-center justify-center gap-2 cursor-pointer dark:bg-emerald-950/20 dark:text-emerald-400"
              >
                <MessageSquare className="w-4 h-4" />
                WhatsApp
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-black">
              <button
                type="button"
                onClick={handlePrint}
                className="p-3 bg-slate-100 text-slate-800 hover:bg-slate-200 transition rounded-2xl flex items-center justify-center gap-2 cursor-pointer dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                title="Imprimir folheto publicitário para a prateleira da loja"
              >
                <Printer className="w-4 h-4" />
                Imprimir Cartaz
              </button>

              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isRendering}
                className="p-3 bg-orange-500 hover:bg-orange-600 text-white transition rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                title="Salvar imagem PNG de alta resolução para enviar aos clientes"
              >
                {isRendering ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isRendering ? "Gerando..." : "Baixar Imagem"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Beautiful Live Poster Preview */}
        <div className="p-6 lg:w-1/2 bg-slate-150 dark:bg-zinc-900/60 flex items-center justify-center min-h-[420px] lg:min-h-0 relative">
          
          {/* Card Frame */}
          <div 
            ref={flyerRef}
            className={`w-[360px] h-[480px] rounded-[32px] overflow-hidden shadow-2xl flex flex-col justify-between p-5 relative select-none animate-in fade-in duration-300 ${themeStyle?.wrapper}`}
          >
            {/* Background design accents for render preview */}
            {selectedTheme !== "MINIMALIST_LIGHT" && (
              <>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-10 -mt-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 -ml-8 -mb-8 pointer-events-none" />
              </>
            )}

            {/* Header: Institutional Branding with Corporate Logo */}
            <div className="flex items-center gap-2.5 z-10 w-full">
              {settings?.logoUrl ? (
                <img 
                  src={settings.logoUrl} 
                  alt="Logotipo Corporativo" 
                  className="w-8 h-8 rounded-xl object-contain bg-white/25 border border-white/10 p-0.5 shadow-sm shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/src/assets/images/app_logo_1782658148089.jpg";
                  }}
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-orange-500/25 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  🛒
                </div>
              )}
              <div className="text-left flex-1 min-w-0 leading-none">
                <span className="font-black text-[11px] uppercase tracking-wider block truncate">
                  {settings?.companyName || "OST Vendas"}
                </span>
                <span className="text-[7.5px] opacity-75 font-semibold block truncate mt-0.5">
                  {settings?.slogan || "Controle Total do Seu Negócio"}
                </span>
              </div>
              <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded bg-black/10 text-white border border-white/5 uppercase tracking-wider shrink-0">
                PROMO
              </span>
            </div>

            {/* Slogan Banner */}
            <div className={`py-1.5 px-3 rounded-xl font-black text-center text-[11px] tracking-wide uppercase shadow-sm z-10 ${themeStyle?.badge}`}>
              <span className={themeStyle?.sloganText}>{slogan}</span>
            </div>

            {/* Main content grid switch */}
            {posterMode === "SINGLE" || selectedProducts.length === 1 ? (
              // SINGLE LAYOUT: Large item visual
              (() => {
                const p = selectedProducts[0] || product;
                const { promoPrice, originalPrice, discount } = getProductPricesAndDiscount(p);
                return (
                  <>
                    {/* Product visual area with Circle Backdrop */}
                    <div className="flex flex-col items-center justify-center my-2 relative z-10">
                      <div className={`w-28 h-28 rounded-full flex items-center justify-center border-2 overflow-hidden relative transition-all duration-300 ${themeStyle?.backdrop}`}>
                        {p.image ? (
                          <img 
                            src={p.image} 
                            alt={p.name} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-5xl transform hover:scale-110 transition duration-300 select-none">
                            {p.emoji || "📦"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product details */}
                    <div className="text-center z-10">
                      <h4 className="font-extrabold text-base tracking-tight truncate px-1">
                        {p.name.toUpperCase()}
                      </h4>
                      <p className="text-[9px] uppercase tracking-wider font-mono opacity-60 mt-0.5">
                        Categoria: {p.category}
                      </p>
                    </div>

                    {/* Pricing Tag block */}
                    <div className="flex items-center justify-around bg-black/10 dark:bg-white/5 rounded-2xl p-2.5 z-10 border border-white/5">
                      <div className="text-left">
                        <span className={`text-[9px] font-semibold block uppercase tracking-wider ${themeStyle?.oldPrice}`}>Preço Anterior</span>
                        <span className={`text-xs font-mono font-bold line-through ${themeStyle?.oldPrice}`}>
                          {originalPrice.toLocaleString()} {currency}
                        </span>
                      </div>
                      
                      <div className="text-right">
                        <span className={`text-[9px] font-extrabold block uppercase tracking-wider ${selectedTheme === "MINIMALIST_LIGHT" ? "text-orange-600" : "text-white"}`}>Preço Especial</span>
                        <span className={`text-xl font-mono font-black ${themeStyle?.priceText}`}>
                          {promoPrice.toLocaleString()} {currency}
                        </span>
                      </div>
                    </div>

                    {/* Lower row: Discount Badge & custom subtitle */}
                    <div className="flex items-center justify-between pt-1 z-10">
                      {discount > 0 ? (
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${themeStyle?.discountBadge}`}>
                          -{discount}% DESCONTO
                        </span>
                      ) : (
                        <span />
                      )}
                      
                      <span className={`text-[8.5px] font-medium text-right max-w-[180px] truncate italic ${themeStyle?.customText}`}>
                        {customInfo}
                      </span>
                    </div>
                  </>
                );
              })()
            ) : (
              // MULTI LAYOUTS (Bento grid style preview)
              <div className="grid grid-cols-2 gap-2.5 my-1.5 overflow-hidden flex-1 py-1 z-10">
                {selectedProducts.map((p, index) => {
                  const { promoPrice, originalPrice, discount } = getProductPricesAndDiscount(p);
                  const isFeatured = selectedProducts.length === 3 && index === 0;
                  
                  return (
                    <div 
                      key={p.id} 
                      className={`rounded-2xl p-2.5 flex flex-col justify-between relative overflow-hidden text-center leading-tight transition-all border ${
                        isFeatured ? "col-span-2 flex-row text-left items-center gap-3 py-3" : ""
                      } ${themeStyle?.cardInside}`}
                    >
                      {/* Discount Badge */}
                      {discount > 0 && (
                        <div className={`absolute top-1.5 left-1.5 px-1 rounded text-[8px] font-black uppercase shrink-0 ${themeStyle?.discountBadge}`}>
                          -{discount}%
                        </div>
                      )}

                      {/* Image / Emoji */}
                      <div className={`rounded-full flex items-center justify-center shrink-0 border border-white/5 ${
                        isFeatured ? "w-14 h-14" : "w-12 h-12 mx-auto my-1"
                      } ${themeStyle?.backdrop}`}>
                        {p.image ? (
                          <img 
                            src={p.image} 
                            alt={p.name} 
                            className="w-full h-full object-cover rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className={isFeatured ? "text-2xl" : "text-xl"}>{p.emoji || "📦"}</span>
                        )}
                      </div>

                      {/* Info & Prices Box */}
                      <div className={`flex-1 min-w-0 ${isFeatured ? "space-y-0.5" : "space-y-1.5"}`}>
                        <div>
                          <span className="font-extrabold text-[10px] block truncate text-slate-900 dark:text-white uppercase">{p.name}</span>
                          <span className="text-[7.5px] opacity-60 block truncate uppercase tracking-widest">{p.category}</span>
                        </div>

                        <div className={`flex items-center gap-1.5 ${isFeatured ? "justify-start mt-1" : "justify-center"}`}>
                          <span className="text-[8.5px] line-through opacity-50 font-bold font-mono shrink-0">
                            {originalPrice.toLocaleString()} {currency}
                          </span>
                          <span className={`text-[12px] font-black font-mono shrink-0 ${themeStyle?.priceText}`}>
                            {promoPrice.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tiny Retail decoration: barcode */}
            <div className="border-t border-white/10 dark:border-zinc-800/20 pt-1 flex items-center justify-between opacity-35 z-10">
              <span className="text-[7px] font-mono">OST-VENDAS-BENTO-FLYER</span>
              <span className="text-[6px] font-mono">★★★★★</span>
            </div>
            
          </div>

          {/* Hidden Canvas used purely to render the PNG download */}
          <canvas ref={canvasRef} className="hidden" />
          
        </div>
        
      </div>
    </div>
  );
}
