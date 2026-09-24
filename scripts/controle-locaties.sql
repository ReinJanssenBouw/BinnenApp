-- Alleen BinnenApp guurncfxhcxwvgnzoeyp; testgegevens worden teruggedraaid.
begin;
do $$
declare original jsonb; saved jsonb; admin_id uuid;
begin
 select user_id into admin_id from private.app_members where active and role='admin' limit 1;
 if admin_id is null then raise exception 'Geen beheerder beschikbaar';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 original:=public.binnenapp_get_location_layout();
 saved:=public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"Stelling A","rows":3,"columns":4},{"id":"22222222-2222-2222-2222-222222222222","name":"Stelling B","rows":2,"columns":6}]',(original->>'revision')::integer);
 if saved->'racks'->0->>'rows'<>'3' or saved->'racks'->1->>'columns'<>'6' then raise exception 'Afmetingen fout';end if;
 begin
  perform public.binnenapp_save_location_layout('[]',(original->>'revision')::integer);
  raise exception 'Verouderde opslag toegestaan';
 exception when sqlstate '40001' then null;end;
 begin
  perform public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"Stelling A","rows":0,"columns":4}]',(saved->>'revision')::integer);
  raise exception 'Ongeldige rijen toegestaan';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"A","rows":2,"columns":4},{"id":"22222222-2222-2222-2222-222222222222","name":"a","rows":3,"columns":5}]',(saved->>'revision')::integer);
  raise exception 'Dubbele stelling toegestaan';
 exception when sqlstate '22023' then null;end;

 saved:=public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"A","rows":3,"columns":2,"rowColumns":[2,4,3]}]',(saved->>'revision')::integer);
 if saved->'racks'->0->'rowColumns'<>'[2,4,3]'::jsonb then raise exception 'Kolommen per rij niet opgeslagen';end if;
 if public.binnenapp_get_location_layout()->'racks'->0->'rowColumns'<>'[2,4,3]'::jsonb then raise exception 'Kolommen per rij niet geladen';end if;
 begin
  perform public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"A","rows":3,"columns":2}]',(saved->>'revision')::integer);
  raise exception 'Oude client overschrijft verschillende kolommen';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"A","rows":3,"columns":2,"rowColumns":[2,4]}]',(saved->>'revision')::integer);
  raise exception 'Ontbrekende rij toegestaan';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.binnenapp_save_location_layout('[{"id":"11111111-1111-1111-1111-111111111111","name":"A","rows":3,"columns":2,"rowColumns":[2,0,3]}]',(saved->>'revision')::integer);
  raise exception 'Nul kolommen toegestaan';
 exception when sqlstate '22023' then null;end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin
  perform public.binnenapp_save_location_layout('[]',1);
  raise exception 'Onbevoegde opslag toegestaan';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select jsonb_array_length(racks) as opgeslagen_stellingen,revision from private.location_layout;
