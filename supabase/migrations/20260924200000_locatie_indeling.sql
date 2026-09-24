-- Alleen BinnenApp guurncfxhcxwvgnzoeyp.
begin;
create table private.location_layout (
 id boolean primary key default true check(id),
 racks jsonb not null default '[]',
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
insert into private.location_layout(id) values(true);
revoke all on private.location_layout from public,anon,authenticated;
create function private.get_location_layout() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_app_member();
 return (select jsonb_build_object('racks',racks,'revision',revision) from private.location_layout where id);
end $$;
create function private.save_location_layout(p_racks jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rack jsonb; names text[] := '{}'; ids text[] := '{}'; normalized jsonb := '[]'; result jsonb; name text; rid text; rows_count integer; cols_count integer;
begin
 perform private.assert_admin();
 perform private.check_write_rate_limit('location_layout',60,interval '5 minutes');
 if p_racks is null or jsonb_typeof(p_racks)<>'array' then raise exception 'Ongeldige stellingen.' using errcode='22023'; end if;
 if jsonb_array_length(p_racks)>100 then raise exception 'Maximaal 100 stellingen.' using errcode='22023'; end if;
 for rack in select value from jsonb_array_elements(p_racks) loop
  name := btrim(coalesce(rack->>'name','')); rid:=coalesce(rack->>'id','');
  if length(name)<1 or length(name)>64 or name ~ '[[:cntrl:]]' or lower(name)=any(names) then
   raise exception 'Geef elke stelling een unieke naam van 1 tot 64 tekens.' using errcode='22023'; end if;
  if rid !~ '^[a-f0-9-]{36}$' or rid=any(ids) then raise exception 'Ongeldige stellingcode.' using errcode='22023'; end if;
  if coalesce(rack->>'rows','') !~ '^[0-9]{1,2}$' or coalesce(rack->>'columns','') !~ '^[0-9]{1,2}$' then
   raise exception 'Rijen en kolommen moeten gehele aantallen zijn.' using errcode='22023'; end if;
  rows_count := (rack->>'rows')::integer; cols_count := (rack->>'columns')::integer;
  if rows_count not between 1 and 50 or cols_count not between 1 and 50 then
   raise exception 'Kies 1 tot 50 rijen en kolommen per stelling.' using errcode='22023'; end if;
  names:=array_append(names,lower(name)); ids:=array_append(ids,rid);
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',rid,'name',name,'rows',rows_count,'columns',cols_count));
 end loop;
 update private.location_layout set racks=normalized,revision=revision+1,updated_at=now()
 where id and revision=p_revision returning jsonb_build_object('racks',racks,'revision',revision) into result;
 if not found then raise exception 'De indeling is intussen gewijzigd. Laad de actuele indeling en probeer opnieuw.' using errcode='40001'; end if;
 return result;
end $$;
create function public.binnenapp_get_location_layout() returns jsonb language sql set search_path='' as $$ select private.get_location_layout(); $$;
create function public.binnenapp_save_location_layout(p_racks jsonb,p_revision integer) returns jsonb language sql set search_path='' as $$ select private.save_location_layout(p_racks,p_revision); $$;
revoke all on function private.get_location_layout(),private.save_location_layout(jsonb,integer),public.binnenapp_get_location_layout(),public.binnenapp_save_location_layout(jsonb,integer) from public,anon;
grant execute on function private.get_location_layout(),private.save_location_layout(jsonb,integer),public.binnenapp_get_location_layout(),public.binnenapp_save_location_layout(jsonb,integer) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
