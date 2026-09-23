begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
values ('1eb3f4c1-9606-43ec-8ea3-d72ba92ecc10','binnenapp-test@example.invalid','{"display_name":"BinnenApp controle"}',now());
update private.app_members set active=true,role='admin' where user_id='1eb3f4c1-9606-43ec-8ea3-d72ba92ecc10';
select set_config('request.jwt.claims','{"sub":"1eb3f4c1-9606-43ec-8ea3-d72ba92ecc10","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','1eb3f4c1-9606-43ec-8ea3-d72ba92ecc10',true);
set local role authenticated;
do $$
declare artikel public.products%rowtype; aantal integer; bestelling jsonb;
begin
  select * into artikel from public.products where available and packaged_per>=1 order by id limit 1;
  if artikel.id is null then raise exception 'Geen artikelen zichtbaar voor lid'; end if;
  perform public.binnenapp_set_product_stock(artikel.id,10,0);
  select count(*) into aantal from public.products where id=artikel.id and stock=10;
  if aantal<>1 then raise exception 'Voorraadcontrole mislukt'; end if;
  perform public.binnenapp_sync_cart(jsonb_build_array(jsonb_build_object('product_id',artikel.id,'quantity',artikel.packaged_per::integer)));
  bestelling:=public.binnenapp_place_order('#ORD-BINNENAPP-TEST','BinnenApp controle','binnenapp-test@example.invalid','Binnenploeg','CONTROLE',current_date+1);
  if not exists(select 1 from public.orders where order_number='#ORD-BINNENAPP-TEST') then raise exception 'Bestelling ontbreekt'; end if;
  if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where o.order_number='#ORD-BINNENAPP-TEST' and i.quantity=artikel.packaged_per) then raise exception 'Orderregels ontbreken'; end if;
  perform public.binnenapp_update_expected_delivery_date('#ORD-BINNENAPP-TEST',current_date+2,null);
  perform public.binnenapp_add_retour_item('#ORD-BINNENAPP-TEST',artikel.description,artikel.ean_code,artikel.jb_code,1,artikel.unit,artikel.product_image_url);
  if not exists(select 1 from public.retour_items where order_number='#ORD-BINNENAPP-TEST') then raise exception 'Retour ontbreekt'; end if;
  perform public.binnenapp_order_mail_status('#ORD-BINNENAPP-TEST');
  perform public.binnenapp_order_pdf_kopie_status('#ORD-BINNENAPP-TEST');
end $$;
reset role;
update private.app_members set active=false where user_id='1eb3f4c1-9606-43ec-8ea3-d72ba92ecc10';
set local role authenticated;
do $$
begin
  if exists(select 1 from public.products) then raise exception 'Niet-actief lid kan artikelen lezen'; end if;
  begin
    perform public.binnenapp_sync_cart('[]'::jsonb);
    raise exception 'Niet-actief lid kan schrijven' using errcode='P9999';
  exception when others then
    if sqlstate='P9999' then raise; end if;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  if has_table_privilege(current_user,'public.products','SELECT') then raise exception 'Anonieme tabeltoegang'; end if;
  if has_function_privilege(current_user,'public.binnenapp_sync_cart(jsonb)','EXECUTE') then raise exception 'Anonieme schrijftoegang'; end if;
end $$;
reset role;
select 'GESLAAGD: voorraad, winkelwagen, bestelling, orderregels, leverdatum, retour, status en toegangscontrole; alles wordt teruggedraaid.' as controle;
rollback;
