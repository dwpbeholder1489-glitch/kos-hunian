-- Uji Adaptive Property (migrasi 20261128160000): multi-properti, inventaris, pemeriksaan, nilai investasi, property_intel.
-- Jalankan di database baru (semua migrasi + harness/mock_supabase.sql). Lulus = setiap kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('e7e7e7e7-0000-0000-0000-000000000001','pa@x.com'), ('e7e7e7e7-0000-0000-0000-000000000002','luar@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('e7e7e7e7-0000-0000-0000-00000000000a','Kos Adaptif','e7e7e7e7-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti'),
  ('e7e7e7e7-0000-0000-0000-00000000000b','Kos Dasar','e7e7e7e7-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti');
insert into kos_members(kos_id,user_id,role) values ('e7e7e7e7-0000-0000-0000-00000000000a','e7e7e7e7-0000-0000-0000-000000000001','pemilik'),
  ('e7e7e7e7-0000-0000-0000-00000000000b','e7e7e7e7-0000-0000-0000-000000000001','pemilik');
insert into rooms(id,kos_id,code,rent,status) values
  ('e7e7e7e7-0000-0000-0000-0000000000a1','e7e7e7e7-0000-0000-0000-00000000000a','A1',1000000,'tersedia'),
  ('e7e7e7e7-0000-0000-0000-0000000000a2','e7e7e7e7-0000-0000-0000-00000000000a','A2',800000,'tersedia'),
  ('e7e7e7e7-0000-0000-0000-0000000000a3','e7e7e7e7-0000-0000-0000-00000000000a','B1',600000,'tersedia');
insert into occupants(id,kos_id,name) values ('e7e7e7e7-0000-0000-0000-0000000000b1','e7e7e7e7-0000-0000-0000-00000000000a','Sari'),
  ('e7e7e7e7-0000-0000-0000-0000000000b2','e7e7e7e7-0000-0000-0000-00000000000a','Budi');
\set K 'e7e7e7e7-0000-0000-0000-00000000000a'
\set KD 'e7e7e7e7-0000-0000-0000-00000000000b'
set role authenticated;
select set_config('request.jwt.claim.sub', 'e7e7e7e7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"e7e7e7e7-0000-0000-0000-000000000001","email":"pa@x.com"}', false) \g /dev/null

\echo == A. Multi-properti (cabang bersama)
select property_save(:'K', null, 'Gedung B', 'Jl. Melati 2') as pb \gset
select (select count(*) from branches where kos_id = :'K' and is_main) = 1 a_utama_dibuat, (select kind from branches where id = :'pb') = 'cabang' a_properti_cabang;
update rooms set branch_id = :'pb' where id = 'e7e7e7e7-0000-0000-0000-0000000000a3';
select branch_id = :'pb' a_kamar_dipindah from rooms where id = 'e7e7e7e7-0000-0000-0000-0000000000a3';
do $$ declare m text; begin
  begin update rooms set branch_id = (select id from branches where kos_id = 'e7e7e7e7-0000-0000-0000-00000000000b' limit 1) where id = 'e7e7e7e7-0000-0000-0000-0000000000a1';
        if not found then m := 'tidak ada lokasi'; end if; exception when others then m := sqlerrm; end;
  begin perform property_save('e7e7e7e7-0000-0000-0000-00000000000b', null, 'Cabang 2', null); m := coalesce(m,'') || '|lolos'; exception when others then m := coalesce(m,'') || '|' || sqlerrm; end;
  if m not like '%BATAS_PAKET%' then raise exception 'A_GAGAL batas paket dasar: %', m; end if;
  raise notice 'a_OK: Paket Dasar dibatasi 1 lokasi (%).', m;
end $$;
select (my_locations() -> :'K' -> 'list') @> jsonb_build_array(jsonb_build_object('id', :'pb')) a_my_locations_properti;

\echo == B. Inventaris & pemeriksaan
insert into room_items(kos_id, room_id, name, qty, value) values (:'K', 'e7e7e7e7-0000-0000-0000-0000000000a1', 'Kasur', 1, 1500000), (:'K', 'e7e7e7e7-0000-0000-0000-0000000000a1', 'Lemari', 1, null);
select count(*) = 2 b_item_tersimpan from room_items where room_id = 'e7e7e7e7-0000-0000-0000-0000000000a1';
select start_lease('e7e7e7e7-0000-0000-0000-0000000000a1','e7e7e7e7-0000-0000-0000-0000000000b1', current_date - 70, 1000000, current_date - 70, null) as l1 \gset
select room_inspection_save(:'K', 'e7e7e7e7-0000-0000-0000-0000000000a1', :'l1', 'masuk', current_date - 70,
  (select jsonb_agg(jsonb_build_object('item_id', id, 'condition', 'baik')) from room_items where room_id = 'e7e7e7e7-0000-0000-0000-0000000000a1'), 'semua baik', 0) as i1 \gset
select room_inspection_save(:'K', 'e7e7e7e7-0000-0000-0000-0000000000a1', :'l1', 'rutin', current_date,
  (select jsonb_agg(jsonb_build_object('item_id', id, 'condition', 'rusak', 'note', 'sobek')) from room_items where name = 'Kasur' and kos_id = :'K'), null, 250000) as i2 \gset
select condition = 'rusak' and checked_at = current_date b_kondisi_terbaru from room_items where name = 'Kasur' and kos_id = :'K';
select (items -> 0 ->> 'before') = 'baik' and (items -> 0 ->> 'condition') = 'rusak' and damage = 250000 b_riwayat_salinan from room_inspections where id = :'i2';
-- pemeriksaan lama yang dicatat belakangan tidak menimpa kondisi terbaru
select room_inspection_save(:'K', 'e7e7e7e7-0000-0000-0000-0000000000a1', :'l1', 'rutin', current_date - 30,
  (select jsonb_agg(jsonb_build_object('item_id', id, 'condition', 'baik')) from room_items where name = 'Kasur' and kos_id = :'K'), null, 0) \g /dev/null
select condition = 'rusak' b_tidak_ditimpa_yang_lama from room_items where name = 'Kasur' and kos_id = :'K';
do $$ declare m text; n int := 0; begin
  begin perform room_inspection_save('e7e7e7e7-0000-0000-0000-00000000000a', 'e7e7e7e7-0000-0000-0000-0000000000a1', null, 'rutin', current_date + 2, '[]', null, 0); exception when others then n := n + 1; end;
  begin perform room_inspection_save('e7e7e7e7-0000-0000-0000-00000000000a', 'e7e7e7e7-0000-0000-0000-0000000000a2', null, 'rutin', current_date,
    (select jsonb_agg(jsonb_build_object('item_id', id)) from room_items where name = 'Kasur' and kos_id = 'e7e7e7e7-0000-0000-0000-00000000000a'), null, 0); exception when others then n := n + 1; end;
  begin update room_inspections set damage = 0; get diagnostics m = row_count; if m::int > 0 then n := n - 100; end if; exception when others then null; end;
  if n <> 2 then raise exception 'B_GAGAL penolakan pemeriksaan: %', n; end if;
  raise notice 'b_OK: tanggal depan, barang kamar lain ditolak; riwayat pemeriksaan tidak bisa diubah';
end $$;

\echo == C. Nilai investasi
do $$ declare m text; begin
  begin perform property_value_set('e7e7e7e7-0000-0000-0000-00000000000a', null, 0, null, null, null, null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Nilai investasi harus%' then raise exception 'C_GAGAL invest 0: %', m; end if;
  raise notice 'c_OK: nilai investasi 0 ditolak';
end $$;
select (property_value_set(:'K', null, 500000000, current_date - 400, 600000000, current_date, 'appraisal') ->> 'invest')::numeric = 500000000 c_simpan_utama;
select property_value_set(:'K', :'pb', 200000000, null, null, null, null) \g /dev/null
select count(*) = 2 c_dua_properti from property_values where kos_id = :'K';
select exists (select 1 from config_history where kos_id = :'K' and action = 'ubah_nilai_properti') c_tercatat_riwayat;

\echo == D. Uang per properti (jurnal) & property_intel
select start_lease('e7e7e7e7-0000-0000-0000-0000000000a3','e7e7e7e7-0000-0000-0000-0000000000b2', current_date - 70, 600000, current_date - 70, null) as l3 \gset
select generate_invoices(:'K', 10) \g /dev/null
reset role;
insert into payments(kos_id, invoice_id, amount, paid_at, method, status, verified_at)
  select :'K', id, amount, period_start, 'transfer', 'terverifikasi', now() from invoices where kos_id = :'K' and kind = 'sewa' and period_start <= current_date - 5;
set role authenticated;
insert into expenses(kos_id, date, amount, description, branch_id) values (:'K', current_date - 1, 150000, 'Listrik gedung B', :'pb'), (:'K', current_date - 1, 100000, 'Kebersihan', null);
select property_intel(:'K', current_date - 29, current_date, null) as pi \gset
select (:'pi'::jsonb -> 't12_period' ->> 'bulan')::int between 1 and 3 d_t12_bulan_data, (:'pi'::jsonb ->> 'aktif')::boolean d_aktif, (:'pi'::jsonb ->> 'lanjut')::boolean and (:'pi'::jsonb ->> 'dalam')::boolean d_pro_lengkap;
select (:'pi'::jsonb -> 'pnl' ->> 'pendapatan_usaha')::numeric = (select sum(amount) from payments where kos_id = :'K' and status = 'terverifikasi' and paid_at >= current_date - 29) d_pendapatan_dari_jurnal;
select (:'pi'::jsonb -> 'pnl' ->> 'beban_operasional')::numeric = 250000 d_beban;
select jsonb_array_length(:'pi'::jsonb -> 'props') = 2 d_dua_properti, jsonb_array_length(:'pi'::jsonb -> 'forward') = 12 d_proyeksi_12;
select (select sum((x -> 'pnl' ->> 'pendapatan_usaha')::numeric) from jsonb_array_elements(:'pi'::jsonb -> 'per_prop') x)
       = (:'pi'::jsonb -> 'pnl' ->> 'pendapatan_usaha')::numeric d_per_properti_jumlahnya_sama;
select (select (x -> 'pnl' ->> 'beban_operasional')::numeric from jsonb_array_elements(:'pi'::jsonb -> 'per_prop') x where x ->> 'id' = :'pb') = 150000 d_beban_gedung_b;
select ((:'pi'::jsonb -> 'forward' -> 0 ->> 'berjalan')::numeric = 1600000) d_sewa_berjalan, ((:'pi'::jsonb -> 'forward' -> 0 ->> 'potensi')::numeric = 800000) d_potensi_kosong;
-- simpan keluaran nyata untuk uji rumus JS (psql -v out=supabase/tests/data/property_intel.json)
\if :{?out}
select jsonb_pretty(:'pi'::jsonb) \g (format=unaligned tuples_only=on) :out
\endif
select property_intel(:'K', current_date - 29, current_date, :'pb') as pb2 \gset
select (:'pb2'::jsonb -> 'pnl' ->> 'pendapatan_usaha')::numeric = (select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id where i.room_id = 'e7e7e7e7-0000-0000-0000-0000000000a3' and p.status = 'terverifikasi' and p.paid_at >= current_date - 29) d_filter_properti,
       jsonb_array_length(:'pb2'::jsonb -> 'rooms') = 1 d_filter_kamar;
select (select count(*) from jsonb_array_elements(:'pi'::jsonb -> 'occ')) = 12 d_hunian_12_bulan,
       (select (x ->> 'terisi')::int > 0 from jsonb_array_elements(:'pi'::jsonb -> 'occ') x order by x ->> 'bulan' desc limit 1) d_hunian_terisi;
-- Paket Dasar: ringkas, tanpa per unit/proyeksi; filter properti ditolak
select property_intel(:'KD', current_date - 29, current_date, null) as pd \gset
select not (:'pd'::jsonb ->> 'lanjut')::boolean and not (:'pd'::jsonb ? 'units') and not (:'pd'::jsonb ? 'forward') and jsonb_array_length(:'pd'::jsonb -> 'occ') = 6 d_dasar_ringkas;
do $$ declare m text; begin
  begin perform property_intel('e7e7e7e7-0000-0000-0000-00000000000b', current_date - 10, current_date, (select id from branches limit 1)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'D_GAGAL filter dasar: %', m; end if;
  raise notice 'd_OK: filter per properti hanya Pro';
end $$;

\echo == E. Akses orang luar
select set_config('request.jwt.claim.sub', 'e7e7e7e7-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"e7e7e7e7-0000-0000-0000-000000000002"}', false) \g /dev/null
do $$ declare n int := 0; begin
  begin perform property_intel('e7e7e7e7-0000-0000-0000-00000000000a', current_date - 10, current_date, null); exception when others then n := n + 1; end;
  begin perform property_value_set('e7e7e7e7-0000-0000-0000-00000000000a', null, 1, null, null, null, null); exception when others then n := n + 1; end;
  begin perform room_inspection_save('e7e7e7e7-0000-0000-0000-00000000000a', 'e7e7e7e7-0000-0000-0000-0000000000a1', null, 'rutin', current_date, '[]', null, 0); exception when others then n := n + 1; end;
  begin perform property_save('e7e7e7e7-0000-0000-0000-00000000000a', null, 'Curian', null); exception when others then n := n + 1; end;
  if n <> 4 then raise exception 'E_GAGAL akses luar: %', n; end if;
  raise notice 'e_OK: orang luar ditolak di semua RPC';
end $$;
select (select count(*) from room_items) = 0 e_item_tak_terlihat, (select count(*) from room_inspections) = 0 e_periksa_tak_terlihat, (select count(*) from property_values) = 0 e_nilai_tak_terlihat;
reset role;
