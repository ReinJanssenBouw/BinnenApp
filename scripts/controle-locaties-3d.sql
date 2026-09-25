-- Uitsluitend BinnenApp guurncfxhcxwvgnzoeyp; alle testwijzigingen rollen terug.
begin;
do $$
declare a uuid; d jsonb; g jsonb; r jsonb; baseline jsonb; p bigint; rev integer; sr integer;
 rid text:='44444444-4444-4444-4444-444444444444';
begin
 select user_id into a from private.app_members where active and role='admin' limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 select jsonb_agg(to_jsonb(t) order by id) into baseline from public.products t;
 select id into p from public.products order by id limit 1;
 d:=public.binnenapp_get_location_scene();
 rev:=(d->>'revision')::integer;sr:=(d->>'sceneRevision')::integer;
 r:=(d->'racks')||jsonb_build_array(jsonb_build_object('id',rid,'name','3D rollback-test','rows',2,'columns',3,'rowColumns','[3,4]'::jsonb));
 g:=jsonb_build_object('version',1,'racks',(d->'geometry'->'racks')||jsonb_build_object(rid,'{"width":240,"height":180,"depth":85,"x":260,"z":0,"angle":90}'::jsonb),'products',(d->'geometry'->'products')||jsonb_build_object(p::text,'{"width":12.5,"height":25,"depth":20}'::jsonb));
 d:=public.binnenapp_save_location_scene(r,g,rev,sr);
 if d->'geometry' is distinct from g or (d->>'sceneRevision')::integer<>sr+1 then raise exception 'Maten niet opgeslagen';end if;
 if public.binnenapp_get_location_scene()->'geometry' is distinct from g then raise exception 'Maten niet herladen';end if;
 begin
  perform public.binnenapp_save_location_scene(r,g,(d->>'revision')::integer,sr);
  raise exception 'Verouderde modelversie toegestaan';
 exception when sqlstate '40001' then null;end;
 begin
  perform public.binnenapp_save_location_scene(r,g,rev,(d->>'sceneRevision')::integer);
  raise exception 'Verouderde indeling toegestaan';
 exception when sqlstate '40001' then null;end;
 begin
  perform public.binnenapp_save_location_scene(r,jsonb_set(g,array['racks',rid,'depth'],'-1'),(d->>'revision')::integer,(d->>'sceneRevision')::integer);
  raise exception 'Negatieve diepte toegestaan';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.binnenapp_save_location_scene(r,jsonb_set(g,array['products',p::text,'width'],'0'),(d->>'revision')::integer,(d->>'sceneRevision')::integer);
  raise exception 'Lege productbreedte toegestaan';
 exception when sqlstate '22023' then null;end;
 -- Mobiele/oude desktopindeling mag maten niet verliezen.
 perform public.binnenapp_save_location_layout(r,(d->>'revision')::integer);
 d:=public.binnenapp_get_location_scene();
 if d->'geometry' is distinct from g then raise exception 'Oude client verliest maten';end if;
 if baseline is distinct from (select jsonb_agg(to_jsonb(t) order by id) from public.products t) then raise exception 'Productgegevens gewijzigd';end if;
 -- Een lid kan kijken, maar niet het magazijnmodel wijzigen.
 update private.app_members set role='member' where user_id=a;
 perform public.binnenapp_get_location_scene();
 begin
  perform public.binnenapp_save_location_scene(r,g,(d->>'revision')::integer,(d->>'sceneRevision')::integer);
  raise exception 'Lid mocht model bewerken';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin
  perform public.binnenapp_get_location_scene();
  raise exception 'Onbevoegde kon model lezen';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.binnenapp_get_location_scene()','execute') or has_table_privilege('authenticated','private.location_scene','select') then raise exception 'Te brede directe toegang';end if;
end $$;
rollback;
select '3D-opslag, herladen, revisies, maatgrenzen, oude client, rechten en behoud van alle productgegevens: geslaagd' as resultaat;
