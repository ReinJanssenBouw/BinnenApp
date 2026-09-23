-- De winkelwagen wordt door desktop en mobiel live gevolgd. Schrijfacties
-- blijven uitsluitend via binnenapp_sync_cart lopen; dit publiceert alleen
-- wijzigingen aan ingelogde leden die de bestaande SELECT-policy doorstaan.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cart_items'
  ) then
    alter publication supabase_realtime add table public.cart_items;
  end if;
end
$$;
