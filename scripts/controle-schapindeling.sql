-- Alleen BinnenApp guurncfxhcxwvgnzoeyp; alle testwijzigingen worden teruggedraaid.
begin;
do $$
declare p bigint; a uuid; d jsonb; scene jsonb; dims jsonb; before_products jsonb; invalid jsonb;
begin
 select user_id into a from private.app_members where active and role='admin' limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 select id into p from public.products order by id limit 1;
 select jsonb_agg(to_jsonb(t) order by id) into before_products from public.products t;
 d:=public.binnenapp_get_product_model(p);
 dims:=jsonb_build_object('width',least(1,(d->>'widthLimit')::numeric),'height',2,'depth',3,'across',3,'behind',4);
 d:=public.binnenapp_save_product_model(p,d->>'path',d->>'name',dims,(d->>'sceneRevision')::integer);
 if d->'dimensions' is distinct from dims then raise exception 'Aantallen niet opgeslagen';end if;
 if public.binnenapp_get_product_model(p)->'dimensions' is distinct from dims then raise exception 'Aantallen niet herladen';end if;
 -- Oudere modelclients geven alleen breedte, hoogte en diepte door.
 d:=public.binnenapp_save_product_model(p,d->>'path',d->>'name',dims-'across'-'behind',(d->>'sceneRevision')::integer);
 if d->'dimensions' is distinct from dims then raise exception 'Oude productclient wist aantallen';end if;
 -- Ook een oudere locatieclient mag de aantallen niet wissen.
 scene:=public.binnenapp_get_location_scene();
 scene:=jsonb_set(scene,array['geometry','products',p::text],dims-'across'-'behind');
 scene:=public.binnenapp_save_location_scene(scene->'racks',scene->'geometry',(scene->>'revision')::integer,(scene->>'sceneRevision')::integer);
 if scene->'geometry'->'products'->p::text is distinct from dims then raise exception 'Oude locatieclient wist aantallen';end if;
 d:=public.binnenapp_get_product_model(p);
 for invalid in select value from jsonb_array_elements('[0,-1,1.5,51,null,"3"]') loop
  begin
   perform public.binnenapp_save_product_model(p,d->>'path',d->>'name',jsonb_set(dims,'{across}',invalid),(d->>'sceneRevision')::integer);
   raise exception 'Ongeldig aantal geaccepteerd: %',invalid;
  exception when sqlstate '22023' then null;end;
 end loop;
 begin perform public.binnenapp_save_product_model(p,d->>'path',d->>'name',dims,(d->>'sceneRevision')::integer-1);raise exception 'Revisieconflict ontbreekt';exception when sqlstate '40001' then null;end;
 if before_products is distinct from (select jsonb_agg(to_jsonb(t) order by id) from public.products t) then raise exception 'Product/voorraad gewijzigd';end if;
end $$;
rollback;
select 'Schapindeling: 3 naast x 4 achter, herladen, oude clients, validatie, revisies en voorraadbehoud geslaagd' as resultaat;
