"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { humanName } from "@/lib/referral";

export default function PractitionersPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    givenName: "",
    familyName: "",
    prcLicense: "",
    organizationId: "",
    roleCode: "physician" as RoleCode,
    email: "",
    password: "",
    active: true,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    givenName: "",
    familyName: "",
    prcLicense: "",
    organizationId: "",
    roleCode: "physician" as RoleCode,
    email: "",
    password: "",
    active: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editHasUser, setEditHasUser] = useState(false); // true = account exists

  useEffect(() => {
    if (ready && user && user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user?.role === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => {
    setPage(1);
  }, [query, orgFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [practitionersRes, orgsRes, rolesRes] = await Promise.all([
        fetch("/api/practitioner"),
        fetch("/api/organization"),
        fetch("/api/practitioner-role"),
      ]);

      const [practitionersData, orgsData, rolesData] = await Promise.all([
        practitionersRes.json(),
        orgsRes.json(),
        rolesRes.json(),
      ]);

      if (!practitionersRes.ok) throw new Error(practitionersData.error || "Failed to load practitioners");
      if (!orgsRes.ok) throw new Error(orgsData.error || "Failed to load organizations");
      if (!rolesRes.ok) throw new Error(rolesData.error || "Failed to load roles");

      setItems(
        (practitionersData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Practitioner")
      );

      setOrganizations(
        (orgsData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Organization")
      );

      setRoles(
        (rolesData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "PractitionerRole")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.organizationId) {
      setCreateError("Organization is required.");
      return;
    }
    if (!createForm.email || !createForm.password) {
      setCreateError("Email and password are required for user account.");
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const identifiers = [];
      if (createForm.prcLicense) {
        identifiers.push({
          system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number",
          value: createForm.prcLicense,
        });
      }

      const practitioner = {
        resourceType: "Practitioner",
        identifier: identifiers,
        active: createForm.active,
        name: [{
          use: "official",
          family: createForm.familyName,
          given: [createForm.givenName],
          prefix: ["Dr."],
        }],
        telecom: [{
          system: "phone",
          value: "+63-917-111-2233",
          use: "work"
        }],
      };

      const response = await fetch("/api/practitioner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(practitioner),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create practitioner");
      }

      const createdPractitioner = data;

      if (createdPractitioner && createdPractitioner.id) {
        const roleId = `ROLE-${createForm.prcLicense || Date.now()}`;
        const practitionerRole = {
          resourceType: "PractitionerRole",
          identifier: [{
            system: "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id",
            value: roleId,
          }],
          active: createForm.active,
          practitioner: { reference: `Practitioner/${createdPractitioner.id}` },
          organization: { reference: `Organization/${createForm.organizationId}` },
          code: [{
            coding: [{
              system: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role",
              code: createForm.roleCode,
              display: roleDisplay(createForm.roleCode),
            }]
          }],
        };

        const roleResponse = await fetch("/api/practitioner-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(practitionerRole),
        });

        if (!roleResponse.ok) {
          throw new Error("Failed to create practitioner role");
        }

        // Create local user account
        const userResponse = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: createForm.email,
            password: createForm.password,
            role: "practitioner",
            practitionerId: createdPractitioner.id,
          }),
        });

        const userData = await userResponse.json();
        if (!userResponse.ok) {
          throw new Error(userData.error || "Failed to create user account");
        }
      }

      setCreateForm({ givenName: "", familyName: "", prcLicense: "", organizationId: "", roleCode: "physician", email: "", password: "", active: true });
      setShowCreateForm(false);
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  }

  async function startEdit(practitioner: any) {
    const existingRole = roles.find(r => r.practitioner?.reference?.includes(practitioner.id));
    const currentOrgId = existingRole?.organization?.reference?.split("/").pop() || "";
    const currentRoleCode = (existingRole?.code?.[0]?.coding?.[0]?.code as RoleCode) || "physician";

    // Fetch user account to get current email
    let currentEmail = "";

    try {
      const usersResponse = await fetch(`/api/users?practitionerId=${practitioner.id}`);

      const usersData = await usersResponse.json();
      
      if (usersResponse.ok && usersData.length > 0) {
        currentEmail = usersData[0].email || "";
        setEditHasUser(true);
      } else {
        setEditHasUser(false);
      }
    } catch (e) {
      console.error("Failed to load user email:", e);
      setEditHasUser(false);
    }

    setEditingId(practitioner.id);
    setEditForm({
      givenName: practitioner.name?.[0]?.given?.[0] || "",
      familyName: practitioner.name?.[0]?.family || "",
      prcLicense: idVal(practitioner, "prc") || "",
      organizationId: currentOrgId,
      roleCode: currentRoleCode,
      email: currentEmail,
      password: "",
      active: practitioner.active !== false,
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.organizationId) {
      setEditError("Organization is required.");
      return;
    }
    if (!editForm.email) {
      setEditError("Email is required.");
      return;
    }
    if (!editHasUser && !editForm.password) {
      setEditError("Password is required to create login credentials for this practitioner.");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setEditError("Password must be at least 6 characters.");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const practitioner = {
        resourceType: "Practitioner",
        id: editingId,
        name: [{
          use: "official",
          family: editForm.familyName,
          given: [editForm.givenName],
          prefix: ["Dr."],
        }],
        identifier: editForm.prcLicense ? [{
          system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number",
          value: editForm.prcLicense,
        }] : [],
        active: editForm.active,
      };

      const response = await fetch("/api/practitioner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(practitioner),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update practitioner");
      }

      const existingRole = roles.find(r => r.practitioner?.reference?.includes(editingId));
      if (existingRole) {
        const updatedRole = {
          ...existingRole,
          active: editForm.active,
          organization: { reference: `Organization/${editForm.organizationId}` },
          code: [{
            coding: [{
              system: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role",
              code: editForm.roleCode,
              display: roleDisplay(editForm.roleCode),
            }]
          }],
        };
        const roleResponse = await fetch("/api/practitioner-role", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedRole),
        });
        if (!roleResponse.ok) {
          const roleData = await roleResponse.json();
          throw new Error(roleData.error || "Failed to update practitioner role");
        }
      } else {
        const roleId = `ROLE-${editForm.prcLicense || Date.now()}`;
        const newRole = {
          resourceType: "PractitionerRole",
          identifier: [{
            system: "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id",
            value: roleId,
          }],
          active: editForm.active,
          practitioner: { reference: `Practitioner/${editingId}` },
          organization: { reference: `Organization/${editForm.organizationId}` },
          code: [{
            coding: [{
              system: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role",
              code: editForm.roleCode,
              display: roleDisplay(editForm.roleCode),
            }]
          }],
        };
        const roleResponse = await fetch("/api/practitioner-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRole),
        });
        if (!roleResponse.ok) {
          const roleData = await roleResponse.json();
          throw new Error(roleData.error || "Failed to create practitioner role");
        }
      }

      // Create or update login credentials
      const usersResponse = await fetch(`/api/users?practitionerId=${editingId}`);
      const usersData = await usersResponse.json();
      if (usersResponse.ok && usersData.length > 0) {
        // Account exists — update email and optionally password
        const userId = usersData[0].id;
        const updateData: any = { email: editForm.email };
        if (editForm.password) updateData.password = editForm.password;
        const res = await fetch(`/api/users/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Failed to update user credentials");
        }
      } else if (editForm.email && editForm.password) {
        // No account yet — create one now
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: editForm.email,
            password: editForm.password,
            role: "practitioner",
            practitionerId: editingId,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Failed to create user credentials");
        }
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
    if (!confirm("Are you sure you want to delete this practitioner?")) return;
    try {
      const response = await fetch(`/api/practitioner?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete practitioner");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function getOrganizationName(practitionerId: string) {
    const role = roles.find(r => r.practitioner?.reference?.includes(practitionerId));
    const orgRef = role?.organization?.reference;
    if (!orgRef) return "—";
    const orgId = orgRef.split("/").pop();
    const org = organizations.find(o => o.id === orgId);
    return org?.name || `Organization/${orgId}`;
  }

  function getPractitionerRole(practitionerId: string) {
    const role = roles.find(r => r.practitioner?.reference?.includes(practitionerId));
    const code = role?.code?.[0]?.coding?.[0]?.code;
    return code ? roleDisplay(code) : "—";
  }

  if (!ready || !user || user.role !== "admin") {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = items.filter((p) => {
    if (orgFilter) {
      const role = roles.find(r => r.practitioner?.reference?.includes(p.id));
      const orgId = role?.organization?.reference?.split("/").pop();
      if (orgId !== orgFilter) return false;
    }
    const text = [humanName(p.name), idVal(p, "prc")]
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
          { label: "Practitioners" },
        ]}
        title="Practitioners"
        actions={
          <>
            <input
              type="search"
              placeholder="Search name or PRC license…"
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
            <button onClick={() => setShowCreateForm(true)}>
              + New Practitioner
            </button>
            <span className="muted">{filtered.length} practitioner(s)</span>
          </>
        }
      />

      <Modal
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title="Create New Practitioner"
      >
        {createError && <div className="alert err">❌ {createError}</div>}
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Given Name</label>
            <input
              value={createForm.givenName}
              onChange={(e) => setCreateForm({ ...createForm, givenName: e.target.value })}
              placeholder="e.g. Juan"
              required
            />
          </div>
          <div className="field">
            <label>Family Name</label>
            <input
              value={createForm.familyName}
              onChange={(e) => setCreateForm({ ...createForm, familyName: e.target.value })}
              placeholder="e.g. Dela Cruz"
              required
            />
          </div>
          <div className="field">
            <label>PRC License (optional)</label>
            <input
              value={createForm.prcLicense}
              onChange={(e) => setCreateForm({ ...createForm, prcLicense: e.target.value })}
              placeholder="e.g. 123456"
            />
          </div>
          <div className="field">
            <label>Organization (required)</label>
            <select
              value={createForm.organizationId}
              onChange={(e) => setCreateForm({ ...createForm, organizationId: e.target.value })}
              required
            >
              <option value="">Select an organization…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Practitioner Role (required)</label>
            <select
              value={createForm.roleCode}
              onChange={(e) => setCreateForm({ ...createForm, roleCode: e.target.value as RoleCode })}
              required
            >
              {ROLE_CODES.map((r) => (
                <option key={r.code} value={r.code}>{r.display}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Email (required for login)</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="e.g. doctor@example.com"
              required
            />
          </div>
          <div className="field">
            <label>Password (required for login)</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Min 6 characters"
                required
                style={{ paddingRight: "40px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  display: "flex",
                  alignItems: "center",
                  color: "#666",
                }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
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
              {createLoading ? "Creating…" : "Create Practitioner"}
            </button>
          </div>
        </form>
      </Modal>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No practitioners found.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>PRC License</th>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr key={p.id}>
                    {editingId === p.id ? (
                      <>
                        <td colSpan={7}>
                          <div className="card" style={{ margin: 0 }}>
                            {editError && <div className="alert err">❌ {editError}</div>}
                            <form onSubmit={handleEdit}>
                              <div className="field">
                                <label>Given Name</label>
                                <input
                                  value={editForm.givenName}
                                  onChange={(e) => setEditForm({ ...editForm, givenName: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="field">
                                <label>Family Name</label>
                                <input
                                  value={editForm.familyName}
                                  onChange={(e) => setEditForm({ ...editForm, familyName: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="field">
                                <label>PRC License (optional)</label>
                                <input
                                  value={editForm.prcLicense}
                                  onChange={(e) => setEditForm({ ...editForm, prcLicense: e.target.value })}
                                />
                              </div>
                              <div className="field">
                                <label>Organization (required)</label>
                                <select
                                  value={editForm.organizationId}
                                  onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value })}
                                  required
                                >
                                  <option value="">Select an organization…</option>
                                  {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                      {org.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="field">
                                <label>Practitioner Role (required)</label>
                                <select
                                  value={editForm.roleCode}
                                  onChange={(e) => setEditForm({ ...editForm, roleCode: e.target.value as RoleCode })}
                                  required
                                >
                                  {ROLE_CODES.map((r) => (
                                    <option key={r.code} value={r.code}>{r.display}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="field">
                                <label>Email (required for login)</label>
                                <input
                                  type="email"
                                  value={editForm.email}
                                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                  placeholder="e.g. doctor@example.com"
                                  required
                                />
                              </div>
                              <div className="field">
                                <label>
                                  {editHasUser
                                    ? "New Password (leave blank to keep current)"
                                    : "Password (required — no account yet)"}
                                </label>
                                <div style={{ position: "relative" }}>
                                  <input
                                    type={showEditPassword ? "text" : "password"}
                                    value={editForm.password}
                                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                    placeholder="Min 6 characters"
                                    required={!editHasUser}
                                    style={{ paddingRight: "40px" }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowEditPassword(!showEditPassword)}
                                    style={{
                                      position: "absolute",
                                      right: "8px",
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: "0",
                                      display: "flex",
                                      alignItems: "center",
                                      color: "#666",
                                    }}
                                    tabIndex={-1}
                                  >
                                    {showEditPassword ? (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                        <line x1="1" y1="1" x2="23" y2="23"></line>
                                      </svg>
                                    ) : (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="field">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={editForm.active}
                                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                                    style={{ width: "auto", marginRight: 8 }}
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
                        <td><code>{p.id}</code></td>
                        <td>{humanName(p.name)}</td>
                        <td>{idVal(p, "prc") || "—"}</td>
                        <td>{getOrganizationName(p.id)}</td>
                        <td>{getPractitionerRole(p.id)}</td>
                        <td>{p.active ? "Active" : "Inactive"}</td>
                        <td>
                          <button className="secondary" onClick={() => startEdit(p)}>
                            Edit
                          </button>
                          <button className="secondary" onClick={() => handleDelete(p.id)}>
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

function idVal(res: any, kind: "prc" | "nhfr" | "hcpn"): string | undefined {
  const match = (res.identifier || []).find((i: any) =>
    (i.system || "").includes(kind)
  );
  return match?.value;
}

const ROLE_CODES = [
  { code: "physician",  display: "Physician" },
  { code: "nurse",      display: "Nurse" },
  { code: "midwife",    display: "Midwife" },
  { code: "navigator",  display: "Referral Navigator" },
  { code: "medtech",    display: "Medical Technologist" },
  { code: "pharmacist", display: "Pharmacist" },
  { code: "dentist",    display: "Dentist" },
] as const;

type RoleCode = typeof ROLE_CODES[number]["code"];

function roleDisplay(code: string): string {
  return ROLE_CODES.find(r => r.code === code)?.display ?? code;
}
