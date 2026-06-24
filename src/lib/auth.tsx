"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "@/lib/db";
import { FHIR_BASE } from "@/lib/fhir";

const FHIR_JSON = "application/fhir+json";

export type User = {
  id: string;
  email: string;
  role: Role;
  practitionerId?: string;
  // populated after login if practitionerId exists
  practitioner?: any;
  practitionerRole?: any;
  organization?: any;
} | null;

type AuthContextValue = {
  user: User;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "eref_user";

async function fhirFetch(path: string): Promise<any> {
  const url = path.startsWith("http")
    ? path
    : `${FHIR_BASE}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    headers: { Accept: FHIR_JSON },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FHIR ${res.status}: ${path}`);
  return res.json();
}

async function fetchPractitionerContext(practitionerId: string): Promise<{
  practitioner: any;
  practitionerRole: any;
  organization: any;
}> {
  const [practitioner, roleBundle] = await Promise.all([
    fhirFetch(`Practitioner/${practitionerId}`),
    fhirFetch(`PractitionerRole?practitioner=Practitioner/${practitionerId}&_count=1`),
  ]);

  const practitionerRole = roleBundle.entry?.[0]?.resource ?? null;
  let organization: any = null;

  if (practitionerRole?.organization?.reference) {
    try {
      organization = await fhirFetch(practitionerRole.organization.reference);
    } catch { /* non-fatal */ }
  }

  return { practitioner, practitionerRole, organization };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: User = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore corrupt storage */ }

    if (stored) {
      setUser(stored);
      // Re-fetch FHIR context if it's incomplete (e.g. org or role missing)
      if (stored.practitionerId && (!stored.organization || !stored.practitionerRole)) {
        fetchPractitionerContext(stored.practitionerId)
          .then((ctx) => {
            const updated: User = { ...stored!, ...ctx };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setUser(updated);
          })
          .catch(() => {})
          .finally(() => setReady(true));
        return;
      }
    }
    setReady(true);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    try {
      // 1. Validate credentials
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      if (!res.ok) return null;

      const data = await res.json();

      const u: User = {
        id: data.id,
        email: data.email,
        role: data.role,
        practitionerId: data.practitionerId,
      };

      // 2. If practitioner, fetch FHIR context before navigating
      if (data.practitionerId) {
        const ctx = await fetchPractitionerContext(data.practitionerId);
        u.practitioner = ctx.practitioner;
        u.practitionerRole = ctx.practitionerRole;
        u.organization = ctx.organization;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
