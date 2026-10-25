# AgenticLantern — Milestone 1 Task Plan

Source of truth: `docs/spec.md`. Work tasks in order unless a dependency allows parallel work.
Each task lists deliverables and acceptance criteria so it can be checked off independently.

Legend: **Deps** = tasks that must be done first. **Status**: ✅ done, 🚧 partial, ⬜ not started.

This plan was originally drafted before the Supabase schema/RLS and the frontend scaffold
existed. Phase 0 below has been reconciled to what's actually built (see
`supabase/migrations/` and `src/`); later phases are updated wherever they named specific
table/column/bucket names that turned out different, but the flows/acceptance criteria
themselves still hold.

---

## Phase 0 — Foundation

### T0.1 Repo scaffold — ✅ done
- **Deps:** none
- **Deliverables:**
  - Vite + React + TypeScript app at repo root (`src/`, `public/`, `index.html`), with `react-router-dom` for the multi-view flows in Phases 1–3.
  - `.gitignore` (node_modules, build/, dist/, .env*, .DS_Store, `.azure/`).
  - `.env.example` listing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase's current key-naming; not `VITE_SUPABASE_ANON_KEY`).
  - Scripts: `dev`, `build`, `lint`, `preview`. No `test` script yet — add one when the first tests land (see T1.4, T5.1 acceptance criteria below, which assume tests exist).
- **Acceptance:** `npm run build` produces `build/index.html` (output dir is `build`, not Vite's default `dist`, to match `output_location: "build"` in `.github/workflows/azure-static-web-apps-*.yml`); `npm run dev` serves a page that live-checks the Supabase connection.

### T0.2 Supabase project + schema — ✅ done
- **Deps:** T0.1
- **Deliverables:** `supabase/migrations/20261025000000_init_schema.sql` (+ `20261025010000_align_case_schema_with_spec.sql`) with tables:
  - `profiles` (id references auth.users, role `hospital|family`) — one table covers both login types via `role`, instead of separate `hospital_accounts`/`family_users` tables. Populated automatically from signup metadata by an `on_auth_user_created` trigger.
  - `cases` (id, source `hospital|self_serve`, status `pending_review|active|recommendations_ready`, legal_first/middle/last_name, sex, date_of_birth, age_at_death, date_of_death, time_of_death, ward, facility_name/city/state/zip, place_of_death_type, residence_street/city/state/zip/county, disposition_preference `burial|cremation|unsure`, family_contact_name/email/relationship, hospital_id, family_user_id, created_at, updated_at) — field set matches `docs/spec.md`'s "Template field gaps" table, not the flatter decedent_name/dob/place_of_death/zip/county version this task was originally scoped against.
  - `intake_documents` (id, case_id, storage_path, parsed_fields jsonb, created_at) — confidence is embedded per-field inside `parsed_fields` (e.g. `{field: {value, confidence}}`); there's no separate `field_confidence` column.
  - `invite_tokens` (id, token, case_id, contact_email, expires_at, used_at, created_at) — token is stored in plaintext, not a hash. There's no client-facing SELECT policy (see T0.3); lookups and redemption go through two `SECURITY DEFINER` SQL functions instead, and "invalidated" is just `used_at` set on resend.
  - `funeral_homes` (id, name, address, county, zip, phone, cremation_capable bool, burial_capable bool, price_cremation numeric, price_burial numeric, rating numeric) — two capability booleans + two price columns, not `dispositions text[]`/`price_info jsonb`.
  - `recommendations` (id, case_id, funeral_home_id, rank, rationale, created_at) — matches as originally scoped.
- **Acceptance:** migration applies cleanly (verified against the live project via `supabase db push`); FK and check constraints match the enums above.

### T0.3 Row-Level Security policies — ✅ done (implementation); ⬜ written RLS tests
- **Deps:** T0.2
- **Deliverables:** RLS enabled on all tables with policies:
  - Hospital (`cases.hospital_id = auth.uid()`) can select/insert/update its own cases, and insert/update (but not select) `invite_tokens` for those cases.
  - Family (`cases.family_user_id = auth.uid()`) can select/update only its own linked case — there's no separate `family_users` join table; the link is the `family_user_id` column on `cases` itself, set via `redeem_invite_token()`.
  - `intake_documents`/`recommendations`: select-only for the hospital or family linked to the case. Both are written only by the two Azure Functions (service-role key), which bypasses RLS entirely — there's no client insert/update policy for either.
  - `invite_tokens` has deliberately **no** client SELECT policy (a bare one would let any authenticated user enumerate tokens). Two `SECURITY DEFINER` functions substitute: `invite_token_lookup(token)` (anon-callable, used by the invite landing page) and `redeem_invite_token(token)` (authenticated-callable, called right after magic-link sign-in).
  - `funeral_homes`: readable by anon **and** authenticated (public-read, so a self-serve visitor could browse before signing in); writable by none (seed/service-role only).
- **Acceptance (outstanding):** no RLS tests exist yet — still need something (SQL or script) that shows a family user can't read another case and a hospital user can't read a family's recommendations.

### T0.4 Auth wiring — 🚧 partial
- **Deps:** T0.1, T0.2
- **Deliverables:**
  - Supabase client module `src/lib/supabase.ts` — ✅ done, reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
  - Role is **not** a custom JWT claim — it's `profiles.role`, set from signup metadata (`supabase.auth.signUp({ options: { data: { role: 'hospital' | 'family' } } })`) by the `handle_new_user` trigger. Any code that needs the role should query `profiles`, not `auth.jwt()`.
  - Magic-link sign-in helper with `emailRedirectTo` — ⬜ not yet built.
- **Acceptance:** magic link arrives by email and lands on an authenticated session; the session's `profiles` row has the expected `role`.

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
  - Upload to Supabase Storage bucket `intake-documents` under `{case_id}/{filename}` (bucket + storage RLS policies already exist from T0.2/T0.3).
- **Acceptance:** a `.docx` and an 11 MB PDF are rejected inline with no network call; a valid PDF uploads and returns a storage path.

### T1.4 PDF parse Azure Function
- **Deps:** T1.3, T0.2
- **Deliverables:**
  - Azure Function `parse-intake` (HTTP trigger). Input: storage path. Downloads the PDF, sends it to Claude with PDF input, prompts for Case JSON with per-field confidence.
  - Prompt instructs the model to ignore cause of death and to leave low-confidence fields null.
  - Writes `intake_documents.parsed_fields` (per-field confidence embedded in the same jsonb column — see T0.2).
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
  - Create `invite_tokens` row: the `token` column defaults to a random value already (two concatenated `gen_random_uuid()`s, stored in plaintext — see T0.2 for why it's not hashed), 24-hour expiry, `contact_email` pinned.
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
- **Deliverables:** `/invite/:token` route. Calls the `invite_token_lookup(token)` RPC (already built — anon-callable, see T0.2/T0.3) instead of a direct table lookup.
- **Acceptance:**
  - Valid token shows the sign-in form with email pre-filled and read-only.
  - Expired or used token shows "contact the hospital for a new invite."
  - Unknown token shows the same message (no existence leak).

### T2.2 Magic-link sign-in bound to invite
- **Deps:** T2.1, T0.4
- **Deliverables:** magic link sent to the locked email. On callback (once an authenticated session exists), call the `redeem_invite_token(token)` RPC (already built) — it validates the token, checks the signed-in email matches `contact_email`, sets `cases.family_user_id = auth.uid()`, and marks the token used, all server-side. No app-level `family_users` row to create — the link *is* `cases.family_user_id`. `role=family` is already set at signup time (T0.4), not here.
- **Acceptance:**
  - Signing in with a different email is impossible via the UI.
  - Token is marked used on success; reusing the link fails (the RPC raises and the client surfaces an error).

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

### T3.2 Six-question wizard
- **Deps:** T3.1
- **Deliverables:** per the spec's "Resolved questions" (wizard length was revised from 3 to 6 questions, since a Case can't exist without the decedent and the family contact):
  1. Decedent legal name (first, last required; middle optional) → `legal_first_name`/`legal_middle_name`/`legal_last_name`.
  2. Date of death → `date_of_death`.
  3. Zip code (5-digit validation; derive county from zip lookup table) → `residence_zip`/`residence_county`.
  4. Burial / cremation / not sure → `disposition_preference`.
  5. Family contact name and relationship to decedent → `family_contact_name`/`family_contact_relationship`.
  6. Email (required) → `family_contact_email`. Sign-in via magic link after this step.
  Everything else (sex, age, residence street, place_of_death_type, facility) is left blank — `place_of_death_type` defaults to `'unknown'` at the DB level (see T0.2).
- **Acceptance:** submitting creates a `cases` row with `source=self_serve`, `status=active`, `family_user_id = auth.uid()` directly (no separate family-user table/row).

---

## Phase 4 — Funeral home dataset

### T4.1 Dataset ingestion
- **Deps:** T0.2
- **Deliverables:**
  - Source CSV/JSON of all licensed WA funeral homes, checked into `data/funeral_homes.csv`.
  - Normalization script `scripts/load-funeral-homes.ts` that validates fields and upserts into `funeral_homes`, mapping into the actual columns: `cremation_capable`/`burial_capable` (booleans, not a `dispositions` array) and `price_cremation`/`price_burial` (two numeric columns, not a `price_info` jsonb blob).
  - Zip-to-county lookup `data/wa_zip_county.csv`.
- **Acceptance:** script is idempotent (re-running changes nothing); row count matches the source; every row has a county and at least one of `cremation_capable`/`burial_capable` true.

---

## Phase 5 — AI recommendations

### T5.1 Candidate filter
- **Deps:** T4.1, T3.2 or T2.3
- **Deliverables:** function `filterCandidates(case)` that selects homes by county (same, then nearby counties) and `cremation_capable`/`burial_capable`, capped at 15–20.
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
  - `.github/workflows/` workflow — already exists (`app_location: "/"`, `output_location: "build"`, matching `vite.config.ts`'s `build.outDir`); still needs `api_location` set to the functions folder once T1.4/T5.2 exist.
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
1. ~~Where the app source for the deploy should live~~ — resolved: repo root (`app_location: "/"`), matching the existing Azure SWA workflow.
2. Email provider: Resend or Supabase built-in email.
3. Funeral home dataset: which WA source file to load (path or link).
4. Sample PDFs: hand-authored by us, or supplied — resolved, see `fixtures/sample-pdfs/`.
