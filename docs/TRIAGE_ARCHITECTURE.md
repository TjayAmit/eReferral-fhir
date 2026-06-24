# Triage Data-Flow Architecture — Patient → Encounter → Vitals

**Scope:** the four phases of emergency triage capture — Patient Search/Match,
Patient Save/Update, Encounter Creation, Vitals (Observation) Recording — including
the "vitals not fetched" path for clinical emergencies. Mirrors the implementation
in `src/app/admin/patients/new/page.tsx`, `src/lib/patient-registration.ts`, and
`src/lib/clinical-assessment.ts`.

Two persistence models are documented in parallel:
- **FHIR R4** (the live system of record — HL7 transaction Bundle).
- **Relational** (PostgreSQL DDL) — for a local cache / reporting store.

---

## 1. Workflow Architecture (step-by-step)

```
 ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐
 │ 1. SEARCH /  │──▶│ 2. SAVE /     │──▶│ 3. CREATE        │──▶│ 4. SAVE VITALS    │
 │    MATCH     │   │    UPDATE     │   │    ENCOUNTER     │   │   (Observation)   │
 │  (no write)  │   │  → patient_id │   │  → encounter_id  │   │  value | absent   │
 └──────────────┘   └───────────────┘   └──────────────────┘   └──────────────────┘
        │  prevent dups        │ upsert            │ FK patient_id        │ FK patient_id + encounter_id
        ▼                      ▼                    ▼                      ▼
   candidate list        Patient record       Encounter (In-Progress,   Observation rows OR
                                               Emergency Triage)         dataAbsentReason
```

Steps **3 + 4 run inside ONE transaction** (a FHIR transaction Bundle / a SQL
`BEGIN…COMMIT`). If vitals fail, the encounter is rolled back — **no orphan encounter**.

### Step 1 — Patient Search / Match
Goal: find an existing record before creating, to prevent duplicates.

- **Deterministic (authoritative):** exact match on a national identifier —
  `PhilHealth ID` or `PhilSys ID`. A hit is treated as the same person.
  - FHIR: `GET Patient?identifier=<system>|<value>`
  - SQL: unique index on `(identifier_system, identifier_value)`.
- **Probabilistic (fuzzy):** when no ID match, score candidates on
  `family + given + birthDate` (and optionally address/phone). Practical scoring:
  - normalize (lowercase, strip punctuation), compare with trigram / Levenshtein
    similarity on names, exact on `birthDate`.
  - Threshold → present ranked candidates to the clerk; **human confirms** the match.
  - SQL: `pg_trgm` GIN index on names enables `name % :query` similarity search.
- **Output:** either a chosen existing `patient_id`, or "no match → create new".
- **No writes occur in this step.**

> In the UI this is the search box at the top of Section 1; matching IDs/name/DOB
> surface candidates, and "Use →" prefills the form for an update.

### Step 2 — Save / Update Patient
Goal: persist demographics and obtain a stable `patient_id`.

- **Create:** INSERT a new `patients` row; DB generates `patient_id` (UUID).
  - FHIR: conditional create/update `PUT Patient?identifier=<philhealth-system>|<value>`
    (idempotent upsert — re-submitting the same ID updates, never duplicates).
- **Update:** existing match → `PUT Patient/{id}` (FHIR) / `UPDATE patients … WHERE patient_id = …`.
- **Integrity:** at least one identifier (PhilHealth or PhilSys) is required;
  `managing_organization_id` (the triage facility) is mandatory.
- **Output:** `patient_id` — the FK used by every downstream record.
- This is the **dedicated "Save Patient" button**; it commits independently and
  unlocks Step 3/4.

### Step 3 — Create Encounter
Goal: open the visit and bind it to the patient.

- INSERT `encounters` row; DB generates `encounter_id` (UUID).
- Fixed semantics for triage:
  - `status = 'in-progress'`
  - `type = 'Emergency Triage'` (SNOMED `225390008` *Triage*)
  - `class = 'EMER'` (HL7 v3 ActCode — emergency)
  - `patient_id` **FK → patients** (`ON DELETE RESTRICT` — cannot orphan).
  - `service_provider_id` = triage organization; `period_start = now()`.
- FHIR: `POST Encounter` inside the transaction Bundle, `subject → Patient`.

### Step 4 — Save Vitals (Observation)
Goal: record clinical parameters, or formally record their **absence**.

- Each vital → one `vitals_observations` row, FK to **both** `patient_id` and
  `encounter_id`. Values are **nullable**.
- **Conditional logic — vitals not fetched (emergency):**
  - Do **not** invent zeros. Insert (or keep) a row with all measurement columns
    `NULL` and set `exception_reason` (e.g. `not-performed`, `unavailable`,
    `asked-declined`).
  - FHIR equivalent: a value-less `Observation` (category `vital-signs`) carrying
    `dataAbsentReason` (CodeSystem `…/data-absent-reason`, e.g. `not-performed`)
    — **no** `valueQuantity`/`component`.
- **Atomicity:** Steps 3+4 are one transaction. On any failure → `ROLLBACK`
  (SQL) / the FHIR transaction Bundle is all-or-nothing, so a failed Observation
  voids the Encounter. No orphaned encounter.

---

## 2. Relational Database Schema (PostgreSQL DDL)

```sql
-- Extensions used for matching / UUIDs ------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy name matching

-- ── patients ─────────────────────────────────────────────────────────────
CREATE TABLE patients (
    patient_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    philhealth_id         VARCHAR(32),
    philsys_id            VARCHAR(32),
    family_name           VARCHAR(120) NOT NULL,
    given_name            VARCHAR(120) NOT NULL,
    gender                VARCHAR(10)  NOT NULL DEFAULT 'unknown'
                          CHECK (gender IN ('male','female','other','unknown')),
    birth_date            DATE,
    phone                 VARCHAR(40),
    address_line          VARCHAR(200),
    barangay              VARCHAR(120),
    city                  VARCHAR(120),
    province              VARCHAR(120),
    postal_code           VARCHAR(12),
    managing_org_id       VARCHAR(64) NOT NULL,        -- triage facility (FHIR Organization id)
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- At least one national identifier is required (data integrity).
    CONSTRAINT patients_identifier_present
        CHECK (philhealth_id IS NOT NULL OR philsys_id IS NOT NULL)
);

-- Deterministic matching: national IDs must be unique when present.
CREATE UNIQUE INDEX ux_patients_philhealth ON patients (philhealth_id) WHERE philhealth_id IS NOT NULL;
CREATE UNIQUE INDEX ux_patients_philsys    ON patients (philsys_id)    WHERE philsys_id    IS NOT NULL;
-- Probabilistic matching: trigram indexes on names + exact birth_date.
CREATE INDEX ix_patients_family_trgm ON patients USING gin (family_name gin_trgm_ops);
CREATE INDEX ix_patients_given_trgm  ON patients USING gin (given_name  gin_trgm_ops);
CREATE INDEX ix_patients_birthdate   ON patients (birth_date);

-- ── encounters ───────────────────────────────────────────────────────────
CREATE TABLE encounters (
    encounter_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id            UUID NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'in-progress'
                          CHECK (status IN ('planned','in-progress','finished','cancelled')),
    encounter_class       VARCHAR(10) NOT NULL DEFAULT 'EMER',   -- HL7 v3 ActCode
    encounter_type        VARCHAR(40) NOT NULL DEFAULT 'Emergency Triage',
    type_code             VARCHAR(20),                            -- SNOMED 225390008
    service_provider_id   VARCHAR(64),
    period_start          TIMESTAMPTZ NOT NULL DEFAULT now(),
    period_end            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_encounter_patient
        FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
        ON DELETE RESTRICT                                        -- never orphan / never silently lose
);

-- Index the FK for high-performance joins / patient-timeline queries.
CREATE INDEX ix_encounters_patient_id ON encounters (patient_id);
CREATE INDEX ix_encounters_status     ON encounters (status);

-- ── vitals_observations ──────────────────────────────────────────────────
CREATE TABLE vitals_observations (
    observation_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id            UUID NOT NULL,
    encounter_id          UUID NOT NULL,
    effective_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- All measurements NULLABLE (may be absent in an emergency).
    systolic_mmhg         NUMERIC(5,1),
    diastolic_mmhg        NUMERIC(5,1),
    heart_rate_bpm        NUMERIC(5,1),
    resp_rate_bpm         NUMERIC(5,1),
    spo2_pct              NUMERIC(5,1),
    temperature_c         NUMERIC(4,1),
    weight_kg             NUMERIC(5,1),
    height_cm             NUMERIC(5,1),
    -- Exception reason when vitals were not fetched (FHIR dataAbsentReason).
    exception_reason      VARCHAR(40)
                          CHECK (exception_reason IN
                                 ('not-performed','unavailable','asked-declined','error')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_obs_patient
        FOREIGN KEY (patient_id)   REFERENCES patients (patient_id)   ON DELETE RESTRICT,
    CONSTRAINT fk_obs_encounter
        FOREIGN KEY (encounter_id) REFERENCES encounters (encounter_id) ON DELETE CASCADE,
    -- Integrity: either at least one measurement OR an exception reason, never neither.
    CONSTRAINT obs_value_or_reason CHECK (
        exception_reason IS NOT NULL
        OR COALESCE(systolic_mmhg, diastolic_mmhg, heart_rate_bpm, resp_rate_bpm,
                    spo2_pct, temperature_c, weight_kg, height_cm) IS NOT NULL
    )
);

-- Index both FKs for performance.
CREATE INDEX ix_obs_patient_id   ON vitals_observations (patient_id);
CREATE INDEX ix_obs_encounter_id ON vitals_observations (encounter_id);
```

### Transaction wrapper (Steps 3 + 4 — no orphaned encounters)

```sql
BEGIN;
    INSERT INTO encounters (patient_id, status, encounter_type, type_code)
    VALUES ($1, 'in-progress', 'Emergency Triage', '225390008')
    RETURNING encounter_id;            -- :enc

    -- Vitals present:
    INSERT INTO vitals_observations (patient_id, encounter_id, systolic_mmhg, diastolic_mmhg,
                                     heart_rate_bpm, spo2_pct, temperature_c)
    VALUES ($1, :enc, 150, 95, 88, 98, 37.1);

    -- OR vitals not fetched:
    -- INSERT INTO vitals_observations (patient_id, encounter_id, exception_reason)
    -- VALUES ($1, :enc, 'not-performed');
COMMIT;                                 -- any error above ⇒ ROLLBACK ⇒ encounter discarded
```

---

## 3. API Payload (HL7 FHIR transaction Bundle)

Both examples are **`type: "transaction"`** bundles — the server applies them
atomically (all-or-nothing). The Patient is a **conditional update** (idempotent
by PhilHealth); the Encounter and Observations are POSTed and bound via
`urn:uuid` references so they link in one round-trip.

### 3a. Vitals successfully recorded

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:patient-1",
      "request": { "method": "PUT", "url": "Patient?identifier=http://philhealth.gov.ph/fhir/Identifier/philhealth-id|12-345678901-2" },
      "resource": {
        "resourceType": "Patient",
        "identifier": [
          { "system": "http://philhealth.gov.ph/fhir/Identifier/philhealth-id", "value": "12-345678901-2" },
          { "system": "http://philsys.gov.ph/fhir/Identifier/philsys-id", "value": "1234-5678-9012-3456" }
        ],
        "name": [{ "use": "official", "family": "Santos", "given": ["Maria", "Carmela"] }],
        "gender": "female",
        "birthDate": "1988-03-12",
        "managingOrganization": { "reference": "Organization/16723", "display": "Kalibo Health Center" }
      }
    },
    {
      "fullUrl": "urn:uuid:encounter-1",
      "request": { "method": "POST", "url": "Encounter" },
      "resource": {
        "resourceType": "Encounter",
        "status": "in-progress",
        "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "EMER", "display": "emergency" },
        "type": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "225390008", "display": "Triage" }] }],
        "subject": { "reference": "urn:uuid:patient-1" },
        "participant": [{ "individual": { "reference": "Practitioner/16805" } }],
        "period": { "start": "2026-06-24T10:30:00+08:00" }
      }
    },
    {
      "fullUrl": "urn:uuid:obs-bp",
      "request": { "method": "POST", "url": "Observation" },
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel" }] },
        "subject": { "reference": "urn:uuid:patient-1" },
        "encounter": { "reference": "urn:uuid:encounter-1" },
        "effectiveDateTime": "2026-06-24T10:30:00+08:00",
        "component": [
          { "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic" }] },
            "valueQuantity": { "value": 150, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" } },
          { "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic" }] },
            "valueQuantity": { "value": 95, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" } }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:obs-hr",
      "request": { "method": "POST", "url": "Observation" },
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "8867-4", "display": "Heart rate" }] },
        "subject": { "reference": "urn:uuid:patient-1" },
        "encounter": { "reference": "urn:uuid:encounter-1" },
        "effectiveDateTime": "2026-06-24T10:30:00+08:00",
        "valueQuantity": { "value": 88, "unit": "beats/minute", "system": "http://unitsofmeasure.org", "code": "/min" }
      }
    }
  ]
}
```

### 3b. Vitals NOT fetched (clinical emergency) — `dataAbsentReason`

Same Patient + Encounter; the single Observation carries **no value** and a
`dataAbsentReason` instead of measurements.

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:encounter-1",
      "request": { "method": "POST", "url": "Encounter" },
      "resource": {
        "resourceType": "Encounter",
        "status": "in-progress",
        "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "EMER", "display": "emergency" },
        "type": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "225390008", "display": "Triage" }] }],
        "subject": { "reference": "Patient/19522" },
        "participant": [{ "individual": { "reference": "Practitioner/16805" } }],
        "period": { "start": "2026-06-24T10:30:00+08:00" }
      }
    },
    {
      "fullUrl": "urn:uuid:obs-absent",
      "request": { "method": "POST", "url": "Observation" },
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "85353-1", "display": "Vital signs panel" }] },
        "subject": { "reference": "Patient/19522" },
        "encounter": { "reference": "urn:uuid:encounter-1" },
        "effectiveDateTime": "2026-06-24T10:30:00+08:00",
        "dataAbsentReason": {
          "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/data-absent-reason", "code": "not-performed", "display": "Not performed (clinical emergency)" }]
        }
      }
    }
  ]
}
```

---

## 4. Data integrity & error handling summary

| Concern | Mechanism |
|---|---|
| Duplicate patients | Unique indexes on national IDs + trigram fuzzy search before create |
| Stable keys | UUID PKs (`gen_random_uuid()`); FHIR ids server-assigned |
| No orphaned encounters | Steps 3+4 in one transaction (SQL `BEGIN…COMMIT` / FHIR transaction Bundle = atomic) |
| FK performance | Indexes on every FK (`ix_encounters_patient_id`, `ix_obs_patient_id`, `ix_obs_encounter_id`) |
| Referential safety | `ON DELETE RESTRICT` patient→encounter/obs; `ON DELETE CASCADE` encounter→obs |
| Vitals absence | Nullable measurement columns + `exception_reason` / FHIR `dataAbsentReason`; `CHECK (value OR reason)` |
| Required data | `CHECK` at least one national identifier; `NOT NULL` managing org |

## 5. Implementation map

| Phase | Code |
|---|---|
| 1–2 Patient search/match + save | `src/app/admin/patients/new/page.tsx` (Section 1), `src/lib/patient-registration.ts` (`buildPatient`), `POST/PUT /api/patient` |
| 3–4 Encounter + Vitals (incl. not-fetched) | `src/app/admin/patients/new/page.tsx` (Section 2), `src/lib/clinical-assessment.ts` (`buildClinicalBundle`, `VITALS_NOT_FETCHED_REASONS`, `EMERGENCY_TRIAGE_TYPE`), `POST /api/clinical-assessment` (transaction) |
| Tests | `src/lib/__tests__/clinical-assessment.test.ts`, `patient-registration.test.ts` |
