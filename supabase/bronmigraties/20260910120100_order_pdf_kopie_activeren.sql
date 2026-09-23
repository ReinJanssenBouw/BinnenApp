-- AFZONDERLIJKE LAATSTE UITGEEFSTAP: pas uitvoeren nadat copy-order-confirmation
-- met de serversecret is uitgebracht en hoofd-/gatewaymigratie/tests zijn goedgekeurd.
-- Dit activeert nieuwe gekoppelde uploads; er worden geen oude PDF's ingehaald.
begin;

do $controle$
begin
  if pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'De benodigde cloudplanning is niet beschikbaar.';
  end if;
  if pg_catalog.to_regprocedure('private.order_pdf_kopie_enqueue()') is null
     or pg_catalog.to_regprocedure('private.order_pdf_kopie_dispatch()') is null
     or pg_catalog.to_regprocedure('private.order_pdf_kopie_gateway_sleutel()') is null then
    raise exception 'Installeer eerst de gecontroleerde PDF-kopiemigratie.';
  end if;
  perform private.order_pdf_kopie_gateway_sleutel();
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.orders'::regclass and tgname = 'binnenapp_order_pdf_kopie_enqueue'
  ) or exists (
    select 1 from cron.job where jobname = 'binnenapp-order-pdf-kopie'
  ) then
    raise exception 'De PDF-kopie is al geactiveerd; controleer de bestaande configuratie.';
  end if;
  if exists (select 1 from private.order_pdf_kopie) then
    raise exception 'De nieuwe kopiewachtrij is niet leeg; controleer eerst de aanwezige registraties.';
  end if;
end;
$controle$;

create trigger binnenapp_order_pdf_kopie_enqueue
after update of confirmation_pdf_path on public.orders
for each row
when (new.confirmation_pdf_path is distinct from old.confirmation_pdf_path)
execute function private.order_pdf_kopie_enqueue();

select cron.schedule(
  'binnenapp-order-pdf-kopie', '* * * * *',
  'select private.order_pdf_kopie_dispatch();'
);

commit;
