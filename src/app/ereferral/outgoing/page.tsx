"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName } from "@/lib/referral";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";

const STATUSES = ["requested", "received", "accepted", "rejected", "completed"] as const;

function buildIndex(bundle: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const entry of bundle?.entry || []) {
    if (entry.fullUrl) map.set(entry.fullUrl, entry.resource);
    if (entry.resource?.resourceType && entry.resource?.id) {
      map.set(`${entry.resource.resourceType}/${entry.resource.id}`, entry.resource);
    }
  }
  return map;
}

function srReason(sr: any): string {
  return (
    sr?.category?.[0]?.coding?.[0]?.display ||
    sr?.category?.[0]?.text ||
    sr?.reasonCode?.[0]?.coding?.[0]?.display ||
    "—"
  );
}

export default function OutgoingReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const practitionerRoleId = user?.practitionerRole?.id;

  const [tasks, setTasks] = useState<any[]>([]);
  const [index, setIndex] = useState<Map<string, any>>(new Map());
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
    if (ready && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { setPage(1); }, [sorting]);

  // Persist the requested-referral fetch: list Tasks requested by this
  // practitioner role, with their ServiceRequest (focus) and Patient included.
  async function load() {
    if (!practitionerRoleId) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await fhirGet(
        `Task?requester=PractitionerRole/${practitionerRoleId}&_include=Task:focus&_include=Task:patient&_include=Task:owner&_include:iterate=ServiceRequest:performer&_sort=-authored-on&_count=100`
      );
      setIndex(buildIndex(bundle));
      setTasks(
        (bundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Task")
      );
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getServiceRequest(task: any): any {
    if (!task.focus?.reference) return undefined;
    // Try direct reference lookup, then fullUrl fallback
    let res = index.get(task.focus.reference);
    if (!res && task.focus.reference.startsWith("ServiceRequest/")) {
      const fullUrl = `${task.focus.reference}`;
      res = index.get(fullUrl);
    }
    return res;
  }

  function getPatient(task: any): any {
    const ref = task.for?.reference;
    if (!ref) return undefined;
    // Try Patient/{id}, fullUrl, and urn:uuid fallback
    let res = index.get(ref);
    if (!res) res = index.get(`Patient/${ref}`);
    return res;
  }

  function patientName(task: any): string {
    const p = getPatient(task);
    return p ? humanName(p.name) : task.for?.display || "—";
  }

  function referralId(task: any): string {
    const sr = getServiceRequest(task);
    return sr?.identifier?.[0]?.value || sr?.id || task.focus?.reference?.split("/").pop() || task.id || "";
  }

  function getReceivingOrganization(task: any): string {
    // Use ServiceRequest.performer as primary source (it's the organization)
    const sr = getServiceRequest(task);
    if (sr?.performer?.[0]?.reference) {
      const performer = index.get(sr.performer[0].reference);
      if (performer?.resourceType === "Organization") {
        return performer.name || "—";
      }
      if (performer?.resourceType === "PractitionerRole" && performer.organization?.reference) {
        const org = index.get(performer.organization.reference);
        if (org?.name) return org.name;
      }
    }
    // Fallback to Task.owner
    const ownerRef = task.owner?.reference;
    if (ownerRef) {
      const owner = index.get(ownerRef);
      if (owner?.resourceType === "Organization") {
        return owner.name || "—";
      }
      if (owner?.resourceType === "PractitionerRole" && owner.organization?.reference) {
        const org = index.get(owner.organization.reference);
        if (org?.name) return org.name;
      }
    }
    return "—";
  }

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = tasks.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    const sr = getServiceRequest(t);
    const text = [
      t.identifier?.[0]?.value || t.id,
      patientName(t),
      t.status,
      t.priority,
      srReason(sr),
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const columns = useMemo(() => [
    {
      id: "patient",
      header: "Patient",
      accessorFn: (row: any) => patientName(row),
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "receivingOrg",
      header: "To",
      accessorFn: (row: any) => getReceivingOrganization(row),
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (row: any) => getServiceRequest(row)?.priority || row.priority || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row: any) => row.status || "",
      cell: (info: any) => <span className={`badge ${info.getValue()}`}>{info.getValue() || "—"}</span>,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row: any) => {
        const sr = getServiceRequest(row);
        const d = sr?.authoredOn || row.authoredOn || row.meta?.lastUpdated;
        return d ? new Date(d).getTime() : 0;
      },
      cell: (info: any) => {
        const sr = getServiceRequest(info.row.original);
        const d = sr?.authoredOn || info.row.original.authoredOn || info.row.original.meta?.lastUpdated;
        return d ? new Date(d).toLocaleDateString() : "—";
      },
    },
  ], [index]);

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

  // Guards come AFTER all hooks so the hook order stays identical across renders.
  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!practitionerRoleId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Requested Referrals" }]} title="Requested Referrals" />
        <div className="alert err">No practitioner role linked to your account — contact an admin.</div>
      </>
    );
  }

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Requested Referrals" }]} title="Requested Referrals" />

      {/* Redesigned header — matches Incoming Referrals */}
      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">Requested Referrals</h1>
            <p className="incoming-header-sub">
              Referrals requested by your practitioner role{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                Task.requester = PractitionerRole/{practitionerRoleId}
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
          <p className="muted">No requested referrals found for your organization.</p>
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
                {pageRows.map((row) => {
                  const sr = getServiceRequest(row.original);
                  const srId = sr?.id;
                  return (
                    <tr
                      key={row.original.id}
                      className={srId ? "clickable" : undefined}
                      onClick={srId ? () => router.push(`/ereferral/outgoing/${srId}`) : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  );
                })}
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
