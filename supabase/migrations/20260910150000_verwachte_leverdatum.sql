-- Een verwachte leverdatum staat los van de gewenste leverdatum en besteldatum.
-- Bestaande bestellingen blijven ongemoeid; er is bewust geen backfill.
begin;

alter table public.orders
  add column expected_delivery_date date
  constraint orders_expected_delivery_date_bereik check (
    expected_delivery_date is null
    or (
      pg_catalog.isfinite(expected_delivery_date)
      and expected_delivery_date between date '2020-01-01' and date '2100-12-31'
    )
  );

comment on column public.orders.expected_delivery_date
  is 'Optionele verwachte leverdatum; niet de gewenste leverdatum of besteldatum.';

create function private.update_expected_delivery_date(
  p_order_number text,
  p_date date,
  p_expected_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $functie$
declare
  bestelling public.orders%rowtype;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('update_expected_delivery_date', 60, interval '1 hour');

  if p_order_number is null or p_order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;

  if p_date is not null and (
    not pg_catalog.isfinite(p_date)
    or p_date < date '2020-01-01'
    or p_date > date '2100-12-31'
  ) then
    raise exception 'Kies een verwachte leverdatum tussen 1 januari 2020 en 31 december 2100.'
      using errcode = '22023';
  end if;

  if p_expected_date is not null and (
    not pg_catalog.isfinite(p_expected_date)
    or p_expected_date < date '2020-01-01'
    or p_expected_date > date '2100-12-31'
  ) then
    raise exception 'De eerder geladen verwachte leverdatum is ongeldig. Laad de bestelling opnieuw.'
      using errcode = '22023';
  end if;

  -- Vergrendel deze bestelling vóór de vergelijking: twee schermen kunnen
  -- elkaars tussentijdse datumwijziging zo niet ongemerkt overschrijven.
  select o.* into bestelling
  from public.orders o
  where o.order_number = p_order_number
  for update;

  if not found then
    raise exception 'Deze bestelling bestaat niet meer.' using errcode = '22023';
  end if;

  if bestelling.expected_delivery_date is distinct from p_expected_date then
    raise exception 'De verwachte leverdatum is inmiddels gewijzigd. Haal de actuele datum op en probeer opnieuw.'
      using errcode = '40001';
  end if;

  -- Alleen dit ene veld aanpassen; status, besteldatum en wensdatum behouden.
  if bestelling.expected_delivery_date is distinct from p_date then
    update public.orders
    set expected_delivery_date = p_date
    where id = bestelling.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'orderNumber', bestelling.order_number,
    'expectedDeliveryDate', pg_catalog.to_char(p_date, 'YYYY-MM-DD')
  );
end;
$functie$;

revoke all on function private.update_expected_delivery_date(text, date, date) from public;
revoke all on function private.update_expected_delivery_date(text, date, date) from anon;
grant execute on function private.update_expected_delivery_date(text, date, date) to authenticated;

create function public.binnenapp_update_expected_delivery_date(
  p_order_number text,
  p_date date,
  p_expected_date date
)
returns jsonb
language sql
security invoker
set search_path to ''
as $functie$
  select private.update_expected_delivery_date(p_order_number, p_date, p_expected_date)
$functie$;

revoke all on function public.binnenapp_update_expected_delivery_date(text, date, date) from public;
revoke all on function public.binnenapp_update_expected_delivery_date(text, date, date) from anon;
grant execute on function public.binnenapp_update_expected_delivery_date(text, date, date) to authenticated;

comment on function public.binnenapp_update_expected_delivery_date(text, date, date)
  is 'Stelt de optionele verwachte leverdatum in met controle op gelijktijdige wijzigingen.';

commit;
