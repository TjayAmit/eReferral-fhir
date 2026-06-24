"use client";

import AppPageHeader from "@/components/AppPageHeader";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { buildFhirBaseUrl, FHIR_SERVERS, getServerById } from "@/lib/settings";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { serverId, setServerId } = useSettings();
  const { user } = useAuth();
  const [selected, setSelected] = useState(serverId);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(serverId);
  }, [serverId]);

  const selectedServer = getServerById(selected);

  function handleSave() {
    setServerId(selected);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const content = (
    <>
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "Settings" }]}
        title="Settings"
        actions={!user ? <button onClick={() => window.location.href = "/login"}>Back to login</button> : undefined}
      />

      <div className="card">
        <h2>FHIR server</h2>
        <p className="muted">
          Choose the FHIR server the application uses for data requests. The dashboards and FHIR client will read from this selection.
        </p>

        <div className="field">
          <label htmlFor="fhirServer">Server</label>
          <select id="fhirServer" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {FHIR_SERVERS.map((s) => (
              <option key={s.id} value={s.id} disabled={s.disabled}>
                {s.name} ({s.endpoint}){s.disabled ? " — not available" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedServer && (
          <div className="settings-summary">
            <div className="settings-row">
              <span>Version</span>
              <b>{selectedServer.version}</b>
            </div>
            <div className="settings-row">
              <span>Endpoint</span>
              <b>{selectedServer.endpoint}</b>
            </div>
            <div className="settings-row">
              <span>FHIR base URL</span>
              <code>{buildFhirBaseUrl(selectedServer)}</code>
            </div>
            <div className="settings-row">
              <span>Capabilities</span>
              <b>{selectedServer.capabilities}</b>
            </div>
            {selectedServer.notes && (
              <div className="settings-row">
                <span>Notes</span>
                <b>{selectedServer.notes}</b>
              </div>
            )}
          </div>
        )}

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="primary" onClick={handleSave}>
            Save settings
          </button>
          {saved && <span className="ok">Saved.</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Available servers</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Server</th>
              <th>Endpoint</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {FHIR_SERVERS.map((s) => (
              <tr key={s.id}>
                <td>{s.version}</td>
                <td>{s.name}</td>
                <td><code>{s.endpoint}</code></td>
                <td>{s.capabilities}{s.notes ? ` · ${s.notes}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return user ? content : <div className="container">{content}</div>;
}
