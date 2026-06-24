"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { FHIR_BASE } from "@/lib/fhir";

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  // Already signed in → skip the login page.
  useEffect(() => {
    if (ready && user) {
      router.replace(user.practitionerId ? "/" : "/admin");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccess(true);
      router.replace("/login");
    }
  }, [searchParams, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const u = await login(email.trim(), password);
    setBusy(false);
    if (!u) {
      setError("Invalid email or password.");
      return;
    }
    // Practitioners have a practitionerId; admin does not.
    router.replace(u.practitionerId ? "/" : "/admin");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          PH eReferral <span>Track 1</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Sign in to continue</p>

        {success && (
          <div className="alert" style={{ backgroundColor: "#d4edda", color: "#155724" }}>
            ✓ Registration successful! Please sign in with your new account.
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. doctor@example.com"
            autoFocus
            disabled={busy}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
          />
        </div>

        {error && <div className="alert err">{error}</div>}

        <button type="submit" className="block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="muted login-note">
          Demo gate only. Admin login: email <code>admin</code> · password <code>@admin123</code>. Practitioners log in with their email.
        </p>

        <p className="muted">
          New practitioner? <a href="/register">Register here</a>
        </p>
      </form>
    </div>
  );
}
