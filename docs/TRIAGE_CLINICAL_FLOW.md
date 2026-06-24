# Triage → Encounter → Clinical Data — Integration Guide

How a patient moves from **triage** (registration at a facility) to a doctor's
**clinical assessment**, and which FHIR resources are written at each step.
Use this to wire the flow into other parts of the app (referral, dashboards, etc.).

---

## 1. Process flow (high level)

```
                ┌─────────────────────────────────────────────────────────┐
   STEP 1       │  TRIAGE  —  register the patient at the facility         │
   (clerk /     │  UI:   /admin/patients   (list + Register/Edit modal)    │
    triage)     │  WRITE: Patient  (managingOrganization = the facility)   │
                └───────────────────────────┬─────────────────────────────┘
                                             │ patient.id
                                             ▼
                ┌─────────────────────────────────────────────────────────┐
   STEP 2       │  ASSESS  —  doctor checks the patient                    │
   (doctor)     │  UI:   /admin/patients/[id]/assessment                   │
                │  WRITE: one transaction Bundle:                          │
                │         Encounter ─┬─ Observation(s)  (vitals)           │
                │                    ├─ Condition       (chief complaint)  │
                │                    ├─ Condition       (diagnosis)        │
                │                    └─ Procedure        (treatment)       │
                └───────────────────────────┬─────────────────────────────┘
                                             │ encounter + clinical refs
                                             ▼
                ┌─────────────────────────────────────────────────────────┐
   STEP 3       │  REFER  —  referrer selects the existing patient         │
   (referrer)   │  UI:   /submit                                          │
                │  READ:  Patient + latest Observation/Condition           │
                │         → demographics prefill (READ-ONLY)               │
                │         → vitals/impression prefill (EDITABLE)           │
                │  EDIT:  vitals (capture latest readings)                 │
                │  WRITE: eReferral transaction Bundle                     │
                │         references Patient/<id> (does NOT re-create it)   │
                └───────────────────────────┬─────────────────────────────┘
                                             │
                                             ▼
                        (available for dashboards / $everything)
```

- **Triage creates one resource** — the `Patient`. The organization is *referenced*,
  not created (it must already exist; the form picks it from `/api/organization`).
- **Assessment creates the clinical resources** atomically in a single transaction
  Bundle, all linked to the Patient and to one new `Encounter`.

---

## 2. Step 1 — Triage (Patient)

**UI:** `src/app/admin/patients/page.tsx`
**Builder:** `src/lib/patient-registration.ts` → `buildPatient(form)`
**API:** `POST /api/patient` (route: `src/app/api/patient/route.ts`)

### What gets written
A single `Patient` (profile `ereferral-patient`) bundling:

| Form field | FHIR location |
|---|---|
| PhilHealth / PhilSys | `identifier[]` |
| given / family name | `name[0]` (`use: official`) |
| gender, birthDate | `gender`, `birthDate` |
| mobile phone | `telecom[0]` |
| street, barangay, city, province, postal | `address[0]` (`line[]`, `city`, `state`, `postalCode`, `country: PH`) |
| **next of kin** (relationship, name, phone) | `contact[0]` — **embedded, not a separate resource** |
| **triage organization** | `managingOrganization` `{ reference, display }` |

> **Triage = assignment.** "The organization the patient went to" is
> `Patient.managingOrganization`. Every triaged patient is linked to a facility.

### Upsert behaviour
`POST /api/patient` does a **conditional update by PhilHealth id**
(`PUT Patient?identifier=…philhealth-id|<value>`). Re-registering the same
patient updates rather than duplicates. Edit uses `PUT /api/patient` by `id`.

### List / retrieval
- `GET /api/patient` → newest first (`_sort=-_lastUpdated`, `_count=100`).
- `GET /api/patient?organization=<orgId>` → that facility's patients (server-side,
  latest first). Used by the org filter dropdown.
- `GET /api/patient?id=<id>` → single patient.

---

## 3. Step 2 — Clinical Assessment (Encounter + clinical data)

**UI:** `src/app/admin/patients/[id]/assessment/page.tsx`
**Builder:** `src/lib/clinical-assessment.ts` → `buildClinicalBundle(input)`
**API:** `POST /api/clinical-assessment` (route: `src/app/api/clinical-assessment/route.ts`)

### Input shape
```ts
interface ClinicalAssessmentInput {
  patientId: string;          // Patient/<id> from triage
  practitionerId: string;     // attending doctor — Practitioner/<id>
  organizationId?: string;    // service provider (= patient's managingOrganization)
  effectiveDateTime: string;  // ISO timestamp of the assessment
  vitals: { systolic?, diastolic?, hr?, rr?, spo2?, temp?, weight?, height? };
  chiefComplaint?: string;
  clinicalHistory?: string;
  diagnosis?: { code?: string; display?: string; text?: string };  // SNOMED
  treatment?: string;
}
```

### What gets written — one transaction Bundle
All entries reference the **Patient** (`subject`) and the **Encounter**
(`encounter`). Resources are only emitted for data that was actually entered.

| Resource | When | Key coding |
|---|---|---|
| `Encounter` | always | `status: finished`, `class: AMB`, `participant[].individual` = doctor (`ATND`), `serviceProvider` = org |
| `Observation` (BP panel) | systolic/diastolic given | LOINC `85354-9` with components `8480-6` / `8462-4` |
| `Observation` (each vital) | value given | HR `8867-4`, RR `9279-1`, SpO₂ `2708-6`, Temp `8310-5`, Weight `29463-7`, Height `8302-2` (LOINC + UCUM) |
| `Condition` (chief complaint) | complaint/history given | category `problem-list-item`; history in `note[]` |
| `Condition` (diagnosis) | code/text given | category `encounter-diagnosis`; `code.coding` = SNOMED, `verificationStatus: provisional` |
| `Procedure` (treatment) | treatment given | SNOMED `416608005` (Drug therapy) + free-text `note[]` |

> Bundle-internal references use `urn:uuid:<crypto.randomUUID()>` (server enforces
> valid lowercase UUIDs). The `Encounter` fullUrl is the link target for every
> clinical entry's `encounter` field.

### Retrieval (read back a patient's clinical data)
`GET /api/clinical-assessment?patient=<id>` returns:
```json
{ "encounters": [...], "observations": [...], "conditions": [...], "procedures": [...] }
```
(each sorted latest-first). The assessment page's "Recorded Clinical Data" panel
uses this.

---

## 3.5 Step 3 — New Referral from an existing patient

**UI:** `src/app/submit/page.tsx`
**Builder:** `src/lib/buildBundle.ts` → `buildReferralBundle(input, requester, receiving)`
**Submit:** transaction Bundle POSTed to the FHIR root (`submitTransaction`).

Instead of typing patient details, the referrer **picks an existing patient**.
The page references it by id and prefills the rest:

| Group | Source | Editable? |
|---|---|---|
| Demographics (name, sex, DoB, IDs, address, next of kin) | selected `Patient` | **read-only** |
| Vitals (BP, HR, RR, SpO₂, temp, weight) | latest `Observation`s (`latestVitals`) | **editable** — referrer updates to the latest |
| Chief complaint / clinical history | latest `Condition` (`problem-list-item`) | editable |
| Impression / diagnosis | latest `Condition` (`encounter-diagnosis`) | editable |
| Receiving facility, category, service type | form selection | editable |

### Key difference from triage
`ClinicalInput` gained an optional `patientId`. When set, `buildReferralBundle`:
- sets every `subject`/`for` to the literal `Patient/<id>`, and
- **does not emit a Patient entry** (no re-create/upsert).

When `patientId` is empty the original manual-entry path runs unchanged (builds +
upserts a Patient by PhilSys/PhilHealth), so nothing else breaks.

> Two different bundle builders — don't mix them up:
> - `clinical-assessment.ts` → light Encounter + clinical Bundle (doctor's visit).
> - `buildBundle.ts` → the full IG-aligned eReferral Bundle (`ana-reyes-bundle.json`),
>   which also creates `ServiceRequest`, `Task`, `Provenance`, `DiagnosticReport`.

---

## 4. Resource relationship map

```
Organization (pre-existing)
     ▲ managingOrganization (triage)        ▲ serviceProvider
     │                                       │
  Patient ───────────────────────────────► Encounter
     ▲ subject            subject ▲          ▲ encounter
     │                            │          │
     │            ┌───────────────┼──────────┴───────────────┐
     │            │               │                          │
  Observation   Condition      Condition                 Procedure
  (vitals)      (complaint)    (diagnosis)               (treatment)
                                         ▲ participant.individual
                                         │
                                   Practitioner (doctor)

  Step 3 (referral) adds, all referencing the same Patient/<id>:
     ServiceRequest ──focus── Task ──> receiving Organization / PractitionerRole
            ▲ target
       Provenance (author signature)        DiagnosticReport (labs)
```

---

## 5. Integration notes / hooks

- **Get a patient's id after triage:** the create/edit response is the saved
  `Patient`; use its `id` to deep-link to `/admin/patients/<id>/assessment`.
- **Reuse the builders directly** (they're pure, no React/network):
  - `buildPatient(form)` → `src/lib/patient-registration.ts`
  - `buildClinicalBundle(input)` → `src/lib/clinical-assessment.ts`
  Both are unit-tested in `src/lib/__tests__/`.
- **Tie into the referral flow:** the eReferral transaction bundle
  (`src/lib/referral.ts`) already builds Patient + clinical resources with the
  *same codings*, so data captured here lines up with what a referral expects
  (chief complaint, impression, vitals, treatment).
- **New referral reuses the triaged patient by reference:** select the patient on
  `/submit`; demographics prefill read-only, and you update the **vitals** to the
  latest readings before submitting. The bundle references `Patient/<id>` and does
  not re-create it (set via `ClinicalInput.patientId`).
- **Whole-record fetch:** for a full clinical picture use the FHIR patient
  compartment — `Patient/<id>/$everything` (`patientEverything()` in
  `src/lib/fhir.ts`) — instead of the per-type calls.
- **What's NOT modelled yet** (extend if needed): a triage-acuity/ESI level
  `Observation`, `RelatedPerson` for next of kin (currently inline `Patient.contact`),
  and PSGC-coded address extensions (currently plain text address).

---

## 6. File index

| Concern | File |
|---|---|
| Triage UI | `src/app/admin/patients/page.tsx` |
| Triage builder | `src/lib/patient-registration.ts` |
| Patient API (CRUD) | `src/app/api/patient/route.ts` |
| Assessment UI | `src/app/admin/patients/[id]/assessment/page.tsx` |
| Clinical builder | `src/lib/clinical-assessment.ts` |
| Clinical API | `src/app/api/clinical-assessment/route.ts` |
| Referral UI (select patient) | `src/app/submit/page.tsx` |
| Referral builder | `src/lib/buildBundle.ts` (`ClinicalInput.patientId`) |
| Tests | `src/lib/__tests__/patient-registration.test.ts`, `clinical-assessment.test.ts`, `buildBundle.test.ts` |
| Nav | `src/app/admin/page.tsx`, `src/components/AppShell.tsx` |
