-- Tests rolled back; BinnenApp guurncfxhcxwvgnzoeyp only.
begin;
do $$
declare p public.products; q public.products; admin_id uuid;
begin
 select user_id into admin_id from private.app_members where active and role='admin' limit 1;
 if admin_id is null then raise exception 'No test admin available'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select * into p from public.products order by id limit 1;
 q := public.binnenapp_set_stock_levels(p.id,6,10,p.min_stock,p.target_stock);
 if q.min_stock <> 6 or q.target_stock <> 10 then raise exception 'Save failed'; end if;
 begin
  perform public.binnenapp_set_stock_levels(p.id,6,5,6,10);
  raise exception 'Invalid target accepted';
 exception when sqlstate '22023' then null;
 end;
 begin
  perform public.binnenapp_set_stock_levels(p.id,6,11,6,9);
  raise exception 'Stale update accepted';
 exception when sqlstate '40001' then null;
 end;
 q := public.binnenapp_save_product_met_aanvulvoorraad(q.id,q.updated_at,q.ean_code,q.jb_code,q.description,q.category,q.unit,q.packaged_per,q.price_per_unit,5,6,10,q.product_image_url,q.source_image_url,q.rack,q.x_axis,q.y_axis,q.position,q.available);
 if q.stock <> 5 or q.min_stock <> 6 or q.target_stock <> 10 then raise exception 'Desktop save failed'; end if;
 -- Older desktop versions must preserve the target on ordinary saves.
 q := public.binnenapp_save_product(q.id,q.updated_at,q.ean_code,q.jb_code,q.description,q.category,q.unit,q.packaged_per,q.price_per_unit,5,6,q.product_image_url,q.source_image_url,q.rack,q.x_axis,q.y_axis,q.position,q.available);
 if q.target_stock <> 10 then raise exception 'Legacy save lost target'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin
  perform public.binnenapp_set_stock_levels(p.id,6,10,6,10);
  raise exception 'Non-admin accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
select count(*) as products, count(*) filter(where target_stock=min_stock) as initialised,
 not has_function_privilege('anon','public.binnenapp_set_stock_levels(bigint,numeric,numeric,numeric,numeric)','execute') as anonymous_blocked
from public.products;
