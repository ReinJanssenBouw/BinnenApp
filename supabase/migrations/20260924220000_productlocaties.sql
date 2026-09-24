-- Uitsluitend BinnenApp guurncfxhcxwvgnzoeyp.
begin;
create or replace function private.get_location_layout() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_app_member();
 return (select jsonb_build_object('racks',racks,'revision',revision,'products',
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'description',p.description,'jb_code',p.jb_code,'rack',p.rack,'x_axis',p.x_axis,'y_axis',p.y_axis,'updated_at',p.updated_at) order by p.jb_code,p.description) from public.products p),'[]'::jsonb)) from private.location_layout where id);
end $$;
create function private.assign_product_location(p_product_id bigint,p_rack_id text,p_x integer,p_y integer,p_revision integer,p_expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare layout private.location_layout; target jsonb; product public.products;
begin
 perform private.assert_admin();
 perform private.check_write_rate_limit('product_location',120,interval '5 minutes');
 select * into layout from private.location_layout where id for update;
 if p_revision is distinct from layout.revision then raise exception 'De indeling is gewijzigd. Laad de locaties opnieuw.' using errcode='40001';end if;
 if p_rack_id is not null then
  select value into target from jsonb_array_elements(layout.racks) where value->>'id'=p_rack_id;
  if target is null or p_y is null or p_x is null or p_y<1 or p_y>(target->>'rows')::integer or p_x<1 or p_x>coalesce((target->'rowColumns'->>(p_y-1))::integer,(target->>'columns')::integer) then
   raise exception 'Deze locatie bestaat niet.' using errcode='22023';end if;
 end if;
 select * into product from public.products where id=p_product_id for update;
 if not found then raise exception 'Product bestaat niet meer.' using errcode='22023';end if;
 if product.updated_at is distinct from p_expected_updated_at then raise exception 'Het product is intussen gewijzigd. Laad de locaties opnieuw.' using errcode='40001';end if;
 update public.products set rack=target->>'name',x_axis=case when target is not null then p_x::text end,y_axis=case when target is not null then p_y::text end,position=null,updated_at=clock_timestamp() where id=p_product_id;
 return private.get_location_layout();
end $$;
create function public.binnenapp_assign_product_location(p_product_id bigint,p_rack_id text,p_x integer,p_y integer,p_revision integer,p_expected_updated_at timestamptz) returns jsonb language sql set search_path='' as $$
 select private.assign_product_location(p_product_id,p_rack_id,p_x,p_y,p_revision,p_expected_updated_at);
$$;
revoke all on function private.assign_product_location(bigint,text,integer,integer,integer,timestamptz),public.binnenapp_assign_product_location(bigint,text,integer,integer,integer,timestamptz) from public,anon;
grant execute on function private.assign_product_location(bigint,text,integer,integer,integer,timestamptz),public.binnenapp_assign_product_location(bigint,text,integer,integer,integer,timestamptz) to authenticated,service_role;
-- Bestaande productlocaties behouden bij hernoemen; bezette vakken niet verwijderen.
create function private.preserve_product_locations() returns trigger language plpgsql security definer set search_path='' as $$
declare p record; old_rack jsonb; new_rack jsonb;
begin
 for p in select id,rack,x_axis,y_axis from public.products where rack is not null for update loop
  select value into old_rack from jsonb_array_elements(old.racks) where value->>'name'=p.rack;
  if old_rack is null then continue;end if;
  select value into new_rack from jsonb_array_elements(new.racks) where value->>'id'=old_rack->>'id';
  if new_rack is null then raise exception 'Verplaats eerst de producten uit stelling %.',p.rack using errcode='22023';end if;
  if p.x_axis ~ '^[0-9]{1,2}$' and p.y_axis ~ '^[0-9]{1,2}$' then
   if p.y_axis::integer>(new_rack->>'rows')::integer or p.x_axis::integer>coalesce((new_rack->'rowColumns'->>(p.y_axis::integer-1))::integer,(new_rack->>'columns')::integer) then
    raise exception 'Verplaats eerst de producten uit de vakken die je wilt verwijderen.' using errcode='22023';end if;
  end if;
  if p.rack is distinct from new_rack->>'name' then update public.products set rack=new_rack->>'name',updated_at=clock_timestamp() where id=p.id;end if;
 end loop;
 return new;
end $$;
revoke all on function private.preserve_product_locations() from public,anon,authenticated;
create trigger preserve_product_locations before update of racks on private.location_layout for each row execute function private.preserve_product_locations();
notify pgrst,'reload schema';
commit;
