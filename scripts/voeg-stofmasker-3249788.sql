-- Uitsluitend BinnenApp-project guurncfxhcxwvgnzoeyp.
-- Op expliciet verzoek 24 september 2026: uitsluitend dit product toevoegen.
-- Polvo artikelnummer wordt volgens het bestaande appmodel opgeslagen in ean_code.
-- Werkelijke EAN fabrikant: 3295249103378. Verkoopeenheid: doos van vijf maskers.
-- Publieke productpagina toont geen prijs; 0 is voorlopig, geen bevestigde verkoopprijs.
begin;
lock table public.products in exclusive mode;
insert into public.products
  (id, ean_code, description, category, unit, packaged_per, price_per_unit,
   stock, min_stock, product_image_url, source_image_url, available)
select (select coalesce(max(id),0)+1 from public.products), '3249788', 'Delta Plus stofmasker FFP3 NR met ventiel M1300V doos 5 stuks',
       'Adembescherming', 'doos', 1, 0, 0, 0,
       'https://polvobv.nl/product/image/mediumlarge/3249788_0.jpeg',
       'https://polvobv.nl/product/image/mediumlarge/3249788_0.jpeg', true
where not exists (select 1 from public.products where ean_code='3249788')
returning id, ean_code, description, category, unit, packaged_per, price_per_unit, stock;
commit;
