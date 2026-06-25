"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import ReferralDetailView from "@/components/ReferralDetailView";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";

export default function IncomingReferralDetailPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const params = useParams();
  const serviceRequestId = params.id as string;

  const [sr, setSr] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user && serviceRequestId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, serviceRequestId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const srResource = await fhirGet(`ServiceRequest/${serviceRequestId}`);
      if (!srResource) throw new Error("ServiceRequest not found");
      setSr(srResource);
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  const refId = sr?.identifier?.[0]?.value || sr?.id || serviceRequestId;

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Incoming Referrals", href: "/ereferral/incoming" },
          { label: refId },
        ]}
        title={`Referral: ${refId}`}
      />

      {loading && !sr && <div className="loading">Loading referral…</div>}
      {error && <div className="alert err">❌ {error}</div>}

      {sr && (
        <ReferralDetailView
          sr={sr}
          onBack={() => router.push("/ereferral/incoming")}
          showActions={true}
          defaultTab="clinical"
        />
      )}
    </>
  );
}
