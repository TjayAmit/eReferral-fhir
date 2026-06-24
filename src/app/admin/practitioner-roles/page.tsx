"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";

export default function PractitionerRolesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && user && user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user?.role === "admin") load();
  }, [ready, user]);

  useEffect(() => {
    setPage(1);
  }, [query, orgFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, practitionersRes, orgsRes] = await Promise.all([
        fetch("/api/practitioner-role"),
        fetch("/api/practitioner"),
        fetch("/api/organization"),
      ]);

      const [rolesData, practitionersData, orgsData] = await Promise.all([
        rolesRes.json(),
        practitionersRes.json(),
        orgsRes.json(),
      ]);

      if (!rolesRes.ok) throw new Error(rolesData.error || "Failed to load practitioner roles");
      if (!practitionersRes.ok) throw new Error(practitionersData.error || "Failed to load practitioners");
      if (!orgsRes.ok) throw new Error(orgsData.error || "Failed to load organizations");

      setRoles(
        (rolesData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "PractitionerRole")
      );

      setPractitioners(
        (practitionersData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Practitioner")
      );

      setOrganizations(
        (orgsData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Organization")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getRoleName(role: any): string {
    const code = role.code?.[0]?.coding?.[0];
    if (code?.display) return code.display;
    if (code?.code) return code.code;
    if (role.code?.[0]?.text) return role.code[0].text;
    return "—";
  }

  function getOrganizationName(role: any): string {
    const orgRef = role.organization?.reference;
    if (!orgRef) return "—";
    const orgId = orgRef.split("/").pop();
    const org = organizations.find((o) => o.id === orgId);
    return org?.name || `Organization/${orgId}`;
  }

  function getPractitionerCount(roleId: string): number {
    return practitioners.filter((p) =>
      roles.some((r) =>
        r.id === roleId &&
        r.practitioner?.reference?.includes(p.id)
      )
    ).length;
  }

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = roles.filter((r) => {
    if (orgFilter) {
      const orgId = r.organization?.reference?.split("/").pop();
      if (orgId !== orgFilter) return false;
    }
    const text = [getRoleName(r), r.id]
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
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Admin", href: "/admin" },
          { label: "Practitioner Roles" },
        ]}
        title="Practitioner Roles"
        actions={
          <>
            <input
              type="search"
              placeholder="Search role name or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              style={{ maxWidth: 220 }}
            >
              <option value="">All organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button className="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <span className="muted">{filtered.length} role(s)</span>
          </>
        }
      />

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No practitioner roles found.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Resource ID</th>
                  <th>Role Name</th>
                  <th>Practitioners</th>
                  <th>Organization</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id}</code></td>
                    <td>{getRoleName(r)}</td>
                    <td>{getPractitionerCount(r.id)}</td>
                    <td>{getOrganizationName(r)}</td>
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
