import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { getActiveSmtpConfig, saveActiveSmtpConfig } from "../server/smtpService";

describe("Configuração SMTP no Banco de Dados (Substitui .env)", () => {
  const dbDir = path.join(process.cwd(), "db_store");
  const settingsFile = path.join(dbDir, "settings.json");
  let originalContent: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(settingsFile)) {
      originalContent = fs.readFileSync(settingsFile, "utf-8");
    } else {
      originalContent = null;
    }
  });

  afterAll(() => {
    if (originalContent !== null) {
      fs.writeFileSync(settingsFile, originalContent, "utf-8");
    }
  });

  it("deve gravar credenciais SMTP no banco de dados e priorizar sobre variáveis .env", () => {
    const saved = saveActiveSmtpConfig({
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpUser: "faturacao@empresa.co.mz",
      smtpPassword: "app_password_secret_123",
      smtpSecure: false,
      smtpEnabled: true,
      smtpSenderName: "OST Vendas - Faturação Oficial",
      smtpFromEmail: "faturacao@empresa.co.mz"
    });

    expect(saved.source).toBe("database");
    expect(saved.host).toBe("smtp.office365.com");
    expect(saved.port).toBe(587);
    expect(saved.user).toBe("faturacao@empresa.co.mz");
    expect(saved.pass).toBe("app_password_secret_123");
    expect(saved.senderName).toBe("OST Vendas - Faturação Oficial");
    expect(saved.enabled).toBe(true);

    const active = getActiveSmtpConfig();
    expect(active.source).toBe("database");
    expect(active.host).toBe("smtp.office365.com");
    expect(active.user).toBe("faturacao@empresa.co.mz");
  });

  it("deve preservar a palavra-passe existente caso a atualização envie senha em branco", () => {
    saveActiveSmtpConfig({
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "comercial@gmail.com",
      smtpPassword: "initial_secure_password_999"
    });

    // Atualiza apenas a porta e o remetente sem passar nova senha
    const updated = saveActiveSmtpConfig({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpUser: "comercial@gmail.com",
      smtpPassword: "", // Senha vazia (não deve apagar a senha já salva)
      smtpSecure: true
    });

    expect(updated.port).toBe(465);
    expect(updated.secure).toBe(true);
    expect(updated.pass).toBe("initial_secure_password_999");
  });

  it("deve permitir desativar ou reativar o serviço SMTP no banco de dados", () => {
    const disabled = saveActiveSmtpConfig({
      smtpHost: "mail.meudominio.co.mz",
      smtpUser: "noreply@meudominio.co.mz",
      smtpEnabled: false
    });
    expect(disabled.enabled).toBe(false);

    const reenabled = saveActiveSmtpConfig({
      smtpEnabled: true
    });
    expect(reenabled.enabled).toBe(true);
  });

  it("deve gravar credenciais da biblioteca Resend e modo de envio", () => {
    const saved = saveActiveSmtpConfig({
      provider: "resend",
      resendApiKey: "re_prod_test_key_xyz987",
      resendFromEmail: "faturas@empresa.co.mz",
      alertsRecipientEmail: "admin@empresa.co.mz",
      emailAlertsStockEnabled: true,
      emailAlertsCashShiftEnabled: true
    });

    expect(saved.provider).toBe("resend");
    expect(saved.resendApiKey).toBe("re_prod_test_key_xyz987");
    expect(saved.resendFromEmail).toBe("faturas@empresa.co.mz");
    expect(saved.alertsRecipientEmail).toBe("admin@empresa.co.mz");
    expect(saved.emailAlertsStockEnabled).toBe(true);
    expect(saved.emailAlertsCashShiftEnabled).toBe(true);

    const active = getActiveSmtpConfig();
    expect(active.provider).toBe("resend");
    expect(active.resendApiKey).toBe("re_prod_test_key_xyz987");
    expect(active.host).toBe("smtp.resend.com");
    expect(active.port).toBe(465);
    expect(active.secure).toBe(true);
  });
});
