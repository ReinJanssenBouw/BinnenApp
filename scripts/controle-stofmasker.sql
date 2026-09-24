select id, ean_code, description, category, unit, packaged_per, price_per_unit,
       stock, min_stock, product_image_url, available,
       (select count(*) from public.products) as totaal_artikelen
from public.products where ean_code='3249788';
