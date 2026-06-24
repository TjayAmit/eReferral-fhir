"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { formatAddress } from "@/lib/referral";

export default function OrganizationsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    nhfr: "",
    hcpn: "",
    addressLine: "",
    city: "",
    state: "",
    postalCode: "",
    active: true,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    nhfr: "",
    hcpn: "",
    addressLine: "",
    city: "",
    state: "",
    postalCode: "",
    active: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      const response = await fetch("/api/organization");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load organizations");
      setItems(
        (data.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Organization")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      const identifiers = [];
      if (createForm.nhfr) {
        identifiers.push({ 
          system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code", 
          value: createForm.nhfr 
        });
      }
      if (createForm.hcpn) {
        identifiers.push({ 
          system: "https://fhir.doh.gov.ph/phcore/Identifier/hcpn", 
          value: createForm.hcpn 
        });
      }

      const organization = {
        resourceType: "Organization",
        identifier: identifiers,
        active: createForm.active,
        name: createForm.name,
        telecom: createForm.addressLine ? [{
          system: "phone",
          value: "+63-36-268-1234",
          use: "work"
        }] : [],
        address: (createForm.addressLine || createForm.city || createForm.state || createForm.postalCode) ? [{
          use: "work",
          line: createForm.addressLine ? [createForm.addressLine] : [],
          city: createForm.city,
          state: createForm.state,
          postalCode: createForm.postalCode,
          country: "PH"
        }] : [],
      };

      const response = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organization),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create organization");
      }

      setCreateForm({
        name: "",
        nhfr: "",
        hcpn: "",
        addressLine: "",
        city: "",
        state: "",
        postalCode: "",
        active: true,
      });
      setShowCreateForm(false);
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(organization: any) {
    setEditingId(organization.id);
    setEditForm({
      name: organization.name || "",
      nhfr: idVal(organization, "nhfr") || "",
      hcpn: idVal(organization, "hcpn") || "",
      addressLine: organization.address?.[0]?.line?.[0] || "",
      city: organization.address?.[0]?.city || "",
      state: organization.address?.[0]?.state || "",
      postalCode: organization.address?.[0]?.postalCode || "",
      active: organization.active !== false,
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const identifiers = [];
      if (editForm.nhfr) {
        identifiers.push({ 
          system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code", 
          value: editForm.nhfr 
        });
      }
      if (editForm.hcpn) {
        identifiers.push({ 
          system: "https://fhir.doh.gov.ph/phcore/Identifier/hcpn", 
          value: editForm.hcpn 
        });
      }

      const organization = {
        resourceType: "Organization",
        id: editingId,
        identifier: identifiers,
        active: editForm.active,
        name: editForm.name,
        telecom: editForm.addressLine ? [{
          system: "phone",
          value: "+63-36-268-1234",
          use: "work"
        }] : [],
        address: (editForm.addressLine || editForm.city || editForm.state || editForm.postalCode) ? [{
          use: "work",
          line: editForm.addressLine ? [editForm.addressLine] : [],
          city: editForm.city,
          state: editForm.state,
          postalCode: editForm.postalCode,
          country: "PH"
        }] : [],
      };
      const response = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organization),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update organization");
      }
      setEditingId(null);
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this organization?")) return;
    try {
      const response = await fetch(`/api/organization?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete organization");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = items.filter((o) => {
    const text = [o.name, idVal(o, "nhfr"), idVal(o, "hcpn")]
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
          { label: "Organizations" },
        ]}
        title="Organizations"
        actions={
          <>
            <input
              type="search"
              placeholder="Search name, NHFR or HCPN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button onClick={() => setShowCreateForm(true)}>
              + New Organization
            </button>
            <span className="muted">{filtered.length} organization(s)</span>
          </>
        }
      />

      <Modal
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title="Create New Organization"
      >
        {createError && <div className="alert err">❌ {createError}</div>}
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Organization Name</label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Kalibo Health Center"
              required
            />
          </div>
          <div className="field">
            <label>NHFR ID (optional)</label>
            <input
              value={createForm.nhfr}
              onChange={(e) => setCreateForm({ ...createForm, nhfr: e.target.value })}
              placeholder="e.g. NHFR-12345"
            />
          </div>
          <div className="field">
            <label>HCPN ID (optional)</label>
            <input
              value={createForm.hcpn}
              onChange={(e) => setCreateForm({ ...createForm, hcpn: e.target.value })}
              placeholder="e.g. HCPN-67890"
            />
          </div>
          <div className="field">
            <label>Address Line (optional)</label>
            <input
              value={createForm.addressLine}
              onChange={(e) => setCreateForm({ ...createForm, addressLine: e.target.value })}
              placeholder="e.g. 123 Main Street"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>City (optional)</label>
              <input
                value={createForm.city}
                onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                placeholder="e.g. Kalibo"
              />
            </div>
            <div className="field">
              <label>State/Province (optional)</label>
              <input
                value={createForm.state}
                onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                placeholder="e.g. Aklan"
              />
            </div>
            <div className="field">
              <label>Postal Code (optional)</label>
              <input
                value={createForm.postalCode}
                onChange={(e) => setCreateForm({ ...createForm, postalCode: e.target.value })}
                placeholder="e.g. 5600"
              />
            </div>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={createForm.active}
                onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
                style={{ width: "auto", marginRight: 8 }}
              />
              Active
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setShowCreateForm(false)}>
              Cancel
            </button>
            <button type="submit" disabled={createLoading}>
              {createLoading ? "Creating…" : "Create Organization"}
            </button>
          </div>
        </form>
      </Modal>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No organizations found.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>NHFR</th>
                  <th>HCPN</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => (
                  <tr key={o.id}>
                    {editingId === o.id ? (
                      <>
                        <td colSpan={7}>
                          <div className="card" style={{ margin: 0 }}>
                            {editError && <div className="alert err">❌ {editError}</div>}
                            <form onSubmit={handleEdit}>
                              <div className="field">
                                <label>Organization Name</label>
                                <input
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="field">
                                <label>NHFR ID (optional)</label>
                                <input
                                  value={editForm.nhfr}
                                  onChange={(e) => setEditForm({ ...editForm, nhfr: e.target.value })}
                                />
                              </div>
                              <div className="field">
                                <label>HCPN ID (optional)</label>
                                <input
                                  value={editForm.hcpn}
                                  onChange={(e) => setEditForm({ ...editForm, hcpn: e.target.value })}
                                />
                              </div>
                              <div className="field">
                                <label>Address Line (optional)</label>
                                <input
                                  value={editForm.addressLine}
                                  onChange={(e) => setEditForm({ ...editForm, addressLine: e.target.value })}
                                />
                              </div>
                              <div className="row">
                                <div className="field">
                                  <label>City (optional)</label>
                                  <input
                                    value={editForm.city}
                                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                  />
                                </div>
                                <div className="field">
                                  <label>State/Province (optional)</label>
                                  <input
                                    value={editForm.state}
                                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                                  />
                                </div>
                                <div className="field">
                                  <label>Postal Code (optional)</label>
                                  <input
                                    value={editForm.postalCode}
                                    onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="field">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={editForm.active}
                                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                                  />
                                  Active
                                </label>
                              </div>
                              <div className="row">
                                <button type="submit" disabled={editLoading}>
                                  {editLoading ? "Saving…" : "Save"}
                                </button>
                                <button type="button" className="secondary" onClick={() => setEditingId(null)}>
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><code>{o.id}</code></td>
                        <td>{o.name || "—"}</td>
                        <td>{idVal(o, "nhfr") || "—"}</td>
                        <td>{idVal(o, "hcpn") || "—"}</td>
                        <td>{formatAddress(o.address)}</td>
                        <td>{o.active ? "Active" : "Inactive"}</td>
                        <td>
                          <button className="secondary" onClick={() => startEdit(o)}>
                            Edit
                          </button>
                          <button className="secondary" onClick={() => handleDelete(o.id)}>
                            Delete
                          </button>
                        </td>
                      </>
                    )}
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

function idVal(res: any, kind: "nhfr" | "hcpn"): string | undefined {
  const match = (res.identifier || []).find((i: any) =>
    (i.system || "").includes(kind)
  );
  return match?.value;
}
