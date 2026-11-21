-- Adaptive Business Experience v3.0 — Fase 4: Process & Workflow Adaptation.
-- Dibangun DI ATAS mesin alur yang sudah ada (tidak menggantinya):
--   * tahap pesanan jasa (svc_stages + svc_order_move), status & langkah Builder (bb_statuses/bb_transitions + bb_record_move),
--   * persetujuan per tindakan (approval_actions/approval_rules/approvals).
-- Yang baru:
--   business_processes   = peta proses per jenis bisnis (Business Process Recognition; status langkah dihitung dari data nyata).
--   workflow_definitions = registry alur standar (status bawaan mesin) — alur kustom = jenis data Builder.
--   workflow_templates   = template tahap pesanan per subkategori (laundry kiloan, dry clean, servis, percetakan, ...).
--   workflow_rules       = aturan bersyarat per alur: "Bila <kondisi> maka <tolak | perlu persetujuan | wajib catatan>".
--                          Ditegakkan di DATABASE (trigger svc_orders + bb_record_move); pemilik selalu dikecualikan.
--   workflow_versions    = versi definisi alur (tahap/status/langkah + aturan) → bisa dipulihkan.
--   workflow_reco_decisions = keputusan pemilik atas saran alur (ditolak tidak muncul lagi selama kondisinya sama).

-- =====================================================================
-- 1. Katalog global
-- =====================================================================
create table if not exists public.business_processes (
  code text primary key,
  name text not null,
  description text,
  engines text[] not null,
  templates text[] not null default '{}',     -- kosong = semua template mesin itu
  not_templates text[] not null default '{}',
  show_if_module text,                         -- tampil bila modul ini aktif ...
  show_if_models text[] not null default '{}', -- ... atau DNA punya salah satu model ini (kosong + show_if_module null = selalu)
  steps jsonb not null,                        -- [{key, name, desc, path, ev, module?, stage?, auto?, reco?, optional?}]
  sort int not null default 0,
  version int not null default 1,
  active boolean not null default true
);
alter table public.business_processes enable row level security;
drop policy if exists business_processes_read on public.business_processes;
create policy business_processes_read on public.business_processes for select using (true);
grant select on public.business_processes to authenticated;

create table if not exists public.workflow_definitions (
  code text primary key,
  name text not null,
  description text,
  engines text[] not null,
  templates text[] not null default '{}',
  entity text not null,                        -- tabel sumber (hanya dari seed ini, dipakai SQL dinamis)
  datecol text not null,
  path text,
  module text,
  statuses jsonb not null,                     -- [{k, l, f (final)}]
  approvals text[] not null default '{}',
  editable text[] not null default '{}',       -- tahap, aturan, template, persetujuan
  sort int not null default 0
);
alter table public.workflow_definitions enable row level security;
drop policy if exists workflow_definitions_read on public.workflow_definitions;
create policy workflow_definitions_read on public.workflow_definitions for select using (true);
grant select on public.workflow_definitions to authenticated;

create table if not exists public.workflow_templates (
  code text primary key,
  workflow text not null default 'svc_order',
  name text not null,
  description text,
  templates text[] not null default '{}',      -- template bisnis (kos.template_code)
  subcategories text[] not null default '{}',  -- subkategori yang paling cocok
  stages text[] not null,
  rules jsonb not null default '[]',           -- aturan yang disarankan (opsional saat dipakai)
  sort int not null default 0
);
alter table public.workflow_templates enable row level security;
drop policy if exists workflow_templates_read on public.workflow_templates;
create policy workflow_templates_read on public.workflow_templates for select using (true);
grant select on public.workflow_templates to authenticated;

-- =====================================================================
-- 2. Data per bisnis (+ pengaman bisnis ditutup/draf)
-- =====================================================================
create table if not exists public.workflow_rules (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  workflow text not null,                      -- 'svc_order' | 'bb:<object uuid>'
  point text not null,                         -- svc: lewati_tahap/serahkan/batal; bb: id status tujuan
  name text not null check (length(trim(name)) between 3 and 60),
  cond jsonb not null default '{}',
  action text not null check (action in ('tolak', 'persetujuan', 'catatan')),
  message text check (message is null or length(message) <= 200),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists workflow_rules_kos on public.workflow_rules(kos_id, workflow, point) where active;
alter table public.workflow_rules enable row level security;
drop policy if exists workflow_rules_read on public.workflow_rules;
create policy workflow_rules_read on public.workflow_rules for select using (public.is_member(kos_id));
grant select on public.workflow_rules to authenticated;

create table if not exists public.workflow_versions (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  workflow text not null,
  version int not null,
  definition jsonb not null,
  reason text,
  actor text,
  created_at timestamptz not null default now(),
  unique (kos_id, workflow, version)
);
alter table public.workflow_versions enable row level security;
drop policy if exists workflow_versions_read on public.workflow_versions;
create policy workflow_versions_read on public.workflow_versions for select using (public.member_can(kos_id, 'settings'));
grant select on public.workflow_versions to authenticated;

create table if not exists public.workflow_reco_decisions (
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null,
  context_hash text not null,
  title text,
  decision text not null check (decision in ('diterima', 'ditolak', 'ditunda')),
  until date,
  note text,
  decided_by text,
  decided_at timestamptz not null default now(),
  primary key (kos_id, code)
);
alter table public.workflow_reco_decisions enable row level security;  -- tanpa policy: hanya lewat fungsi

do $$ declare t text; begin
  foreach t in array array['workflow_rules', 'workflow_versions', 'workflow_reco_decisions'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- Pengaman draf: alur Builder boleh disusun saat bisnis masih draf → versi & aturan alur ikut diizinkan (tabel konfigurasi).
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.kos_open_guard()', '''cf_fields'', ''expense_categories'')',
  '''cf_fields'', ''expense_categories'', ''workflow_rules'', ''workflow_versions'', ''workflow_reco_decisions'')');

-- =====================================================================
-- 3. Seed: alur standar (registry)
-- =====================================================================
insert into public.workflow_definitions(code, name, description, engines, templates, entity, datecol, path, module, statuses, approvals, editable, sort) values
  ('svc_order', 'Pesanan', 'Pesanan diterima, dikerjakan per tahap, siap, lalu diserahkan ke pelanggan.', '{jasa}', '{}', 'svc_orders', 'received_at', '/pesanan', 'j_pesanan',
   '[{"k":"permintaan","l":"Permintaan (halaman bisnis)"},{"k":"diterima","l":"Diterima"},{"k":"@tahap","l":"Tahap proses"},{"k":"siap","l":"Siap"},{"k":"selesai","l":"Diserahkan","f":true},{"k":"batal","l":"Batal","f":true}]',
   '{batal_pesanan_jasa,batal_bayar_jasa,langkah_pesanan_jasa}', '{tahap,template,aturan,persetujuan}', 1),
  ('kul_reservation', 'Reservasi meja', 'Permintaan reservasi dikonfirmasi, tamu datang, lalu selesai.', '{jasa}', '{kuliner}', 'kul_reservations', 'created_at', '/meja', null,
   '[{"k":"permintaan","l":"Permintaan"},{"k":"dipesan","l":"Dipesan"},{"k":"datang","l":"Datang"},{"k":"selesai","l":"Selesai","f":true},{"k":"tidak_datang","l":"Tidak datang","f":true},{"k":"batal","l":"Batal","f":true}]',
   '{}', '{}', 2),
  ('sale', 'Penjualan kasir', 'Penjualan langsung selesai di Kasir; pembatalan & retur lewat persetujuan.', '{retail}', '{}', 'sales', 'sold_at', '/penjualan', 'r_kasir',
   '[{"k":"selesai","l":"Selesai","f":true},{"k":"batal","l":"Dibatalkan","f":true}]', '{batal_penjualan,retur_penjualan}', '{persetujuan}', 3),
  ('so_order', 'Pesanan grosir', 'Penawaran → dikonfirmasi (cek batas kredit) → surat jalan → selesai.', '{retail}', '{}', 'so_orders', 'created_at', '/grosir', 'u_penawaran',
   '[{"k":"penawaran","l":"Penawaran"},{"k":"dikonfirmasi","l":"Dikonfirmasi"},{"k":"sebagian","l":"Dikirim sebagian"},{"k":"selesai","l":"Selesai","f":true},{"k":"batal","l":"Batal","f":true}]',
   '{}', '{}', 4),
  ('purchase_request', 'Permintaan pembelian', 'Staf mengajukan, bagian keuangan menyetujui, lalu dijadikan pesanan ke supplier.', '{retail,jasa}', '{}', 'purchase_requests', 'created_at', '/belanja', 'r_belanja',
   '[{"k":"diajukan","l":"Diajukan"},{"k":"disetujui","l":"Disetujui"},{"k":"dipesan","l":"Dipesan","f":true},{"k":"ditolak","l":"Ditolak","f":true},{"k":"batal","l":"Batal","f":true}]',
   '{}', '{}', 5),
  ('purchase', 'Belanja ke supplier', 'Pesanan ke supplier diterima sebagian/penuh, atau dibatalkan.', '{retail,jasa}', '{}', 'purchases', 'created_at', '/belanja', 'r_belanja',
   '[{"k":"dipesan","l":"Dipesan"},{"k":"sebagian","l":"Diterima sebagian"},{"k":"selesai","l":"Diterima","f":true},{"k":"batal","l":"Batal","f":true}]',
   '{batal_belanja,retur_belanja}', '{persetujuan}', 6),
  ('supplier_invoice', 'Faktur supplier', 'Faktur dicocokkan 3 arah lalu diposting (menambah utang PPN/selisih).', '{retail,jasa}', '{}', 'supplier_invoices', 'created_at', '/belanja?tab=faktur', 'r_belanja',
   '[{"k":"draf","l":"Draf"},{"k":"diposting","l":"Diposting","f":true},{"k":"batal","l":"Batal","f":true}]', '{}', '{}', 7),
  ('stock_transfer', 'Kirim stok antar lokasi', 'Barang dikirim (dalam perjalanan) lalu diterima di lokasi tujuan.', '{retail,jasa}', '{}', 'stock_transfers', 'created_at', '/mutasi', 'u_lokasi',
   '[{"k":"dikirim","l":"Dalam perjalanan"},{"k":"selesai","l":"Diterima","f":true},{"k":"batal","l":"Batal","f":true}]', '{}', '{}', 8),
  ('booking', 'Booking kamar', 'Kamar dikunci dengan DP sampai check-in, refund, atau hangus.', '{properti}', '{}', 'bookings', 'created_at', '/booking', 'p_booking',
   '[{"k":"aktif","l":"Aktif (kamar dikunci)"},{"k":"selesai","l":"Selesai / check-in","f":true},{"k":"batal","l":"Batal","f":true}]', '{}', '{}', 9),
  ('lease', 'Sewa kamar', 'Penghuni masuk, tagihan terbit tiap periode, lalu keluar.', '{properti}', '{}', 'leases', 'created_at', '/penghuni', 'p_kamar',
   '[{"k":"aktif","l":"Menghuni"},{"k":"selesai","l":"Keluar","f":true}]', '{}', '{}', 10),
  ('payment', 'Pembayaran penghuni', 'Bukti bayar dari penghuni diverifikasi pemilik.', '{properti}', '{}', 'payments', 'created_at', '/pembayaran', 'p_tagihan',
   '[{"k":"menunggu","l":"Menunggu verifikasi"},{"k":"terverifikasi","l":"Terverifikasi","f":true},{"k":"ditolak","l":"Ditolak","f":true},{"k":"dibatalkan","l":"Dibatalkan","f":true}]', '{}', '{}', 11),
  ('maint_ticket', 'Keluhan & perbaikan', 'Keluhan dicatat, dikerjakan, menunggu bila perlu, lalu selesai.', '{properti}', '{}', 'maint_tickets', 'created_at', '/perbaikan', 'p_perbaikan',
   '[{"k":"baru","l":"Baru"},{"k":"dikerjakan","l":"Dikerjakan"},{"k":"menunggu","l":"Menunggu"},{"k":"selesai","l":"Selesai","f":true},{"k":"batal","l":"Batal","f":true}]', '{}', '{}', 12)
on conflict (code) do update set name = excluded.name, description = excluded.description, engines = excluded.engines, templates = excluded.templates,
  entity = excluded.entity, datecol = excluded.datecol, path = excluded.path, module = excluded.module, statuses = excluded.statuses,
  approvals = excluded.approvals, editable = excluded.editable, sort = excluded.sort;

-- =====================================================================
-- 4. Seed: template tahap pesanan (Process Templates)
-- =====================================================================
insert into public.workflow_templates(code, name, description, templates, subcategories, stages, rules, sort) values
  ('laundry_kiloan', 'Laundry kiloan', 'Ditimbang & dicek dulu, dicek kualitas sebelum dikemas.', '{laundry}', '{laundry_laundry}',
   '{"Timbang & cek","Cuci","Kering","Setrika & lipat","Cek kualitas","Kemas"}',
   '[{"point":"lewati_tahap","name":"Persetujuan bila melewati tahap","action":"persetujuan","cond":{}}]', 1),
  ('laundry_dryclean', 'Dry clean & laundry satuan', 'Noda & kerusakan diperiksa sebelum diproses.', '{laundry}', '{laundry_dryclean}',
   '{"Periksa noda & kerusakan","Pra-perawatan noda","Cuci kering / cuci khusus","Setrika uap","Cek kualitas","Kemas & label"}',
   '[{"point":"lewati_tahap","name":"Persetujuan bila melewati tahap","action":"persetujuan","cond":{}}]', 2),
  ('cuci_sepatu', 'Cuci sepatu & tas', 'Bahan dicek dulu, perawatan, lalu cek kualitas.', '{jasa_umum,laundry}', '{laundry_sepatu}',
   '{"Periksa bahan & kondisi","Pembersihan","Pengeringan","Perawatan & finishing","Cek kualitas"}', '[]', 3),
  ('jahit_permak', 'Jahit & permak', 'Ukur, potong, jahit, finishing, cek hasil.', '{jasa_umum,laundry}', '{laundry_jahit}',
   '{"Ukur & catat","Potong","Jahit","Finishing","Cek hasil"}', '[]', 4),
  ('cuci_kendaraan', 'Cuci kendaraan', 'Antre, cuci, kering & poles, cek akhir.', '{jasa_umum,laundry}', '{laundry_cucikendaraan,otomotif_cuci}',
   '{"Antre","Cuci","Pengeringan & poles","Cek akhir"}', '[]', 5),
  ('layanan_lapangan', 'Layanan di lokasi pelanggan', 'Survei, dijadwalkan, dikerjakan, dicek bersama pelanggan.', '{jasa_umum,laundry}',
   '{laundry_kebersihan,laundry_pest,laundry_homeservice,laundry_perbaikan,laundry_fasilitas,lainnya_lingkungan,lainnya_energi}',
   '{"Survei / cek lokasi","Dijadwalkan","Dikerjakan","Cek hasil bersama pelanggan"}', '[]', 6),
  ('servis_perangkat', 'Servis perangkat', 'Biaya disetujui pelanggan sebelum perbaikan; diuji sebelum diserahkan.', '{jasa_umum}', '{profesional_servis,teknologi_support,teknologi_managed}',
   '{"Cek kerusakan","Menunggu persetujuan biaya","Perbaikan","Uji fungsi","Cek kualitas"}',
   '[{"point":"serahkan","name":"Persetujuan bila diserahkan belum lunas","action":"persetujuan","cond":{"belum_lunas":true}}]', 7),
  ('percetakan', 'Percetakan', 'File dicek & proof disetujui sebelum dicetak.', '{jasa_umum}', '{profesional_cetak}',
   '{"Cek file / desain","Proof disetujui","Cetak","Finishing","Cek hasil"}',
   '[{"point":"lewati_tahap","name":"Persetujuan bila melewati tahap","action":"persetujuan","cond":{}}]', 8),
  ('kreatif', 'Jasa kreatif (desain/foto/video)', 'Brief, draf, revisi, lalu file final diserahkan.', '{jasa_umum}',
   '{profesional_desain,profesional_foto,profesional_agensi,media_agensi,media_desain,media_foto,media_video,media_creator,media_penerbitan,media_iklan,teknologi_web,teknologi_softwarehouse}',
   '{"Brief","Pengerjaan draf","Revisi","Final & serah file"}', '[]', 9),
  ('konsultasi', 'Konsultasi & jasa profesional', 'Data dikumpulkan, dikerjakan, direview, lalu hasil diserahkan.', '{jasa_umum}',
   '{profesional_konsultan,profesional_hukum,profesional_pajak,profesional_akuntansi,profesional_arsitek,profesional_teknik,profesional_admin,profesional_manajemen,keuangan_konsultan,keuangan_agen,keuangan_asuransi,keuangan_pembiayaan,keuangan_admin,teknologi_konsultan,teknologi_saas,teknologi_security,teknologi_infra,properti_agen}',
   '{"Pengumpulan data","Pengerjaan","Review","Serah hasil"}', '[]', 10),
  ('kuliner_dapur', 'Dapur kuliner', 'Antre di dapur lalu dimasak; siap saji setelah tahap terakhir.', '{kuliner}',
   '{kuliner_restoran,kuliner_warung,kuliner_rumahmakan,kuliner_fastfood,kuliner_casual,kuliner_fine,kuliner_cloud,kuliner_foodtruck,kuliner_franchise}',
   '{"Antre dapur","Dimasak"}', '[]', 11),
  ('kuliner_minuman', 'Kedai kopi & minuman', 'Antre lalu diracik.', '{kuliner}', '{kuliner_kafe,kuliner_coffee,kuliner_minuman}',
   '{"Antre","Diracik"}', '[]', 12),
  ('kuliner_produksi', 'Bakery & katering', 'Persiapan bahan, produksi, pengemasan.', '{kuliner}', '{kuliner_bakery,kuliner_katering}',
   '{"Persiapan bahan","Produksi","Pengemasan"}', '[]', 13),
  ('jasa_umum', 'Jasa umum', 'Dijadwalkan, dikerjakan, diperiksa sebelum diserahkan.', '{jasa_umum}', '{}',
   '{"Dijadwalkan","Dikerjakan","Diperiksa"}', '[]', 20)
on conflict (code) do update set name = excluded.name, description = excluded.description, templates = excluded.templates,
  subcategories = excluded.subcategories, stages = excluded.stages, rules = excluded.rules, sort = excluded.sort;

-- =====================================================================
-- 5. Seed: peta proses (Business Process Recognition)
--    ev = sumber bukti (dihitung 90 hari terakhir), stage = pola nama tahap yang harus ada,
--    auto = langkah dijalankan sistem bila bukti lain ada, reco = boleh disarankan bila belum dipakai.
-- =====================================================================
insert into public.business_processes(code, name, description, engines, templates, not_templates, show_if_module, show_if_models, steps, sort) values
  ('retail_jual', 'Jual-beli barang', 'Dari belanja ke supplier sampai laporan.', '{retail}', '{}', '{}', null, '{}', $j$[
    {"key":"belanja","name":"Belanja ke supplier","path":"/belanja","ev":"belanja","module":"r_belanja","reco":true},
    {"key":"terima","name":"Terima barang","path":"/belanja","ev":"terima","module":"r_belanja"},
    {"key":"stok","name":"Persediaan","path":"/barang","ev":"stok","module":"r_barang"},
    {"key":"harga","name":"Harga jual","path":"/barang","ev":"produk","module":"r_barang"},
    {"key":"jual","name":"Penjualan","path":"/kasir","ev":"jual","module":"r_kasir"},
    {"key":"bayar","name":"Pembayaran","path":"/penjualan","ev":"bayar_jual","module":"r_kasir"},
    {"key":"buku","name":"Pembukuan","path":"/pembukuan","ev":"jual","auto":true},
    {"key":"laporan","name":"Laporan","path":"/laporan-toko","ev":"jual","auto":true}]$j$, 1),
  ('retail_grosir', 'Penjualan grosir (B2B)', 'Penawaran sampai pelunasan piutang.', '{retail}', '{}', '{}', 'u_penawaran', '{wholesale,distribution}', $j$[
    {"key":"penawaran","name":"Penawaran","path":"/grosir","ev":"so","module":"u_penawaran"},
    {"key":"konfirmasi","name":"Pesanan dikonfirmasi","path":"/grosir","ev":"so_konfirm","module":"u_penawaran"},
    {"key":"kirim","name":"Surat jalan","path":"/grosir","ev":"so_kirim","module":"u_penawaran"},
    {"key":"faktur","name":"Faktur & piutang","path":"/grosir","ev":"so_faktur","module":"u_penawaran"},
    {"key":"lunas","name":"Pelunasan piutang","path":"/kas?tab=kasbon","ev":"piutang_lunas"}]$j$, 2),
  ('kuliner', 'Kuliner', 'Dari belanja bahan sampai analisis food cost.', '{jasa}', '{kuliner}', '{}', null, '{}', $j$[
    {"key":"belanja","name":"Belanja bahan","path":"/belanja","ev":"belanja","module":"r_belanja","reco":true},
    {"key":"terima","name":"Terima bahan","path":"/belanja","ev":"terima","module":"r_belanja"},
    {"key":"stok","name":"Stok bahan","path":"/barang","ev":"stok","module":"j_bahan"},
    {"key":"resep","name":"Resep","path":"/resep","ev":"resep","module":"j_resep","reco":true},
    {"key":"pesanan","name":"Pesanan","path":"/pesanan","ev":"pesanan","module":"j_pesanan"},
    {"key":"dapur","name":"Dapur","path":"/dapur","ev":"tahap","module":"j_pesanan"},
    {"key":"bayar","name":"Pembayaran","path":"/pesanan","ev":"bayar_jasa","module":"j_pesanan"},
    {"key":"foodcost","name":"Analisis food cost","path":"/resep","ev":"resep_pakai","module":"j_resep"}]$j$, 3),
  ('laundry', 'Laundry', 'Dari pesanan diterima sampai diserahkan & dibayar.', '{jasa}', '{laundry}', '{}', null, '{}', $j$[
    {"key":"terima","name":"Terima pesanan","path":"/pesanan","ev":"pesanan","module":"j_pesanan"},
    {"key":"periksa","name":"Periksa barang","path":"/alur","ev":"tahap:timbang|periksa|cek kondisi|inspeksi","stage":"timbang|periksa|cek kondisi|inspeksi"},
    {"key":"proses","name":"Proses","path":"/pesanan","ev":"tahap","module":"j_pesanan"},
    {"key":"qc","name":"Cek kualitas","path":"/alur","ev":"tahap:kualitas|qc|cek hasil|cek akhir","stage":"kualitas|qc|cek hasil|cek akhir"},
    {"key":"siap","name":"Selesai dikerjakan","path":"/pesanan","ev":"siap","module":"j_pesanan"},
    {"key":"antar","name":"Antar / diambil","path":"/pesanan","ev":"serah","module":"j_pesanan"},
    {"key":"bayar","name":"Pembayaran","path":"/pesanan","ev":"bayar_jasa","module":"j_pesanan"}]$j$, 4),
  ('jasa', 'Layanan jasa', 'Pesanan masuk, dikerjakan per tahap, diperiksa, diserahkan.', '{jasa}', '{}', '{kuliner,laundry}', null, '{}', $j$[
    {"key":"masuk","name":"Pesanan masuk","path":"/pesanan","ev":"pesanan","module":"j_pesanan"},
    {"key":"kerja","name":"Pengerjaan per tahap","path":"/pesanan","ev":"tahap","module":"j_pesanan"},
    {"key":"periksa","name":"Pemeriksaan hasil","path":"/alur","ev":"tahap:periksa|cek|review|uji|kualitas","stage":"periksa|cek|review|uji|kualitas"},
    {"key":"serah","name":"Serah terima","path":"/pesanan","ev":"serah","module":"j_pesanan"},
    {"key":"bayar","name":"Pembayaran","path":"/pesanan","ev":"bayar_jasa","module":"j_pesanan"},
    {"key":"laporan","name":"Laporan","path":"/laporan-jasa","ev":"serah","auto":true}]$j$, 5),
  ('properti', 'Sewa properti', 'Dari kamar siap sampai laporan.', '{properti}', '{}', '{}', null, '{}', $j$[
    {"key":"unit","name":"Kamar / unit","path":"/kamar","ev":"kamar","module":"p_kamar"},
    {"key":"booking","name":"Booking","path":"/booking","ev":"booking","module":"p_booking"},
    {"key":"kontrak","name":"Sewa (kontrak)","path":"/penghuni","ev":"sewa","module":"p_kamar"},
    {"key":"tagihan","name":"Tagihan","path":"/tagihan","ev":"tagihan","module":"p_tagihan"},
    {"key":"bayar","name":"Pembayaran","path":"/pembayaran","ev":"bayar_kos","module":"p_tagihan"},
    {"key":"perbaikan","name":"Perbaikan","path":"/perbaikan","ev":"perbaikan","module":"p_perbaikan","optional":true},
    {"key":"laporan","name":"Laporan","path":"/laporan","ev":"bayar_kos","auto":true}]$j$, 6),
  ('konstruksi', 'Proyek konstruksi', 'Dari proyek dan RAB sampai serah terima.', '{kustom}', '{bb_proyek}', '{}', null, '{}', $j$[
    {"key":"proyek","name":"Proyek dibuat","path":"/catatan/proyek","ev":"bb:proyek"},
    {"key":"rab","name":"RAB","path":"/catatan/rab","ev":"bb:rab","reco":true},
    {"key":"material","name":"Pembelian material","path":"/catatan/material","ev":"bb:material","reco":true},
    {"key":"tenaga","name":"Tenaga kerja","path":"/catatan/tenaga","ev":"bb:tenaga","optional":true},
    {"key":"kerja","name":"Pelaksanaan","path":"/catatan/proyek","ev":"bbst:proyek:dikerjakan"},
    {"key":"progres","name":"Progres","path":"/catatan/proyek","ev":"bbf:proyek:progres"},
    {"key":"biaya","name":"Kontrol biaya","path":"/kerja","ev":"bb:material","auto":true},
    {"key":"serah","name":"Serah terima","path":"/catatan/proyek","ev":"bbst:proyek:serah terima|selesai"}]$j$, 7),
  ('event', 'Event', 'Dari penawaran sampai acara selesai.', '{kustom}', '{bb_event}', '{}', null, '{}', $j$[
    {"key":"klien","name":"Klien","path":"/catatan/klien","ev":"bb:klien"},
    {"key":"penawaran","name":"Penawaran & deal","path":"/catatan/acara","ev":"bbst:acara:penawaran|deal"},
    {"key":"vendor","name":"Vendor","path":"/catatan/vendor","ev":"bb:vendor","optional":true},
    {"key":"tugas","name":"Tugas persiapan","path":"/catatan/tugas","ev":"bb:tugas","reco":true},
    {"key":"hari","name":"Hari H","path":"/catatan/acara","ev":"bbst:acara:hari h"},
    {"key":"selesai","name":"Selesai","path":"/catatan/acara","ev":"bbst:acara:selesai"}]$j$, 8)
on conflict (code) do update set name = excluded.name, description = excluded.description, engines = excluded.engines, templates = excluded.templates,
  not_templates = excluded.not_templates, show_if_module = excluded.show_if_module, show_if_models = excluded.show_if_models,
  steps = excluded.steps, sort = excluded.sort, version = business_processes.version + case when business_processes.steps is distinct from excluded.steps then 1 else 0 end;

-- =====================================================================
-- 6. Aturan bersyarat: evaluasi & penegakan
-- =====================================================================
-- Kondisi (semua harus terpenuhi): total_min, total_max, belum_lunas, sudah_bayar, antar, fields[{key, op, value}]
create or replace function public.wf_num(p jsonb)
returns numeric language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) not in ('number', 'string') then return null; end if;
  return (p #>> '{}')::numeric;
exception when others then return null;
end $$;

create or replace function public.wf_cond_ok(p_cond jsonb, p_ctx jsonb)
returns boolean language plpgsql immutable as $$
declare f jsonb; v jsonb; n numeric; t numeric; v_empty boolean;
begin
  if p_cond is null or p_cond = '{}'::jsonb then return true; end if;
  if p_cond ? 'total_min' and coalesce(wf_num(p_ctx->'total'), 0) < wf_num(p_cond->'total_min') then return false; end if;
  if p_cond ? 'total_max' and coalesce(wf_num(p_ctx->'total'), 0) > wf_num(p_cond->'total_max') then return false; end if;
  if coalesce((p_cond->>'belum_lunas')::boolean, false) and coalesce(wf_num(p_ctx->'sisa'), 0) <= 0 then return false; end if;
  if coalesce((p_cond->>'sudah_bayar')::boolean, false) and coalesce(wf_num(p_ctx->'paid'), 0) <= 0 then return false; end if;
  if p_cond ? 'antar' and (p_cond->>'antar')::boolean is distinct from coalesce((p_ctx->>'deliver')::boolean, false) then return false; end if;
  for f in select * from jsonb_array_elements(coalesce(p_cond->'fields', '[]')) loop
    v := p_ctx->'data'->(f->>'key');
    v_empty := v is null or jsonb_typeof(v) = 'null' or v = '""'::jsonb or v = '[]'::jsonb;
    if f->>'op' = 'isi' then
      if v_empty then return false; end if;
    elsif f->>'op' = 'kosong' then
      if not v_empty then return false; end if;
    elsif f->>'op' in ('=', '!=') then
      n := wf_num(v); t := wf_num(f->'value');
      if n is not null and t is not null then
        if (n = t) <> (f->>'op' = '=') then return false; end if;
      elsif (lower(trim(coalesce(v #>> '{}', ''))) = lower(trim(coalesce(f->>'value', '')))) <> (f->>'op' = '=') then return false;
      end if;
    elsif f->>'op' in ('>=', '<=', '>', '<') then
      n := wf_num(v); t := wf_num(f->'value');
      if n is null or t is null then return false; end if;
      if (f->>'op' = '>=' and n < t) or (f->>'op' = '<=' and n > t) or (f->>'op' = '>' and n <= t) or (f->>'op' = '<' and n >= t) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;

-- Penegakan. Pemilik, eksekusi persetujuan, proses server (tanpa pengguna) & pemasangan template dikecualikan.
create or replace function public.wf_check(p_kos uuid, p_workflow text, p_point text, p_ctx jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r workflow_rules; v_appr text; v_note text := trim(coalesce(p_ctx->>'note', ''));
begin
  if auth.uid() is null or coalesce(current_setting('prasara.approval_exec', true), '') <> ''
     or coalesce(current_setting('prasara.setup_ok', true), '') = '1' then return; end if;
  if member_can(p_kos, 'team') then return; end if;
  for r in select * from workflow_rules where kos_id = p_kos and workflow = p_workflow and point = p_point and active
           order by case action when 'tolak' then 0 when 'catatan' then 1 else 2 end, sort, created_at loop
    if not wf_cond_ok(r.cond, p_ctx) then continue; end if;
    if r.action = 'tolak' then
      raise exception 'ATURAN_ALUR: %', coalesce(nullif(trim(r.message), ''), 'Langkah ini tidak diizinkan oleh aturan "' || r.name || '". Hubungi pemilik bisnis.');
    elsif r.action = 'catatan' and length(v_note) < 3 then
      raise exception 'ATURAN_ALUR: %', coalesce(nullif(trim(r.message), ''), 'Aturan "' || r.name || '" mewajibkan catatan untuk langkah ini.');
    elsif r.action = 'persetujuan' and v_appr is null then
      v_appr := coalesce(nullif(trim(r.message), ''), 'Aturan "' || r.name || '"');
    end if;
  end loop;
  if v_appr is not null then
    raise exception 'PERLU_PERSETUJUAN: % — langkah ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.', v_appr;
  end if;
end $$;
revoke all on function public.wf_check(uuid, text, text, jsonb) from public, anon, authenticated;

-- Pesanan jasa: semua jalur (svc_order_move, antar, tutup meja, batal) lewat UPDATE status → satu trigger.
create or replace function public.svc_orders_wf()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_point text; v_paid numeric; v_sort int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'selesai' then v_point := 'serahkan';
  elsif new.status = 'batal' then v_point := 'batal';
  elsif new.status = 'siap' and old.status in ('diterima', 'proses') then
    select sort into v_sort from svc_stages where id = old.stage_id;
    if exists (select 1 from svc_stages where kos_id = new.kos_id and active and (old.status = 'diterima' or sort > coalesce(v_sort, -1))) then
      v_point := 'lewati_tahap';
    end if;
  end if;
  if v_point is null or not exists (select 1 from workflow_rules where kos_id = new.kos_id and workflow = 'svc_order' and point = v_point and active) then
    return new;
  end if;
  v_paid := svc_paid(new.id);
  perform wf_check(new.kos_id, 'svc_order', v_point, jsonb_build_object('total', new.total, 'paid', v_paid, 'sisa', new.total - v_paid,
    'deliver', new.deliver, 'note', case v_point when 'serahkan' then new.handover when 'batal' then new.void_reason end));
  return new;
end $$;
drop trigger if exists svc_orders_wf on public.svc_orders;
create trigger svc_orders_wf before update of status on public.svc_orders for each row execute function public.svc_orders_wf();

-- Catatan kustom: aturan per status tujuan (setelah cek langkah/peran/catatan bawaan).
select public._prasara_patch('public.bb_record_move(uuid,uuid,text)',
  '  if t.require_approval and not member_can(r.kos_id, ''team'') then',
  '  perform wf_check(r.kos_id, ''bb:'' || r.object_id, p_to::text, jsonb_build_object(''data'', r.data, ''note'', p_note,
    ''total'', (select case when jsonb_typeof(r.data->o.money_field) = ''number'' then (r.data->>o.money_field)::numeric end from bb_objects o where o.id = r.object_id)));
  if t.require_approval and not member_can(r.kos_id, ''team'') then');

-- =====================================================================
-- 7. Persetujuan per alur: langkah pesanan jasa yang diminta aturan
-- =====================================================================
insert into public.approval_actions(code, label, risk, request_area, default_required, applies_to, sort) values
  ('langkah_pesanan_jasa', 'Langkah pesanan yang diatur aturan alur kerja', 'menengah', 'sell,ops', false, '{jasa}', 13)
on conflict (code) do nothing;

select public._prasara_patch('public.approval_request(uuid,text,jsonb,text)',
  '  elsif p_action = ''bb_pindah_status'' then',
  '  elsif p_action = ''langkah_pesanan_jasa'' then
    v_target := p_payload->>''order_id'';
    if coalesce(p_payload->>''to'', '''') not in (''siap'', ''selesai'') then raise exception ''Langkah tidak dikenal''; end if;
    select o.number || '' · '' || o.customer_name || '' → '' || case p_payload->>''to'' when ''siap'' then ''langsung siap'' else ''diserahkan'' end
      into v_sum from svc_orders o where o.id = v_target::uuid and o.kos_id = p_kos and o.status not in (''selesai'', ''batal'');
    if v_sum is null then raise exception ''Pesanan tidak ditemukan atau sudah selesai''; end if;
    v_sum := ''Langkah pesanan '' || v_sum;
    v_imp := jsonb_build_object(''pesanan'', v_sum, ''alasan'', p_reason, ''sisa_bayar'', (select total - svc_paid(id) from svc_orders where id = v_target::uuid));
  elsif p_action = ''bb_pindah_status'' then');

select public._prasara_patch('public.approval_decide_core(uuid,boolean,text)',
  '      when ''bb_pindah_status'' then',
  '      when ''langkah_pesanan_jasa'' then svc_order_move((ap.payload->>''order_id'')::uuid, ap.payload->>''to'', nullif(trim(coalesce(ap.payload->>''note'', '''')), ''''))
      when ''bb_pindah_status'' then');

-- Tindakan ini diatur dari menu Alur kerja, bukan sakelar di Persetujuan.
select public._prasara_patch('public.approval_rules_list(uuid)',
  'where t = any(a.applies_to));', 'where t = any(a.applies_to) and a.code <> ''langkah_pesanan_jasa'');');

-- =====================================================================
-- 8. Definisi, versi & pemulihan
-- =====================================================================
create or replace function public.wf_object(p_kos uuid, p_workflow text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if p_workflow not like 'bb:%' then return null; end if;
  begin v := substr(p_workflow, 4)::uuid; exception when others then raise exception 'Alur tidak dikenal'; end;
  if not exists (select 1 from bb_objects where id = v and kos_id = p_kos) then raise exception 'Jenis data tidak ditemukan'; end if;
  return v;
end $$;

create or replace function public.wf_definition(p_kos uuid, p_workflow text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_obj uuid; r jsonb := '{}';
begin
  if p_workflow = 'svc_order' then
    r := jsonb_build_object('stages', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active) order by sort, created_at)
                                                from svc_stages where kos_id = p_kos), '[]'));
  elsif p_workflow like 'bb:%' then
    v_obj := wf_object(p_kos, p_workflow);
    r := jsonb_build_object(
      'statuses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'tone', tone, 'is_initial', is_initial, 'is_final', is_final,
                              'sla_hours', sla_hours, 'active', active) order by sort, label) from bb_statuses where object_id = v_obj), '[]'),
      'transitions', coalesce((select jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'roles', roles, 'require_note', require_note,
                              'require_approval', require_approval) order by from_status nulls first, to_status) from bb_transitions where object_id = v_obj), '[]'));
  end if;
  return r || jsonb_build_object('rules', coalesce((select jsonb_agg(jsonb_build_object('point', point, 'name', name, 'cond', cond, 'action', action,
                                   'message', message, 'active', active) order by point, sort, created_at, name)
                                   from workflow_rules where kos_id = p_kos and workflow = p_workflow), '[]'));
end $$;

-- Versi awal disimpan sebelum perubahan pertama, agar keadaan semula selalu bisa dipulihkan.
create or replace function public.wf_baseline(p_kos uuid, p_workflow text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from workflow_versions where kos_id = p_kos and workflow = p_workflow) then return; end if;
  insert into workflow_versions(kos_id, workflow, version, definition, reason, actor)
  values (p_kos, p_workflow, 1, wf_definition(p_kos, p_workflow), 'Versi awal (sebelum perubahan pertama)', 'sistem');
end $$;

create or replace function public.wf_snapshot(p_kos uuid, p_workflow text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare d jsonb; l workflow_versions;
begin
  if coalesce(current_setting('prasara.wf_batch', true), '') = '1' then return null; end if;
  d := wf_definition(p_kos, p_workflow);
  select * into l from workflow_versions where kos_id = p_kos and workflow = p_workflow order by version desc limit 1;
  if l.id is not null and l.definition = d then return l.version; end if;
  insert into workflow_versions(kos_id, workflow, version, definition, reason, actor)
  values (p_kos, p_workflow, coalesce(l.version, 0) + 1, d, left(coalesce(p_reason, 'Perubahan alur'), 200), actor_email());
  return coalesce(l.version, 0) + 1;
end $$;
revoke all on function public.wf_baseline(uuid, text), public.wf_snapshot(uuid, text, text) from public, anon, authenticated;

select public._prasara_patch('public.svc_stages_save(uuid,jsonb)',
  '  perform svc_guard(p_kos, ''settings'');', '  perform svc_guard(p_kos, ''settings'');
  perform wf_baseline(p_kos, ''svc_order'');');
select public._prasara_patch('public.svc_stages_save(uuid,jsonb)',
  '  perform config_log(p_kos, ''ubah_tahap_jasa''', '  perform wf_snapshot(p_kos, ''svc_order'', ''Ubah tahap proses'');
  perform config_log(p_kos, ''ubah_tahap_jasa''');
select public._prasara_patch('public.bb_workflow_save(uuid,uuid,jsonb,jsonb)',
  '  if not exists (select 1 from bb_objects where id = p_object and kos_id = p_kos) then raise exception ''Jenis data tidak ditemukan''; end if;',
  '  if not exists (select 1 from bb_objects where id = p_object and kos_id = p_kos) then raise exception ''Jenis data tidak ditemukan''; end if;
  perform wf_baseline(p_kos, ''bb:'' || p_object);');
select public._prasara_patch('public.bb_workflow_save(uuid,uuid,jsonb,jsonb)',
  '  perform config_log(p_kos, ''builder_alur''', '  perform wf_snapshot(p_kos, ''bb:'' || p_object, ''Ubah status & langkah (Builder)'');
  perform config_log(p_kos, ''builder_alur''');

-- Penjaga: siapa boleh mengatur alur ini
create or replace function public.wf_guard(p_kos uuid, p_workflow text)
returns text language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur alur kerja'; end if;
  select business_type into t from kos where id = p_kos;
  if p_workflow = 'svc_order' then
    if t <> 'jasa' then raise exception 'Alur pesanan hanya untuk bisnis jasa'; end if;
  elsif p_workflow like 'bb:%' then
    if t <> 'kustom' then raise exception 'Alur catatan hanya untuk bisnis kustom'; end if;
    perform wf_object(p_kos, p_workflow);
  else raise exception 'Alur ini mengikuti aturan bawaan sistem dan tidak bisa diberi aturan bersyarat';
  end if;
  return t;
end $$;

create or replace function public.wf_restore(p_kos uuid, p_version bigint)
returns int language plpgsql security definer set search_path = public as $$
declare v workflow_versions; d jsonb; arr jsonb := '[]'; ids uuid[] := '{}'; v_obj uuid; x jsonb; rules jsonb := '[]'; i int; v_new int;
begin
  select * into v from workflow_versions where id = p_version and kos_id = p_kos;
  if v.id is null then raise exception 'Versi tidak ditemukan'; end if;
  perform wf_guard(p_kos, v.workflow);
  d := v.definition;
  perform set_config('prasara.wf_batch', '1', true);
  if v.workflow = 'svc_order' then
    for x in select * from jsonb_array_elements(d->'stages') loop
      arr := arr || jsonb_build_array(case when exists (select 1 from svc_stages where id = (x->>'id')::uuid and kos_id = p_kos) then x else x - 'id' end);
    end loop;
    arr := arr || coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', false) order by s.sort)
                            from svc_stages s where s.kos_id = p_kos and s.active
                              and not exists (select 1 from jsonb_array_elements(d->'stages') y where y->>'id' = s.id::text)), '[]');
    perform svc_stages_save(p_kos, arr);
  else
    v_obj := wf_object(p_kos, v.workflow);
    for x in select * from jsonb_array_elements(d->'statuses') loop
      if not exists (select 1 from bb_statuses where id = (x->>'id')::uuid and object_id = v_obj) then raise exception 'Status "%" sudah tidak ada; versi ini tidak bisa dipulihkan', x->>'label'; end if;
      arr := arr || jsonb_build_array(x); ids := ids || (x->>'id')::uuid;
    end loop;
    for x in select jsonb_build_object('id', s.id, 'label', s.label, 'tone', s.tone, 'is_initial', false, 'is_final', s.is_final, 'sla_hours', s.sla_hours, 'active', false)
             from bb_statuses s where s.object_id = v_obj and s.active and not (s.id = any(ids)) order by s.sort loop
      arr := arr || jsonb_build_array(x); ids := ids || (x->>'id')::uuid;
    end loop;
    for x in select * from jsonb_array_elements(d->'transitions') loop
      rules := rules || jsonb_build_array(jsonb_build_object(
        'from', case when x->>'from' is null then null else array_position(ids, (x->>'from')::uuid) - 1 end,
        'to', array_position(ids, (x->>'to')::uuid) - 1, 'roles', x->'roles', 'require_note', x->'require_note', 'require_approval', x->'require_approval'));
    end loop;
    perform bb_workflow_save(p_kos, v_obj, arr, rules);
  end if;
  delete from workflow_rules where kos_id = p_kos and workflow = v.workflow;
  i := 0;
  for x in select * from jsonb_array_elements(d->'rules') loop
    i := i + 1;
    insert into workflow_rules(kos_id, workflow, point, name, cond, action, message, active, sort, updated_by)
    values (p_kos, v.workflow, x->>'point', x->>'name', coalesce(x->'cond', '{}'), x->>'action', x->>'message',
            coalesce((x->>'active')::boolean, true) and (x->>'action' <> 'persetujuan' or plan_has(p_kos, 'persetujuan')), i, actor_email());
  end loop;
  perform set_config('prasara.wf_batch', '', true);
  v_new := wf_snapshot(p_kos, v.workflow, 'Pulihkan versi ' || v.version);
  perform config_log(p_kos, 'pulihkan_alur', v.workflow, null, jsonb_build_object('versi', v.version), null, 'menengah', actor_email());
  return v_new;
end $$;

-- =====================================================================
-- 9. Aturan: simpan / hapus
-- =====================================================================
create or replace function public.wf_points(p_kos uuid, p_workflow text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_obj uuid;
begin
  if p_workflow = 'svc_order' then
    return '[{"code":"lewati_tahap","label":"Langsung siap (melewati tahap)","actions":["tolak","persetujuan"],"conds":["total_min","total_max","antar"]},
             {"code":"serahkan","label":"Diserahkan ke pelanggan","actions":["tolak","persetujuan","catatan"],"conds":["belum_lunas","sudah_bayar","total_min","total_max","antar"]},
             {"code":"batal","label":"Pesanan dibatalkan","actions":["tolak","persetujuan"],"conds":["sudah_bayar","total_min","total_max","antar"]}]'::jsonb;
  end if;
  v_obj := wf_object(p_kos, p_workflow);
  return coalesce((select jsonb_agg(jsonb_build_object('code', s.id, 'label', 'Pindah ke ' || s.label, 'actions', '["tolak","persetujuan","catatan"]'::jsonb,
           'conds', case when o.money_field is not null then '["fields","total_min","total_max"]'::jsonb else '["fields"]'::jsonb end) order by s.sort)
         from bb_statuses s join bb_objects o on o.id = s.object_id where s.object_id = v_obj and s.active and not s.is_initial), '[]');
end $$;

create or replace function public.wf_rule_save(p_kos uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_wf text := p->>'workflow'; v_id uuid := nullif(p->>'id', '')::uuid; old workflow_rules; pt jsonb; c jsonb := '{}'; f jsonb; fl jsonb := '[]';
  bf bb_fields; v_obj uuid; v_action text := p->>'action'; v_active boolean := coalesce((p->>'active')::boolean, true); k text; n numeric;
begin
  if v_id is not null then
    select * into old from workflow_rules where id = v_id and kos_id = p_kos;
    if old.id is null then raise exception 'Aturan tidak ditemukan'; end if;
    v_wf := old.workflow;
  end if;
  perform wf_guard(p_kos, v_wf);
  v_obj := case when v_wf like 'bb:%' then wf_object(p_kos, v_wf) end;
  perform wf_baseline(p_kos, v_wf);
  if coalesce((p->>'delete')::boolean, false) then
    if old.id is null then raise exception 'Aturan tidak ditemukan'; end if;
    delete from workflow_rules where id = old.id;
    perform wf_snapshot(p_kos, v_wf, 'Hapus aturan: ' || old.name);
    perform config_log(p_kos, 'hapus_aturan_alur', old.name, to_jsonb(old), null, null, 'menengah', actor_email());
    return old.id;
  end if;
  select x into pt from jsonb_array_elements(wf_points(p_kos, v_wf)) x where x->>'code' = p->>'point';
  if pt is null then raise exception 'Pilih langkah yang diatur'; end if;
  if not (pt->'actions' ? v_action) then raise exception 'Tindakan ini tidak tersedia untuk langkah "%"', pt->>'label'; end if;
  if v_action = 'persetujuan' and v_active and not plan_has(p_kos, 'persetujuan')
     and not (old.id is not null and old.action = 'persetujuan' and old.active) then
    raise exception 'BATAS_PAKET: Aturan alur yang meminta persetujuan tersedia mulai Paket Bisnis. Aturan "tolak" dan "wajib catatan" tetap bisa dipakai.';
  end if;
  if coalesce(length(trim(p->>'name')), 0) < 3 then raise exception 'Beri nama aturan (minimal 3 huruf)'; end if;
  -- kondisi: hanya kunci yang dikenal untuk langkah ini
  for k in select jsonb_object_keys(coalesce(p->'cond', '{}')) loop
    if not (pt->'conds' ? k) then raise exception 'Syarat "%" tidak tersedia untuk langkah ini', k; end if;
    if k in ('total_min', 'total_max') then
      n := wf_num(p->'cond'->k);
      if n is null or n < 0 then raise exception 'Isi nilai rupiah yang benar'; end if;
      c := c || jsonb_build_object(k, round(n, 2));
    elsif k in ('belum_lunas', 'sudah_bayar', 'antar') then
      c := c || jsonb_build_object(k, coalesce((p->'cond'->>k)::boolean, false));
    elsif k = 'fields' then
      if jsonb_typeof(p->'cond'->'fields') <> 'array' or jsonb_array_length(p->'cond'->'fields') > 5 then raise exception 'Maksimal 5 syarat isian'; end if;
      for f in select * from jsonb_array_elements(p->'cond'->'fields') loop
        select * into bf from bb_fields where object_id = v_obj and key = f->>'key' and active;
        if bf.id is null then raise exception 'Isian "%" tidak ditemukan', f->>'key'; end if;
        if coalesce(f->>'op', '') not in ('isi', 'kosong', '=', '!=', '>=', '<=', '>', '<') then raise exception 'Pembanding tidak dikenal'; end if;
        if f->>'op' in ('>=', '<=', '>', '<') then
          if bf.type not in ('number', 'currency') then raise exception 'Isian "%" bukan angka', bf.label; end if;
          if wf_num(f->'value') is null then raise exception 'Isi angka pembanding untuk "%"', bf.label; end if;
        end if;
        if f->>'op' in ('=', '!=') and coalesce(length(trim(f->>'value')), 0) = 0 then raise exception 'Isi nilai pembanding untuk "%"', bf.label; end if;
        fl := fl || jsonb_build_array(jsonb_build_object('key', bf.key, 'op', f->>'op', 'value', case when f->>'op' in ('isi', 'kosong') then null else f->'value' end));
      end loop;
      if jsonb_array_length(fl) > 0 then c := c || jsonb_build_object('fields', fl); end if;
    end if;
  end loop;
  if old.id is null and (select count(*) from workflow_rules where kos_id = p_kos and workflow = v_wf) >= 20 then raise exception 'Maksimal 20 aturan per alur'; end if;
  if old.id is null then
    insert into workflow_rules(kos_id, workflow, point, name, cond, action, message, active, sort, updated_by)
    values (p_kos, v_wf, p->>'point', trim(p->>'name'), c, v_action, nullif(trim(coalesce(p->>'message', '')), ''), v_active,
            (select coalesce(max(sort), 0) + 1 from workflow_rules where kos_id = p_kos and workflow = v_wf), actor_email())
    returning id into v_id;
  else
    update workflow_rules set point = p->>'point', name = trim(p->>'name'), cond = c, action = v_action, message = nullif(trim(coalesce(p->>'message', '')), ''),
      active = v_active, updated_at = now(), updated_by = actor_email() where id = old.id;
  end if;
  perform wf_snapshot(p_kos, v_wf, case when old.id is null then 'Tambah aturan: ' else 'Ubah aturan: ' end || trim(p->>'name'));
  perform config_log(p_kos, 'ubah_aturan_alur', trim(p->>'name'), case when old.id is not null then to_jsonb(old) end,
    jsonb_build_object('workflow', v_wf, 'point', p->>'point', 'cond', c, 'action', v_action, 'active', v_active), null, 'menengah', actor_email());
  return v_id;
end $$;

-- =====================================================================
-- 10. Template tahap
-- =====================================================================
create or replace function public.wf_templates_for(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos;
begin
  select * into k from kos where id = p_kos;
  return coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'description', t.description, 'stages', to_jsonb(t.stages), 'rules', t.rules,
           'match', k.subcategory_code = any(t.subcategories), 'fit', t.templates = '{}' or k.template_code = any(t.templates))
           order by (k.subcategory_code = any(t.subcategories)) desc, (k.template_code = any(t.templates)) desc, t.sort)
         from workflow_templates t where t.workflow = 'svc_order'), '[]');
end $$;

create or replace function public.wf_template_apply(p_kos uuid, p_code text, p_with_rules boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t workflow_templates; arr jsonb := '[]'; nm text; v_id uuid; used uuid[] := '{}'; r jsonb; n_add int := 0; n_skip int := 0;
begin
  perform wf_guard(p_kos, 'svc_order');
  select * into t from workflow_templates where code = p_code and workflow = 'svc_order';
  if t.code is null then raise exception 'Template tidak ditemukan'; end if;
  perform wf_baseline(p_kos, 'svc_order');
  perform set_config('prasara.wf_batch', '1', true);
  foreach nm in array t.stages loop
    select id into v_id from svc_stages where kos_id = p_kos and lower(trim(name)) = lower(nm) and not (id = any(used)) order by active desc, sort limit 1;
    if v_id is not null then used := used || v_id; arr := arr || jsonb_build_array(jsonb_build_object('id', v_id, 'name', nm, 'active', true));
    else arr := arr || jsonb_build_array(jsonb_build_object('name', nm, 'active', true)); end if;
  end loop;
  arr := arr || coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', false) order by sort)
                          from svc_stages where kos_id = p_kos and active and not (id = any(used))), '[]');
  perform svc_stages_save(p_kos, arr);
  if p_with_rules then
    for r in select * from jsonb_array_elements(t.rules) loop
      if (r->>'action' = 'persetujuan' and not plan_has(p_kos, 'persetujuan'))
         or exists (select 1 from workflow_rules where kos_id = p_kos and workflow = 'svc_order' and point = r->>'point' and action = r->>'action' and cond = coalesce(r->'cond', '{}')) then
        n_skip := n_skip + 1; continue;
      end if;
      insert into workflow_rules(kos_id, workflow, point, name, cond, action, active, sort, updated_by)
      values (p_kos, 'svc_order', r->>'point', r->>'name', coalesce(r->'cond', '{}'), r->>'action', true,
              (select coalesce(max(sort), 0) + 1 from workflow_rules where kos_id = p_kos and workflow = 'svc_order'), actor_email());
      n_add := n_add + 1;
    end loop;
  end if;
  perform set_config('prasara.wf_batch', '', true);
  perform wf_snapshot(p_kos, 'svc_order', 'Pakai template: ' || t.name);
  perform config_log(p_kos, 'template_alur', t.name, null, jsonb_build_object('template', t.code, 'aturan', p_with_rules), null, 'menengah', actor_email());
  return jsonb_build_object('stages', cardinality(t.stages), 'rules_added', n_add, 'rules_skipped', n_skip);
end $$;

-- =====================================================================
-- 11. Bukti proses (Business Process Recognition) — dihitung dari data nyata 90 hari
-- =====================================================================
create or replace function public.wf_ev(p_kos uuid, p_ev text)
returns int language plpgsql stable security definer set search_path = public as $$
declare a text[] := string_to_array(p_ev, ':'); s timestamptz := now() - interval '90 days'; d date := (now() at time zone 'Asia/Jakarta')::date - 90; n int; v_obj uuid;
begin
  if a[1] in ('bb', 'bbst', 'bbf') then
    select id into v_obj from bb_objects where kos_id = p_kos and key = a[2] and active;
    if v_obj is null then return 0; end if;
  end if;
  case a[1]
    when 'belanja' then select count(*) into n from purchases where kos_id = p_kos and purchase_date >= d and status <> 'batal';
    when 'terima' then select count(*) into n from purchases where kos_id = p_kos and purchase_date >= d and status in ('sebagian', 'selesai');
    when 'stok' then select count(*) into n from stock_moves where kos_id = p_kos and created_at >= s;
    when 'produk' then select count(*) into n from products where kos_id = p_kos and active;
    when 'jual' then select count(*) into n from sales where kos_id = p_kos and sale_date >= d and status = 'selesai';
    when 'bayar_jual' then select count(*) into n from sales where kos_id = p_kos and sale_date >= d and status = 'selesai' and coalesce(amt_tunai, 0) + coalesce(amt_transfer, 0) > 0;
    when 'so' then select count(*) into n from so_orders where kos_id = p_kos and order_date >= d;
    when 'so_konfirm' then select count(*) into n from so_orders where kos_id = p_kos and order_date >= d and status in ('dikonfirmasi', 'sebagian', 'selesai');
    when 'so_kirim' then select count(*) into n from so_deliveries where kos_id = p_kos and ship_date >= d;
    when 'so_faktur' then select count(*) into n from so_deliveries where kos_id = p_kos and ship_date >= d and sale_id is not null;
    when 'piutang_lunas' then select count(*) into n from debt_payments where kos_id = p_kos and kind = 'piutang' and status = 'selesai' and date >= d;
    when 'resep' then select count(distinct service_id) into n from svc_recipes where kos_id = p_kos;
    when 'resep_pakai' then select count(*) into n from svc_orders where kos_id = p_kos and recipe_done_at >= s;
    when 'pesanan' then select count(*) into n from svc_orders where kos_id = p_kos and received_at >= s and status not in ('batal', 'permintaan');
    when 'tahap' then
      select count(*) into n from svc_events e where e.kos_id = p_kos and e.kind = 'status' and e.created_at >= s
        and exists (select 1 from svc_stages st where st.kos_id = p_kos and st.name = split_part(e.text, ' · ', 1) and (a[2] is null or st.name ~* a[2]));
    when 'siap' then select count(*) into n from svc_orders where kos_id = p_kos and received_at >= s and status in ('siap', 'selesai');
    when 'serah' then select count(*) into n from svc_orders where kos_id = p_kos and completed_at >= s and status = 'selesai';
    when 'bayar_jasa' then select count(*) into n from svc_payments where kos_id = p_kos and paid_at >= s and kind = 'bayar' and status = 'selesai';
    when 'kamar' then select count(*) into n from rooms where kos_id = p_kos;
    when 'booking' then select count(*) into n from bookings where kos_id = p_kos and created_at >= s;
    when 'sewa' then select count(*) into n from leases where kos_id = p_kos and (status = 'aktif' or start_date >= d);
    when 'tagihan' then select count(*) into n from invoices where kos_id = p_kos and created_at >= s and status = 'terbit';
    when 'bayar_kos' then select count(*) into n from payments where kos_id = p_kos and created_at >= s and status = 'terverifikasi';
    when 'perbaikan' then select count(*) into n from maint_tickets where kos_id = p_kos and created_at >= s;
    when 'bb' then select count(*) into n from bb_records where object_id = v_obj and created_at >= s;
    when 'bbst' then
      select count(*) into n from (
        select r.id from bb_records r join bb_statuses st on st.id = r.status_id where r.object_id = v_obj and st.label ~* a[3]
        union
        select e.record_id from bb_events e join bb_records r on r.id = e.record_id
        where r.object_id = v_obj and e.kind = 'status' and e.created_at >= s and split_part(split_part(e.text, ' → ', 2), ' · ', 1) ~* a[3]) z;
    when 'bbf' then
      select count(*) into n from bb_records where object_id = v_obj and archived_at is null and coalesce(wf_num(data->a[3]), 0) > 0;
    else n := 0;
  end case;
  return coalesce(n, 0);
end $$;
revoke all on function public.wf_ev(uuid, text) from public, anon, authenticated;

-- Peta proses: langkah berjalan / otomatis / belum dipakai / belum diatur / nonaktif
create or replace function public.process_map(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; bp business_processes; st jsonb; res jsonb := '[]'; steps jsonb; v_state text; n int; v_models jsonb; done int; total int;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  select * into k from kos where id = p_kos;
  v_models := coalesce(dna_effective(p_kos)->'models', '[]');
  for bp in select * from business_processes where active and k.business_type = any(engines)
              and (templates = '{}' or k.template_code = any(templates)) and not (coalesce(k.template_code, '') = any(not_templates))
            order by sort loop
    if (bp.show_if_module is not null or bp.show_if_models <> '{}')
       and not ((bp.show_if_module is not null and module_on(p_kos, bp.show_if_module))
                or exists (select 1 from jsonb_array_elements_text(v_models) m where m = any(bp.show_if_models))) then
      continue;
    end if;
    steps := '[]'; done := 0; total := 0;
    for st in select * from jsonb_array_elements(bp.steps) loop
      n := null;
      if st->>'module' is not null and not module_on(p_kos, st->>'module') then v_state := 'nonaktif';
      elsif st->>'stage' is not null and not exists (select 1 from svc_stages where kos_id = p_kos and active and name ~* (st->>'stage')) then v_state := 'belum_diatur';
      else
        n := wf_ev(p_kos, st->>'ev');
        v_state := case when coalesce((st->>'auto')::boolean, false) then case when n > 0 then 'otomatis' else 'menunggu' end
                        when n > 0 then 'berjalan' else 'belum_dipakai' end;
      end if;
      if not coalesce((st->>'optional')::boolean, false) then
        total := total + 1;
        if v_state in ('berjalan', 'otomatis') then done := done + 1; end if;
      end if;
      steps := steps || jsonb_build_array(jsonb_build_object('key', st->>'key', 'name', st->>'name', 'path', st->>'path', 'module', st->>'module',
        'state', v_state, 'count', case when coalesce((st->>'auto')::boolean, false) then null else n end, 'optional', coalesce((st->>'optional')::boolean, false)));
    end loop;
    res := res || jsonb_build_array(jsonb_build_object('code', bp.code, 'name', bp.name, 'description', bp.description, 'version', bp.version,
      'steps', steps, 'done', done, 'total', total));
  end loop;
  -- Bisnis kustom tanpa peta khusus: alur dari jenis data yang aktif
  if k.business_type = 'kustom' and jsonb_array_length(res) = 0 then
    steps := coalesce((select jsonb_agg(jsonb_build_object('key', o.key, 'name', o.name, 'path', '/catatan/' || o.key, 'state', case when c.n > 0 then 'berjalan' else 'belum_dipakai' end,
               'count', c.n, 'optional', false) order by o.sort)
             from bb_objects o cross join lateral (select count(*)::int n from bb_records r where r.object_id = o.id and r.created_at >= now() - interval '90 days') c
             where o.kos_id = p_kos and o.active), '[]');
    if jsonb_array_length(steps) > 0 then
      res := jsonb_build_array(jsonb_build_object('code', 'kustom', 'name', 'Alur usaha', 'description', 'Disusun dari jenis data bisnis Anda.', 'version', 1, 'steps', steps,
        'done', (select count(*) from jsonb_array_elements(steps) x where x->>'state' = 'berjalan'), 'total', jsonb_array_length(steps)));
    end if;
  end if;
  return res;
end $$;

-- =====================================================================
-- 12. Registry & detail alur
-- =====================================================================
create or replace function public.wf_counts(p_kos uuid, w workflow_definitions)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_open text[];
begin
  select coalesce(array_agg(x->>'k'), '{}') into v_open from jsonb_array_elements(w.statuses) x where not coalesce((x->>'f')::boolean, false);
  execute format('select coalesce(jsonb_object_agg(status, n), ''{}'') from (select status, count(*) n from public.%I where kos_id = $1 and (status = any($2) or %I >= now() - interval ''90 days'') group by status) z',
                 w.entity, w.datecol) into r using p_kos, v_open;
  return r;
end $$;
revoke all on function public.wf_counts(uuid, workflow_definitions) from public, anon, authenticated;

create or replace function public.wf_stage_stats(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with ev as (
    select order_id, split_part(text, ' · ', 1) nm, created_at, lead(created_at) over (partition by order_id order by created_at, id) nxt
    from svc_events where kos_id = p_kos and kind = 'status' and created_at >= now() - interval '60 days')
  select coalesce(jsonb_object_agg(s.id::text, jsonb_build_object('n', z.n, 'hours', z.h)), '{}')
  from svc_stages s join (select nm, count(*) n, round(avg(extract(epoch from nxt - created_at) / 3600)::numeric, 1) h
                          from ev where nxt is not null group by nm) z on z.nm = s.name
  where s.kos_id = p_kos and s.active;
$$;
revoke all on function public.wf_stage_stats(uuid) from public, anon, authenticated;

create or replace function public.workflow_registry(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; w workflow_definitions; res jsonb := '[]'; cnt jsonb; sts jsonb; o bb_objects; v_open int;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  select * into k from kos where id = p_kos;
  for w in select * from workflow_definitions where k.business_type = any(engines) and (templates = '{}' or k.template_code = any(templates)) order by sort loop
    if w.module is not null and not module_on(p_kos, w.module) then continue; end if;
    cnt := wf_counts(p_kos, w);
    sts := '[]';
    select coalesce(jsonb_agg(x order by i, j), '[]') into sts from (
      select jsonb_build_object('k', s->>'k', 'l', s->>'l', 'f', coalesce((s->>'f')::boolean, false), 'n', coalesce((cnt->>(s->>'k'))::int, 0)) x, i, 0 j
      from jsonb_array_elements(w.statuses) with ordinality s(s, i) where s->>'k' <> '@tahap'
      union all
      select jsonb_build_object('k', st.id, 'l', st.name, 'f', false, 'stage', true,
               'n', (select count(*) from svc_orders o2 where o2.stage_id = st.id and o2.status = 'proses')) x,
             (select i from jsonb_array_elements(w.statuses) with ordinality s(s, i) where s->>'k' = '@tahap'), st.sort j
      from svc_stages st where w.code = 'svc_order' and st.kos_id = p_kos and st.active) z;
    select coalesce(sum((x->>'n')::int), 0) into v_open from jsonb_array_elements(sts) x where not (x->>'f')::boolean and not coalesce((x->>'stage')::boolean, false);
    res := res || jsonb_build_array(jsonb_build_object('code', w.code, 'name', w.name, 'description', w.description, 'kind', case when w.editable && '{tahap,aturan}' then 'atur' else 'standar' end,
      'path', w.path, 'statuses', sts, 'open', v_open, 'editable', to_jsonb(w.editable),
      'rules', (select count(*) from workflow_rules where kos_id = p_kos and workflow = w.code and active),
      'version', (select max(version) from workflow_versions where kos_id = p_kos and workflow = w.code)));
  end loop;
  if k.business_type = 'kustom' then
    for o in select * from bb_objects where kos_id = p_kos and active and workflow order by sort loop
      select coalesce(jsonb_agg(jsonb_build_object('k', s.id, 'l', s.label, 'f', s.is_final, 'tone', s.tone,
               'n', (select count(*) from bb_records r where r.status_id = s.id and r.archived_at is null),
               'late', case when s.sla_hours is not null then (select count(*) from bb_records r where r.status_id = s.id and r.archived_at is null
                              and r.status_since < now() - make_interval(hours => s.sla_hours)) end) order by s.sort), '[]')
        into sts from bb_statuses s where s.object_id = o.id and s.active;
      res := res || jsonb_build_array(jsonb_build_object('code', 'bb:' || o.id, 'name', o.name, 'icon', o.icon, 'description', 'Jenis data ' || o.name || ' — status & langkah disusun di Builder.',
        'kind', 'kustom', 'path', '/catatan/' || o.key, 'statuses', sts,
        'open', (select coalesce(sum((x->>'n')::int), 0) from jsonb_array_elements(sts) x where not (x->>'f')::boolean),
        'editable', '["status","aturan"]'::jsonb,
        'rules', (select count(*) from workflow_rules where kos_id = p_kos and workflow = 'bb:' || o.id and active),
        'version', (select max(version) from workflow_versions where kos_id = p_kos and workflow = 'bb:' || o.id)));
    end loop;
  end if;
  return res;
end $$;

create or replace function public.workflow_detail(p_kos uuid, p_workflow text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare item jsonb; w workflow_definitions; r jsonb; v_obj uuid; v_actions text[];
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  select x into item from jsonb_array_elements(workflow_registry(p_kos)) x where x->>'code' = p_workflow;
  if item is null then raise exception 'Alur tidak ditemukan atau modulnya belum aktif'; end if;
  select * into w from workflow_definitions where code = p_workflow;
  v_actions := case when p_workflow like 'bb:%' then '{bb_pindah_status}' else coalesce(w.approvals, '{}') end;
  r := item || jsonb_build_object(
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label, 'required', approval_required(p_kos, a.code), 'by_rule', a.code = 'langkah_pesanan_jasa') order by a.sort)
                           from approval_actions a where a.code = any(v_actions)), '[]'),
    'recent_approvals', coalesce((select jsonb_agg(jsonb_build_object('number', ap.number, 'summary', ap.summary, 'status', ap.status, 'at', ap.created_at, 'by', ap.requested_email) order by ap.created_at desc)
                                  from (select * from approvals ap where ap.kos_id = p_kos and ap.action_code = any(v_actions)
                                          and (p_workflow not like 'bb:%' or exists (select 1 from bb_records br where br.id::text = ap.target and 'bb:' || br.object_id = p_workflow))
                                        order by created_at desc limit 10) ap), '[]'),
    'plan_persetujuan', plan_has(p_kos, 'persetujuan'));
  if p_workflow = 'svc_order' or p_workflow like 'bb:%' then
    r := r || jsonb_build_object(
      'rules_list', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'point', point, 'name', name, 'cond', cond, 'action', action, 'message', message, 'active', active) order by sort, created_at)
                              from workflow_rules where kos_id = p_kos and workflow = p_workflow), '[]'),
      'points', wf_points(p_kos, p_workflow),
      'versions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version', version, 'reason', reason, 'actor', actor, 'at', created_at,
                     'size', coalesce(jsonb_array_length(definition->'stages'), jsonb_array_length(definition->'statuses')), 'rules', jsonb_array_length(definition->'rules')) order by version desc)
                   from (select * from workflow_versions where kos_id = p_kos and workflow = p_workflow order by version desc limit 20) v), '[]'));
  end if;
  if p_workflow = 'svc_order' then
    r := r || jsonb_build_object('templates', wf_templates_for(p_kos), 'stage_stats', wf_stage_stats(p_kos),
      'kuliner', (select template_code = 'kuliner' from kos where id = p_kos));
  elsif p_workflow like 'bb:%' then
    v_obj := wf_object(p_kos, p_workflow);
    r := r || jsonb_build_object('fields', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'type', type, 'choices', to_jsonb(choices)) order by sort)
                                                     from bb_fields where object_id = v_obj and active and type not in ('longtext', 'reference')), '[]'),
      'money_field', (select money_field from bb_objects where id = v_obj));
  end if;
  return r;
end $$;

-- =====================================================================
-- 13. Saran alur (Workflow Recommendations) — aturan tetap, data nyata, tanpa mengubah apa pun sendiri
-- =====================================================================
create or replace function public.workflow_recommendations(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; res jsonb := '[]'; t workflow_templates; v_names text; v_match int; st record; o record; pm jsonb; s jsonb; p jsonb;
  n_done int; n_skip int; n_debt int; n_late int; v_med numeric; v_has_tpl boolean := false; v_act int; dec workflow_reco_decisions; x jsonb; out jsonb := '[]';
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  select * into k from kos where id = p_kos;
  if k.business_type = 'jasa' and module_on(p_kos, 'j_pesanan') then
    select coalesce(string_agg(lower(name), '|' order by sort), ''), count(*) into v_names, v_act from svc_stages where kos_id = p_kos and active;
    -- R1: template alur yang cocok dengan subkategori
    select * into t from workflow_templates where workflow = 'svc_order' and (k.subcategory_code = any(subcategories)) order by sort limit 1;
    if t.code is null then select * into t from workflow_templates where workflow = 'svc_order' and k.template_code = any(templates) and subcategories = '{}' order by sort limit 1; end if;
    if t.code is null and k.template_code = 'laundry' then select * into t from workflow_templates where code = 'laundry_kiloan'; end if;
    if t.code is null and k.template_code = 'kuliner' then select * into t from workflow_templates where code = 'kuliner_dapur'; end if;
    if t.code is not null then
      select count(*) into v_match from unnest(t.stages) z where lower(z) = any(string_to_array(v_names, '|'));
      if v_match * 2 < cardinality(t.stages) then
        v_has_tpl := true;
        res := res || jsonb_build_array(jsonb_build_object('code', 'template', 'hash', md5(t.code || ':' || v_names), 'kind', 'alur',
          'title', 'Alur siap pakai: ' || t.name,
          'reason', 'Tahap pesanan Anda belum mengikuti alur umum usaha sejenis. Usulan: ' || array_to_string(t.stages, ' → ') || '.',
          'data', jsonb_build_object('tahap_sekarang', v_act, 'cocok', v_match),
          'action', jsonb_build_object('type', 'template', 'code', t.code, 'label', 'Pakai alur ini')));
      end if;
    end if;
    -- R2: belum ada tahap cek kualitas (bukan kuliner)
    if not v_has_tpl and coalesce(k.template_code, '') <> 'kuliner' and v_act > 0 and v_names !~* '(kualitas|qc|cek hasil|cek akhir|uji|review|periksa)' then
      res := res || jsonb_build_array(jsonb_build_object('code', 'qc', 'hash', md5(v_names), 'kind', 'alur',
        'title', 'Tambahkan tahap Cek kualitas',
        'reason', 'Belum ada tahap pemeriksaan hasil sebelum pesanan siap. Tahap ini membantu mencegah keluhan pelanggan.',
        'data', jsonb_build_object('tahap_sekarang', v_act), 'action', jsonb_build_object('type', 'stage', 'name', 'Cek kualitas', 'label', 'Tambahkan tahap')));
    end if;
    -- R3: tahap paling lama (hambatan) — rata-rata ≥ 2× median tahap lain, minimal 5 pesanan
    for st in select s.id, s.name, (j->>'n')::int n, (j->>'hours')::numeric h from svc_stages s cross join lateral (select wf_stage_stats(p_kos)->(s.id::text) j) z
              where s.kos_id = p_kos and s.active and z.j is not null and (z.j->>'n')::int >= 5 order by (z.j->>'hours')::numeric desc limit 1 loop
      select percentile_cont(0.5) within group (order by (v->>'hours')::numeric) into v_med from jsonb_each(wf_stage_stats(p_kos)) e(kk, v) where kk <> st.id::text;
      if v_med is not null and v_med > 0 and st.h >= 2 * v_med and st.h >= (array[4, 0.5])[1 + (coalesce(k.template_code, '') = 'kuliner')::int] then
        res := res || jsonb_build_array(jsonb_build_object('code', 'macet:' || st.id, 'hash', st.id::text, 'kind', 'evaluasi',
          'title', 'Tahap "' || st.name || '" paling lama',
          'reason', 'Rata-rata ' || st.h || ' jam per pesanan (' || st.n || ' pesanan, 60 hari), lebih dari dua kali tahap lain (' || round(v_med, 1) || ' jam). Periksa kapasitas atau pembagian tugas di tahap ini.',
          'data', jsonb_build_object('jam', st.h, 'pesanan', st.n, 'median_lain', round(v_med, 1)), 'action', jsonb_build_object('type', 'open', 'workflow', 'svc_order', 'label', 'Lihat alur')));
      end if;
    end loop;
    -- R4: tahap sering dilewati (≥ 50% dari minimal 10 pesanan selesai dalam 30 hari)
    if v_act > 0 then
      select count(*), count(*) filter (where vis < v_act) into n_done, n_skip from (
        select o2.id, (select count(distinct split_part(e.text, ' · ', 1)) from svc_events e join svc_stages s2 on s2.kos_id = p_kos and s2.active and s2.name = split_part(e.text, ' · ', 1)
                       where e.order_id = o2.id and e.kind = 'status') vis
        from svc_orders o2 where o2.kos_id = p_kos and o2.status = 'selesai' and o2.completed_at >= now() - interval '30 days') z;
      if n_done >= 10 and n_skip * 2 >= n_done and not exists (select 1 from workflow_rules where kos_id = p_kos and workflow = 'svc_order' and point = 'lewati_tahap' and active) then
        res := res || jsonb_build_array(jsonb_build_object('code', 'lompat', 'hash', md5(v_names || ':lompat'), 'kind', 'aturan',
          'title', 'Tahap sering dilewati',
          'reason', n_skip || ' dari ' || n_done || ' pesanan selesai (30 hari) tidak melewati semua tahap. Sederhanakan tahap, atau minta persetujuan bila karyawan melewati tahap.',
          'data', jsonb_build_object('dilewati', n_skip, 'selesai', n_done),
          'action', jsonb_build_object('type', 'rule', 'label', 'Buat aturan', 'needs_plan', not plan_has(p_kos, 'persetujuan'),
            'rule', jsonb_build_object('point', 'lewati_tahap', 'name', 'Persetujuan bila melewati tahap', 'action', 'persetujuan', 'cond', '{}'::jsonb))));
      end if;
    end if;
    -- R5: sering diserahkan belum lunas (≥ 20% dari minimal 10 pesanan, 30 hari)
    select count(*), count(*) filter (where e.text like '%belum lunas%') into n_done, n_debt
    from svc_events e where e.kos_id = p_kos and e.kind = 'status' and e.created_at >= now() - interval '30 days' and (e.text like 'Sudah %' );
    if n_done >= 10 and n_debt * 5 >= n_done and not exists (select 1 from workflow_rules where kos_id = p_kos and workflow = 'svc_order' and point = 'serahkan' and active) then
      res := res || jsonb_build_array(jsonb_build_object('code', 'serah_utang', 'hash', 'serah_utang', 'kind', 'aturan',
        'title', 'Banyak pesanan diserahkan belum lunas',
        'reason', n_debt || ' dari ' || n_done || ' penyerahan (30 hari) masih menyisakan tagihan. Pertimbangkan aturan: penyerahan belum lunas oleh karyawan perlu persetujuan.',
        'data', jsonb_build_object('belum_lunas', n_debt, 'diserahkan', n_done),
        'action', jsonb_build_object('type', 'rule', 'label', 'Buat aturan', 'needs_plan', not plan_has(p_kos, 'persetujuan'),
          'rule', jsonb_build_object('point', 'serahkan', 'name', 'Persetujuan bila diserahkan belum lunas', 'action', 'persetujuan', 'cond', '{"belum_lunas": true}'::jsonb))));
    end if;
    -- R6: banyak terlambat (> 30% dari minimal 10 pesanan)
    select count(*), count(*) filter (where completed_at > due_at) into n_done, n_late
    from svc_orders where kos_id = p_kos and status = 'selesai' and due_at is not null and completed_at >= now() - interval '30 days';
    if n_done >= 10 and n_late * 10 > n_done * 3 then
      res := res || jsonb_build_array(jsonb_build_object('code', 'telat', 'hash', 'telat', 'kind', 'evaluasi',
        'title', 'Banyak pesanan terlambat',
        'reason', n_late || ' dari ' || n_done || ' pesanan (30 hari) selesai melewati janji. Periksa tahap paling lama atau perkiraan jam di setiap layanan.',
        'data', jsonb_build_object('terlambat', n_late, 'selesai', n_done), 'action', jsonb_build_object('type', 'link', 'path', '/layanan', 'label', 'Buka layanan')));
    end if;
  end if;
  if k.business_type = 'kustom' then
    for o in select ob.id, ob.name, ob.key from bb_objects ob where ob.kos_id = p_kos and ob.active and ob.workflow loop
      -- R7: catatan tertahan melewati batas waktu status
      for st in select s.id, s.label, s.sla_hours, count(r.id) n from bb_statuses s join bb_records r on r.status_id = s.id and r.archived_at is null
                  and r.status_since < now() - make_interval(hours => s.sla_hours)
                where s.object_id = o.id and s.active and s.sla_hours is not null and not s.is_final group by s.id, s.label, s.sla_hours having count(r.id) >= 3 loop
        res := res || jsonb_build_array(jsonb_build_object('code', 'bb_sla:' || st.id, 'hash', st.id::text, 'kind', 'evaluasi',
          'title', st.n || ' ' || o.name || ' tertahan di "' || st.label || '"',
          'reason', 'Melewati batas ' || st.sla_hours || ' jam di status ini. Periksa apa yang menghambat atau sesuaikan batas waktunya.',
          'data', jsonb_build_object('catatan', st.n, 'batas_jam', st.sla_hours), 'action', jsonb_build_object('type', 'link', 'path', '/catatan/' || o.key, 'label', 'Lihat catatan')));
      end loop;
      -- R8: status tidak pernah dipakai (minimal 20 catatan dibuat 90 hari)
      if (select count(*) from bb_records where object_id = o.id and created_at >= now() - interval '90 days') >= 20 then
        for st in select s.id, s.label from bb_statuses s where s.object_id = o.id and s.active and not s.is_initial
                    and not exists (select 1 from bb_records r where r.status_id = s.id)
                    and not exists (select 1 from bb_events e join bb_records r on r.id = e.record_id where r.object_id = o.id and e.kind = 'status'
                                      and e.created_at >= now() - interval '90 days' and split_part(split_part(e.text, ' → ', 2), ' · ', 1) = s.label) loop
          res := res || jsonb_build_array(jsonb_build_object('code', 'bb_mati:' || st.id, 'hash', st.id::text, 'kind', 'evaluasi',
            'title', 'Status "' || st.label || '" tidak pernah dipakai',
            'reason', 'Tidak ada ' || o.name || ' yang masuk status ini selama 90 hari. Alur yang lebih sederhana lebih mudah diikuti tim.',
            'data', '{}'::jsonb, 'action', jsonb_build_object('type', 'link', 'path', '/builder', 'label', 'Atur di Builder')));
        end loop;
      end if;
    end loop;
  end if;
  -- R9: langkah proses yang tersedia tetapi belum dipakai, padahal bisnis sudah berjalan
  for pm in select * from jsonb_array_elements(process_map(p_kos)) loop
    if (pm->>'done')::int >= 2 then
      for s in select * from jsonb_array_elements(pm->'steps') loop
        select x into p from business_processes bp, jsonb_array_elements(bp.steps) x where bp.code = pm->>'code' and x->>'key' = s->>'key';
        if coalesce((p->>'reco')::boolean, false) and s->>'state' = 'belum_dipakai' then
          res := res || jsonb_build_array(jsonb_build_object('code', 'proses:' || (pm->>'code') || ':' || (s->>'key'), 'hash', 'v' || (pm->>'version'), 'kind', 'proses',
            'title', 'Mulai pakai: ' || (s->>'name'),
            'reason', 'Langkah "' || (s->>'name') || '" pada alur ' || (pm->>'name') || ' sudah tersedia tetapi belum dipakai 90 hari terakhir, padahal langkah lain sudah berjalan.',
            'data', '{}'::jsonb, 'action', jsonb_build_object('type', 'link', 'path', s->>'path', 'label', 'Buka')));
        end if;
      end loop;
    end if;
  end loop;
  -- Saring keputusan pemilik
  for x in select * from jsonb_array_elements(res) loop
    select * into dec from workflow_reco_decisions where kos_id = p_kos and code = x->>'code';
    if dec.kos_id is not null and ((dec.decision in ('ditolak', 'diterima') and dec.context_hash = x->>'hash')
                                   or (dec.decision = 'ditunda' and dec.until > (now() at time zone 'Asia/Jakarta')::date)) then continue; end if;
    out := out || jsonb_build_array(x);
  end loop;
  return out;
end $$;

create or replace function public.workflow_reco_decide(p_kos uuid, p_code text, p_decision text, p_note text default null, p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; a jsonb; v_res jsonb := '{}'; arr jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  if p_decision not in ('terima', 'tolak', 'tunda') then raise exception 'Keputusan tidak dikenal'; end if;
  select r into x from jsonb_array_elements(workflow_recommendations(p_kos)) r where r->>'code' = p_code;
  if x is null then raise exception 'Saran ini sudah tidak berlaku'; end if;
  a := x->'action';
  if p_decision = 'terima' then
    if a->>'type' = 'template' then
      v_res := wf_template_apply(p_kos, a->>'code', true);
    elsif a->>'type' = 'stage' then
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active) order by sort), '[]') into arr from svc_stages where kos_id = p_kos;
      perform svc_stages_save(p_kos, arr || jsonb_build_array(jsonb_build_object('name', a->>'name', 'active', true)));
      v_res := jsonb_build_object('stage', a->>'name');
    elsif a->>'type' = 'rule' then
      v_res := jsonb_build_object('rule', wf_rule_save(p_kos, (a->'rule') || jsonb_build_object('workflow', 'svc_order')));
    end if;
  end if;
  insert into workflow_reco_decisions(kos_id, code, context_hash, title, decision, until, note, decided_by)
  values (p_kos, p_code, x->>'hash', x->>'title', case p_decision when 'terima' then 'diterima' when 'tolak' then 'ditolak' else 'ditunda' end,
          case when p_decision = 'tunda' then (now() at time zone 'Asia/Jakarta')::date + greatest(1, least(coalesce(p_days, 30), 180)) end,
          nullif(trim(coalesce(p_note, '')), ''), actor_email())
  on conflict (kos_id, code) do update set context_hash = excluded.context_hash, title = excluded.title, decision = excluded.decision, until = excluded.until,
    note = excluded.note, decided_by = excluded.decided_by, decided_at = now();
  perform config_log(p_kos, 'saran_alur', x->>'title', null, jsonb_build_object('keputusan', p_decision, 'kode', p_code), p_note, 'rendah', actor_email());
  return jsonb_build_object('ok', true, 'applied', v_res);
end $$;

-- Riwayat alur (semua versi definisi + persetujuan karena aturan)
create or replace function public.workflow_history(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  return jsonb_build_object(
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'workflow', v.workflow, 'version', v.version, 'reason', v.reason, 'actor', v.actor, 'at', v.created_at,
                  'name', case when v.workflow = 'svc_order' then 'Pesanan' else coalesce((select name from bb_objects where id::text = substr(v.workflow, 4)), 'Alur') end) order by v.created_at desc, v.id desc)
                from (select * from workflow_versions where kos_id = p_kos order by created_at desc, id desc limit 50) v), '[]'),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'title', title, 'decision', decision, 'until', until, 'by', decided_by, 'at', decided_at) order by decided_at desc)
                 from (select * from workflow_reco_decisions where kos_id = p_kos order by decided_at desc limit 30) d), '[]'));
end $$;

grant execute on function public.process_map(uuid), public.workflow_registry(uuid), public.workflow_detail(uuid, text), public.wf_rule_save(uuid, jsonb),
  public.wf_template_apply(uuid, text, boolean), public.wf_restore(uuid, bigint), public.workflow_recommendations(uuid),
  public.workflow_reco_decide(uuid, text, text, text, int), public.workflow_history(uuid), public.wf_templates_for(uuid), public.wf_points(uuid, text) to authenticated;

drop function public._prasara_patch(text, text, text);
