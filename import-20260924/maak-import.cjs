const fs=require('fs'),path=require('path');const dir=__dirname;
const rows=JSON.parse(fs.readFileSync(path.join(dir,'import.json')));
const data=rows.map((p,i)=>({volgorde:i+1,ean_code:p.id,description:p.name,category:p.category,unit:p.unit,packaged_per:p.packaged_per,source_image_url:p.image,product_image_url:`https://binnenapp-mobiel.vercel.app/product-images/${p.id}.png`}));
const json=JSON.stringify(data).replaceAll("'","''");
const sql=`-- Uitsluitend BinnenApp guurncfxhcxwvgnzoeyp. 36 links expliciet goedgekeurd.
begin;
lock table public.products in exclusive mode;
create temporary table import_producten on commit drop as
select * from jsonb_to_recordset('${json}'::jsonb) as x(volgorde int,ean_code text,description text,category text,unit text,packaged_per numeric,source_image_url text,product_image_url text);
with nieuw as (
 select i.*,row_number() over(order by i.volgorde) as nr from import_producten i
 where not exists(select 1 from public.products p where p.ean_code=i.ean_code)
), hoogste as (
 select coalesce(max(id),0) as id,
 coalesce(max(case when trim(jb_code) ~* '^JB[0-9]+$' then substring(trim(jb_code) from 3)::numeric end),0) as jb
 from public.products
)
insert into public.products(id,ean_code,jb_code,description,category,unit,packaged_per,price_per_unit,stock,min_stock,source_image_url,product_image_url,available)
select h.id+n.nr,n.ean_code,'JB'||lpad((h.jb+n.nr)::text,greatest(4,length((h.jb+n.nr)::text)),'0'),n.description,n.category,n.unit,n.packaged_per,0,0,0,n.source_image_url,n.product_image_url,true
from nieuw n cross join hoogste h
returning id,ean_code,jb_code,description,unit,packaged_per;
commit;
`;
fs.writeFileSync(path.join(dir,'import.sql'),sql);
fs.writeFileSync(path.join(dir,'controle.sql'),`select id,ean_code,jb_code,description,unit,packaged_per,product_image_url from public.products where ean_code in (${rows.map(p=>"'"+p.id+"'").join(',')}) order by id;`);
console.log('Import SQL voor '+rows.length+' producten gereed; bestaande artikelen blijven behouden.');
