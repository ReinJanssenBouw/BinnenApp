-- Alleen BinnenApp guurncfxhcxwvgnzoeyp: uitsluitend de foto wijzigen.
update public.products
set product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/101346-v2.png',updated_at=now()
where id=7 and ean_code='101346'
  and product_image_url='https://binnenapp-mobiel.vercel.app/product-images/transparant/101346.png'
returning id,description,product_image_url;
