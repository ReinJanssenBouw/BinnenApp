-- Voorwaartse aanvulling na de hoofdmigratie, vóór de afzonderlijke activering.
-- De gebruiker heeft het instellen van de bestaande PUBLIEKE projectsleutel
-- expliciet toegestaan. JWT-controle blijft AAN; dit schakelt niets uit.
-- Vervang alleen de ene plaatsaanduiding door de geverifieerde legacy anon-JWT.
-- Geen serverrolsleutel, gebruikerssessie, uploadlink of Vault-toegang gebruiken.
begin;

create or replace function private.order_pdf_kopie_gateway_sleutel()
returns text
language plpgsql
security definer
set search_path to ''
as $functie$
declare
  publieke_sleutel constant text := 'BINNENAPP_PUBLIEKE_ANON_JWT';
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
     or (inhoud ->> 'ref') is distinct from 'rautxcieowrqifbnxjnx'
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
$functie$;
revoke all on function private.order_pdf_kopie_gateway_sleutel()
  from public, anon, authenticated, service_role;

-- Eerst controleren: een vergeten plaatsaanduiding of verkeerde sleutel laat
-- de HELE migratie terugdraaien, vóór de dispatcher vervangen wordt.
do $controle$
begin
  perform private.order_pdf_kopie_gateway_sleutel();
  if pg_catalog.to_regprocedure('private.order_pdf_kopie_dispatch()') is null then
    raise exception 'Voer eerst de hoofdmigratie voor PDF-kopieën uit.' using errcode = '22023';
  end if;
end;
$controle$;

-- Identiek aan de gecontroleerde dispatcher uit de hoofdmigratie, behalve de
-- publieke Authorization-header naar het vaste Supabase-endpoint. De body en
-- controles op actor, tempo, taaktoken en eenmalig verzenden blijven gelijk.
create or replace function private.order_pdf_kopie_dispatch()
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
$functie$;
revoke all on function private.order_pdf_kopie_dispatch()
  from public, anon, authenticated, service_role;

comment on function private.order_pdf_kopie_gateway_sleutel() is
  'Publieke legacy anon-projectsleutel voor ingeschakelde JWT-gateway; geen PDF- of serverbevoegdheid.';

commit;


