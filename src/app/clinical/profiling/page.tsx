"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName, getPatientIdentifier } from "@/lib/referral";
import { fhirGet } from "@/lib/fhir";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";

type Row = { encounter: any; patient: any | null };

const idVal = (res: any, kind: string) =>
  (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;

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

export default function ClinicalUpdateListPage() {
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

  // Referral matches: patient PhilHealth ID → ServiceRequest ID from My Assigned Referrals
  const [referralMatches, setReferralMatches] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess && orgId) {
      load();
      loadReferralMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl, orgId]);

  async function loadReferralMatches() {
    if (!user?.practitionerId) return;
    try {
      const taskBundle = await fhirGet(
        `Task?status=accepted&owner=Practitioner/${user.practitionerId}&_include=Task:focus&_include=Task:patient&_sort=-_lastUpdated&_count=100`,
        baseUrl,
      );

      const all = dedupeResources(taskBundle);
      const tasks = all.filter((r: any) => r.resourceType === "Task");
      const srs = all.filter((r: any) => r.resourceType === "ServiceRequest");
      const patients = all.filter((r: any) => r.resourceType === "Patient");

      const srById = new Map<string, any>(srs.map((sr: any) => [sr.id, sr]));
      const patientById = new Map<string, any>(patients.map((p: any) => [p.id, p]));

      const matches = new Map<string, string>();
      for (const task of tasks) {
        const srId = refId(task.focus?.reference || "");
        const patientId = refId(task.for?.reference || "");
        const sr = srById.get(srId) || null;
        const patient = patientById.get(patientId) || null;
        if (sr && patient) {
          const phId = getPatientIdentifier(patient, "philhealth") || getPatientIdentifier(patient, "philhealth-id");
          if (phId) matches.set(phId, srId);
        }
      }
      setReferralMatches(matches);
    } catch {
      // silently ignore — referral matching is optional
    }
  }

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { setPage(1); }, [sorting]);

  async function load() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinical-assessment?serviceProvider=${encodeURIComponent(orgId)}`, {
        headers: { "X-FHIR-Base-Url": baseUrl },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load encounters");
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
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Clinical Update" }]} title="Clinical Update" />
        <div className="alert err">
          No organization linked to your account — Clinical Update lists triage encounters
          originating from your organization.
        </div>
      </>
    );
  }

  const filtered = rows.filter(({ encounter, patient }) => {
    const text = [humanName(patient?.name), encounter?.id, encounter?.status, encounter?.subject?.reference]
      .filter(Boolean).join(" ").toLowerCase();
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
      id: "philhealth",
      header: "PhilHealth ID",
      accessorFn: (row: Row) => idVal(row.patient, "philhealth-id") || "",
      cell: (info: any) => {
        const val = info.getValue();
        if (!val) return "—";
        const hasMatch = referralMatches.has(val);
        return (
          <span>
            {val}
            {hasMatch && (
              <span className="badge accepted" style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px" }}>from eReferral</span>
            )}
          </span>
        );
      },
    },
    {
      id: "encounter",
      header: "Encounter",
      accessorFn: (row: Row) => row.encounter?.id || "",
      cell: (info: any) => <code>{info.getValue()}</code>,
    },
    {
      id: "type",
      header: "Type",
      accessorFn: (row: Row) => row.encounter?.type?.[0]?.coding?.[0]?.display || row.encounter?.class?.display || "",
      cell: (info: any) => info.getValue() || "—",
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row: Row) => row.encounter?.status || "",
      cell: (info: any) => <span className={`badge ${info.getValue() || ""}`}>{info.getValue() || "—"}</span>,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row: Row) => row.encounter?.period?.start ? new Date(row.encounter.period.start).getTime() : 0,
      cell: (info: any) => {
        const start = info.row.original.encounter?.period?.start;
        return start ? new Date(start).toLocaleString() : "—";
      },
    },
  ], [router, referralMatches]);

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
        items={[{ label: "Home", href: "/" }, { label: "Clinical Update" }]}
        title="Clinical Update"
        actions={
          <>
            <input type="search" placeholder="Search patient or encounter…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            <span className="muted">{filtered.length} encounter(s)</span>
          </>
        }
      />

      <div className="incoming-header" style={{ padding: "14px 20px", marginBottom: 16 }}>
        <p className="incoming-header-sub" style={{ margin: 0 }}>
          Triage encounters originating from your organization{" "}
          <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
            Encounter.hospitalization.origin = Organization/{orgId}
          </code>{orgName ? ` (${orgName})` : ""}
        </p>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && <p className="muted">No triage encounters found for your organization.</p>}
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
                    onClick={() => router.push(`/clinical/profiling/${row.original.encounter.id}`)}
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
