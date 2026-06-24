# ER Disposition Architecture — Clinical Profile → Final Disposition

Technical data flow for the transition from the **Clinical Profile** stage to the
final **Patient Disposition** stage of an ER encounter. Mirrors the implementation
in `src/app/admin/clinical-update/[encounterId]/page.tsx`,
`src/lib/clinical-assessment.ts`, and `src/lib/disposition.ts`.

Two persistence models are documented in parallel:
- **FHIR R4** — the live system of record (transaction Bundles).
- **Relational** — PostgreSQL DDL + transaction blocks for a local store.

> FHIR `Encounter.status` has **no** `completed`/`transferred`/`admitted` codes
> (valid: `planned | arrived | triaged | in-progress | onleave | finished |
> cancelled | entered-in-error | unknown`). Finalization therefore uses
> `status = "finished"` **plus** `hospitalization.dischargeDisposition` to express
> *how* the visit ended.

---

## 1. Workflow Architecture (step-by-step)

```
 ┌────────────────────┐   ┌─────────────────────┐   ┌──────────────────┐   ┌────────────────────────────┐
 │ 1. SAVE CLINICAL   │──▶│ 2. STATUS =         │──▶│ 3. DISPOSITION   │──▶│ 4. FINALIZE                │
 │    PROFILE         │   │    'in-progress'    │   │    MENU          │   │  discharge/transfer/admit  │
 │ HPI,PMH,exam,      │   │ (awaiting decision) │   │ (doctor selects) │   │  status = 'finished'       │
 │ allergies, meds    │   │                     │   │                  │   │  (+ new inpatient on admit)│
 └────────────────────┘   └─────────────────────┘   └──────────────────┘   └────────────────────────────┘
          │  one transaction (1+2 atomic)                                           │  one transaction (4 atomic)
          ▼                                                                         ▼
   clinical resources + Encounter.status='in-progress'              Encounter finished (+ inpatient Encounter)
```

### Step 1 — Save Clinical Profile
Persist the doctor's findings, all linked to the open ER `Encounter` and the `Patient`:

| Finding | FHIR resource | Notes |
|---|---|---|
| History of Present Illness (HPI) | `Condition` (`problem-list-item`) + `Condition.note` | chief complaint + narrative |
| Past Medical History (PMH) | `Condition` (`problem-list-item`, `clinicalStatus: inactive/resolved`) | one per problem |
| Physical exam findings | `Observation` (category `exam`) | per finding |
| Working impression | `Condition` (`encounter-diagnosis`, SNOMED) | REF-41 |
| Treatment / lab | `Procedure` / `DiagnosticReport` | REF-39 / REF-40 |
| Allergies | `AllergyIntolerance` | substance + reaction (extension point) |
| Active medications | `MedicationStatement` (`status: active`) | drug + dosage (extension point) |

App builder: `buildClinicalBundle({ existingEncounterId, chiefComplaint, clinicalHistory,
diagnosis, treatment, diagnostic, … })` → POST `/api/clinical-assessment` (transaction).

### Step 2 — Set Encounter status to 'in-progress'  ⚠️ crucial
**Immediately after** the clinical profile is saved, the encounter must read
`status = 'in-progress'` (the patient is being actively managed while awaiting a
decision). This is done **in the same transaction** as Step 1 so the two never
diverge:

```ts
const bundle = buildClinicalBundle({ existingEncounterId: encId, … });
bundle.entry.push(encounterStatusEntry(encounter, "in-progress")); // PUT Encounter/<id>
// → POST the single transaction Bundle
```

### Step 3 — Trigger Disposition Menu
A UI action (`DISPOSITIONS` → Discharge / Transfer / Admit) presented once the
clinical profile is saved and `status = 'in-progress'`. No write occurs until the
doctor commits a choice.

### Step 4 — Finalize Encounter via Disposition
`buildDispositionBundle(encounter, patientId, choice)` → one transaction Bundle:

| Choice | ER Encounter | Extra |
|---|---|---|
| **Discharge** | `status: finished`, `period.end = now` | `hospitalization.dischargeDisposition = home` |
| **Transfer** | `status: finished`, `period.end = now` | `hospitalization.dischargeDisposition = other-hcf`, text "Transferred to another facility" |
| **Admit** | `status: finished`, `period.end = now`, disposition text "Admitted as inpatient" | **+ a NEW** `Encounter` (`class: IMP`, `status: in-progress`, `subject = same Patient`, `partOf = ER Encounter`) created **in the same atomic Bundle** |

---

## 2. Database & Data Integrity

### 2.1 Schema (PostgreSQL)

```sql
CREATE TYPE encounter_status AS ENUM
  ('planned','arrived','triaged','in-progress','onleave','finished','cancelled');

CREATE TABLE encounters (
    encounter_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id            UUID NOT NULL,
    status                encounter_status NOT NULL DEFAULT 'triaged',
    encounter_class       VARCHAR(10) NOT NULL DEFAULT 'EMER',   -- EMER (ER) | IMP (inpatient)
    encounter_type        VARCHAR(60),
    part_of_encounter_id  UUID,                                   -- inpatient → its originating ER visit
    origin_org_id         VARCHAR(64),
    service_provider_id   VARCHAR(64),
    discharge_disposition VARCHAR(20),                            -- home | other-hcf | oth | ...
    disposition_note      TEXT,                                   -- e.g. 'transferred' / 'admitted as inpatient'
    period_start          TIMESTAMPTZ NOT NULL DEFAULT now(),
    period_end            TIMESTAMPTZ,                            -- set when status → finished
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_enc_patient  FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE RESTRICT,
    CONSTRAINT fk_enc_partof   FOREIGN KEY (part_of_encounter_id) REFERENCES encounters (encounter_id) ON DELETE RESTRICT,
    -- A finished encounter must record an end time and how it ended.
    CONSTRAINT chk_finished_complete CHECK (
        status <> 'finished' OR (period_end IS NOT NULL AND discharge_disposition IS NOT NULL)
    )
);

CREATE INDEX ix_enc_patient_id ON encounters (patient_id);
CREATE INDEX ix_enc_status     ON encounters (status);
CREATE INDEX ix_enc_partof     ON encounters (part_of_encounter_id);
```

### 2.2 Step 1 + 2 — save profile and flip status (atomic)

```sql
BEGIN;
    -- clinical findings (HPI/PMH/exam/allergies/meds) inserted here …
    INSERT INTO conditions          (...) VALUES (...);
    INSERT INTO allergy_intolerances(...) VALUES (...);
    INSERT INTO medication_statements(...) VALUES (...);

    -- crucial: maintain the open status in the SAME transaction
    UPDATE encounters
       SET status = 'in-progress', updated_at = now()
     WHERE encounter_id = :er_id;
COMMIT;        -- any failure ⇒ ROLLBACK ⇒ neither the findings nor the status flip persist
```

### 2.3 Step 4 — finalize (Discharge / Transfer)

```sql
-- Discharge
UPDATE encounters
   SET status = 'finished', period_end = now(),
       discharge_disposition = 'home', updated_at = now()
 WHERE encounter_id = :er_id;

-- Transfer
UPDATE encounters
   SET status = 'finished', period_end = now(),
       discharge_disposition = 'other-hcf', disposition_note = 'transferred', updated_at = now()
 WHERE encounter_id = :er_id;
```

### 2.4 Step 4 — Admit (atomic: finish ER **and** open inpatient)

The risky case: closing the ER visit and opening the inpatient visit must be
**all-or-nothing**, or we risk a finished ER with no admission (lost patient) or
an inpatient record with the ER left open (double-active). Wrap both in one
transaction:

```sql
BEGIN;
    -- 1) finish the ER encounter
    UPDATE encounters
       SET status = 'finished', period_end = now(),
           discharge_disposition = 'oth', disposition_note = 'admitted as inpatient',
           updated_at = now()
     WHERE encounter_id = :er_id
       AND status <> 'finished';          -- optimistic guard against double-finalize

    -- 2) open the inpatient encounter for the same patient, linked to the ER visit
    INSERT INTO encounters (patient_id, status, encounter_class, encounter_type,
                            part_of_encounter_id, service_provider_id, period_start)
    SELECT patient_id, 'in-progress', 'IMP', 'Hospital admission',
           :er_id, service_provider_id, now()
      FROM encounters
     WHERE encounter_id = :er_id
    RETURNING encounter_id;               -- :inpatient_id
COMMIT;        -- error in either step ⇒ ROLLBACK ⇒ no orphaned/mismatched records
```

**FHIR equivalent** (atomic by definition — a `transaction` Bundle is applied
whole or not at all):

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    { "request": { "method": "PUT", "url": "Encounter/19864" },
      "resource": { "resourceType": "Encounter", "id": "19864", "status": "finished",
        "period": { "start": "…", "end": "…" },
        "hospitalization": { "dischargeDisposition": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/discharge-disposition", "code": "oth" }], "text": "Admitted as inpatient" } } } },
    { "request": { "method": "POST", "url": "Encounter" },
      "resource": { "resourceType": "Encounter", "status": "in-progress",
        "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "IMP", "display": "inpatient encounter" },
        "type": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "32485007", "display": "Hospital admission" }] }],
        "subject": { "reference": "Patient/19862" },
        "partOf": { "reference": "Encounter/19864" },
        "period": { "start": "…" } } }
  ]
}
```

### 2.5 Integrity rules summary

| Concern | Mechanism |
|---|---|
| Profile save & status flip diverge | Both in one transaction (FHIR Bundle / SQL `BEGIN…COMMIT`) |
| Orphaned/mismatched admit | ER-finish + inpatient-create in one atomic transaction |
| Double finalization | `WHERE status <> 'finished'` optimistic guard / re-check status before disposition |
| ER ↔ inpatient linkage | `Encounter.partOf` / `part_of_encounter_id` FK to the same patient |
| Finished completeness | `CHECK (status<>'finished' OR (period_end AND discharge_disposition))` |
| Referential safety | FKs `ON DELETE RESTRICT`; index every FK |

---

## 3. Implementation map

| Phase | Code |
|---|---|
| 1 Save clinical profile | `buildClinicalBundle()` (`existingEncounterId`) · `src/lib/clinical-assessment.ts` |
| 2 Status → in-progress | `encounterStatusEntry()` appended to the save bundle · `src/lib/disposition.ts` |
| 3 Disposition menu | `DISPOSITIONS` + UI · `src/app/admin/clinical-update/[encounterId]/page.tsx` |
| 4 Finalize | `buildDispositionBundle()` → POST `/api/clinical-assessment` (transaction) |
| Tests | `src/lib/__tests__/disposition.test.ts` |
