-- Ook de uitvoerder ontvangt de pushmelding. Dit maakt een test met één
-- aangemeld apparaat mogelijk en sluit aan bij de verwachting in de app.
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
$function$;

revoke all on function private.push_delivery(bigint)
  from public, anon, authenticated;
grant execute on function private.push_delivery(bigint) to service_role;
