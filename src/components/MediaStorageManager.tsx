import React, { useState, useRef, useMemo } from "react";
import { 
  Image as ImageIcon, 
  Upload, 
  Trash2, 
  Download, 
  RefreshCw, 
  Search, 
  Building, 
  Package, 
  User, 
  Sparkles, 
  Check, 
  Copy, 
  Eye, 
  Layers 
} from "lucide-react";
import { 
  imageStorageService, 
  StoredImage, 
  ImageCategory 
} from "../services/imageStorageService";
import { useImageStorage } from "../hooks/useImageStorage";
import { Product } from "../types";

interface MediaStorageManagerProps {
  products?: Product[];
  currentLogoUrl?: string;
  onSetAsLogo?: (dataUrl: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export const MediaStorageManager: React.FC<MediaStorageManagerProps> = ({
  products = [],
  onSetAsLogo,
  onShowToast
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ImageCategory | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewImage, setPreviewImage] = useState<StoredImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<ImageCategory>("PRODUCT");
  const [uploadEntityId, setUploadEntityId] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const categoryFilter = selectedCategory === "ALL" ? undefined : selectedCategory;
  const { images, loading, metrics, refresh, saveImage, deleteImage } = useImageStorage(categoryFilter);

  // Filtro de pesquisa
  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images;
    const q = searchQuery.toLowerCase().trim();
    return images.filter(img => 
      img.name.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q) ||
      img.category.toLowerCase().includes(q) ||
      img.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [images, searchQuery]);

  // Handler: Upload de arquivo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        await saveImage(file, {
          category: uploadCategory,
          name: file.name.replace(/\.[^/.]+$/, ""),
          entityId: uploadEntityId || undefined,
          tags: [uploadCategory.toLowerCase()]
        });

        // Se a categoria for LOGO e houver callback, atualiza o logo global
        if (uploadCategory === "LOGO" && onSetAsLogo) {
          const dataUrl = await imageStorageService.getCompanyLogo();
          onSetAsLogo(dataUrl);
        }

        successCount++;
      }

      if (onShowToast) {
        onShowToast(`${successCount} imagem(ns) guardada(s) e otimizada(s) com sucesso!`, "success");
      }
      setUploadEntityId("");
    } catch (err) {
      console.error(err);
      if (onShowToast) {
        onShowToast("Erro ao processar e comprimir a imagem.", "error");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handler: Copiar Data URL
  const handleCopyDataUrl = (img: StoredImage) => {
    try {
      navigator.clipboard.writeText(img.dataUrl);
      setCopiedId(img.id);
      setTimeout(() => setCopiedId(null), 2000);
      if (onShowToast) onShowToast("Código da imagem copiado para a área de transferência!", "info");
    } catch {
      if (onShowToast) onShowToast("Não foi possível copiar o código.", "error");
    }
  };

  // Handler: Definir como logotipo
  const handleSetLogo = async (img: StoredImage) => {
    try {
      await imageStorageService.saveCompanyLogo(img.dataUrl);
      if (onSetAsLogo) onSetAsLogo(img.dataUrl);
      if (onShowToast) onShowToast("Logotipo da empresa atualizado com sucesso!", "success");
      refresh();
    } catch {
      if (onShowToast) onShowToast("Erro ao definir como logotipo.", "error");
    }
  };

  // Handler: Exportar Backup de Imagens
  const handleExportBackup = async () => {
    try {
      const json = await imageStorageService.exportAllAsJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_imagens_ost_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (onShowToast) onShowToast("Arquivo de backup de média exportado com sucesso!", "success");
    } catch {
      if (onShowToast) onShowToast("Falha ao exportar backup de imagens.", "error");
    }
  };

  // Handler: Importar Backup
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await imageStorageService.importFromJson(text);
      if (onShowToast) {
        onShowToast(`${result.imported} imagens restauradas com sucesso! (${result.errors} erros)`, "success");
      }
      refresh();
    } catch {
      if (onShowToast) onShowToast("Ficheiro de backup inválido.", "error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const getCategoryLabel = (cat: ImageCategory): string => {
    switch (cat) {
      case "LOGO": return "Logotipo";
      case "PRODUCT": return "Produtos";
      case "AVATAR": return "Avatares";
      case "FLYER": return "Panfletos";
      case "CUSTOMER": return "Clientes";
      case "DOCUMENT": return "Documentos";
      default: return "Outros";
    }
  };

  const getCategoryBadgeColor = (cat: ImageCategory): string => {
    switch (cat) {
      case "LOGO": return "bg-orange-100 text-orange-800 border-orange-200";
      case "PRODUCT": return "bg-blue-100 text-blue-800 border-blue-200";
      case "AVATAR": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "FLYER": return "bg-purple-100 text-purple-800 border-purple-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO & MÉTRICAS DE ARMAZENAMENTO */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 text-orange-600">
            <div className="p-3 bg-orange-50 rounded-xl text-orange-600">
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                Gestão Dinâmica de Média & Imagens
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                  IndexedDB Ativo
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Armazene, comprima e associe logotipos, fotos de produtos do catálogo e avatares de forma persistente e dinâmica.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              title="Descarregar backup de todas as imagens em JSON"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Média
            </button>

            <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Restaurar
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => refresh()}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
              title="Recarregar galeria"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* CARDS DE ESTATÍSTICA DE ARMAZENAMENTO */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Total de Imagens</span>
              <strong className="text-base text-slate-900 font-mono mt-0.5 block">{metrics.totalImages}</strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Espaço Ocupado</span>
              <strong className="text-base text-orange-600 font-mono mt-0.5 block">{metrics.formattedSize}</strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Produtos com Foto</span>
              <strong className="text-base text-blue-600 font-mono mt-0.5 block">
                {metrics.byCategory.PRODUCT?.count || 0}
              </strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Logotipos & Banners</span>
              <strong className="text-base text-purple-600 font-mono mt-0.5 block">
                {(metrics.byCategory.LOGO?.count || 0) + (metrics.byCategory.FLYER?.count || 0)}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* PAINEL DE UPLOAD & AÇÕES RÁPIDAS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          Carregar & Comprimir Nova Imagem
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Categoria de Destino</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as ImageCategory)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:border-orange-500"
            >
              <option value="PRODUCT">Produto (Catálogo de Venda)</option>
              <option value="LOGO">Logotipo Oficial da Empresa</option>
              <option value="AVATAR">Avatar de Colaborador</option>
              <option value="FLYER">Panfleto / Banner Promocional</option>
              <option value="MISC">Geral / Outros</option>
            </select>
          </div>

          {uploadCategory === "PRODUCT" && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Vincular a Produto (Opcional)</label>
              <select
                value={uploadEntityId}
                onChange={(e) => setUploadEntityId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:border-orange-500"
              >
                <option value="">Selecione um produto (ou nenhum)...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? "A Comprimir Imagem..." : "Selecionar Ficheiro do Computador"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS & PESQUISA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Abas por Categoria */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: "ALL", label: "Todas", icon: Layers },
            { id: "LOGO", label: "Logotipos", icon: Building },
            { id: "PRODUCT", label: "Produtos", icon: Package },
            { id: "AVATAR", label: "Avatares", icon: User },
            { id: "FLYER", label: "Panfletos", icon: Sparkles }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id as any)}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                  isActive 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Campo de Busca */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar imagem ou tag..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* GRELHA DINÂMICA DE IMAGENS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-orange-500" />
            <p className="text-xs font-medium">A carregar biblioteca de média...</p>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <ImageIcon className="w-12 h-12 stroke-1 mx-auto text-slate-300" />
            <h4 className="font-bold text-sm text-slate-600">Nenhuma imagem encontrada</h4>
            <p className="text-xs max-w-sm mx-auto">
              {searchQuery ? "Nenhuma imagem corresponde à sua pesquisa." : "Carregue a sua primeira imagem acima para começar a usar média dinâmica no sistema."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredImages.map((img) => {
              const kbSize = Math.round(img.sizeBytes / 1024);
              const isCopied = copiedId === img.id;

              return (
                <div
                  key={img.id}
                  className="group relative bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:border-orange-400 hover:shadow-md transition flex flex-col justify-between"
                >
                  {/* Container da Imagem */}
                  <div 
                    onClick={() => setPreviewImage(img)}
                    className="aspect-square bg-slate-100 flex items-center justify-center p-2 relative overflow-hidden cursor-pointer"
                  >
                    <img
                      src={img.thumbnailUrl || img.dataUrl}
                      alt={img.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                    />

                    <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider ${getCategoryBadgeColor(img.category)}`}>
                      {getCategoryLabel(img.category)}
                    </span>

                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(img); }}
                        className="p-1.5 bg-white text-slate-900 rounded-lg hover:bg-slate-100 shadow-xs"
                        title="Ver em tamanho real"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleCopyDataUrl(img); }}
                        className="p-1.5 bg-white text-slate-900 rounded-lg hover:bg-slate-100 shadow-xs"
                        title="Copiar Data URL"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Informações e Rodapé */}
                  <div className="p-2.5 bg-white border-t border-slate-100 space-y-1">
                    <p className="text-[11px] font-bold text-slate-800 truncate" title={img.name}>
                      {img.name}
                    </p>

                    <div className="flex items-center justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>{kbSize} KB</span>
                      <span>{img.width ? `${img.width}x${img.height}` : "Otimizada"}</span>
                    </div>

                    {/* Botões de Ação */}
                    <div className="pt-1.5 flex items-center justify-between border-t border-slate-100">
                      {img.category === "LOGO" && onSetAsLogo ? (
                        <button
                          type="button"
                          onClick={() => handleSetLogo(img)}
                          className="text-[10px] text-orange-600 font-bold hover:underline"
                        >
                          Usar Logo
                        </button>
                      ) : (
                        <span className="text-[9.5px] text-slate-400 truncate font-mono">
                          {img.id.slice(0, 10)}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteImage(img.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Remover imagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE PREVISUALIZAÇÃO EM ALTA RESOLUÇÃO */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">{previewImage.name}</h4>
                <p className="text-[11px] text-slate-400 font-mono">
                  ID: {previewImage.id} • {Math.round(previewImage.sizeBytes / 1024)} KB • {previewImage.width}x{previewImage.height}px
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 bg-slate-950/5 flex items-center justify-center max-h-[60vh] overflow-hidden">
              <img
                src={previewImage.dataUrl}
                alt={previewImage.name}
                className="max-h-[50vh] max-w-full object-contain rounded-xl shadow-xs"
              />
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyDataUrl(previewImage)}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === previewImage.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copiar Data URL
                </button>

                {onSetAsLogo && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSetLogo(previewImage);
                      setPreviewImage(null);
                    }}
                    className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Building className="w-3.5 h-3.5" />
                    Definir como Logotipo
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  deleteImage(previewImage.id);
                  setPreviewImage(null);
                }}
                className="px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
