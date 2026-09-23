-- Betrouwbare verzendregistratie, gedeeld door desktop en mobiel.
-- Alleen de mailfunctie mag providerresultaten schrijven. Clients lezen een
-- beperkte weergave en kunnen een mail niet zelf als afgeleverd markeren.

create table if not exists private.order_mail_status (
  order_id uuid not null references public.orders(id) on delete cascade,
  soort text not null check (soort in ('leverancier', 'bevestiging')),
  actor_id uuid references auth.users(id) on delete set null,
  poging_id uuid not null default pg_catalog.gen_random_uuid(),
  ontvanger text not null check (length(ontvanger) between 3 and 320),
  provider_id text,
  status text not null default 'bezig'
    check (status in ('bezig', 'verzonden', 'afgeleverd', 'vertraagd', 'mislukt', 'onbekend')),
  fout text,
  controle_fout text,
  geprobeerd_op timestamptz not null default now(),
  gecontroleerd_op timestamptz,
  controle_poging_op timestamptz,
  primary key (order_id, soort),
  unique (poging_id),
  check (provider_id is null or length(provider_id) between 1 and 128),
  check (fout is null or length(fout) <= 1200),
  check (controle_fout is null or length(controle_fout) <= 1200)
);

alter table private.order_mail_status enable row level security;
revoke all on table private.order_mail_status from public, anon, authenticated, service_role;

create or replace function private.order_mail_beheer(
  p_actor_id uuid,
  p_order_number text,
  p_soort text,
  p_actie text,
  p_gegevens jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $functie$
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
$functie$;

revoke all on function private.order_mail_beheer(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.order_mail_beheer(uuid, text, text, text, jsonb) to service_role;

create or replace function public.binnenapp_order_mail_beheer(
  p_actor_id uuid,
  p_order_number text,
  p_soort text,
  p_actie text,
  p_gegevens jsonb default '{}'::jsonb
)
returns jsonb
language sql
set search_path to ''
as $functie$
  select private.order_mail_beheer(p_actor_id, p_order_number, p_soort, p_actie, p_gegevens)
$functie$;

revoke all on function public.binnenapp_order_mail_beheer(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.binnenapp_order_mail_beheer(uuid, text, text, text, jsonb) to service_role;

create or replace function private.order_mail_status(p_order_number text default null)
returns table (
  order_number text,
  soort text,
  ontvanger text,
  status text,
  fout text,
  controle_fout text,
  geprobeerd_op timestamptz,
  gecontroleerd_op timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $functie$
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
$functie$;

revoke all on function private.order_mail_status(text) from public, anon, service_role;
grant execute on function private.order_mail_status(text) to authenticated;

create or replace function public.binnenapp_order_mail_status(p_order_number text default null)
returns table (
  order_number text,
  soort text,
  ontvanger text,
  status text,
  fout text,
  controle_fout text,
  geprobeerd_op timestamptz,
  gecontroleerd_op timestamptz
)
language sql
stable
set search_path to ''
as $functie$
  select * from private.order_mail_status(p_order_number)
$functie$;

revoke all on function public.binnenapp_order_mail_status(text) from public, anon, service_role;
grant execute on function public.binnenapp_order_mail_status(text) to authenticated;

comment on function public.binnenapp_order_mail_beheer(uuid, text, text, text, jsonb)
  is 'Beheert bewezen mailresultaten namens een actief lid; uitsluitend voor de server-side maildienst.';
comment on function public.binnenapp_order_mail_status(text)
  is 'Leest veilige verzend- en bezorgstatussen van BinnenApp-bestellingen, zonder interne providerkenmerken.';
