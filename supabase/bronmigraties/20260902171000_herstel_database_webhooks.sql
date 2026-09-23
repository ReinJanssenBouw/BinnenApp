begin;

-- Dit oudere project miste de Supabase-laag die Database Webhooks gebruikt.
-- De tabellen staan buiten de API-schema's en zijn alleen voor de webhookmotor.
create extension if not exists pg_net with schema extensions;
create schema if not exists supabase_functions authorization postgres;

grant usage on schema supabase_functions to postgres, service_role;
grant usage on schema net to postgres, service_role;

create table if not exists supabase_functions.migrations (
  version text primary key,
  inserted_at timestamptz not null default now()
);

create table if not exists supabase_functions.hooks (
  id bigserial primary key,
  hook_table_id integer not null,
  hook_name text not null,
  created_at timestamptz not null default now(),
  request_id bigint
);

create index if not exists supabase_functions_hooks_request_id_idx
  on supabase_functions.hooks (request_id);
create index if not exists supabase_functions_hooks_h_table_id_h_name_idx
  on supabase_functions.hooks (hook_table_id, hook_name);

revoke all on all tables in schema supabase_functions
  from public, anon, authenticated;
revoke all on all sequences in schema supabase_functions
  from public, anon, authenticated;
grant select, insert on supabase_functions.hooks to postgres, service_role;
grant usage, select on sequence supabase_functions.hooks_id_seq
  to postgres, service_role;

create or replace function supabase_functions.http_request()
returns trigger
language plpgsql
security definer
set search_path = supabase_functions, pg_temp
as $function$
declare
  request_id bigint;
  payload jsonb;
  url text := tg_argv[0]::text;
  method text := tg_argv[1]::text;
  headers jsonb := coalesce(
    nullif(tg_argv[2], 'null')::jsonb,
    '{"Content-Type":"application/json"}'::jsonb
  );
  params jsonb := coalesce(nullif(tg_argv[3], 'null')::jsonb, '{}'::jsonb);
  timeout_ms integer := coalesce(nullif(tg_argv[4], 'null')::integer, 1000);
begin
  if url is null or url = 'null' then
    raise exception 'url argument is missing';
  end if;
  if method is null or method = 'null' then
    raise exception 'method argument is missing';
  end if;

  if method = 'GET' then
    select http_get into request_id
    from net.http_get(url, params, headers, timeout_ms);
  elsif method = 'POST' then
    payload := jsonb_build_object(
      'old_record', old,
      'record', new,
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema
    );
    select http_post into request_id
    from net.http_post(url, payload, params, headers, timeout_ms);
  else
    raise exception 'method argument % is invalid', method;
  end if;

  insert into supabase_functions.hooks (hook_table_id, hook_name, request_id)
  values (tg_relid, tg_name, request_id);

  return new;
end;
$function$;

revoke all on function supabase_functions.http_request()
  from public, anon, authenticated;
grant execute on function supabase_functions.http_request()
  to postgres, service_role;

insert into supabase_functions.migrations (version)
values ('binnenapp-20260902-webhooks')
on conflict (version) do nothing;

commit;
