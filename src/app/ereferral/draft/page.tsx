"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName } from "@/lib/referral";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";

type Row = { encounter: any; patient: any | null; serviceRequests: any[] };

export default function DraftReferralsPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();
  const practitionerRoleId = user?.practitionerRole?.id;

  const [rows, setRows] = useState<Row[]>([]);
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

  // Fetch encounters with draft ServiceRequests via API route
  async function load() {
    if (!practitionerRoleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/draft-referrals?practitionerRole=${encodeURIComponent(practitionerRoleId)}`,
        { headers: { "X-FHIR-Base-Url": baseUrl } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load draft referrals");
      setRows(data.encounters || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function patientName(row: Row): string {
    return row.patient ? humanName(row.patient.name) : row.encounter?.subject?.display || "—";
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

  const filtered = rows.filter(({ encounter, patient, serviceRequests }) => {
    const text = [
      humanName(patient?.name),
      patient?.id,
      encounter?.id,
      encounter?.status,
      ...serviceRequests.map((sr: any) => sr.status),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const columns = useMemo(() => [
    {
      id: "patient",
      header: "Patient",
      accessorFn: (row: Row) => patientName(row),
      cell: (info: any) => info.getValue(),
    },
    {
      id: "encounter",
      header: "Encounter",
      accessorFn: (row: Row) => row.encounter?.id || "",
      cell: (info: any) => <code>{info.getValue()}</code>,
    },
    {
      id: "serviceRequests",
      header: "Draft Referrals",
      accessorFn: (row: Row) => row.serviceRequests.length,
      cell: (info: any) => <span className="badge">{info.getValue()}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row: Row) => row.serviceRequests[0]?.status || row.encounter?.status || "unknown",
      cell: (info: any) => <span className={`badge ${info.getValue() || ""}`}>{info.getValue() || "—"}</span>,
    },
    {
      id: "date",
      header: "Latest Draft Date",
      accessorFn: (row: Row) => {
        const srDate = row.serviceRequests[0]?.authoredOn;
        const encDate = row.encounter?.period?.start;
        const dates = [srDate, encDate].filter(Boolean).map((d: string) => new Date(d).getTime());
        return Math.max(...dates, 0);
      },
      cell: (info: any) => {
        const srDate = info.row.original.serviceRequests[0]?.authoredOn;
        const encDate = info.row.original.encounter?.period?.start;
        const latest = srDate && encDate
          ? (new Date(srDate) > new Date(encDate) ? srDate : encDate)
          : srDate || encDate;
        return latest ? new Date(latest).toLocaleString() : "—";
      },
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
                {pageRows.map((row) => (
                  <tr
                    key={row.original.encounter.id}
                    className="clickable"
                    onClick={() => {
                      const srId = row.original.serviceRequests?.[0]?.id;
                      if (srId) router.push(`/ereferral/draft/${srId}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
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
