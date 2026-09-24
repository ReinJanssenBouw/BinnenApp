-- Alleen BinnenApp guurncfxhcxwvgnzoeyp: uitsluitend fotoverwijzingen wijzigen.
update public.products
set product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/'||ean_code||'-v2.png',updated_at=now()
where ((id=5 and ean_code='237262') or (id=6 and ean_code='101296'))
  and product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/'||ean_code||'.png'
returning id,description,product_image_url;
