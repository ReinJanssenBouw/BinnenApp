-- Alleen BinnenApp guurncfxhcxwvgnzoeyp: behoud bestaande indelingen.
begin;
lock table private.location_layout in share row exclusive mode;
update private.location_layout l set racks=coalesce((select jsonb_agg(r || jsonb_build_object('rowColumns',coalesce(r->'rowColumns',to_jsonb(array_fill((r->>'columns')::integer,ARRAY[(r->>'rows')::integer])))) order by n) from jsonb_array_elements(l.racks) with ordinality as e(r,n)),'[]'::jsonb),revision=revision+1,updated_at=now();
create or replace function private.save_location_layout(p_racks jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rack jsonb; names text[] := '{}'; ids text[] := '{}'; normalized jsonb := '[]'; result jsonb; name text; rid text; rows_count integer; cols_count integer; row_columns jsonb; entry jsonb; old_rack jsonb;
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
  row_columns := rack->'rowColumns';
  if row_columns is null then
   select value into old_rack from private.location_layout l, jsonb_array_elements(l.racks) where value->>'id'=rid;
   if old_rack is not null and exists(select 1 from jsonb_array_elements_text(old_rack->'rowColumns') c where c::integer<>(old_rack->>'columns')::integer) then
    raise exception 'Deze stelling heeft verschillende kolommen per rij. Werk BinnenApp bij om de indeling te wijzigen.' using errcode='22023';
   end if;
   select jsonb_agg(cols_count) into row_columns from generate_series(1,rows_count);
  end if;
  if jsonb_typeof(row_columns)<>'array' then raise exception 'Ongeldige kolommen per rij.' using errcode='22023'; end if;
  if jsonb_array_length(row_columns)<>rows_count then raise exception 'Stel voor iedere rij het aantal kolommen in.' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(row_columns) loop
   if jsonb_typeof(entry)<>'number' or entry::text !~ '^[0-9]{1,2}$' then raise exception 'Kolommen moeten gehele aantallen zijn.' using errcode='22023'; end if;
   if (entry::text)::integer not between 1 and 50 then raise exception 'Kies 1 tot 50 kolommen per rij.' using errcode='22023'; end if;
  end loop;
  cols_count := (row_columns->>0)::integer;
  names:=array_append(names,lower(name)); ids:=array_append(ids,rid);
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',rid,'name',name,'rows',rows_count,'columns',cols_count,'rowColumns',row_columns));
 end loop;
 update private.location_layout set racks=normalized,revision=revision+1,updated_at=now()
 where id and revision=p_revision returning jsonb_build_object('racks',racks,'revision',revision) into result;
 if not found then raise exception 'De indeling is intussen gewijzigd. Laad de actuele indeling en probeer opnieuw.' using errcode='40001'; end if;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
