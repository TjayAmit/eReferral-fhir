"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { System } from "@/components/SystemSwitcher";

// Landing route for each system slug.
const SYSTEM_LANDING: Record<System, string> = {
  "doh-lgu": "/doh/dashboards/lgu",
  "clinical": "/clinical/triage",
  "ereferral": "/ereferral",
};

// The root path is just an entry point: redirect to the last-active system's
// landing page (defaults to eReferral) so every screen lives under its slug.
export default function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    let system: System = "ereferral";
    try {
      const saved = localStorage.getItem("eref_active_system") as System | null;
      if (saved && saved in SYSTEM_LANDING) system = saved;
    } catch { /* ignore */ }
    router.replace(SYSTEM_LANDING[system]);
  }, [router]);

  return <div className="loading">Loading…</div>;
}
