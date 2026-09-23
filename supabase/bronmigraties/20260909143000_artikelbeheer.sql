-- Volledig artikelbeheer voor de desktop-app. Alleen beheerders mogen deze
-- functies gebruiken; gewone BinnenApp-leden houden uitsluitend leesrechten.

create or replace function private.admin_products()
returns setof public.products
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  perform private.assert_admin();

  return query
  select p.*
  from public.products p
  order by p.jb_code nulls last, p.id;
end;
$$;

revoke all on function private.admin_products() from public;
revoke all on function private.admin_products() from anon;
grant execute on function private.admin_products() to authenticated;

create or replace function public.binnenapp_admin_products()
returns setof public.products
language sql
stable
set search_path to ''
as $$
  select * from private.admin_products()
$$;

revoke all on function public.binnenapp_admin_products() from public;
revoke all on function public.binnenapp_admin_products() from anon;
grant execute on function public.binnenapp_admin_products() to authenticated;

comment on function public.binnenapp_admin_products()
  is 'Geeft alle artikelen, inclusief niet-beschikbare artikelen, terug aan BinnenApp-beheerders.';

create or replace function private.save_product(
  p_product_id bigint,
  p_expected_updated_at timestamptz,
  p_ean_code text,
  p_jb_code text,
  p_description text,
  p_category text,
  p_unit text,
  p_packaged_per numeric,
  p_price_per_unit numeric,
  p_stock numeric,
  p_min_stock numeric,
  p_product_image_url text,
  p_source_image_url text,
  p_rack text,
  p_x_axis text,
  p_y_axis text,
  p_position text,
  p_available boolean
)
returns public.products
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_product_id bigint;
  v_ean_code text := btrim(coalesce(p_ean_code, ''));
  v_jb_code text := upper(replace(btrim(coalesce(p_jb_code, '')), ' ', ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_product_image_url text := nullif(btrim(coalesce(p_product_image_url, '')), '');
  v_source_image_url text := nullif(btrim(coalesce(p_source_image_url, '')), '');
  v_result public.products%rowtype;
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('save_product', 120, interval '5 minutes');

  -- Eén korte transactievergrendeling voorkomt dubbele EAN/JB-codes en
  -- dubbele nieuwe id's wanneer twee vensters tegelijk opslaan.
  perform pg_catalog.pg_advisory_xact_lock(19042026);

  if length(v_ean_code) < 1 or length(v_ean_code) > 64 or v_ean_code ~ '[[:cntrl:]]' then
    raise exception 'Vul een geldig EAN- of artikelnummer in (maximaal 64 tekens).' using errcode = '22023';
  end if;
  if length(v_jb_code) < 1 or length(v_jb_code) > 64 or v_jb_code ~ '[[:cntrl:]]' then
    raise exception 'Vul een geldig JB-nummer in (maximaal 64 tekens).' using errcode = '22023';
  end if;
  if length(v_description) < 2 or length(v_description) > 240 or v_description ~ '[[:cntrl:]]' then
    raise exception 'De artikelnaam moet 2 tot 240 tekens lang zijn.' using errcode = '22023';
  end if;
  if length(v_category) < 1 or length(v_category) > 80 or v_category ~ '[[:cntrl:]]' then
    raise exception 'Vul een geldige categorie in.' using errcode = '22023';
  end if;
  if length(v_unit) < 1 or length(v_unit) > 24 or v_unit ~ '[[:cntrl:]]' then
    raise exception 'Vul een geldige eenheid in.' using errcode = '22023';
  end if;
  if p_packaged_per is null or p_packaged_per <= 0 or p_packaged_per > 1000000 or trunc(p_packaged_per) <> p_packaged_per then
    raise exception 'Verpakt per moet een positief geheel getal zijn.' using errcode = '22023';
  end if;
  if p_price_per_unit is null or p_price_per_unit < 0 or p_price_per_unit > 10000000 then
    raise exception 'De prijs per verpakking is ongeldig.' using errcode = '22023';
  end if;
  if p_stock is null or p_stock < 0 or p_stock > 1000000 or trunc(p_stock) <> p_stock then
    raise exception 'De voorraad moet een geheel getal van 0 tot 1.000.000 zijn.' using errcode = '22023';
  end if;
  if p_min_stock is null or p_min_stock < 0 or p_min_stock > 1000000 or trunc(p_min_stock) <> p_min_stock then
    raise exception 'De minimumvoorraad moet een geheel getal van 0 tot 1.000.000 zijn.' using errcode = '22023';
  end if;
  if v_product_image_url is not null and (length(v_product_image_url) > 2048 or v_product_image_url !~* '^https?://') then
    raise exception 'De foto-URL moet met http:// of https:// beginnen.' using errcode = '22023';
  end if;
  if v_source_image_url is not null and (length(v_source_image_url) > 2048 or v_source_image_url !~* '^https?://') then
    raise exception 'De originele foto-URL moet met http:// of https:// beginnen.' using errcode = '22023';
  end if;
  if length(coalesce(p_rack, '')) > 64 or length(coalesce(p_x_axis, '')) > 64
     or length(coalesce(p_y_axis, '')) > 64 or length(coalesce(p_position, '')) > 64 then
    raise exception 'Een magazijnpositie mag maximaal 64 tekens bevatten.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.products p
    where lower(p.ean_code) = lower(v_ean_code)
      and (p_product_id is null or p.id <> p_product_id)
  ) then
    raise exception 'Dit EAN- of artikelnummer bestaat al.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.products p
    where lower(p.jb_code) = lower(v_jb_code)
      and (p_product_id is null or p.id <> p_product_id)
  ) then
    raise exception 'Dit JB-nummer bestaat al.' using errcode = '22023';
  end if;

  if p_product_id is not null and p_available is false and exists (
    select 1 from public.cart_items c where c.product_id = p_product_id and c.quantity > 0
  ) then
    raise exception 'Haal dit artikel eerst uit de gedeelde winkelwagen voordat je het verbergt.' using errcode = '22023';
  end if;

  if p_product_id is not null and exists (
    select 1 from public.cart_items c
    where c.product_id = p_product_id
      and mod(c.quantity, p_packaged_per) <> 0
  ) then
    raise exception 'Het huidige winkelwagenaantal past niet bij deze verpakkingsgrootte. Pas eerst de winkelwagen aan.' using errcode = '22023';
  end if;

  if p_product_id is null then
    select coalesce(max(p.id), 0) + 1 into v_product_id from public.products p;

    insert into public.products (
      id, ean_code, jb_code, description, category, unit, packaged_per,
      price_per_unit, stock, min_stock, product_image_url, source_image_url,
      rack, x_axis, y_axis, position, available, created_at, updated_at
    ) values (
      v_product_id, v_ean_code, v_jb_code, v_description, v_category, v_unit,
      p_packaged_per, p_price_per_unit, p_stock, p_min_stock,
      v_product_image_url, coalesce(v_source_image_url, v_product_image_url),
      nullif(btrim(coalesce(p_rack, '')), ''),
      nullif(btrim(coalesce(p_x_axis, '')), ''),
      nullif(btrim(coalesce(p_y_axis, '')), ''),
      nullif(btrim(coalesce(p_position, '')), ''),
      coalesce(p_available, true), now(), now()
    )
    returning * into v_result;
  else
    if p_product_id <= 0 or p_expected_updated_at is null then
      raise exception 'De te wijzigen artikelversie ontbreekt.' using errcode = '22023';
    end if;

    update public.products
    set ean_code = v_ean_code,
        jb_code = v_jb_code,
        description = v_description,
        category = v_category,
        unit = v_unit,
        packaged_per = p_packaged_per,
        price_per_unit = p_price_per_unit,
        stock = p_stock,
        min_stock = p_min_stock,
        product_image_url = v_product_image_url,
        source_image_url = v_source_image_url,
        rack = nullif(btrim(coalesce(p_rack, '')), ''),
        x_axis = nullif(btrim(coalesce(p_x_axis, '')), ''),
        y_axis = nullif(btrim(coalesce(p_y_axis, '')), ''),
        position = nullif(btrim(coalesce(p_position, '')), ''),
        available = coalesce(p_available, true),
        updated_at = now()
    where id = p_product_id
      and updated_at = p_expected_updated_at
    returning * into v_result;

    if not found then
      if exists (select 1 from public.products p where p.id = p_product_id) then
        raise exception 'Dit artikel is intussen door iemand anders gewijzigd. Ververs en probeer opnieuw.' using errcode = '40001';
      end if;
      raise exception 'Dit artikel bestaat niet meer.' using errcode = '22023';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function private.save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) from public;
revoke all on function private.save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) from anon;
grant execute on function private.save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.binnenapp_save_product(
  p_product_id bigint,
  p_expected_updated_at timestamptz,
  p_ean_code text,
  p_jb_code text,
  p_description text,
  p_category text,
  p_unit text,
  p_packaged_per numeric,
  p_price_per_unit numeric,
  p_stock numeric,
  p_min_stock numeric,
  p_product_image_url text,
  p_source_image_url text,
  p_rack text,
  p_x_axis text,
  p_y_axis text,
  p_position text,
  p_available boolean
)
returns public.products
language sql
set search_path to ''
as $$
  select private.save_product(
    p_product_id, p_expected_updated_at, p_ean_code, p_jb_code,
    p_description, p_category, p_unit, p_packaged_per, p_price_per_unit,
    p_stock, p_min_stock, p_product_image_url, p_source_image_url,
    p_rack, p_x_axis, p_y_axis, p_position, p_available
  )
$$;

revoke all on function public.binnenapp_save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) from public;
revoke all on function public.binnenapp_save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) from anon;
grant execute on function public.binnenapp_save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean) to authenticated;

comment on function public.binnenapp_save_product(bigint,timestamptz,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text,boolean)
  is 'Maakt een artikel aan of wijzigt het veilig voor BinnenApp-beheerders, met validatie en gelijktijdigheidscontrole.';
