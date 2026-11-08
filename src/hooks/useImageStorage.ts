/**
 * @file useImageStorage.ts
 * Hooks React reativos para integração transparente com o ImageStorageService.
 * Permite que componentes escutem atualizações de logotipos, imagens de produtos
 * e ficheiros de média em tempo real sem recarregar a página.
 */

import { useState, useEffect, useCallback } from "react";
import { 
  imageStorageService, 
  StoredImage, 
  ImageCategory, 
  StorageMetrics, 
  SaveImageOptions 
} from "../services/imageStorageService";

/**
 * Hook para gerir a lista de imagens, métricas e operações de upload.
 */
export function useImageStorage(categoryFilter?: ImageCategory) {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [list, m] = await Promise.all([
        imageStorageService.listImages(categoryFilter),
        imageStorageService.getStorageMetrics()
      ]);
      setImages(list);
      setMetrics(m);
    } catch (e) {
      console.warn("[useImageStorage] Erro ao carregar média:", e);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    loadData();

    // Subscreve a eventos em tempo real
    const unsubscribe = imageStorageService.subscribe(() => {
      loadData();
    });

    return () => unsubscribe();
  }, [loadData]);

  const saveImage = useCallback(async (source: File | Blob | string, options?: SaveImageOptions) => {
    const saved = await imageStorageService.saveImage(source, options);
    await loadData();
    return saved;
  }, [loadData]);

  const deleteImage = useCallback(async (id: string) => {
    const ok = await imageStorageService.deleteImage(id);
    await loadData();
    return ok;
  }, [loadData]);

  const clearCategory = useCallback(async (cat?: ImageCategory) => {
    await imageStorageService.clearCategory(cat);
    await loadData();
  }, [loadData]);

  return {
    images,
    loading,
    metrics,
    refresh: loadData,
    saveImage,
    deleteImage,
    clearCategory
  };
}

/**
 * Hook reativo para o logotipo dinâmico da aplicação.
 * Qualquer componente que use este hook atualiza-se automaticamente
 * assim que o logótipo é alterado em qualquer tela.
 */
export function useDynamicLogo(companyId = "default") {
  const [logoUrl, setLogoUrl] = useState<string>(imageStorageService.DEFAULT_LOGO_FALLBACK);
  const [loading, setLoading] = useState(true);

  const refreshLogo = useCallback(async () => {
    try {
      const url = await imageStorageService.getCompanyLogo(companyId);
      setLogoUrl(url);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refreshLogo();

    const unsubscribe = imageStorageService.subscribe((event) => {
      if (
        event.type === "clear" ||
        event.image?.category === "LOGO" ||
        event.image?.id.includes("logo") ||
        event.id?.includes("logo")
      ) {
        refreshLogo();
      }
    });

    return () => unsubscribe();
  }, [refreshLogo]);

  const setLogo = useCallback(async (fileOrDataUrl: File | Blob | string) => {
    const saved = await imageStorageService.saveCompanyLogo(fileOrDataUrl, companyId);
    setLogoUrl(saved.dataUrl);
    return saved;
  }, [companyId]);

  return {
    logoUrl,
    setLogo,
    loading,
    refresh: refreshLogo
  };
}

/**
 * Hook reativo para a foto de um produto específico.
 */
export function useDynamicProductImage(productId?: string, fallbackEmoji = "📦") {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshImage = useCallback(async () => {
    if (!productId) {
      setImageUrl(null);
      return;
    }
    setLoading(true);
    try {
      const url = await imageStorageService.getProductImage(productId);
      setImageUrl(url);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    refreshImage();

    const unsubscribe = imageStorageService.subscribe((event) => {
      if (
        event.type === "clear" ||
        event.image?.entityId === productId ||
        event.image?.id === `product_${productId}` ||
        event.id === `product_${productId}`
      ) {
        refreshImage();
      }
    });

    return () => unsubscribe();
  }, [productId, refreshImage]);

  const saveProductImage = useCallback(async (fileOrDataUrl: File | Blob | string, name?: string) => {
    if (!productId) throw new Error("ID do produto é obrigatório.");
    const saved = await imageStorageService.saveProductImage(productId, fileOrDataUrl, name);
    setImageUrl(saved.dataUrl);
    return saved;
  }, [productId]);

  const placeholderSvg = productId 
    ? imageStorageService.createPlaceholderSvg(fallbackEmoji || "PRD", "PRODUCT")
    : null;

  return {
    imageUrl: imageUrl || placeholderSvg,
    hasCustomImage: !!imageUrl,
    saveProductImage,
    loading,
    refresh: refreshImage
  };
}
