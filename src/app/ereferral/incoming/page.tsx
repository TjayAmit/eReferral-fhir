"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import ReferralDetailView from "@/components/ReferralDetailView";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName, latestTask } from "@/lib/referral";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";

// ── types ─────────────────────────────────────────────────────────────────────

type ReferralItem = { sr: any; task: any | null; patient: any | null };

// ── helpers ───────────────────────────────────────────────────────────────────

function refId(ref: string): string {
  return ref?.split("/").pop() || "";
}

function dedupeResources(bundle: any): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const e of bundle?.entry || []) {
    const r = e.resource;
    if (!r) continue;
    const key = `${r.resourceType}/${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ── Status filter pills ───────────────────────────────────────────────────────

const STATUSES = ["requested", "received", "accepted", "rejected", "completed"] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IncomingReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const orgId = user?.organization?.id;

  const [items, setItems] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<ReferralItem | null>(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && orgId) load();
  }, [ready, orgId]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { setPage(1); }, [sorting]);

  async function load() {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const bundle = await fhirGet(
        `ServiceRequest?performer=Organization/${orgId}&_include=ServiceRequest:subject&_revinclude=Task:focus&_sort=-authored&_count=100`
      );

      const all = dedupeResources(bundle);
      const srs = all.filter((r) => r.resourceType === "ServiceRequest");

      const patientById = new Map<string, any>(
        all.filter((r) => r.resourceType === "Patient").map((p) => [p.id, p])
      );
      const tasksBySrId = new Map<string, any[]>();
      for (const t of all.filter((r) => r.resourceType === "Task")) {
        const srId = refId(t.focus?.reference || "");
        if (srId) {
          if (!tasksBySrId.has(srId)) tasksBySrId.set(srId, []);
          tasksBySrId.get(srId)!.push(t);
        }
      }

      setItems(srs.map((sr) => ({
        sr,
        task:    latestTask(tasksBySrId.get(sr.id) || []) || null,
        patient: patientById.get(refId(sr.subject?.reference || "")) || null,
      })));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!orgId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} title="Incoming Referrals" />
        <div className="alert err">No organization linked to your account — contact an admin.</div>
      </>
    );
  }

  const statusCounts = items.reduce<Record<string, number>>((acc, { sr, task }) => {
    const s = task?.status || sr.status || "unknown";
    acc[s] = (acc[s] ?? 0) + 1; return acc;
  }, {});

  const filtered = items.filter(({ sr, task, patient }) => {
    const status = task?.status || sr.status;
    if (statusFilter && status !== statusFilter) return false;
    const text = [
      sr.identifier?.[0]?.value || sr.id,
      humanName(patient?.name),
      sr.subject?.display,
      status,
      sr.priority,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const columns = useMemo(() => [
    {
      id: "referralId",
      header: "Referral ID",
      accessorFn: (row: ReferralItem) => row.sr.identifier?.[0]?.value || row.sr.id || "",
      cell: (info: any) => <code>{info.getValue()}</code>,
    },
    {
      id: "patient",
      header: "Patient",
      accessorFn: (row: ReferralItem) => humanName(row.patient?.name) || row.sr.subject?.display || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (row: ReferralItem) => row.sr.category?.[0]?.coding?.[0]?.display || row.sr.category?.[0]?.text || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (row: ReferralItem) => row.sr.priority || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row: ReferralItem) => row.task?.status || row.sr.status || "",
      cell: (info: any) => <span className={`badge ${info.getValue()}`}>{info.getValue() || "—"}</span>,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row: ReferralItem) => row.sr.authoredOn ? new Date(row.sr.authoredOn).getTime() : 0,
      cell: (info: any) => info.row.original.sr.authoredOn ? new Date(info.row.original.sr.authoredOn).toLocaleDateString() : "—",
    },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: {
      sorting,
      pagination: {
        pageIndex: page - 1,
        pageSize: PAGE_SIZE,
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
    manualSorting: false,
  });

  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = Math.max(1, table.getPageCount());
  const pageRows = table.getRowModel().rows;

  if (selected) {
    return (
      <>
        <AppPageHeader
          items={[
            { label: "Home", href: "/" },
            { label: "Incoming Referrals", href: "/ereferral/incoming" },
            { label: selected.sr?.identifier?.[0]?.value || selected.sr?.id },
          ]}
          title={`Referral: ${selected.sr?.identifier?.[0]?.value || selected.sr?.id || "Detail"}`}
        />
        <ReferralDetailView
          sr={selected.sr}
          task={selected.task}
          onBack={() => setSelected(null)}
          onChanged={(updatedTask) =>
            setSelected((prev) => prev ? { ...prev, task: updatedTask } : prev)
          }
        />
      </>
    );
  }

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} title="Incoming Referrals" />

      {/* Redesigned header */}
      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">Incoming Referrals</h1>
            <p className="incoming-header-sub">
              Referrals where your organization is the performer{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                ServiceRequest.performer = Organization/{orgId}
              </code>
            </p>
          </div>
          <div className="incoming-header-actions">
            <input
              type="search"
              placeholder="Search referral, patient…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="incoming-stats">
          <div className={`incoming-stat${statusFilter === "" ? " active" : ""}`} onClick={() => setStatusFilter("")}>
            <div className="incoming-stat-n">{Object.values(statusCounts).reduce((a, b) => a + b, 0)}</div>
            <div className="incoming-stat-l">All</div>
          </div>
          {STATUSES.map((s) => (
            <div
              key={s}
              className={`incoming-stat${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              <div className="incoming-stat-n">{statusCounts[s] ?? 0}</div>
              <div className="incoming-stat-l">{s.charAt(0).toUpperCase() + s.slice(1)}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No incoming referrals found for your organization.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const sort = h.column.getIsSorted();
                      const canSort = h.column.getCanSort();
                      return (
                        <th
                          key={h.id}
                          onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                          style={canSort ? { cursor: "pointer" } : undefined}
                          aria-sort={
                            sort === "asc"
                              ? "ascending"
                              : sort === "desc"
                              ? "descending"
                              : undefined
                          }
                        >
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                          {canSort && (
                            <span className="sort-indicator" aria-hidden="true">
                              {sort === "asc" ? " ▲" : sort === "desc" ? " ▼" : "  "}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.original.sr.id}
                    className="clickable"
                    onClick={() => setSelected(items.find((i) => i.sr.id === row.original.sr.id) || null)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={currentPage} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
