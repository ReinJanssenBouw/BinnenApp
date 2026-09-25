-- Uitsluitend BinnenApp guurncfxhcxwvgnzoeyp. Maten staan los van bestaande vakken.
begin;
create table private.location_scene (
 id boolean primary key default true check(id),
 geometry jsonb not null default '{"version":1,"racks":{},"products":{}}',
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table private.location_scene enable row level security;
revoke all on private.location_scene from public,anon,authenticated;
insert into private.location_scene(id) values(true);

create function private.get_location_scene() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_app_member();
 return private.get_location_layout() || (select jsonb_build_object('geometry',s.geometry,'sceneRevision',s.revision,'products',
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'description',p.description,'jb_code',p.jb_code,'rack',p.rack,'x_axis',p.x_axis,'y_axis',p.y_axis,'updated_at',p.updated_at,'product_image_url',p.product_image_url) order by p.jb_code) from public.products p),'[]'::jsonb)) from private.location_scene s where s.id);
end $$;

create function private.save_location_scene(p_racks jsonb,p_geometry jsonb,p_revision integer,p_scene_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
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
  normal_products:=normal_products||jsonb_build_object(item.key,dims);
 end loop;
 -- Bestaande validatie voorkomt verwijderen van bezette vakken en bewaart locaties bij hernoemen.
 perform private.save_location_layout(p_racks,p_revision);
 update private.location_scene set geometry=jsonb_build_object('version',1,'racks',normal_racks,'products',normal_products),revision=revision+1,updated_at=clock_timestamp() where id;
 return private.get_location_scene();
end $$;
create function public.binnenapp_get_location_scene() returns jsonb language sql set search_path='' as $$select private.get_location_scene();$$;
create function public.binnenapp_save_location_scene(p_racks jsonb,p_geometry jsonb,p_revision integer,p_scene_revision integer) returns jsonb language sql set search_path='' as $$select private.save_location_scene(p_racks,p_geometry,p_revision,p_scene_revision);$$;
revoke all on function private.get_location_scene(),private.save_location_scene(jsonb,jsonb,integer,integer),public.binnenapp_get_location_scene(),public.binnenapp_save_location_scene(jsonb,jsonb,integer,integer) from public,anon;
grant execute on function private.get_location_scene(),private.save_location_scene(jsonb,jsonb,integer,integer),public.binnenapp_get_location_scene(),public.binnenapp_save_location_scene(jsonb,jsonb,integer,integer) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
