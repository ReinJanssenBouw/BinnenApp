-- Duurzame kopie van nieuwe, gekoppelde orderbevestigingen naar de gekozen map.
-- Deze migratie activeert NOG GEEN trigger of cronjob. Eerst de Edge Function
-- uitbrengen en controleren, daarna het afzonderlijke activatiescript uitvoeren.
-- Geen bestaande PDF's inhalen en geen bestel-, voorraad- of mailstatus wijzigen.
begin;

create table private.order_pdf_kopie (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid not null,
  order_number text not null check (order_number ~ '^#ORD-[A-Za-z0-9-]{6,40}$'),
  opslagpad text not null check (length(opslagpad) between 8 and 400),
  object_id uuid not null,
  object_version text not null check (length(object_version) between 1 and 200),
  bestandsnaam text not null unique check (
    length(bestandsnaam) <= 220 and bestandsnaam ~ '^BinnenApp-ORD-[A-Za-z0-9-]+\.pdf$'
  ),
  token uuid not null unique default pg_catalog.gen_random_uuid(),
  status text not null default 'wachtend' check (
    status in ('wachtend', 'voorbereiden', 'verzenden', 'opgeslagen', 'mislukt', 'onbekend')
  ),
  poging_id uuid,
  pogingen integer not null default 0 check (pogingen between 0 and 3),
  aangemaakt_op timestamptz not null default pg_catalog.clock_timestamp(),
  gewijzigd_op timestamptz not null default pg_catalog.clock_timestamp(),
  beschikbaar_op timestamptz not null default pg_catalog.clock_timestamp(),
  voorbereid_op timestamptz,
  verzonden_op timestamptz,
  afgerond_op timestamptz,
  laatste_dispatch_op timestamptz,
  dispatch_pogingen integer not null default 0 check (dispatch_pogingen >= 0),
  net_request_id bigint,
  fout_code text check (fout_code in (
    'configuratie_ongeldig', 'bronpad_ongeldig', 'bron_niet_beschikbaar',
    'pdf_ongeldig', 'voorbereiding_mislukt', 'bron_gewijzigd',
    'voorbereiding_verlopen', 'verzending_onzeker', 'verzending_mislukt'
  )),
  unique (order_id, object_id),
  check (status not in ('voorbereiden', 'verzenden') or poging_id is not null),
  check (status <> 'voorbereiden' or voorbereid_op is not null),
  check (status not in ('verzenden', 'opgeslagen', 'onbekend') or verzonden_op is not null)
);

alter table private.order_pdf_kopie enable row level security;
revoke all on table private.order_pdf_kopie from public, anon, authenticated, service_role;
create index order_pdf_kopie_wachtrij_idx
  on private.order_pdf_kopie (status, beschikbaar_op, aangemaakt_op)
  where status in ('wachtend', 'voorbereiden', 'verzenden');
create index order_pdf_kopie_order_idx
  on private.order_pdf_kopie (order_id, aangemaakt_op desc);

-- Alleen interne aanroep: een vervangen, verplaatst of opnieuw toegewezen
-- opslagobject mag niet ongemerkt de eerder goedgekeurde bron vervangen.
create function private.order_pdf_kopie_bron_geldig(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $functie$
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
$functie$;
revoke all on function private.order_pdf_kopie_bron_geldig(uuid)
  from public, anon, authenticated, service_role;

-- Alleen de serverdienst mag een taak behandelen. De actor komt altijd uit
-- de eerder onder auth.uid() aangemaakte registratie, nooit uit het verzoek.
create function private.order_pdf_kopie_werk(
  p_id uuid,
  p_token uuid,
  p_actie text,
  p_poging_id uuid default null,
  p_resultaat text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $functie$
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
$functie$;

revoke all on function private.order_pdf_kopie_werk(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function private.order_pdf_kopie_werk(uuid, uuid, text, uuid, text) to service_role;
create function public.binnenapp_order_pdf_kopie_werk(
  p_id uuid, p_token uuid, p_actie text,
  p_poging_id uuid default null, p_resultaat text default null
)
returns jsonb
language sql
set search_path to ''
as $functie$
  select private.order_pdf_kopie_werk(p_id, p_token, p_actie, p_poging_id, p_resultaat)
$functie$;
revoke all on function public.binnenapp_order_pdf_kopie_werk(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.binnenapp_order_pdf_kopie_werk(uuid, uuid, text, uuid, text) to service_role;

-- Na commit start pg_net de servertaak. De body bevat alleen een willekeurige
-- taak-ID en taaksleutel; nooit de Power Automate-link of een algemene sleutel.
create function private.order_pdf_kopie_dispatch()
returns integer
language plpgsql
security definer
set search_path to ''
as $functie$
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
          url := 'https://binnenapp-nog-instellen.invalid/functions/v1/copy-order-confirmation',
          body := jsonb_build_object('id', registratie.id, 'token', registratie.token),
          headers := '{"Content-Type":"application/json"}'::jsonb,
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
$functie$;
revoke all on function private.order_pdf_kopie_dispatch()
  from public, anon, authenticated, service_role;

create function private.order_pdf_kopie_enqueue()
returns trigger
language plpgsql
security definer
set search_path to ''
as $functie$
declare
  actor uuid := (select auth.uid());
  opslag storage.objects%rowtype;
  nieuw_id uuid := pg_catalog.gen_random_uuid();
  nieuw_pad text := coalesce(new.confirmation_pdf_path, '');
  bestelde_prefix text;
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

  insert into private.order_pdf_kopie (
    id, order_id, actor_id, order_number, opslagpad, object_id, object_version, bestandsnaam
  ) values (
    nieuw_id, new.id, actor, new.order_number, nieuw_pad, opslag.id, opslag.version,
    'BinnenApp-' || substring(new.order_number from 2) || '-' || nieuw_id::text || '.pdf'
  ) on conflict (order_id, object_id) do nothing;

  -- De dispatcher vangt tijdelijke fouten op; de wachtrij is de bron van waarheid.
  perform private.order_pdf_kopie_dispatch();
  return new;
end;
$functie$;
revoke all on function private.order_pdf_kopie_enqueue()
  from public, anon, authenticated, service_role;

-- Alleen veilige statusinformatie voor actieve appleden. Geen token,
-- interne poging-ID, opslagpad, actor of Microsoft-koppeling teruggeven.
create function private.order_pdf_kopie_status(p_order_number text default null)
returns table (
  order_number text, bestandsnaam text, status text, fout_code text,
  aangemaakt_op timestamptz, gewijzigd_op timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $functie$
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
$functie$;
revoke all on function private.order_pdf_kopie_status(text) from public, anon, service_role;
grant execute on function private.order_pdf_kopie_status(text) to authenticated;
create function public.binnenapp_order_pdf_kopie_status(p_order_number text default null)
returns table (
  order_number text, bestandsnaam text, status text, fout_code text,
  aangemaakt_op timestamptz, gewijzigd_op timestamptz
)
language sql
stable
set search_path to ''
as $functie$
  select * from private.order_pdf_kopie_status(p_order_number)
$functie$;
revoke all on function public.binnenapp_order_pdf_kopie_status(text) from public, anon, service_role;
grant execute on function public.binnenapp_order_pdf_kopie_status(text) to authenticated;

comment on table private.order_pdf_kopie is
  'Nieuwe gekoppelde PDF-kopieën; voorbereiding maximaal driemaal, externe verzending hoogstens eenmaal per registratie.';
comment on function public.binnenapp_order_pdf_kopie_werk(uuid, uuid, text, uuid, text) is
  'Service-only verwerking met taaktoken, vertrouwde actor, afzonderlijke voorbereiding en eenmalige verzendpoort.';

commit;

