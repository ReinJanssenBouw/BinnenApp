-- Alleen BinnenApp guurncfxhcxwvgnzoeyp. Bestaande codes blijven behouden.
begin;
lock table public.products in exclusive mode;
with volgende as (
  select (coalesce(max(substring(trim(jb_code) from 3)::numeric),0)+1)::text as nummer
  from public.products where trim(jb_code) ~* '^JB[0-9]+$'
)
update public.products p
set jb_code='JB'||lpad(v.nummer,greatest(4,length(v.nummer)),'0'), updated_at=now()
from volgende v
where p.ean_code='3249788' and nullif(trim(p.jb_code),'') is null
returning p.id,p.ean_code,p.jb_code,p.description;
commit;
