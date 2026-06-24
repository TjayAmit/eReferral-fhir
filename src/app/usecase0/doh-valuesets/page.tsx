"use client";

import { useMemo, useState } from "react";
import AppPageHeader from "@/components/AppPageHeader";
import { expandValueSet, TX_BASE } from "@/lib/fhir";

const DOH_VALUESETS = [
  {
    id: "0.01",
    name: "Practitioner Role",
    code: "practitioner-role",
    url: "https://www.fhir.doh.gov.ph/pheref/ValueSet/practitioner-role",
  },
  {
    id: "0.02",
    name: "Referral Category",
    code: "referral-category",
    url: "https://www.fhir.doh.gov.ph/pheref/ValueSet/referral-category",
  },
  {
    id: "0.03",
    name: "Reason for Referral (Service Type)",
    code: "reason-for-referral-service-type",
    url: "https://www.fhir.doh.gov.ph/pheref/ValueSet/reason-for-referral-service-type",
  },
];

export default function DOHValueSetsPage() {
  const [selectedValueSet, setSelectedValueSet] = useState<typeof DOH_VALUESETS[0] | null>(null);
  const [expansion, setExpansion] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function loadValueSet(valueSet: typeof DOH_VALUESETS[0]) {
    setSelectedValueSet(valueSet);
    setLoading(true);
    setError(null);
    setExpansion(null);
    setFilter("");
    try {
      const data = await expandValueSet(valueSet.url);
      setExpansion(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const concepts = expansion?.expansion?.contains || [];

  const filteredConcepts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter((c: any) =>
      (c.code && String(c.code).toLowerCase().includes(q)) ||
      (c.display && String(c.display).toLowerCase().includes(q)) ||
      (c.definition && String(c.definition).toLowerCase().includes(q)) ||
      (c.system && String(c.system).toLowerCase().includes(q))
    );
  }, [concepts, filter]);

  const getUrl = selectedValueSet
    ? `${TX_BASE}/ValueSet/$expand?url=${encodeURIComponent(selectedValueSet.url)}`
    : "";

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Use Case 0", href: "/usecase0" },
          { label: "DOH ValueSets" },
        ]}
        title="DOH ValueSets"
        actions={
          <span className="muted">{DOH_VALUESETS.length} value set(s)</span>
        }
      />

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Select ValueSet</h2>
          <div className="field">
            <label>Data Element</label>
            <select
              value={selectedValueSet?.id || ""}
              onChange={(e) => {
                const vs = DOH_VALUESETS.find((v) => v.id === e.target.value);
                if (vs) loadValueSet(vs);
              }}
            >
              <option value="">— select a value set —</option>
              {DOH_VALUESETS.map((vs) => (
                <option key={vs.id} value={vs.id}>
                  {vs.id} - {vs.name}
                </option>
              ))}
            </select>
          </div>
          {selectedValueSet && (
            <>
              <div className="field">
                <label>ValueSet URL</label>
                <code style={{ display: "block", wordBreak: "break-all", fontSize: "0.85em" }}>
                  {selectedValueSet.url}
                </code>
              </div>
              <div className="field">
                <label>GET URL</label>
                <code style={{ display: "block", wordBreak: "break-all", fontSize: "0.85em" }}>
                  {getUrl}
                </code>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>ValueSet Details</h2>
          {loading && <p className="muted">Loading…</p>}
          {error && <div className="alert err">❌ {error}</div>}
          {!selectedValueSet && !loading && (
            <p className="muted">Select a value set to view its concepts.</p>
          )}
          {selectedValueSet && !loading && !error && (
            <dl className="kv">
              <dt>ID</dt>
              <dd>{selectedValueSet.id}</dd>
              <dt>Name</dt>
              <dd>{selectedValueSet.name}</dd>
              <dt>Code</dt>
              <dd><code>{selectedValueSet.code}</code></dd>
              <dt>Concepts</dt>
              <dd>{concepts.length}</dd>
            </dl>
          )}
        </div>
      </div>

      {selectedValueSet && !loading && !error && concepts.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Concepts</h2>
            <div className="field" style={{ margin: 0, minWidth: 260 }}>
              <input
                type="text"
                placeholder="Filter by code, display, definition…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ margin: 0 }}
              />
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Showing {filteredConcepts.length} of {concepts.length} concept{concepts.length !== 1 ? "s" : ""}
          </p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>System</th>
                <th>Display</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {filteredConcepts.map((c: any, idx: number) => (
                <tr key={idx}>
                  <td><code>{c.code}</code></td>
                  <td style={{ fontSize: "0.85em" }}>{c.system?.split("/").pop() || "—"}</td>
                  <td>{c.display || "—"}</td>
                  <td style={{ maxWidth: 400, wordBreak: "break-word" }}>{c.definition || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredConcepts.length === 0 && (
            <p className="muted">No concepts match the current filter.</p>
          )}
        </div>
      )}

      {selectedValueSet && !loading && !error && concepts.length === 0 && (
        <div className="card">
          <p className="muted">No concepts found in this ValueSet expansion.</p>
        </div>
      )}
    </>
  );
}
