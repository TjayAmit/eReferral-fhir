"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean };
const NAV: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
    ),
  },
  {
    href: "/submit",
    label: "New Referral",
    icon: (
      <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>
    ),
  },
  {
    href: "/inbox",
    label: "Use Case 2 — Retrieve",
    icon: (
      <svg viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
    ),
    adminOnly: true,
  },
  {
    href: "/admin/practitioners",
    label: "Practitioners",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
    ),
    adminOnly: true,
  },
  {
    href: "/admin/organizations",
    label: "Organizations",
    icon: (
      <svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="16"></line><line x1="15" y1="22" x2="15" y2="16"></line><line x1="9" y1="16" x2="15" y2="16"></line><path d="M8 6h8"></path><path d="M8 10h8"></path></svg>
    ),
    adminOnly: true,
  },
  {
    href: "/admin/referrals",
    label: "All Referrals",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
    ),
    adminOnly: true,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
    ),
    adminOnly: true,
  },
  {
    href: "/referrals/outgoing",
    label: "Requested Referrals",
    icon: (
      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
    ),
    adminOnly: false,
  },
  {
    href: "/referrals/incoming",
    label: "Incoming Referrals",
    icon: (
      <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
    ),
    adminOnly: false,
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  // Redirect unauthenticated users to the login page.
  useEffect(() => {
    if (ready && !user && !isLogin) router.replace("/login");
  }, [ready, user, isLogin, router]);

  // The login page renders standalone (no sidebar).
  if (isLogin) return <>{children}</>;

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return <div className="loading">Redirecting to sign in…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="side-brand">
          PH eReferral
          <span>Track 1</span>
        </div>

        <nav className="side-nav">
          {NAV.filter((n) => !n.adminOnly || user.role === "admin").map((n) => {
            const active =
              n.href === "/"
                ? pathname === "/"
                : n.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                <span className="ic" aria-hidden>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="who">
            <span className="avatar" aria-hidden>{user.email?.[0]?.toUpperCase() ?? "?"}</span>
            <span className="uname" title={user.email}>{user.email}</span>
          </div>
          <button
            className="ghost block"
            onClick={() => { logout(); router.replace("/login"); }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="content">
        <main className="container">{children}</main>
      </div>
    </div>
  );
}
