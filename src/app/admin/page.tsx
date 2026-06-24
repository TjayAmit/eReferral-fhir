"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function AdminPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  // Admin-only: bounce non-admins to the overview.
  useEffect(() => {
    if (ready && user && user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  return (
    <>
      <h1>Admin</h1>
      <p className="sub">
        Signed in as <strong>{user.email}</strong> · role <code>{user.role}</code>
      </p>

      <div className="grid three">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Use Case 1</h2>
          <p className="muted">Submit an eReferral transaction Bundle.</p>
          <Link href="/submit"><button>Open Submit</button></Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Use Case 2</h2>
          <p className="muted">Retrieve referrals & update action points.</p>
          <Link href="/inbox"><button>Open Inbox</button></Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Accounts</h2>
          <p className="muted">Dummy accounts (demo only).</p>
          <table>
            <thead><tr><th>User</th><th>Role</th></tr></thead>
            <tbody>
              <tr><td>admin</td><td><span className="badge accepted">admin</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2>Directory</h2>
      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Practitioners</h2>
          <p className="muted">View and search registered practitioners.</p>
          <Link href="/admin/practitioners"><button>Open Practitioners</button></Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Organizations</h2>
          <p className="muted">View and search registered facilities.</p>
          <Link href="/admin/organizations"><button>Open Organizations</button></Link>
        </div>
      </div>

      <div className="card">
        <h2>Notes</h2>
        <p className="muted" style={{ margin: 0 }}>
          This admin area is gated by a client-side dummy session (localStorage). It is a UI
          placeholder, not a real security boundary — the FHIRLab sandbox requires no credentials.
        </p>
      </div>
    </>
  );
}
