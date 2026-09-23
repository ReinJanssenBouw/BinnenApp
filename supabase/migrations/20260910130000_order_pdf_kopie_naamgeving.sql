-- Automatische doelnaam voor uitsluitend NIEUWE gekoppelde order-PDF's.
-- Besteldatum, Leys-nummer en categorieën komen uit de opgeslagen bestelling.
-- Geen oude bestanden of taken hernoemen; bestemming/toegangscontrole ongewijzigd.
begin;

-- Alleen zuivere opschoning, zonder gegevenswijzigingen of extra toegangsrechten.
create function private.order_pdf_kopie_naamdeel(p_tekst text)
returns text
language plpgsql
immutable
security definer
set search_path to ''
as $functie$
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
$functie$;
revoke all on function private.order_pdf_kopie_naamdeel(text)
  from public, anon, authenticated, service_role;

-- De databank en worker accepteren dezelfde veilige doelnaamvormen.
-- PostgreSQL-tekst kan geen NUL bevatten; overige C0/C1-tekens staan hieronder.
create function private.order_pdf_kopie_naam_geldig(p_naam text)
returns boolean
language plpgsql
immutable
security definer
set search_path to ''
as $functie$
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
$functie$;
revoke all on function private.order_pdf_kopie_naam_geldig(text)
  from public, anon, authenticated, service_role;

create function private.order_pdf_kopie_bestandsnaam(p_order_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $functie$
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
$functie$;
revoke all on function private.order_pdf_kopie_bestandsnaam(uuid)
  from public, anon, authenticated, service_role;

-- Bestaande namen blijven geldig en worden niet bijgewerkt. De bestaande
-- UNIQUE-bestandsnaamconstraint blijft behouden; nieuwe namen worden daarnaast
-- in de enige schrijfroutine hoofdletterongevoelig gereserveerd.
alter table private.order_pdf_kopie
  drop constraint order_pdf_kopie_bestandsnaam_check;
alter table private.order_pdf_kopie
  add constraint order_pdf_kopie_bestandsnaam_check
  check (private.order_pdf_kopie_naam_geldig(bestandsnaam));

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
  -- Serialiseer alleen gelijke namen, ook tussen verschillende bestellingen.
  -- De vaste namespace voorkomt vermenging met andere adviesvergrendelingen.
  perform pg_catalog.pg_advisory_xact_lock(1213995086,
    pg_catalog.hashtext(pg_catalog.lower(nieuwe_bestandsnaam)));
  if exists (
    select 1 from private.order_pdf_kopie k
    where pg_catalog.lower(k.bestandsnaam) = pg_catalog.lower(nieuwe_bestandsnaam)
  ) then
    nieuwe_bestandsnaam := pg_catalog.left(nieuwe_bestandsnaam, length(nieuwe_bestandsnaam) - 4)
      || ' (' || nieuw_id::text || ').pdf';
    if pg_catalog.octet_length(nieuwe_bestandsnaam) > 255 then
      raise exception 'De unieke PDF-bestandsnaam is te lang (maximaal 255 UTF-8-bytes). De bestaande koppeling blijft ongewijzigd.'
        using errcode = '22023';
    end if;
  end if;

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

commit;
