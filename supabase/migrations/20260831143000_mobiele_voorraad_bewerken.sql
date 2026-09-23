-- Voorraad veilig vanuit de mobiele app aanpassen.
-- De verwachte voorraad voorkomt dat twee gelijktijdige tellingen elkaar overschrijven.

create or replace function private.set_product_stock(
  p_product_id bigint,
  p_stock numeric,
  p_expected_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  gewijzigd public.products%rowtype;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('set_product_stock', 240, interval '5 minutes');

  if p_product_id is null or p_product_id <= 0 then
    raise exception 'Ongeldig artikel.' using errcode = '22023';
  end if;

  if p_stock is null
     or p_stock < 0
     or p_stock > 1000000
     or p_stock <> trunc(p_stock) then
    raise exception 'De voorraad moet een heel aantal tussen 0 en 1.000.000 zijn.' using errcode = '22023';
  end if;

  if p_expected_stock is null
     or p_expected_stock < 0
     or p_expected_stock > 1000000
     or p_expected_stock <> trunc(p_expected_stock) then
    raise exception 'De verwachte voorraad is ongeldig.' using errcode = '22023';
  end if;

  update public.products
  set stock = p_stock,
      updated_at = now()
  where id = p_product_id
    and available
    and stock = p_expected_stock
  returning * into gewijzigd;

  if not found then
    if not exists (
      select 1
      from public.products
      where id = p_product_id
        and available
    ) then
      raise exception 'Dit artikel bestaat niet of is niet beschikbaar.' using errcode = '22023';
    end if;

    raise exception 'De voorraad is intussen door iemand anders gewijzigd. De actuele voorraad is opnieuw geladen.'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', gewijzigd.id,
    'stock', gewijzigd.stock,
    'updated_at', gewijzigd.updated_at
  );
end;
$function$;

revoke all on function private.set_product_stock(bigint, numeric, numeric) from public;
revoke all on function private.set_product_stock(bigint, numeric, numeric) from anon;
grant execute on function private.set_product_stock(bigint, numeric, numeric) to authenticated;

create or replace function public.binnenapp_set_product_stock(
  p_product_id bigint,
  p_stock numeric,
  p_expected_stock numeric
)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.set_product_stock(p_product_id, p_stock, p_expected_stock)
$function$;

revoke all on function public.binnenapp_set_product_stock(bigint, numeric, numeric) from public;
revoke all on function public.binnenapp_set_product_stock(bigint, numeric, numeric) from anon;
grant execute on function public.binnenapp_set_product_stock(bigint, numeric, numeric) to authenticated;

comment on function public.binnenapp_set_product_stock(bigint, numeric, numeric)
  is 'Past de voorraad van één beschikbaar artikel atomair aan voor BinnenApp-leden.';
