"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import SystemSwitcher, { SYSTEMS, type System } from "./SystemSwitcher";

type NavItem = { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean };

const SETTINGS: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
    ),
  },
];

const SYSTEM_NAV: Record<System, { group: string; items: NavItem[] }[]> = {
  "doh-lgu": [
    {
      group: "Dashboard",
      items: [
        {
          href: "/doh/dashboards/lgu",
          label: "LGU Referral Dashboard",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M3 3v18h18"></path><rect x="7" y="11" width="3" height="6"></rect><rect x="12" y="7" width="3" height="10"></rect><rect x="17" y="13" width="3" height="4"></rect></svg>
          ),
        },
        {
          href: "/doh/dashboards/phcore",
          label: "PH Core Rate Report",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
          ),
        },
        {
          href: "/doh/dashboards/patient",
          label: "Patient Clinical Summary",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z"></path></svg>
          ),
        },
      ],
    },
    {
      group: "Administration",
      items: [
        {
          href: "/doh/organizations",
          label: "Organizations",
          icon: (
            <svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="16"></line><line x1="15" y1="22" x2="15" y2="16"></line><line x1="9" y1="16" x2="15" y2="16"></line><path d="M8 6h8"></path><path d="M8 10h8"></path></svg>
          ),
          adminOnly: true,
        },
        {
          href: "/doh/practitioners",
          label: "Practitioners",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          ),
          adminOnly: true,
        },
        {
          href: "/doh/practitioner-roles",
          label: "Practitioner Roles",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          ),
          adminOnly: true,
        },
        {
          href: "/doh/referrals",
          label: "All Referrals",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          ),
          adminOnly: true,
        },
      ],
    },
    {
      group: "Terminology",
      items: [
        {
          href: "/doh/valuesets/doh",
          label: "DOH ValueSets",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          ),
        },
        {
          href: "/doh/valuesets/hl7",
          label: "HL7 ValueSets",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          ),
        },
      ],
    },
  ],
  "clinical": [
    {
      group: "Registry",
      items: [
        {
          href: "/clinical/triage",
          label: "Patients (Triage)",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          ),
        },
        {
          href: "/clinical/profiling",
          label: "Clinical Profile",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z"></path></svg>
          ),
        },
        {
          href: "/clinical/waiting",
          label: "Clinical Waiting",
          icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ),
        },
      ],
    },
  ],
  "ereferral": [
    {
      group: "Referral",
      items: [
        {
          href: "/ereferral",
          label: "Overview",
          icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          ),
        },
        {
          href: "/ereferral/submit",
          label: "New Referral",
          icon: (
            <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>
          ),
        },
        {
          href: "/ereferral/outgoing",
          label: "Requested Referrals",
          icon: (
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          ),
        },
        {
          href: "/ereferral/draft",
          label: "Draft Referrals",
          icon: (
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          ),
        },
        {
          href: "/ereferral/incoming",
          label: "Incoming Referrals",
          icon: (
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          ),
        },
      ],
    },
  ],
};

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Map a URL slug to its system so the sidebar group follows the route.
function systemFromPath(pathname: string): System | null {
  if (pathname === "/doh" || pathname.startsWith("/doh/")) return "doh-lgu";
  if (pathname === "/clinical" || pathname.startsWith("/clinical/")) return "clinical";
  if (pathname === "/ereferral" || pathname.startsWith("/ereferral/")) return "ereferral";
  return null;
}

function getOrganizationName(org: any): string {
  return org?.name || "—";
}

function getPractitionerRoleName(role: any): string {
  const code = role?.code?.[0]?.coding?.[0];
  return code?.display || code?.code || role?.code?.[0]?.text || "—";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [activeSystem, setActiveSystem] = useState<System>("ereferral");

  useEffect(() => {
    // The URL slug is the source of truth for the active system.
    const fromPath = systemFromPath(pathname);
    if (fromPath) {
      setActiveSystem(fromPath);
      return;
    }
    // Shared pages (e.g. /settings) keep the last selected system.
    let saved: System | null = null;
    try {
      saved = localStorage.getItem("eref_active_system") as System | null;
    } catch { /* ignore */ }
    if (saved && SYSTEMS.find((s) => s.id === saved)) {
      setActiveSystem(saved);
    }
  }, [pathname]);

  const handleSystemChange = (system: System) => {
    setActiveSystem(system);
    try {
      localStorage.setItem("eref_active_system", system);
    } catch { /* ignore */ }
  };

  const isLogin = pathname === "/login";
  const isPublicSettings = pathname === "/settings";

  useEffect(() => {
    if (ready && !user && !isLogin && !isPublicSettings) router.replace("/login");
  }, [ready, user, isLogin, isPublicSettings, router]);

  if (isLogin) return <>{children}</>;
  if (isPublicSettings) {
    if (!ready) return <div className="loading">Loading…</div>;
    if (!user) return <>{children}</>;
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return <div className="loading">Redirecting to sign in…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="side-brand">
          <div>Z.C - eReferral</div>
          <span>Zamboanga City Medical Center</span>
        </div>

        <nav className="side-nav">
          {SYSTEM_NAV[activeSystem].map((section) => (
            <div key={section.group || "clinical"}>
              {section.group && <div className="nav-group-label">{section.group}</div>}
              {section.items.map((n) => (
                <Link
                  key={`${section.group || "clinical"}-${n.label}-${n.href}`}
                  href={n.href}
                  className={isActive(n.href, pathname) ? "active" : ""}
                >
                  <span className="ic" aria-hidden>{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              ))}
            </div>
          ))}

          <div className="nav-group-label">System</div>
          {SETTINGS.map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n.href, pathname) ? "active" : ""}>
              <span className="ic" aria-hidden>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          <div className="user-card">
            <div className="user-card-heading">User Account</div>
            <div className="user-card-info">
              <span className="uname" title={user.email}>{user.email}</span>
              <span className="user-org" title={getOrganizationName(user.organization)}>{getOrganizationName(user.organization)}</span>
              <span className="user-role" title={getPractitionerRoleName(user.practitionerRole)}>{getPractitionerRoleName(user.practitionerRole)}</span>
            </div>
            <button
              className="ghost block sign-out"
              onClick={() => { logout(); router.replace("/login"); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="content">
        <main className="container">{children}</main>
      </div>

      <SystemSwitcher active={activeSystem} onChange={handleSystemChange} />
    </div>
  );
}
