-- Only BinnenApp guurncfxhcxwvgnzoeyp. Original URLs: productfotos-20260924.json.
begin;
lock table public.products in share row exclusive mode;
create temporary table fotos_vooraf on commit drop as select id,stock,min_stock,target_stock from public.products;
create temporary table foto_updates(id bigint,code text,old_url text,new_url text) on commit drop;
insert into foto_updates values (1,'116366','https://polvobv.nl/product/image/mediumlarge/116366_0.jpeg','https://binnenapp-mobiel.vercel.app/product-images/transparant/116366.png'),
(2,'116365','https://polvobv.nl/product/image/mediumlarge/116365_0.jpeg','https://binnenapp-mobiel.vercel.app/product-images/transparant/116365.png'),
(3,'160108','https://polvobv.nl/product/image/mediumlarge/160108_0.jpeg','https://binnenapp-mobiel.vercel.app/product-images/transparant/160108.png'),
(4,'3249788','https://polvobv.nl/product/image/mediumlarge/3249788_0.jpeg','https://binnenapp-mobiel.vercel.app/product-images/transparant/3249788.png'),
(5,'237262','https://binnenapp-mobiel.vercel.app/product-images/237262.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/237262.png'),
(6,'101296','https://binnenapp-mobiel.vercel.app/product-images/101296.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/101296.png'),
(7,'101346','https://binnenapp-mobiel.vercel.app/product-images/101346.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/101346.png'),
(8,'113063','https://binnenapp-mobiel.vercel.app/product-images/113063.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/113063.png'),
(9,'160769','https://binnenapp-mobiel.vercel.app/product-images/160769.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/160769.png'),
(10,'113050','https://binnenapp-mobiel.vercel.app/product-images/113050.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/113050.png'),
(11,'224643','https://binnenapp-mobiel.vercel.app/product-images/224643.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/224643.png'),
(12,'227794','https://i.imgur.com/NXZw27f.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/227794.png'),
(13,'113350','https://binnenapp-mobiel.vercel.app/product-images/113350.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/113350.png'),
(14,'109998','https://binnenapp-mobiel.vercel.app/product-images/109998.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109998.png'),
(15,'109996','https://binnenapp-mobiel.vercel.app/product-images/109996.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109996.png'),
(16,'109994','https://binnenapp-mobiel.vercel.app/product-images/109994.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109994.png'),
(17,'109813','https://binnenapp-mobiel.vercel.app/product-images/109813.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109813.png'),
(18,'109810','https://binnenapp-mobiel.vercel.app/product-images/109810.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109810.png'),
(19,'109785','https://binnenapp-mobiel.vercel.app/product-images/109785.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109785.png'),
(20,'109795','https://binnenapp-mobiel.vercel.app/product-images/109795.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109795.png'),
(21,'109781','https://binnenapp-mobiel.vercel.app/product-images/109781.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109781.png'),
(22,'109762','https://binnenapp-mobiel.vercel.app/product-images/109762.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109762.png'),
(23,'109776','https://binnenapp-mobiel.vercel.app/product-images/109776.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109776.png'),
(24,'109759','https://binnenapp-mobiel.vercel.app/product-images/109759.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109759.png'),
(25,'109746','https://binnenapp-mobiel.vercel.app/product-images/109746.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109746.png'),
(26,'109640','https://binnenapp-mobiel.vercel.app/product-images/109640.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109640.png'),
(27,'109744','https://binnenapp-mobiel.vercel.app/product-images/109744.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/109744.png'),
(28,'244003','https://binnenapp-mobiel.vercel.app/product-images/244003.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/244003.png'),
(29,'115807','https://binnenapp-mobiel.vercel.app/product-images/115807.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/115807.png'),
(30,'3404675','https://binnenapp-mobiel.vercel.app/product-images/3404675.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/3404675.png'),
(31,'3420669','https://binnenapp-mobiel.vercel.app/product-images/3420669.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/3420669.png'),
(32,'114230','https://binnenapp-mobiel.vercel.app/product-images/114230.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114230.png'),
(33,'3362036','https://binnenapp-mobiel.vercel.app/product-images/3362036.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/3362036.png'),
(34,'3211895','https://binnenapp-mobiel.vercel.app/product-images/3211895.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/3211895.png'),
(35,'114453','https://binnenapp-mobiel.vercel.app/product-images/114453.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114453.png'),
(36,'114464','https://binnenapp-mobiel.vercel.app/product-images/114464.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114464.png'),
(37,'114407','https://binnenapp-mobiel.vercel.app/product-images/114407.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114407.png'),
(38,'114412','https://binnenapp-mobiel.vercel.app/product-images/114412.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114412.png'),
(39,'114439','https://binnenapp-mobiel.vercel.app/product-images/114439.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/114439.png'),
(40,'2547397','https://binnenapp-mobiel.vercel.app/product-images/2547397.png','https://binnenapp-mobiel.vercel.app/product-images/transparant/2547397.png');
do $$ begin
 if (select count(*) from public.products p join foto_updates u on p.id=u.id and p.ean_code=u.code and p.product_image_url=u.old_url) <> 40 then
  raise exception 'Products or image URLs changed since preparation';
 end if;
end $$;
update public.products p set product_image_url=u.new_url,updated_at=now() from foto_updates u where p.id=u.id;
do $$ begin
 if exists(select 1 from public.products p join fotos_vooraf v using(id) where (p.stock,p.min_stock,p.target_stock) is distinct from (v.stock,v.min_stock,v.target_stock)) then
  raise exception 'Inventory changed';
 end if;
end $$;
select count(*) as transparante_productfotos from public.products p join foto_updates u on p.id=u.id and p.product_image_url=u.new_url;
commit;
