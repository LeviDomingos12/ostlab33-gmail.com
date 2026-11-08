import { describe, it, expect, beforeEach } from "vitest";
import { ImageStorageService } from "../services/imageStorageService";

describe("ImageStorageService", () => {
  let service: ImageStorageService;

  beforeEach(() => {
    service = new ImageStorageService();
  });

  it("deve instanciar a classe e obter o padrão singleton", () => {
    const instance1 = ImageStorageService.getInstance();
    const instance2 = ImageStorageService.getInstance();
    expect(instance1).toBeDefined();
    expect(instance1).toBe(instance2);
  });

  it("deve gerar SVG placeholder dinâmico com cores por categoria", () => {
    const logoPlaceholder = service.createPlaceholderSvg("EMPRESA", "LOGO", 100, 100);
    expect(logoPlaceholder).toContain("data:image/svg+xml");
    expect(logoPlaceholder).toContain("EMP");

    const prodPlaceholder = service.createPlaceholderSvg("ARROZ", "PRODUCT", 120, 120);
    expect(prodPlaceholder).toContain("data:image/svg+xml");
    expect(prodPlaceholder).toContain("ARR");
  });

  it("deve salvar e recuperar imagem de produto dinamicamente", async () => {
    const fakeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const stored = await service.saveProductImage("prod_101", fakeDataUrl, "Arroz 5kg");

    expect(stored.id).toBe("product_prod_101");
    expect(stored.category).toBe("PRODUCT");
    expect(stored.entityId).toBe("prod_101");
    expect(stored.name).toContain("Arroz 5kg");

    const retrieved = await service.getProductImage("prod_101");
    expect(retrieved).toBe(stored.dataUrl);
  });

  it("deve salvar e recuperar logotipo da empresa", async () => {
    const fakeLogo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const stored = await service.saveCompanyLogo(fakeLogo, "matola");

    expect(stored.id).toBe("company_logo_matola");
    expect(stored.category).toBe("LOGO");

    const logo = await service.getCompanyLogo("matola");
    expect(logo).toBe(stored.dataUrl);
  });

  it("deve calcular métricas de armazenamento", async () => {
    const metrics = await service.getStorageMetrics();
    expect(metrics).toHaveProperty("totalImages");
    expect(metrics).toHaveProperty("totalBytes");
    expect(metrics).toHaveProperty("formattedSize");
    expect(metrics.byCategory).toHaveProperty("PRODUCT");
    expect(metrics.byCategory).toHaveProperty("LOGO");
  });

  it("deve exportar e importar backup de imagens em JSON", async () => {
    const jsonBackup = await service.exportAllAsJson();
    expect(typeof jsonBackup).toBe("string");

    const parsed = JSON.parse(jsonBackup);
    expect(parsed).toHaveProperty("version");
    expect(parsed).toHaveProperty("images");

    const importResult = await service.importFromJson(jsonBackup);
    expect(importResult.errors).toBe(0);
  });
});
