"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
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

export default function DraftReferralsPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();
  const practitionerRoleId = user?.practitionerRole?.id;

  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [index, setIndex] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl]);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { setPage(1); }, [sorting]);

  // Fetch ServiceRequest with status=draft
  async function load() {
    if (!practitionerRoleId) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await fhirGet(
        `ServiceRequest?status=draft&requester=PractitionerRole/${practitionerRoleId}&_include=ServiceRequest:subject&_include=ServiceRequest:requester&_include=ServiceRequest:performer&_sort=-authored-on&_count=100`
      );
      setIndex(buildIndex(bundle));
      setServiceRequests(
        (bundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "ServiceRequest")
      );
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getPatient(sr: any): any {
    return sr.subject?.reference ? index.get(sr.subject.reference) : undefined;
  }

  function patientName(sr: any): string {
    const p = getPatient(sr);
    return p ? humanName(p.name) : sr.subject?.display || "—";
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!practitionerRoleId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Draft Referrals" }]} title="Draft Referrals" />
        <div className="alert err">No practitioner role linked to your account — contact an admin.</div>
      </>
    );
  }

  const filtered = serviceRequests.filter((sr) => {
    const text = [
      sr.identifier?.[0]?.value || sr.id,
      patientName(sr),
      sr.status,
      sr.priority,
      srReason(sr),
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const columns = useMemo(() => [
    {
      id: "referralId",
      header: "Referral ID",
      accessorFn: (row: any) => row.identifier?.[0]?.value || row.id || "",
      cell: (info: any) => <code>{info.getValue()}</code>,
    },
    {
      id: "patient",
      header: "Patient",
      accessorFn: (row: any) => patientName(row),
      cell: (info: any) => info.getValue(),
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (row: any) => srReason(row),
      cell: (info: any) => info.getValue(),
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (row: any) => row.priority || "",
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
      accessorFn: (row: any) => row.authoredOn ? new Date(row.authoredOn).getTime() : 0,
      cell: (info: any) => info.row.original.authoredOn ? new Date(info.row.original.authoredOn).toLocaleDateString() : "—",
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

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Draft Referrals" }]} title="Draft Referrals" />

      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">Draft Referrals</h1>
            <p className="incoming-header-sub">
              Draft referrals created by your practitioner role{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                ServiceRequest.status = draft
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
          <div className="incoming-stat active">
            <div className="incoming-stat-n">{filtered.length}</div>
            <div className="incoming-stat-l">Draft</div>
          </div>
        </div>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No draft referrals found for your organization.</p>
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
                  return (
                    <tr
                      key={row.original.id}
                      onClick={() => router.push(`/ereferral/outgoing/${row.original.id}`)}
                      className="clickable"
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
