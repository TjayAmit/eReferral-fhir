"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
};

export default function AdminList<T extends { id?: string }>({
  title,
  breadcrumbs,
  columns,
  rows,
  loading,
  error,
  onRefresh,
  searchPlaceholder = "Search…",
  pageSize = 10,
  actions,
}: {
  title: string;
  breadcrumbs: BreadcrumbItem[];
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  searchPlaceholder?: string;
  pageSize?: number;
  actions?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        const val = c.render(r);
        return String(val ?? "").toLowerCase().includes(q);
      })
    );
  }, [rows, query, columns]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        {breadcrumbs.map((b, i) => (
          <span key={i}>
            {i > 0 && <span className="sep"> / </span>}
            {b.href ? <Link href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
          </span>
        ))}
      </nav>

      <div className="page-header">
        <h1>{title}</h1>
        <div className="actions">
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {actions}
        </div>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={row.id || i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && !loading && (
              <tr>
                <td colSpan={columns.length} className="muted center">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pagination">
          <button
            className="ghost"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {currentPage} of {totalPages} · {filtered.length} total
          </span>
          <button
            className="ghost"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
