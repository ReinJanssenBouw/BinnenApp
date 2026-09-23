-- De publieke SQL-wrappers draaien met de rechten van de ingelogde gebruiker.
-- Daarom heeft authenticated EXECUTE nodig op de achterliggende private
-- SECURITY DEFINER-functies. Het private schema blijft buiten PostgREST en de
-- functies zelf controleren altijd opnieuw of de gebruiker beheerder is.

revoke all on function private.admin_products() from public, anon;
grant execute on function private.admin_products() to authenticated;

revoke all on function private.save_product(
  bigint, timestamptz, text, text, text, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function private.save_product(
  bigint, timestamptz, text, text, text, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, text, text, boolean
) to authenticated;

revoke all on function public.binnenapp_admin_products() from public, anon;
grant execute on function public.binnenapp_admin_products() to authenticated;

revoke all on function public.binnenapp_save_product(
  bigint, timestamptz, text, text, text, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.binnenapp_save_product(
  bigint, timestamptz, text, text, text, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, text, text, boolean
) to authenticated;
