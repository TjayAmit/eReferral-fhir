import Link from "next/link";
import AppPageHeader from "@/components/AppPageHeader";

export default function ValueSetsPage() {
  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "ValueSets" },
        ]}
        title="ValueSets"
      />

      <div className="grid two">
        <Link href="/doh/valuesets/doh" className="card" style={{ textDecoration: "none" }}>
          <h2 style={{ marginTop: 0 }}>DOH ValueSets</h2>
          <p className="muted">View Philippines DOH-defined value sets for the eReferral workflow.</p>
        </Link>

        <Link href="/doh/valuesets/hl7" className="card" style={{ textDecoration: "none" }}>
          <h2 style={{ marginTop: 0 }}>HL7 ValueSets</h2>
          <p className="muted">View standard HL7 FHIR value sets used in the application.</p>
        </Link>
      </div>
    </>
  );
}
