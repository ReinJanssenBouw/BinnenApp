-- Geef nieuwe kopieertaken alleen de gewenste leesbare bestandsnaam.
-- Eerst de doelmapcontrole in Power Automate uitbrengen en controleren;
-- pas daarna deze aanvullende migratie uitvoeren. Geen oude namen aanpassen.
-- Taak-ID/token en unieke koppeling (order_id, object_id) blijven leidend.
begin;

-- Dezelfde gewenste naam kan in verschillende mappen of nieuwe uploads passen.
-- Alleen de oude globale naamuniciteit vervalt; geen upload-/taakuniciteit.
alter table private.order_pdf_kopie
  drop constraint order_pdf_kopie_bestandsnaam_key;

create or replace function private.order_pdf_kopie_enqueue()
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
$functie$;
revoke all on function private.order_pdf_kopie_enqueue()
  from public, anon, authenticated, service_role;

comment on column private.order_pdf_kopie.bestandsnaam is
  'Gewenste bestandsnaam bij registratie; Power Automate kan uitsluitend bij een bestaand doelbestand een volgnummer toevoegen. De werkelijk gekozen naam wordt niet via het bestaande resultaatprotocol teruggegeven.';

commit;
