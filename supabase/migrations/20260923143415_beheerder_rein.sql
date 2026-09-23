begin;

-- Alleen het door de eigenaar aangewezen, bevestigde e-mailadres krijgt beheer.
-- Geen autorisatie op basis van door gebruikers aanpasbare metadata.
create or replace function private.activate_owner_after_verification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) = 'rein@janssen-bouw.nl'
     and new.email_confirmed_at is not null then
    insert into private.app_members(user_id,email,display_name,role,active)
    values (new.id,lower(new.email),nullif(trim(new.raw_user_meta_data->>'display_name'),''),'admin',true)
    on conflict(user_id) do update set email=excluded.email,role='admin',active=true;
  end if;
  return new;
end;
$$;

revoke all on function private.activate_owner_after_verification() from public,anon,authenticated,service_role;

create trigger binnenapp_owner_after_verified
after insert or update of email_confirmed_at on auth.users
for each row execute function private.activate_owner_after_verification();

commit;
