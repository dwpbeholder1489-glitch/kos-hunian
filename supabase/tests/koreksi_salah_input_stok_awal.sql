-- Run on a fresh test database. All changes roll back.
begin;
insert into auth.users(id,email) values ('bbbb0000-0000-0000-0000-000000000001', 'stok-koreksi@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type)
values ('bbbb0000-0000-0000-0000-000000000002','Uji Koreksi Stok','bbbb0000-0000-0000-0000-000000000001','pro',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('bbbb0000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
select set_config('request.jwt.claim.sub','bbbb0000-0000-0000-0000-000000000001',true);
do $$
declare
  k uuid := 'bbbb0000-0000-0000-0000-000000000002';
  d date := (now() at time zone 'Asia/Jakarta')::date;
  base_time timestamptz := d::timestamp at time zone 'Asia/Jakarta';
  p uuid; a uuid; o uuid; c uuid; amount numeric;
begin
  p := product_save(k, null, 'Indomie uji', 'pcs', 2900, 0, '[{"name":"pcs","price_retail":3500}]', 3500, null);
  update stock_moves set created_at = base_time where product_id = p and kind = 'awal' returning id into a;
  perform stock_adjust(p, 'opname', 57, null);
  update stock_moves set created_at = base_time + interval '1 minute' where product_id = p and kind = 'opname' returning id into o;
  perform sale_create(gen_random_uuid(),k,'ecer',jsonb_build_array(jsonb_build_object('product_id',p,'unit','pcs','qty',1)),0,'tunai');
  perform acct_sync_internal(k);
  if (retail_report(k,d,d)->>'selisih_stok')::numeric <> -9984700 then raise exception 'Nilai awal laporan salah'; end if;
  c := stock_correct_opening(a,o,57,'Salah ketik stok awal');
  if stock_correct_opening(a,o,57,'Salah ketik stok awal') <> c then raise exception 'Koreksi ganda'; end if;
  if (select stock from products where id=p) <> 56 then raise exception 'Stok fisik berubah'; end if;
  if (retail_report(k,d,d)->>'selisih_stok')::numeric <> 0 then raise exception 'Selisih salah input masih tercatat'; end if;
  select sum(l.debit-l.credit) into amount from acct_lines l join acct_accounts ac on ac.id=l.account_id
     where l.kos_id=k and ac.sys_key='saldo_awal';
  if amount is distinct from -165300::numeric then raise exception 'Saldo awal salah: %', amount; end if;
  perform stock_adjust(p, 'rusak', 1, 'Kerusakan fisik');
  if (retail_report(k,d,d)->>'selisih_stok')::numeric <> -2900 then raise exception 'Kerusakan fisik harus tetap masuk laporan'; end if;
end $$;
rollback;
