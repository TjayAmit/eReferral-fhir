"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { expandValueSet } from "@/lib/fhir";

const REASON_FOR_REFERRAL_VS =
  "https://www.fhir.doh.gov.ph/pheref/ValueSet/reason-for-referral-service-type";

const FALLBACK_SERVICE_TYPES = [
  { code: "11429006", display: "Consultation", system: "http://snomed.info/sct" },
  { code: "165197003", display: "Diagnostics", system: "http://snomed.info/sct" },
  { code: "71388002", display: "Procedure", system: "http://snomed.info/sct" },
  { code: "3457005", display: "Others", system: "http://snomed.info/sct" },
];

export type ServiceTypeOption = { code: string; display: string; system: string };

export type TransferPayload = {
  serviceType: ServiceTypeOption;
  note: string;
};

export default function TransferModal({
  isOpen,
  onClose,
  onConfirm,
  disabled,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: TransferPayload) => void;
  disabled?: boolean;
}) {
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>(FALLBACK_SERVICE_TYPES);
  const [serviceTypeCode, setServiceTypeCode] = useState<string>(FALLBACK_SERVICE_TYPES[0].code);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [typesError, setTypesError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setTypesError(null);
    expandValueSet(REASON_FOR_REFERRAL_VS)
      .then((data) => {
        if (cancelled) return;
        const concepts: any[] = data?.expansion?.contains || [];
        if (concepts.length > 0) {
          const mapped = concepts.map((c: any) => ({
            code: String(c.code),
            display: String(c.display || c.code),
            system: String(c.system || "http://snomed.info/sct"),
          }));
          setServiceTypes(mapped);
          setServiceTypeCode(mapped[0].code);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTypesError(err instanceof Error ? err.message : String(err));
        // Keep fallback values already in state
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const selectedType = serviceTypes.find((t) => t.code === serviceTypeCode) || serviceTypes[0];

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    onConfirm({ serviceType: selectedType, note: note.trim() });
    setServiceTypeCode(serviceTypes[0]?.code || FALLBACK_SERVICE_TYPES[0].code);
    setNote("");
  }

  function handleClose() {
    setServiceTypeCode(serviceTypes[0]?.code || FALLBACK_SERVICE_TYPES[0].code);
    setNote("");
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Initiate Patient Transfer">
      <form onSubmit={handleConfirm}>
        <div className="field">
          <label htmlFor="transfer-service-type">Reason for referral (service type)</label>
          {typesError && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Could not load ValueSet — using fallback codes.
            </p>
          )}
          <select
            id="transfer-service-type"
            value={serviceTypeCode}
            onChange={(e) => setServiceTypeCode(e.target.value)}
            disabled={loading || disabled}
          >
            {serviceTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.display}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="transfer-note">Transfer note</label>
          <textarea
            id="transfer-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Destination facility, clinical details, urgency…"
          />
        </div>
        <div className="modal-footer" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={handleClose} disabled={disabled}>
            Cancel
          </button>
          <button type="submit" disabled={disabled}>
            {disabled ? "Confirming…" : "Confirm Transfer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
