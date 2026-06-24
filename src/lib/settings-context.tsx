"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import {
  buildFhirBaseUrl,
  DEFAULT_FHIR_SERVER_ID,
  FhirServer,
  getServerById,
  getStoredServerId,
  getStoredUseDemoData,
  setStoredServerId,
  setStoredUseDemoData,
} from "./settings";

interface SettingsContextValue {
  serverId: string;
  server: FhirServer;
  baseUrl: string;
  setServerId: (id: string) => void;
  useDemoData: boolean;
  setUseDemoData: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function subscribe() {
  // We only need to re-render when localStorage changes in the same window.
  const handler = () => {};
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const serverId = useSyncExternalStore(
    subscribe,
    () => getStoredServerId(),
    () => DEFAULT_FHIR_SERVER_ID
  );

  const setServerId = useCallback((id: string) => {
    setStoredServerId(id);
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  const useDemoData = useSyncExternalStore(
    subscribe,
    () => getStoredUseDemoData(),
    () => false
  );

  const setUseDemoData = useCallback((value: boolean) => {
    setStoredUseDemoData(value);
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  const server = getServerById(serverId) || getServerById(DEFAULT_FHIR_SERVER_ID)!;
  const baseUrl = buildFhirBaseUrl(server);

  return (
    <SettingsContext.Provider value={{ serverId, server, baseUrl, setServerId, useDemoData, setUseDemoData }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
