/**
 * @file imageStorageService.ts
 * Classe centralizada e reativa responsável por armazenar, comprimir, indexar
 * e recuperar dinamicamente todas as imagens da aplicação (Logotipos, Produtos,
 * Avatares de Colaboradores, Panfletos Promocionais e Anexos).
 * 
 * Funcionalidades:
 * - Armazenamento persistente de alto desempenho em IndexedDB com fallback para LocalStorage
 * - Compressão inteligente e conversão automática para WebP/JPEG leve via Canvas
 * - Geração automática de miniaturas (thumbnails) para otimização de grelhas e listagens
 * - Cache em memória (LRU Map) para resposta instantânea (<1ms) em re-renderizações
 * - Notificação reativa de ouvintes (Event Emitter) para sincronização de UI em tempo real
 * - Utilitários de exportação/importação (Backup de Média) e métricas de armazenamento
 */

export type ImageCategory = 
  | "LOGO" 
  | "PRODUCT" 
  | "AVATAR" 
  | "FLYER" 
  | "BANNER" 
  | "CUSTOMER" 
  | "DOCUMENT" 
  | "MISC";

export interface StoredImage {
  /** Identificador único ou chave semântica (ex: 'company_logo', 'prod_p1', 'user_u1') */
  id: string;
  /** Nome legível da imagem */
  name: string;
  /** Categoria da imagem */
  category: ImageCategory;
  /** Data URL otimizado (Base64) pronto para uso em tags <img> ou PDFs */
  dataUrl: string;
  /** Miniatura ultra-leve otimizada para grelhas */
  thumbnailUrl?: string;
  /** Tipo MIME (ex: image/webp, image/jpeg, image/png) */
  mimeType: string;
  /** Tamanho aproximado em bytes */
  sizeBytes: number;
  /** Largura da imagem em pixels */
  width?: number;
  /** Altura da imagem em pixels */
  height?: number;
  /** Tags para pesquisa rápida */
  tags?: string[];
  /** ID da entidade associada (ex: productId, employeeId, companyId) */
  entityId?: string;
  /** Timestamp ISO de criação */
  createdAt: string;
  /** Timestamp ISO da última atualização */
  updatedAt: string;
}

export interface SaveImageOptions {
  /** Categoria da imagem (padrão: MISC) */
  category?: ImageCategory;
  /** Identificador personalizado; se omitido, é gerado automaticamente */
  id?: string;
  /** Nome legível */
  name?: string;
  /** ID da entidade relacionada (ex: ID do produto ou colaborador) */
  entityId?: string;
  /** Tags de classificação */
  tags?: string[];
  /** Largura máxima permitida para redimensionamento proporcional (padrão: 1200) */
  maxWidth?: number;
  /** Altura máxima permitida (padrão: 1200) */
  maxHeight?: number;
  /** Qualidade de compressão de 0.1 a 1.0 (padrão: 0.85) */
  quality?: number;
  /** Formato de saída desejado (padrão: image/webp com fallback para image/jpeg) */
  format?: "image/webp" | "image/jpeg" | "image/png";
  /** Se deve gerar miniatura automática (padrão: true) */
  generateThumbnail?: boolean;
}

export interface StorageMetrics {
  totalImages: number;
  totalBytes: number;
  formattedSize: string;
  byCategory: Record<ImageCategory, { count: number; bytes: number }>;
}

type StorageEventListener = (event: { type: "save" | "delete" | "clear"; image?: StoredImage; id?: string }) => void;

export class ImageStorageService {
  private static instance: ImageStorageService;

  private readonly dbName = "OstVendas_AppMedia";
  private readonly dbVersion = 1;
  private readonly storeName = "images";
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  // Cache em memória para recuperação instantânea
  private memoryCache = new Map<string, StoredImage>();
  private readonly maxMemoryCacheSize = 250;

  // Ouvintes para reatividade em componentes React
  private listeners: Set<StorageEventListener> = new Set();

  // Logotipo padrão da aplicação
  public readonly DEFAULT_LOGO_FALLBACK = "/src/assets/images/app_logo_1782658148089.jpg";

  public constructor() {
    this.initDatabase();
  }

  /**
   * Padrão Singleton para acesso centralizado e sincronizado em toda a aplicação.
   */
  public static getInstance(): ImageStorageService {
    if (!ImageStorageService.instance) {
      ImageStorageService.instance = new ImageStorageService();
    }
    return ImageStorageService.instance;
  }

  /**
   * Inicializa o banco de dados IndexedDB no navegador com suporte a índices.
   */
  private initDatabase(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === "undefined" || !window.indexedDB) {
      console.warn("[ImageStorageService] IndexedDB não disponível neste ambiente. Usando fallback de memória/localStorage.");
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, { keyPath: "id" });
            store.createIndex("category", "category", { unique: false });
            store.createIndex("entityId", "entityId", { unique: false });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (e) => {
          console.error("[ImageStorageService] Falha ao abrir IndexedDB:", e);
          resolve(null);
        };
      } catch (err) {
        console.error("[ImageStorageService] Erro ao instanciar IndexedDB:", err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Registra um ouvinte para atualizações dinâmicas da galeria de imagens.
   */
  public subscribe(listener: StorageEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: { type: "save" | "delete" | "clear"; image?: StoredImage; id?: string }) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.warn("[ImageStorageService] Erro ao notificar ouvinte:", e);
      }
    });
  }

  /**
   * Salva uma imagem (File, Blob ou string Data URL) de forma compactada e persistente.
   */
  public async saveImage(
    source: File | Blob | string,
    options: SaveImageOptions = {}
  ): Promise<StoredImage> {
    const category = options.category || "MISC";
    const entityId = options.entityId;
    const customId = options.id || (entityId ? `${category.toLowerCase()}_${entityId}` : `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const name = options.name || (source instanceof File ? source.name : `Imagem ${category}`);
    
    // 1. Converte a fonte em Data URL inicial
    let rawDataUrl: string;
    if (typeof source === "string") {
      rawDataUrl = source;
    } else {
      rawDataUrl = await this.fileToDataUrl(source);
    }

    // 2. Comprime e otimiza a imagem principal
    const { dataUrl, width, height, mimeType, sizeBytes } = await this.optimizeImage(rawDataUrl, {
      maxWidth: options.maxWidth ?? (category === "LOGO" ? 800 : 1200),
      maxHeight: options.maxHeight ?? (category === "LOGO" ? 800 : 1200),
      quality: options.quality ?? 0.85,
      format: options.format ?? "image/webp"
    });

    // 3. Gera miniatura se solicitado
    let thumbnailUrl: string | undefined;
    if (options.generateThumbnail !== false) {
      try {
        const thumb = await this.optimizeImage(dataUrl, {
          maxWidth: 160,
          maxHeight: 160,
          quality: 0.75,
          format: "image/webp"
        });
        thumbnailUrl = thumb.dataUrl;
      } catch {
        thumbnailUrl = dataUrl;
      }
    }

    const now = new Date().toISOString();
    const storedImage: StoredImage = {
      id: customId,
      name,
      category,
      dataUrl,
      thumbnailUrl,
      mimeType,
      sizeBytes,
      width,
      height,
      tags: options.tags || [],
      entityId,
      createdAt: now,
      updatedAt: now
    };

    // 4. Salva no banco de dados e memória
    await this.persistToStorage(storedImage);
    this.setMemoryCache(storedImage.id, storedImage);

    // 5. Notifica ouvintes reativos
    this.notify({ type: "save", image: storedImage });

    return storedImage;
  }

  /**
   * Obtém uma imagem pelo ID ou chave semântica.
   */
  public async getImage(id: string): Promise<StoredImage | null> {
    if (!id) return null;

    // 1. Verifica cache em memória
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id)!;
    }

    // 2. Procura no IndexedDB
    const db = await this.initDatabase();
    if (db) {
      try {
        const fromDb = await new Promise<StoredImage | null>((resolve) => {
          const transaction = db.transaction([this.storeName], "readonly");
          const store = transaction.objectStore(this.storeName);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        if (fromDb) {
          this.setMemoryCache(id, fromDb);
          return fromDb;
        }
      } catch (err) {
        console.warn("[ImageStorageService] Erro ao buscar no IndexedDB:", err);
      }
    }

    // 3. Fallback no LocalStorage
    try {
      if (typeof localStorage !== "undefined") {
        const localItem = localStorage.getItem(`ost_img_${id}`);
        if (localItem) {
          const parsed = JSON.parse(localItem) as StoredImage;
          this.setMemoryCache(id, parsed);
          return parsed;
        }
      }
    } catch {}

    return null;
  }

  /**
   * Retorna a URL base64 da imagem ou uma URL fallback segura.
   */
  public async getImageUrl(id: string, fallbackUrl = ""): Promise<string> {
    const item = await this.getImage(id);
    return item?.dataUrl || fallbackUrl;
  }

  /**
   * Remove uma imagem pelo ID.
   */
  public async deleteImage(id: string): Promise<boolean> {
    if (!id) return false;

    this.memoryCache.delete(id);

    const db = await this.initDatabase();
    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([this.storeName], "readwrite");
          const store = transaction.objectStore(this.storeName);
          const req = store.delete(id);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn("[ImageStorageService] Falha ao deletar no IndexedDB:", e);
      }
    }

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`ost_img_${id}`);
      }
    } catch {}

    this.notify({ type: "delete", id });
    return true;
  }

  /**
   * Lista todas as imagens armazenadas, opcionalmente filtrando por categoria.
   */
  public async listImages(category?: ImageCategory): Promise<StoredImage[]> {
    const db = await this.initDatabase();
    let results: StoredImage[] = [];

    if (db) {
      try {
        results = await new Promise<StoredImage[]>((resolve) => {
          const transaction = db.transaction([this.storeName], "readonly");
          const store = transaction.objectStore(this.storeName);
          
          if (category) {
            const index = store.index("category");
            const req = index.getAll(category);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          } else {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          }
        });
      } catch (e) {
        console.warn("[ImageStorageService] Falha ao listar do IndexedDB:", e);
      }
    }

    // Se IndexedDB estiver vazio ou indisponível, faz fallback para LocalStorage
    if (results.length === 0 && typeof localStorage !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("ost_img_")) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as StoredImage;
              if (!category || parsed.category === category) {
                results.push(parsed);
              }
            }
          }
        }
      } catch {}
    }

    // Atualiza cache em memória com os itens retornados
    results.forEach((img) => this.setMemoryCache(img.id, img));

    // Ordena do mais recente para o mais antigo
    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Procura imagens por termo textual em nome, tags ou ID.
   */
  public async searchImages(query: string, category?: ImageCategory): Promise<StoredImage[]> {
    const all = await this.listImages(category);
    if (!query || !query.trim()) return all;

    const q = query.toLowerCase().trim();
    return all.filter((img) => {
      const matchName = img.name.toLowerCase().includes(q);
      const matchId = img.id.toLowerCase().includes(q);
      const matchTag = img.tags?.some((t) => t.toLowerCase().includes(q));
      return matchName || matchId || matchTag;
    });
  }

  // =========================================================================
  // MÉTODOS ESPECIALIZADOS DE DOMÍNIO (Logotipo, Produtos, Avatares, Panfletos)
  // =========================================================================

  /**
   * Salva e ativa o logotipo dinâmico da empresa.
   */
  public async saveCompanyLogo(source: File | Blob | string, companyId = "default"): Promise<StoredImage> {
    const id = `company_logo_${companyId}`;
    return this.saveImage(source, {
      id,
      category: "LOGO",
      entityId: companyId,
      name: "Logotipo da Empresa",
      maxWidth: 900,
      maxHeight: 900,
      quality: 0.9,
      tags: ["logotipo", "empresa", "cabecalho_fatura"]
    });
  }

  /**
   * Retorna o logotipo atual da empresa ou o fallback padrão caso nenhum esteja cadastrado.
   */
  public async getCompanyLogo(companyId = "default"): Promise<string> {
    const id = `company_logo_${companyId}`;
    const img = await this.getImage(id);
    if (img?.dataUrl) return img.dataUrl;

    // Tenta fallback sem sufixo
    const fallbackMain = await this.getImage("company_logo");
    if (fallbackMain?.dataUrl) return fallbackMain.dataUrl;

    return this.DEFAULT_LOGO_FALLBACK;
  }

  /**
   * Salva a imagem de um produto no catálogo.
   */
  public async saveProductImage(
    productId: string,
    source: File | Blob | string,
    productName?: string
  ): Promise<StoredImage> {
    const id = `product_${productId}`;
    return this.saveImage(source, {
      id,
      category: "PRODUCT",
      entityId: productId,
      name: productName ? `Foto: ${productName}` : `Produto ${productId}`,
      maxWidth: 1000,
      maxHeight: 1000,
      quality: 0.82,
      tags: ["produto", productId]
    });
  }

  /**
   * Retorna a imagem de um produto pelo ID.
   */
  public async getProductImage(productId: string): Promise<string | null> {
    if (!productId) return null;
    const img = await this.getImage(`product_${productId}`);
    return img?.dataUrl || null;
  }

  /**
   * Salva o avatar de um colaborador ou usuário.
   */
  public async saveUserAvatar(
    userId: string,
    source: File | Blob | string,
    userName?: string
  ): Promise<StoredImage> {
    const id = `avatar_${userId}`;
    return this.saveImage(source, {
      id,
      category: "AVATAR",
      entityId: userId,
      name: userName ? `Avatar de ${userName}` : `Colaborador ${userId}`,
      maxWidth: 400,
      maxHeight: 400,
      quality: 0.85,
      tags: ["avatar", userId]
    });
  }

  /**
   * Retorna o avatar de um usuário ou avatar gerado com iniciais.
   */
  public async getUserAvatar(userId: string, userName = "Utilizador"): Promise<string> {
    if (userId) {
      const img = await this.getImage(`avatar_${userId}`);
      if (img?.dataUrl) return img.dataUrl;
    }
    return this.createPlaceholderSvg(userName, "AVATAR", 120, 120);
  }

  /**
   * Salva um panfleto promocional ou banner da loja.
   */
  public async saveFlyer(
    source: File | Blob | string,
    title = "Panfleto Promocional",
    tags: string[] = []
  ): Promise<StoredImage> {
    return this.saveImage(source, {
      category: "FLYER",
      name: title,
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.88,
      tags: ["promocao", "panfleto", ...tags]
    });
  }

  // =========================================================================
  // GESTÃO, BACKUP E MÉTRICAS DE ARMAZENAMENTO
  // =========================================================================

  /**
   * Calcula métricas de consumo de espaço e contagem de imagens por categoria.
   */
  public async getStorageMetrics(): Promise<StorageMetrics> {
    const images = await this.listImages();
    let totalBytes = 0;

    const byCategory: Record<ImageCategory, { count: number; bytes: number }> = {
      LOGO: { count: 0, bytes: 0 },
      PRODUCT: { count: 0, bytes: 0 },
      AVATAR: { count: 0, bytes: 0 },
      FLYER: { count: 0, bytes: 0 },
      BANNER: { count: 0, bytes: 0 },
      CUSTOMER: { count: 0, bytes: 0 },
      DOCUMENT: { count: 0, bytes: 0 },
      MISC: { count: 0, bytes: 0 }
    };

    images.forEach((img) => {
      const cat = img.category || "MISC";
      const bytes = img.sizeBytes || Math.round(img.dataUrl.length * 0.75);
      totalBytes += bytes;
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, bytes: 0 };
      }
      byCategory[cat].count += 1;
      byCategory[cat].bytes += bytes;
    });

    return {
      totalImages: images.length,
      totalBytes,
      formattedSize: this.formatBytes(totalBytes),
      byCategory
    };
  }

  /**
   * Exporta todas as imagens em JSON para backup ou migração de base de dados.
   */
  public async exportAllAsJson(): Promise<string> {
    const images = await this.listImages();
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      count: images.length,
      images
    }, null, 2);
  }

  /**
   * Importa imagens de um backup JSON.
   */
  public async importFromJson(jsonString: string): Promise<{ imported: number; errors: number }> {
    let imported = 0;
    let errors = 0;

    try {
      const payload = JSON.parse(jsonString);
      const list: StoredImage[] = Array.isArray(payload) ? payload : (payload.images || []);

      for (const item of list) {
        if (item && item.id && item.dataUrl) {
          try {
            await this.persistToStorage(item);
            this.setMemoryCache(item.id, item);
            imported++;
          } catch {
            errors++;
          }
        }
      }

      this.notify({ type: "save" });
    } catch (e) {
      console.error("[ImageStorageService] Erro ao importar JSON de imagens:", e);
      throw new Error("Formato de ficheiro de backup inválido.");
    }

    return { imported, errors };
  }

  /**
   * Limpa todas as imagens de uma categoria específica ou de todo o armazenamento.
   */
  public async clearCategory(category?: ImageCategory): Promise<void> {
    const list = await this.listImages(category);
    for (const img of list) {
      await this.deleteImage(img.id);
    }
    this.notify({ type: "clear" });
  }

  // =========================================================================
  // AUXILIARES DE CONVERSÃO E CANVAS
  // =========================================================================

  /**
   * Converte File ou Blob em Data URL.
   */
  public fileToDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler o ficheiro de imagem."));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Comprime e redimensiona imagem usando HTML5 Canvas em alta velocidade.
   */
  private async optimizeImage(
    srcDataUrl: string,
    options: { maxWidth: number; maxHeight: number; quality: number; format: string }
  ): Promise<{ dataUrl: string; width: number; height: number; mimeType: string; sizeBytes: number }> {
    if (typeof window === "undefined" || typeof Image === "undefined" || typeof document === "undefined") {
      return {
        dataUrl: srcDataUrl,
        width: 100,
        height: 100,
        mimeType: "image/png",
        sizeBytes: Math.round(srcDataUrl.length * 0.75)
      };
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        let { width, height } = img;
        const maxW = options.maxWidth;
        const maxH = options.maxHeight;

        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback caso contexto 2D não esteja disponível
          resolve({
            dataUrl: srcDataUrl,
            width: img.width,
            height: img.height,
            mimeType: "image/jpeg",
            sizeBytes: Math.round(srcDataUrl.length * 0.75)
          });
          return;
        }

        // Renderiza com suavização de imagem ativa
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Testa suporte a WebP; se falhar, usa JPEG
        let targetFormat = options.format;
        let compressed = canvas.toDataURL(targetFormat, options.quality);
        if (targetFormat === "image/webp" && !compressed.startsWith("data:image/webp")) {
          targetFormat = "image/jpeg";
          compressed = canvas.toDataURL(targetFormat, options.quality);
        }

        const sizeBytes = Math.round((compressed.length * 3) / 4);

        resolve({
          dataUrl: compressed,
          width,
          height,
          mimeType: targetFormat,
          sizeBytes
        });
      };

      img.onerror = () => {
        reject(new Error("Não foi possível carregar a imagem para compressão."));
      };

      img.src = srcDataUrl;
    });
  }

  /**
   * Persiste no IndexedDB ou LocalStorage.
   */
  private async persistToStorage(storedImage: StoredImage): Promise<void> {
    const db = await this.initDatabase();

    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction([this.storeName], "readwrite");
          const store = transaction.objectStore(this.storeName);
          const request = store.put(storedImage);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    }

    // Fallback: LocalStorage se dentro do limite
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`ost_img_${storedImage.id}`, JSON.stringify(storedImage));
      }
    } catch (e) {
      console.warn("[ImageStorageService] Quota excedida no LocalStorage para imagem:", e);
    }
  }

  private setMemoryCache(id: string, image: StoredImage) {
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(id, image);
  }

  /**
   * Cria um SVG Data URL dinâmico com iniciais estilizadas para placeholders imediatos.
   */
  public createPlaceholderSvg(
    text: string,
    category: ImageCategory = "PRODUCT",
    width = 200,
    height = 200
  ): string {
    const cleanText = (text || "").trim().slice(0, 3).toUpperCase() || "OST";
    const bgColors: Record<ImageCategory, string> = {
      LOGO: "#ea580c",
      PRODUCT: "#0284c7",
      AVATAR: "#059669",
      FLYER: "#7c3aed",
      BANNER: "#d97706",
      CUSTOMER: "#2563eb",
      DOCUMENT: "#475569",
      MISC: "#64748b"
    };
    const bg = bgColors[category] || "#ea580c";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bg}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${bg}" stop-opacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="16" fill="url(#grad)"/>
      <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.35}" fill="#ffffff" fill-opacity="0.15"/>
      <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${Math.round(height * 0.28)}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">
        ${cleanText}
      </text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

// Instância Singleton exportada por defeito
export const imageStorageService = ImageStorageService.getInstance();
