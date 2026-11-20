-- Uji Adaptive Business Experience v3.0 Tahap 1 (migrasi 20261121100000). Jalankan di database baru:
-- psql -p 5499 -h /var/tmp/pgtest -U postgres -d <db> -f supabase/tests/adaptive_experience.sql
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa *_GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('adadadad-0000-0000-0000-000000000001','pemilik@x.com'), ('adadadad-0000-0000-0000-000000000002','kasir@x.com'),
  ('adadadad-0000-0000-0000-000000000003','orang-lain@x.com') on conflict do nothing;
-- Lima profil wajib (§30 A) + pembanding kategori sama (§30 C) + lintas kategori (§30 D). Semua milik satu pemilik (§30 H).
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code,subcategory_code,template_code) values
  ('adadadad-0000-0000-0000-0000000000a1','Toko Sembako Subur','adadadad-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail','retail_sembako','toko'),
  ('adadadad-0000-0000-0000-0000000000a2','Kopi Prasara','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','kuliner','kuliner_coffee','kuliner'),
  ('adadadad-0000-0000-0000-0000000000a3','Laundry Bersih','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','laundry','laundry_laundry','laundry'),
  ('adadadad-0000-0000-0000-0000000000a4','Kos Hunian','adadadad-0000-0000-0000-000000000001','gratis',null,'active','properti','properti','properti_kos','kos'),
  ('adadadad-0000-0000-0000-0000000000a5','Proyek Rumah','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','konstruksi','konstruksi_kontraktor','bb_proyek'),
  ('adadadad-0000-0000-0000-0000000000c1','Butik Fashion','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail','retail_pakaian','toko'),
  ('adadadad-0000-0000-0000-0000000000c2','Toko Elektronik','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail','retail_elektronik','toko'),
  ('adadadad-0000-0000-0000-0000000000c3','Grosir Makmur','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail','retail_grosir','toko'),
  ('adadadad-0000-0000-0000-0000000000d1','Resto Padang','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','kuliner','kuliner_restoran','kuliner'),
  ('adadadad-0000-0000-0000-0000000000d2','Katering Ibu','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','kuliner','kuliner_katering','kuliner'),
  ('adadadad-0000-0000-0000-0000000000d3','Hotel Melati','adadadad-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti','hospitality','hospitality_hotel','kos');
insert into kos_members(kos_id,user_id,role) select id, 'adadadad-0000-0000-0000-000000000001', 'pemilik' from kos where owner_id = 'adadadad-0000-0000-0000-000000000001';
insert into kos_members(kos_id,user_id,role) values ('adadadad-0000-0000-0000-0000000000a1','adadadad-0000-0000-0000-000000000002','kasir');
update kos set trial_until = (now() at time zone 'Asia/Jakarta')::date - 1 where id = 'adadadad-0000-0000-0000-0000000000a4';  -- Gratis, masa coba habis
\set RET 'adadadad-0000-0000-0000-0000000000a1'
\set CAF 'adadadad-0000-0000-0000-0000000000a2'
\set LAU 'adadadad-0000-0000-0000-0000000000a3'
\set KOS 'adadadad-0000-0000-0000-0000000000a4'
\set PRJ 'adadadad-0000-0000-0000-0000000000a5'
set role authenticated;
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null

\echo == B. Klasifikasi universal
select count(*) >= 20 b_min_20_kategori from biz_categories where active;
select count(*) >= 150 b_subkategori_banyak from biz_subcategories where active;
select bool_and(cardinality(supported_models) > 0 and cardinality(default_revenue) > 0) b_semua_kategori_punya_dna from biz_categories where active;
-- setiap subkategori memakai template yang mesinnya cocok (tidak ada yang gagal saat dipilih di pendaftaran)
select count(*) = 0 b_template_subkategori_valid from biz_subcategories s join biz_categories c on c.code = s.category_code
  left join biz_templates t on t.code = coalesce(s.template, case when s.engine is not null and s.engine <> c.engine then null end, c.template)
  where t.code is null or t.engine <> coalesce(s.engine, c.engine);
select count(*) = 0 b_kode_vocab_kategori_valid from biz_categories c, unnest(c.supported_models || c.default_revenue || c.default_caps || c.default_channels) x
  where not exists (select 1 from biz_vocab v where v.code = x);

\echo == A. Lima bisnis berbeda → DNA, fitur relevan, rekomendasi berbeda
select (dna_get(:'RET')->'dna'->'models') ? 'retail' a_retail_model, (dna_get(:'CAF')->'dna'->'caps') ? 'uses_recipes' a_cafe_resep,
       (dna_get(:'LAU')->'dna'->'caps') ? 'uses_job_orders' a_laundry_order, (dna_get(:'KOS')->'dna'->'revenue') ? 'rental_income' a_kos_sewa,
       (dna_get(:'PRJ')->'dna'->'caps') ? 'uses_project_budget' a_proyek_rab;
select dna_get(:'RET')->>'source' = 'default' a_belum_disimpan_pakai_bawaan;
-- isi relevansi berbeda per bisnis (daftar modul relevan tidak sama)
with r as (select k, (select string_agg(x->>'code', ',' order by x->>'code') from jsonb_array_elements(feature_relevance(k)->'modules') x where x->>'relevance' in ('highly','essential')) s
           from unnest(array[:'RET'::uuid, :'CAF'::uuid, :'LAU'::uuid, :'KOS'::uuid, :'PRJ'::uuid]) k)
select count(distinct s) = 5 a_fitur_relevan_berbeda_5_bisnis from r;
select (select x->>'relevance' from jsonb_array_elements(feature_relevance(:'CAF')->'modules') x where x->>'code' = 'j_resep') = 'highly' a_cafe_resep_sangat_relevan,
       (select x->>'relevance' from jsonb_array_elements(feature_relevance(:'LAU')->'modules') x where x->>'code' = 'j_resep') <> 'highly' a_laundry_resep_tidak;
select (select (x->'rules') ? 'FNB_INGREDIENTS' from jsonb_array_elements(feature_relevance(:'CAF')->'modules') x where x->>'code' = 'j_bahan') a_alasan_tercatat;
-- skor dihitung dari 6 komponen dengan bobot tertulis
select (select (x->>'score')::int = round(0.20*(x->'breakdown'->>'category')::int + 0.25*(x->'breakdown'->>'operational')::int + 0.20*(x->'breakdown'->>'model')::int
          + 0.10*(x->'breakdown'->>'scale')::int + 0.10*(x->'breakdown'->>'owner')::int + 0.15*(x->'breakdown'->>'workflow')::int)
        from jsonb_array_elements(feature_relevance(:'RET')->'modules') x where x->>'code' = 'r_belanja') a_rumus_skor;

\echo == C. Kategori sama, DNA berbeda (sembako / fashion / elektronik / grosir)
select (dna_get('adadadad-0000-0000-0000-0000000000c1')->'dna'->'caps') ? 'uses_variants' c_fashion_varian,
       not ((dna_get(:'RET')->'dna'->'caps') ? 'uses_variants') c_sembako_tanpa_varian,
       (dna_get('adadadad-0000-0000-0000-0000000000c2')->'dna'->'caps') ? 'uses_maintenance' c_elektronik_servis,
       (dna_get('adadadad-0000-0000-0000-0000000000c3')->'dna'->'models') ? 'wholesale' c_grosir_b2b;
select (select x->>'relevance' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000c3')->'modules') x where x->>'code' = 'u_penawaran') = 'highly' c_grosir_penawaran_relevan,
       (select x->>'relevance' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000c1')->'modules') x where x->>'code' = 'u_penawaran') <> 'highly' c_fashion_penawaran_tidak,
       (select (x->'rules') ? 'BARCODE' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000c1')->'modules') x where x->>'code' = 'r_label') c_fashion_label_barcode;

\echo == D. Kemampuan sama lintas kategori memakai mesin bersama
select (select x->>'relevance' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000d1')->'modules') x where x->>'code' = 'j_bahan') = 'highly'
   and (select x->>'relevance' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000d2')->'modules') x where x->>'code' = 'j_bahan') = 'highly' d_resto_katering_bahan;
select (select x->>'relevance' from jsonb_array_elements(feature_relevance('adadadad-0000-0000-0000-0000000000d3')->'modules') x where x->>'code' = 'p_booking') = 'highly'
   and (select x->>'relevance' from jsonb_array_elements(feature_relevance(:'KOS')->'modules') x where x->>'code' = 'p_booking') = 'highly' d_hotel_kos_booking;

\echo == E. Simpan DNA: validasi, versi, riwayat, model berbeda dari kategori, beberapa aktivitas
do $$ begin perform dna_save('adadadad-0000-0000-0000-0000000000a1', '{"models":["nonsense"],"revenue":["one_time"],"scale":"mikro"}');
  raise notice 'e_GAGAL: kode tidak dikenal diterima'; exception when others then raise notice 'e_OK: %', sqlerrm; end $$;
do $$ begin perform dna_save('adadadad-0000-0000-0000-0000000000a1', '{"models":[],"revenue":["one_time"],"scale":"mikro"}');
  raise notice 'e_GAGAL: tanpa model diterima'; exception when others then raise notice 'e_OK: %', sqlerrm; end $$;
do $$ begin perform dna_save('adadadad-0000-0000-0000-0000000000a1', '{"models":["retail"],"revenue":["one_time"],"scale":"mikro","identity":{"secondary_category":"retail"}}');
  raise notice 'e_GAGAL: kategori kedua sama diterima'; exception when others then raise notice 'e_OK: %', sqlerrm; end $$;
select dna_save(:'RET', '{"identity":{"secondary_category":"kuliner","ownership":"keluarga","custom_label":"Toko & warung kopi"},"models":["retail","wholesale","food_beverage"],
  "revenue":["one_time"],"caps":["uses_inventory","uses_suppliers","uses_customer_debt","uses_barcode"],"scale":"kecil",
  "indicators":{"employees":"2","outlets":"1","omzet":"r10_50"},"channels":["physical_store","whatsapp"]}', 'uji') ->> 'version' = '1' e_versi_1;
select (dna_get(:'RET')->'dna'->'models') ? 'food_beverage' e_model_beda_dari_kategori, dna_get(:'RET')->'dna'->'identity'->>'secondary_category' = 'kuliner' e_aktivitas_kedua,
       (dna_get(:'RET')->'dna'->'indicators'->>'employees')::int = 2 e_angka_jadi_bilangan;
select count(*) = 1 e_riwayat_dna from config_history where kos_id = :'RET' and action = 'ubah_dna';
-- menyimpan profil yang sama tidak membuat versi baru
select dna_save(:'RET', dna_get(:'RET')->'dna') ->> 'version' = '1' e_sama_tidak_naik_versi;

\echo == F. Rekomendasi: tidak mengaktifkan otomatis, alasan, tolak tidak berulang, terima lewat module_set
-- bisnis baru: semua modul opsional aktif bawaan → matikan dulu agar bisa direkomendasikan
select module_set(:'RET', 'u_penawaran', false, 'uji nonaktif') = 'diterapkan' f_nonaktif_dulu;
reset role;
select reco_refresh(:'RET', 'UJI') >= 0 \g /dev/null
set role authenticated;
select count(*) > 0 f_ada_rekomendasi, bool_and(length(reason) > 5) f_semua_beralasan from feature_recommendations where kos_id = :'RET' and status = 'recommended';
select not module_on(:'RET', 'u_penawaran') f_tidak_aktif_otomatis, exists (select 1 from feature_recommendations where kos_id = :'RET' and module_code = 'u_penawaran' and status = 'recommended') f_penawaran_direkomendasikan;
select id as rpen from feature_recommendations where kos_id = :'RET' and module_code = 'u_penawaran' and status = 'recommended' \gset
select reco_decide(:'RET', :'rpen', 'terima') ->> 'status' = 'activated' f_terima_aktif;
select module_on(:'RET', 'u_penawaran') f_modul_aktif;
-- tolak → tidak muncul lagi selama alasannya sama
select module_set(:'RET', 'r_label', false, 'uji') = 'diterapkan' \g /dev/null
reset role;
select reco_refresh(:'RET', 'UJI') >= 0 \g /dev/null
set role authenticated;
select id as rlab from feature_recommendations where kos_id = :'RET' and module_code = 'r_label' and status = 'recommended' \gset
select reco_decide(:'RET', :'rlab', 'tolak', 'belum perlu') ->> 'status' = 'rejected' f_tolak;
reset role;
select reco_refresh(:'RET', 'UJI') >= 0 \g /dev/null
set role authenticated;
select not exists (select 1 from feature_recommendations where kos_id = :'RET' and module_code = 'r_label' and status = 'recommended') f_ditolak_tidak_berulang;
-- alasan berubah (barang ≥100) → boleh direkomendasikan lagi
reset role;
insert into products(kos_id, name, base_unit, cost, stock, active) select :'RET', 'Barang ' || g, 'pcs', 1000, 0, true from generate_series(1, 100) g;
select reco_refresh(:'RET', 'INVENTORY_USAGE_DETECTED') >= 1 f_refresh_ada_baru;
set role authenticated;
select exists (select 1 from feature_recommendations where kos_id = :'RET' and module_code = 'r_label' and status = 'recommended' and 'INVENTORY_GROWTH' = any(rules)) f_alasan_baru_muncul_lagi;
-- tunda
select id as rtun from feature_recommendations where kos_id = :'RET' and module_code = 'r_label' and status = 'recommended' \gset
select reco_decide(:'RET', :'rtun', 'tunda', null, 7) ->> 'status' = 'deferred' f_tunda, (select defer_until from feature_recommendations where id = :'rtun') > current_date f_tanggal_tunda;

\echo == J. Paket & izin: rekomendasi tidak memberi akses
-- Kos paket Gratis: pengingat email (fitur berbayar) tetap terkunci walau direkomendasikan
select module_set(:'KOS', 'p_pengingat', false, 'uji paket') = 'diterapkan' \g /dev/null
select (select x->>'relevance' from jsonb_array_elements(feature_relevance(:'KOS')->'modules') x where x->>'code' = 'p_pengingat') = 'restricted' j_berbayar_terkunci;
select dna_save(:'KOS', dna_get(:'KOS')->'dna', 'simpan') is not null \g /dev/null
select id as rpg from feature_recommendations where kos_id = :'KOS' and module_code = 'p_pengingat' and status = 'recommended' \gset
select reco_decide(:'KOS', :'rpg', 'terima') ->> 'status' = 'accepted' j_diterima_belum_aktif;
select not module_on(:'KOS', 'p_pengingat') j_tidak_aktif_tanpa_paket;
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
do $$ begin perform dna_save('adadadad-0000-0000-0000-0000000000a1', '{"models":["retail"],"revenue":["one_time"],"scale":"mikro"}');
  raise notice 'j_GAGAL: kasir mengubah DNA'; exception when others then raise notice 'j_OK: %', sqlerrm; end $$;
do $$ begin perform experience_save('adadadad-0000-0000-0000-0000000000a1', 'nav', '{"hidden":["/kasir"]}');
  raise notice 'j_GAGAL: kasir mengubah navigasi'; exception when others then raise notice 'j_OK: %', sqlerrm; end $$;
do $$ begin perform feature_relevance('adadadad-0000-0000-0000-0000000000a1');
  raise notice 'j_GAGAL: kasir membaca katalog fitur'; exception when others then raise notice 'j_OK: %', sqlerrm; end $$;
select count(*) = 0 j_kasir_tidak_lihat_rekomendasi from feature_recommendations where kos_id = :'RET';
select (my_experience() ? :'RET') j_kasir_boleh_baca_tampilan, not (my_experience() ? :'CAF') j_tidak_bocor_ke_bisnis_lain;
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000003","email":"orang-lain@x.com"}', false) \g /dev/null
do $$ begin perform dna_get('adadadad-0000-0000-0000-0000000000a1');
  raise notice 'j_GAGAL: orang lain membaca DNA'; exception when others then raise notice 'j_OK: %', sqlerrm; end $$;
select count(*) = 0 j_isolasi_profil from business_profiles; select count(*) = 0 j_isolasi_konfigurasi from experience_configs;
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null

\echo == I. Lifecycle: cabang & karyawan bertambah → dievaluasi (tanpa aktivasi otomatis)
select module_set(:'LAU', 'u_karyawan', false, 'uji') = 'diterapkan' \g /dev/null
reset role;
insert into staff(kos_id, name) values (:'LAU', 'Rina'), (:'LAU', 'Dodi'), (:'LAU', 'Sari');
insert into branches(kos_id, name, kind) values (:'LAU', 'Cabang Cigasong', 'cabang');
set role authenticated;
select exists (select 1 from feature_recommendations where kos_id = :'LAU' and module_code = 'u_karyawan' and status = 'recommended' and 'STAFF' = any(rules)) i_karyawan_dievaluasi,
       not module_on(:'LAU', 'u_karyawan') i_tidak_aktif_otomatis;
select (feature_relevance(:'LAU')->'signals'->>'outlets')::int = 2 i_cabang_terhitung;
select (feature_relevance(:'LAU')->>'stage') = 'expansion' i_tahap_ekspansi;
select (experience_overview(:'LAU')->>'stage') = 'expansion' i_overview;
select exists (select 1 from config_history where kos_id = :'LAU' and action = 'tahap_bisnis') i_tahap_tercatat;
-- trigger lifecycle tidak pernah menggagalkan transaksi utama (bisnis ditutup → evaluasi dilewati, insert tetap jalan)
reset role;
update kos set closed_at = now() where id = :'KOS';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
insert into branches(kos_id, name, kind) values (:'KOS', 'Gudang', 'gudang');
select count(*) = 1 i_insert_tetap_jalan from branches where kos_id = :'KOS' and name = 'Gudang';
update kos set closed_at = null where id = :'KOS';
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000001', false) \g /dev/null
set role authenticated;

\echo == M. Konfigurasi tampilan: validasi, versi, pulihkan, reset
do $$ begin perform experience_save('adadadad-0000-0000-0000-0000000000a1', 'nav', '{"hidden":["javascript:alert(1)"]}');
  raise notice 'm_GAGAL: path tidak valid diterima'; exception when others then raise notice 'm_OK: %', sqlerrm; end $$;
do $$ begin perform experience_save('adadadad-0000-0000-0000-0000000000a1', 'quick', '{"fav":["a","b","c","d","e","f","g"]}');
  raise notice 'm_GAGAL: favorit > 6 diterima'; exception when others then raise notice 'm_OK: %', sqlerrm; end $$;
do $$ begin perform experience_save('adadadad-0000-0000-0000-0000000000a1', 'dash', '{"admin":{"hidden":[]}}');
  raise notice 'm_GAGAL: dashboard tak dikenal diterima'; exception when others then raise notice 'm_OK: %', sqlerrm; end $$;
select experience_save(:'RET', 'nav', '{"main":"/penjualan","hidden":["/komisi","/komisi"],"pins":["/kasir"],"order":["sales","inv"]}') ->> 'version' = '1' m_v1;
select (select nav->'hidden' from experience_configs where kos_id = :'RET') = '["/komisi"]' m_duplikat_dibuang;
select experience_save(:'RET', 'nav', '{"main":"/kasir","hidden":[],"pins":[]}') ->> 'version' = '2' m_v2;
select experience_save(:'RET', 'quick', '{"order":["pos","purchase"],"fav":["pos"],"hidden":["income"]}') ->> 'version' = '3' m_v3_quick;
select experience_save(:'RET', 'dash', '{"toko":{"hidden":["mulai"],"order":["kpi","tren"]}}') ->> 'version' = '4' m_v4_dash;
select id as hnav from config_history where kos_id = :'RET' and action = 'ubah_tampilan' and target = 'nav' order by id desc limit 1 \gset
select experience_restore(:'RET', :'hnav') ->> 'changed' = 'true' m_pulihkan;
select nav->>'main' = '/penjualan' m_kembali_ke_sebelumnya, version = 5 m_pulihkan_versi_baru from experience_configs where kos_id = :'RET';
select experience_reset(:'RET', 'quick') ->> 'changed' = 'true' m_reset;
select quick = '{}' m_kosong_bawaan from experience_configs where kos_id = :'RET';
select jsonb_array_length(experience_history(:'RET')) >= 6 m_riwayat_lengkap;
select (my_experience()->:'RET'->'cfg'->'dash'->'toko'->'hidden') ? 'mulai' m_dibaca_provider;
-- pulihkan DNA
select id as hdna from config_history where kos_id = :'RET' and action = 'ubah_dna' order by id desc limit 1 \gset
select dna_save(:'RET', jsonb_set(dna_get(:'RET')->'dna', '{scale}', '"menengah"'), 'naik skala') ->> 'version' = '2' m_dna_v2;
select id as hdna2 from config_history where kos_id = :'RET' and action = 'ubah_dna' order by id desc limit 1 \gset
select experience_restore(:'RET', :'hdna2') -> 'dna' ->> 'scale' = 'kecil' m_dna_dipulihkan;

\echo == O. Onboarding: DNA boleh diisi saat bisnis masih draf
select setup_create('{"name":"Hotel Baru","category":"hospitality","subcategory":"hospitality_villa","relation":"pemilik","stage":"baru"}') as hb \gset
select setup_status <> 'active' o_draf, business_type = 'properti' o_mesin_properti from kos where id = :'hb';
select dna_save(:'hb', '{"models":["hospitality","rental"],"revenue":["rental_income"],"caps":["uses_booking","uses_maintenance"],"scale":"mikro","channels":["marketplace"]}', null, 'onboarding') ->> 'source' = 'onboarding' o_dna_onboarding;
select (select x->>'relevance' from jsonb_array_elements(feature_relevance(:'hb')->'modules') x where x->>'code' = 'p_booking') = 'highly' o_relevansi_draf;
select setup_create('{"name":"Rental Tenda","category":"rental","subcategory":"rental_pesta","relation":"pemilik","stage":"berjalan"}') is not null o_kategori_baru_bisa_dipilih;
select setup_create('{"name":"Seller Online","category":"ecommerce","subcategory":"ecommerce_marketplace","relation":"pemilik","stage":"berjalan"}') is not null o_ecommerce_bisa;

\echo == K. Integritas: modul yang dinonaktifkan tidak menghapus data
select count(*) = 100 k_data_tetap from products where kos_id = :'RET';
reset role;
