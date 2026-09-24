-- Alleen BinnenApp guurncfxhcxwvgnzoeyp; uitsluitend de fotoverwijzingen.
update public.products
set product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/113350-foto2.png',
    source_image_url='https://polvobv.nl/product/image/mediumlarge/113350_1.jpeg',
    updated_at=now()
where id=13 and ean_code='113350'
returning id,description,product_image_url;
