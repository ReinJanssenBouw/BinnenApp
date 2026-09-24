-- Alleen BinnenApp guurncfxhcxwvgnzoeyp. Voorraad en minimum blijven behouden.
begin;
lock table public.products in share row exclusive mode;
create temporary table stock_before on commit drop as select id,stock,min_stock from public.products;
create function private.set_min_stock(p_product_id bigint,p_min_stock numeric,p_expected_min numeric)
returns public.products language plpgsql security definer set search_path='' as $$
declare result public.products;
begin
 perform private.assert_admin();
 perform private.check_write_rate_limit('stock_levels',120,interval '5 minutes');
 if p_min_stock is null or p_min_stock<0 or p_min_stock>1000000 or trunc(p_min_stock)<>p_min_stock then
  raise exception 'Minimumvoorraad moet een geheel getal van 0 tot 1.000.000 zijn.' using errcode='22023';
 end if;
 update public.products set min_stock=p_min_stock,updated_at=now()
 where id=p_product_id and min_stock=p_expected_min returning * into result;
 if not found then raise exception 'Dit artikel is intussen gewijzigd. Ververs en probeer opnieuw.' using errcode='40001'; end if;
 return result;
end $$;
create function public.binnenapp_set_min_stock(p_product_id bigint,p_min_stock numeric,p_expected_min numeric)
returns public.products language sql set search_path='' as $$
 select private.set_min_stock(p_product_id,p_min_stock,p_expected_min);
$$;
revoke all on function private.set_min_stock(bigint,numeric,numeric) from public,anon;
grant execute on function private.set_min_stock(bigint,numeric,numeric) to authenticated,service_role;
revoke all on function public.binnenapp_set_min_stock(bigint,numeric,numeric) from public,anon;
grant execute on function public.binnenapp_set_min_stock(bigint,numeric,numeric) to authenticated,service_role;
-- Compatibility endpoints for installed 1.0.3 clients: obsolete arguments ignored.
create or replace function private.set_stock_levels(p_product_id bigint,p_min_stock numeric,p_target_stock numeric,p_expected_min numeric,p_expected_target numeric)
returns public.products language plpgsql security definer set search_path='' as $$
begin return private.set_min_stock(p_product_id,p_min_stock,p_expected_min); end $$;
create or replace function private.save_product_met_aanvulvoorraad(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_target_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) returns public.products language plpgsql security definer set search_path='' as $$
begin return private.save_product(p_product_id, p_expected_updated_at, p_ean_code, p_jb_code, p_description, p_category, p_unit, p_packaged_per, p_price_per_unit, p_stock, p_min_stock, p_product_image_url, p_source_image_url, p_rack, p_x_axis, p_y_axis, p_position, p_available); end $$;
drop trigger products_target_stock on public.products;
drop function private.default_target_stock();
alter table public.products drop column target_stock;
do $$ begin
 if exists(select 1 from public.products p join stock_before b using(id) where (p.stock,p.min_stock) is distinct from (b.stock,b.min_stock)) then
  raise exception 'Voorraad gewijzigd';
 end if;
end $$;
notify pgrst,'reload schema';
select count(*) as voorraad_en_minimum_behouden from public.products p join stock_before b using(id) where (p.stock,p.min_stock) is not distinct from (b.stock,b.min_stock);
commit;
