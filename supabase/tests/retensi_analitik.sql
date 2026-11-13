-- Uji alasan pembatalan, kunjungan halaman, dan metrik Growth Analytics (retensi dari riwayat aktivasi).
-- Jalankan: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/retensi_analitik.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('81818181-0000-0000-0000-000000000001','retensi-owner@x.com'),
  ('81818181-0000-0000-0000-000000000002','retensi-staf@x.com'),
  ('81818181-0000-0000-0000-000000000003','retensi-super@x.com')
on conflict do nothing;
insert into admin_staff(email, role, active) values ('retensi-super@x.com','super_admin',true) on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,created_at,activated_at) values
  ('81818181-0000-0000-0000-00000000aaaa','Bisnis Perpanjang','81818181-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 25,null,'active', now() - interval '3 days', now() - interval '3 days'),
  ('81818181-0000-0000-0000-00000000bbbb','Bisnis Berhenti','81818181-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date - 3,null,'active', now() - interval '60 days', now() - interval '60 days')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('81818181-0000-0000-0000-00000000aaaa','81818181-0000-0000-0000-000000000001','pemilik'),
  ('81818181-0000-0000-0000-00000000bbbb','81818181-0000-0000-0000-000000000001','pemilik'),
  ('81818181-0000-0000-0000-00000000aaaa','81818181-0000-0000-0000-000000000002','kasir')
on conflict do nothing;
-- Riwayat: A jatuh tempo 5 hari lalu dan diperpanjang 6 hari lalu (tepat waktu); B jatuh tempo 3 hari lalu, tidak diperpanjang
insert into plan_activations(kos_id, source, plan, months, before, after, active_until, actor, created_at) values
  ('81818181-0000-0000-0000-00000000aaaa','admin','dasar',1,'{"berlaku":"gratis"}','{"berlaku":"dasar"}',(now() at time zone 'Asia/Jakarta')::date - 5,'uji', now() - interval '35 days'),
  ('81818181-0000-0000-0000-00000000aaaa','gateway','dasar',1,'{"berlaku":"dasar"}','{"berlaku":"dasar"}',(now() at time zone 'Asia/Jakarta')::date + 25,'uji', now() - interval '6 days'),
  ('81818181-0000-0000-0000-00000000bbbb','admin','dasar',1,'{"berlaku":"gratis"}','{"berlaku":"dasar"}',(now() at time zone 'Asia/Jakarta')::date - 3,'uji', now() - interval '33 days');
insert into sales(kos_id, number, subtotal, total, pay_method) values ('81818181-0000-0000-0000-00000000aaaa','RET-1',5000,5000,'tunai');
\set A '81818181-0000-0000-0000-00000000aaaa'
\set U '81818181-0000-0000-0000-000000000001'

\echo == A. Alasan pembatalan: hanya setelah berhenti memperpanjang; opsional; staf tidak bisa
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"81818181-0000-0000-0000-000000000001","email":"retensi-owner@x.com"}', false) \g /dev/null
do $$ begin
  begin perform plan_cancel_reason('81818181-0000-0000-0000-00000000aaaa','harga'); raise exception 'A_GAGAL: belum dibatalkan tapi diterima';
  exception when others then if sqlerrm like 'A_GAGAL%' then raise; end if; raise notice 'a_OK: belum berhenti -> ditolak (%)', sqlerrm; end;
end $$;
select plan_cancel(:'A', true);
select plan_cancel_reason(:'A', 'harga', 'Terlalu mahal untuk usaha kecil');
select plan_cancel_reason(:'A', 'fitur_kurang', 'Butuh fitur X');    -- jawaban ulang memperbarui, tidak menambah baris
reset role;   -- tabel tanpa policy: dibaca sebagai sistem
select count(*) = 1 as a_satu_jawaban, max(reason) = 'fitur_kurang' as a_diperbarui from cancel_reasons where kos_id = :'A';
set role authenticated;
do $$ begin
  begin perform plan_cancel_reason('81818181-0000-0000-0000-00000000aaaa','bebas'); raise exception 'A_GAGAL';
  exception when others then if sqlerrm like 'A_GAGAL%' then raise; end if; raise notice 'a_OK: alasan tak dikenal ditolak'; end;
end $$;
select set_config('request.jwt.claim.sub', '81818181-0000-0000-0000-000000000002', false) \g /dev/null
do $$ begin
  begin perform plan_cancel_reason('81818181-0000-0000-0000-00000000aaaa','harga'); raise exception 'A_GAGAL';
  exception when others then if sqlerrm like 'A_GAGAL%' then raise; end if; raise notice 'a_OK: staf ditolak (%)', sqlerrm; end;
end $$;
reset role;

\echo == B. Kunjungan: anon boleh menambah, path lain diabaikan, tidak ada data pribadi
set role anon;
select site_visit('/'); select site_visit('/'); select site_visit('/'); select site_visit('/panduan'); select site_visit('/admin');
do $$ begin
  begin perform count(*) from site_visits; raise exception 'B_GAGAL: anon bisa membaca';
  exception when insufficient_privilege then raise notice 'b_OK: anon tidak bisa membaca tabel kunjungan';
  when others then if sqlerrm like 'B_GAGAL%' then raise; end if; raise notice 'b_OK: anon tidak bisa membaca (%)', sqlerrm; end;
end $$;
reset role;
select string_agg(path || '=' || n, ' ' order by path) as b_kunjungan from site_visits where day = (now() at time zone 'Asia/Jakarta')::date;

\echo == C. Analitik (Super Admin): perpanjangan dari riwayat, churn, pembatalan, alasan, kunjungan
set role authenticated;
select set_config('request.jwt.claim.sub', '81818181-0000-0000-0000-000000000003', false), set_config('request.jwt.claims', '{"sub":"81818181-0000-0000-0000-000000000003","email":"retensi-super@x.com"}', false) \g /dev/null
select growth_analytics(30) #>> '{retensi,berakhir_periode}' c_berakhir, growth_analytics(30) #>> '{retensi,diperpanjang}' c_diperpanjang,
       growth_analytics(30) #>> '{retensi,tingkat_perpanjangan}' c_perpanjang_pct, growth_analytics(30) #>> '{retensi,tingkat_churn}' c_churn_pct;
select growth_analytics(30) #>> '{retensi,pembatalan}' c_batal, growth_analytics(30) -> 'retensi' -> 'alasan' -> 0 ->> 'alasan' c_alasan,
       growth_analytics(30) #>> '{akuisisi,pengunjung}' c_pengunjung, growth_analytics(30) #>> '{aktivasi,transaksi_pertama}' c_trx_pertama,
       growth_analytics(30) #>> '{konversi,gratis_ke_bayar}' c_gratis_bayar, growth_analytics(30) #>> '{retensi,tidak_aktif_14_hari}' c_tidak_aktif;
reset role;
