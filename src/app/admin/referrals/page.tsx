"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName } from "@/lib/referral";

export default function AdminReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && user && user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user?.role === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/referrals?type=all");
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to load referrals");
      }
      
      setItems(
        (data.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Task")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getPatientName(task: any): string {
    const patient = task.contained?.find((r: any) => r.resourceType === "Patient");
    if (patient) return humanName(patient.name);
    return "—";
  }

  function getReferralType(task: any): string {
    if (task.focus?.reference?.includes("ServiceRequest")) {
      return "Service Request";
    }
    return "Referral";
  }

  function getStatus(task: any): string {
    return task.status || "—";
  }

  function getPriority(task: any): string {
    return task.priority || "—";
  }

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = items.filter((t) => {
    const text = [t.id, getPatientName(t), getStatus(t), getPriority(t)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <>
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: "Admin", href: "/admin" },
        { label: "Referrals" },
      ]} />

      <PageHeader
        title="All Referrals"
        actions={
          <>
            <input
              type="search"
              placeholder="Search by ID, patient, status…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <span className="muted">{filtered.length} referral(s)</span>
          </>
        }
      />

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No referrals found.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Authored On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{getPatientName(t)}</td>
                    <td>{getReferralType(t)}</td>
                    <td>{getStatus(t)}</td>
                    <td>{getPriority(t)}</td>
                    <td>{t.authoredOn ? new Date(t.authoredOn).toLocaleDateString() : "—"}</td>
                    <td>
                      <button className="secondary" onClick={() => router.push(`/referrals/${t.id}`)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
