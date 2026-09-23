begin;
insert into auth.users(id,email,raw_user_meta_data)
values('f29a25c1-e242-490c-9da6-8bc799eaa440','rein@janssen-bouw.nl','{"display_name":"Beheercontrole"}');
do $$ begin
  if exists(select 1 from private.app_members where user_id='f29a25c1-e242-490c-9da6-8bc799eaa440' and (active or role='admin')) then
    raise exception 'Onbevestigd account heeft beheerrechten';
  end if;
end $$;
update auth.users set email_confirmed_at=now() where id='f29a25c1-e242-490c-9da6-8bc799eaa440';
do $$ begin
  if not exists(select 1 from private.app_members where user_id='f29a25c1-e242-490c-9da6-8bc799eaa440' and active and role='admin') then
    raise exception 'Bevestigde beheerder heeft geen rechten';
  end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('f29a25c1-e242-490c-9da6-8bc799eaa441','ander@example.invalid',now(),'{"role":"admin"}');
do $$ begin
  if exists(select 1 from private.app_members where user_id='f29a25c1-e242-490c-9da6-8bc799eaa441' and (active or role='admin')) then
    raise exception 'Ander adres kreeg onterecht beheerrechten';
  end if;
end $$;
select 'Geslaagd: alleen bevestigd rein@janssen-bouw.nl krijgt automatisch beheerrechten.' as controle;
rollback;
