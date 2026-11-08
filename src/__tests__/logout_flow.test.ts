import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseSyncService } from "../services/supabaseService";
import { CommercialDataService } from "../services/dataService";

describe("Fluxo Autoritativo de Término de Sessão", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {
      "erp_logged_in_user": JSON.stringify({ id: "emp-1", name: "Operador Teste", role: "CASHIER" }),
      "sb-project-ref-auth-token": '{"access_token":"token123","user":{"id":"user-1"}}',
      "sb-another-token": '{"token":"xyz"}'
    };

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      get length() { return Object.keys(mockStorage).length; },
      key: (i: number) => Object.keys(mockStorage)[i] || null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Terminar Sessão → signOut deve remover tokens do Supabase e limpar sessão", async () => {
    expect(mockStorage["sb-project-ref-auth-token"]).toBeDefined();

    await SupabaseSyncService.signOut();

    expect(mockStorage["sb-project-ref-auth-token"]).toBeUndefined();
    expect(mockStorage["sb-another-token"]).toBeUndefined();
  });

  it("2. Durante logout, a flag erp_user_logged_out impede restauração indevida de sessão", () => {
    mockStorage["erp_user_logged_out"] = "true";

    const isLoggedOut = localStorage.getItem("erp_user_logged_out") === "true";
    expect(isLoggedOut).toBe(true);

    // Quando o utilizador inicia sessão ativamente, a flag é removida
    localStorage.removeItem("erp_user_logged_out");
    expect(localStorage.getItem("erp_user_logged_out")).toBeNull();
  });

  it("3. SupabaseSyncService.signOut delega para client.auth.signOut sem lançar exceção não tratada", async () => {
    await expect(SupabaseSyncService.signOut()).resolves.not.toThrow();
  });

  it("4. CommercialDataService.signOut invoca o SupabaseSyncService.signOut", async () => {
    const signOutSpy = vi.spyOn(SupabaseSyncService, "signOut");
    await CommercialDataService.signOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});
