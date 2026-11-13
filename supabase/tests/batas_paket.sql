-- Uji batas paket V2 (produk, pelanggan/supplier, cabang, ekspor), kuota, "Upgrade Berhasil!", dan penawaran cabang.
-- Jalankan: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/batas_paket.sql"
-- Batas diperkecil HANYA di database uji agar skenario cepat.
\set ON_ERROR_STOP off
update plan_versions v set limits = v.limits || '{"produk": 2, "pelanggan": 2, "supplier": 1, "ekspor_bulan": 2}'::jsonb
where v.plan_key = 'dasar' and v.id = (plan_current('dasar')).id;

insert into auth.users(id,email) values
  ('71717171-0000-0000-0000-000000000001','batas-owner@x.com'),
  ('71717171-0000-0000-0000-000000000002','batas-staf@x.com')
on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('71717171-0000-0000-0000-00000000aaaa','Toko Batas','71717171-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('71717171-0000-0000-0000-00000000bbbb','Toko Gratis Batas','71717171-0000-0000-0000-000000000001','gratis',null,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('71717171-0000-0000-0000-00000000aaaa','71717171-0000-0000-0000-000000000001','pemilik'),
  ('71717171-0000-0000-0000-00000000bbbb','71717171-0000-0000-0000-000000000001','pemilik'),
  ('71717171-0000-0000-0000-00000000aaaa','71717171-0000-0000-0000-000000000002','kasir')
on conflict do nothing;
\set K '71717171-0000-0000-0000-00000000aaaa'
\set KG '71717171-0000-0000-0000-00000000bbbb'
\set U '71717171-0000-0000-0000-000000000001'
\set S '71717171-0000-0000-0000-000000000002'

-- Sebagai pemilik (auth.uid terisi); peran superuser agar RLS tidak ikut diuji di sini
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"71717171-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Produk: batas 2 aktif -> yang ke-3 ditolak; nonaktif boleh; aktif lagi ditolak; sistem tidak dibatasi
insert into products(kos_id,name) values (:'K','P1'),(:'K','P2');
do $$ begin
  begin insert into products(kos_id,name) values ('71717171-0000-0000-0000-00000000aaaa','P3'); raise exception 'A_GAGAL: produk ke-3 diterima';
  exception when others then if sqlerrm like 'A_GAGAL%' then raise; end if; raise notice 'a_OK: produk ke-3 ditolak (%)', sqlerrm; end;
end $$;
insert into products(kos_id,name,active) values (:'K','P-nonaktif',false);
do $$ begin
  begin update products set active = true where kos_id = '71717171-0000-0000-0000-00000000aaaa' and name = 'P-nonaktif'; raise exception 'A_GAGAL: aktif lagi diterima';
  exception when others then if sqlerrm like 'A_GAGAL%' then raise; end if; raise notice 'a_OK: mengaktifkan lagi ditolak (%)', sqlerrm; end;
end $$;
update products set name = 'P1 ganti nama' where kos_id = :'K' and name = 'P1';
select count(*) = 1 as a_ubah_data_lama_boleh from products where kos_id = :'K' and name = 'P1 ganti nama';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
insert into products(kos_id,name) values (:'K','P-sistem');
select count(*) = 1 as a_sistem_tidak_dibatasi from products where kos_id = :'K' and name = 'P-sistem';
select set_config('request.jwt.claim.sub', :'U', false) \g /dev/null

\echo == B. Kontak: pelanggan batas 2, supplier batas 1; arsip lalu pulihkan dicek
insert into contacts(kos_id,kind,name) values (:'K','pelanggan','C1'),(:'K','pelanggan','C2'),(:'K','supplier','S1');
do $$ begin
  begin insert into contacts(kos_id,kind,name) values ('71717171-0000-0000-0000-00000000aaaa','pelanggan','C3'); raise exception 'B_GAGAL';
  exception when others then if sqlerrm like 'B_GAGAL%' then raise; end if; raise notice 'b_OK: pelanggan ke-3 ditolak (%)', sqlerrm; end;
  begin insert into contacts(kos_id,kind,name) values ('71717171-0000-0000-0000-00000000aaaa','supplier','S2'); raise exception 'B_GAGAL';
  exception when others then if sqlerrm like 'B_GAGAL%' then raise; end if; raise notice 'b_OK: supplier ke-2 ditolak'; end;
end $$;
update contacts set archived_at = now() where kos_id = :'K' and name = 'C2';
insert into contacts(kos_id,kind,name) values (:'K','pelanggan','C3');
do $$ begin
  begin update contacts set archived_at = null where kos_id = '71717171-0000-0000-0000-00000000aaaa' and name = 'C2'; raise exception 'B_GAGAL';
  exception when others then if sqlerrm like 'B_GAGAL%' then raise; end if; raise notice 'b_OK: memulihkan arsip saat penuh ditolak'; end;
end $$;

\echo == C. Cabang: Dasar 1 (lokasi utama) -> cabang baru ditolak, gudang boleh; Bisnis 3
select count(*) = 1 as c_lokasi_utama_ada from branches where kos_id = :'K' and is_main;
do $$ begin
  begin insert into branches(kos_id,name,kind) values ('71717171-0000-0000-0000-00000000aaaa','Cabang 2','cabang'); raise exception 'C_GAGAL';
  exception when others then if sqlerrm like 'C_GAGAL%' then raise; end if; raise notice 'c_OK: cabang ke-2 di Dasar ditolak (%)', sqlerrm; end;
end $$;
insert into branches(kos_id,name,kind) values (:'K','Gudang A','gudang');
do $$ begin
  begin update branches set kind = 'cabang' where kos_id = '71717171-0000-0000-0000-00000000aaaa' and name = 'Gudang A'; raise exception 'C_GAGAL';
  exception when others then if sqlerrm like 'C_GAGAL%' then raise; end if; raise notice 'c_OK: gudang diubah jadi cabang ditolak'; end;
end $$;

\echo == D. Penawaran cabang (Dasar penuh) -> Paket Bisnis, kapasitas baru dari paket
select growth_offer(:'K', 'cabang') ->> 'id' as d_id, (growth_offer(:'K', 'cabang') ->> 'cabang_batas_baru')::int as d_batas_baru,
       (growth_offer(:'K', 'cabang') ->> 'cabang_dipakai')::int as d_dipakai;

\echo == E. Ekspor: batas 2/bulan -> ke-3 ditolak; Gratis ditolak; staf ikut terhitung
select export_take(:'K', 'laporan') ->> 'used' as e_ke1;
select set_config('request.jwt.claim.sub', :'S', false) \g /dev/null
select export_take(:'K', 'transaksi') ->> 'used' as e_ke2_staf;
select set_config('request.jwt.claim.sub', :'U', false) \g /dev/null
do $$ begin
  begin perform export_take('71717171-0000-0000-0000-00000000aaaa', 'laporan'); raise exception 'E_GAGAL';
  exception when others then if sqlerrm like 'E_GAGAL%' then raise; end if; raise notice 'e_OK: ekspor ke-3 ditolak (%)', sqlerrm; end;
  begin perform export_take('71717171-0000-0000-0000-00000000bbbb', 'laporan'); raise exception 'E_GAGAL';
  exception when others then if sqlerrm like 'E_GAGAL%' then raise; end if; raise notice 'e_OK: Gratis ditolak (%)', sqlerrm; end;
end $$;

select (export_quota(:'K') ->> 'allowed')::boolean = false as e_kuota_habis_terbaca, export_quota(:'K') ->> 'message' is not null as e_ada_pesan,
       (export_quota(:'KG') ->> 'allowed')::boolean = false as e_gratis_terkunci;

\echo == F. Kuota menampilkan batas baru (produk, pelanggan, supplier, cabang, ekspor)
select string_agg(x->>'key' || '=' || (x->>'used') || '/' || (x->>'limit') || ':' || (x->>'pct') || '%', ' ' order by x->>'key') as f_kuota
from jsonb_array_elements(kuota_status(:'K')) x;

\echo == G. Upgrade Berhasil: aktivasi Bisnis -> pemberitahuan sekali, fitur & kapasitas baru; lalu cabang ke-2 boleh
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select plan_activate(:'K', 'bisnis', 1, null, 'admin') is not null as g_aktivasi;
select set_config('request.jwt.claim.sub', :'U', false) \g /dev/null
select upgrade_notice(:'K') ->> 'jenis' as g_jenis, upgrade_notice(:'K') ->> 'plan_name' as g_paket,
       upgrade_notice(:'K') ->> 'before_name' as g_sebelum, (upgrade_notice(:'K') -> 'limits' ->> 'karyawan')::int as g_karyawan_baru,
       (upgrade_notice(:'K') -> 'limits' ->> 'cabang')::int as g_cabang_baru;
select set_config('request.jwt.claim.sub', :'S', false) \g /dev/null
select upgrade_notice(:'K') is null as g_staf_tidak_melihat;
select set_config('request.jwt.claim.sub', :'U', false) \g /dev/null
select upgrade_notice_seen(:'K', (upgrade_notice(:'K') ->> 'id')::uuid);
select upgrade_notice(:'K') is null as g_sudah_dilihat_tidak_muncul_lagi;
insert into branches(kos_id,name,kind) values (:'K','Cabang 2','cabang');
select count(*) = 2 as g_cabang_kedua_setelah_upgrade from branches where kos_id = :'K' and kind = 'cabang' and active;

\echo == H. Bisnis ditutup: ekspor tetap boleh dan tidak dihitung
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
update kos set closed_at = now() where id = :'KG';
update kos set plan = 'dasar', paid_until = (now() at time zone 'Asia/Jakarta')::date + 5 where id = :'KG';
select set_config('request.jwt.claim.sub', :'U', false) \g /dev/null
select export_take(:'KG', 'laporan') ->> 'used' is null as h_arsip_boleh_tidak_dihitung;
