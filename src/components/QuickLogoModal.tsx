import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Upload, Image as ImageIcon, Link as LinkIcon, Check, Trash2, Sparkles, RefreshCw } from "lucide-react";

interface QuickLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLogoUrl?: string;
  companyName?: string;
  onSaveLogo: (newLogoUrl: string) => void;
  theme?: string;
  onShowToast?: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

const PRESET_LOGOS = [
  {
    id: "default",
    name: "Logotipo Padrão OST Vendas",
    url: "/src/assets/images/app_logo_1782658148089.jpg"
  },
  {
    id: "clean-gold",
    name: "Emblema Dourado Premium",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' rx='40' fill='%230f172a'/><path d='M100 30 L160 65 L160 135 L100 170 L40 135 L40 65 Z' fill='none' stroke='%23f59e0b' stroke-width='8'/><text x='100' y='115' font-size='60' font-weight='bold' fill='%23f59e0b' text-anchor='middle' font-family='sans-serif'>OST</text></svg>"
  },
  {
    id: "modern-blue",
    name: "Tech Blue Corporate",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' rx='40' fill='%230284c7'/><circle cx='100' cy='100' r='70' fill='none' stroke='%23ffffff' stroke-width='6' stroke-dasharray='12,6'/><text x='100' y='118' font-size='50' font-weight='900' fill='%23ffffff' text-anchor='middle' font-family='sans-serif'>ERP</text></svg>"
  },
  {
    id: "orange-crest",
    name: "Laranja Comercial Dynamic",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' rx='40' fill='%23ea580c'/><path d='M60 140 L100 60 L140 140 Z' fill='%23ffffff'/><text x='100' y='130' font-size='32' font-weight='bold' fill='%23ea580c' text-anchor='middle' font-family='sans-serif'>VENDAS</text></svg>"
  }
];

export const QuickLogoModal: React.FC<QuickLogoModalProps> = ({
  isOpen,
  onClose,
  currentLogoUrl = "",
  companyName = "Minha Empresa",
  onSaveLogo,
  theme = "daily",
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<"upload" | "url" | "presets">("upload");
  const [logoInput, setLogoInput] = useState<string>(currentLogoUrl);
  const [previewUrl, setPreviewUrl] = useState<string>(currentLogoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setLogoInput(currentLogoUrl);
    setPreviewUrl(currentLogoUrl || "/src/assets/images/app_logo_1782658148089.jpg");
  }, [currentLogoUrl, isOpen]);

  if (!isOpen) return null;

  const isNight = theme === "night";

  // Handle local image file upload
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      if (onShowToast) onShowToast("Por favor selecione um ficheiro de imagem válido (PNG, JPG, WEBP, SVG).", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (onShowToast) onShowToast("A imagem excede o tamanho máximo recomendado de 5MB.", "warning");
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Result = e.target?.result as string;
      if (base64Result) {
        setLogoInput(base64Result);
        setPreviewUrl(base64Result);
        if (onShowToast) onShowToast("Imagem carregada com sucesso! Clique em Salvar para aplicar.", "info");
      }
      setIsProcessing(false);
    };
    reader.onerror = () => {
      setIsProcessing(false);
      if (onShowToast) onShowToast("Erro ao ler o ficheiro de imagem.", "error");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleApplyUrl = () => {
    if (!logoInput.trim()) {
      if (onShowToast) onShowToast("Por favor insira um URL de imagem válido.", "warning");
      return;
    }
    setPreviewUrl(logoInput.trim());
    if (onShowToast) onShowToast("Pré-visualização do URL atualizada!", "info");
  };

  const handleSave = () => {
    onSaveLogo(logoInput.trim());
    if (onShowToast) onShowToast("Logotipo da empresa atualizado e guardado com sucesso!", "success");
    onClose();
  };

  const handleResetToDefault = () => {
    const defaultUrl = "/src/assets/images/app_logo_1782658148089.jpg";
    setLogoInput(defaultUrl);
    setPreviewUrl(defaultUrl);
    onSaveLogo(defaultUrl);
    if (onShowToast) onShowToast("Logotipo restaurado para a imagem padrão.", "info");
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
            isNight
              ? "bg-zinc-950 text-slate-100 border-zinc-800"
              : "bg-white text-slate-800 border-slate-200"
          }`}
          id="quick-logo-config-modal"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-zinc-850 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-md">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                  <span>Configuração Rápida do Logotipo</span>
                  <span className="text-[10px] bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold px-2 py-0.5 rounded-full border border-orange-500/20">
                    Atalho Direto
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-white/90">
                  {companyName} &bull; Personalização rápida para documentos e sistema
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main Body */}
          <div className="p-6 space-y-5">
            {/* Live Logo Preview Box */}
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${
              isNight ? "bg-zinc-900 border-zinc-800" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="relative w-20 h-20 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white p-2 flex items-center justify-center overflow-hidden shrink-0 shadow-inner group">
                <img
                  src={previewUrl}
                  alt="Pré-visualização do Logo"
                  className="max-w-full max-h-full object-contain"
                  onError={() => setPreviewUrl("/src/assets/images/app_logo_1782658148089.jpg")}
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-orange-400 animate-spin" />
                  </div>
                )}
              </div>

              <div className="space-y-1 text-left flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">
                    Pré-visualização do Logotipo
                  </span>
                  {logoInput && logoInput !== "/src/assets/images/app_logo_1782658148089.jpg" ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-md border border-emerald-500/20">
                      Personalizado
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-white/80 font-medium px-2 py-0.5 rounded-md">
                      Padrão
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-white/90 leading-tight">
                  Aparecerá nas faturas, recibos em papel de 80mm/A4, relatórios PDF e no cabeçalho do ERP.
                </p>
                <p className="text-[10px] font-mono text-orange-600 dark:text-orange-400">
                  Resolução recomendada: 300x300px (Fundo Transparente)
                </p>
              </div>
            </div>

            {/* Tab Selection */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "upload"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload de Ficheiro</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("url")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "url"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>URL Direto</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("presets")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "presets"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Modelos Rápidos</span>
              </button>
            </div>

            {/* Tab 1: Upload File */}
            {activeTab === "upload" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  isDragOver
                    ? "border-orange-500 bg-orange-500/10"
                    : isNight
                    ? "border-zinc-800 bg-zinc-900/50 hover:border-orange-500/50 hover:bg-zinc-900"
                    : "border-slate-300 bg-slate-50 hover:border-orange-500/50 hover:bg-slate-100"
                }`}
                onClick={() => {
                  const input = document.getElementById("quick-logo-file-input") as HTMLInputElement;
                  if (input) input.click();
                }}
              >
                <input
                  id="quick-logo-file-input"
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">
                    Clique para selecionar ou arraste uma imagem aqui
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-white/80 mt-0.5">
                    Formatos suportados: PNG, JPG, WEBP, SVG (máx. 5MB)
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Direct URL */}
            {activeTab === "url" && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block text-left">
                  URL da Imagem na Web ou Data-URI
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://suaempresa.com/logo.png"
                    value={logoInput}
                    onChange={(e) => {
                      setLogoInput(e.target.value);
                      setPreviewUrl(e.target.value);
                    }}
                    className={`flex-1 border rounded-lg p-2.5 text-xs outline-none focus:border-orange-500 font-mono ${
                      isNight ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleApplyUrl}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                  >
                    Testar URL
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-left">
                  Dica: Certifique-se de que o URL seja público e comece com https://.
                </p>
              </div>
            )}

            {/* Tab 3: Preset Models */}
            {activeTab === "presets" && (
              <div className="grid grid-cols-2 gap-3">
                {PRESET_LOGOS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setLogoInput(preset.url);
                      setPreviewUrl(preset.url);
                    }}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      logoInput === preset.url
                        ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/30"
                        : isNight
                        ? "bg-zinc-900 border-zinc-800 hover:border-slate-700"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={preset.url} alt={preset.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{preset.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/80">Clique para aplicar</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Restaurar logotipo padrão do sistema"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-extrabold rounded-lg shadow-md transition-all active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Logotipo</span>
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default QuickLogoModal;
