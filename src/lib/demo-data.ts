// Demo fixtures used to pre-fill triage / clinical forms when the
// "Use Demo Data" setting is enabled (Ana Reyes — severe pre-eclampsia case).
// Blank counterparts are the real empty-form defaults.

import type { PatientFormData } from "./patient-registration";

export const BLANK_PATIENT_FORM: PatientFormData = {
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

export const DEMO_PATIENT_FORM: PatientFormData = {
  philhealth: "78-658064775-3",
  philsys: "7731-0812-4491-0326",
  givenName: "Ana Luisa",
  familyName: "Reyes",
  gender: "female",
  birthDate: "1988-03-12",
  phone: "+63-919-876-5432",
  addressLine: "Area 4, Barangay Mabuhay",
  barangay: "Poblacion",
  city: "Kalibo",
  province: "Aklan",
  postalCode: "5600",
  nextOfKin: { relationship: "HUSB", givenName: "Roberto", familyName: "Reyes", phone: "" },
  active: true,
};

export type VitalsForm = {
  systolic: string; diastolic: string; hr: string; rr: string;
  spo2: string; temp: string; weight: string; height: string;
};

export const BLANK_VITALS: VitalsForm = {
  systolic: "", diastolic: "", hr: "", rr: "", spo2: "", temp: "", weight: "", height: "",
};

export const DEMO_VITALS: VitalsForm = {
  systolic: "180", diastolic: "110", hr: "112", rr: "24", spo2: "96", temp: "36.8", weight: "72", height: "",
};

export type ClinicalForm = {
  chiefComplaint: string; clinicalHistory: string;
  dxCode: string; dxDisplay: string; dxText: string;
  treatment: string; labTitle: string; labConclusion: string;
};

export const BLANK_CLINICAL: ClinicalForm = {
  chiefComplaint: "", clinicalHistory: "",
  dxCode: "", dxDisplay: "", dxText: "",
  treatment: "", labTitle: "", labConclusion: "",
};

export const DEMO_CLINICAL: ClinicalForm = {
  chiefComplaint: "Severe headache, dizziness, blurring of vision and epigastric pain for 2 days",
  clinicalHistory: "G2P1, 32 weeks AOG. EDD: Aug 20 2026. LMP: Nov 13 2025.",
  dxCode: "398254007",
  dxDisplay: "Pre-eclampsia",
  dxText: "Severe pre-eclampsia, 32 weeks AOG, G2P1",
  treatment: "Pre-referral treatment given: Methyldopa 250mg BID, Folic Acid 5mg OD, FeSO4 300mg OD, CaCO3 500mg TID.",
  labTitle: "Urinalysis Results",
  labConclusion: "Proteinuria 3+. Findings consistent with severe pre-eclampsia.",
};
