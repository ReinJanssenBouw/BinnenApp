-- iOS/Web Push voor wijzigingen aan de gedeelde winkelwagen en bestellingen.
-- Abonnementen en gebeurtenissen staan in private en zijn nooit rechtstreeks
-- bereikbaar vanuit een client.

create table if not exists private.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on private.push_subscriptions(user_id);

create table if not exists private.push_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('cart_added', 'order_placed')),
  actor_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now()
);

revoke all on table private.push_subscriptions from public, anon, authenticated;
revoke all on table private.push_events from public, anon, authenticated;
revoke all on sequence private.push_subscriptions_id_seq from public, anon, authenticated;
revoke all on sequence private.push_events_id_seq from public, anon, authenticated;

create or replace function private.register_push_subscription(p_subscription jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function private.unregister_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function private.register_push_subscription(jsonb) from public, anon;
revoke all on function private.unregister_push_subscription(text) from public, anon;
grant execute on function private.register_push_subscription(jsonb) to authenticated;
grant execute on function private.unregister_push_subscription(text) to authenticated;

create or replace function public.binnenapp_register_push_subscription(p_subscription jsonb)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.register_push_subscription(p_subscription)
$function$;

create or replace function public.binnenapp_unregister_push_subscription(p_endpoint text)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.unregister_push_subscription(p_endpoint)
$function$;

revoke all on function public.binnenapp_register_push_subscription(jsonb) from public, anon;
revoke all on function public.binnenapp_unregister_push_subscription(text) from public, anon;
grant execute on function public.binnenapp_register_push_subscription(jsonb) to authenticated;
grant execute on function public.binnenapp_unregister_push_subscription(text) to authenticated;

-- De bestaande synchronisatie blijft één atomaire vervanging van de volledige
-- gedeelde winkelwagen. Alleen positieve verschillen leveren een melding op.
create or replace function private.sync_cart(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- De bestelling zelf blijft ongewijzigd. De trigger draait in dezelfde
-- transactie en wordt alleen bereikt via de bestaande beveiligde bestelactie.
create or replace function private.queue_order_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

drop trigger if exists binnenapp_queue_order_push on public.orders;
create trigger binnenapp_queue_order_push
after insert on public.orders
for each row execute function private.queue_order_push();

-- Alleen de Edge Function met de service-role mag een gebeurtenis met de
-- bijbehorende actieve ontvangers uitlezen.
create or replace function private.push_delivery(p_event_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
    on s.user_id is distinct from e.actor_id
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
$function$;

create or replace function public.binnenapp_push_delivery(p_event_id bigint)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.push_delivery(p_event_id)
$function$;

revoke all on function private.push_delivery(bigint) from public, anon, authenticated;
revoke all on function public.binnenapp_push_delivery(bigint) from public, anon, authenticated;
grant execute on function private.push_delivery(bigint) to service_role;
grant execute on function public.binnenapp_push_delivery(bigint) to service_role;

comment on function public.binnenapp_register_push_subscription(jsonb)
  is 'Registreert het pushabonnement van het ingelogde BinnenApp-lid.';
comment on function public.binnenapp_unregister_push_subscription(text)
  is 'Verwijdert het pushabonnement van het ingelogde BinnenApp-lid.';
