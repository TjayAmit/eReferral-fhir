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

export default function ClinicalWaitingPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();

  const canAccess = user?.role === "admin" || user?.role === "practitioner";
  const orgId = user?.organization?.id;
  const orgName = user?.organization?.name;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess && orgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl, orgId]);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { setPage(1); }, [sorting]);

  async function load() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinical-waiting?organization=${encodeURIComponent(orgId)}`, {
        headers: { "X-FHIR-Base-Url": baseUrl },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load waiting patients");
      setRows(data.encounters || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  if (!orgId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Clinical Waiting" }]} title="Clinical Waiting" />
        <div className="alert err">
          No organization linked to your account — Clinical Waiting lists patients
          with pending referrals from your organization.
        </div>
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
      accessorFn: (row: Row) => humanName(row.patient?.name) || row.encounter?.subject?.reference || "",
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
      header: "Service Requests",
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
      header: "Latest Request Date",
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
    {
      id: "actions",
      header: "Actions",
      cell: (info: any) => (
        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); router.push(`/clinical/waiting/${info.row.original.encounter.id}`); }}>
          View Details
        </button>
      ),
    },
  ], [router]);

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
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "Clinical Waiting" }]}
        title="Clinical Waiting"
        actions={
          <>
            <input type="search" placeholder="Search patient or status…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            <span className="muted">{filtered.length} patient(s)</span>
          </>
        }
      />

      <div className="incoming-header" style={{ padding: "14px 20px", marginBottom: 16 }}>
        <p className="incoming-header-sub" style={{ margin: 0 }}>
          Encounters with ServiceRequest from your organization{" "}
          <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
            Encounter.service-provider = Organization/{orgId}
          </code>{orgName ? ` (${orgName})` : ""}
        </p>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && <p className="muted">No encounters with ServiceRequests found for your organization.</p>}
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
                    onClick={() => router.push(`/clinical/waiting/${row.original.encounter.id}`)}
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
