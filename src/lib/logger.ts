type LogCallback = (action: string, module: string, details: string) => void;

let logCallback: LogCallback | null = null;
const pendingLogs: { action: string; module: string; details: string }[] = [];
let isLogging = false;
let lastLogTimestamp = 0;
const MAX_PENDING_LOGS = 20;

export function setLogCallback(callback: LogCallback) {
  logCallback = callback;
  if (pendingLogs.length > 0 && !isLogging) {
    isLogging = true;
    try {
      const logsToFlush = [...pendingLogs];
      pendingLogs.length = 0;
      setTimeout(() => {
        logsToFlush.forEach(log => {
          try {
            callback(log.action, log.module, log.details);
          } catch {
            // Prevent error escalation
          }
        });
      }, 0);
    } finally {
      isLogging = false;
    }
  }
}

export function logErrorToSystem(action: string, details: string) {
  // Throttle error logging to at most 1 per 2 seconds to avoid CPU/RAM saturation
  const now = Date.now();
  if (now - lastLogTimestamp < 2000) return;
  lastLogTimestamp = now;

  if (isLogging) return;
  isLogging = true;
  try {
    if (logCallback) {
      setTimeout(() => {
        try {
          if (logCallback) logCallback(action, "Erros do Sistema", details);
        } catch {}
      }, 0);
    } else {
      if (pendingLogs.length < MAX_PENDING_LOGS) {
        pendingLogs.push({ action, module: "Erros do Sistema", details });
      }
    }
  } catch {
    // Suppress errors within logger itself
  } finally {
    isLogging = false;
  }
}

export function initErrorCapturing() {
  if (typeof window === "undefined") return () => {};

  const handleGlobalError = (event: ErrorEvent) => {
    const error = event.error;
    const message = error?.message || event.message || "Erro desconhecido";
    const stack = error?.stack ? error.stack.split("\n").slice(0, 2).join(" | ") : "";
    const file = event.filename ? ` em ${event.filename.split("/").pop()}:${event.lineno}:${event.colno}` : "";
    
    logErrorToSystem("ERRO_SILENCIOSO", `${message}${file} | Stack: ${stack}`);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error && reason.stack ? reason.stack.split("\n").slice(0, 2).join(" | ") : "";
    
    logErrorToSystem("PROMESSA_REJEITADA", `Rejeição de promessa: ${message} | Stack: ${stack}`);
  };

  // Safe Monkey-Patch console.error to intercept and log silent errors
  const originalConsoleError = console.error;
  let isReporting = false;

  console.error = (...args: any[]) => {
    originalConsoleError.apply(console, args);

    if (isReporting || isLogging) return;
    isReporting = true;
    try {
      const message = args
        .map(arg => {
          if (arg instanceof Error) return `${arg.message} | Stack: ${arg.stack?.split("\n").slice(0, 2).join(" | ")}`;
          if (typeof arg === "object") {
            try { return JSON.stringify(arg); } catch { return String(arg); }
          }
          return String(arg);
        })
        .join(" ");

      // Ignore benign framework warnings, network retries, websockets, and audit sync
      if (
        message &&
        !message.includes("websocket") && 
        !message.includes("HMR") &&
        !message.includes("Vite") &&
        !message.includes("color-scheme") &&
        !message.includes("Google Maps") &&
        !message.includes("react-dom") &&
        !message.includes("pos_sync_queue") &&
        !message.includes("QUOTA") &&
        !message.includes("audit") &&
        !message.includes("ResizeObserver")
      ) {
        logErrorToSystem("CONSOLA_ERRO", message.substring(0, 180));
      }
    } catch {
      // Avoid breaking anything
    } finally {
      isReporting = false;
    }
  };

  // Monkey-Patch window.fetch to log failures but strictly avoid internal endpoints
  const originalFetch = window.fetch;
  let fetchPatched = false;

  try {
    const wrappedFetch = async function(...args: any[]) {
      const rawUrl = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : (args[0] as any)?.url || 'Desconhecido';
      
      try {
        const response = await originalFetch.apply(window, args as any);
        if (!response.ok) {
          // CRITICAL: NEVER log failures from sync/db/storage/telemetry endpoints to prevent infinite feedback loops!
          if (
            !rawUrl.includes("ipify.org") &&
            !rawUrl.includes("/api/db/") &&
            !rawUrl.includes("/api/security/") &&
            !rawUrl.includes("/api/backup") &&
            !rawUrl.includes("googleapis.com") &&
            !rawUrl.includes("supabase.co")
          ) {
            logErrorToSystem(
              "FALHA_API",
              `API respondeu com status ${response.status} (${response.statusText}) ao acessar: ${rawUrl.substring(0, 100)}`
            );
          }
        }
        return response;
      } catch (error: any) {
        if (
          !rawUrl.includes("ipify.org") &&
          !rawUrl.includes("/api/db/") &&
          !rawUrl.includes("/api/security/") &&
          !rawUrl.includes("/api/backup") &&
          !rawUrl.includes("googleapis.com") &&
          !rawUrl.includes("supabase.co")
        ) {
          logErrorToSystem(
            "FALHA_REDE",
            `Falha de conexão ao acessar ${rawUrl.substring(0, 100)}. Erro: ${error?.message || error}`
          );
        }
        throw error;
      }
    };

    Object.defineProperty(window, "fetch", {
      value: wrappedFetch,
      configurable: true,
      writable: true,
      enumerable: true
    });
    fetchPatched = true;
  } catch (err) {
    console.warn("[LOGGER] Não foi possível interceptar window.fetch:", err);
  }

  window.addEventListener("error", handleGlobalError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleGlobalError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    console.error = originalConsoleError;
    if (fetchPatched) {
      try {
        Object.defineProperty(window, "fetch", {
          value: originalFetch,
          configurable: true,
          writable: true,
          enumerable: true
        });
      } catch {
        // Ignored
      }
    }
  };
}
