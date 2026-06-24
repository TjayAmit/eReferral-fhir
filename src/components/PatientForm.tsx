"use client";

import { GENDERS, RELATIONSHIP_CODES, type PatientFormData } from "@/lib/patient-registration";

export default function PatientForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
  cancelLabel = "Cancel",
  showCancel = true,
}: {
  form: PatientFormData;
  setForm: (f: PatientFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  submitLabel: string;
  submitting: boolean;
  cancelLabel?: string;
  showCancel?: boolean;
}) {
  const kin = form.nextOfKin || { relationship: "SPS", givenName: "", familyName: "", phone: "" };
  const setKin = (patch: Partial<typeof kin>) => setForm({ ...form, nextOfKin: { ...kin, ...patch } });

  return (
    <form onSubmit={onSubmit}>
      <div className="patient-form-grid cols-2">
        <div className="patient-form-field">
          <label>Given Name</label>
          <input value={form.givenName} onChange={(e) => setForm({ ...form, givenName: e.target.value })} required />
        </div>
        <div className="patient-form-field">
          <label>Family Name</label>
          <input value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} required />
        </div>
      </div>

      <div className="patient-form-grid cols-3">
        <div className="patient-form-field">
          <label>Gender</label>
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="patient-form-field">
          <label>Birth Date</label>
          <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} required />
        </div>
        <div className="patient-form-field">
          <label>Mobile Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+63-9XX-XXX-XXXX" />
        </div>
      </div>

      <div className="patient-form-grid cols-2">
        <div className="patient-form-field">
          <label>PhilHealth ID</label>
          <input value={form.philhealth} onChange={(e) => setForm({ ...form, philhealth: e.target.value })} placeholder="e.g. 78-658064775-3" />
        </div>
        <div className="patient-form-field">
          <label>PhilSys ID</label>
          <input value={form.philsys} onChange={(e) => setForm({ ...form, philsys: e.target.value })} placeholder="e.g. 7731-0812-4491-0326" />
        </div>
      </div>

      <div className="patient-form-section">Address</div>
      <div className="patient-form-field">
        <label>Street / Purok</label>
        <input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
      </div>
      <div className="patient-form-grid cols-3">
        <div className="patient-form-field">
          <label>Barangay</label>
          <input value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })} />
        </div>
        <div className="patient-form-field">
          <label>City / Municipality</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="patient-form-field">
          <label>Province</label>
          <input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
        </div>
      </div>
      <div className="patient-form-grid cols-2">
        <div className="patient-form-field">
          <label>Postal Code</label>
          <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
        </div>
      </div>

      <div className="patient-form-section">Next of Kin</div>
      <div className="patient-form-grid cols-4">
        <div className="patient-form-field">
          <label>Relationship</label>
          <select value={kin.relationship} onChange={(e) => setKin({ relationship: e.target.value })}>
            {RELATIONSHIP_CODES.map((r) => (
              <option key={r.code} value={r.code}>{r.display}</option>
            ))}
          </select>
        </div>
        <div className="patient-form-field">
          <label>Given Name</label>
          <input value={kin.givenName} onChange={(e) => setKin({ givenName: e.target.value })} />
        </div>
        <div className="patient-form-field">
          <label>Family Name</label>
          <input value={kin.familyName} onChange={(e) => setKin({ familyName: e.target.value })} />
        </div>
        <div className="patient-form-field">
          <label>Phone</label>
          <input value={kin.phone} onChange={(e) => setKin({ phone: e.target.value })} />
        </div>
      </div>

      <label className="patient-form-checkbox">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active
      </label>

      <div className="patient-form-footer">
        {showCancel && onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>{cancelLabel}</button>
        )}
        <button type="submit" className="primary" disabled={submitting}>{submitLabel}</button>
      </div>
    </form>
  );
}
