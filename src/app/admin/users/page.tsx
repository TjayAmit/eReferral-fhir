"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { fhirGet } from "@/lib/fhir";

type UserRow = { id: string; email: string; role: string; practitionerId?: string };

export default function UsersPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<UserRow[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", role: "practitioner", practitionerId: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", role: "practitioner", practitionerId: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user && user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user?.role === "admin") { load(); loadPractitioners(); }
  }, [ready, user]);

  useEffect(() => { setPage(1); }, [query]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadPractitioners() {
    try {
      const bundle = await fhirGet("Practitioner?_sort=family,given&_count=100");
      setPractitioners(
        (bundle.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Practitioner")
      );
    } catch { /* non-fatal */ }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          role: createForm.role,
          practitionerId: createForm.practitionerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setCreateForm({ email: "", password: "", role: "practitioner", practitionerId: "" });
      setShowCreate(false);
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEditForm({ email: u.email, password: "", role: u.role, practitionerId: u.practitionerId || "" });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const body: any = { email: editForm.email, role: editForm.role, practitionerId: editForm.practitionerId || undefined };
      if (editForm.password) body.password = editForm.password;
      const res = await fetch(`/api/users/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      setEditId(null);
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function practitionerName(id?: string): string {
    if (!id) return "—";
    const p = practitioners.find((x) => x.id === id);
    if (!p) return id;
    const n = p.name?.[0];
    return n ? `${n.given?.[0] || ""} ${n.family || ""}`.trim() : id;
  }

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = items.filter((u) =>
    [u.email, u.role, u.practitionerId].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "Admin", href: "/admin" }, { label: "Users" }]}
        title="Users"
        actions={
          <>
            <input type="search" placeholder="Search email or role…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            <button onClick={() => setShowCreate(true)}>+ New User</button>
            <span className="muted">{filtered.length} user(s)</span>
          </>
        }
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create User">
        {createError && <div className="alert err">❌ {createError}</div>}
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={6} />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="practitioner">Practitioner</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="field">
            <label>Link to Practitioner (optional)</label>
            <select value={createForm.practitionerId} onChange={(e) => setCreateForm({ ...createForm, practitionerId: e.target.value })}>
              <option value="">— none —</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>{practitionerName(p.id)}</option>
              ))}
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" disabled={createBusy}>{createBusy ? "Creating…" : "Create"}</button>
          </div>
        </form>
      </Modal>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && <p className="muted">No users found.</p>}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr><th>Email</th><th>Role</th><th>Practitioner</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pageRows.map((u) => (
                  <tr key={u.id}>
                    {editId === u.id ? (
                      <td colSpan={4}>
                        <div className="card" style={{ margin: 0 }}>
                          {editError && <div className="alert err">❌ {editError}</div>}
                          <form onSubmit={handleEdit}>
                            <div className="field">
                              <label>Email</label>
                              <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
                            </div>
                            <div className="field">
                              <label>New Password (leave blank to keep)</label>
                              <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} minLength={6} />
                            </div>
                            <div className="field">
                              <label>Role</label>
                              <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                                <option value="practitioner">Practitioner</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <div className="field">
                              <label>Link to Practitioner (optional)</label>
                              <select value={editForm.practitionerId} onChange={(e) => setEditForm({ ...editForm, practitionerId: e.target.value })}>
                                <option value="">— none —</option>
                                {practitioners.map((p) => (
                                  <option key={p.id} value={p.id}>{practitionerName(p.id)}</option>
                                ))}
                              </select>
                            </div>
                            <div className="row">
                              <button type="submit" disabled={editBusy}>{editBusy ? "Saving…" : "Save"}</button>
                              <button type="button" className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                            </div>
                          </form>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td>{practitionerName(u.practitionerId)}</td>
                        <td>
                          <button className="secondary" onClick={() => startEdit(u)}>Edit</button>
                          <button className="secondary" onClick={() => handleDelete(u.id)}>Delete</button>
                        </td>
                      </>
                    )}
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
