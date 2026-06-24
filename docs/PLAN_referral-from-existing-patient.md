# Plan — New Referral from an Existing Patient (select, prefill, edit vitals)

**Goal:** On the New Referral screen (`/submit`), instead of typing the patient
and clinical details from scratch, the user **selects an existing patient**; the
patient demographics + last-known clinical data **auto-display (read-only)**, and
only the **vitals** remain editable so the referral carries the *latest* readings.

**Status:** planning only. No code changed yet. Backups taken:
- `backups/buildBundle.ts.2026-06-24.bak`
- `backups/submit-page.tsx.2026-06-24.bak`

---

## 1. Behaviour change (before → after)

| | Before | After |
|---|---|---|
| Patient data | typed into the form (`DEFAULT_INPUT.patient`) | **picked** from existing `Patient` resources |
| Demographics | editable | **read-only**, prefilled from the selected Patient |
| Clinical history / chief complaint / impression | typed | prefilled from the patient's latest `Condition`s (read-only or optional edit) |
| **Vitals** | typed | prefilled from latest `Observation`s, **editable** (the one thing the referrer updates) |
| Bundle | upserts Patient by PhilHealth | references the selected `Patient/<id>` (no re-create) |

---

## 2. Code changes (for reference — implement after this plan is approved)

### 2.1 `src/app/submit/page.tsx`
- Add a **Patient selector** at the top (search `/api/patient`, latest-first) —
  reuse the same fetch/filter idiom as the receiving-org selector already there.
- On select, fetch the patient + their latest clinical data
  (`GET /api/clinical-assessment?patient=<id>`) and populate `input.patient`,
  `chiefComplaint`, `clinicalHistory`, `impression`, `vitals`.
- Render demographics as **read-only** (text, not inputs); keep the **vitals**
  block as editable inputs. Everything else (receiving facility, referral
  category/service type) stays as-is.
- Track the selected `patientId` so the bundle can reference it.

### 2.2 `src/lib/buildBundle.ts`
- `ClinicalInput` (lines 76–84): add an optional `patientId?: string`.
- `buildReferralBundle` (≈line 185): if `patientId` is present, **reference the
  existing Patient** (`Patient/<id>`) for `subject`/`for` instead of building +
  upserting a new Patient entry. The `vitals` Observations are still built fresh
  (latest data). Keep the typed-patient path as a fallback when no `patientId`.
- Helpers to reuse: `src/lib/patient-registration.ts` (field→FHIR mapping),
  the vitals codings already in `buildBundle.ts` / `referral.ts`.

> Keep both paths so nothing else that calls `buildReferralBundle` breaks.

---

## 3. Plan to update the MD doc (`docs/TRIAGE_CLINICAL_FLOW.md`)

The flow doc currently ends at triage → assessment. Add the referral step that
*consumes* that data. Concretely:

1. **§1 Process flow diagram** — append a **STEP 3 (REFER)** box after assessment:
   ```
   STEP 3  REFER — referrer selects existing patient, updates vitals
   UI:   /submit
   READ:  Patient + latest Observation/Condition  (prefill, read-only)
   EDIT:  vitals only
   WRITE: eReferral transaction Bundle (references Patient/<id>)
   ```

2. **New section "§3.5 Step 3 — New Referral from existing patient"** between the
   assessment section and the relationship map. Cover:
   - UI: `/submit` (`src/app/submit/page.tsx`)
   - Builder: `buildReferralBundle` (`src/lib/buildBundle.ts`)
   - Inputs: selected `patientId`, editable `vitals`; everything else prefilled.
   - Write: references existing `Patient/<id>`; only new clinical + SR/Task/Provenance
     are POSTed (note this differs from triage, which upserts the Patient).
   - A short field table: which referral fields are *prefilled* vs *editable*.

3. **§4 Resource relationship map** — add `ServiceRequest`, `Task`, `Provenance`
   hanging off the Patient/Encounter, to show where the referral resources attach.

4. **§5 Integration notes** — add a bullet: "New referral reuses the triaged
   Patient by reference; update vitals to capture latest readings before submit."

5. **§6 File index** — add rows for `src/app/submit/page.tsx` and
   `src/lib/buildBundle.ts`.

> Scope note for the doc: the referral bundle (`buildBundle.ts`) is the IG-aligned
> 20-entry bundle (`ana-reyes-bundle.json`) — distinct from the lighter
> `clinical-assessment.ts` bundle. The doc should make clear these are two
> different builders so integrators pick the right one.

---

## 4. Suggested order of work

1. ✅ Back up `buildBundle.ts` + submit page (done).
2. Approve this plan.
3. Implement §2.1 + §2.2 (select-patient + reference-by-id path).
4. Update `docs/TRIAGE_CLINICAL_FLOW.md` per §3.
5. Sanity check: submit a referral for an existing triaged patient; confirm the
   bundle references `Patient/<id>` and carries the edited vitals.

---

## 5. Open questions (confirm before implementing)

- Prefilled **chief complaint / history / impression**: read-only, or editable
  with the latest assessment as a starting point?
- If a selected patient has **no prior vitals**, start the vitals fields blank or
  with zeros?
- Keep the existing **manual-entry path** (no patient selected) available, or
  make patient selection mandatory for a new referral?
