-- Uji Tahap F: daftar risiko (buat, ubah, tinjau, perkembangan PIC, saran diabaikan, akses & paket).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/daftar_risiko.sql"
-- Lulus = semua kolom t / angka sesuai nama kolom, semua NOTICE diawali OK (tanpa GAGAL). Saran & tingkat: node supabase/tests/daftar_risiko_js.mjs
\set ON_ERROR_STOP off
\set K 'babababa-0000-0000-0000-00000000000a'
\set D 'babababa-0000-0000-0000-00000000000d'
\set O 'babababa-0000-0000-0000-000000000001'
\set M 'babababa-0000-0000-0000-000000000002'
\set X 'babababa-0000-0000-0000-000000000003'
\set Y 'babababa-0000-0000-0000-000000000004'
insert into auth.users(id,email,raw_user_meta_data) values (:'O','own-r@x.com','{"name":"Dewo"}'), (:'M','kelola-r@x.com','{}'), (:'X','kasir-r@x.com','{"name":"Sari"}'), (:'Y','luar-r@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Risiko',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'D','Toko Dasar Risiko',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'K',:'M','pengelola'), (:'K',:'X','kasir'), (:'D',:'O','pemilik') on conflict do nothing;
-- kasbon lewat jatuh tempo (sinyal piutang)
insert into contacts(id,kos_id,kind,name) values ('babababa-0000-0000-0000-0000000000c1',:'K','pelanggan','Bu Ani');
insert into sales(kos_id,number,sale_date,due_date,subtotal,total,cost_total,pay_method,status,contact_id) values
  (:'K','R1',(now() at time zone 'Asia/Jakarta')::date - 40,(now() at time zone 'Asia/Jakarta')::date - 10,750000,750000,0,'kasbon','selesai','babababa-0000-0000-0000-0000000000c1');
\o /dev/null
select set_config('request.jwt.claim.sub', :'M', false), set_config('request.jwt.claims', '{"sub":"babababa-0000-0000-0000-000000000002","email":"kelola-r@x.com"}', false);
\o

\echo == A. Pengelola membuat risiko
select risk_save(:'K', 'babababa-0000-0000-0000-0000000000e1', jsonb_build_object('title','Pemasok utama berhenti','category','operasional','likelihood',3,'impact',4,
  'strategy','kurangi','mitigation','Cari 2 pemasok cadangan','owner_user',:'X','review_days',30)) as r1 \gset
select :'r1'::jsonb ->> 'number' like 'RSK-%-001' a_nomor, (:'r1'::jsonb ->> 'score')::int a_skor_12, :'r1'::jsonb ->> 'owner_label' a_pic_sari,
       (:'r1'::jsonb ->> 'next_review')::date = (now() at time zone 'Asia/Jakarta')::date + 30 a_tinjau_30_hari, :'r1'::jsonb ->> 'status' a_status;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', null, '{"title":"x","likelihood":3,"impact":3}');
  raise notice 'GAGAL a: judul pendek diterima';
exception when others then raise notice 'OK a: judul minimal 3 huruf'; end $$;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', null, '{"title":"Banjir","likelihood":6,"impact":3}');
  raise notice 'GAGAL a: kemungkinan 6 diterima';
exception when others then raise notice 'OK a: skala 1–5'; end $$;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', null, jsonb_build_object('title','Banjir','likelihood',2,'impact',3,'owner_user','babababa-0000-0000-0000-000000000004'));
  raise notice 'GAGAL a: PIC bukan anggota diterima';
exception when others then raise notice 'OK a: PIC harus anggota'; end $$;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', null, '{"title":"Banjir","likelihood":2,"impact":3,"res_likelihood":1}');
  raise notice 'GAGAL a: risiko sisa setengah diterima';
exception when others then raise notice 'OK a: risiko sisa harus lengkap'; end $$;
select count(*) = 1 a_riwayat from config_history where kos_id = :'K' and action = 'buat_risiko';

\echo == B. Ubah, tinjau, saran diterima
select risk_save(:'K', 'babababa-0000-0000-0000-0000000000e1', jsonb_build_object('title','Pemasok utama berhenti','category','operasional','likelihood',4,'impact',4,
  'strategy','kurangi','mitigation','Cari 2 pemasok cadangan','owner_user',:'X','review_days',14,'res_likelihood',2,'res_impact',3)) as r2 \gset
select (:'r2'::jsonb ->> 'score')::int b_skor_16, (:'r2'::jsonb ->> 'res_score')::int b_sisa_6, :'r2'::jsonb -> 'log' -> -1 ->> 'skor' b_log_skor_16,
       (:'r2'::jsonb ->> 'next_review')::date = (now() at time zone 'Asia/Jakarta')::date + 14 b_jadwal_ikut_berubah;
select (risk_review(:'K', 'babababa-0000-0000-0000-0000000000e1', 3, 4, 'Sudah ada 1 cadangan') ->> 'score')::int b_tinjau_skor_12;
select last_review = (now() at time zone 'Asia/Jakarta')::date b_tanggal_tinjau, log -> -1 ->> 'skor_lama' = '16' b_skor_lama from risks where id = 'babababa-0000-0000-0000-0000000000e1';
select risk_save(:'K', null, '{"title":"Kas tidak cukup untuk biaya sebulan","category":"keuangan","likelihood":4,"impact":4,"source":"saran:kas_tipis"}') ->> 'source' b_dari_saran;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', null, '{"title":"Aneh","likelihood":2,"impact":2,"source":"saran:Kas Tipis!"}');
  raise notice 'GAGAL b: kode saran sembarang diterima';
exception when others then raise notice 'OK b: kode sumber divalidasi'; end $$;
select risk_dismiss(:'K', 'piutang_lewat', 90)::text = '' b_abaikan;
select risk_list(:'K') -> 'dismissed' ? 'piutang_lewat' b_terabaikan, jsonb_array_length(risk_list(:'K') -> 'risks') b_dua_risiko;
select (risk_signals(:'K') ->> 'piutang_lewat')::numeric b_piutang_lewat_750rb, (risk_signals(:'K') ->> 'piutang_lewat_n')::int b_satu_faktur;

\echo == C. PIC (kasir) melihat & memperbarui risiko miliknya saja
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"babababa-0000-0000-0000-000000000003","email":"kasir-r@x.com"}', false);
\o
select (risk_list(:'K') ->> 'manager')::boolean = false c_bukan_pengelola, jsonb_array_length(risk_list(:'K') -> 'risks') c_hanya_1_miliknya,
       risk_list(:'K') -> 'members' is null or jsonb_typeof(risk_list(:'K') -> 'members') = 'null' c_tanpa_daftar_anggota;
select risk_progress(:'K', 'babababa-0000-0000-0000-0000000000e1', 'ditangani', 'Sudah hubungi CV Maju') ->> 'status' c_ditangani;
do $$ begin perform risk_progress('babababa-0000-0000-0000-00000000000a', 'babababa-0000-0000-0000-0000000000e1', 'ditutup', 'beres');
  raise notice 'GAGAL c: PIC bisa menutup';
exception when others then raise notice 'OK c: PIC tidak bisa menutup'; end $$;
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000a', 'babababa-0000-0000-0000-0000000000e1', '{"title":"Diubah kasir","likelihood":1,"impact":1}');
  raise notice 'GAGAL c: PIC bisa mengubah nilai risiko';
exception when others then raise notice 'OK c: PIC tidak bisa mengubah nilai'; end $$;
select (my_access() -> 'babababa-0000-0000-0000-00000000000a' ->> 'risks')::int c_menu_pic_1;
do $$ declare v uuid; begin select id into v from risks where source = 'saran:kas_tipis';
  perform risk_progress('babababa-0000-0000-0000-00000000000a', v, 'ditangani', 'coba');
  raise notice 'GAGAL c: kasir bisa mengubah risiko orang lain';
exception when others then raise notice 'OK c: risiko orang lain tertutup'; end $$;

\echo == D. Tutup oleh pengelola, akses luar, paket, tabel langsung
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"babababa-0000-0000-0000-000000000001","email":"own-r@x.com"}', false);
\o
select risk_progress(:'K', 'babababa-0000-0000-0000-0000000000e1', 'ditutup', 'Ada 2 pemasok cadangan') ->> 'status' d_ditutup;
select closed_at is not null d_tanggal_tutup from risks where id = 'babababa-0000-0000-0000-0000000000e1';
select (my_access() -> 'babababa-0000-0000-0000-00000000000a') is null d_pemilik_tidak_perlu;
select count(*) = 1 d_riwayat_tutup from config_history where kos_id = :'K' and action = 'tutup_risiko';
do $$ begin perform risk_save('babababa-0000-0000-0000-00000000000d', null, '{"title":"Banjir","likelihood":2,"impact":3}');
  raise notice 'GAGAL d: Paket Dasar bisa mencatat';
exception when others then raise notice 'OK d: Paket Dasar ditolak (%)', left(sqlerrm, 30); end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'Y', false), set_config('request.jwt.claims', '{"sub":"babababa-0000-0000-0000-000000000004"}', false);
\o
do $$ begin perform risk_list('babababa-0000-0000-0000-00000000000a');
  raise notice 'GAGAL d: orang luar bisa membaca';
exception when others then raise notice 'OK d: orang luar ditolak'; end $$;
set role authenticated;
do $$ begin perform count(*) from risks;
  raise notice 'GAGAL d: tabel bisa dibaca langsung';
exception when others then raise notice 'OK d: tabel tidak bisa dibaca langsung'; end $$;
reset role;
