"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
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

type ReferralItem = { sr: any; task: any | null; patient: any | null; orgById: Map<string, any>; roleById: Map<string, any>; diagnosticReports: any[] };

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

function getPerformerOrganization(item: ReferralItem): string {
  const { sr, orgById, roleById } = item;
  const performerRef = sr.performer?.[0]?.reference;
  if (!performerRef) return "—";

  if (performerRef.includes("Organization/")) {
    const orgId = refId(performerRef);
    const org = orgById.get(orgId);
    if (org?.name) return org.name;
  }

  if (performerRef.includes("PractitionerRole/")) {
    const roleId = refId(performerRef);
    const role = roleById.get(roleId);
    if (role?.organization?.reference) {
      const orgId = refId(role.organization.reference);
      const org = orgById.get(orgId);
      if (org?.name) return org.name;
    }
  }

  // When performer is a Practitioner, look up their PractitionerRole(s)
  // and return the first role's organization name.
  if (performerRef.includes("Practitioner/")) {
    const practId = refId(performerRef);
    for (const role of roleById.values()) {
      if (refId(role.practitioner?.reference || "") === practId && role.organization?.reference) {
        const orgId = refId(role.organization.reference);
        const org = orgById.get(orgId);
        if (org?.name) return org.name;
      }
    }
  }

  return "—";
}

// ── Status filter pills ───────────────────────────────────────────────────────

const STATUSES = ["requested", "received", "accepted", "rejected", "completed"] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyAssignedReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const orgId = user?.organization?.id;
  const practitionerId = user?.practitionerId;

  const [items, setItems] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && practitionerId) load();
  }, [ready, practitionerId]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { setPage(1); }, [sorting]);

  async function load() {
    if (!practitionerId) return;
    setLoading(true); setError(null);
    try {
      // Step 1: Find accepted Tasks where this practitioner is the owner
      const taskBundle = await fhirGet(
        `Task?status=accepted&owner=Practitioner/${practitionerId}&_include=Task:focus&_include=Task:patient&_sort=-_lastUpdated&_count=100`
      );

      const all = dedupeResources(taskBundle);
      const tasks = all.filter((r) => r.resourceType === "Task");
      const srs = all.filter((r) => r.resourceType === "ServiceRequest");
      const patients = all.filter((r) => r.resourceType === "Patient");

      const srById = new Map<string, any>(srs.map((sr) => [sr.id, sr]));
      const patientById = new Map<string, any>(patients.map((p) => [p.id, p]));

      // Step 2: Resolve requester / performer orgs for display
      const orgIds = new Set<string>();
      const roleIds = new Set<string>();
      for (const sr of srs) {
        for (const ref of [sr.requester?.reference, sr.performer?.[0]?.reference]) {
          if (!ref) continue;
          if (ref.includes("Organization/")) orgIds.add(refId(ref));
          else if (ref.includes("PractitionerRole/")) roleIds.add(refId(ref));
        }
      }

      let orgById = new Map<string, any>();
      let roleById = new Map<string, any>();

      if (orgIds.size > 0 || roleIds.size > 0) {
        const [orgBundle, roleBundle] = await Promise.all([
          orgIds.size > 0
            ? fhirGet(`Organization?_id=${Array.from(orgIds).join(",")}&_count=100`).catch(() => null)
            : Promise.resolve(null),
          roleIds.size > 0
            ? fhirGet(`PractitionerRole?_id=${Array.from(roleIds).join(",")}&_include=PractitionerRole:organization&_count=100`).catch(() => null)
            : Promise.resolve(null),
        ]);
        const orgs = dedupeResources(orgBundle).filter((r) => r.resourceType === "Organization");
        const roleAll = dedupeResources(roleBundle);
        const roles = roleAll.filter((r) => r.resourceType === "PractitionerRole");
        orgs.push(...roleAll.filter((r) => r.resourceType === "Organization"));
        orgById = new Map(orgs.map((o) => [o.id, o]));
        roleById = new Map(roles.map((r) => [r.id, r]));
      }

      // Step 3: Build items from Tasks → focus ServiceRequest
      setItems(tasks.map((task) => {
        const srId = refId(task.focus?.reference || "");
        const patientId = refId(task.for?.reference || "");
        const sr = srById.get(srId) || null;
        const patient = patientById.get(patientId) || null;
        const encounterId = sr ? refId(sr.encounter?.reference || "") : "";

        return {
          sr,
          task,
          patient,
          orgById,
          roleById,
          diagnosticReports: [],
        };
      }).filter((item) => item.sr !== null));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
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
      id: "patient",
      header: "Patient",
      accessorFn: (row: ReferralItem) => humanName(row.patient?.name) || row.sr.subject?.display || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "requestingOrg",
      header: "From",
      accessorFn: (row: ReferralItem) => getPerformerOrganization(row),
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

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!practitionerId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "My Assigned Referrals" }]} title="My Assigned Referrals" />
        <div className="alert err">No practitioner linked to your account — contact an admin.</div>
      </>
    );
  }

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "My Assigned Referrals" }]} title="My Assigned Referrals" />

      {/* Header */}
      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">My Assigned Referrals</h1>
            <p className="incoming-header-sub">
              Referrals assigned to you{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                Task.status = accepted · Task.owner = Practitioner/{practitionerId}
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
          <p className="muted">No assigned referrals found.</p>
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
                    onClick={() => router.push(`/clinical/my-referrals/${row.original.sr.id}`)}
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
