-- Alleen BinnenApp guurncfxhcxwvgnzoeyp. Alles wordt teruggedraaid.
begin;
do $$
declare a uuid; p public.products; d jsonb; rev integer; stamp timestamptz; baseline jsonb; after_test jsonb;
begin
 select user_id into a from private.app_members where active and role='admin' limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 select jsonb_agg(jsonb_build_array(id,stock,min_stock) order by id) into baseline from public.products;
 select * into p from public.products order by id limit 1;
 select revision into rev from private.location_layout;
 -- Bestaande layout blijft staan, alleen een tijdelijke teststelling erbij.
 d:=public.binnenapp_save_location_layout((select racks from private.location_layout)||'[{"id":"33333333-3333-3333-3333-333333333333","name":"Test productlocaties","rows":2,"columns":2,"rowColumns":[2,3]}]'::jsonb,rev);
 rev:=(d->>'revision')::integer;
 d:=public.binnenapp_assign_product_location(p.id,'33333333-3333-3333-3333-333333333333',3,2,rev,p.updated_at);
 if not exists(select 1 from public.products where id=p.id and rack='Test productlocaties' and x_axis='3' and y_axis='2') then raise exception 'Toewijzen mislukt';end if;
 begin
  perform public.binnenapp_assign_product_location(p.id,'33333333-3333-3333-3333-333333333333',1,1,rev,p.updated_at);
  raise exception 'Verouderd product overschreven';
 exception when sqlstate '40001' then null;end;
 select updated_at into stamp from public.products where id=p.id;
 begin
  perform public.binnenapp_assign_product_location(p.id,'33333333-3333-3333-3333-333333333333',3,1,rev,stamp);
  raise exception 'Niet bestaand vak toegestaan';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.binnenapp_save_location_layout((select jsonb_agg(r) from private.location_layout,jsonb_array_elements(racks) r where r->>'id'<>'33333333-3333-3333-3333-333333333333'),rev);
  raise exception 'Bezet vak verwijderd';
 exception when sqlstate '22023' then null;end;
 d:=public.binnenapp_save_location_layout((select jsonb_agg(case when r->>'id'='33333333-3333-3333-3333-333333333333' then r||'{"name":"Test hernoemd"}'::jsonb else r end) from private.location_layout,jsonb_array_elements(racks) r),rev);
 rev:=(d->>'revision')::integer;
 if not exists(select 1 from public.products where id=p.id and rack='Test hernoemd') then raise exception 'Hernoemen mislukt';end if;
 select updated_at into stamp from public.products where id=p.id;
 d:=public.binnenapp_assign_product_location(p.id,'33333333-3333-3333-3333-333333333333',1,1,rev,stamp);
 if not exists(select 1 from public.products where id=p.id and x_axis='1' and y_axis='1') then raise exception 'Verplaatsen mislukt';end if;
 select updated_at into stamp from public.products where id=p.id;
 d:=public.binnenapp_assign_product_location(p.id,null,null,null,rev,stamp);
 if exists(select 1 from public.products where id=p.id and (rack is not null or x_axis is not null or y_axis is not null)) then raise exception 'Loskoppelen mislukt';end if;
 select jsonb_agg(jsonb_build_array(id,stock,min_stock) order by id) into after_test from public.products;
 if baseline is distinct from after_test then raise exception 'Voorraad gewijzigd';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin
  perform public.binnenapp_assign_product_location(p.id,null,null,null,rev,stamp);
  raise exception 'Onbevoegde wijziging toegestaan';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Productlocaties: toewijzen, verplaatsen, loskoppelen, hernoemen, conflicten, rechten en voorraadbehoud geslaagd' as resultaat;
