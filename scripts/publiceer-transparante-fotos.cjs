// Generate a reviewable SQL transaction; never execute database changes here.
const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('scripts/productfotos-20260924.json','utf8').replace(/^\uFEFF/,'' )).rows;
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const values=rows.map(p=>`(${Number(p.id)},${quote(p.ean_code)},${quote(p.product_image_url)},${quote('https://binnenapp-mobiel.vercel.app/product-images/transparant/'+p.ean_code+'.png')})`).join(',\n');
fs.writeFileSync('scripts/publiceer-transparante-fotos.sql',`-- Only BinnenApp guurncfxhcxwvgnzoeyp. Original URLs: productfotos-20260924.json.
begin;
lock table public.products in share row exclusive mode;
create temporary table fotos_vooraf on commit drop as select id,stock,min_stock,target_stock from public.products;
create temporary table foto_updates(id bigint,code text,old_url text,new_url text) on commit drop;
insert into foto_updates values ${values};
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
`);
