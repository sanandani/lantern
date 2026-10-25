# AgenticLantern

When a death occurs, a hospital (or the family directly) starts a case. An AI agent reads
the intake context and recommends funeral homes to the family member, who signs up
through a dedicated link.

- **Spec (source of truth):** [`docs/spec.md`](docs/spec.md)
- **Task plan:** [`docs/milestone-1-tasks.md`](docs/milestone-1-tasks.md)

## Stack

React (Vite) SPA, talking to Supabase (Postgres + Auth + Storage) directly via its client
SDK and Row-Level Security — no custom CRUD backend. Two Azure Functions (not yet built)
handle the only steps that need the Anthropic API key off the client: PDF parsing and
recommendation ranking. Hosted on Azure Static Web Apps, auto-deployed from `main`.

## Prerequisites

- Node.js 20+ and npm
- A Supabase account (free tier) — ask a teammate for access to the `AgenticLantern`
  project, or create your own for local development
- The Supabase CLI — no install needed, invoked via `npx supabase@latest`

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Set up environment variables**
   ```
   cp .env.example .env
   ```
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are **not secrets** — the
   publishable key is designed to ship inside the client bundle (RLS does the actual
   access control), and the URL is public by definition. So the project's current values
   are just written here rather than making every teammate (or agent) hunt for them or
   ask someone else's session:
   ```
   VITE_SUPABASE_URL=https://sfsycncjxglfiqidhvtf.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_RMdKeDYAhp6mOtPgzTIUWA_CdaRgpPu
   ```
   If these ever stop working (key rotated, new project), get current values from the
   Supabase dashboard → the project → **Project Settings → API Keys** (Supabase renamed
   this page from the old "API" settings; "anon key" is now labeled "publishable key"
   there).

   The `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` entries are the opposite —
   **genuine secrets**, used only by the Azure Functions (not yet built), never put in
   client code, and never committed here even as a placeholder value. Get those from
   whoever holds them (Harsh) or from the Azure Function App's own settings once the
   Functions exist — not from the Supabase dashboard, and not by asking another agent
   session, which won't have them either. Leave both blank in `.env` for frontend-only
   work.

3. **Link the Supabase project and apply migrations**
   ```
   npx supabase login
   npx supabase link --project-ref sfsycncjxglfiqidhvtf
   npx supabase db push
   ```
   This applies everything in `supabase/migrations/`: the `cases`/`intake_documents`/
   `invite_tokens`/`funeral_homes`/`recommendations` schema, RLS policies, the
   `invite_token_lookup`/`redeem_invite_token` functions, and the private
   `intake-documents` storage bucket.

4. **Run the dev server**
   ```
   npm run dev
   ```
   Open the printed `localhost` URL. The homepage runs a live Supabase connectivity check
   against `funeral_homes` — "Supabase connection: ok" confirms steps 2–3 worked.

## Other scripts

```
npm run build     # type-checks, then builds to build/ (not Vite's default dist/ —
                   # must match output_location in the Azure SWA workflow)
npm run lint       # oxlint
npm run preview    # serve the production build locally
```

## Deployment

Every push to `main` triggers `.github/workflows/azure-static-web-apps-*.yml`, which
builds and deploys to Azure Static Web Apps automatically — no manual deploy step.

The build needs `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` at *build time* (Vite
inlines `VITE_*` vars into the bundle), so they're set as GitHub repo variables
(Settings → Secrets and variables → Actions → Variables) and passed into the workflow's
build step — see the `env:` block under "Build And Deploy" in the workflow file. If the
deployed site loads but renders blank, check that those two variables are still set and
still correct; a missing/stale value throws in `src/lib/supabase.ts` before anything
renders, with the deploy itself still reporting success.

## Project layout

```
src/lib/supabase.ts         Supabase client (reads VITE_SUPABASE_URL / _PUBLISHABLE_KEY)
supabase/migrations/        Schema + RLS, applied via `supabase db push`
docs/spec.md                Product spec — source of truth for the data model and flows
docs/milestone-1-tasks.md   Phased task plan with acceptance criteria
fixtures/sample-pdfs/       Sample hospital/death-certificate PDFs for parser testing
Context/                    Reference images the sample PDFs were generated from
```
