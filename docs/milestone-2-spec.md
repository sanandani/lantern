# AgenticLantern — Milestone 2 Spec (Hackathon)

Builds on `docs/spec.md` (M1) and the schema as actually migrated in
`supabase/migrations/`. M1 ends with a ranked list of funeral homes for a confirmed Case.
M2 connects the family member to those funeral homes: default quotes, custom quotes,
selection, progress tracking, predefined questions, and a funeral home side to receive
and answer requests.

**Optional-field rule:** M2 fields are optional and nice-to-have unless marked **Required**.
Blank values never block a flow.

## One-liner
The family's agent shows a default quote for each shortlisted funeral home, lets the family
compare and request changes, and after they pick one, tracks the case step by step.
Funeral homes answer quote requests with custom quotes and update the case as it moves
through their care.

## What changed from the previous draft
Revised against the migrated schema:
- Funeral home prices are two flat columns (`price_burial`, `price_cremation`), not a
  `price_info` JSON blob. The default quote is built from these two numbers. Line items
  exist only on quotes a funeral home writes itself.
- `profiles.role` only allows `hospital | family` today. M2 adds `funeral_home`, and a
  nullable `profiles.funeral_home_id` links a funeral home user to their home. Role is not
  a JWT claim (per CLAUDE.md), so RLS queries `profiles`.
- Default quotes are computed in the client from `funeral_homes`. The `quote-default`
  Azure Function from the earlier draft is dropped.
- Funeral homes write their own quotes and progress through RLS, not through the service
  role. This is different from `intake_documents` and `recommendations`, which stay
  service-role-only.
- The predefined prompt catalog lives in code, not in a table. Only answers are stored.

## Actors (additions to M1)
- **Family member** — unchanged. Can now see default quotes, request a quote, ask for
  changes, select a funeral home, follow progress, and send predefined prompts.
- **Funeral home user** — new. A staff login tied to one funeral home. Hackathon: seeded
  accounts, one per funeral home in the demo set. Sees only its own requests and cases.
- **Hospital user** — unchanged. Hospital-side questions use predefined prompts.
  Progress step 1 is set automatically when the case is created.
- **Family agent** — the M1 recommendation step extended to show quotes. No free-form
  chat in M2.

## Core entities (additions)

- **Selection** — the family's chosen funeral home for a Case, with a disposition
  (`burial` | `cremation`). One active selection per Case. Changing it sets the old
  selection to `replaced` and starts a new progress tracker.
- **Quote** — a priced estimate for one Case from one funeral home.
  - `kind`: `default` (derived, not stored) | `custom` (written by the funeral home)
  - `disposition`: `burial` | `cremation`
  - `version` (int), `status`: `sent` | `superseded` | `withdrawn`
  - `total` (numeric), `notes` (text), `sent_at`
  - A custom quote is created only after the family requests a quote or changes.
- **QuoteLineItem** — one line on a custom quote: `label`, `amount`, `optional` (bool),
  `category` (`service` | `cemetery` | `merchandise` | `fee` | `other`).
  - **Optional.** Totals work without line items.
- **QuoteRequest** — the family's request for a quote from one home for one Case.
  - `status`: `requested` | `responded` | `declined` | `withdrawn`
  - `change_requests` (text[]) — predefined change keys the family picked (e.g.
    `remove_gathering`, `cremation_instead`, `add_personal_items`).
- **ProgressEvent** — one step update on a selection.
  - `step` (see Progress steps), `status`: `pending` | `in_progress` | `done` | `skipped`
  - `updated_by_role`, `note` (optional, shown to family), `updated_at`
- **PromptThread** — one predefined question and its answer.
  - `audience`: `hospital` | `funeral_home`, `prompt_key` (from the in-code catalog),
    `answer` (nullable until answered), `created_at`, `answered_at`
- **FuneralHomeProfile** — optional self-description the home can set: contact name,
  cemetery partners, infant-case support, and a free-text note. Blank means "not set."

## Flows in detail

### 1. Default quotes and shortlist (family)
- Once M1 recommendations are ready, each shortlisted home shows a **default quote** on
  two tabs: **Burial** and **Cremation**.
- Default quote = the home's `price_burial` or `price_cremation`, labelled
  "Estimate — not yet confirmed by the funeral home." A missing price shows as
  "Not yet quoted," never as $0.
- Both tabs list **all** shortlisted homes. Each tab highlights its top choice: the
  highest-ranked home from M1 that offers that disposition (`burial_capable` or
  `cremation_capable`).
- The Case zip sets the default location. The family can change it on the screen, and the
  list re-filters with M1's county-then-nearby rule.
- The Case's `disposition_preference` sets the default tab. Both tabs are always visible.
- A home with no prices and no call-note data shows "Not yet quoted" with a
  "Request a quote" button.

### 2. Quote request and changes (family)
- **Get quote** creates a `QuoteRequest` (status `requested`). The home sees it in its
  inbox (flow 6A).
- **Ask for changes** on a default quote opens predefined change options:
  - "Remove the optional gathering"
  - "Cremation instead of burial" / "Burial instead of cremation"
  - "Add infant niche or cemetery placement"
  - "Include personal items and clothing"
  - "I need a payment plan"
  Selected options are stored on the request as `change_requests`.
- A funeral home replies with a **custom quote**. It writes a `quotes` row
  (`kind=custom`, `version` = previous + 1), optional line items, and a note. The previous
  quote becomes `superseded`. The request becomes `responded`.
- The family sees each quote labelled "Sent by {home} on {date}, version {n}" and can
  compare custom quotes with the default estimates side by side.
- Every quote carries the disclaimer "Estimate. Final charges are confirmed when you
  select a funeral home."

### 3. Selecting a funeral home
- The family picks one home and one disposition from its default or custom quote.
- A `selections` row is created and the progress tracker starts (flow 4).
- The home sees the case in its **In progress** list.
- Changing the selection later sets the old one to `replaced`, notifies the old home in
  its list, and starts a new tracker. Progress is not carried over.

### 4. Progress tracker (family)
One screen, shown after selection:

| # | Step key | Family-facing wording | Set by | Required |
|---|---|---|---|---|
| 1 | `hospital_care` | "Your loved one is in the hospital's care" | Auto at case creation (`done`) | Yes |
| 2 | `transfer` | "Our team has collected your loved one from the hospital" | Funeral home | Yes |
| 3 | `personal_items` | "We are collecting the clothing and personal items you asked for" | Funeral home | Optional — shown only if the family picked `Include personal items` |
| 4 | `preparation` | "Your loved one is being prepared for {burial / cremation}" | Funeral home | Yes |
| 5 | `service_booked` | "A time for prayers and gathering has been booked" | Funeral home | Yes |
| 6 | `completed` | "{Burial / Cremation} completed" | Funeral home | Yes |

- Each step shows its status, the date it was updated, and an optional note from the home.
- Step 3 is hidden, not shown as skipped, when it was not requested.
- Steps move forward. A home can correct a step but cannot delete history; corrections are
  new events.

### 5. Predefined questions (family and hospital)
Two panels on the progress screen: **Ask the hospital** and **Ask the funeral home**. Each
is a list of buttons; tapping one creates a `PromptThread` for that audience. The reply
shows in the thread when answered.

Starter catalog (keys are stable; wording is what the user sees):

*Ask the hospital*
- `hosp_location` — "Where is my loved one right now?"
- `hosp_belongings` — "When can we collect belongings or paperwork?"
- `hosp_death_cert` — "Who do we contact about the death certificate?"
- `hosp_contact` — "Can you update my contact details?"

*Ask the funeral home*
- `fh_status` — "What is the status of my request?"
- `fh_change_disposition` — "Can I change from burial to cremation?"
- `fh_personal_items` — "Can I add or change clothing or personal items?"
- `fh_gathering` — "Can I add a prayer or gathering time?"
- `fh_cemetery` — "Can I change the cemetery or plot?"
- `fh_total` — "What is the total cost so far?"
- `fh_service_time` — "Can you confirm the date and time of the service?"
- `fh_payment` — "I'd like payment plan or financial assistance information."

Free-text questions are out of scope for M2.

### 6. Funeral home screens
Scoped to the user's own `funeral_home_id`.

**A. Inbound requests**
- Lists `quote_requests` with `status=requested` for this home. Each row shows the
  disposition the family wants, the zip, and the change requests picked.
- Opening a request shows the **default quote** pre-filled with the home's prices.
  The home can edit the total, add or remove line items, add a note, and **Send custom
  quote**. Sending marks the request `responded`.
- **Decline** sets the request to `declined` with an optional reason.

**B. In progress and completed**
- Two lists: **In progress** (selection active, step not `completed`) and **Completed**.
- Each case shows the information the home needs for its paperwork, grouped:
  - Decedent: name, date of death, date of birth, age at death, residence zip and county
  - Family contact: name, relationship, email
  - Disposition and the accepted quote (version and total)
  - Progress: current step, with a control to update it and an optional note
  - Requests: personal items and clothing, change requests, and any family prompts
  - Prompt threads, with a reply box per open prompt
- Completing step 6 moves the case to **Completed**. Completed cases are read-only.
- **Optional for M2:** the worksheet fields the home fills in (birthplace, marital status,
  occupation, parents, informant address, disposition place and date). Show them as
  blank, editable fields. Nothing is required to complete a case.

### 7. Edge cases
- The home can send a new custom quote any time before the family selects it. Each send
  is a new version.
- Custom line items are labelled as custom. Financial assistance (e.g. TEARS Foundation,
  up to $500, per the call notes) appears as an information note, not as a subtraction.
- A home with no price set appears in the shortlist as "Not yet quoted" and can still
  receive requests.

## Seed data (from funeral home call notes)
The call notes are manual and unverified. They seed the demo and are not live pricing.

- **Prices for `funeral_homes`:** the notes don't give a clean burial or cremation price
  per home, so seed `price_burial`/`price_cremation` only where a total is clear. Leave the
  rest null ("Not yet quoted"). Record the rest as text in the funeral home's note.
- **Itemized custom quotes:** where a home's notes list line items (direct removal, plot,
  opening and closing, casket, interment, office processing, optional gathering), seed one
  `custom` quote, version 1, with those line items. Mark it as seeded from call notes.
- **Infant niche range** (cemetery, e.g. $1,300–$1,600): store as a note, not a price.
- **Two homes** were not reached or did not quote. Show them as "Not yet quoted."
- Phone numbers and staff names from the notes are internal. Do not store them in
  family-facing data.

## Data and security

New or changed objects, following M1 naming:

```
profiles
  + role check now allows 'funeral_home'
  + funeral_home_id uuid null references funeral_homes(id)
  + check: role = 'funeral_home' implies funeral_home_id is not null

funeral_homes
  + profile_note text null              -- call-note text, not family-facing

selections            (id, case_id, funeral_home_id, disposition, status, created_at)
quotes                (id, case_id, funeral_home_id, kind, disposition, version,
                       status, total, notes, sent_at, created_by)
quote_line_items      (id, quote_id, label, amount, optional, category)
quote_requests        (id, case_id, funeral_home_id, disposition, change_requests text[],
                       status, decline_reason, created_at)
progress_events       (id, selection_id, step, status, note, updated_by, updated_at)
prompt_threads        (id, case_id, audience, prompt_key, answer, created_at, answered_at)
```

Policies (RLS):
- **Family:** read and write only rows whose case has `family_user_id = auth.uid()`. The
  family can insert `quote_requests` and `selections` and insert `prompt_threads` with
  `audience = 'funeral_home'`. Read-only on `quotes` and `progress_events`.
- **Funeral home:** read rows whose `funeral_home_id` is its own, and only for cases with a
  request or a selection with that home. Write `quotes`, `quote_line_items`,
  `progress_events`, and `prompt_threads.answer` only for its own cases.
- **Hospital:** read `progress_events` and `prompt_threads` (audience `hospital`) for
  cases it created. Read-only on the case. Cannot read quotes.
- **Anyone:** `funeral_homes` stays public read. A funeral home user can update only its
  own `profile_note` and profile fields.

Acceptance (written tests, same bar as T0.3):
- A funeral home user cannot read another home's requests, quotes, or cases.
- A family user cannot read another family's quotes or progress.
- A hospital user cannot read quotes.
- A funeral home cannot select or update a case it has no request or selection for.

## Azure Functions
None are required for M2. Default quotes are computed in the client from
`funeral_homes`. Custom quotes and progress are written directly through RLS.

Optional, only if time allows: a `recommend` update that adds a one-line price note per
home to its rationale (M1 T5.2 already sends prices). No new function is planned.

## Demo script (done for M2)
1. Family opens the shortlist. Burial and Cremation tabs each list the homes with
   estimates. The top choice is highlighted.
2. Family changes the zip. The list re-filters.
3. Family asks for changes on one default quote ("Remove the optional gathering") and
   requests a quote from a second home.
4. Funeral home user logs in, sees both requests, and sends a custom quote with a
   revised total. Family sees version 2 labelled "Sent by…"
5. Family selects the home and disposition. The progress tracker starts at step 1.
6. Funeral home moves the case through the steps. Family sees each change. Step 3 appears
   only when personal items were requested.
7. Family sends a predefined question to each side. Replies show in the thread.
8. Funeral home completes the case. It moves to the Completed list, read-only.

## Explicitly out of scope for M2
- Free-text chat with the agent or with either party.
- Payments, invoicing, and financial assistance calculation.
- Automatic email or SMS per progress step. In-app only. Email is sent for "quote sent"
  and "selection confirmed" only (Decision 3).
- Multiple family members per case, and splitting one case across homes.
- Live pricing feeds. Prices are dataset values or values the home enters.
- Document generation for the WA worksheet. A separate item if time allows, using
  `fixtures/sample-pdfs/02-wa-death-certificate-worksheet.pdf`.

## Decisions
1. **Funeral home accounts are seeded**, one user per home. The seed script sets
   `profiles.funeral_home_id`. No self-registration.
2. **No clean price data yet.** Most homes show "Not yet quoted" until a home sends a
   custom quote. Prices from the call notes are seeded only where clear.
3. **Emails are in M2 scope** for "quote sent" and "selection confirmed." Delivery goes
   through the same email provider as M1 invites (Resend or Supabase built-in, per the M1
   open item). Progress-step emails stay out of scope.
4. **Disposition split:** the family chooses burial, cremation, or unsure (M1 options). The
   funeral home records the full worksheet list (donation, entombment, removal from state,
   body not recovered, other) on its side.
