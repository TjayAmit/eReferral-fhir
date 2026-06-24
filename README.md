# PH eReferral — Track 1 (Next.js)

Implements **Use Case 1** (submit the eReferral transaction Bundle) and **Use Case 2**
(retrieve the bundle + update action points) from the Connectathon README, against the
open FHIRLab sandbox. No backend or database — the FHIR server is the source of truth.

## Stack
- Next.js 14 (App Router) + TypeScript
- Direct browser → FHIR calls (sandbox is open + CORS-enabled)
- Sidebar shell + a client-side login gate

## Auth & layout
- `/login` gates the app. The FHIRLab sandbox needs no credentials, so this is a
  **demo-only** session in `localStorage` (any username/password works) — not a security
  boundary. Sign-out clears it.
- Authenticated routes render inside a sidebar shell (`AppShell`); unauthenticated visits
  redirect to `/login`.
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()`.
- `src/components/AppShell.tsx` — sidebar nav, user footer, auth redirect.

## Configure
`.env.local`:
```
NEXT_PUBLIC_FHIR_BASE_URL=https://cdr.pheref.fhirlab.net/fhir
```

## Run
```
npm install
npm run dev      # http://localhost:3000
```

## How it maps to the README ACs

| Page | Use Case | What it does | ACs |
|------|----------|--------------|-----|
| `/submit` | UC1 | Builds one `transaction` Bundle — PUT (conditional by identifier) for demographics/metadata, POST for clinical data — and `POST`s it to the server root. | 1.01–1.39 |
| `/inbox` | UC2 | `Task?status=requested` to discover; `Patient/{id}/$everything` to retrieve the whole referral as one Bundle; JSON-Patch on the Task for action points. | 2.01–2.39 |

### Element mapping (per README — authoritative)
- **Referral Category → `ServiceRequest.priority`** (AC 1.14)
- **Reason for Referral (service type) → `ServiceRequest.category`** (AC 1.15)
- Demographics/metadata = conditional **PUT** by identifier; clinical data = **POST**.

## Code map
- `src/lib/fhir.ts` — REST client (`submitTransaction`, `listIncomingTasks`, `patientEverything`, `patchTask`).
- `src/lib/referral.ts` — `buildReferralBundle()` (UC1, AC 1.01–1.39), `extractReferral()` + action helpers (UC2).
- `src/app/submit/page.tsx` — UC1 form + Bundle preview + submit result.
- `src/app/inbox/page.tsx` — UC2 inbox, referral detail, action-point buttons.

## Notes
- `fullUrl`s use `crypto.randomUUID()` so every URN is a valid lowercase UUID.
- Action points use `PATCH` (JSON-Patch). Codes: `received` (2.17) → `accepted`/`rejected` → `completed` (2.18 onward).
- Conditional PUT by identifier is idempotent, but requires the identifier to be **unique** on the
  server. If a code (e.g. an NHFR) ends up on two Organizations, conditional PUT fails with
  "Multiple resources match" — clean up the duplicate or PUT by logical id.
