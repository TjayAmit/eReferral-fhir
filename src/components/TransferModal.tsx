"use client";

import { useState } from "react";
import Modal from "./Modal";

export const TRANSFER_SERVICE_TYPES = [
  { code: "71388002", display: "Procedure" },
  { code: "386661006", display: "Fever" },
  { code: "422587007", display: "Nausea" },
  { code: "267038003", display: "Edema" },
  { code: "301717006", display: "Hypertensive disorder" },
  { code: "398254007", display: "Pre-eclampsia" },
  { code: "14094001", display: "Severe pre-eclampsia" },
  { code: "16114001", display: "Fetal distress" },
  { code: "48782003", display: "Diabetes mellitus" },
  { code: "38341003", display: "Hypertension" },
];

export type TransferPayload = {
  serviceType: { code: string; display: string };
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
  const [serviceTypeCode, setServiceTypeCode] = useState(TRANSFER_SERVICE_TYPES[0].code);
  const [note, setNote] = useState("");

  const selectedType = TRANSFER_SERVICE_TYPES.find((t) => t.code === serviceTypeCode) || TRANSFER_SERVICE_TYPES[0];

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    onConfirm({ serviceType: selectedType, note: note.trim() });
    setServiceTypeCode(TRANSFER_SERVICE_TYPES[0].code);
    setNote("");
  }

  function handleClose() {
    setServiceTypeCode(TRANSFER_SERVICE_TYPES[0].code);
    setNote("");
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Initiate Patient Transfer">
      <form onSubmit={handleConfirm}>
        <div className="field">
          <label htmlFor="transfer-service-type">Reason for referral (service type)</label>
          <select
            id="transfer-service-type"
            value={serviceTypeCode}
            onChange={(e) => setServiceTypeCode(e.target.value)}
          >
            {TRANSFER_SERVICE_TYPES.map((t) => (
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
