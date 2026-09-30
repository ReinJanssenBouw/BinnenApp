-- Alleen BinnenApp guurncfxhcxwvgnzoeyp. Alle testdata wordt teruggedraaid.
begin;
do $$
declare a uuid; p bigint; d jsonb; before_products jsonb; dims jsonb; model_path text;
begin
 select user_id into a from private.app_members where active and role='admin' limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 select id into p from public.products order by id limit 1;
 select jsonb_agg(to_jsonb(t) order by id) into before_products from public.products t;
 d:=public.binnenapp_get_product_model(p);dims:=jsonb_build_object('width',least(1,(d->>'widthLimit')::numeric),'height',2,'depth',3,'across',1,'behind',1);
 model_path:=p::text||'/11111111-1111-4111-8111-111111111111.glb';
 insert into storage.objects(bucket_id,name,metadata) values('product-models',model_path,'{"mimetype":"model/gltf-binary","size":100}');
 d:=public.binnenapp_save_product_model(p,model_path,'test.glb',dims,(d->>'sceneRevision')::integer);
 if d->>'name'<>'test.glb' or d->'dimensions' is distinct from dims then raise exception 'Uploadkoppeling of maten niet opgeslagen';end if;
 if public.binnenapp_get_product_model(p)->'dimensions' is distinct from dims then raise exception 'Maten niet herladen';end if;
 begin perform public.binnenapp_save_product_model(p,model_path,'test.glb',dims,(d->>'sceneRevision')::integer-1);raise exception 'Verouderde revisie toegestaan';exception when sqlstate '40001' then null;end;
 begin perform public.binnenapp_save_product_model(p,model_path,'test.glb',jsonb_set(dims,'{width}','501'),(d->>'sceneRevision')::integer);raise exception 'Ongeldige breedte toegestaan';exception when sqlstate '22023' then null;end;
 update private.app_members set role='member' where user_id=a;
 perform public.binnenapp_product_models();
 begin perform public.binnenapp_save_product_model(p,model_path,'test.glb',dims,(d->>'sceneRevision')::integer);raise exception 'Lid mocht opslaan';exception when insufficient_privilege then null;end;
 if before_products is distinct from (select jsonb_agg(to_jsonb(t) order by id) from public.products t) then raise exception 'Product- of voorraadgegevens gewijzigd';end if;
 if has_function_privilege('anon','public.binnenapp_product_models()','execute') or has_table_privilege('authenticated','private.product_models','select') then raise exception 'Onjuiste rechten';end if;
end $$;
rollback;
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from private.app_members where active and role='admin' limit 1),true);
set local role authenticated;
do $$ begin
 insert into storage.objects(bucket_id,name,metadata) values('product-models','999999999/22222222-2222-4222-8222-222222222222.glb','{}');
 if not exists(select 1 from storage.objects where bucket_id='product-models' and name='999999999/22222222-2222-4222-8222-222222222222.glb') then raise exception 'Beheerder kan upload niet lezen';end if;
end $$;
reset role;
update private.app_members set role='member' where user_id=current_setting('request.jwt.claim.sub')::uuid;
set local role authenticated;
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='product-models' and name='999999999/22222222-2222-4222-8222-222222222222.glb') then raise exception 'Lid kan model niet lezen';end if;
 begin insert into storage.objects(bucket_id,name,metadata) values('product-models','999999999/33333333-3333-4333-8333-333333333333.glb','{}');raise exception 'Lid mocht uploaden';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Productmodel, afmetingen, herladen, conflicten, rechten en voorraadbehoud: geslaagd' as resultaat;
