-- Alleen BinnenApp guurncfxhcxwvgnzoeyp; uitsluitend fotoverwijzingen.
begin;
update public.products
set product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/'||ean_code||'-foto2.png',
    source_image_url='https://polvobv.nl/product/image/mediumlarge/'||ean_code||'_1.jpeg',
    updated_at=now()
where (id=30 and ean_code='3404675') or (id=31 and ean_code='3420669')
returning id,description,product_image_url;
commit;
