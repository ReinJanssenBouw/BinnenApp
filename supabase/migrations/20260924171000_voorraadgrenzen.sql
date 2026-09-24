-- Alleen BinnenApp: guurncfxhcxwvgnzoeyp
begin;
create function private.set_stock_levels(p_product_id bigint, p_min_stock numeric, p_target_stock numeric, p_expected_min numeric, p_expected_target numeric)
returns public.products language plpgsql security definer set search_path = '' as $$
declare result public.products;
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('stock_levels',120,interval '5 minutes');
  if p_min_stock is null or p_target_stock is null or p_min_stock < 0 or p_target_stock < p_min_stock or p_target_stock > 1000000
     or trunc(p_min_stock) <> p_min_stock or trunc(p_target_stock) <> p_target_stock then
    raise exception 'Vul hele aantallen in; aanvulvoorraad moet minstens gelijk zijn aan het minimum en maximaal 1.000.000.' using errcode = '22023';
  end if;
  update public.products set min_stock=p_min_stock, target_stock=p_target_stock, updated_at=now()
  where id=p_product_id and min_stock=p_expected_min and target_stock=p_expected_target returning * into result;
  if not found then
    raise exception 'Dit artikel is intussen gewijzigd. Ververs en probeer opnieuw.' using errcode = '40001';
  end if;
  return result;
end $$;
create function public.binnenapp_set_stock_levels(p_product_id bigint, p_min_stock numeric, p_target_stock numeric, p_expected_min numeric, p_expected_target numeric)
returns public.products language sql set search_path = '' as $$
 select private.set_stock_levels(p_product_id,p_min_stock,p_target_stock,p_expected_min,p_expected_target);
$$;
revoke all on function private.set_stock_levels(bigint,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function private.set_stock_levels(bigint,numeric,numeric,numeric,numeric) to authenticated,service_role;
revoke all on function public.binnenapp_set_stock_levels(bigint,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.binnenapp_set_stock_levels(bigint,numeric,numeric,numeric,numeric) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
