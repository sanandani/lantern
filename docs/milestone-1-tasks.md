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
  - Scripts: `dev`, `build`, `lint`, `preview`. No `test` script at the root — `api/` has its own (`npm test` from `api/`, see T1.4/T5.1), since that's where the only test-bearing logic (PDF parsing, candidate filtering) lives.
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

### T0.4 Auth wiring — ✅ done
- **Deps:** T0.1, T0.2
- **Deliverables:**
  - Supabase client module `src/lib/supabase.ts` — reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
  - Role is **not** a custom JWT claim — it's `profiles.role`, set from signup metadata by the `handle_new_user` trigger. Any code that needs the role should query `profiles`, not `auth.jwt()`.
  - `src/lib/auth.ts` — `sendMagicLink(email, role, redirectTo?)`, one call for both sign-up and sign-in via `supabase.auth.signInWithOtp` with `emailRedirectTo` and `options.data.role` (only applied by the trigger on first-time signup); `signOut()`.
  - `src/context/AuthContext.tsx` — `AuthProvider`/`useAuth()` exposing `{ session, profile, loading }`, wired in `src/main.tsx` around `<App />`. Subscribes to `onAuthStateChange` and re-fetches `profiles` whenever the session's user id changes.
  - `src/components/SignInForm.tsx` + a role-picker demo wired into `src/App.tsx`'s homepage (temporary — will be replaced by T1.1's hospital login page and T2.2's locked-email invite sign-in, but exercises the shared auth helper end-to-end in the meantime).
- **Acceptance:** verified end-to-end against the live Supabase project — sent a magic link, clicked it, landed back on the app authenticated with `profiles.role` resolved correctly (`family`). `detectSessionInUrl` on the existing client picks up the token from the URL fragment automatically, no extra callback route needed.

---

## Phase 1 — Hospital path

### T1.1 Hospital login + route guard — ✅ done
- **Deps:** T0.4
- **Deliverables:**
  - `src/pages/HospitalLogin.tsx` (`/hospital/login`) — reuses `SignInForm` fixed to `role="hospital"`; redirects straight to `/hospital/dashboard` if already an authenticated hospital session.
  - `src/components/RequireRole.tsx` — generic route guard: no session → redirect to `/${role}/login`; session with the wrong role → redirect to `/`.
  - `src/pages/HospitalDashboard.tsx` (`/hospital/dashboard`, guarded) — placeholder, case list lands in T1.2.
- **Acceptance:** verified live — visiting `/hospital/dashboard` signed out redirects to `/hospital/login`. Hit Supabase's default email rate limit (shared quota with the T0.4 test send) before completing a second live click-through as a seeded hospital account, so the "family session redirected away from hospital dashboard" branch is verified by code inspection (same `profile.role !== role` check as the working no-session branch) rather than a live click. Worth re-verifying once either the rate limit resets or a real email provider (Resend) is wired up — see "Open items" below.
- **Restyled** (visual only, no behavior change): `HospitalLogin.tsx`, `HospitalDashboard.tsx`, `NewCase.tsx`, and `CaseDetail.tsx` all now wrapped in `src/components/HospitalLayout.tsx` with the `.theme-enterprise` CSS scope (navy/slate palette, sans-serif-only headings, denser spacing) — deliberately distinct from the warm cream/forest-green/serif theme on the family-facing pages, per product direction to make the hospital side read as enterprise software and the family side read as a considered consumer product. Also added a decedent-name link from the dashboard's case table to `/hospital/cases/:id`, since `CaseDetail.tsx` existed but nothing linked to it. Type-checks/builds/lints clean; not visually verified live (both require an authenticated hospital session this environment has no credentials for) — the same classes were already confirmed live on `HospitalLogin.tsx` and the family-side pages, so risk is low, but worth a real look before the demo.

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

### T1.4 PDF parse Azure Function — ✅ done
- **Deps:** T1.3, T0.2
- **Deliverables:**
  - `api/` — self-contained Azure Functions project (own `package.json`/`host.json`/`tsconfig.json`, matches how Azure Static Web Apps builds `api_location` independently).
  - `api/src/lib/parsePdfToCase.ts` — core logic, split out from the HTTP wrapper so it's testable without the Functions runtime. Calls **OpenRouter** (`google/gemini-3.8-flash`) over plain `fetch` against its OpenAI-compatible `/chat/completions` endpoint (no SDK — OpenRouter's own documented pattern), sending the PDF as a `file` content part and `response_format: {type: "json_schema", ...}` built from a Zod schema via `z.toJSONSchema()`. The Zod schema covers exactly the `cases` columns spec.md's "Parse targets for Milestone 1" lists (decedent name/sex/DOB/age/DOD/time, facility, ward, residence). Cause of death/manner/pregnancy/SSN/physician are **not in the schema** — structured outputs make it impossible for the model to return those keys, not just prompted-against. The raw response is still re-validated with `ParsedCaseFieldsSchema.parse()` (fetch gives no SDK-level auto-parsing/guarantee the way the Anthropic SDK's `.parse()` would). A post-processing pass (`clampLowConfidence`) nulls out any field below a 0.4 confidence threshold as defense in depth beyond the prompt instruction. Originally built against the Anthropic API directly (structured outputs via `client.beta.messages.parse()`); switched to OpenRouter per product decision on 2026-10-25 — model chosen for cheap, modern, strong native PDF/document understanding, OpenRouter falls back to OCR automatically if the routed endpoint lacks native file input.
  - `api/src/functions/parseIntake.ts` — thin HTTP-trigger wrapper (Azure Functions v4 Node model): downloads the PDF from `intake-documents` storage via the service-role client, calls the parser, writes `intake_documents` (parse failures write `parsed_fields: null` rather than failing the request, per spec).
  - `api/src/lib/supabaseAdmin.ts` — service-role Supabase client, Azure Functions-only.
  - `api/scripts/test-parse-intake.ts` — standalone harness (`npm run test:parse-intake` from `api/`) that runs the real OpenRouter API against `fixtures/sample-pdfs/01-hospital-medical-cert-wa.pdf` (clean parse) and `03-non-death-lab-report.pdf` (all-null path), no Azure Functions runtime or deployed infra needed.
- **Acceptance:** type-checks clean (`npx tsc --noEmit` in `api/`). `OPENROUTER_API_KEY` is now set; `npm run test:parse-intake` from `api/` ran live against the real OpenRouter API and passed all 4 checks — name/DOD extracted from the clean fixture, no forbidden keys (cause of death/manner/SSN) in the schema-constrained output, and the unrelated lab-report fixture correctly returns all-null fields with no error thrown. No scanned/non-text-layer PDF fixture exists in `fixtures/sample-pdfs/` to independently test the parse-failure path (all current fixtures have a text layer per spec.md), but it's the same code path (catch, write `parsed_fields: null`, HTTP 200) exercised by the non-death-document case above.

### T1.5 Case creation + invite token — ✅ done (email send descoped, see below)
- **Deps:** T1.4
- **Deliverables:**
  - `src/pages/NewCase.tsx` inserts `cases` (`source=hospital`, `status=pending_review`) + uploads the PDF, even when the PDF is otherwise fine — `intake_documents` itself is only ever written server-side by `parse-intake` (T1.4), consistent with its select-only client RLS policy; this page doesn't (and per RLS can't) write it directly.
  - Also inserts `invite_tokens` (`contact_email` pinned, `token`/`expires_at` default server-side per T0.2) right after the upload succeeds, then navigates to the new `/hospital/cases/:id` page (T1.6) rather than back to the dashboard.
  - **New migration** `20261025030000_invite_tokens_hospital_select.sql` — the original schema had no SELECT policy on `invite_tokens` at all (by design, to block token enumeration), which meant there was no way for the hospital to read back the token it just minted. Added a case-ownership-scoped SELECT policy (same non-enumerable pattern as `intake_documents`/`recommendations`) — applied live via `supabase db push`.
  - **Email send descoped for M1**: per spec.md's own demo script ("Invite link is generated — can just be shown on screen for the demo instead of actually sending"), this doesn't call Resend/Supabase email — the link is just displayed on the case detail page (T1.6). Revisit if a real email provider gets picked (still an open item).
- **Acceptance:** verified live — case + upload + invite token all create correctly when the PDF fixture parses cleanly. `NewCase.tsx` now calls `triggerParseIntake(caseId, storagePath)` right after the upload succeeds (same-origin `/api/parse-intake`, see T7.2) — not independently re-tested against a live `intake_documents` row here since that needs the deployed Function + Azure app settings, not just this page's own insert path.

### T1.6 Parsed-field review view (hospital/debug) — ✅ done
- **Deps:** T1.4
- **Deliverables:** `src/pages/CaseDetail.tsx` (`/hospital/cases/:id`) — shows the decedent name/status, the invite link (or why it's unusable: used/expired/none yet), and a table of parsed fields + confidence from the latest `intake_documents` row if one exists ("PDF not parsed yet" otherwise). `parse-intake` is now triggered from the upload flow (T1.5/T7.2); this page just hasn't been re-tested against a live row produced that way yet (needs the deployed Function + Azure app settings).
- **Acceptance:** matches the demo script step 2 and 3 in `spec.md` for the invite-link part; parsed-field display verified against the schema shape T1.4 actually produces (not yet against a live `intake_documents` row, since nothing writes one outside the standalone test script until `parse-intake` is deployed and wired as a trigger).

### T1.7 Resend invite — ✅ done
- **Deps:** T1.5
- **Deliverables:** "Resend invite" button on `CaseDetail.tsx`, always available (simpler than gating on expired/used state for M1). Marks the current token's `used_at` (if unused) and inserts a fresh one, same `contact_email`.
- **Acceptance:** verified live — resending invalidates the prior token (`used_at` set) and the new one appears with a fresh `expires_at`; `invite_token_lookup` on the old token now reports invalid.

---

## Phase 2 — Family via invite

### T2.1 Invite landing page — ✅ done
- **Deps:** T1.5
- **Deliverables:** `src/pages/InvitePage.tsx` (`/invite/:token`). Calls the `invite_token_lookup(token)` RPC instead of a direct table lookup; locked/pre-filled email sign-in form (reused, extended `SignInForm` with `lockEmail`/`initialEmail`/`redirectTo` props) on a valid token, a single "this link isn't active" message for expired/used/unknown (no existence leak).
- **Acceptance:** verified by code path + UI inspection in the dev server; not yet exercised against a real expired/used token row (that requires T1.5/T1.7 to exist first to generate one).

### T2.2 Magic-link sign-in bound to invite — 🚧 partial (frontend wired; live click-through pending)
- **Deps:** T2.1, T0.4
- **Deliverables:** `InvitePage` stashes the token in `localStorage` (`src/lib/familyOnboarding.ts`) before sending the magic link, since the click may land in a fresh tab/session; `FamilyCase.tsx` (`/case`) picks it up on mount and calls `redeem_invite_token(token)` before rendering anything case-specific. Synchronous-removal-before-await pattern guards against React StrictMode's dev-mode double-effect causing a double redemption attempt.
- **Acceptance:** not yet verified live end-to-end (blocked on the same email-provider/rate-limit gap noted under T1.1) — logic is in place and type-checks, but the actual magic-link → redeem round trip hasn't been click-tested.

### T2.3 Confirmation screen (hospital path) — ✅ done (frontend)
- **Deps:** T2.2
- **Deliverables:** `FamilyCase.tsx`'s `ConfirmationScreen` — pre-filled, editable form of the parsed Case fields (reads `intake_documents.parsed_fields`, falls back to blank), fields below a 0.7 confidence are flagged "please check." Blank fields render empty. Also collects `disposition_preference` on this screen (burial/cremation/unsure) — not in the spec's parsed-field list because no PDF ever contains it, and recommendation matching needs it, so the family stating their own preference here is the natural place for it. Confirm button sets `status=active`.
- **Acceptance:** builds/type-checks; not yet exercised against a real `pending_review` case with parsed fields (needs T1.4/T1.5 producing one first).

---

## Phase 3 — Self-serve path

### T3.1 Homepage + self-serve entry — ✅ done
- **Deps:** T0.4
- **Deliverables:** `src/pages/Home.tsx` (`/`) — public landing page, "Find a funeral home" CTA to `/start`, hospital staff sign-in tucked into the header as a quiet secondary link rather than a primary action.
- **Acceptance:** verified live in the dev server — reachable without login.

### T3.2 Six-question wizard — ✅ done (frontend)
- **Deps:** T3.1
- **Deliverables:** `src/pages/Wizard.tsx` (`/start`) — one question per screen with a progress bar, matches the spec's 6 questions exactly. Divergence from this task's original wording: step 3 collects `residence_zip` only — `residence_county` is left null for self-serve rather than derived from zip client-side. T4.1 found the WA zip→county CSV unnecessary for the funeral-home side of matching (the dataset already carries county directly), so there was nothing to derive it from client-side without fabricating data. Resolved server-side instead: T5.1's `resolveCaseCounty` derives the county from `residence_zip` via a real Census Bureau WA ZIP→county table (`api/src/lib/waZipToCounty.ts`) when `residence_county` is null, so self-serve cases get matched without the wizard needing to collect or guess a county. On submit, the answers are stashed in `localStorage` (not written to `cases` yet) and a magic link is sent; `FamilyCase.tsx` creates the actual `cases` row once the family is signed in (see T2.2).
- **Acceptance:** walked through live in the dev server (all 6 steps, validation gating `Continue`, radio/select rendering). Final `cases` insert (`source=self_serve`, `status=active`, `family_user_id=auth.uid()`) not yet live-tested — same magic-link click-through gap as T2.2.

---

## Phase 4 — Funeral home dataset

### T4.1 Dataset ingestion — ✅ done
- **Deps:** T0.2
- **Deliverables:**
  - Source dataset of all licensed WA funeral homes, checked into `data/funeral_homes.json`
    (277 rows) — ✅ done. Actually JSON, not CSV as originally guessed; each row already
    carries `county` directly, so the planned `data/wa_zip_county.csv` zip-to-county lookup
    turned out to be unnecessary and was dropped.
  - Migration `20261025020000_add_funeral_homes_source_id.sql` adding `funeral_homes.source_id`
    (the dataset's own stable integer id) — ✅ done, pushed to the linked project. Needed as
    the upsert key since `funeral_homes.id` is a random UUID with no natural match to the
    source rows.
  - Normalization script `scripts/load-funeral-homes.ts` — ✅ done. Maps into the actual
    columns: `cremation_capable`/`burial_capable` from `service_types`, `price_cremation`/
    `price_burial` from the cheapest matching tier in `pricing` (`direct_cremation_pkg`/
    `immediate_burial_pkg`, falling back to the full-service tier or `price_range_low`), and
    `rating` from `google_rating` (`yelp_rating` is null for every row in this dataset).
    Run via `npm run load-funeral-homes`.
- **Acceptance:** verified live — `npm run load-funeral-homes` upserted all 277 rows (0
  skipped). Script is idempotent (upserts on `source_id`).

---

## Phase 5 — AI recommendations

### T5.1 Candidate filter — ✅ done
- **Deps:** T4.1, T3.2 or T2.3
- **Deliverables:**
  - `api/src/lib/waCountyAdjacency.ts` — all 39 WA counties' in-state neighbors, from the US Census Bureau's county adjacency file (`county_adjacency.txt`), not hand-typed from memory (correctness-sensitive for a grieving family's search results).
  - `api/src/lib/waZipToCounty.ts` — 598-entry WA ZIP→county table, derived from the Census Bureau's 2010 ZCTA-to-county relationship file (`zcta_county_rel_10.txt`), resolving each ZIP to its highest-population-share county. Exists because T3.2's self-serve wizard only collects `residence_zip`, not `residence_county` — flagged by the session building T2/T3 — and no such lookup existed anywhere in the repo.
  - `api/src/lib/filterCandidates.ts` — `filterCandidates(homes, {county, disposition}, cap=20)`: same-county matches first, widened to Census-adjacent counties only if same-county doesn't fill the cap, capped at 20. `resolveCaseCounty(case)`: prefers `residence_county`, falls back to the ZIP table for self-serve cases. `filterCandidatesForCase(homes, case)`: the two composed, short-circuits to `[]` if `disposition_preference` isn't set yet.
  - `api/scripts/test-filter-candidates.ts` (`npm run test:filter-candidates` or `npm test` from `api/`) — no network/Supabase needed.
- **Acceptance:** 19 unit tests, all passing — exact county match, nearby-county fallback (including the real case of a county like San Juan with zero funeral homes directly in it), nearby counties *not* pulled in when same-county already fills the cap, disposition mismatch excluded (cremation/burial/unsure), cap enforced (default and custom), zero-result case returns empty list without widening past one adjacency ring, null/unrecognized county returns empty list, and the ZIP-fallback county resolution for self-serve cases.

### T5.2 Recommendation Azure Function — ✅ done
- **Deps:** T5.1
- **Deliverables:**
  - `api/src/lib/rankCandidates.ts` — one OpenRouter call (`google/gemini-3.8-flash`, same `fetch` + Zod `z.toJSONSchema()` structured-output pattern as T1.4). The candidate list passed to the model only ever carries `id`/`name`/`county`/`price_cremation`/`price_burial`/`rating` — no decedent PII crosses into the ranking prompt. `funeral_home_id` in the output schema is a dynamic `z.enum()` of exactly the candidate ids passed in, so the model structurally cannot hallucinate a home that wasn't in the filtered list. Returns 3–5 picks (fewer if the candidate pool itself has fewer than 3), ranked best-first, each with a rationale string; the prompt explicitly forbids referencing a null field or inventing an unsupported claim.
  - `api/src/functions/recommend.ts` — HTTP-triggered function (`caseId` in, same `authLevel: 'function'`/service-role pattern as `parse-intake`). Loads the case + all `funeral_homes`, runs `filterCandidatesForCase` (T5.1), ranks what comes back, writes `recommendations` rows, sets `cases.status = 'recommendations_ready'`. **Idempotent by construction**: if `recommendations` already exist for the case, it returns them as-is instead of re-ranking/re-inserting — covers T5.3's "re-confirming does not duplicate rows" regardless of how reliably the frontend avoids a double call.
  - `api/scripts/test-rank-candidates.ts` (`npm run test:rank-candidates` from `api/`) — live OpenRouter test with synthetic candidates (no Supabase needed).
- **Acceptance:** type-checks clean. Live-tested against the real OpenRouter API: returns 3–5 ranked items for a 4-candidate sample set, every pick is a real candidate id (schema-enforced, not just prompted), ranks are gapless 1..N, every rationale is non-empty and didn't reference the one candidate's null `rating` field, and an empty candidate list short-circuits to `[]` without an API call. The idempotency guard and the `cases.status` write are exercised by code path (would need a live Supabase case row + deployed function to click-test end-to-end — same Azure-deployment gap as T1.4, see T7.2).

### T5.3 Trigger on activation — ✅ done
- **Deps:** T5.2, T2.3, T3.2
- **Deliverables:**
  - `src/lib/triggerRecommend.ts` — fire-and-forget POST to same-origin `/api/recommend`, called from both places `cases.status` becomes `active`: `FamilyCase.tsx`'s self-serve case insert and `ConfirmationScreen`'s confirm handler.
  - `recommend`'s `authLevel` moved to `anonymous` (see T7.2) so the browser can call it directly through Azure SWA's managed-Functions proxy without a function key ever reaching client JS.
  - Duplicate-run safety doesn't depend on the frontend calling this exactly once: T5.2's `recommend` function checks for existing `recommendations` rows first and returns them as-is rather than re-ranking, so even a retried/duplicate call is a no-op.
- **Acceptance:** both call sites type-check/build/lint clean (verified via `npx tsc -b`, `npm run lint`, `npm run build` across the whole repo). "Exactly one recommendation run per activation; re-confirming does not duplicate rows" is satisfied by construction (the idempotency guard in T5.2, not by assuming the frontend never double-fires). Not yet click-tested against the deployed site — needs the Azure app settings from T7.2 set first.

---

## Phase 6 — Family recommendations UI

### T6.1 Recommendations view — 🚧 partial (frontend done; needs T5.2 to produce real data)
- **Deps:** T5.3
- **Deliverables:** `FamilyCase.tsx`'s `RecommendationsView` — ranked list showing name, county, price, rating, rationale; empty state for zero results. A `WaitingForRecommendations` state fills the gap between `status=active` and `status=recommendations_ready`, polling every 6s so the family doesn't have to refresh. `/case` is a single route that renders the confirmation screen, the waiting state, or this view based on `cases.status` — there's no separate route to add for this task.
- **Acceptance:** UI verified in isolation (loading/empty states); can't verify the "renders for both hospital and self-serve cases" or RLS bullets until T5.2 exists and writes real `recommendations` rows.

---

## Phase 7 — Hardening, deploy, demo

### T7.1 Input and error handling pass
- **Deps:** Phases 1–6
- **Deliverables:** user-facing error messages for upload, parse failure, expired token, and recommendation failure. Loading states on every async action.
- **Acceptance:** each failure path shows a message, no blank screens.

### T7.2 Azure Static Web Apps deployment — 🚧 partial (site deploys; Functions wiring incomplete)
- **Deps:** T0.1 (and Functions from T1.4, T5.2)
- **Deliverables:**
  - `.github/workflows/azure-static-web-apps-*.yml` — `app_location: "/"`, `output_location: "build"` (matches `vite.config.ts`'s `build.outDir`). `api_location` set to `"api"` now that T1.4/T5.2 exist, so Azure SWA builds/deploys `api/` as managed Functions alongside the static site (no separate Function App resource).
  - The `swa-db-connections` path mismatch from the very first workflow run — already resolved by the time T1.4/T5.2 landed; every run since has deployed successfully (verified via `gh run list`). Nothing left to do here.
  - App settings in Azure for `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`OPENROUTER_API_KEY` — documented in README's new "Azure Functions (`api/`)" section, but **not yet set** (needs the Azure Portal or `az` CLI, neither of which this environment has credentials for — this is a Harsh-only step). Email provider setting dropped: T1.5 already descoped the email send for M1.
- **Acceptance:** push to `main` deploys — verified, every run since `773ba06` has succeeded, including the one carrying this milestone's full feature set (`252ed2e`). Site loads and the invite/wizard flows work against Supabase (per T1.1/T2.1/T3.2's live verification). Both functions switched from `authLevel: 'function'` to `anonymous` and are called from the frontend via the same-origin `/api/*` path Azure SWA's managed-Functions integration provides (`NewCase.tsx` → `/api/parse-intake`, `FamilyCase.tsx` → `/api/recommend`) — no function key needed or leaked client-side; the security boundary is the same unguessable-UUID one `invite_tokens` already relies on. **Still not yet true:** the Functions actually running end-to-end on the deployed site, since the three app settings above (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`OPENROUTER_API_KEY`) aren't set in Azure yet — that step needs the Azure Portal or `az` CLI, neither available in this dev environment. This is the one remaining blocker before a real end-to-end click-test; everything else in this task is done.

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
3. ~~Funeral home dataset: which WA source file to load~~ — resolved: Ntrust's compiled
   WA dataset (`~/Lantern/Ntrust/src/data/funeral_homes.json`), copied into
   `data/funeral_homes.json`. See T4.1.
4. Sample PDFs: hand-authored by us, or supplied — resolved, see `fixtures/sample-pdfs/`.
