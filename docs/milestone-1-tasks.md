# AgenticLantern — Milestone 1 Task Plan

Source of truth: `spec.md`. Work tasks in order unless a dependency allows parallel work.
Each task lists deliverables and acceptance criteria so it can be checked off independently.

Legend: **Deps** = tasks that must be done first.

---

## Phase 0 — Foundation

### T0.1 Repo scaffold
- **Deps:** none
- **Deliverables:**
  - Vite + React + TypeScript app at repo root (`src/`, `public/`, `index.html`).
  - `.gitignore` (node_modules, dist, .env*, .DS_Store, `.azure/`).
  - `.env.example` listing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - Scripts: `dev`, `build`, `lint`, `test`.
- **Acceptance:** `npm run build` produces `dist/index.html`; `npm run dev` serves a placeholder page.

### T0.2 Supabase project + schema
- **Deps:** T0.1
- **Deliverables:** `supabase/migrations/0001_init.sql` with tables:
  - `hospital_accounts` (id, email, name)
  - `cases` (id, source `hospital|self_serve`, status `pending_review|active|recommendations_ready`, decedent_name, decedent_dob, date_of_death, place_of_death, disposition `burial|cremation|unsure`, family_email, family_name, zip, county, created_at)
  - `intake_documents` (id, case_id, storage_path, parsed_fields jsonb, field_confidence jsonb, parsed_at)
  - `invite_tokens` (id, case_id, token_hash, family_email, expires_at, used_at, invalidated_at)
  - `family_users` (id, auth_user_id, case_id unique — 1:1)
  - `funeral_homes` (id, name, address, county, zip, phone, dispositions text[], price_info jsonb, rating numeric)
  - `recommendations` (id, case_id, funeral_home_id, rank, rationale, created_at)
- **Acceptance:** migration applies cleanly to a fresh Supabase project; FK and check constraints match the enums above.

### T0.3 Row-Level Security policies
- **Deps:** T0.2
- **Deliverables:** RLS enabled on all tables with policies:
  - `role = hospital` can insert/select `cases` and `intake_documents` they created; can read/insert `invite_tokens`.
  - `role = family` can select/update only the `cases` row linked via `family_users`.
  - `funeral_homes`: readable by any authenticated user; writable by none (seed only).
  - `recommendations`: readable by the linked family user only.
- **Acceptance:** written tests (SQL or script) show a family user cannot read another case and a hospital user cannot read a family's recommendations.

### T0.4 Auth wiring
- **Deps:** T0.1, T0.2
- **Deliverables:**
  - Supabase client module `src/lib/supabase.ts`.
  - Custom JWT claim `role: hospital | family` set on users (hospital accounts seeded; family set at signup).
  - Magic-link sign-in helper with `emailRedirectTo` pointing back to the app.
- **Acceptance:** magic link arrives by email and lands on an authenticated session with the `role` claim present.

---

## Phase 1 — Hospital path

### T1.1 Hospital login + route guard
- **Deps:** T0.4
- **Deliverables:** `/hospital/login` page; route guard that redirects non-hospital sessions.
- **Acceptance:** seeded hospital account reaches `/hospital/dashboard`; a family session is redirected away.

### T1.2 Hospital dashboard (case list)
- **Deps:** T1.1, T0.3
- **Deliverables:** list of cases created by the logged-in hospital, with status badge and "New case" button.
- **Acceptance:** lists only that hospital's cases; empty state renders.

### T1.3 New case form + PDF upload
- **Deps:** T1.2
- **Deliverables:**
  - Form with required family email (validated) and optional family name.
  - Client-side validation: MIME must be `application/pdf`, size ≤ 10 MB. Inline error otherwise; nothing sent to the parser.
  - Upload to Supabase Storage bucket `intake-pdfs` under `{case_id}/{filename}`.
- **Acceptance:** a `.docx` and an 11 MB PDF are rejected inline with no network call; a valid PDF uploads and returns a storage path.

### T1.4 PDF parse Azure Function
- **Deps:** T1.3, T0.2
- **Deliverables:**
  - Azure Function `parse-intake` (HTTP trigger). Input: storage path. Downloads the PDF, sends it to Claude with PDF input, prompts for Case JSON with per-field confidence.
  - Prompt instructs the model to ignore cause of death and to leave low-confidence fields null.
  - Writes `intake_documents.parsed_fields` and `field_confidence`.
  - Anthropic key read from Function app settings only.
- **Acceptance:**
  - Sample PDF returns structured JSON with confidence values.
  - A blank or non-death PDF returns all-null fields without erroring.
  - Cause of death never appears in output (asserted by a test).
  - Scanned/non-text PDF returns all-null fields, not a 500.

### T1.5 Case creation + invite token
- **Deps:** T1.4
- **Deliverables:**
  - On upload completion: insert `cases` (`source=hospital`, `status=pending_review`) and `intake_documents`, even if parse fields are all null.
  - Create `invite_tokens` row: random token (store only a hash), 24-hour expiry, `family_email` pinned.
  - Email the invite link `/invite/{token}` via Resend or Supabase email.
- **Acceptance:** a case is created when parse returns nothing; the invite email arrives with a working link; token row expires at +24h.

### T1.6 Parsed-field review view (hospital/debug)
- **Deps:** T1.4
- **Deliverables:** case detail page showing each parsed field with its confidence value, and the invite link on screen (for demo).
- **Acceptance:** matches the demo script step 2 and 3 in `spec.md`.

### T1.7 Resend invite
- **Deps:** T1.5
- **Deliverables:** "Resend invite" button, enabled once the token is expired or unused. Creates a new token, invalidates the old one, re-sends email.
- **Acceptance:** old token returns "expired/invalid" after resend; new token works for 24h.

---

## Phase 2 — Family via invite

### T2.1 Invite landing page
- **Deps:** T1.5
- **Deliverables:** `/invite/:token` route. Validates token server-side (hash lookup, not expired, not used).
- **Acceptance:**
  - Valid token shows the sign-in form with email pre-filled and read-only.
  - Expired or used token shows "contact the hospital for a new invite."
  - Unknown token shows the same message (no existence leak).

### T2.2 Magic-link sign-in bound to invite
- **Deps:** T2.1, T0.4
- **Deliverables:** magic link sent to the locked email. On callback, mark token used, create `family_users` row linked to the case, set `role=family`.
- **Acceptance:**
  - Signing in with a different email is impossible via the UI.
  - Token is marked used on success; reusing the link fails.

### T2.3 Confirmation screen (hospital path)
- **Deps:** T2.2
- **Deliverables:** pre-filled, editable form of the parsed Case fields with prompt "Here's what we have — anything to add or correct?" Blank fields render empty. Confirm button sets `status=active`.
- **Acceptance:** if parse returned nothing, every field is blank and editable; confirming sets `status=active` in the DB.

---

## Phase 3 — Self-serve path

### T3.1 Homepage + self-serve entry
- **Deps:** T0.4
- **Deliverables:** public homepage with "Find funeral homes" CTA leading to the wizard.
- **Acceptance:** reachable without login.

### T3.2 Three-question wizard
- **Deps:** T3.1
- **Deliverables:**
  1. Zip code (5-digit validation; derive county from zip lookup table).
  2. Burial / cremation / not sure.
  3. Email (required).
  Sign-in via magic link after step 3.
- **Acceptance:** submitting creates a `cases` row with `source=self_serve`, `status=active`, and a linked family user.

---

## Phase 4 — Funeral home dataset

### T4.1 Dataset ingestion
- **Deps:** T0.2
- **Deliverables:**
  - Source CSV/JSON of all licensed WA funeral homes, checked into `data/funeral_homes.csv`.
  - Normalization script `scripts/load-funeral-homes.ts` that validates fields and upserts into `funeral_homes`.
  - Zip-to-county lookup `data/wa_zip_county.csv`.
- **Acceptance:** script is idempotent (re-running changes nothing); row count matches the source; every row has a county and at least one disposition.

---

## Phase 5 — AI recommendations

### T5.1 Candidate filter
- **Deps:** T4.1, T3.2 or T2.3
- **Deliverables:** function `filterCandidates(case)` that selects homes by county (same, then nearby counties) and disposition capability, capped at 15–20.
- **Acceptance:** unit tests cover: exact county match, nearby fallback within filter, disposition mismatch excluded, cap enforced, zero-result case returns empty list (no widening).

### T5.2 Recommendation Azure Function
- **Deps:** T5.1
- **Deliverables:** `recommend` HTTP-triggered function. Input: confirmed Case JSON + candidates. One Claude call. Output: ranked 3–5 items with rationale strings. Writes `recommendations` rows and sets `cases.status=recommendations_ready`.
- **Acceptance:**
  - Returns 3–5 ranked items for a sample case.
  - Rationale references only fields present in the data (distance, price, rating).
  - Empty candidate list returns an empty recommendation set without error.

### T5.3 Trigger on activation
- **Deps:** T5.2, T2.3, T3.2
- **Deliverables:** call `recommend` when a case becomes `active` (hospital confirmation or self-serve completion).
- **Acceptance:** exactly one recommendation run per activation; re-confirming does not duplicate rows.

---

## Phase 6 — Family recommendations UI

### T6.1 Recommendations view
- **Deps:** T5.3
- **Deliverables:** ranked list showing name, distance, price, rating, rationale. Empty state for zero results.
- **Acceptance:** renders for both hospital and self-serve cases; family cannot see another case's list (RLS test from T0.3 still passes).

---

## Phase 7 — Hardening, deploy, demo

### T7.1 Input and error handling pass
- **Deps:** Phases 1–6
- **Deliverables:** user-facing error messages for upload, parse failure, expired token, and recommendation failure. Loading states on every async action.
- **Acceptance:** each failure path shows a message, no blank screens.

### T7.2 Azure Static Web Apps deployment
- **Deps:** T0.1 (and Functions from T1.4, T5.2)
- **Deliverables:**
  - `.github/workflows/` workflow with `app_location` set to the React app, `output_location: dist`, `api_location` set to the functions folder.
  - App settings in Azure: Supabase URL/key (public), Anthropic key (secret), email provider key.
  - Resolve the `swa-db-connections` path mismatch from the failed run first.
- **Acceptance:** push to `main` deploys; the deployed site loads and the invite and wizard flows work against Supabase.

### T7.3 Demo rehearsal
- **Deps:** T7.2
- **Deliverables:** seeded hospital account, two sample PDFs (one clean, one blank/scanned), seeded funeral home data, a runbook covering the six steps of the spec's demo script.
- **Acceptance:** the full demo script runs end-to-end on the deployed site without manual DB edits.

---

## Sample fixtures (provided)
Location: `Context/`
- `Medical cert for the cause of death filled by hospital.png` — Form No. 4 "Medical Certificate of Cause of Death" (hospital). Used by T1.4 parser. **Blank template**: no patient data is filled in, and the layout is an Indian form (Rule 7, "Shri/Smt", ward no., "Medical Supdt."), not Washington State. Cause-of-death fields must be ignored by the parser per `spec.md`.
- `Death Certificate needed by funeral home.png` — Washington State Death Certificate Worksheet. Used in the next milestone (funeral home populates it). **Blank template** except the pre-printed funeral facility, "Barton Family Funeral Service LLC, 11630 Slater Ave NE, Suite 1A, Kirkland, WA 98034".

Generated fixtures (`fixtures/sample-pdfs/`, built by `generate.py` from the `Context/` images, all data fictional, one shared decedent — Eleanor Marie Whitfield, DOD 10/20/2026):
- `01-hospital-medical-cert-wa.pdf` — Washington-style hospital medical certification of cause of death, filled (clean parse for T1.4). Built from standard WA cause-of-death elements; not an official DOH layout. Cause-of-death fields are filled and must be ignored.
- `01b-hospital-medical-cert-indian-form-no4.pdf` — the earlier Form No. 4 version, kept as an alternate.
- `02-wa-death-certificate-worksheet.pdf` — filled WA worksheet for the funeral home milestone; matches the same decedent.
- `03-non-death-lab-report.pdf` — unrelated document for the all-null parse test.

Text is overlaid on the form images, so the PDFs have a text layer as the spec requires.

## Out of scope (do not build)
Per `spec.md` "Explicitly out of scope": SSO, live scraping, multi-agent orchestration, multiple family members per case, payments, e-signature, document generation, OCR for scanned PDFs, religious/cultural matching, budget matching, zero-result fallback.

## Open items to confirm before Phase 1
1. Where the app source for the deploy should live (`swa-db-connections` mismatch from the failed CI run).
2. Email provider: Resend or Supabase built-in email.
3. Funeral home dataset: which WA source file to load (path or link).
4. Sample PDFs: hand-authored by us, or supplied.
