-- Alleen BinnenApp guurncfxhcxwvgnzoeyp.
begin;
create table private.product_models(product_id bigint primary key references public.products(id) on delete cascade,path text not null,name text not null,updated_at timestamptz not null default now());
alter table private.product_models enable row level security;
revoke all on private.product_models from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-models','product-models',false,20971520,array['model/gltf-binary']);
create policy binnenapp_model_read on storage.objects for select to authenticated using(bucket_id='product-models' and (select private.membership_status()->>'active')='true');
create policy binnenapp_model_insert on storage.objects for insert to authenticated with check(bucket_id='product-models' and (select private.membership_status()->>'active')='true' and (select private.membership_status()->>'role')='admin' and name ~ '^[0-9]+/[a-f0-9-]+[.]glb$');
create function public.binnenapp_product_models() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_app_member();return coalesce((select jsonb_agg(to_jsonb(m)) from private.product_models m),'[]');end $$;
create function public.binnenapp_get_product_model(p_product_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.products; s private.location_scene; r jsonb; g jsonb; lim numeric:=500;
begin
 perform private.assert_app_member();select * into p from public.products where id=p_product_id;if not found then raise exception 'Product bestaat niet.';end if;
 select * into s from private.location_scene where id;
 select value into r from private.location_layout l,jsonb_array_elements(l.racks) where value->>'name'=p.rack;
 if r is not null and p.y_axis ~ '^[0-9]+$' and (r->'rowColumns'->>(p.y_axis::integer-1)) is not null then
 lim:=greatest(0,least(500,floor(((coalesce((s.geometry->'racks'->(r->>'id')->>'width')::numeric,200)-8)/(r->'rowColumns'->>(p.y_axis::integer-1))::numeric-3)*10)/10));end if;
 g:=coalesce(s.geometry->'products'->p_product_id::text,jsonb_build_object('width',greatest(.1,least(20,lim)),'height',25,'depth',20));
 return jsonb_build_object('dimensions',g,'widthLimit',lim,'sceneRevision',s.revision)||coalesce((select jsonb_build_object('name',m.name,'path',m.path) from private.product_models m where product_id=p_product_id),'{}');
end $$;
create function public.binnenapp_save_product_model(p_product_id bigint,p_path text,p_name text,p_dimensions jsonb,p_scene_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.location_scene; d jsonb; k text; n numeric;
begin
 perform private.assert_admin();perform private.check_write_rate_limit('product_model',60,interval '5 minutes');
 perform 1 from private.location_layout where id for update;select * into s from private.location_scene where id for update;
 if s.revision is distinct from p_scene_revision then raise exception 'Het locatiemodel is intussen gewijzigd. Open het modelvenster opnieuw.' using errcode='40001';end if;
 perform 1 from public.products where id=p_product_id for update;if not found then raise exception 'Product bestaat niet.';end if;
 if jsonb_typeof(p_dimensions) is distinct from 'object' then raise exception 'Ongeldige maten.' using errcode='22023';end if;
 foreach k in array array['width','height','depth'] loop
 if jsonb_typeof(p_dimensions->k) is distinct from 'number' then raise exception 'Vul alle maten in.' using errcode='22023';end if;
 n:=(p_dimensions->>k)::numeric;if n<.1 or n>500 then raise exception 'Maten moeten tussen 0,1 en 500 cm liggen.' using errcode='22023';end if;end loop;
 d:=public.binnenapp_get_product_model(p_product_id);
 if (p_dimensions->>'width')::numeric>(d->>'widthLimit')::numeric then raise exception 'Het product is breder dan het vak (maximaal % cm).',d->>'widthLimit' using errcode='22023';end if;
 if p_path is not null then
 if p_path !~ ('^'||p_product_id::text||'/[a-f0-9-]+[.]glb$') or length(coalesce(p_name,'')) not between 1 and 180 or not exists(select 1 from storage.objects where bucket_id='product-models' and name=p_path) then raise exception 'Ongeldig of ontbrekend modelbestand.' using errcode='22023';end if;
 insert into private.product_models(product_id,path,name) values(p_product_id,p_path,p_name) on conflict(product_id) do update set path=excluded.path,name=excluded.name,updated_at=clock_timestamp();
 elsif exists(select 1 from private.product_models where product_id=p_product_id) then raise exception 'Open het modelvenster opnieuw.' using errcode='40001';end if;
 update private.location_scene set geometry=jsonb_set(geometry,array['products',p_product_id::text],jsonb_build_object('width',(p_dimensions->>'width')::numeric,'height',(p_dimensions->>'height')::numeric,'depth',(p_dimensions->>'depth')::numeric)),revision=revision+1,updated_at=clock_timestamp() where id;
 return public.binnenapp_get_product_model(p_product_id);
end $$;
revoke all on function public.binnenapp_product_models(),public.binnenapp_get_product_model(bigint),public.binnenapp_save_product_model(bigint,text,text,jsonb,integer) from public,anon;
grant execute on function public.binnenapp_product_models(),public.binnenapp_get_product_model(bigint),public.binnenapp_save_product_model(bigint,text,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
