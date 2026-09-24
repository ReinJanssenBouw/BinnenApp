-- BinnenApp guurncfxhcxwvgnzoeyp: rollback-only checks after removal.
begin;
do $$
declare p public.products; q public.products; admin_id uuid;
begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='target_stock') then raise exception 'Column still exists'; end if;
 select user_id into admin_id from private.app_members where active and role='admin' limit 1;
 if admin_id is null then raise exception 'No admin'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select * into p from public.products order by id limit 1;
 q := public.binnenapp_set_min_stock(p.id,6,p.min_stock);
 if q.min_stock<>6 or q.stock<>p.stock then raise exception 'Stock changed'; end if;
 begin
  perform public.binnenapp_set_min_stock(p.id,-1,6);
  raise exception 'Invalid minimum accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.binnenapp_set_min_stock(p.id,7,5);
  raise exception 'Stale value accepted';
 exception when sqlstate '40001' then null; end;
 q := public.binnenapp_set_stock_levels(p.id,8,100,6,100);
 if q.min_stock<>8 then raise exception 'Legacy endpoint failed'; end if;
 q := public.binnenapp_save_product(q.id,q.updated_at,q.ean_code,q.jb_code,q.description,q.category,q.unit,q.packaged_per,q.price_per_unit,q.stock,6,q.product_image_url,q.source_image_url,q.rack,q.x_axis,q.y_axis,q.position,q.available);
 if q.min_stock<>6 then raise exception 'Desktop failed'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin
  perform public.binnenapp_set_min_stock(p.id,6,6);
  raise exception 'Non-admin accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select count(*) as products, not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='target_stock') as aanvulvoorraad_verwijderd from public.products;
