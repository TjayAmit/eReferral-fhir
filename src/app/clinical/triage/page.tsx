"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName, firstPhone } from "@/lib/referral";
import {
  buildPatient,
  relationshipDisplay,
  type PatientFormData,
} from "@/lib/patient-registration";
import PatientForm from "@/components/PatientForm";

const EMPTY_FORM: PatientFormData = {
  philhealth: "",
  philsys: "",
  givenName: "",
  familyName: "",
  gender: "unknown",
  birthDate: "",
  phone: "",
  addressLine: "",
  barangay: "",
  city: "",
  province: "",
  postalCode: "",
  nextOfKin: { relationship: "SPS", givenName: "", familyName: "", phone: "" },
  active: true,
};

export default function PatientsPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PatientFormData>(EMPTY_FORM);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canAccess = user?.role === "admin" || user?.role === "practitioner";

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const patientsRes = await fetch("/api/patient", { headers: { "X-FHIR-Base-Url": baseUrl } });
      const patientsData = await patientsRes.json();
      if (!patientsRes.ok) throw new Error(patientsData.error || "Failed to load patients");

      setItems(
        (patientsData.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Patient")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }


  function startEdit(p: any) {
    const addr = p.address?.[0] || {};
    const lines: string[] = addr.line || [];
    const kin = p.contact?.[0];
    setEditingId(p.id);
    setEditForm({
      philhealth: idVal(p, "philhealth-id") || "",
      philsys: idVal(p, "philsys-id") || "",
      givenName: p.name?.[0]?.given?.[0] || "",
      familyName: p.name?.[0]?.family || "",
      gender: p.gender || "unknown",
      birthDate: p.birthDate || "",
      phone: firstPhoneVal(p.telecom),
      addressLine: lines[0] || "",
      barangay: lines[1] || "",
      city: addr.city || "",
      province: addr.state || "",
      postalCode: addr.postalCode || "",
      nextOfKin: {
        relationship: kin?.relationship?.[0]?.coding?.[0]?.code || "SPS",
        givenName: kin?.name?.given?.[0] || "",
        familyName: kin?.name?.family || "",
        phone: firstPhoneVal(kin?.telecom),
      },
      active: p.active !== false,
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const patient = { ...buildPatient(editForm), id: editingId };
      const res = await fetch("/api/patient", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(patient),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update patient");
      setEditingId(null);
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this patient?")) return;
    try {
      const res = await fetch(`/api/patient?id=${id}`, {
        method: "DELETE",
        headers: { "X-FHIR-Base-Url": baseUrl },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete patient");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  const filtered = items.filter((p) => {
    const text = [humanName(p.name), idVal(p, "philhealth-id"), idVal(p, "philsys-id")]
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
          { label: "Patients (Triage)" },
        ]}
        title="Patient Registration — Triage"
        actions={
          <>
            <input
              type="search"
              placeholder="Search name, PhilHealth or PhilSys…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button onClick={() => router.push("/clinical/triage/new")}>
              + Register Patient
            </button>
            <span className="muted">{filtered.length} patient(s)</span>
          </>
        }
      />

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && <p className="muted">No patients found.</p>}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Gender / Birth date</th>
                  <th>PhilHealth</th>
                  <th>PhilSys</th>
                  <th>Next of Kin</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr key={p.id}>
                    {editingId === p.id ? (
                      <td colSpan={8}>
                        <div className="card" style={{ margin: 0 }}>
                          {editError && <div className="alert err">❌ {editError}</div>}
                          <PatientForm
                            form={editForm}
                            setForm={setEditForm}
                            onSubmit={handleEdit}
                            onCancel={() => setEditingId(null)}
                            submitLabel={editLoading ? "Saving…" : "Save"}
                            submitting={editLoading}
                          />
                        </div>
                      </td>
                    ) : (
                      <>
                        <td><code>{p.id}</code></td>
                        <td>{humanName(p.name)}</td>
                        <td>{[p.gender, p.birthDate].filter(Boolean).join(" · ") || "—"}</td>
                        <td>{idVal(p, "philhealth-id") || "—"}</td>
                        <td>{idVal(p, "philsys-id") || "—"}</td>
                        <td>{nextOfKinLabel(p.contact?.[0])}</td>
                        <td>{p.active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <button onClick={() => router.push(`/clinical/triage/${p.id}/assessment`)}>Assess</button>
                            <button className="secondary" onClick={() => startEdit(p)}>Edit</button>
                            <button className="secondary" onClick={() => handleDelete(p.id)}>Delete</button>
                          </div>
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

function idVal(res: any, kind: string): string | undefined {
  const match = (res.identifier || []).find((i: any) => (i.system || "").includes(kind));
  return match?.value;
}

function firstPhoneVal(telecom?: any[]): string {
  const v = firstPhone(telecom);
  return v === "—" ? "" : v;
}

function nextOfKinLabel(contact?: any): string {
  if (!contact) return "—";
  const rel = relationshipDisplay(contact.relationship?.[0]?.coding?.[0]?.code || "");
  const name = humanName(contact.name);
  return [name !== "—" ? name : null, rel].filter(Boolean).join(" · ") || "—";
}
