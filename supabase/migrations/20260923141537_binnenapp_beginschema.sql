-- Actuele structuur van BuitenApp, zelfstandig gemaakt voor BinnenApp.

begin;

set local check_function_bodies = off;

create schema if not exists private;

revoke all on schema private from public, anon;

grant usage on schema private to authenticated, service_role;

create extension if not exists "uuid-ossp" with schema "extensions";

create extension if not exists "pgcrypto" with schema "extensions";

create extension if not exists "pg_net" with schema "public";

create extension if not exists "pg_cron" with schema "pg_catalog";

create table "private"."order_mail_status" (
  "order_id" uuid not null,
  "soort" text not null,
  "actor_id" uuid,
  "poging_id" uuid not null,
  "ontvanger" text not null,
  "provider_id" text,
  "status" text not null,
  "fout" text,
  "controle_fout" text,
  "geprobeerd_op" timestamp with time zone not null,
  "gecontroleerd_op" timestamp with time zone,
  "controle_poging_op" timestamp with time zone
);

alter table "private"."order_mail_status" enable row level security;

create table "private"."order_pdf_kopie" (
  "id" uuid not null,
  "order_id" uuid not null,
  "actor_id" uuid not null,
  "order_number" text not null,
  "opslagpad" text not null,
  "object_id" uuid not null,
  "object_version" text not null,
  "bestandsnaam" text not null,
  "token" uuid not null,
  "status" text not null,
  "poging_id" uuid,
  "pogingen" integer not null,
  "aangemaakt_op" timestamp with time zone not null,
  "gewijzigd_op" timestamp with time zone not null,
  "beschikbaar_op" timestamp with time zone not null,
  "voorbereid_op" timestamp with time zone,
  "verzonden_op" timestamp with time zone,
  "afgerond_op" timestamp with time zone,
  "laatste_dispatch_op" timestamp with time zone,
  "dispatch_pogingen" integer not null,
  "net_request_id" bigint,
  "fout_code" text
);

alter table "private"."order_pdf_kopie" enable row level security;

create table "public"."orders" (
  "id" uuid not null,
  "order_number" text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone not null,
  "team" text not null,
  "status" text not null,
  "requester_name" text not null,
  "requester_email" text not null,
  "leys_order_number" text,
  "confirmation_pdf_url" text,
  "confirmation_pdf_path" text,
  "confirmation_pdf_name" text,
  "confirmation_in_map" boolean not null,
  "in_warehouse_since" timestamp with time zone,
  "mail_sent_at" timestamp with time zone,
  "source" text not null,
  "reference" text,
  "delivery_date" date,
  "expected_delivery_date" date
);

alter table "public"."orders" enable row level security;

create table "private"."app_members" (
  "user_id" uuid not null,
  "email" text not null,
  "display_name" text,
  "role" text not null,
  "active" boolean not null,
  "created_at" timestamp with time zone not null
);

alter table "private"."app_members" enable row level security;

create table "private"."api_write_log" (
  "id" bigint generated always as identity not null,
  "user_id" uuid not null,
  "action" text not null,
  "requested_at" timestamp with time zone not null
);

alter table "private"."api_write_log" enable row level security;

create table "public"."products" (
  "id" bigint not null,
  "ean_code" text not null,
  "jb_code" text,
  "description" text not null,
  "category" text not null,
  "unit" text not null,
  "packaged_per" numeric(12,3) not null,
  "price_per_unit" numeric(12,2) not null,
  "stock" numeric(12,3) not null,
  "min_stock" numeric(12,3) not null,
  "product_image_url" text,
  "source_image_url" text,
  "rack" text,
  "x_axis" text,
  "y_axis" text,
  "position" text,
  "available" boolean not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

alter table "public"."products" enable row level security;

create table "public"."cart_items" (
  "product_id" bigint not null,
  "quantity" integer not null,
  "updated_at" timestamp with time zone not null
);

alter table "public"."cart_items" enable row level security;

create table "public"."order_items" (
  "id" bigint generated always as identity not null,
  "order_id" uuid not null,
  "product_id" bigint,
  "source_line_id" bigint,
  "description" text not null,
  "quantity" integer not null,
  "unit" text not null,
  "ean_code" text,
  "jb_code" text,
  "packaged_per" numeric(12,3) not null,
  "price_per_unit" numeric(12,2) not null,
  "category" text,
  "product_image_url" text,
  "status" text not null,
  "created_at" timestamp with time zone not null
);

alter table "public"."order_items" enable row level security;

create table "public"."retour_items" (
  "id" uuid not null,
  "order_number" text not null,
  "product_id" bigint,
  "description" text not null,
  "ean_code" text,
  "jb_code" text,
  "quantity" integer not null,
  "unit" text,
  "product_image_url" text,
  "reason" text,
  "created_by" uuid,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

alter table "public"."retour_items" enable row level security;

create table "private"."cart_mail_queue" (
  "id" bigint generated always as identity not null,
  "created_at" timestamp with time zone not null,
  "created_by" uuid not null,
  "sender_email" text not null,
  "recipient" text not null,
  "subject" text not null,
  "body" text not null,
  "items" jsonb not null,
  "item_count" integer not null,
  "total_quantity" integer not null,
  "total_amount" numeric(12,2) not null
);

alter table "private"."cart_mail_queue" enable row level security;

create table "public"."order_corrections" (
  "id" uuid not null,
  "order_number" text not null,
  "correction_type" text not null,
  "description" text not null,
  "ean_code" text,
  "correct_quantity" integer,
  "note" text,
  "resolved" boolean not null,
  "created_by" uuid,
  "created_at" timestamp with time zone not null,
  "resolved_at" timestamp with time zone
);

alter table "public"."order_corrections" enable row level security;

create table "private"."cleanup_log" (
  "id" bigint generated always as identity not null,
  "uitgevoerd_op" timestamp with time zone not null,
  "aantal" integer not null,
  "bestelnummers" text[]
);

alter table "private"."cleanup_log" enable row level security;

create table "public"."order_status_dates" (
  "id" bigint generated always as identity not null,
  "order_number" text not null,
  "status" text not null,
  "bereikt_op" date not null,
  "created_by" uuid,
  "updated_at" timestamp with time zone not null
);

alter table "public"."order_status_dates" enable row level security;

create table "private"."push_subscriptions" (
  "id" bigint generated always as identity not null,
  "user_id" uuid not null,
  "endpoint" text not null,
  "p256dh" text not null,
  "auth_key" text not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

alter table "private"."push_subscriptions" enable row level security;

create table "private"."push_events" (
  "id" bigint generated always as identity not null,
  "event_type" text not null,
  "actor_id" uuid,
  "title" text not null,
  "body" text not null,
  "url" text not null,
  "created_at" timestamp with time zone not null
);

alter table "private"."push_events" enable row level security;

CREATE OR REPLACE FUNCTION public.binnenapp_set_product_stock(p_product_id bigint, p_stock numeric, p_expected_stock numeric)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.set_product_stock(p_product_id, p_stock, p_expected_stock)
$function$
;

revoke all on function "public"."binnenapp_set_product_stock"(p_product_id bigint, p_stock numeric, p_expected_stock numeric) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_set_product_stock"(p_product_id bigint, p_stock numeric, p_expected_stock numeric) to authenticated;

grant execute on function "public"."binnenapp_set_product_stock"(p_product_id bigint, p_stock numeric, p_expected_stock numeric) to service_role;

CREATE OR REPLACE FUNCTION private.remove_order_correction(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  removed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('remove_order_correction', 60, interval '1 hour');

  delete from public.order_corrections where id = p_id returning id into removed_id;

  if removed_id is null then
    raise exception 'Foutmelding niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', removed_id);
end;
$function$
;

revoke all on function "private"."remove_order_correction"(p_id uuid) from public, anon, authenticated, service_role;

grant execute on function "private"."remove_order_correction"(p_id uuid) to authenticated;

grant execute on function "private"."remove_order_correction"(p_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_add_order_correction(p_order_number text, p_correction_type text, p_description text, p_ean_code text DEFAULT NULL::text, p_correct_quantity integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.add_order_correction(
    p_order_number, p_correction_type, p_description,
    p_ean_code, p_correct_quantity, p_note
  )
$function$
;

revoke all on function "public"."binnenapp_add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) to authenticated;

grant execute on function "public"."binnenapp_add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_set_order_correction_resolved(p_id uuid, p_resolved boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.set_order_correction_resolved(p_id, p_resolved)
$function$
;

revoke all on function "public"."binnenapp_set_order_correction_resolved"(p_id uuid, p_resolved boolean) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_set_order_correction_resolved"(p_id uuid, p_resolved boolean) to authenticated;

grant execute on function "public"."binnenapp_set_order_correction_resolved"(p_id uuid, p_resolved boolean) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_membership_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.membership_status() $function$
;

revoke all on function "public"."binnenapp_membership_status"() from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_membership_status"() to authenticated;

grant execute on function "public"."binnenapp_membership_status"() to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_sync_cart(p_items jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.sync_cart(p_items) $function$
;

revoke all on function "public"."binnenapp_sync_cart"(p_items jsonb) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_sync_cart"(p_items jsonb) to authenticated;

grant execute on function "public"."binnenapp_sync_cart"(p_items jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_remove_order_correction(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.remove_order_correction(p_id)
$function$
;

revoke all on function "public"."binnenapp_remove_order_correction"(p_id uuid) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_remove_order_correction"(p_id uuid) to authenticated;

grant execute on function "public"."binnenapp_remove_order_correction"(p_id uuid) to service_role;

CREATE OR REPLACE FUNCTION private.save_product(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

revoke all on function "private"."save_product"(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) from public, anon, authenticated, service_role;

grant execute on function "private"."save_product"(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) to authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into private.app_members(user_id, email, display_name, active)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    (new.invited_at is not null)
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$function$
;

revoke all on function "private"."handle_new_auth_user"() from public, anon, authenticated, service_role;

grant execute on function "private"."handle_new_auth_user"() to authenticated;

grant execute on function "private"."handle_new_auth_user"() to service_role;

CREATE OR REPLACE FUNCTION private.is_app_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from private.app_members
    where user_id = (select auth.uid())
      and active
  )
$function$
;

revoke all on function "private"."is_app_member"() from public, anon, authenticated, service_role;

grant execute on function "private"."is_app_member"() to authenticated;

CREATE OR REPLACE FUNCTION private.assert_app_member()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or not private.is_app_member() then
    raise exception 'Je account heeft geen toegang tot BinnenApp.' using errcode = '42501';
  end if;
end;
$function$
;

revoke all on function "private"."assert_app_member"() from public, anon, authenticated, service_role;

grant execute on function "private"."assert_app_member"() to authenticated;

CREATE OR REPLACE FUNCTION private.membership_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select jsonb_build_object(
        'active', active,
        'role', role,
        'email', email,
        'displayName', display_name
      )
      from private.app_members
      where user_id = (select auth.uid())
    ),
    jsonb_build_object('active', false, 'role', null, 'email', null, 'displayName', null)
  )
$function$
;

revoke all on function "private"."membership_status"() from public, anon, authenticated, service_role;

grant execute on function "private"."membership_status"() to authenticated;

CREATE OR REPLACE FUNCTION private.check_write_rate_limit(p_action text, p_max_requests integer, p_window interval)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  request_count integer;
begin
  if current_user_id is null then
    raise exception 'Log eerst in.' using errcode = '42501';
  end if;

  delete from private.api_write_log
  where requested_at < now() - interval '1 day';

  select count(*)
  into request_count
  from private.api_write_log
  where action = p_action
    and user_id = current_user_id
    and requested_at >= now() - p_window;

  if request_count >= p_max_requests then
    raise exception 'Te veel verzoeken. Probeer het later opnieuw.' using errcode = 'P0001';
  end if;

  insert into private.api_write_log(user_id, action)
  values (current_user_id, p_action);
end;
$function$
;

revoke all on function "private"."check_write_rate_limit"(p_action text, p_max_requests integer, p_window interval) from public, anon, authenticated, service_role;

grant execute on function "private"."check_write_rate_limit"(p_action text, p_max_requests integer, p_window interval) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_send_cart_mail(p_items jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.send_cart_mail(p_items)
$function$
;

revoke all on function "public"."binnenapp_send_cart_mail"(p_items jsonb) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_send_cart_mail"(p_items jsonb) to authenticated;

grant execute on function "public"."binnenapp_send_cart_mail"(p_items jsonb) to service_role;

CREATE OR REPLACE FUNCTION private.update_order_confirmation(p_order_number text, p_confirmed boolean DEFAULT NULL::boolean, p_leys_order_number text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text, p_pdf_url text DEFAULT NULL::text, p_pdf_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('update_order_confirmation', 60, interval '1 hour');

  update public.orders
  set confirmation_in_map = coalesce(p_confirmed, confirmation_in_map),
      leys_order_number = coalesce(nullif(left(trim(p_leys_order_number), 80), ''), leys_order_number),
      confirmation_pdf_path = coalesce(nullif(left(trim(p_pdf_path), 1000), ''), confirmation_pdf_path),
      confirmation_pdf_url = coalesce(nullif(left(trim(p_pdf_url), 2000), ''), confirmation_pdf_url),
      confirmation_pdf_name = coalesce(nullif(left(trim(p_pdf_name), 255), ''), confirmation_pdf_name)
  where order_number = p_order_number
  returning id into changed_id;

  if changed_id is null then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'orderNumber', p_order_number,
    'confirmed', p_confirmed,
    'leysOrderNumber', p_leys_order_number,
    'pdfPath', p_pdf_path,
    'pdfUrl', p_pdf_url,
    'pdfName', p_pdf_name
  );
end;
$function$
;

revoke all on function "private"."update_order_confirmation"(p_order_number text, p_confirmed boolean, p_leys_order_number text, p_pdf_path text, p_pdf_url text, p_pdf_name text) from public, anon, authenticated, service_role;

grant execute on function "private"."update_order_confirmation"(p_order_number text, p_confirmed boolean, p_leys_order_number text, p_pdf_path text, p_pdf_url text, p_pdf_name text) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_update_order_status(p_order_number text, p_status text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.update_order_status(p_order_number, p_status) $function$
;

revoke all on function "public"."binnenapp_update_order_status"(p_order_number text, p_status text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_update_order_status"(p_order_number text, p_status text) to authenticated;

grant execute on function "public"."binnenapp_update_order_status"(p_order_number text, p_status text) to service_role;

CREATE OR REPLACE FUNCTION private.update_order_status(p_order_number text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  clean_status text := case trim(coalesce(p_status, ''))
    when 'In Magazijn' then 'In magazijn'
    else trim(coalesce(p_status, ''))
  end;
  changed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('update_order_status', 120, interval '1 hour');

  if clean_status not in ('Bestelling geplaatst', 'Mail Verstuurd', 'Orderbevestiging gekregen', 'Geleverd', 'In magazijn') then
    raise exception 'Ongeldige bestelstatus.' using errcode = '22023';
  end if;

  update public.orders
  set status = clean_status,
      in_warehouse_since = case
        when clean_status = 'In magazijn' then coalesce(in_warehouse_since, now())
        else null
      end
  where order_number = p_order_number
  returning id into changed_id;

  if changed_id is null then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  update public.order_items set status = clean_status where order_id = changed_id;

  -- Datum van deze stap vastleggen; een eerder handmatig gezette datum blijft staan
  insert into public.order_status_dates (order_number, status, bereikt_op, created_by)
  values (p_order_number, clean_status, (now() at time zone 'Europe/Amsterdam')::date, (select auth.uid()))
  on conflict (order_number, status) do nothing;

  return jsonb_build_object('orderNumber', p_order_number, 'status', clean_status);
end;
$function$
;

revoke all on function "private"."update_order_status"(p_order_number text, p_status text) from public, anon, authenticated, service_role;

grant execute on function "private"."update_order_status"(p_order_number text, p_status text) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_update_order_confirmation(p_order_number text, p_confirmed boolean DEFAULT NULL::boolean, p_leys_order_number text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text, p_pdf_url text DEFAULT NULL::text, p_pdf_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_order_confirmation(
    p_order_number, p_confirmed, p_leys_order_number, p_pdf_path, p_pdf_url, p_pdf_name
  )
$function$
;

revoke all on function "public"."binnenapp_update_order_confirmation"(p_order_number text, p_confirmed boolean, p_leys_order_number text, p_pdf_path text, p_pdf_url text, p_pdf_name text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_update_order_confirmation"(p_order_number text, p_confirmed boolean, p_leys_order_number text, p_pdf_path text, p_pdf_url text, p_pdf_name text) to authenticated;

grant execute on function "public"."binnenapp_update_order_confirmation"(p_order_number text, p_confirmed boolean, p_leys_order_number text, p_pdf_path text, p_pdf_url text, p_pdf_name text) to service_role;

CREATE OR REPLACE FUNCTION private.approve_member(p_email text, p_role text DEFAULT 'member'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Ongeldige rol.' using errcode = '22023';
  end if;
  update private.app_members set active = true, role = p_role where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'Account niet gevonden. Maak het Auth-account eerst aan.' using errcode = '22023';
  end if;
  return true;
end;
$function$
;

revoke all on function "private"."approve_member"(p_email text, p_role text) from public, anon, authenticated, service_role;

grant execute on function "private"."approve_member"(p_email text, p_role text) to service_role;

CREATE OR REPLACE FUNCTION private.xml_escape(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  select replace(
    replace(
      replace(
        replace(
          replace(p_value, '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      '"', '&quot;'
    ),
    '''', '&apos;'
  )
$function$
;

revoke all on function "private"."xml_escape"(p_value text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.send_cart_mail(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  sender_email text;
  queue_id bigint;
  requested_count integer := 0;
  matched_count integer := 0;
  total_quantity integer := 0;
  total_amount numeric(12, 2) := 0;
  item_rows jsonb := '[]'::jsonb;
  mail_lines text := '';
  mail_subject text;
  mail_body text;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('send_cart_mail', 10, interval '1 hour');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 250 then
    raise exception 'De winkelwagen is leeg of ongeldig.' using errcode = '22023';
  end if;

  select count(*)
  into requested_count
  from jsonb_array_elements(p_items) item
  where (item ->> 'product_id') ~ '^[0-9]+$'
    and (item ->> 'quantity') ~ '^[0-9]+$'
    and (item ->> 'quantity')::integer between 1 and 10000;

  if requested_count <> jsonb_array_length(p_items) then
    raise exception 'De winkelwagen bevat ongeldige regels.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception 'De winkelwagen bevat dubbele artikelen.' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    coalesce(sum((item ->> 'quantity')::integer), 0)::integer,
    coalesce(sum((item ->> 'quantity')::integer * p.price_per_unit), 0)::numeric(12, 2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', p.id,
          'description', p.description,
          'quantity', (item ->> 'quantity')::integer,
          'unit', p.unit,
          'jb_code', coalesce(p.jb_code, ''),
          'ean_code', p.ean_code,
          'price_per_unit', p.price_per_unit,
          'line_total', ((item ->> 'quantity')::integer * p.price_per_unit)::numeric(12, 2)
        )
        order by coalesce(p.jb_code, ''), p.description
      ),
      '[]'::jsonb
    ),
    coalesce(
      string_agg(
        format(
          '%s x %s %s%s',
          (item ->> 'quantity')::integer,
          p.description,
          p.unit,
          case when coalesce(p.jb_code, '') <> '' then format(' (JB %s)', p.jb_code) else '' end
        ),
        E'\n'
        order by coalesce(p.jb_code, ''), p.description
      ),
      ''
    )
  into matched_count, total_quantity, total_amount, item_rows, mail_lines
  from jsonb_array_elements(p_items) item
  join public.products p
    on p.id = (item ->> 'product_id')::bigint
   and p.available;

  if matched_count <> requested_count then
    raise exception 'Een of meer producten zijn niet beschikbaar.' using errcode = '22023';
  end if;

  select email
  into sender_email
  from private.app_members
  where user_id = current_user_id
    and active;

  mail_subject := format('BinnenApp winkelwagen - %s stuks', total_quantity);
  mail_body := format(
    E'Winkelwagen uit BinnenApp\n\n%s\n\nTotaal: %s stuks\nTotaalbedrag: EUR %s\nVerstuurd door: %s\nTijdstip: %s',
    mail_lines,
    total_quantity,
    to_char(total_amount, 'FM999999990.00'),
    coalesce(sender_email, 'Onbekend'),
    to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI')
  );

  delete from private.cart_mail_queue
  where created_at < now() - interval '30 days';

  insert into private.cart_mail_queue (
    created_by,
    sender_email,
    recipient,
    subject,
    body,
    items,
    item_count,
    total_quantity,
    total_amount
  )
  values (
    current_user_id,
    coalesce(sender_email, 'Onbekend'),
    'reinjongenelen1@gmail.com',
    mail_subject,
    mail_body,
    item_rows,
    matched_count,
    total_quantity,
    total_amount
  )
  returning id into queue_id;

  return jsonb_build_object(
    'queued', true,
    'queueId', queue_id,
    'provider', 'zapier-rss',
    'recipient', 'reinjongenelen1@gmail.com',
    'itemCount', matched_count,
    'totalQuantity', total_quantity
  );
end;
$function$
;

revoke all on function "private"."send_cart_mail"(p_items jsonb) from public, anon, authenticated, service_role;

grant execute on function "private"."send_cart_mail"(p_items jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.cart_mail_rss(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  stored_token text;
  items_xml text := '';
begin
  select decrypted_secret
  into stored_token
  from vault.decrypted_secrets
  where name = 'binnenapp_cart_mail_rss_token'
  order by updated_at desc
  limit 1;

  if stored_token is null
    or p_token is null
    or length(p_token) < 64
    or p_token <> stored_token then
    raise exception 'Ongeldige feedtoegang.' using errcode = '28000';
  end if;

  select coalesce(
    string_agg(
      format(
        '<item><title>%s</title><description>%s</description><guid isPermaLink="false">binnenapp-cart-mail-%s</guid><pubDate>%s</pubDate></item>',
        private.xml_escape(q.subject),
        private.xml_escape(q.body),
        q.id,
        to_char(q.created_at at time zone 'UTC', 'Dy, DD Mon YYYY HH24:MI:SS "GMT"')
      ),
      ''
      order by q.id desc
    ),
    ''
  )
  into items_xml
  from (
    select id, created_at, subject, body
    from private.cart_mail_queue
    order by id desc
    limit 100
  ) q;

  return '<?xml version="1.0" encoding="UTF-8"?>' ||
    '<rss version="2.0"><channel>' ||
    '<title>BinnenApp winkelwagenmails</title>' ||
    '<link>https://github.com/ReinJanssenBouw/BinnenApp</link>' ||
    '<description>Bestellijsten uit de BinnenApp</description>' ||
    items_xml ||
    '</channel></rss>';
end;
$function$
;

revoke all on function "private"."cart_mail_rss"(p_token text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_cart_mail_rss(p_token text)
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.cart_mail_rss(p_token)
$function$
;

revoke all on function "public"."binnenapp_cart_mail_rss"(p_token text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_cart_mail_rss"(p_token text) to service_role;

CREATE OR REPLACE FUNCTION private.add_retour_item(p_order_number text, p_description text, p_ean_code text DEFAULT NULL::text, p_jb_code text DEFAULT NULL::text, p_quantity integer DEFAULT 1, p_unit text DEFAULT NULL::text, p_product_image_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  clean_order_number text := trim(coalesce(p_order_number, ''));
  clean_description text := trim(coalesce(p_description, ''));
  clean_quantity integer := coalesce(p_quantity, 1);
  new_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('add_retour_item', 120, interval '1 hour');

  if clean_order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;
  if length(clean_description) < 1 or length(clean_description) > 300 then
    raise exception 'Ongeldige artikelomschrijving.' using errcode = '22023';
  end if;
  if clean_quantity < 1 or clean_quantity > 10000 then
    raise exception 'Ongeldig aantal.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where order_number = clean_order_number) then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  insert into public.retour_items (
    order_number, description, ean_code, jb_code, quantity, unit,
    product_image_url, created_by
  ) values (
    clean_order_number,
    left(clean_description, 300),
    nullif(left(trim(coalesce(p_ean_code, '')), 60), ''),
    nullif(left(trim(coalesce(p_jb_code, '')), 60), ''),
    clean_quantity,
    nullif(left(trim(coalesce(p_unit, '')), 30), ''),
    nullif(left(trim(coalesce(p_product_image_url, '')), 2000), ''),
    (select auth.uid())
  )
  on conflict (order_number, coalesce(ean_code, ''), description) do nothing
  returning id into new_id;

  if new_id is null then
    raise exception 'Dit artikel staat al op de retourlijst.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', new_id, 'orderNumber', clean_order_number);
end;
$function$
;

revoke all on function "private"."add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) from public, anon, authenticated, service_role;

grant execute on function "private"."add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) to authenticated;

grant execute on function "private"."add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) to service_role;

CREATE OR REPLACE FUNCTION private.update_retour_item(p_id uuid, p_quantity integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('update_retour_item', 300, interval '5 minutes');

  if p_quantity is not null and (p_quantity < 1 or p_quantity > 10000) then
    raise exception 'Ongeldig aantal.' using errcode = '22023';
  end if;

  update public.retour_items
  set quantity = coalesce(p_quantity, quantity),
      reason = case when p_reason is null then reason
                    else nullif(left(trim(p_reason), 300), '') end,
      updated_at = now()
  where id = p_id
  returning id into changed_id;

  if changed_id is null then
    raise exception 'Retourregel niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', changed_id);
end;
$function$
;

revoke all on function "private"."update_retour_item"(p_id uuid, p_quantity integer, p_reason text) from public, anon, authenticated, service_role;

grant execute on function "private"."update_retour_item"(p_id uuid, p_quantity integer, p_reason text) to authenticated;

grant execute on function "private"."update_retour_item"(p_id uuid, p_quantity integer, p_reason text) to service_role;

CREATE OR REPLACE FUNCTION private.remove_retour_item(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  removed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('remove_retour_item', 120, interval '1 hour');

  delete from public.retour_items where id = p_id returning id into removed_id;

  if removed_id is null then
    raise exception 'Retourregel niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', removed_id);
end;
$function$
;

revoke all on function "private"."remove_retour_item"(p_id uuid) from public, anon, authenticated, service_role;

grant execute on function "private"."remove_retour_item"(p_id uuid) to authenticated;

grant execute on function "private"."remove_retour_item"(p_id uuid) to service_role;

CREATE OR REPLACE FUNCTION private.clear_retour()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  removed_count integer := 0;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('clear_retour', 20, interval '1 hour');

  delete from public.retour_items;
  get diagnostics removed_count = row_count;

  return jsonb_build_object('removed', removed_count);
end;
$function$
;

revoke all on function "private"."clear_retour"() from public, anon, authenticated, service_role;

grant execute on function "private"."clear_retour"() to authenticated;

grant execute on function "private"."clear_retour"() to service_role;

CREATE OR REPLACE FUNCTION private.set_order_correction_resolved(p_id uuid, p_resolved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('set_order_correction_resolved', 120, interval '1 hour');

  update public.order_corrections
  set resolved = coalesce(p_resolved, false),
      resolved_at = case when coalesce(p_resolved, false) then now() else null end
  where id = p_id
  returning id into changed_id;

  if changed_id is null then
    raise exception 'Foutmelding niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', changed_id, 'resolved', coalesce(p_resolved, false));
end;
$function$
;

revoke all on function "private"."set_order_correction_resolved"(p_id uuid, p_resolved boolean) from public, anon, authenticated, service_role;

grant execute on function "private"."set_order_correction_resolved"(p_id uuid, p_resolved boolean) to authenticated;

grant execute on function "private"."set_order_correction_resolved"(p_id uuid, p_resolved boolean) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_add_retour_item(p_order_number text, p_description text, p_ean_code text DEFAULT NULL::text, p_jb_code text DEFAULT NULL::text, p_quantity integer DEFAULT 1, p_unit text DEFAULT NULL::text, p_product_image_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.add_retour_item(
    p_order_number, p_description, p_ean_code, p_jb_code,
    p_quantity, p_unit, p_product_image_url
  )
$function$
;

revoke all on function "public"."binnenapp_add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) to authenticated;

grant execute on function "public"."binnenapp_add_retour_item"(p_order_number text, p_description text, p_ean_code text, p_jb_code text, p_quantity integer, p_unit text, p_product_image_url text) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_update_retour_item(p_id uuid, p_quantity integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_retour_item(p_id, p_quantity, p_reason)
$function$
;

revoke all on function "public"."binnenapp_update_retour_item"(p_id uuid, p_quantity integer, p_reason text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_update_retour_item"(p_id uuid, p_quantity integer, p_reason text) to authenticated;

grant execute on function "public"."binnenapp_update_retour_item"(p_id uuid, p_quantity integer, p_reason text) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_remove_retour_item(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.remove_retour_item(p_id)
$function$
;

revoke all on function "public"."binnenapp_remove_retour_item"(p_id uuid) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_remove_retour_item"(p_id uuid) to authenticated;

grant execute on function "public"."binnenapp_remove_retour_item"(p_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_clear_retour()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.clear_retour()
$function$
;

revoke all on function "public"."binnenapp_clear_retour"() from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_clear_retour"() to authenticated;

grant execute on function "public"."binnenapp_clear_retour"() to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_place_order(p_order_number text, p_requester_name text, p_requester_email text, p_team text DEFAULT 'Binnenploeg'::text, p_reference text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.place_order(
    p_order_number, p_requester_name, p_requester_email,
    p_team, p_reference, p_delivery_date
  )
$function$
;

revoke all on function "public"."binnenapp_place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) to authenticated;

grant execute on function "public"."binnenapp_place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) to service_role;

CREATE OR REPLACE FUNCTION private.add_order_correction(p_order_number text, p_correction_type text, p_description text, p_ean_code text DEFAULT NULL::text, p_correct_quantity integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  clean_order_number text := trim(coalesce(p_order_number, ''));
  clean_type text := trim(coalesce(p_correction_type, ''));
  clean_description text := trim(coalesce(p_description, ''));
  new_id uuid;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('add_order_correction', 60, interval '1 hour');

  if clean_order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;
  if clean_type not in ('artikel_vergeten', 'verkeerd_aantal', 'artikel_teveel') then
    raise exception 'Ongeldig soort fout.' using errcode = '22023';
  end if;
  if length(clean_description) < 1 or length(clean_description) > 300 then
    raise exception 'Vul in om welk artikel het gaat.' using errcode = '22023';
  end if;
  if p_correct_quantity is not null and (p_correct_quantity < 0 or p_correct_quantity > 10000) then
    raise exception 'Ongeldig aantal.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where order_number = clean_order_number) then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  insert into public.order_corrections (
    order_number, correction_type, description, ean_code, correct_quantity, note, created_by
  ) values (
    clean_order_number,
    clean_type,
    left(clean_description, 300),
    nullif(left(trim(coalesce(p_ean_code, '')), 60), ''),
    p_correct_quantity,
    nullif(left(trim(coalesce(p_note, '')), 500), ''),
    (select auth.uid())
  )
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'orderNumber', clean_order_number);
end;
$function$
;

revoke all on function "private"."add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) from public, anon, authenticated, service_role;

grant execute on function "private"."add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) to authenticated;

grant execute on function "private"."add_order_correction"(p_order_number text, p_correction_type text, p_description text, p_ean_code text, p_correct_quantity integer, p_note text) to service_role;

CREATE OR REPLACE FUNCTION private.place_order(p_order_number text, p_requester_name text, p_requester_email text, p_team text DEFAULT 'Binnenploeg'::text, p_reference text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_order_id uuid;
  clean_order_number text := trim(coalesce(p_order_number, ''));
  clean_name text := trim(coalesce(p_requester_name, ''));
  clean_email text := lower(trim(coalesce(p_requester_email, '')));
  clean_team text := left(trim(coalesce(nullif(p_team, ''), 'Binnenploeg')), 80);
  clean_reference text := nullif(left(trim(coalesce(p_reference, '')), 120), '');
  start_status constant text := 'Mail Verstuurd';
  inserted_lines integer := 0;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('place_order', 10, interval '1 hour');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('binnenapp_shared_cart'));

  if clean_order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 120 then
    raise exception 'Vul een geldige naam in.' using errcode = '22023';
  end if;
  if length(clean_email) > 254 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Vul een geldig e-mailadres in.' using errcode = '22023';
  end if;
  if p_delivery_date is not null
     and (p_delivery_date < current_date - 1 or p_delivery_date > current_date + 730) then
    raise exception 'Ongeldige leverdatum.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cart_items) then
    raise exception 'De winkelwagen is leeg.' using errcode = '22023';
  end if;

  insert into public.orders(
    order_number, created_by, team, status, requester_name, requester_email, source,
    reference, delivery_date
  ) values (
    clean_order_number, (select auth.uid()), clean_team, start_status,
    clean_name, clean_email, 'BinnenApp 2.1.0', clean_reference, p_delivery_date
  ) returning id into new_order_id;

  insert into public.order_items(
    order_id, product_id, description, quantity, unit, ean_code, jb_code,
    packaged_per, price_per_unit, category, product_image_url, status
  )
  select
    new_order_id, p.id, p.description, c.quantity, p.unit, p.ean_code, p.jb_code,
    p.packaged_per, p.price_per_unit, p.category, p.product_image_url, start_status
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where p.available;

  get diagnostics inserted_lines = row_count;
  if inserted_lines = 0 then
    raise exception 'De winkelwagen bevat geen beschikbare producten.' using errcode = '22023';
  end if;

  -- Startdatum van de eerste stap meteen vastleggen
  insert into public.order_status_dates(order_number, status, bereikt_op, created_by)
  values (clean_order_number, start_status, (now() at time zone 'Europe/Amsterdam')::date, (select auth.uid()))
  on conflict (order_number, status) do nothing;

  delete from public.cart_items
  where product_id is not null;

  return jsonb_build_object(
    'id', new_order_id,
    'orderNumber', clean_order_number,
    'createdAt', now(),
    'team', clean_team,
    'status', start_status,
    'requesterName', clean_name,
    'reference', clean_reference,
    'deliveryDate', p_delivery_date,
    'lineCount', inserted_lines
  );
end;
$function$
;

revoke all on function "private"."place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) from public, anon, authenticated, service_role;

grant execute on function "private"."place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) to authenticated;

grant execute on function "private"."place_order"(p_order_number text, p_requester_name text, p_requester_email text, p_team text, p_reference text, p_delivery_date date) to service_role;

CREATE OR REPLACE FUNCTION private.update_order_date(p_order_number text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_id uuid;
  oude_tijd time;
  nieuwe_stamp timestamptz;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('update_order_date', 60, interval '1 hour');

  if p_date is null then
    raise exception 'Geen datum opgegeven.' using errcode = '22023';
  end if;
  -- Een bestelling kan niet in de toekomst geplaatst zijn
  if p_date > current_date or p_date < date '2020-01-01' then
    raise exception 'Ongeldige besteldatum.' using errcode = '22023';
  end if;

  select id, created_at::time into target_id, oude_tijd
  from public.orders
  where order_number = p_order_number;

  if target_id is null then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  -- Tijdstip binnen de dag blijft staan, alleen de datum verschuift
  nieuwe_stamp := (p_date + coalesce(oude_tijd, time '12:00'))::timestamptz;

  update public.orders set created_at = nieuwe_stamp where id = target_id;
  -- Regels meeverzetten: de app toont de regeldatum, dus anders zie je niets
  update public.order_items set created_at = nieuwe_stamp where order_id = target_id;

  return jsonb_build_object(
    'orderNumber', p_order_number,
    'createdAt', nieuwe_stamp
  );
end;
$function$
;

revoke all on function "private"."update_order_date"(p_order_number text, p_date date) from public, anon, authenticated, service_role;

grant execute on function "private"."update_order_date"(p_order_number text, p_date date) to authenticated;

grant execute on function "private"."update_order_date"(p_order_number text, p_date date) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_update_order_date(p_order_number text, p_date date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_order_date(p_order_number, p_date)
$function$
;

revoke all on function "public"."binnenapp_update_order_date"(p_order_number text, p_date date) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_update_order_date"(p_order_number text, p_date date) to authenticated;

grant execute on function "public"."binnenapp_update_order_date"(p_order_number text, p_date date) to service_role;

CREATE OR REPLACE FUNCTION private.add_to_nalevering(p_order_number text, p_item_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bron_order public.orders%rowtype;
  bron_regel public.order_items%rowtype;
  na_nummer text;
  na_order_id uuid;
  nieuw boolean := false;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('add_to_nalevering', 60, interval '1 hour');

  select * into bron_order from public.orders where order_number = trim(coalesce(p_order_number, ''));
  if bron_order.id is null then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  -- Een nalevering van een nalevering zou eindeloos doorstapelen
  if bron_order.order_number like '%NALEVERING' then
    raise exception 'Dit is al een nalevering.' using errcode = '22023';
  end if;

  select * into bron_regel
  from public.order_items
  where id = p_item_id and order_id = bron_order.id;
  if bron_regel.id is null then
    raise exception 'Artikelregel niet gevonden bij deze bestelling.' using errcode = '22023';
  end if;

  na_nummer := bron_order.order_number || 'NALEVERING';

  select id into na_order_id from public.orders where order_number = na_nummer;

  -- Bestaat er nog geen nalevering, dan maken we hem aan met de gegevens
  -- van de oorspronkelijke bestelling
  if na_order_id is null then
    insert into public.orders(
      order_number, created_by, team, status, requester_name, requester_email,
      source, reference, delivery_date
    ) values (
      na_nummer, (select auth.uid()), bron_order.team, 'Mail Verstuurd',
      bron_order.requester_name, bron_order.requester_email,
      'BinnenApp nalevering', bron_order.reference, bron_order.delivery_date
    ) returning id into na_order_id;
    nieuw := true;
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = na_order_id
      and description = bron_regel.description
      and coalesce(ean_code, '') = coalesce(bron_regel.ean_code, '')
  ) then
    raise exception 'Dit artikel staat al in de nalevering.' using errcode = '22023';
  end if;

  insert into public.order_items(
    order_id, product_id, description, quantity, unit, ean_code, jb_code,
    packaged_per, price_per_unit, category, product_image_url, status
  ) values (
    na_order_id, bron_regel.product_id, bron_regel.description, bron_regel.quantity,
    bron_regel.unit, bron_regel.ean_code, bron_regel.jb_code, bron_regel.packaged_per,
    bron_regel.price_per_unit, bron_regel.category, bron_regel.product_image_url,
    'Mail Verstuurd'
  );

  return jsonb_build_object(
    'orderNumber', na_nummer,
    'nieuweBestelling', nieuw,
    'artikel', bron_regel.description
  );
end;
$function$
;

revoke all on function "private"."add_to_nalevering"(p_order_number text, p_item_id bigint) from public, anon, authenticated, service_role;

grant execute on function "private"."add_to_nalevering"(p_order_number text, p_item_id bigint) to authenticated;

grant execute on function "private"."add_to_nalevering"(p_order_number text, p_item_id bigint) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_add_to_nalevering(p_order_number text, p_item_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.add_to_nalevering(p_order_number, p_item_id)
$function$
;

revoke all on function "public"."binnenapp_add_to_nalevering"(p_order_number text, p_item_id bigint) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_add_to_nalevering"(p_order_number text, p_item_id bigint) to authenticated;

grant execute on function "public"."binnenapp_add_to_nalevering"(p_order_number text, p_item_id bigint) to service_role;

CREATE OR REPLACE FUNCTION private.cleanup_oude_bestellingen()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  nummers text[];
  verwijderd integer := 0;
begin
  select array_agg(order_number)
  into nummers
  from public.orders
  where in_warehouse_since is not null
    and in_warehouse_since < now() - interval '90 days';

  if nummers is null or array_length(nummers, 1) is null then
    return jsonb_build_object('verwijderd', 0, 'nummers', '[]'::jsonb);
  end if;

  -- Deze verwijzen via bestelnummer, zonder foreign key: dus handmatig mee opruimen
  delete from public.order_corrections where order_number = any(nummers);
  delete from public.retour_items where order_number = any(nummers);

  -- Opgeslagen orderbevestigingen. Mag de opruiming niet laten mislukken,
  -- daarom apart afgevangen.
  begin
    delete from storage.objects
    where bucket_id = 'order-confirmations'
      and name in (
        select confirmation_pdf_path
        from public.orders
        where order_number = any(nummers) and confirmation_pdf_path is not null
      );
  exception when others then
    raise warning 'PDF-opruiming overgeslagen: %', sqlerrm;
  end;

  -- order_items verdwijnt automatisch mee (cascade)
  delete from public.orders where order_number = any(nummers);
  get diagnostics verwijderd = row_count;

  insert into private.cleanup_log(aantal, bestelnummers) values (verwijderd, nummers);

  return jsonb_build_object('verwijderd', verwijderd, 'nummers', to_jsonb(nummers));
end;
$function$
;

revoke all on function "private"."cleanup_oude_bestellingen"() from public, anon, authenticated, service_role;

grant execute on function "private"."cleanup_oude_bestellingen"() to authenticated;

grant execute on function "private"."cleanup_oude_bestellingen"() to service_role;

CREATE OR REPLACE FUNCTION private.set_status_datum(p_order_number text, p_status text, p_datum date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  schoon_status text := trim(coalesce(p_status, ''));
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('set_status_datum', 120, interval '1 hour');

  if schoon_status not in ('Bestelling geplaatst', 'Mail Verstuurd', 'Orderbevestiging gekregen', 'Geleverd', 'In magazijn') then
    raise exception 'Ongeldige status.' using errcode = '22023';
  end if;
  if p_datum is null or p_datum < date '2020-01-01' or p_datum > current_date + 1 then
    raise exception 'Ongeldige datum.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where order_number = p_order_number) then
    raise exception 'Bestelling niet gevonden.' using errcode = '22023';
  end if;

  insert into public.order_status_dates (order_number, status, bereikt_op, created_by)
  values (p_order_number, schoon_status, p_datum, (select auth.uid()))
  on conflict (order_number, status)
  do update set bereikt_op = excluded.bereikt_op, updated_at = now();

  return jsonb_build_object('orderNumber', p_order_number, 'status', schoon_status, 'datum', p_datum);
end;
$function$
;

revoke all on function "private"."set_status_datum"(p_order_number text, p_status text, p_datum date) from public, anon, authenticated, service_role;

grant execute on function "private"."set_status_datum"(p_order_number text, p_status text, p_datum date) to authenticated;

grant execute on function "private"."set_status_datum"(p_order_number text, p_status text, p_datum date) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_set_status_datum(p_order_number text, p_status text, p_datum date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.set_status_datum(p_order_number, p_status, p_datum)
$function$
;

revoke all on function "public"."binnenapp_set_status_datum"(p_order_number text, p_status text, p_datum date) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_set_status_datum"(p_order_number text, p_status text, p_datum date) to authenticated;

grant execute on function "public"."binnenapp_set_status_datum"(p_order_number text, p_status text, p_datum date) to service_role;

CREATE OR REPLACE FUNCTION private.assert_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Log eerst in.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.app_members
    where user_id = (select auth.uid()) and active and role = 'admin'
  ) then
    raise exception 'Alleen een beheerder kan dit doen.' using errcode = '42501';
  end if;
end;
$function$
;

revoke all on function "private"."assert_admin"() from public, anon, authenticated, service_role;

grant execute on function "private"."assert_admin"() to authenticated;

grant execute on function "private"."assert_admin"() to service_role;

CREATE OR REPLACE FUNCTION private.leden_lijst()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(r order by r.active, r.created_at), '[]'::jsonb)
  from (
    select email, coalesce(display_name, '') as naam, role, active, created_at
    from private.app_members
  ) r
$function$
;

revoke all on function "private"."leden_lijst"() from public, anon, authenticated, service_role;

grant execute on function "private"."leden_lijst"() to authenticated;

grant execute on function "private"."leden_lijst"() to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_leden()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_admin();
  return private.leden_lijst();
end;
$function$
;

revoke all on function "public"."binnenapp_leden"() from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_leden"() to authenticated;

grant execute on function "public"."binnenapp_leden"() to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_keur_lid_goed(p_email text, p_role text DEFAULT 'member'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('keur_lid_goed', 60, interval '1 hour');
  perform private.approve_member(p_email, p_role);
  return jsonb_build_object('email', lower(trim(p_email)), 'role', p_role, 'active', true);
end;
$function$
;

revoke all on function "public"."binnenapp_keur_lid_goed"(p_email text, p_role text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_keur_lid_goed"(p_email text, p_role text) to authenticated;

grant execute on function "public"."binnenapp_keur_lid_goed"(p_email text, p_role text) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_trek_lid_in(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  geraakt integer := 0;
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('trek_lid_in', 60, interval '1 hour');

  -- Jezelf uitsluiten zou de laatste beheerder buiten kunnen sluiten
  if lower(trim(p_email)) = (select lower(email) from private.app_members where user_id = (select auth.uid())) then
    raise exception 'Je kunt je eigen toegang niet intrekken.' using errcode = '22023';
  end if;

  update private.app_members set active = false where lower(email) = lower(trim(p_email));
  get diagnostics geraakt = row_count;
  if geraakt = 0 then
    raise exception 'Account niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('email', lower(trim(p_email)), 'active', false);
end;
$function$
;

revoke all on function "public"."binnenapp_trek_lid_in"(p_email text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_trek_lid_in"(p_email text) to authenticated;

grant execute on function "public"."binnenapp_trek_lid_in"(p_email text) to service_role;

CREATE OR REPLACE FUNCTION private.set_product_stock(p_product_id bigint, p_stock numeric, p_expected_stock numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

revoke all on function "private"."set_product_stock"(p_product_id bigint, p_stock numeric, p_expected_stock numeric) from public, anon, authenticated, service_role;

grant execute on function "private"."set_product_stock"(p_product_id bigint, p_stock numeric, p_expected_stock numeric) to authenticated;

CREATE OR REPLACE FUNCTION private.unregister_push_subscription(p_endpoint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  verwijderd integer := 0;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('unregister_push_subscription', 20, interval '1 hour');

  if trim(coalesce(p_endpoint, '')) !~ '^https://' or length(p_endpoint) > 2048 then
    raise exception 'Ongeldig meldingsadres.' using errcode = '22023';
  end if;

  delete from private.push_subscriptions
  where user_id = (select auth.uid())
    and endpoint = trim(p_endpoint);
  get diagnostics verwijderd = row_count;

  return jsonb_build_object('unregistered', verwijderd > 0);
end;
$function$
;

revoke all on function "private"."unregister_push_subscription"(p_endpoint text) from public, anon, authenticated, service_role;

grant execute on function "private"."unregister_push_subscription"(p_endpoint text) to authenticated;

CREATE OR REPLACE FUNCTION private.register_push_subscription(p_subscription jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  huidig_lid uuid := (select auth.uid());
  schoon_endpoint text := trim(coalesce(p_subscription ->> 'endpoint', ''));
  sleutel_p256dh text := trim(coalesce(p_subscription #>> '{keys,p256dh}', ''));
  sleutel_auth text := trim(coalesce(p_subscription #>> '{keys,auth}', ''));
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('register_push_subscription', 20, interval '1 hour');

  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'Ongeldig meldingsabonnement.' using errcode = '22023';
  end if;
  if schoon_endpoint !~ '^https://'
     or length(schoon_endpoint) < 30
     or length(schoon_endpoint) > 2048 then
    raise exception 'Ongeldig meldingsadres.' using errcode = '22023';
  end if;
  if length(sleutel_p256dh) < 40 or length(sleutel_p256dh) > 300
     or length(sleutel_auth) < 10 or length(sleutel_auth) > 100 then
    raise exception 'Ongeldige meldingssleutels.' using errcode = '22023';
  end if;

  insert into private.push_subscriptions(user_id, endpoint, p256dh, auth_key)
  values (huidig_lid, schoon_endpoint, sleutel_p256dh, sleutel_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        updated_at = now();

  return jsonb_build_object('registered', true);
end;
$function$
;

revoke all on function "private"."register_push_subscription"(p_subscription jsonb) from public, anon, authenticated, service_role;

grant execute on function "private"."register_push_subscription"(p_subscription jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_register_push_subscription(p_subscription jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.register_push_subscription(p_subscription)
$function$
;

revoke all on function "public"."binnenapp_register_push_subscription"(p_subscription jsonb) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_register_push_subscription"(p_subscription jsonb) to authenticated;

grant execute on function "public"."binnenapp_register_push_subscription"(p_subscription jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_unregister_push_subscription(p_endpoint text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.unregister_push_subscription(p_endpoint)
$function$
;

revoke all on function "public"."binnenapp_unregister_push_subscription"(p_endpoint text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_unregister_push_subscription"(p_endpoint text) to authenticated;

grant execute on function "public"."binnenapp_unregister_push_subscription"(p_endpoint text) to service_role;

CREATE OR REPLACE FUNCTION private.sync_cart(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted_count integer := 0;
  requested_count integer := 0;
  toegevoegde_regels jsonb := '[]'::jsonb;
  naam_actor text := 'Iemand';
  melding_body text;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('sync_cart', 300, interval '5 minutes');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('binnenapp_shared_cart'));

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 250 then
    raise exception 'Ongeldige winkelwagen.' using errcode = '22023';
  end if;

  select count(*)
  into requested_count
  from jsonb_array_elements(p_items) item
  where (item ->> 'product_id') ~ '^[0-9]+$'
    and (item ->> 'quantity') ~ '^[0-9]+$'
    and (item ->> 'quantity')::integer between 1 and 10000;

  if requested_count <> jsonb_array_length(p_items) then
    raise exception 'De winkelwagen bevat ongeldige regels.' using errcode = '22023';
  end if;

  with gevraagd as (
    select
      (item ->> 'product_id')::bigint as product_id,
      sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) item
    group by (item ->> 'product_id')::bigint
  ), verhogingen as (
    select
      p.id as product_id,
      p.description,
      coalesce(nullif(trim(p.unit), ''), 'st') as unit,
      p.jb_code,
      g.quantity - coalesce(c.quantity, 0) as quantity
    from gevraagd g
    join public.products p on p.id = g.product_id and p.available
    left join public.cart_items c on c.product_id = g.product_id
    where g.quantity > coalesce(c.quantity, 0)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', product_id,
        'description', description,
        'unit', unit,
        'jb_code', jb_code,
        'quantity', quantity
      ) order by description
    ),
    '[]'::jsonb
  )
  into toegevoegde_regels
  from verhogingen;

  delete from public.cart_items where product_id is not null;

  insert into public.cart_items(product_id, quantity, updated_at)
  select p.id, sum((item ->> 'quantity')::integer)::integer, now()
  from jsonb_array_elements(p_items) item
  join public.products p
    on p.id = (item ->> 'product_id')::bigint
   and p.available
  group by p.id;
  get diagnostics inserted_count = row_count;

  if inserted_count <> requested_count then
    raise exception 'Een of meer producten zijn niet beschikbaar.' using errcode = '22023';
  end if;

  if jsonb_array_length(toegevoegde_regels) > 0 then
    select coalesce(
      nullif(trim(display_name), ''),
      nullif(split_part(email, '@', 1), ''),
      'Iemand'
    )
    into naam_actor
    from private.app_members
    where user_id = (select auth.uid());

    naam_actor := coalesce(naam_actor, 'Iemand');
    if jsonb_array_length(toegevoegde_regels) = 1 then
      melding_body := format(
        '%s voegde %s × %s toe aan de winkelwagen.',
        naam_actor,
        toegevoegde_regels -> 0 ->> 'quantity',
        toegevoegde_regels -> 0 ->> 'description'
      );
    else
      melding_body := format(
        '%s voegde %s artikelen toe aan de winkelwagen.',
        naam_actor,
        jsonb_array_length(toegevoegde_regels)
      );
    end if;

    insert into private.push_events(event_type, actor_id, title, body, url)
    values (
      'cart_added',
      (select auth.uid()),
      'Winkelwagen bijgewerkt',
      melding_body,
      '/?tab=wagen'
    );
  end if;

  return jsonb_build_object('items', inserted_count);
end;
$function$
;

revoke all on function "private"."sync_cart"(p_items jsonb) from public, anon, authenticated, service_role;

grant execute on function "private"."sync_cart"(p_items jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.queue_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  naam_actor text;
begin
  perform private.assert_app_member();
  perform private.check_write_rate_limit('queue_order_push', 20, interval '1 hour');

  naam_actor := coalesce(
    nullif(trim(new.requester_name), ''),
    (
      select coalesce(nullif(trim(display_name), ''), nullif(split_part(email, '@', 1), ''))
      from private.app_members
      where user_id = (select auth.uid())
    ),
    'Iemand'
  );

  insert into private.push_events(event_type, actor_id, title, body, url)
  values (
    'order_placed',
    coalesce(new.created_by, (select auth.uid())),
    'Nieuwe bestelling',
    format('%s plaatste bestelling %s.', naam_actor, new.order_number),
    '/?tab=bestellingen'
  );

  return new;
end;
$function$
;

revoke all on function "private"."queue_order_push"() from public, anon, authenticated, service_role;

grant execute on function "private"."queue_order_push"() to authenticated;

grant execute on function "private"."queue_order_push"() to service_role;

CREATE OR REPLACE FUNCTION private.push_delivery(p_event_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resultaat jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id,
      'type', e.event_type,
      'title', e.title,
      'body', e.body,
      'url', e.url,
      'created_at', e.created_at
    ),
    'subscriptions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'endpoint', s.endpoint,
          'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth_key)
        )
      ) filter (where s.endpoint is not null and m.user_id is not null),
      '[]'::jsonb
    )
  )
  into resultaat
  from private.push_events e
  left join private.push_subscriptions s
    on true
  left join private.app_members m
    on m.user_id = s.user_id
   and m.active
  where e.id = p_event_id
  group by e.id, e.event_type, e.title, e.body, e.url, e.created_at;

  if resultaat is null then
    raise exception 'Meldingsgebeurtenis bestaat niet.' using errcode = '22023';
  end if;
  return resultaat;
end;
$function$
;

revoke all on function "private"."push_delivery"(p_event_id bigint) from public, anon, authenticated, service_role;

grant execute on function "private"."push_delivery"(p_event_id bigint) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_push_delivery(p_event_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.push_delivery(p_event_id)
$function$
;

revoke all on function "public"."binnenapp_push_delivery"(p_event_id bigint) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_push_delivery"(p_event_id bigint) to service_role;

CREATE OR REPLACE FUNCTION private.admin_products()
 RETURNS SETOF products
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_admin();

  return query
  select p.*
  from public.products p
  order by p.jb_code nulls last, p.id;
end;
$function$
;

revoke all on function "private"."admin_products"() from public, anon, authenticated, service_role;

grant execute on function "private"."admin_products"() to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_admin_products()
 RETURNS SETOF products
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.admin_products()
$function$
;

revoke all on function "public"."binnenapp_admin_products"() from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_admin_products"() to authenticated;

grant execute on function "public"."binnenapp_admin_products"() to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_save_product(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean)
 RETURNS products
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.save_product(
    p_product_id, p_expected_updated_at, p_ean_code, p_jb_code,
    p_description, p_category, p_unit, p_packaged_per, p_price_per_unit,
    p_stock, p_min_stock, p_product_image_url, p_source_image_url,
    p_rack, p_x_axis, p_y_axis, p_position, p_available
  )
$function$
;

revoke all on function "public"."binnenapp_save_product"(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_save_product"(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) to authenticated;

grant execute on function "public"."binnenapp_save_product"(p_product_id bigint, p_expected_updated_at timestamp with time zone, p_ean_code text, p_jb_code text, p_description text, p_category text, p_unit text, p_packaged_per numeric, p_price_per_unit numeric, p_stock numeric, p_min_stock numeric, p_product_image_url text, p_source_image_url text, p_rack text, p_x_axis text, p_y_axis text, p_position text, p_available boolean) to service_role;

CREATE OR REPLACE FUNCTION private.order_mail_beheer(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  oude_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  oude_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  bestelnummer text := btrim(coalesce(p_order_number, ''));
  bestelling_id uuid;
  registratie private.order_mail_status%rowtype;
  antwoord jsonb;
  nieuwe_ontvanger text;
  nieuwe_provider_id text;
  nieuwe_status text;
  nieuwe_fout text;
  opgegeven_poging uuid;
  ingevoegd integer := 0;
  tijdstip timestamptz := pg_catalog.clock_timestamp();
  mag_controleren boolean := false;
begin
  -- Deze controle gebeurt VOOR het koppelen van de gebruikerscontext.
  -- p_actor_id is uitsluitend afkomstig van de Edge Function, die de
  -- oorspronkelijke gebruikerssessie via Supabase Auth verifieert.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Alleen de maildienst mag verzendgegevens bijwerken.' using errcode = '42501';
  end if;
  if p_actor_id is null then
    raise exception 'De gebruiker voor deze mailactie ontbreekt.' using errcode = '22023';
  end if;

  -- auth.uid() ondersteunt beide claimvormen. Koppel ze allebei tijdelijk
  -- aan dezelfde geverifieerde actor en herstel ze ook bij een fout.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    (coalesce(nullif(oude_claims, ''), '{}')::jsonb || jsonb_build_object('sub', p_actor_id))::text,
    true
  );

  begin
    perform private.assert_app_member();
    perform private.check_write_rate_limit('order_mail_beheer', 600, interval '5 minutes');

    if bestelnummer !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
      raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
    end if;
    if p_soort is null or p_soort not in ('leverancier', 'bevestiging') then
      raise exception 'Ongeldige mailsoort.' using errcode = '22023';
    end if;
    if p_actie is null or p_actie not in ('begin', 'resultaat', 'controleer', 'gecontroleerd', 'controlefout') then
      raise exception 'Onbekende mailactie.' using errcode = '22023';
    end if;
    if p_gegevens is null or jsonb_typeof(p_gegevens) <> 'object'
       or pg_catalog.pg_column_size(p_gegevens) > 10000 then
      raise exception 'Ongeldige mailgegevens.' using errcode = '22023';
    end if;

    select o.id into bestelling_id
    from public.orders o
    where o.order_number = bestelnummer;

    if bestelling_id is null then
      raise exception 'Deze bestelling bestaat niet.' using errcode = '22023';
    end if;

    if p_actie = 'begin' then
      nieuwe_ontvanger := lower(btrim(coalesce(p_gegevens ->> 'ontvanger', '')));
      if length(nieuwe_ontvanger) > 320
         or nieuwe_ontvanger !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         or nieuwe_ontvanger ~ '[[:cntrl:]]' then
        raise exception 'Ongeldig mailadres voor deze bestelling.' using errcode = '22023';
      end if;

      -- Het unieke order/soort-paar is de duurzame verzendvergrendeling.
      -- Ook een onzekere of mislukte poging wordt nooit stilzwijgend herhaald.
      insert into private.order_mail_status (
        order_id, soort, actor_id, ontvanger, status, geprobeerd_op
      ) values (
        bestelling_id, p_soort, p_actor_id, nieuwe_ontvanger, 'bezig', tijdstip
      )
      on conflict (order_id, soort) do nothing;
      get diagnostics ingevoegd = row_count;
    end if;

    -- Vergrendel de registratie zodat parallelle controles en resultaten
    -- elkaar niet overschrijven. Een ontbrekende controle verzendt niets.
    select m.* into registratie
    from private.order_mail_status m
    where m.order_id = bestelling_id and m.soort = p_soort
    for update;

    if not found then
      if p_actie = 'controleer' then
        antwoord := jsonb_build_object(
          'order_number', bestelnummer, 'soort', p_soort,
          'status', 'onbekend', 'controleren', false
        );
      else
        raise exception 'Er is geen verzendpoging voor deze bestelling.' using errcode = '22023';
      end if;
    elsif p_actie = 'begin' then
      antwoord := to_jsonb(registratie) || jsonb_build_object(
        'order_number', bestelnummer, 'mag_versturen', ingevoegd = 1
      );
    elsif p_actie = 'resultaat' then
      begin
        opgegeven_poging := nullif(btrim(p_gegevens ->> 'poging_id'), '')::uuid;
      exception when invalid_text_representation then
        raise exception 'Ongeldig nummer van de verzendpoging.' using errcode = '22023';
      end;
      if opgegeven_poging is null or opgegeven_poging <> registratie.poging_id then
        raise exception 'Dit resultaat hoort niet bij de verzendpoging.' using errcode = '22023';
      end if;

      nieuwe_status := p_gegevens ->> 'status';
      nieuwe_provider_id := nullif(btrim(p_gegevens ->> 'provider_id'), '');
      nieuwe_fout := nullif(left(btrim(p_gegevens ->> 'fout'), 1200), '');
      if nieuwe_status is null or nieuwe_status not in ('verzonden', 'mislukt', 'onbekend') then
        raise exception 'Ongeldig verzendresultaat.' using errcode = '22023';
      end if;
      if nieuwe_provider_id is not null and nieuwe_provider_id !~ '^[A-Za-z0-9_-]{1,128}$' then
        raise exception 'Ongeldig providerkenmerk.' using errcode = '22023';
      end if;
      if nieuwe_status = 'verzonden' and nieuwe_provider_id is null then
        raise exception 'Een verzonden mail moet een providerkenmerk hebben.' using errcode = '22023';
      end if;

      -- Een nagekomen of herhaald antwoord mag een latere bezorgstatus niet
      -- terugzetten en mag evenmin een andere provider-id koppelen.
      if registratie.status = 'bezig' then
        update private.order_mail_status m
        set provider_id = nieuwe_provider_id,
            status = nieuwe_status,
            fout = case when nieuwe_status = 'verzonden' then null else nieuwe_fout end,
            gecontroleerd_op = case when nieuwe_status = 'onbekend' then null else tijdstip end,
            controle_fout = null
        where m.order_id = bestelling_id and m.soort = p_soort
        returning m.* into registratie;
      end if;
      antwoord := to_jsonb(registratie) || jsonb_build_object('order_number', bestelnummer);
    elsif p_actie = 'controleer' then
      mag_controleren := registratie.provider_id is not null
        and (registratie.controle_poging_op is null
          or registratie.controle_poging_op <= tijdstip - interval '30 seconds');
      if mag_controleren then
        update private.order_mail_status m
        set controle_poging_op = tijdstip
        where m.order_id = bestelling_id and m.soort = p_soort
        returning m.* into registratie;
      end if;
      antwoord := to_jsonb(registratie) || jsonb_build_object(
        'order_number', bestelnummer, 'controleren', mag_controleren
      );
    elsif p_actie in ('gecontroleerd', 'controlefout') then
      nieuwe_provider_id := nullif(btrim(p_gegevens ->> 'provider_id'), '');
      if nieuwe_provider_id is null
         or nieuwe_provider_id is distinct from registratie.provider_id then
        raise exception 'Deze controle hoort niet bij de verzonden mail.' using errcode = '22023';
      end if;
      nieuwe_fout := nullif(left(btrim(p_gegevens ->> 'fout'), 1200), '');

      if p_actie = 'controlefout' then
        -- Netwerk-, rechten- en providerstoringen zeggen niets over de
        -- bezorging. Behoud daarom de laatst bevestigde mailstatus en tijd.
        update private.order_mail_status m
        set controle_fout = coalesce(nieuwe_fout, 'De mailstatus kon niet worden gecontroleerd.')
        where m.order_id = bestelling_id and m.soort = p_soort
        returning m.* into registratie;
      else
        nieuwe_status := p_gegevens ->> 'status';
        if nieuwe_status is null
           or nieuwe_status not in ('verzonden', 'afgeleverd', 'vertraagd', 'mislukt', 'onbekend') then
          raise exception 'Ongeldige gecontroleerde mailstatus.' using errcode = '22023';
        end if;

        -- Een oude sent-melding kan een definitieve uitkomst niet wissen.
        -- Een latere afwijzing mag een eerdere aflevermelding wel vervangen.
        if registratie.status = 'mislukt' then
          nieuwe_status := registratie.status;
          nieuwe_fout := coalesce(registratie.fout, nieuwe_fout);
        elsif registratie.status = 'afgeleverd' and nieuwe_status <> 'mislukt' then
          nieuwe_status := registratie.status;
          nieuwe_fout := registratie.fout;
        elsif nieuwe_status = 'onbekend' then
          nieuwe_status := registratie.status;
          nieuwe_fout := registratie.fout;
        end if;

        update private.order_mail_status m
        set status = nieuwe_status,
            fout = case when nieuwe_status in ('mislukt', 'onbekend', 'vertraagd') then nieuwe_fout else null end,
            controle_fout = null,
            gecontroleerd_op = tijdstip
        where m.order_id = bestelling_id and m.soort = p_soort
        returning m.* into registratie;
      end if;
      antwoord := to_jsonb(registratie) || jsonb_build_object('order_number', bestelnummer);
    end if;
  exception when others then
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
    perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
    raise;
  end;

  -- Een gestopte Edge Function kan na het aanbieden van een mail geen
  -- resultaat meer opslaan. Presenteer zo'n oude reservering niet eeuwig
  -- als bezig, maar behoud de reservering om dubbel versturen te voorkomen.
  if antwoord ->> 'status' = 'bezig'
     and registratie.geprobeerd_op <= pg_catalog.clock_timestamp() - interval '2 minutes' then
    antwoord := antwoord || jsonb_build_object(
      'status', 'onbekend',
      'fout', 'Geen definitieve verzendbevestiging ontvangen; controleer de maildienst vóór opnieuw versturen.'
    );
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
  return antwoord;
end;
$function$
;

revoke all on function "private"."order_mail_beheer"(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb) from public, anon, authenticated, service_role;

grant execute on function "private"."order_mail_beheer"(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_order_mail_beheer(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.order_mail_beheer(p_actor_id, p_order_number, p_soort, p_actie, p_gegevens)
$function$
;

revoke all on function "public"."binnenapp_order_mail_beheer"(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_order_mail_beheer"(p_actor_id uuid, p_order_number text, p_soort text, p_actie text, p_gegevens jsonb) to service_role;

CREATE OR REPLACE FUNCTION private.order_mail_status(p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(order_number text, soort text, ontvanger text, status text, fout text, controle_fout text, geprobeerd_op timestamp with time zone, gecontroleerd_op timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_app_member();

  if p_order_number is not null and btrim(p_order_number) !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;

  return query
  select o.order_number, m.soort, m.ontvanger,
    case when m.status = 'bezig' and m.geprobeerd_op <= now() - interval '2 minutes'
      then 'onbekend' else m.status end,
    case when m.status = 'bezig' and m.geprobeerd_op <= now() - interval '2 minutes'
      then 'Geen definitieve verzendbevestiging ontvangen; controleer de maildienst vóór opnieuw versturen.'
      else m.fout end,
    m.controle_fout, m.geprobeerd_op, m.gecontroleerd_op
  from private.order_mail_status m
  join public.orders o on o.id = m.order_id
  where p_order_number is null or o.order_number = btrim(p_order_number)
  order by m.geprobeerd_op desc, m.soort;
end;
$function$
;

revoke all on function "private"."order_mail_status"(p_order_number text) from public, anon, authenticated, service_role;

grant execute on function "private"."order_mail_status"(p_order_number text) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_order_mail_status(p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(order_number text, soort text, ontvanger text, status text, fout text, controle_fout text, geprobeerd_op timestamp with time zone, gecontroleerd_op timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.order_mail_status(p_order_number)
$function$
;

revoke all on function "public"."binnenapp_order_mail_status"(p_order_number text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_order_mail_status"(p_order_number text) to authenticated;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_bron_geldig(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from private.order_pdf_kopie k
    join public.orders o on o.id = k.order_id
    join storage.objects s on s.id = k.object_id
    join storage.buckets b on b.id = s.bucket_id
    where k.id = p_id
      and o.order_number = k.order_number
      and o.confirmation_pdf_path = k.opslagpad
      and s.bucket_id = 'order-confirmations' and b.public = false
      and s.name = k.opslagpad and s.version = k.object_version
      and s.owner_id = k.actor_id::text
      and lower(btrim(s.metadata ->> 'mimetype')) = 'application/pdf'
      and case when (s.metadata ->> 'size') ~ '^[0-9]{1,8}$'
        then (s.metadata ->> 'size')::bigint between 1 and 10485760
        else false end
  )
$function$
;

revoke all on function "private"."order_pdf_kopie_bron_geldig"(p_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_werk(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid DEFAULT NULL::uuid, p_resultaat text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  oude_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  oude_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  registratie private.order_pdf_kopie%rowtype;
  antwoord jsonb;
  tijdstip timestamptz := pg_catalog.clock_timestamp();
begin
  -- Cruciaal: eerst serverrol controleren, pas daarna de vertrouwde actor binden.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Alleen de kopieerdienst mag deze taak verwerken.' using errcode = '42501';
  end if;
  if p_id is null or p_token is null then
    raise exception 'Ongeldige kopieertaak.' using errcode = '42501';
  end if;
  if p_actie is null or p_actie not in ('claim', 'verzenden', 'resultaat', 'voorbereidingsfout') then
    raise exception 'Onbekende kopieeractie.' using errcode = '22023';
  end if;

  select k.* into registratie
  from private.order_pdf_kopie k
  where k.id = p_id and k.token = p_token
  for update;
  if not found then
    raise exception 'Ongeldige kopieertaak.' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', registratie.actor_id::text, true);
  perform pg_catalog.set_config('request.jwt.claims',
    (coalesce(nullif(oude_claims, ''), '{}')::jsonb
      || jsonb_build_object('sub', registratie.actor_id))::text, true);

  begin
    perform private.assert_app_member();
    -- Een herhaalde startmelding voor een al geclaimde/afgeronde taak mag
    -- geen schrijfquotum verbruiken. Server, token en actief lid zijn hierboven
    -- wel gecontroleerd. Herstel ook op dit vroege pad beide claimvormen.
    if p_actie = 'claim' and (
      registratie.status <> 'wachtend' or registratie.beschikbaar_op > tijdstip
      or registratie.pogingen >= 3 or registratie.verzonden_op is not null
    ) then
      perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
      perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
      return jsonb_build_object('mag_voorbereiden', false, 'status', registratie.status);
    end if;
    perform private.check_write_rate_limit('order_pdf_kopie_werk', 600, interval '5 minutes');

    if p_actie = 'claim' then
      antwoord := jsonb_build_object('mag_voorbereiden', false, 'status', registratie.status);
      if registratie.status = 'wachtend' and registratie.beschikbaar_op <= tijdstip
         and registratie.pogingen < 3 and registratie.verzonden_op is null then
        if not private.order_pdf_kopie_bron_geldig(registratie.id) then
          update private.order_pdf_kopie k
          set status = 'mislukt', fout_code = 'bron_gewijzigd',
              gewijzigd_op = tijdstip, afgerond_op = tijdstip
          where k.id = registratie.id;
          antwoord := jsonb_build_object('mag_voorbereiden', false, 'status', 'mislukt');
        else
          update private.order_pdf_kopie k
          set status = 'voorbereiden', poging_id = pg_catalog.gen_random_uuid(),
              pogingen = k.pogingen + 1, voorbereid_op = tijdstip,
              gewijzigd_op = tijdstip, fout_code = null
          where k.id = registratie.id
          returning k.* into registratie;
          antwoord := jsonb_build_object(
            'mag_voorbereiden', true, 'id', registratie.id,
            'poging_id', registratie.poging_id, 'order_number', registratie.order_number,
            'opslagpad', registratie.opslagpad, 'object_id', registratie.object_id,
            'object_version', registratie.object_version, 'bestandsnaam', registratie.bestandsnaam
          );
        end if;
      end if;
    elsif p_actie = 'verzenden' then
      -- Alleen een NIEUWE overgang verleent toestemming voor precies één POST.
      -- Een herhaling of onzekere eerdere RPC-respons geeft dus nooit opnieuw true.
      antwoord := jsonb_build_object('mag_verzenden', false, 'status', registratie.status);
      if p_poging_id is not null and p_poging_id = registratie.poging_id
         and registratie.status = 'voorbereiden' and registratie.verzonden_op is null
         and registratie.voorbereid_op > tijdstip - interval '5 minutes' then
        if not private.order_pdf_kopie_bron_geldig(registratie.id) then
          update private.order_pdf_kopie k
          set status = 'mislukt', fout_code = 'bron_gewijzigd',
              gewijzigd_op = tijdstip, afgerond_op = tijdstip
          where k.id = registratie.id;
          antwoord := jsonb_build_object('mag_verzenden', false, 'status', 'mislukt');
        else
          update private.order_pdf_kopie k
          set status = 'verzenden', verzonden_op = tijdstip, gewijzigd_op = tijdstip
          where k.id = registratie.id;
          antwoord := jsonb_build_object('mag_verzenden', true, 'id', registratie.id,
            'poging_id', registratie.poging_id, 'status', 'verzenden');
        end if;
      end if;
    elsif p_actie = 'voorbereidingsfout' then
      if p_resultaat is null or p_resultaat not in (
        'configuratie_ongeldig', 'bronpad_ongeldig', 'bron_niet_beschikbaar',
        'pdf_ongeldig', 'voorbereiding_mislukt'
      ) then
        raise exception 'Ongeldige voorbereidingsuitkomst.' using errcode = '22023';
      end if;
      if p_poging_id is not null and p_poging_id = registratie.poging_id
         and registratie.status = 'voorbereiden' and registratie.verzonden_op is null then
        update private.order_pdf_kopie k
        set status = case when k.pogingen < 3 then 'wachtend' else 'mislukt' end,
            poging_id = null, voorbereid_op = null, gewijzigd_op = tijdstip,
            beschikbaar_op = tijdstip + case when k.pogingen = 1
              then interval '1 minute' else interval '5 minutes' end,
            afgerond_op = case when k.pogingen >= 3 then tijdstip else null end,
            fout_code = p_resultaat
        where k.id = registratie.id
        returning k.* into registratie;
      end if;
      antwoord := jsonb_build_object('status', registratie.status, 'pogingen', registratie.pogingen);
    else
      if p_resultaat is null or p_resultaat not in ('opgeslagen', 'mislukt', 'onbekend') then
        raise exception 'Ongeldige kopieeruitkomst.' using errcode = '22023';
      end if;
      -- Een late bevestiging mag de onzekerheid oplossen, maar nooit een
      -- bewezen succes terugzetten. Geen uitkomst opent de verzendpoort opnieuw.
      if p_poging_id is not null and p_poging_id = registratie.poging_id
         and registratie.status in ('verzenden', 'onbekend')
         and registratie.verzonden_op is not null then
        update private.order_pdf_kopie k
        set status = p_resultaat, gewijzigd_op = tijdstip, afgerond_op = tijdstip,
            fout_code = case p_resultaat when 'opgeslagen' then null
              when 'mislukt' then 'verzending_mislukt' else 'verzending_onzeker' end
        where k.id = registratie.id
        returning k.* into registratie;
      end if;
      antwoord := jsonb_build_object('status', registratie.status);
    end if;
  exception when others then
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
    perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
  return antwoord;
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_werk"(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid, p_resultaat text) from public, anon, authenticated, service_role;

grant execute on function "private"."order_pdf_kopie_werk"(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid, p_resultaat text) to service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_naam_geldig(p_naam text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delen text[];
  witte_ruimte constant text := U&'[ \00A0\1680\2000-\200A\2028\2029\202F\205F\3000]';
begin
  if p_naam is null or pg_catalog.octet_length(p_naam) not between 1 and 255
     or p_naam ~ E'[/\\\\"*:<>?|%#]'
     or p_naam ~ U&'[\0001-\001F\007F-\009F\200B-\200F\202A-\202E\2060-\206F\FEFF]'
     or pg_catalog.strpos(p_naam, '..') > 0
     or pg_catalog.strpos(pg_catalog.lower(p_naam), '_vti_') > 0
     or p_naam ~ ('^' || witte_ruimte || '|' || witte_ruimte || '$')
     or p_naam ~ ('(' || witte_ruimte || '|[.])\.pdf$') then
    return false;
  end if;
  if p_naam ~ '^BinnenApp-ORD-[A-Za-z0-9-]+\.pdf$' then return true; end if;
  delen := pg_catalog.regexp_match(p_naam, '^leys - [0-9]{6} - order (.+) - (.+)\.pdf$');
  return delen is not null
    and pg_catalog.regexp_replace(delen[1], witte_ruimte, '', 'g') <> ''
    and pg_catalog.regexp_replace(delen[2], witte_ruimte, '', 'g') <> '';
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_naam_geldig"(p_naam text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_order_pdf_kopie_werk(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid DEFAULT NULL::uuid, p_resultaat text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.order_pdf_kopie_werk(p_id, p_token, p_actie, p_poging_id, p_resultaat)
$function$
;

revoke all on function "public"."binnenapp_order_pdf_kopie_werk"(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid, p_resultaat text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_order_pdf_kopie_werk"(p_id uuid, p_token uuid, p_actie text, p_poging_id uuid, p_resultaat text) to service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_bestandsnaam(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bestelling record;
  leys_nummer text;
  categorieen text;
  resultaat text;
begin
  select o.created_at, o.leys_order_number into bestelling
  from public.orders o where o.id = p_order_id;
  if not found or bestelling.created_at is null then
    raise exception 'De besteldatum voor de PDF-bestandsnaam ontbreekt.' using errcode = '22023';
  end if;
  leys_nummer := coalesce(nullif(private.order_pdf_kopie_naamdeel(bestelling.leys_order_number), ''), 'onbekend');

  -- order_items.category is de historische snapshot, niet de actuele catalogus.
  -- Eerste regel-ID bepaalt zowel eerste spelling als categorievolgorde.
  with eerste_categorieen as (
    select distinct on (pg_catalog.lower(pg_catalog.btrim(i.category)))
      i.id, i.category
    from public.order_items i
    where i.order_id = p_order_id and pg_catalog.btrim(coalesce(i.category, '')) <> ''
    order by pg_catalog.lower(pg_catalog.btrim(i.category)), i.id
  )
  select pg_catalog.string_agg(
    coalesce(nullif(private.order_pdf_kopie_naamdeel(c.category), ''), 'Zonder categorie'),
    ', ' order by c.id
  ) into categorieen
  from eerste_categorieen c;

  resultaat := 'leys - '
    || pg_catalog.to_char(pg_catalog.timezone('Europe/Amsterdam', bestelling.created_at), 'YYMMDD')
    || ' - order ' || leys_nummer || ' - ' || coalesce(categorieen, 'Zonder categorie') || '.pdf';
  if pg_catalog.octet_length(resultaat) > 255 then
    raise exception 'De PDF-bestandsnaam met alle categorieën is te lang (maximaal 255 UTF-8-bytes). De bestaande koppeling blijft ongewijzigd.'
      using errcode = '22023';
  end if;
  if not private.order_pdf_kopie_naam_geldig(resultaat) then
    raise exception 'De PDF-bestandsnaam kon niet veilig worden samengesteld.' using errcode = '22023';
  end if;
  return resultaat;
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_bestandsnaam"(p_order_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_dispatch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  oude_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  oude_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  kandidaat record;
  registratie private.order_pdf_kopie%rowtype;
  tijdstip timestamptz;
  aanvraag_id bigint;
  gestart integer := 0;
begin
  for kandidaat in
    select k.id from private.order_pdf_kopie k
    join private.app_members m on m.user_id = k.actor_id and m.active
    where (k.status = 'wachtend' and k.beschikbaar_op <= pg_catalog.clock_timestamp()
        and (k.laatste_dispatch_op is null or k.laatste_dispatch_op <= pg_catalog.clock_timestamp() - interval '50 seconds'))
       or (k.status = 'voorbereiden' and k.voorbereid_op <= pg_catalog.clock_timestamp() - interval '5 minutes')
       or (k.status = 'verzenden' and k.verzonden_op <= pg_catalog.clock_timestamp() - interval '5 minutes')
    order by k.aangemaakt_op
    limit 50
  loop
    begin
      select k.* into registratie from private.order_pdf_kopie k
      where k.id = kandidaat.id for update skip locked;
      if not found then continue; end if;
      tijdstip := pg_catalog.clock_timestamp();
      perform pg_catalog.set_config('request.jwt.claim.sub', registratie.actor_id::text, true);
      perform pg_catalog.set_config('request.jwt.claims',
        (coalesce(nullif(oude_claims, ''), '{}')::jsonb
          || jsonb_build_object('sub', registratie.actor_id))::text, true);
      perform private.assert_app_member();
      perform private.check_write_rate_limit('order_pdf_kopie_dispatch', 600, interval '5 minutes');

      if registratie.status = 'voorbereiden'
         and registratie.voorbereid_op <= tijdstip - interval '5 minutes'
         and registratie.verzonden_op is null then
        -- Alleen voorbereiding is herhaalbaar. De vorige poging wordt ongeldig.
        update private.order_pdf_kopie k
        set status = case when k.pogingen < 3 then 'wachtend' else 'mislukt' end,
            poging_id = null, voorbereid_op = null, beschikbaar_op = tijdstip,
            gewijzigd_op = tijdstip, fout_code = 'voorbereiding_verlopen',
            afgerond_op = case when k.pogingen >= 3 then tijdstip else null end
        where k.id = registratie.id returning k.* into registratie;
      elsif registratie.status = 'verzenden'
         and registratie.verzonden_op <= tijdstip - interval '5 minutes' then
        -- Het bestand kan aangekomen zijn. Nooit nog een externe poging toestaan.
        update private.order_pdf_kopie k
        set status = 'onbekend', gewijzigd_op = tijdstip, afgerond_op = tijdstip,
            fout_code = 'verzending_onzeker'
        where k.id = registratie.id returning k.* into registratie;
      end if;

      if registratie.status = 'wachtend' and registratie.beschikbaar_op <= tijdstip
         and registratie.pogingen < 3 and registratie.verzonden_op is null
         and (registratie.laatste_dispatch_op is null
           or registratie.laatste_dispatch_op <= tijdstip - interval '50 seconds') then
        select net.http_post(
          url := 'https://guurncfxhcxwvgnzoeyp.supabase.co/functions/v1/copy-order-confirmation',
          body := jsonb_build_object('id', registratie.id, 'token', registratie.token),
          headers := jsonb_build_object('Content-Type', 'application/json',
            'Authorization', 'Bearer ' || private.order_pdf_kopie_gateway_sleutel()),
          timeout_milliseconds := 120000
        ) into aanvraag_id;
        update private.order_pdf_kopie k
        set laatste_dispatch_op = tijdstip, dispatch_pogingen = k.dispatch_pogingen + 1,
            net_request_id = aanvraag_id, gewijzigd_op = tijdstip
        where k.id = registratie.id;
        gestart := gestart + 1;
      end if;
      perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
      perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
    exception when others then
      -- Een storing of ingetrokken lidmaatschap laat de registratie intact.
      -- Geen fouttekst loggen: infrastructuurfouten kunnen geheime gegevens bevatten.
      perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(oude_sub, ''), true);
      perform pg_catalog.set_config('request.jwt.claims', coalesce(oude_claims, ''), true);
    end;
  end loop;
  return gestart;
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_dispatch"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_status(p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(order_number text, bestandsnaam text, status text, fout_code text, aangemaakt_op timestamp with time zone, gewijzigd_op timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_app_member();
  if p_order_number is not null and p_order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldig bestelnummer.' using errcode = '22023';
  end if;
  return query
  select k.order_number, k.bestandsnaam,
    case when k.status in ('voorbereiden', 'verzenden')
      and coalesce(k.verzonden_op, k.voorbereid_op) <= now() - interval '5 minutes'
      then 'onbekend' else k.status end,
    case when k.status = 'verzenden' and k.verzonden_op <= now() - interval '5 minutes'
      then 'verzending_onzeker' else k.fout_code end,
    k.aangemaakt_op, k.gewijzigd_op
  from private.order_pdf_kopie k
  where p_order_number is null or k.order_number = p_order_number
  order by k.aangemaakt_op desc;
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_status"(p_order_number text) from public, anon, authenticated, service_role;

grant execute on function "private"."order_pdf_kopie_status"(p_order_number text) to authenticated;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  opslag storage.objects%rowtype;
  nieuw_id uuid := pg_catalog.gen_random_uuid();
  nieuw_pad text := coalesce(new.confirmation_pdf_path, '');
  bestelde_prefix text;
  nieuwe_bestandsnaam text;
begin
  -- Een metadatawijziging zonder nieuw bestand start niets; er is geen backfill.
  if new.confirmation_pdf_path is not distinct from old.confirmation_pdf_path
     or nieuw_pad = '' then return new; end if;

  perform private.assert_app_member();
  perform private.check_write_rate_limit('order_pdf_kopie_enqueue', 60, interval '1 hour');
  if actor is null or new.order_number !~ '^#ORD-[A-Za-z0-9-]{6,40}$' then
    raise exception 'Ongeldige bestelling voor de PDF-kopie.' using errcode = '22023';
  end if;
  bestelde_prefix := pg_catalog.regexp_replace(new.order_number, '[^a-zA-Z0-9_-]', '_', 'g');
  if length(nieuw_pad) > 400 or nieuw_pad <> btrim(nieuw_pad)
     or pg_catalog.array_length(pg_catalog.string_to_array(nieuw_pad, '/'), 1) <> 2
     or pg_catalog.split_part(nieuw_pad, '/', 1) <> bestelde_prefix
     or length(pg_catalog.split_part(nieuw_pad, '/', 2)) > 220
     or pg_catalog.split_part(nieuw_pad, '/', 2) !~* '^[A-Za-z0-9_.-]+\.pdf$' then
    raise exception 'Ongeldig opslagpad voor de PDF-kopie.' using errcode = '22023';
  end if;

  select s.* into opslag from storage.objects s
  join storage.buckets b on b.id = s.bucket_id
  where s.bucket_id = 'order-confirmations' and s.name = nieuw_pad
    and b.public = false and s.owner_id = actor::text
    and length(s.version) between 1 and 200
    and lower(btrim(s.metadata ->> 'mimetype')) = 'application/pdf'
    and case when (s.metadata ->> 'size') ~ '^[0-9]{1,8}$'
      then (s.metadata ->> 'size')::bigint between 1 and 10485760
      else false end;
  if not found then
    raise exception 'De PDF-bron is niet geldig of hoort niet bij deze gebruiker.' using errcode = '22023';
  end if;

  -- Dezelfde eerder geregistreerde upload nooit opnieuw benoemen of versturen.
  -- Toegang en geldigheid van de bron zijn hierboven wel gecontroleerd.
  if exists (
    select 1 from private.order_pdf_kopie k
    where k.order_id = new.id and k.object_id = opslag.id
  ) then return new; end if;

  nieuwe_bestandsnaam := private.order_pdf_kopie_bestandsnaam(new.id);
  -- Alleen de gewenste leesbare naam bewaren. Power Automate vergelijkt
  -- deze met de echte doelmap en kiest daar zo nodig (2), (3), enzovoort.

  insert into private.order_pdf_kopie (
    id, order_id, actor_id, order_number, opslagpad, object_id, object_version, bestandsnaam
  ) values (
    nieuw_id, new.id, actor, new.order_number, nieuw_pad, opslag.id, opslag.version,
    nieuwe_bestandsnaam
  ) on conflict (order_id, object_id) do nothing;

  -- De dispatcher vangt tijdelijke fouten op; de wachtrij is de bron van waarheid.
  perform private.order_pdf_kopie_dispatch();
  return new;
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_enqueue"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.binnenapp_order_pdf_kopie_status(p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(order_number text, bestandsnaam text, status text, fout_code text, aangemaakt_op timestamp with time zone, gewijzigd_op timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.order_pdf_kopie_status(p_order_number)
$function$
;

revoke all on function "public"."binnenapp_order_pdf_kopie_status"(p_order_number text) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_order_pdf_kopie_status"(p_order_number text) to authenticated;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_gateway_sleutel()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  publieke_sleutel constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dXJuY2Z4aGN4d3ZnbnpvZXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjg0NjMsImV4cCI6MjEwNTc0NDQ2M30.ctWvDlrzfAEAw2nDREY7fV7tbfxvStsNj63tMxbnnGA';
  delen text[];
  kop jsonb;
  inhoud jsonb;
  vervalt bigint;
begin
  -- Alleen configuratie lezen. Dit decodeert de publieke claimgegevens;
  -- de ingeschakelde Supabase-gateway controleert de echte handtekening.
  if length(publieke_sleutel) not between 100 and 4096
     or publieke_sleutel !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$' then
    raise exception 'De publieke gatewayconfiguratie ontbreekt of is ongeldig.' using errcode = '22023';
  end if;
  delen := pg_catalog.string_to_array(publieke_sleutel, '.');
  kop := pg_catalog.convert_from(pg_catalog.decode(
    pg_catalog.translate(delen[1], '-_', '+/')
      || pg_catalog.repeat('=', (4 - length(delen[1]) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  inhoud := pg_catalog.convert_from(pg_catalog.decode(
    pg_catalog.translate(delen[2], '-_', '+/')
      || pg_catalog.repeat('=', (4 - length(delen[2]) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  if (kop ->> 'alg') is distinct from 'HS256'
     or (kop ->> 'typ') is distinct from 'JWT'
     or (inhoud ->> 'role') is distinct from 'anon'
     or (inhoud ->> 'ref') is distinct from 'guurncfxhcxwvgnzoeyp'
     or (inhoud ->> 'iss') is distinct from 'supabase'
     or coalesce(inhoud ->> 'exp', '') !~ '^[0-9]{1,12}$' then
    raise exception 'De publieke gatewayconfiguratie ontbreekt of is ongeldig.' using errcode = '22023';
  end if;
  vervalt := (inhoud ->> 'exp')::bigint;
  if vervalt <= extract(epoch from pg_catalog.clock_timestamp()) then
    raise exception 'De publieke gatewayconfiguratie ontbreekt of is ongeldig.' using errcode = '22023';
  end if;
  return publieke_sleutel;
exception when others then
  -- Nooit ingevoerde waarden of interne decoderingsfouten teruggeven.
  raise exception 'De publieke gatewayconfiguratie ontbreekt of is ongeldig.' using errcode = '22023';
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_gateway_sleutel"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.order_pdf_kopie_naamdeel(p_tekst text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resultaat text := coalesce(p_tekst, '');
begin
  resultaat := pg_catalog.regexp_replace(resultaat, E'[/\\\\"*:<>?|%#]', '-', 'g');
  resultaat := pg_catalog.regexp_replace(resultaat,
    U&'[\0001-\001F\007F-\009F\200B-\200F\202A-\202E\2060-\206F\FEFF]', '-', 'g');
  resultaat := pg_catalog.regexp_replace(resultaat, '\.{2,}', '-', 'g');
  resultaat := pg_catalog.regexp_replace(resultaat, '_vti_', '-', 'gi');
  resultaat := pg_catalog.regexp_replace(resultaat,
    U&'[ \00A0\1680\2000-\200A\2028\2029\202F\205F\3000]+', ' ', 'g');
  return pg_catalog.btrim(resultaat, ' .-');
end;
$function$
;

revoke all on function "private"."order_pdf_kopie_naamdeel"(p_tekst text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.update_expected_delivery_date(p_order_number text, p_date date, p_expected_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

revoke all on function "private"."update_expected_delivery_date"(p_order_number text, p_date date, p_expected_date date) from public, anon, authenticated, service_role;

grant execute on function "private"."update_expected_delivery_date"(p_order_number text, p_date date, p_expected_date date) to authenticated;

CREATE OR REPLACE FUNCTION public.binnenapp_update_expected_delivery_date(p_order_number text, p_date date, p_expected_date date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_expected_delivery_date(p_order_number, p_date, p_expected_date)
$function$
;

revoke all on function "public"."binnenapp_update_expected_delivery_date"(p_order_number text, p_date date, p_expected_date date) from public, anon, authenticated, service_role;

grant execute on function "public"."binnenapp_update_expected_delivery_date"(p_order_number text, p_date date, p_expected_date date) to authenticated;

grant execute on function "public"."binnenapp_update_expected_delivery_date"(p_order_number text, p_date date, p_expected_date date) to service_role;

alter table "private"."order_mail_status" alter column "poging_id" set default gen_random_uuid();

alter table "private"."order_mail_status" alter column "status" set default 'bezig'::text;

alter table "private"."order_mail_status" alter column "geprobeerd_op" set default now();

alter table "private"."order_pdf_kopie" alter column "id" set default gen_random_uuid();

alter table "private"."order_pdf_kopie" alter column "token" set default gen_random_uuid();

alter table "private"."order_pdf_kopie" alter column "status" set default 'wachtend'::text;

alter table "private"."order_pdf_kopie" alter column "pogingen" set default 0;

alter table "private"."order_pdf_kopie" alter column "aangemaakt_op" set default clock_timestamp();

alter table "private"."order_pdf_kopie" alter column "gewijzigd_op" set default clock_timestamp();

alter table "private"."order_pdf_kopie" alter column "beschikbaar_op" set default clock_timestamp();

alter table "private"."order_pdf_kopie" alter column "dispatch_pogingen" set default 0;

alter table "public"."orders" alter column "id" set default gen_random_uuid();

alter table "public"."orders" alter column "created_at" set default now();

alter table "public"."orders" alter column "team" set default 'Binnenploeg'::text;

alter table "public"."orders" alter column "status" set default 'Bestelling geplaatst'::text;

alter table "public"."orders" alter column "requester_name" set default ''::text;

alter table "public"."orders" alter column "requester_email" set default ''::text;

alter table "public"."orders" alter column "confirmation_in_map" set default false;

alter table "public"."orders" alter column "source" set default 'BinnenApp'::text;

alter table "private"."app_members" alter column "role" set default 'member'::text;

alter table "private"."app_members" alter column "active" set default false;

alter table "private"."app_members" alter column "created_at" set default now();

alter table "private"."api_write_log" alter column "requested_at" set default now();

alter table "public"."products" alter column "category" set default 'Overig'::text;

alter table "public"."products" alter column "unit" set default 'st'::text;

alter table "public"."products" alter column "packaged_per" set default 1;

alter table "public"."products" alter column "price_per_unit" set default 0;

alter table "public"."products" alter column "stock" set default 0;

alter table "public"."products" alter column "min_stock" set default 0;

alter table "public"."products" alter column "available" set default true;

alter table "public"."products" alter column "created_at" set default now();

alter table "public"."products" alter column "updated_at" set default now();

alter table "public"."cart_items" alter column "updated_at" set default now();

alter table "public"."order_items" alter column "unit" set default 'st'::text;

alter table "public"."order_items" alter column "packaged_per" set default 1;

alter table "public"."order_items" alter column "price_per_unit" set default 0;

alter table "public"."order_items" alter column "status" set default 'Bestelling geplaatst'::text;

alter table "public"."order_items" alter column "created_at" set default now();

alter table "public"."retour_items" alter column "id" set default gen_random_uuid();

alter table "public"."retour_items" alter column "quantity" set default 1;

alter table "public"."retour_items" alter column "created_at" set default now();

alter table "public"."retour_items" alter column "updated_at" set default now();

alter table "private"."cart_mail_queue" alter column "created_at" set default now();

alter table "public"."order_corrections" alter column "id" set default gen_random_uuid();

alter table "public"."order_corrections" alter column "resolved" set default false;

alter table "public"."order_corrections" alter column "created_at" set default now();

alter table "private"."cleanup_log" alter column "uitgevoerd_op" set default now();

alter table "private"."cleanup_log" alter column "aantal" set default 0;

alter table "public"."order_status_dates" alter column "updated_at" set default now();

alter table "private"."push_subscriptions" alter column "created_at" set default now();

alter table "private"."push_subscriptions" alter column "updated_at" set default now();

alter table "private"."push_events" alter column "created_at" set default now();

alter table "private"."order_mail_status" add constraint "order_mail_status_controle_fout_check" CHECK (controle_fout IS NULL OR length(controle_fout) <= 1200);

alter table "private"."order_mail_status" add constraint "order_mail_status_fout_check" CHECK (fout IS NULL OR length(fout) <= 1200);

alter table "private"."order_mail_status" add constraint "order_mail_status_ontvanger_check" CHECK (length(ontvanger) >= 3 AND length(ontvanger) <= 320);

alter table "private"."order_mail_status" add constraint "order_mail_status_pkey" PRIMARY KEY (order_id, soort);

alter table "private"."order_mail_status" add constraint "order_mail_status_poging_id_key" UNIQUE (poging_id);

alter table "private"."order_mail_status" add constraint "order_mail_status_provider_id_check" CHECK (provider_id IS NULL OR length(provider_id) >= 1 AND length(provider_id) <= 128);

alter table "private"."order_mail_status" add constraint "order_mail_status_soort_check" CHECK (soort = ANY (ARRAY['leverancier'::text, 'bevestiging'::text]));

alter table "private"."order_mail_status" add constraint "order_mail_status_status_check" CHECK (status = ANY (ARRAY['bezig'::text, 'verzonden'::text, 'afgeleverd'::text, 'vertraagd'::text, 'mislukt'::text, 'onbekend'::text]));

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_bestandsnaam_check" CHECK (private.order_pdf_kopie_naam_geldig(bestandsnaam));

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_check" CHECK ((status <> ALL (ARRAY['voorbereiden'::text, 'verzenden'::text])) OR poging_id IS NOT NULL);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_check1" CHECK (status <> 'voorbereiden'::text OR voorbereid_op IS NOT NULL);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_check2" CHECK ((status <> ALL (ARRAY['verzenden'::text, 'opgeslagen'::text, 'onbekend'::text])) OR verzonden_op IS NOT NULL);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_dispatch_pogingen_check" CHECK (dispatch_pogingen >= 0);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_fout_code_check" CHECK (fout_code = ANY (ARRAY['configuratie_ongeldig'::text, 'bronpad_ongeldig'::text, 'bron_niet_beschikbaar'::text, 'pdf_ongeldig'::text, 'voorbereiding_mislukt'::text, 'bron_gewijzigd'::text, 'voorbereiding_verlopen'::text, 'verzending_onzeker'::text, 'verzending_mislukt'::text]));

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_object_version_check" CHECK (length(object_version) >= 1 AND length(object_version) <= 200);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_opslagpad_check" CHECK (length(opslagpad) >= 8 AND length(opslagpad) <= 400);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_order_id_object_id_key" UNIQUE (order_id, object_id);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_order_number_check" CHECK (order_number ~ '^#ORD-[A-Za-z0-9-]{6,40}$'::text);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_pkey" PRIMARY KEY (id);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_pogingen_check" CHECK (pogingen >= 0 AND pogingen <= 3);

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_status_check" CHECK (status = ANY (ARRAY['wachtend'::text, 'voorbereiden'::text, 'verzenden'::text, 'opgeslagen'::text, 'mislukt'::text, 'onbekend'::text]));

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_token_key" UNIQUE (token);

alter table "public"."orders" add constraint "orders_expected_delivery_date_bereik" CHECK (expected_delivery_date IS NULL OR isfinite(expected_delivery_date) AND expected_delivery_date >= '2020-01-01'::date AND expected_delivery_date <= '2100-12-31'::date);

alter table "public"."orders" add constraint "orders_order_number_key" UNIQUE (order_number);

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY (id);

alter table "public"."orders" add constraint "orders_status_check" CHECK (status = ANY (ARRAY['Bestelling geplaatst'::text, 'Mail Verstuurd'::text, 'Orderbevestiging gekregen'::text, 'Factuur gekregen'::text, 'Geleverd'::text, 'In magazijn'::text]));

alter table "private"."app_members" add constraint "app_members_pkey" PRIMARY KEY (user_id);

alter table "private"."app_members" add constraint "app_members_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'member'::text]));

alter table "private"."api_write_log" add constraint "api_write_log_pkey" PRIMARY KEY (id);

alter table "public"."products" add constraint "products_ean_code_key" UNIQUE (ean_code);

alter table "public"."products" add constraint "products_packaged_per_check" CHECK (packaged_per > 0::numeric);

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY (id);

alter table "public"."products" add constraint "products_price_per_unit_check" CHECK (price_per_unit >= 0::numeric);

alter table "public"."cart_items" add constraint "cart_items_pkey" PRIMARY KEY (product_id);

alter table "public"."cart_items" add constraint "cart_items_quantity_check" CHECK (quantity > 0 AND quantity <= 10000);

alter table "public"."order_items" add constraint "order_items_pkey" PRIMARY KEY (id);

alter table "public"."order_items" add constraint "order_items_quantity_check" CHECK (quantity > 0 AND quantity <= 10000);

alter table "public"."order_items" add constraint "order_items_source_line_id_key" UNIQUE (source_line_id);

alter table "public"."order_items" add constraint "order_items_status_check" CHECK (status = ANY (ARRAY['Bestelling geplaatst'::text, 'Mail Verstuurd'::text, 'Orderbevestiging gekregen'::text, 'Factuur gekregen'::text, 'Geleverd'::text, 'In magazijn'::text]));

alter table "public"."retour_items" add constraint "retour_items_pkey" PRIMARY KEY (id);

alter table "public"."retour_items" add constraint "retour_items_quantity_check" CHECK (quantity >= 1 AND quantity <= 10000);

alter table "private"."cart_mail_queue" add constraint "cart_mail_queue_item_count_check" CHECK (item_count > 0);

alter table "private"."cart_mail_queue" add constraint "cart_mail_queue_items_array" CHECK (jsonb_typeof(items) = 'array'::text);

alter table "private"."cart_mail_queue" add constraint "cart_mail_queue_pkey" PRIMARY KEY (id);

alter table "private"."cart_mail_queue" add constraint "cart_mail_queue_total_amount_check" CHECK (total_amount >= 0::numeric);

alter table "private"."cart_mail_queue" add constraint "cart_mail_queue_total_quantity_check" CHECK (total_quantity > 0);

alter table "public"."order_corrections" add constraint "order_corrections_correct_quantity_check" CHECK (correct_quantity >= 0 AND correct_quantity <= 10000);

alter table "public"."order_corrections" add constraint "order_corrections_correction_type_check" CHECK (correction_type = ANY (ARRAY['artikel_vergeten'::text, 'verkeerd_aantal'::text, 'artikel_teveel'::text]));

alter table "public"."order_corrections" add constraint "order_corrections_pkey" PRIMARY KEY (id);

alter table "private"."cleanup_log" add constraint "cleanup_log_pkey" PRIMARY KEY (id);

alter table "public"."order_status_dates" add constraint "order_status_dates_order_number_status_key" UNIQUE (order_number, status);

alter table "public"."order_status_dates" add constraint "order_status_dates_pkey" PRIMARY KEY (id);

alter table "private"."push_subscriptions" add constraint "push_subscriptions_endpoint_key" UNIQUE (endpoint);

alter table "private"."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY (id);

alter table "private"."push_events" add constraint "push_events_event_type_check" CHECK (event_type = ANY (ARRAY['cart_added'::text, 'order_placed'::text]));

alter table "private"."push_events" add constraint "push_events_pkey" PRIMARY KEY (id);

alter table "private"."order_mail_status" add constraint "order_mail_status_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "private"."order_mail_status" add constraint "order_mail_status_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

alter table "private"."order_pdf_kopie" add constraint "order_pdf_kopie_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

alter table "public"."orders" add constraint "orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "private"."app_members" add constraint "app_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."cart_items" add constraint "cart_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

alter table "public"."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

alter table "public"."order_items" add constraint "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

alter table "public"."retour_items" add constraint "retour_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."retour_items" add constraint "retour_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

alter table "public"."order_corrections" add constraint "order_corrections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."order_status_dates" add constraint "order_status_dates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "private"."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "private"."push_events" add constraint "push_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX order_pdf_kopie_order_idx ON private.order_pdf_kopie USING btree (order_id, aangemaakt_op DESC);

CREATE INDEX order_items_product_id_idx ON public.order_items USING btree (product_id);

CREATE INDEX order_status_dates_order_idx ON public.order_status_dates USING btree (order_number);

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);

CREATE UNIQUE INDEX retour_items_uniq ON public.retour_items USING btree (order_number, COALESCE(ean_code, ''::text), description);

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE INDEX order_corrections_open_idx ON public.order_corrections USING btree (resolved, created_at DESC);

CREATE INDEX order_pdf_kopie_wachtrij_idx ON private.order_pdf_kopie USING btree (status, beschikbaar_op, aangemaakt_op) WHERE (status = ANY (ARRAY['wachtend'::text, 'voorbereiden'::text, 'verzenden'::text]));

CREATE INDEX order_corrections_order_idx ON public.order_corrections USING btree (order_number);

CREATE INDEX api_write_log_lookup_idx ON private.api_write_log USING btree (action, user_id, requested_at DESC);

CREATE INDEX push_subscriptions_user_id_idx ON private.push_subscriptions USING btree (user_id);

CREATE INDEX retour_items_created_idx ON public.retour_items USING btree (created_at DESC);

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);

CREATE INDEX orders_created_by_idx ON public.orders USING btree (created_by);

revoke all on table "private"."order_mail_status" from public, anon, authenticated, service_role;

revoke all on table "private"."order_pdf_kopie" from public, anon, authenticated, service_role;

revoke all on table "public"."orders" from public, anon, authenticated, service_role;

grant select on table "public"."orders" to authenticated;

grant all on table "public"."orders" to service_role;

revoke all on table "private"."app_members" from public, anon, authenticated, service_role;

revoke all on table "private"."api_write_log" from public, anon, authenticated, service_role;

revoke all on table "public"."products" from public, anon, authenticated, service_role;

grant select on table "public"."products" to authenticated;

grant all on table "public"."products" to service_role;

revoke all on table "public"."cart_items" from public, anon, authenticated, service_role;

grant select on table "public"."cart_items" to authenticated;

grant all on table "public"."cart_items" to service_role;

revoke all on table "public"."order_items" from public, anon, authenticated, service_role;

grant select on table "public"."order_items" to authenticated;

grant all on table "public"."order_items" to service_role;

revoke all on table "public"."retour_items" from public, anon, authenticated, service_role;

grant select on table "public"."retour_items" to authenticated;

grant all on table "public"."retour_items" to service_role;

revoke all on table "private"."cart_mail_queue" from public, anon, authenticated, service_role;

revoke all on table "public"."order_corrections" from public, anon, authenticated, service_role;

grant select on table "public"."order_corrections" to authenticated;

grant all on table "public"."order_corrections" to service_role;

revoke all on table "private"."cleanup_log" from public, anon, authenticated, service_role;

revoke all on table "public"."order_status_dates" from public, anon, authenticated, service_role;

grant select on table "public"."order_status_dates" to authenticated;

grant all on table "public"."order_status_dates" to service_role;

revoke all on table "private"."push_subscriptions" from public, anon, authenticated, service_role;

revoke all on table "private"."push_events" from public, anon, authenticated, service_role;

create policy "order_confirmations_delete_for_binnenapp" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'order-confirmations'::text) AND ( SELECT private.is_app_member() AS is_app_member)));

create policy "order_confirmations_read_for_binnenapp" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'order-confirmations'::text) AND ( SELECT private.is_app_member() AS is_app_member)));

create policy "order_confirmations_update_for_binnenapp" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'order-confirmations'::text) AND ( SELECT private.is_app_member() AS is_app_member))) with check (((bucket_id = 'order-confirmations'::text) AND (lower(storage.extension(name)) = 'pdf'::text) AND ( SELECT private.is_app_member() AS is_app_member)));

create policy "order_confirmations_upload_for_binnenapp" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'order-confirmations'::text) AND (lower(storage.extension(name)) = 'pdf'::text) AND ( SELECT private.is_app_member() AS is_app_member)));

create policy "orders_read_for_binnenapp" on "public"."orders" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "products_read_for_binnenapp" on "public"."products" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "cart_read_for_binnenapp" on "public"."cart_items" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "order_items_read_for_binnenapp" on "public"."order_items" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "retour_read_for_binnenapp" on "public"."retour_items" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "corrections_read_for_binnenapp" on "public"."order_corrections" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

create policy "statusdatums_read_for_binnenapp" on "public"."order_status_dates" as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_app_member() AS is_app_member));

CREATE TRIGGER binnenapp_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user();

CREATE TRIGGER binnenapp_queue_order_push AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION private.queue_order_push();

CREATE TRIGGER binnenapp_order_pdf_kopie_enqueue AFTER UPDATE OF confirmation_pdf_path ON orders FOR EACH ROW WHEN (new.confirmation_pdf_path IS DISTINCT FROM old.confirmation_pdf_path) EXECUTE FUNCTION private.order_pdf_kopie_enqueue();

alter publication "supabase_realtime" add table "public"."cart_items";

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('order-confirmations','order-confirmations',false,10485760,ARRAY['application/pdf']::text[]);

commit;

-- Extra afscherming na het kopiëren van de oorspronkelijke rechten.
begin;

drop extension pg_net;

create extension pg_net with schema extensions;

CREATE OR REPLACE FUNCTION private.binnenapp_leden_impl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_admin();
  return private.leden_lijst();
end;
$function$
;

revoke all on function private.binnenapp_leden_impl() from public, anon;

grant execute on function private.binnenapp_leden_impl() to authenticated;

create or replace function public.binnenapp_leden() returns jsonb language sql security invoker set search_path='' as $$ select private.binnenapp_leden_impl(); $$;

CREATE OR REPLACE FUNCTION private.binnenapp_keur_lid_goed_impl(p_email text, p_role text DEFAULT 'member'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('keur_lid_goed', 60, interval '1 hour');
  perform private.approve_member(p_email, p_role);
  return jsonb_build_object('email', lower(trim(p_email)), 'role', p_role, 'active', true);
end;
$function$
;

revoke all on function private.binnenapp_keur_lid_goed_impl(p_email text, p_role text) from public, anon;

grant execute on function private.binnenapp_keur_lid_goed_impl(p_email text, p_role text) to authenticated;

create or replace function public.binnenapp_keur_lid_goed(p_email text, p_role text DEFAULT 'member'::text) returns jsonb language sql security invoker set search_path='' as $$ select private.binnenapp_keur_lid_goed_impl(p_email,p_role); $$;

CREATE OR REPLACE FUNCTION private.binnenapp_trek_lid_in_impl(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  geraakt integer := 0;
begin
  perform private.assert_admin();
  perform private.check_write_rate_limit('trek_lid_in', 60, interval '1 hour');

  -- Jezelf uitsluiten zou de laatste beheerder buiten kunnen sluiten
  if lower(trim(p_email)) = (select lower(email) from private.app_members where user_id = (select auth.uid())) then
    raise exception 'Je kunt je eigen toegang niet intrekken.' using errcode = '22023';
  end if;

  update private.app_members set active = false where lower(email) = lower(trim(p_email));
  get diagnostics geraakt = row_count;
  if geraakt = 0 then
    raise exception 'Account niet gevonden.' using errcode = '22023';
  end if;

  return jsonb_build_object('email', lower(trim(p_email)), 'active', false);
end;
$function$
;

revoke all on function private.binnenapp_trek_lid_in_impl(p_email text) from public, anon;

grant execute on function private.binnenapp_trek_lid_in_impl(p_email text) to authenticated;

create or replace function public.binnenapp_trek_lid_in(p_email text) returns jsonb language sql security invoker set search_path='' as $$ select private.binnenapp_trek_lid_in_impl(p_email); $$;

commit;
select cron.schedule('binnenapp-opruimen-oude-bestellingen','15 3 * * *','select private.cleanup_oude_bestellingen()');
select cron.schedule('binnenapp-order-pdf-kopie','* * * * *','select private.order_pdf_kopie_dispatch();');
select cron.alter_job((select jobid from cron.job where jobname='binnenapp-order-pdf-kopie'), active := false);
