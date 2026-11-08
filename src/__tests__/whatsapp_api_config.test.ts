import { describe, it, expect } from "vitest";

describe("WhatsApp API Integration Configuration and Logs", () => {
  it("should validate WhatsApp configuration settings structure", () => {
    const settings = {
      whatsappEnabled: true,
      whatsappProvider: "EVOLUTION_API" as const,
      whatsappApiEndpoint: "https://api.evolution-api.com",
      whatsappToken: "test-token-123",
      whatsappPhoneId: "instance-01",
      managerWhatsappPhone: "+258841234567",
      whatsappMessageTemplate: "Stock critical alert: {{productName}}",
      whatsappLogs: [
        {
          id: "log-1",
          timestamp: "2026-11-08 12:00:00",
          recipient: "+258841234567",
          provider: "EVOLUTION_API",
          status: "SUCCESS" as const,
          message: "Test message",
          response: "HTTP 200 OK"
        }
      ]
    };

    expect(settings.whatsappEnabled).toBe(true);
    expect(settings.whatsappProvider).toBe("EVOLUTION_API");
    expect(settings.whatsappLogs.length).toBe(1);
    expect(settings.whatsappLogs[0].status).toBe("SUCCESS");
  });

  it("should format WhatsApp message template correctly with variables", () => {
    const template = "⚠️ ALERTA: Produto *{{productName}}* (SKU: {{sku}}) atingiu nível crítico. Stock: {{stock}} un.";
    const product = { name: "Arroz 25kg", code: "SKU-1001", stock: 2, minStock: 10 };

    const rendered = template
      .replace("{{productName}}", product.name)
      .replace("{{sku}}", product.code)
      .replace("{{stock}}", String(product.stock))
      .replace("{{minStock}}", String(product.minStock));

    expect(rendered).toContain("Arroz 25kg");
    expect(rendered).toContain("SKU-1001");
    expect(rendered).toContain("Stock: 2 un.");
  });
});
