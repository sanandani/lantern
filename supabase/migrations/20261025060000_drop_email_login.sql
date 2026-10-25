-- ---------------------------------------------------------------------------
-- Drop email login from the app.
--  * Family users sign in anonymously. Their invite link (or wizard draft) is the
--    only credential, so the signup trigger no longer reads a role from client
--    metadata: every new auth user is a family profile. Hospital and funeral home
--    accounts are seeded by scripts/seed-funeral-home-users.ts with the service role.
--  * redeem_invite_token no longer compares the signed-in email to the contact
--    email, since anonymous sessions have no email. The token is still single-use,
--    expires after 24 hours, and can only link a case that has no family user yet.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'family');
  return new;
end;
$$;

create or replace function redeem_invite_token(p_token text)
returns cases
language plpgsql
security definer set search_path = public
as $$
declare
  v_token invite_tokens;
  v_case cases;
begin
  select * into v_token from invite_tokens where token = p_token for update;

  if v_token is null or v_token.used_at is not null or v_token.expires_at <= now() then
    raise exception 'invite token is invalid, used, or expired';
  end if;

  update cases
  set family_user_id = auth.uid()
  where id = v_token.case_id and family_user_id is null
  returning * into v_case;

  if v_case is null then
    raise exception 'case not found or already linked to a family member';
  end if;

  update invite_tokens set used_at = now() where id = v_token.id;

  return v_case;
end;
$$;
