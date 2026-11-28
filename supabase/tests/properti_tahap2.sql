-- Uji Properti Tahap 2: pembelian hybrid, referral, kampanye/voucher, kontrak (migrasi 20261128250000 & 20261128260000).
-- Database baru (semua migrasi + harness/mock_supabase.sql). Lulus = setiap kolom t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('d2d2d2d2-0000-0000-0000-000000000001','t2@x.com'), ('d2d2d2d2-0000-0000-0000-000000000002','penjaga2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,house_rules,payment_info) values
  ('d2d2d2d2-0000-0000-0000-00000000000a','Kos Tahap Dua','d2d2d2d2-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti','Tamu pulang pukul 22.00','BCA 123');
insert into kos_members(kos_id,user_id,role) values ('d2d2d2d2-0000-0000-0000-00000000000a','d2d2d2d2-0000-0000-0000-000000000001','pemilik'),
  ('d2d2d2d2-0000-0000-0000-00000000000a','d2d2d2d2-0000-0000-0000-000000000002','penjaga');
insert into rooms(id,kos_id,code,rent,status) select ('d2d2d2d2-0000-0000-0000-0000000000a' || g)::uuid, 'd2d2d2d2-0000-0000-0000-00000000000a', 'K' || g, 1000000, 'tersedia' from generate_series(1,4) g;
insert into occupants(id,kos_id,name,phone) select ('d2d2d2d2-0000-0000-0000-0000000000b' || g)::uuid, 'd2d2d2d2-0000-0000-0000-00000000000a', (array['Sinta','Rudi','Maya','Joko'])[g], '08123' || g from generate_series(1,4) g;
insert into business_modules(kos_id, module_code, active, updated_by) select 'd2d2d2d2-0000-0000-0000-00000000000a', m, true, 'uji' from unnest(array['r_belanja','r_kontak','p_referral','p_kampanye','p_kontrak','p_pembelian']) m on conflict do nothing;
insert into public_pages(kos_id, slug, enabled) values ('d2d2d2d2-0000-0000-0000-00000000000a', 'kos-tahap-dua', true);
\set K 'd2d2d2d2-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'd2d2d2d2-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d2d2d2d2-0000-0000-0000-000000000001","email":"t2@x.com"}', false) \g /dev/null

\echo == A. Pembelian hybrid
select contact_save(:'K', null, 'supplier', 'Toko Bangunan Jaya', '0811') as sup \gset
select product_save(:'K', null, 'Sabun cair', 'botol', 15000, 2, '[{"name":"botol"}]', 0, null) as sabun \gset
select purchase_order_create('d2d2d2d2-0000-0000-0000-0000000000c1', :'K', current_date, :'sup', jsonb_build_array(jsonb_build_object('product_id', :'sabun', 'unit', 'botol', 'qty', 10, 'price', 15000)), 'tunai') \g /dev/null
select purchase_receive('d2d2d2d2-0000-0000-0000-0000000000c1', (select jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty)) from purchase_lines where purchase_id = 'd2d2d2d2-0000-0000-0000-0000000000c1')) \g /dev/null
select stock = 10 a_persediaan_properti from products where id = :'sabun';
select (purchase_direct(:'K', jsonb_build_object('mode', 'biaya', 'contact_id', :'sup', 'amount', 250000, 'account', 'kas', 'description', 'Servis pompa air')) ->> 'expense_id') is not null a_biaya_langsung;
select (purchase_direct(:'K', jsonb_build_object('mode', 'aset', 'contact_id', :'sup', 'amount', 3600000, 'account', 'bank', 'name', 'AC kamar K1', 'life_months', 36)) ->> 'asset_id') is not null a_aset_tetap;
select exists (select 1 from fixed_assets f join expenses e on e.id = f.expense_id where f.kos_id = :'K' and e.contact_id = :'sup' and f.cost = 3600000) a_aset_bersupplier;
select (x ->> 'persediaan')::numeric = 150000 and (x ->> 'biaya')::numeric = 250000 and (x ->> 'aset')::numeric = 3600000 a_rekap_supplier
  from jsonb_array_elements(supplier_spend(:'K', current_date - 1, current_date)) x;

\echo == B. Referral: diskon tagihan & komisi tunai
select start_lease('d2d2d2d2-0000-0000-0000-0000000000a1', 'd2d2d2d2-0000-0000-0000-0000000000b1', current_date - 40, 1000000, current_date - 40) as l1 \gset
select referral_settings_set(:'K', '{"reward":"diskon","amount":200000,"syarat":"bayar_pertama"}') \g /dev/null
select referral_code('d2d2d2d2-0000-0000-0000-0000000000b1') as kode \gset
select start_lease('d2d2d2d2-0000-0000-0000-0000000000a2', 'd2d2d2d2-0000-0000-0000-0000000000b2', current_date, 1000000, current_date) as l2 \gset
select referral_add(:'K', jsonb_build_object('code', :'kode', 'referred_occupant_id', 'd2d2d2d2-0000-0000-0000-0000000000b2')) as r1 \gset
select status = 'tercatat' and referred_lease_id = :'l2' b_tercatat from referrals where id = :'r1';
do $$ declare m text; begin
  begin perform referral_reward((select id from referrals where kos_id = 'd2d2d2d2-0000-0000-0000-00000000000a' limit 1), '{}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Imbalan hanya untuk referral yang sudah memenuhi%' then raise exception 'B_GAGAL syarat: %', m; end if;
  raise notice 'b_OK: imbalan ditahan sebelum penghuni baru membayar';
end $$;
reset role;
insert into payments(kos_id, invoice_id, amount, paid_at, method, status, verified_at) select :'K', id, amount, current_date, 'transfer', 'terverifikasi', now() from invoices where lease_id = :'l2' and kind = 'sewa';
set role authenticated;
select referral_refresh(:'K') = 1 b_memenuhi;
select (select sum(amount) from invoice_summary where lease_id = :'l1' and outstanding > 0) as sisa_sebelum \gset
select (referral_reward(:'r1', '{}') ->> 'amount')::numeric = 200000 b_diskon_diberikan;
select (select sum(amount) from invoice_summary where lease_id = :'l1' and outstanding > 0) = :sisa_sebelum - 200000 b_tagihan_pemberi_turun;
select exists (select 1 from invoice_discounts where source = 'referral' and source_id = :'r1' and amount = 200000) b_catatan_potongan;
select referral_add(:'K', jsonb_build_object('referrer_name', 'Pak RT', 'referrer_phone', '0812', 'referred_name', 'Calon Tono')) as r2 \gset
reset role;
update referrals set status = 'memenuhi' where id = :'r2'; -- syarat dianggap terpenuhi (tanpa data sewa)
set role authenticated;
select (referral_reward(:'r2', '{"kind":"komisi","amount":150000,"account":"kas"}') ->> 'kind') = 'komisi' b_komisi;
select exists (select 1 from expenses e join expense_categories c on c.id = e.category_id where e.kos_id = :'K' and c.name = 'Komisi referral' and e.amount = 150000) b_komisi_jadi_pengeluaran;

\echo == C. Kampanye & voucher
select campaign_save(:'K', null, '{"name":"Promo Awal Tahun","kind":"voucher","code":"hemat-25","discount_kind":"persen","discount_value":25,"max_discount":200000,"months":2,"quota":5,"publish_portal":true,"portal_text":"Diskon 25% dua bulan pertama"}') as c1 \gset
do $$ begin
  begin perform campaign_redeem('d2d2d2d2-0000-0000-0000-00000000000a', (select id from leases where room_id = 'd2d2d2d2-0000-0000-0000-0000000000a2'), null, 'HEMAT25');
    raise exception 'C_GAGAL: kampanye draf bisa dipakai'; exception when others then if sqlerrm like 'C_GAGAL%' then raise; end if; end;
  raise notice 'c_OK: kampanye draf belum bisa dipakai';
end $$;
select campaign_set_status(:'c1', 'aktif') \g /dev/null
select jsonb_array_length(public_campaigns('kos-tahap-dua')) = 1 c_tampil_di_halaman_bisnis;
select start_lease('d2d2d2d2-0000-0000-0000-0000000000a3', 'd2d2d2d2-0000-0000-0000-0000000000b3', current_date, 1000000, current_date) as l3 \gset
select (campaign_redeem(:'K', :'l3', null, 'hemat 25') ->> 'applied')::numeric = 200000 c_voucher_bulan_pertama;
select (select amount from invoices where lease_id = :'l3' and kind = 'sewa' order by period_start limit 1) = 800000 c_tagihan_bulan1;
select generate_invoices(:'K', 40) \g /dev/null
select (select amount from invoices where lease_id = :'l3' and kind = 'sewa' order by period_start offset 1 limit 1) = 800000 c_tagihan_bulan2_otomatis;
select generate_invoices(:'K', 70) \g /dev/null
select (select amount from invoices where lease_id = :'l3' and kind = 'sewa' order by period_start offset 2 limit 1) = 1000000 c_bulan3_harga_normal;
select used = 1 c_kuota_terpakai from campaigns where id = :'c1';
select campaign_send_log(:'c1', '[{"kind":"penghuni","name":"Sinta"},{"kind":"prospek","name":"Calon"}]') = 2 c_catatan_kirim_wa;

\echo == D. Kontrak sewa digital
select contract_create(:'K', :'l1', null) as k1 \gset
select body like '%Sinta%' and body like '%K1%' and body like '%Tamu pulang pukul 22.00%' and body not like '%{%' d_template_terisi from lease_contracts where id = :'k1';
select contract_update(:'k1', 'Perjanjian sewa K1', (select body from lease_contracts where id = :'k1') || E'\nTambahan: hewan peliharaan tidak diizinkan.') \g /dev/null
select contract_send(:'k1') ->> 'token' as tok \gset
select status = 'menunggu' and length(body_hash) = 64 d_terkirim_dibekukan from lease_contracts where id = :'k1';
do $$ declare m text; begin
  begin perform contract_update((select id from lease_contracts where status = 'menunggu' limit 1), 'x', repeat('x', 60)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Kontrak yang sudah dikirim tidak bisa diubah%' then raise exception 'D_GAGAL ubah: %', m; end if;
  raise notice 'd_OK: isi kontrak terkirim tidak bisa diubah';
end $$;
select (contract_public_get(:'tok') ->> 'tenant') = 'Sinta' d_link_penyewa;
select contract_owner_sign(:'k1', 'Dewo Prakoso') = 'menunggu' d_pengelola_tanda_tangan_dulu;
reset role;
select (contract_public_respond(:'tok', 'setuju', 'Sinta Lestari', null, 'iphash', (select body_hash from lease_contracts where id = :'k1')) ->> 'ok')::boolean d_penyewa_setuju;
select (contract_public_respond(:'tok', 'setuju', 'Sinta Lestari', null, 'iphash', 'x') ->> 'ok')::boolean = false d_tidak_bisa_dua_kali;
set role authenticated;
select status = 'aktif' and tenant_name = 'Sinta Lestari' and owner_name = 'Dewo Prakoso' and jsonb_array_length(log) >= 4 d_aktif_jejak_audit from lease_contracts where id = :'k1';
do $$ declare m text; begin
  begin perform contract_create('d2d2d2d2-0000-0000-0000-00000000000a', (select lease_id from lease_contracts where status = 'aktif' limit 1), null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Sewa ini sudah punya kontrak%' then raise exception 'D_GAGAL dobel: %', m; end if;
  raise notice 'd_OK: satu sewa satu kontrak berjalan';
end $$;
select contract_revise(:'k1') as k2 \gset
select (select status from lease_contracts where id = :'k1') = 'batal' and (select revision_of from lease_contracts where id = :'k2') = :'k1' d_revisi;
select contract_send(:'k2') ->> 'token' as tok2 \gset
reset role;
select (contract_public_respond(:'tok2', 'tolak', 'Sinta', 'Pasal 4 deposit perlu dijelaskan', 'iphash', (select body_hash from lease_contracts where id = :'k2')) ->> 'ok')::boolean d_tolak;
set role authenticated;
select status = 'ditolak' and tenant_note like 'Pasal 4%' d_ditolak_dengan_alasan from lease_contracts where id = :'k2';
select contract_create(:'K', :'l2', null) as k3 \gset
select contract_send(:'k3') \g /dev/null
select contract_owner_sign(:'k3', 'Dewo') \g /dev/null
reset role;
select contract_public_respond((select token from lease_contracts where id = :'k3'), 'setuju', 'Rudi', null, 'h', (select body_hash from lease_contracts where id = :'k3')) \g /dev/null
set role authenticated;
select end_lease(:'l2', current_date) \g /dev/null
select status = 'berakhir' d_berakhir_saat_sewa_selesai from lease_contracts where id = :'k3';
do $$ declare n int := 0; begin
  begin perform token from lease_contracts limit 1; exception when others then n := n + 1; end;
  if n <> 1 then raise exception 'D_GAGAL token terbaca'; end if;
  raise notice 'd_OK: token link penyewa tidak bisa dibaca dari tabel';
end $$;
select contract_link(:'k3') is not null d_link_lewat_fungsi;

\echo == E. Karyawan penjaga (area sewa) & isolasi
select set_config('request.jwt.claim.sub', 'd2d2d2d2-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"d2d2d2d2-0000-0000-0000-000000000002"}', false) \g /dev/null
do $$ declare n int := 0; begin
  begin perform purchase_direct('d2d2d2d2-0000-0000-0000-00000000000a', '{"mode":"biaya","amount":1,"account":"kas"}'); exception when others then n := n + 1; end;
  begin perform referral_reward((select id from referrals limit 1), '{}'); exception when others then n := n + 1; end;
  begin perform campaign_save('d2d2d2d2-0000-0000-0000-00000000000a', null, '{"name":"X","kind":"pengumuman"}'); exception when others then n := n + 1; end;
  begin perform contract_owner_sign((select id from lease_contracts limit 1), 'Penjaga'); exception when others then n := n + 1; end;
  if n <> 4 then raise exception 'E_GAGAL izin penjaga %', n; end if;
  raise notice 'e_OK: penjaga tidak bisa membeli, memberi imbalan, mengatur kampanye, atau menandatangani kontrak';
end $$;
select (select count(*) from referrals) > 0 e_penjaga_melihat_referral, (select count(*) from lease_contracts) > 0 e_penjaga_melihat_kontrak;
reset role;
