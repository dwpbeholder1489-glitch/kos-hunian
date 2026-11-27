-- Uji Tahap I: konsolidasi (tautan kontak = bisnis sendiri, grup & persen kepemilikan, eliminasi otomatis & manual, akses & paket).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/konsolidasi.sql"
-- Skenario: Toko A (Pro, 100%) menjual beras ke Warung B (Bisnis, dimiliki 60%) 5 jt kasbon (modal 3 jt); B mencatat belanja dari A 5 jt utang.
-- Lulus = semua kolom t / angka sesuai nama kolom, NOTICE diawali OK. Penggabungan: node supabase/tests/konsolidasi_js.mjs
\set ON_ERROR_STOP off
\set A 'cdcdcdcd-0000-0000-0000-00000000000a'
\set B 'cdcdcdcd-0000-0000-0000-00000000000b'
\set C 'cdcdcdcd-0000-0000-0000-00000000000c'
\set O 'cdcdcdcd-0000-0000-0000-000000000001'
\set Y 'cdcdcdcd-0000-0000-0000-000000000009'
insert into auth.users(id,email) values (:'O','kons@x.com'), (:'Y','orang-lain@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'A','Toko A',:'O','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'B','Warung B',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'C','Toko Orang Lain',:'Y','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'A',:'O','pemilik'), (:'B',:'O','pemilik'), (:'C',:'Y','pemilik') on conflict do nothing;
insert into contacts(id,kos_id,kind,name) values ('cdcdcdcd-0000-0000-0000-0000000000c1',:'A','pelanggan','Warung B (milik sendiri)'),
  ('cdcdcdcd-0000-0000-0000-0000000000c2',:'B','supplier','Toko A (milik sendiri)'), ('cdcdcdcd-0000-0000-0000-0000000000c3',:'A','pelanggan','Bu Siti');
select (now() at time zone 'Asia/Jakarta')::date as today, date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm \gset
insert into sales(kos_id,number,sale_date,due_date,subtotal,total,cost_total,pay_method,status,contact_id) values
  (:'A','A1',:'cm',:'cm'::date + 30,5000000,5000000,3000000,'kasbon','selesai','cdcdcdcd-0000-0000-0000-0000000000c1'),
  (:'A','A2',:'cm',null,2000000,2000000,1000000,'tunai','selesai','cdcdcdcd-0000-0000-0000-0000000000c3');
insert into purchases(kos_id,number,purchase_date,total,pay_method,status,contact_id) values (:'B','B1',:'cm',5000000,'utang','selesai','cdcdcdcd-0000-0000-0000-0000000000c2');
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"cdcdcdcd-0000-0000-0000-000000000001","email":"kons@x.com"}', false);
\o

\echo == A. Tautkan kontak ke bisnis sendiri
select contact_link_business('cdcdcdcd-0000-0000-0000-0000000000c1', :'B') ->> 'related_name' a_tautan_ke_warung_b;
select contact_link_business('cdcdcdcd-0000-0000-0000-0000000000c2', :'A') ->> 'related_name' a_tautan_ke_toko_a;
do $$ begin perform contact_link_business('cdcdcdcd-0000-0000-0000-0000000000c3', 'cdcdcdcd-0000-0000-0000-00000000000c');
  raise notice 'GAGAL a: bisa menautkan ke bisnis orang lain';
exception when others then raise notice 'OK a: hanya bisnis sendiri'; end $$;
do $$ begin perform contact_link_business('cdcdcdcd-0000-0000-0000-0000000000c3', 'cdcdcdcd-0000-0000-0000-00000000000a');
  raise notice 'GAGAL a: bisa menautkan ke bisnis yang sama';
exception when others then raise notice 'OK a: tidak ke bisnis yang sama'; end $$;
select jsonb_array_length(my_finance_businesses()) a_dua_bisnis_saya;

\echo == B. Grup & laporan
do $$ begin perform consol_group_save(null, 'Grup', '[{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000a"},{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000c"}]');
  raise notice 'GAGAL b: bisnis orang lain bisa masuk grup';
exception when others then raise notice 'OK b: hanya bisnis sendiri'; end $$;
do $$ begin perform consol_group_save(null, 'Grup', '[{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000a"}]');
  raise notice 'GAGAL b: grup 1 bisnis diterima';
exception when others then raise notice 'OK b: minimal 2 bisnis'; end $$;
select consol_group_save(null, 'Grup Keluarga', '[{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000a","pct":100},{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000b","pct":60}]') ->> 'id' as g \gset
select jsonb_array_length(consol_groups_list() -> 0 -> 'members') b_dua_anggota, (consol_groups_list() -> 0 -> 'members' -> 1 ->> 'pct')::numeric b_pct_60;
select consol_report(:'g'::uuid, :'cm', :'today') as r \gset
select (:'r'::jsonb ->> 'aktif')::boolean b_aktif, jsonb_array_length(:'r'::jsonb -> 'members') b_2_bisnis,
       (:'r'::jsonb -> 'auto_sales' -> 0 ->> 'amount')::numeric b_jual_antarbisnis_5jt, :'r'::jsonb -> 'auto_sales' -> 0 ->> 'from' = :'A' b_dari_a,
       (:'r'::jsonb -> 'auto_arap' -> 0 ->> 'piutang')::numeric b_piutang_a_5jt, (:'r'::jsonb -> 'auto_arap' -> 0 ->> 'utang')::numeric b_utang_b_5jt,
       (:'r'::jsonb ->> 'contacts_linked')::int b_2_kontak;
select (:'r'::jsonb -> 'members' -> 0 -> 'fin' -> 'laba_rugi' ->> 'pendapatan_usaha')::numeric b_pendapatan_a_7jt;
-- periode lampau: piutang/utang terbuka (posisi hari ini) tidak dipakai
select (consol_report(:'g'::uuid, '2020-01-01', '2020-01-31') ->> 'arap_dilewati')::boolean b_lampau_dilewati;
\echo == C. Eliminasi manual
select consol_elim_add(:'g'::uuid, :'today', 'pinjaman', null, null, 2000000, 'Pinjaman A ke B untuk modal') ->> 'id' as e \gset
select (consol_report(:'g'::uuid, :'cm', :'today') -> 'manual' -> 0 ->> 'credit_class') c_pinjaman, (consol_report(:'g'::uuid, :'cm', :'today') -> 'manual' -> 0 ->> 'debit_class') c_aset_lancar_lain;
do $$ begin perform consol_elim_add((select id from consol_groups limit 1), current_date, 'lainnya', 'pendapatan_usaha', 'hpp', 1000, 'pasangan terbalik');
  raise notice 'GAGAL c: pasangan pos terbalik diterima';
exception when others then raise notice 'OK c: pasangan pos divalidasi'; end $$;
do $$ begin perform consol_elim_add((select id from consol_groups limit 1), current_date, 'jual_beli', null, null, 1000, 'x');
  raise notice 'GAGAL c: alasan pendek diterima';
exception when others then raise notice 'OK c: alasan wajib'; end $$;
select consol_elim_void(:'e'::uuid, 'salah catat')::text = '' c_batal;
select jsonb_array_length(consol_report(:'g'::uuid, :'cm', :'today') -> 'manual') c_tidak_dihitung_lagi_0;
\echo == D. Akses & paket
update kos set plan = 'bisnis' where id = :'A';
select (consol_report(:'g'::uuid, :'cm', :'today') ->> 'aktif')::boolean = false d_tanpa_pro_tidak_aktif;
update kos set plan = 'pro' where id = :'A';
\o /dev/null
select set_config('request.jwt.claim.sub', :'Y', false), set_config('request.jwt.claims', '{"sub":"cdcdcdcd-0000-0000-0000-000000000009"}', false);
\o
do $$ begin perform consol_report((select id from consol_groups limit 1), current_date - 30, current_date);
  raise notice 'GAGAL d: orang lain bisa membaca grup';
exception when others then raise notice 'OK d: grup milik akun'; end $$;
select jsonb_array_length(consol_groups_list()) = 0 d_orang_lain_tanpa_grup;
set role authenticated;
do $$ begin perform count(*) from consol_groups;
  raise notice 'GAGAL d: tabel terbaca langsung';
exception when others then raise notice 'OK d: tabel tidak terbaca langsung'; end $$;
reset role;

\echo == E. Bisnis dalam grup ditutup: grup tetap bisa diubah & dihapus (migrasi 20261128005000)
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"cdcdcdcd-0000-0000-0000-000000000001","email":"kons@x.com"}', false);
\o
update kos set closed_at = now() where id = :'B';
do $$ begin perform consol_group_save(null, 'Grup Tutup', '[{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000a"},{"kos_id":"cdcdcdcd-0000-0000-0000-00000000000b"}]');
  raise notice 'GAGAL e: bisnis tutup bisa ditambahkan ke grup baru';
exception when others then raise notice 'OK e: bisnis tutup tidak bisa ditambahkan'; end $$;
select consol_group_delete(:'g'::uuid)::text = '' e_grup_berisi_bisnis_tutup_bisa_dihapus;
update kos set closed_at = null where id = :'B';
