# Demo Data — Triage → Doctor Assessment → New Referral

Walk-through data for a full demo, based on the IG sample case
(`../sample_case.json`, severe pre-eclampsia) but with a **new patient identity**.
Only the patient **name, PhilHealth ID and PhilSys ID** were changed — the clinical
case is unchanged.

| | Original (sample) | **Demo (use this)** |
|---|---|---|
| Name | Ana Luisa Reyes | **Maria Carmela Santos** |
| PhilHealth ID | 78-658064775-3 | **12-345678901-2** |
| PhilSys ID | 7731-0812-4491-0326 | **1234-5678-9012-3456** |

> Organizations must already exist on your FHIR server. The sample uses *Kalibo
> Health Center* (initiating) and *Dr. Rafael S. Tumbokon Memorial Hospital*
> (receiving). If those aren't present, pick any existing org from the dropdowns —
> the flow doesn't depend on the specific facility.

---

## STEP 1 — Triage  (`/admin/patients` → **Register Patient**)

**Triage Destination**
| Field | Value |
|---|---|
| Organization | Kalibo Health Center *(or any existing org)* |

**Demographics**
| Field | Value |
|---|---|
| Given Name | `Maria Carmela` |
| Family Name | `Santos` |
| Gender | `female` |
| Birth Date | `1988-03-12` |
| Mobile Phone | `+63-919-876-5432` |
| PhilHealth ID | `12-345678901-2` |
| PhilSys ID | `1234-5678-9012-3456` |

**Address**
| Field | Value |
|---|---|
| Street / Purok | `Area 4` |
| Barangay | `Barangay Mabuhay` |
| City / Municipality | `Kalibo` |
| Province | `Aklan` |
| Postal Code | `5600` |

**Next of Kin**
| Field | Value |
|---|---|
| Relationship | `Husband` |
| Given Name | `Roberto` |
| Family Name | `Santos` |
| Phone | `+63-918-111-2222` |

→ Saves a `Patient` (upsert by PhilHealth) with `managingOrganization` = the triage org.

---

## STEP 2 — Doctor Assessment  (`/admin/patients` → **Assess**)

| Field | Value |
|---|---|
| Attending Doctor | *select a practitioner* |
| Assessment Date/Time | *now* |

**Vital Signs**
| Field | Value |
|---|---|
| Systolic (mmHg) | `180` |
| Diastolic (mmHg) | `110` |
| Heart rate (/min) | `112` |
| Resp. rate (/min) | `24` |
| SpO₂ (%) | `96` |
| Temp (°C) | `36.8` |
| Weight (kg) | `72` |

**Assessment**
| Field | Value |
|---|---|
| Chief Complaint | `Severe headache, dizziness, blurring of vision and epigastric pain for 2 days` |
| Clinical History / Notes | `G2P1, 32 weeks AOG. EDD: Aug 20 2026. LMP: Nov 13 2025.` |

**Working Diagnosis**
| Field | Value |
|---|---|
| SNOMED Code | `398254007` |
| Display | `Pre-eclampsia` |
| Free-text | `Severe pre-eclampsia, 32 weeks AOG, G2P1` |

**Treatment Given**
| Field | Value |
|---|---|
| Treatment / Plan | `Pre-referral treatment given: Methyldopa 250mg BID, Folic Acid 5mg OD, FeSO4 300mg OD, CaCO3 500mg TID.` |

→ Creates one transaction Bundle: `Encounter` + 6 `Observation`s (BP panel + HR/RR/SpO₂/Temp/Weight) + 2 `Condition`s (complaint + diagnosis) + `Procedure`.

---

## STEP 3 — New Referral  (`/submit`)

> Log in as a **practitioner** account (not admin) — the requester practitioner /
> role / organization come from your session.

**Patient**
| Field | Value |
|---|---|
| Select existing patient | `Maria Carmela Santos` (PhilHealth 12-345678901-2) |

→ Demographics auto-fill **read-only**; vitals + impression **prefill from Step 2**.

**Refer To**
| Field | Value |
|---|---|
| Receiving organization | Dr. Rafael S. Tumbokon Memorial Hospital *(or any existing org)* |
| Receiving practitioner role | *select if available* |

**Referral**
| Field | Value |
|---|---|
| Referral category (REF-14) | `Emergency` |
| Date of Referral | *now* |
| Service type code (REF-16) | `71388002` |
| Service type display | `Procedure` |
| Reason text | `Severe pre-eclampsia requiring IV antihypertensive, seizure prophylaxis, and maternal-fetal monitoring` |
| Referral note | `Maria Carmela Santos, 38-year-old G2P1, 32 weeks AOG. BP 180/110 mmHg with severe headache, dizziness, and blurring of vision. Proteinuria 3+. Referred for urgent management of severe pre-eclampsia.` |

**Vital Signs** — prefilled from Step 2; update if newer readings exist
(e.g. recheck BP `170/105`).

**Clinical** — chief complaint / history / impression prefill from Step 2; adjust if needed.

**Laboratory (REF-40)**
| Field | Value |
|---|---|
| Conclusion | `Proteinuria 3+. Findings consistent with severe pre-eclampsia.` |
| Title | `Urinalysis Results` |

→ Submits the eReferral transaction Bundle. Because the patient was selected, the
bundle **references `Patient/<id>`** (no Patient re-created) and carries the latest
vitals.

---

## Quick reference — the three changed identifiers

```
Name        : Maria Carmela Santos
PhilHealth  : 12-345678901-2
PhilSys     : 1234-5678-9012-3456
```
