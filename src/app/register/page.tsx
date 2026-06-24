"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings-context";
import { fhirGet, FhirError } from "@/lib/fhir";
import { roleCoding, DEFAULT_ROLE_OPTION, fetchRoleCodes, type RoleOption } from "@/lib/practitioner-roles";

export default function RegisterPage() {
  const router = useRouter();
  const { baseUrl } = useSettings();
  const [step, setStep] = useState<"practitioner" | "account">("practitioner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  
  // Practitioner form
  const [practitionerForm, setPractitionerForm] = useState({
    givenName: "",
    familyName: "",
    prcLicense: "",
    organizationId: "",
    active: true,
  });
  
  // Account form
  const [accountForm, setAccountForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  
  const [createdPractitionerId, setCreatedPractitionerId] = useState<string | null>(null);
  const [createdOrganizationId, setCreatedOrganizationId] = useState<string | null>(null);
  const [role, setRole] = useState<RoleOption>(DEFAULT_ROLE_OPTION);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([DEFAULT_ROLE_OPTION]);

  useEffect(() => {
    loadOrganizations();
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    fetchRoleCodes(baseUrl).then(setRoleOptions).catch(() => {});
  }, [baseUrl]);

  async function loadOrganizations() {
    try {
      const bundle = await fhirGet("Organization?_sort=name&_count=100", baseUrl);
      setOrganizations(
        (bundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Organization")
      );
    } catch (e) {
      console.error("Failed to load organizations:", e);
    }
  }

  async function handleCreatePractitioner(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    if (!practitionerForm.organizationId) {
      setError("Organization is required");
      setLoading(false);
      return;
    }
    
    try {
      const identifiers = [];
      if (practitionerForm.prcLicense) {
        identifiers.push({
          system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number",
          value: practitionerForm.prcLicense,
        });
      }

      const practitioner = {
        resourceType: "Practitioner",
        identifier: identifiers,
        active: practitionerForm.active,
        name: [{
          use: "official",
          family: practitionerForm.familyName,
          given: [practitionerForm.givenName],
          prefix: ["Dr."],
        }],
        telecom: [{
          system: "phone",
          value: "+63-917-111-2233",
          use: "work"
        }],
      };
      
      const response = await fetch("/api/practitioner", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(practitioner),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create practitioner");
      }

      const createdPractitioner = data;
      setCreatedPractitionerId(createdPractitioner.id);
      setCreatedOrganizationId(practitionerForm.organizationId);

      // Create PractitionerRole
      if (createdPractitioner && createdPractitioner.id) {
        const roleId = `ROLE-${practitionerForm.prcLicense || Date.now()}`;
        const practitionerRole = {
          resourceType: "PractitionerRole",
          identifier: [{
            system: "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id",
            value: roleId,
          }],
          active: practitionerForm.active,
          practitioner: { reference: `Practitioner/${createdPractitioner.id}` },
          organization: { reference: `Organization/${practitionerForm.organizationId}` },
          code: [{ coding: [roleCoding(role)] }],
        };

        const roleResponse = await fetch("/api/practitioner-role", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
          body: JSON.stringify(practitionerRole),
        });

        if (!roleResponse.ok) {
          throw new Error("Failed to create practitioner role");
        }
      }

      setStep("account");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    if (accountForm.password !== accountForm.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }
    
    if (accountForm.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accountForm.email,
          password: accountForm.password,
          role: "practitioner",
          practitionerId: createdPractitionerId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || "Failed to create account");
        setLoading(false);
        return;
      }
      
      // Redirect to login page
      router.push("/login?registered=true");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          PH eReferral <span>Practitioner Registration</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {step === "practitioner" 
            ? "Step 1: Create your practitioner profile" 
            : "Step 2: Create your account"}
        </p>

        {error && <div className="alert err">{error}</div>}

        {step === "practitioner" ? (
          <form onSubmit={handleCreatePractitioner}>
            <div className="field">
              <label>Given Name</label>
              <input
                value={practitionerForm.givenName}
                onChange={(e) => setPractitionerForm({ ...practitionerForm, givenName: e.target.value })}
                placeholder="e.g. Juan"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>Family Name</label>
              <input
                value={practitionerForm.familyName}
                onChange={(e) => setPractitionerForm({ ...practitionerForm, familyName: e.target.value })}
                placeholder="e.g. Dela Cruz"
                required
              />
            </div>
            <div className="field">
              <label>PRC License (optional)</label>
              <input
                value={practitionerForm.prcLicense}
                onChange={(e) => setPractitionerForm({ ...practitionerForm, prcLicense: e.target.value })}
                placeholder="e.g. 123456"
              />
            </div>
            <div className="field">
              <label>Organization (required)</label>
              <select
                value={practitionerForm.organizationId}
                onChange={(e) => setPractitionerForm({ ...practitionerForm, organizationId: e.target.value })}
                required
              >
                <option value="">Select an organization…</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Practitioner Role (required)</label>
              <select
                value={role.code}
                onChange={(e) => setRole(roleOptions.find((r) => r.code === e.target.value) ?? DEFAULT_ROLE_OPTION)}
                required
              >
                {roleOptions.map((r) => (
                  <option key={r.code} value={r.code}>{r.display}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="block" disabled={loading}>
              {loading ? "Creating Profile…" : "Continue to Account Setup"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateAccount}>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={accountForm.email}
                onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                placeholder="Enter your email"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={accountForm.password}
                onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                placeholder="Choose a password (min 6 characters)"
                required
              />
            </div>
            <div className="field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={accountForm.confirmPassword}
                onChange={(e) => setAccountForm({ ...accountForm, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                required
              />
            </div>
            <div className="row">
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setStep("practitioner")}
                disabled={loading}
              >
                Back
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Creating Account…" : "Complete Registration"}
              </button>
            </div>
          </form>
        )}

        <p className="muted login-note">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  );
}
