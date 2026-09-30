-- Alleen BinnenApp guurncfxhcxwvgnzoeyp. Geen voorraadwijzigingen.
begin;
create function private.product_shelf_counts(value jsonb,previous jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; k text; v jsonb; n numeric;
begin
 foreach k in array array['across','behind'] loop
 v:=coalesce(value->k,previous->k,'1'::jsonb);
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'Vul gehele aantallen in voor naast en achter elkaar.' using errcode='22023';end if;
 n:=v::text::numeric;
 if n<>trunc(n) or n<1 or n>50 then raise exception 'Aantallen moeten gehele getallen van 1 tot 50 zijn.' using errcode='22023';end if;
 result:=result||jsonb_build_object(k,n);
 end loop;
 if (result->>'across')::numeric*(result->>'behind')::numeric>250 then raise exception 'Maximaal 250 plaatsen per product.' using errcode='22023';end if;
 return result;
end $$;
revoke all on function private.product_shelf_counts(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.binnenapp_get_product_model(p_product_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.products; s private.location_scene; r jsonb; g jsonb; lim numeric:=500;
begin
 perform private.assert_app_member();select * into p from public.products where id=p_product_id;if not found then raise exception 'Product bestaat niet.';end if;
 select * into s from private.location_scene where id;
 select value into r from private.location_layout l,jsonb_array_elements(l.racks) where value->>'name'=p.rack;
 if r is not null and p.y_axis ~ '^[0-9]+$' and (r->'rowColumns'->>(p.y_axis::integer-1)) is not null then
 lim:=greatest(0,least(500,floor(((coalesce((s.geometry->'racks'->(r->>'id')->>'width')::numeric,200)-8)/(r->'rowColumns'->>(p.y_axis::integer-1))::numeric-3)*10)/10));end if;
 g:=coalesce(s.geometry->'products'->p_product_id::text,jsonb_build_object('width',greatest(.1,least(20,lim)),'height',25,'depth',20));
 g:=jsonb_build_object('across',1,'behind',1)||g;
 return jsonb_build_object('dimensions',g,'widthLimit',lim,'depthLimit',case when r is not null then coalesce((s.geometry->'racks'->(r->>'id')->>'depth')::numeric,60)-4 else null end,'sceneRevision',s.revision)||coalesce((select jsonb_build_object('name',m.name,'path',m.path) from private.product_models m where product_id=p_product_id),'{}');
end $$;
create or replace function public.binnenapp_save_product_model(p_product_id bigint,p_path text,p_name text,p_dimensions jsonb,p_scene_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.location_scene; d jsonb; k text; n numeric; counts jsonb;
begin
 perform private.assert_admin();perform private.check_write_rate_limit('product_model',60,interval '5 minutes');
 perform 1 from private.location_layout where id for update;select * into s from private.location_scene where id for update;
 if s.revision is distinct from p_scene_revision then raise exception 'Het locatiemodel is intussen gewijzigd. Open het modelvenster opnieuw.' using errcode='40001';end if;
 perform 1 from public.products where id=p_product_id for update;if not found then raise exception 'Product bestaat niet.';end if;
 if jsonb_typeof(p_dimensions) is distinct from 'object' then raise exception 'Ongeldige maten.' using errcode='22023';end if;
 foreach k in array array['width','height','depth'] loop
 if jsonb_typeof(p_dimensions->k) is distinct from 'number' then raise exception 'Vul alle maten in.' using errcode='22023';end if;
 n:=(p_dimensions->>k)::numeric;if n<.1 or n>500 then raise exception 'Maten moeten tussen 0,1 en 500 cm liggen.' using errcode='22023';end if;end loop;
 counts:=private.product_shelf_counts(p_dimensions,s.geometry->'products'->p_product_id::text);
 d:=public.binnenapp_get_product_model(p_product_id);
 if (p_dimensions->>'width')::numeric>(d->>'widthLimit')::numeric then raise exception 'Het product is breder dan het vak (maximaal % cm).',d->>'widthLimit' using errcode='22023';end if;
 if p_path is not null then
 if p_path !~ ('^'||p_product_id::text||'/[a-f0-9-]+[.]glb$') or length(coalesce(p_name,'')) not between 1 and 180 or not exists(select 1 from storage.objects where bucket_id='product-models' and name=p_path) then raise exception 'Ongeldig of ontbrekend modelbestand.' using errcode='22023';end if;
 insert into private.product_models(product_id,path,name) values(p_product_id,p_path,p_name) on conflict(product_id) do update set path=excluded.path,name=excluded.name,updated_at=clock_timestamp();
 elsif exists(select 1 from private.product_models where product_id=p_product_id) then raise exception 'Open het modelvenster opnieuw.' using errcode='40001';end if;
 update private.location_scene set geometry=jsonb_set(geometry,array['products',p_product_id::text],jsonb_build_object('width',(p_dimensions->>'width')::numeric,'height',(p_dimensions->>'height')::numeric,'depth',(p_dimensions->>'depth')::numeric)||counts),revision=revision+1,updated_at=clock_timestamp() where id;
 return public.binnenapp_get_product_model(p_product_id);
end $$;
create or replace function private.save_location_scene(p_racks jsonb,p_geometry jsonb,p_revision integer,p_scene_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; prop record; dims jsonb; normal_racks jsonb:='{}'; normal_products jsonb:='{}'; n numeric; current_scene integer;
begin
 perform private.assert_admin();
 -- Lockvolgorde gelijk aan bestaande locatiebewerkingen: indeling vóór producten.
 perform 1 from private.location_layout where id for update;
 select revision into current_scene from private.location_scene where id for update;
 if p_scene_revision is distinct from current_scene then raise exception 'Het 3D-model is intussen gewijzigd. Vernieuw en probeer opnieuw.' using errcode='40001'; end if;
 if p_geometry is null or jsonb_typeof(p_geometry)<>'object' or p_geometry->>'version' is distinct from '1'
 or jsonb_typeof(p_geometry->'racks') is distinct from 'object' or jsonb_typeof(p_geometry->'products') is distinct from 'object'
 or octet_length(p_geometry::text)>1000000 then raise exception 'Ongeldige 3D-afmetingen.' using errcode='22023';end if;
 if p_racks is null or jsonb_typeof(p_racks)<>'array' then raise exception 'Ongeldige stellingen.' using errcode='22023';end if;
 for item in select * from jsonb_each(p_geometry->'racks') loop
  if not exists(select 1 from jsonb_array_elements(p_racks) r where r->>'id'=item.key) then raise exception 'Maten verwijzen naar een onbekende stelling.' using errcode='22023';end if;
  if jsonb_typeof(item.value)<>'object' then raise exception 'Ongeldige stellingmaten.' using errcode='22023';end if;
  dims:='{}';
  for prop in select * from (values ('width',10,2000),('height',10,1000),('depth',10,500),('x',-5000,5000),('z',-5000,5000),('angle',0,359)) v(name,lo,hi) loop
   if jsonb_typeof(item.value->prop.name) is distinct from 'number' then raise exception 'Vul alle stellingmaten in.' using errcode='22023';end if;
   n:=(item.value->>prop.name)::numeric;
   if n<prop.lo or n>prop.hi then raise exception 'Een stellingmaat ligt buiten de toegestane grenzen.' using errcode='22023';end if;
   dims:=dims||jsonb_build_object(prop.name,n);
  end loop;
  normal_racks:=normal_racks||jsonb_build_object(item.key,dims);
 end loop;
 for item in select * from jsonb_each(p_geometry->'products') loop
  if item.key !~ '^[0-9]{1,18}$' or not exists(select 1 from public.products p where p.id::text=item.key) then raise exception 'Maten verwijzen naar een onbekend product.' using errcode='22023';end if;
  if jsonb_typeof(item.value)<>'object' then raise exception 'Ongeldige productmaten.' using errcode='22023';end if;
  dims:='{}';
  for prop in select * from (values ('width'),('height'),('depth')) v(name) loop
   if jsonb_typeof(item.value->prop.name) is distinct from 'number' then raise exception 'Vul alle productmaten in.' using errcode='22023';end if;
   n:=(item.value->>prop.name)::numeric;
   if n<0.1 or n>500 then raise exception 'Productmaten moeten tussen 0,1 en 500 cm liggen.' using errcode='22023';end if;
   dims:=dims||jsonb_build_object(prop.name,n);
  end loop;
  dims:=dims||private.product_shelf_counts(item.value,(select geometry->'products'->item.key from private.location_scene where id));
  normal_products:=normal_products||jsonb_build_object(item.key,dims);
 end loop;
 -- Bestaande validatie voorkomt verwijderen van bezette vakken en bewaart locaties bij hernoemen.
 perform private.save_location_layout(p_racks,p_revision);
 update private.location_scene set geometry=jsonb_build_object('version',1,'racks',normal_racks,'products',normal_products),revision=revision+1,updated_at=clock_timestamp() where id;
 return private.get_location_scene();
end $$;
notify pgrst,'reload schema';
commit;
