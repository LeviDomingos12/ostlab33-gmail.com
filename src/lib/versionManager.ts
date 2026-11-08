import { useSyncExternalStore } from "react";

const VERSION_STORAGE_KEY = "ost_system_version";
const VERSION_CHANGE_EVENT = "ost_version_changed";

let cachedVersion: string = "1.0";
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(VERSION_STORAGE_KEY);
    if (saved && saved.trim()) {
      cachedVersion = saved.trim();
    }
  } catch (e) {}
}

const listeners = new Set<() => void>();

function notifyListeners(): void {
  setTimeout(() => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error("Error in version listener:", e);
      }
    });
  }, 0);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorageOrCustomEvent = () => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(VERSION_STORAGE_KEY);
        if (saved && saved.trim()) {
          cachedVersion = saved.trim();
        }
      } catch (e) {}
    }
    listener();
  };

  if (typeof window !== "undefined") {
    window.addEventListener(VERSION_CHANGE_EVENT as any, handleStorageOrCustomEvent);
    window.addEventListener("storage", handleStorageOrCustomEvent);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener(VERSION_CHANGE_EVENT as any, handleStorageOrCustomEvent);
      window.removeEventListener("storage", handleStorageOrCustomEvent);
    }
  };
}

/**
 * Computes next system version following strict sequence:
 * 1.0 → 1.1 → 1.2 → ... → 1.9 → 2.0 → 2.1 → ... → 2.9 → 3.0
 */
export function getNextVersion(currentVersion: string): string {
  const clean = currentVersion.trim().replace(/^v/i, "");
  const parts = clean.split(".");
  let major = parseInt(parts[0] || "1", 10);
  let minor = parseInt(parts[1] || "0", 10);

  if (isNaN(major) || major < 1) major = 1;
  if (isNaN(minor) || minor < 0) minor = 0;

  minor += 1;
  if (minor >= 10) {
    major += 1;
    minor = 0;
  }

  return `${major}.${minor}`;
}

/**
 * Gets the current persisted system version or initializes to '1.0'
 */
export function getSystemVersion(): string {
  return cachedVersion;
}

/**
 * Gets the current formatted version string (e.g. 'v1.0')
 */
export function getFormattedSystemVersion(): string {
  return `v${cachedVersion}`;
}

/**
 * Sets and persists the system version
 */
export function setSystemVersion(version: string): void {
  if (typeof window === "undefined") return;
  try {
    const clean = version.trim().replace(/^v/i, "");
    if (cachedVersion === clean) return;
    cachedVersion = clean;
    localStorage.setItem(VERSION_STORAGE_KEY, clean);
    notifyListeners();
    window.dispatchEvent(new CustomEvent(VERSION_CHANGE_EVENT, { detail: clean }));
  } catch (e) {
    console.error("Failed to save system version:", e);
  }
}

/**
 * Increments the system version to the next iteration (e.g., 1.0 -> 1.1)
 */
export function incrementSystemVersion(): string {
  const current = getSystemVersion();
  const next = getNextVersion(current);
  setSystemVersion(next);
  return next;
}

const getSnapshot = () => cachedVersion;
const getServerSnapshot = () => "1.0";

/**
 * React hook to access and subscribe to real-time system version updates safely without setState-in-render side effects
 */
export function useSystemVersion(): {
  version: string;
  formattedVersion: string;
  incrementVersion: () => string;
  setVersion: (v: string) => void;
} {
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    version,
    formattedVersion: `v${version}`,
    incrementVersion: incrementSystemVersion,
    setVersion: setSystemVersion
  };
}

