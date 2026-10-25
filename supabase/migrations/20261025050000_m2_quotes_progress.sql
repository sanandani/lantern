-- ---------------------------------------------------------------------------
-- Milestone 2: funeral home side, quotes, selection, progress, predefined prompts.
-- Per docs/milestone-2-spec.md. Funeral home users write their own quotes and
-- progress directly through RLS (unlike intake_documents/recommendations, which
-- stay service-role-only).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- profiles: add the funeral_home role and link it to one funeral home.
-- ---------------------------------------------------------------------------
alter table profiles drop constraint profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('hospital', 'family', 'funeral_home'));

alter table profiles
  add column funeral_home_id uuid references funeral_homes (id);

alter table profiles
  add constraint profiles_funeral_home_link_check
  check (role <> 'funeral_home' or funeral_home_id is not null);

-- Signup metadata may only grant hospital or family. Funeral home accounts are
-- seeded by scripts/seed-funeral-home-users.ts, so a client cannot self-assign
-- the funeral_home role at signup.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'hospital' then 'hospital' else 'family' end
  );
  return new;
end;
$$;

-- Returns the funeral home the signed-in user belongs to (null otherwise).
-- security definer so policies can use it without re-entering profiles RLS.
create function my_funeral_home_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select funeral_home_id from profiles where id = auth.uid() and role = 'funeral_home';
$$;

grant execute on function my_funeral_home_id() to authenticated;

-- ---------------------------------------------------------------------------
-- selections: the family's chosen funeral home for a case. One active at a time.
-- ---------------------------------------------------------------------------
create table selections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  funeral_home_id uuid not null references funeral_homes (id),
  disposition text not null check (disposition in ('burial', 'cremation')),
  status text not null default 'active' check (status in ('active', 'replaced')),
  created_at timestamptz not null default now()
);

create unique index selections_one_active_per_case
  on selections (case_id) where status = 'active';

alter table selections enable row level security;

create policy "selections_family_select"
  on selections for select to authenticated
  using (exists (select 1 from cases c where c.id = selections.case_id and c.family_user_id = auth.uid()));

create policy "selections_family_insert"
  on selections for insert to authenticated
  with check (exists (select 1 from cases c where c.id = selections.case_id and c.family_user_id = auth.uid()));

-- Family replaces the old selection (status -> replaced) before inserting a new one.
create policy "selections_family_update"
  on selections for update to authenticated
  using (exists (select 1 from cases c where c.id = selections.case_id and c.family_user_id = auth.uid()));

create policy "selections_hospital_select"
  on selections for select to authenticated
  using (exists (select 1 from cases c where c.id = selections.case_id and c.hospital_id = auth.uid()));

create policy "selections_funeral_home_select"
  on selections for select to authenticated
  using (funeral_home_id = my_funeral_home_id());

-- ---------------------------------------------------------------------------
-- quotes: default quotes are derived in the client from funeral_homes prices.
-- Stored rows are custom quotes written by a funeral home.
-- ---------------------------------------------------------------------------
create table quotes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  funeral_home_id uuid not null references funeral_homes (id),
  disposition text not null check (disposition in ('burial', 'cremation')),
  version int not null default 1,
  status text not null default 'sent' check (status in ('sent', 'superseded', 'withdrawn')),
  total numeric not null check (total >= 0),
  notes text,
  sent_at timestamptz not null default now(),
  unique (case_id, funeral_home_id, disposition, version)
);

alter table quotes enable row level security;

create policy "quotes_family_select"
  on quotes for select to authenticated
  using (exists (select 1 from cases c where c.id = quotes.case_id and c.family_user_id = auth.uid()));

-- Hospital users get no quotes policy: RLS denies by default.

create policy "quotes_funeral_home_select"
  on quotes for select to authenticated
  using (funeral_home_id = my_funeral_home_id());

create policy "quotes_funeral_home_update"
  on quotes for update to authenticated
  using (funeral_home_id = my_funeral_home_id());

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  label text not null,
  amount numeric not null check (amount >= 0),
  optional boolean not null default false,
  category text not null default 'other' check (category in ('service', 'cemetery', 'merchandise', 'fee', 'other')),
  sort_order int not null default 0
);

alter table quote_line_items enable row level security;

create policy "quote_line_items_family_select"
  on quote_line_items for select to authenticated
  using (exists (
    select 1 from quotes q join cases c on c.id = q.case_id
    where q.id = quote_line_items.quote_id and c.family_user_id = auth.uid()
  ));

create policy "quote_line_items_funeral_home_select"
  on quote_line_items for select to authenticated
  using (exists (select 1 from quotes q where q.id = quote_line_items.quote_id and q.funeral_home_id = my_funeral_home_id()));

create policy "quote_line_items_funeral_home_insert"
  on quote_line_items for insert to authenticated
  with check (exists (select 1 from quotes q where q.id = quote_line_items.quote_id and q.funeral_home_id = my_funeral_home_id()));

create policy "quote_line_items_funeral_home_delete"
  on quote_line_items for delete to authenticated
  using (exists (select 1 from quotes q where q.id = quote_line_items.quote_id and q.funeral_home_id = my_funeral_home_id()));

-- ---------------------------------------------------------------------------
-- quote_requests: family asks a funeral home for a quote on one disposition.
-- ---------------------------------------------------------------------------
create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  funeral_home_id uuid not null references funeral_homes (id),
  disposition text not null check (disposition in ('burial', 'cremation')),
  change_requests text[] not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'responded', 'declined', 'withdrawn')),
  decline_reason text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- One open request per case/home/disposition.
create unique index quote_requests_one_open
  on quote_requests (case_id, funeral_home_id, disposition) where status = 'requested';

alter table quote_requests enable row level security;

create policy "quote_requests_family_select"
  on quote_requests for select to authenticated
  using (exists (select 1 from cases c where c.id = quote_requests.case_id and c.family_user_id = auth.uid()));

create policy "quote_requests_family_insert"
  on quote_requests for insert to authenticated
  with check (exists (select 1 from cases c where c.id = quote_requests.case_id and c.family_user_id = auth.uid()));

create policy "quote_requests_family_update"
  on quote_requests for update to authenticated
  using (exists (select 1 from cases c where c.id = quote_requests.case_id and c.family_user_id = auth.uid()));

create policy "quote_requests_funeral_home_select"
  on quote_requests for select to authenticated
  using (funeral_home_id = my_funeral_home_id());

create policy "quote_requests_funeral_home_update"
  on quote_requests for update to authenticated
  using (funeral_home_id = my_funeral_home_id());

-- A funeral home may only quote a case it has an open request for.
-- Defined here, after quote_requests exists.
create policy "quotes_funeral_home_insert"
  on quotes for insert to authenticated
  with check (
    funeral_home_id = my_funeral_home_id()
    and exists (
      select 1 from quote_requests r
      where r.case_id = quotes.case_id and r.funeral_home_id = quotes.funeral_home_id
    )
  );

-- ---------------------------------------------------------------------------
-- progress_events: append-only. The current state of a step is its latest event.
-- Step 1 (hospital care) is not stored; the client treats it as done.
-- ---------------------------------------------------------------------------
create table progress_events (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references selections (id) on delete cascade,
  step text not null check (step in ('transfer', 'personal_items', 'preparation', 'service_booked', 'completed')),
  status text not null check (status in ('in_progress', 'done', 'skipped')),
  note text,
  updated_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table progress_events enable row level security;

create policy "progress_events_family_select"
  on progress_events for select to authenticated
  using (exists (
    select 1 from selections s join cases c on c.id = s.case_id
    where s.id = progress_events.selection_id and c.family_user_id = auth.uid()
  ));

create policy "progress_events_hospital_select"
  on progress_events for select to authenticated
  using (exists (
    select 1 from selections s join cases c on c.id = s.case_id
    where s.id = progress_events.selection_id and c.hospital_id = auth.uid()
  ));

create policy "progress_events_funeral_home_select"
  on progress_events for select to authenticated
  using (exists (select 1 from selections s where s.id = progress_events.selection_id and s.funeral_home_id = my_funeral_home_id()));

create policy "progress_events_funeral_home_insert"
  on progress_events for insert to authenticated
  with check (exists (select 1 from selections s where s.id = progress_events.selection_id and s.funeral_home_id = my_funeral_home_id()));

-- ---------------------------------------------------------------------------
-- prompt_threads: one predefined question and its answer. prompt_key is from
-- the in-code catalog (src/lib/m2.ts), not a table.
-- ---------------------------------------------------------------------------
create table prompt_threads (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  audience text not null check (audience in ('hospital', 'funeral_home')),
  funeral_home_id uuid references funeral_homes (id),
  prompt_key text not null,
  answer text,
  asked_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (audience <> 'funeral_home' or funeral_home_id is not null)
);

alter table prompt_threads enable row level security;

create policy "prompt_threads_family_select"
  on prompt_threads for select to authenticated
  using (exists (select 1 from cases c where c.id = prompt_threads.case_id and c.family_user_id = auth.uid()));

create policy "prompt_threads_family_insert"
  on prompt_threads for insert to authenticated
  with check (exists (select 1 from cases c where c.id = prompt_threads.case_id and c.family_user_id = auth.uid()));

create policy "prompt_threads_hospital_select"
  on prompt_threads for select to authenticated
  using (audience = 'hospital' and exists (select 1 from cases c where c.id = prompt_threads.case_id and c.hospital_id = auth.uid()));

create policy "prompt_threads_hospital_update"
  on prompt_threads for update to authenticated
  using (audience = 'hospital' and exists (select 1 from cases c where c.id = prompt_threads.case_id and c.hospital_id = auth.uid()));

create policy "prompt_threads_funeral_home_select"
  on prompt_threads for select to authenticated
  using (audience = 'funeral_home' and funeral_home_id = my_funeral_home_id());

create policy "prompt_threads_funeral_home_update"
  on prompt_threads for update to authenticated
  using (audience = 'funeral_home' and funeral_home_id = my_funeral_home_id());

-- ---------------------------------------------------------------------------
-- cases: funeral home users may read a case they have a request or selection for.
-- Checked through a security-definer helper: a direct subquery here would make
-- cases -> quote_requests/selections -> cases policies recurse forever.
-- ---------------------------------------------------------------------------
create function funeral_home_has_case(p_case_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from quote_requests r where r.case_id = p_case_id and r.funeral_home_id = my_funeral_home_id()
  ) or exists (
    select 1 from selections s where s.case_id = p_case_id and s.funeral_home_id = my_funeral_home_id()
  );
$$;

grant execute on function funeral_home_has_case(uuid) to authenticated;

create policy "cases_funeral_home_select"
  on cases for select to authenticated
  using (funeral_home_has_case(cases.id));
