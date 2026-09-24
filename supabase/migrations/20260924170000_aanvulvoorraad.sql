-- BinnenApp only: guurncfxhcxwvgnzoeyp. Keep legacy clients compatible.
begin;
alter table public.products add column target_stock numeric(12,3);
update public.products set target_stock = min_stock;
create function private.default_target_stock() returns trigger language plpgsql set search_path = '' as $$
begin
  new.target_stock := greatest(coalesce(new.target_stock, new.min_stock), new.min_stock);
  return new;
end $$;
revoke all on function private.default_target_stock() from public, anon, authenticated;
create trigger products_target_stock before insert or update of min_stock,target_stock on public.products for each row execute function private.default_target_stock();
alter table public.products alter column target_stock set not null;
alter table public.products add constraint products_target_stock_valid check (target_stock >= min_stock and target_stock <= 1000000 and trunc(target_stock) = target_stock);
create function private.save_product_met_aanvulvoorraad(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_target_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) returns public.products language plpgsql security definer set search_path = '' as $$
declare result public.products;
begin
  perform private.assert_admin();
  if p_target_stock is null or p_target_stock < p_min_stock or p_target_stock < 0 or p_target_stock > 1000000 or trunc(p_target_stock) <> p_target_stock then
    raise exception 'Aanvulvoorraad moet een geheel getal zijn, minstens gelijk aan het minimum en maximaal 1.000.000.' using errcode = '22023';
  end if;
  result := private.save_product(p_product_id, p_expected_updated_at, p_ean_code, p_jb_code, p_description, p_category, p_unit, p_packaged_per, p_price_per_unit, p_stock, p_min_stock, p_product_image_url, p_source_image_url, p_rack, p_x_axis, p_y_axis, p_position, p_available);
  update public.products set target_stock = p_target_stock where id = result.id returning * into result;
  return result;
end $$;
create function public.binnenapp_save_product_met_aanvulvoorraad(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_target_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) returns public.products language sql set search_path = '' as $$
 select private.save_product_met_aanvulvoorraad(p_product_id, p_expected_updated_at, p_ean_code, p_jb_code, p_description, p_category, p_unit, p_packaged_per, p_price_per_unit, p_stock, p_min_stock, p_target_stock, p_product_image_url, p_source_image_url, p_rack, p_x_axis, p_y_axis, p_position, p_available);
$$;
revoke all on function private.save_product_met_aanvulvoorraad(bigint, timestamp with time zone, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function private.save_product_met_aanvulvoorraad(bigint, timestamp with time zone, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, text, boolean) to authenticated, service_role;
revoke all on function public.binnenapp_save_product_met_aanvulvoorraad(bigint, timestamp with time zone, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.binnenapp_save_product_met_aanvulvoorraad(bigint, timestamp with time zone, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, text, boolean) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
