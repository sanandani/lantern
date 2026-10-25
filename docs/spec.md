# AgenticLantern — Milestone 1 Spec (Hackathon)

## One-liner
When a death occurs, a hospital (or the family directly) starts a case. An AI agent reads
the intake context and recommends funeral homes to the family member who then signs up
through a dedicated link.

## Actors
- **Hospital user** — logs into a hospital portal, uploads a PDF document for a patient
  who has passed away, and the family contact's email for the family member to notify.
- **Family member** — either (a) receives a magic link/invite from a hospital-initiated
  case, or (b) signs up directly without any hospital involvement and answers a short,
  minimal-question wizard themselves.
- **AI agent** — reads the intake context (parsed from the hospital's PDF, or from the
  family's short-form answers) and produces a ranked shortlist of funeral home
  recommendations.

Two entry paths, same downstream pipeline:

```
Hospital flow:
  Hospital login -> upload PDF -> system parses PDF into structured Case fields
    -> creates Case + invite token -> notifies family contact (email) with link
    -> family opens link -> signs up/logs in -> reviews/confirms parsed context
    -> agent recommends funeral homes

Self-serve flow:
  Family signs up directly (no invite token) -> answers a short question wizard
    -> agent recommends funeral homes
```

Both paths converge on the same `Case` record and the same recommendation step. The
hospital path front-loads a document-parsing step; the self-serve path skips straight to
a lightweight structured answer set because there's no document to parse.

## Core entities

- **HospitalAccount** — login for hospital staff. Hackathon: single shared login or a
  couple of seeded hospital accounts, no real hospital integration/SSO.
- **Case** — one deceased person + intake context, regardless of which path produced it.
  Fields:
  - Decedent: name, date of birth, date/place of death, hospital/facility name
    (cause of death intentionally excluded — see Resolved questions)
  - Disposition preference: burial or cremation, or unsure
  - Family contact: name, email (required — this is the only contact channel; it's used
    for the invite/magic link and for auth)
  - Location (zip/county) — drives which funeral homes are eligible
  - `source`: `hospital` | `self_serve`
  - `status`: `pending_review` | `active` | `recommendations_ready`
- **IntakeDocument** — the raw PDF the hospital uploaded (stored as-is) plus the
  structured fields an LLM parse extracted from it, each field tagged with a confidence
  level. Only exists for `source=hospital` cases. If the parse produces no usable fields
  at all (corrupted file, non-text/scanned PDF, a document unrelated to a death), the
  Case is still created with every field blank rather than failing the upload — see
  Flow 1.
- **InviteToken** — one-time use, expires 24 hours after creation, tied to a Case,
  created only on the hospital flow. Besides gating signup/login for that specific Case,
  it pins the signup to the contact email the hospital entered — a family member cannot
  complete signup through the link with a different email address. If it expires before
  use, hospital staff resend it, which mints a fresh token (new 24-hour window) and
  invalidates the old one.
- **FamilyUser** — login for the family member. Created at signup, linked 1:1 to a Case
  (hackathon simplification — real product would allow multiple family members per case).
- **FuneralHome** — an existing, pre-compiled dataset covering all licensed funeral homes
  in Washington State: name, address/county, phone, cremation/burial capability, pricing,
  and rating. No religious/cultural capability tags are tracked (see Resolved questions).
- **Recommendation** — ranked list of FuneralHome records for a Case, with a short
  rationale per match ("12 min away, cremation from $X, highly rated").

## Flows in detail

### 1. Hospital upload (PDF)
- Hospital logs in, selects "New case."
- Uploads a PDF (the actual document a hospital would produce when a death occurs — e.g.
  a discharge/death paperwork packet). Hackathon: a handful of realistic sample PDFs,
  hand-authored or lightly redacted, checked into the repo as test fixtures. Upload is
  validated client-side — must be `application/pdf`, capped at 10MB — and anything else
  is rejected with an inline error before it reaches the parser.
- Hospital enters the family contact's email (required).
- System runs one LLM parse call over the PDF text to extract the Case fields above, each
  tagged with a confidence score; low-confidence fields are left blank rather than
  guessed. If the parse returns no usable fields at all, the Case is still created with
  everything blank — the family's confirmation screen in Flow 2 becomes the place those
  fields get filled in from scratch, rather than the upload failing outright.
- System creates the Case (`source=hospital`, `status=pending_review`) + an InviteToken
  (one-time use, expires in 24 hours), and sends the contact a link: `/invite/{token}`.

### 2. Family via invite link
- Family member opens `/invite/{token}`.
- If the token is valid, unused, and not expired: show a magic-link email sign-in, with
  the email field pre-filled to the contact email the hospital entered and locked (not
  editable) — this is what ties the signup to the intended family member rather than
  whoever has the link. They click the link sent to that inbox — no password to create or
  remember.
- If the token has expired or was already used: show a message directing them to contact
  the hospital for a new invite.
- On success: FamilyUser is created/linked, Case is attached to this FamilyUser.
- Family sees the parsed context from the hospital's PDF as an editable confirmation
  screen ("Here's what we have — anything to add or correct?"), since PDF parsing can
  miss or misread fields (and, per Flow 1, may be entirely blank if parsing failed).
  Confirming moves `status -> active`.

### 3. Family self-serve (no hospital)
- Family signs up directly from the homepage (no token, no PDF).
- They answer a short, three-question wizard instead of a long form:
  1. Location (zip code)
  2. Burial, cremation, or not sure
  3. Email (required — this is also how they sign in, via magic link; no password)
- Case is created with `source=self_serve`, `status=active` immediately (no review step,
  since there's no parsed document to double-check).

### 4. AI agent recommendation
- Triggered once a Case reaches `status=active` (post-confirmation for hospital path,
  immediately for self-serve path).
- Agent filters the FuneralHome dataset by location and disposition capability, then asks
  an LLM to rank and write a one-line rationale per match. Since the dataset covers every
  licensed funeral home in WA state rather than a small hand-picked list, the location
  filter narrows to the same/nearby county before ranking, so the LLM is never asked to
  rank more than a manageable candidate set (e.g., capped at ~15–20).
- If the filter returns zero funeral homes for a given location/disposition combination,
  Milestone 1 has no fallback — the recommendation screen may come back empty. Accepted
  as a known limitation for now (see Explicitly out of scope).
- Case `status -> recommendations_ready`; family sees a ranked shortlist with name,
  distance, price, and rationale.

## Tech stack
- **Frontend:** React (Vite), a static SPA — hospital login/dashboard + PDF upload,
  invite landing page, family login/signup, confirmation screen (hospital path), question
  wizard (self-serve path), recommendations view. Hosted on **Azure Static Web Apps**.
- **Backend:** no general-purpose API server. Auth and all Case/FuneralHome DB reads and
  writes go straight from the React app to Supabase via its client SDK and Row-Level
  Security — nothing custom to build there. The only server-side code is two small
  **Azure Functions** endpoints, for the two steps that need the Anthropic API key kept
  off the client: PDF parsing and recommendation ranking.
- **DB:** Supabase (Postgres) — free tier. One `role: hospital | family` claim covers
  both login types.
- **Storage:** Supabase Storage, for the uploaded PDFs.
- **Auth:** Supabase Auth, called directly from the React app (magic-link email, no
  custom backend). The invite token is a separate short-lived (24-hour) record stored in
  Postgres, not an auth mechanism itself — it gates which Case a new FamilyUser gets
  attached to and pins the signup to the contact email already on file.
- **PDF parsing:** one LLM call per upload (Claude's PDF input support), run inside an
  Azure Function, prompted to return the structured Case JSON with per-field confidence —
  no separate OCR pipeline needed for text-based PDFs.
- **AI agent (recommendation):** a second Azure Function, one LLM call per Case: input =
  confirmed Case JSON + filtered (location + disposition, capped to a manageable
  candidate count) FuneralHome candidates; output = ranked list + rationale strings. No
  multi-agent orchestration needed at Milestone 1.
- **Funeral home data:** an existing, pre-compiled dataset covering all licensed funeral
  homes in Washington State — name, address/county, phone, cremation/burial capability,
  pricing, and rating — checked into the repo as JSON/CSV, loaded into Supabase. Not
  hand-curated for the demo and not live GPL scraping.
- **Secrets:** the Anthropic API key lives only in Azure Function app settings, never in
  client code or the Supabase client config.

## Milestone 1 — demo script (what "done" looks like)
1. Hospital logs in, uploads a sample PDF for a demo patient, enters a family email.
2. Parsed fields + confidence are visible somewhere in the hospital or debug view (nice
   proof point for judges that it's really reading the PDF, not hardcoded).
3. Invite link is generated (can just be shown on screen for the demo instead of actually
   sending).
4. Open the invite link in a new session, sign up as the family member with the email
   locked to what the hospital entered, see the hospital-provided context pre-filled on a
   confirmation screen, confirm it.
5. See a ranked list of 3–5 recommended funeral homes with rationale.
6. Separately, demo the self-serve path: sign up with no invite, answer the 3-question
   wizard, get the same kind of recommendation list.

## Explicitly out of scope for Milestone 1
- Real hospital system integration/SSO.
- Live GPL scraping / calling funeral homes (Ntrust's price-discovery agent) — this repo
  uses the existing WA-state dataset instead.
- Multi-agent orchestration (vetting, negotiation, post-funeral checklist agents from
  Ntrust) — only the recommendation step exists here.
- Multiple family members per case, permissions/roles among family members.
- Payment, e-signature, or document generation (death certificates, permits).
- General-purpose document pipeline (scanned/handwritten PDFs, multi-page OCR edge cases)
  — Milestone 1 targets clean, text-based sample PDFs.
- Religious/cultural matching — not collected or matched on in Milestone 1 (see Resolved
  questions).
- Budget-based matching — not collected or matched on in Milestone 1 (see Resolved
  questions).
- Graceful handling when the location + disposition filter returns zero funeral homes —
  the recommendation screen may come back empty in that case; no fallback/widening logic
  for Milestone 1.

## Resolved questions
- **Cause of death:** excluded from the Case schema — not needed for funeral home
  matching, and sensitive. If present in a hospital PDF, the parser should ignore it
  rather than extract it.
- **Invite delivery:** real email, sent via Resend or Supabase's built-in email — not SMS
  or phone at all. Phone numbers aren't collected anywhere in Milestone 1; email is the
  single contact channel end-to-end, for both notification and auth.
- **Invite token identity:** the magic-link email on the invite landing page is pre-filled
  with the contact email the hospital entered and is not editable — a family member can't
  complete signup with a different address, even if the link itself gets forwarded or
  shared beyond the intended recipient.
- **Invite token expiry:** 24 hours from creation, one-time use. If it lapses before the
  family acts, hospital staff resend it, which mints a fresh token (new 24-hour window)
  and invalidates the old one.
- **Family auth:** email magic link, no password — both faster to build (Supabase Auth
  supports this natively, no password-reset flow needed) and the right UX for someone
  signing in once, under stress, shortly after a death. Email is therefore a **required**
  field everywhere a family contact is captured (hospital upload form and self-serve
  signup) — it's the only contact channel and doubles as the auth mechanism.
- **Religious/cultural requirements:** removed entirely from Milestone 1 — not in the Case
  schema, the self-serve wizard, the PDF parse target fields, the FuneralHome dataset's
  capability tags, or the ranking rationale. Funeral homes are matched on location,
  disposition, and price/rating only.
- **Budget range:** removed from the Case schema and the self-serve wizard. Milestone 1
  doesn't collect or filter on budget; price appears in the recommendation as information
  only.
- **Funeral home dataset:** sourced from an existing, pre-compiled list covering all
  licensed funeral homes in Washington State, including pricing and location data — not
  hand-curated for the demo and not scraped live.
