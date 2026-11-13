-- Universal Module Registry V2 (Master Prompt "Sistem Modul Semua Bisnis" V2.0, Bab 5–6, 44–45).
-- • Metadata lengkap per modul: jenis, kategori, status implementasi PLATFORM (terpisah dari aktivasi pelanggan),
--   kunci fitur, area izin, dependensi wajib & opsional, perlu persetujuan pemilik, tempat pengaturan, waktu.
-- • Status aktivasi PELANGGAN dihitung (module_catalog): tersedia / disarankan (di UI) / aktif / menunggu / terkunci paket /
--   ditangguhkan / dalam rencana.
-- • module_impact: dampak sebelum menonaktifkan (modul yang bergantung, pekerjaan terbuka, menu yang hilang, data tetap).
-- • Fitur yang sudah ada didaftarkan; modul "Asisten AI" dihentikan (keputusan pemilik 13 Nov 2026: tanpa branding AI).
-- • Registry di Management Center (admin_module_registry, izin system.view).

alter table public.modules add column if not exists module_type text not null default 'operational';
alter table public.modules drop constraint if exists modules_module_type_check;
alter table public.modules add constraint modules_module_type_check
  check (module_type in ('core', 'industry', 'operational', 'intelligence', 'automation', 'integration', 'administrative'));
alter table public.modules add column if not exists category text not null default 'operasional';
alter table public.modules add column if not exists impl_status text not null default 'production_ready';
alter table public.modules drop constraint if exists modules_impl_status_check;
alter table public.modules add constraint modules_impl_status_check
  check (impl_status in ('planned', 'in_development', 'testing', 'production_ready', 'deprecated'));
alter table public.modules add column if not exists feature_keys text[] not null default '{}';
alter table public.modules add column if not exists area text;                       -- izin area untuk memakai modul
alter table public.modules add column if not exists optional_deps text[] not null default '{}';
alter table public.modules add column if not exists owner_approval boolean not null default true;
alter table public.modules add column if not exists config_path text;               -- tempat mengatur modul
alter table public.modules add column if not exists created_at timestamptz not null default now();
alter table public.modules add column if not exists updated_at timestamptz not null default now();
alter table public.modules drop constraint if exists modules_status_check;
alter table public.modules add constraint modules_status_check check (status in ('available', 'segera', 'dihentikan'));

-- Status lama (available/segera) tetap dipakai fungsi lama; impl_status = sumber kebenaran platform, keduanya diselaraskan
create or replace function public.modules_sync_status()
returns trigger language plpgsql as $$
begin
  new.status := case new.impl_status when 'production_ready' then 'available' when 'deprecated' then 'dihentikan' else 'segera' end;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists modules_sync_status on public.modules;
create trigger modules_sync_status before insert or update on public.modules for each row execute function public.modules_sync_status();

-- Selaraskan data lama
update public.modules set impl_status = case status when 'available' then 'production_ready' when 'segera' then 'planned' else 'deprecated' end;

-- Metadata modul yang sudah ada
update public.modules m set module_type = x.t, category = x.c, area = x.a, config_path = x.p, feature_keys = x.f
from (values
  ('p_dashboard', 'core', 'ringkasan', 'rent', null, '{}'::text[]),
  ('p_kamar', 'industry', 'properti', 'rent', '/kamar', '{}'),
  ('p_tagihan', 'industry', 'properti', 'rent', '/tagihan', '{}'),
  ('p_laporan', 'intelligence', 'laporan', 'finance', null, '{laporan_lengkap,ekspor}'),
  ('p_pengeluaran', 'operational', 'keuangan', 'finance', '/pengeluaran', '{}'),
  ('p_pengingat', 'automation', 'notifikasi', 'rent', '/notifikasi', '{pengingat_email}'),
  ('p_booking', 'industry', 'properti', 'rent', '/booking', '{}'),
  ('p_portal', 'integration', 'portal', 'rent', '/pengaturan', '{portal_penghuni}'),
  ('p_perbaikan', 'industry', 'properti', 'rent', '/perbaikan', '{}'),
  ('p_meteran', 'industry', 'properti', 'rent', '/meteran', '{}'),
  ('r_toko', 'core', 'ringkasan', 'finance', null, '{}'),
  ('r_barang', 'core', 'persediaan', 'stock', '/barang', '{}'),
  ('r_kasir', 'core', 'penjualan', 'sell', '/pengaturan', '{}'),
  ('r_kas', 'core', 'keuangan', 'finance', '/kas', '{}'),
  ('r_laporan', 'intelligence', 'laporan', 'finance', null, '{ekspor}'),
  ('r_belanja', 'operational', 'pembelian', 'stock', '/belanja', '{}'),
  ('r_kontak', 'core', 'pelanggan', 'stock,finance', '/kontak', '{}'),
  ('r_shift', 'operational', 'penjualan', 'sell', '/shift', '{}'),
  ('r_label', 'operational', 'persediaan', 'stock', '/label', '{}'),
  ('r_pengingat', 'automation', 'notifikasi', 'stock,finance', '/pengingat', '{email_toko}'),
  ('j_dashboard', 'core', 'ringkasan', 'sell,ops,finance', null, '{}'),
  ('j_pesanan', 'industry', 'jasa', 'sell,ops', '/pesanan', '{}'),
  ('j_layanan', 'industry', 'jasa', 'settings', '/layanan', '{}'),
  ('j_laporan', 'intelligence', 'laporan', 'finance', null, '{ekspor}'),
  ('j_kas', 'core', 'keuangan', 'finance', '/kas', '{}'),
  ('j_bahan', 'operational', 'persediaan', 'stock', '/barang', '{}'),
  ('j_antar', 'industry', 'jasa', 'sell,ops', '/layanan', '{}'),
  ('k_dashboard', 'core', 'ringkasan', 'ops,settings,finance', null, '{}'),
  ('k_catatan', 'industry', 'kustom', 'ops', '/builder', '{}'),
  ('k_laporan', 'intelligence', 'laporan', 'finance', '/builder', '{ekspor}'),
  ('k_builder', 'administrative', 'kustom', 'settings', '/builder', '{}'),
  ('k_kas', 'core', 'keuangan', 'finance', '/kas', '{}'),
  ('u_crm', 'operational', 'pelanggan', 'sell,rent', '/crm', '{}'),
  ('u_halaman', 'integration', 'portal', 'settings', '/halaman', '{portal_bisnis}'),
  ('u_karyawan', 'administrative', 'tim', 'team', '/karyawan', '{akses_modul,akses_granular}'),
  ('u_akuntansi', 'core', 'keuangan', 'finance', '/pembukuan', '{jurnal_manual,rekonsiliasi,laporan_lanjutan}'),
  ('u_asisten', 'intelligence', 'lainnya', null, null, '{}'),
  ('u_online', 'integration', 'penjualan', 'sell', null, '{}')
) as x(code, t, c, a, p, f)
where m.code = x.code;
update public.modules set impl_status = 'deprecated', description = 'Dihentikan: PRASARA tidak menampilkan fitur/branding AI (keputusan pemilik 13 Nov 2026).' where code = 'u_asisten';
update public.modules set description = 'Toko online dengan keranjang & pembayaran langsung. Saat ini permintaan dari Halaman bisnis masuk ke Kasir lewat Prospek.' where code = 'u_online';

-- Fitur yang sudah berjalan tetapi belum terdaftar (inti = selalu aktif; tidak mengubah menu yang ada)
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort,
  module_type, category, impl_status, feature_keys, area, config_path, owner_approval) values
  ('u_persetujuan', 'Persetujuan', 'Tindakan berisiko karyawan & otomatisasi menunggu keputusan; aturan, izin per tindakan, dan persetujuan bertingkat.',
     '{properti,retail,jasa,kustom}', true, '{}', null, '{/persetujuan}', 'Permintaan, aturan, keputusan', 'available', 50,
     'administrative', 'kontrol', 'production_ready', '{persetujuan,persetujuan_bertingkat,akses_granular}', '', '/persetujuan', false),
  ('u_otomatisasi', 'Otomatisasi', 'Pemeriksaan & pengingat rutin setiap pagi dengan log, jeda otomatis, dan persetujuan.',
     '{properti,retail,jasa,kustom}', true, '{}', null, '{/otomatisasi}', 'Aturan, riwayat jalan, pemberitahuan', 'available', 51,
     'automation', 'otomatisasi', 'production_ready', '{otomatisasi,otomatisasi_lanjutan}', 'settings', '/otomatisasi', false),
  ('u_anggaran', 'Anggaran & realisasi', 'Rencana biaya per kategori per bulan dibanding pengeluaran yang tercatat.',
     '{properti,retail,jasa,kustom}', true, '{}', null, '{/anggaran}', 'Anggaran, pengeluaran', 'available', 52,
     'operational', 'keuangan', 'production_ready', '{anggaran}', 'finance', '/anggaran', false),
  ('u_analisis', 'Analisis bisnis', 'Bulan ini vs lalu, tren 12 bulan, per jenis biaya, perbandingan cabang, pola hari — dari jurnal Pembukuan.',
     '{properti,retail,jasa,kustom}', true, '{u_akuntansi}', null, '{/analisis}', 'Jurnal, transaksi', 'available', 53,
     'intelligence', 'analisis', 'production_ready', '{analisis_lanjutan,analisis_mendalam}', 'finance', null, false),
  ('u_media', 'Foto & media', 'Foto publik kamar, barang, layanan, cover & galeri dengan pustaka bersama.',
     '{properti,retail,jasa,kustom}', true, '{}', null, '{/media}', 'Foto', 'available', 54,
     'operational', 'dokumen', 'production_ready', '{}', 'settings,rent,stock,sell', '/media', false),
  ('u_lampiran', 'Lampiran dokumen', 'Nota, bukti transfer, foto kondisi — privat, dibuka lewat tautan sementara.',
     '{properti,retail,jasa,kustom}', true, '{}', null, '{}', 'Lampiran', 'available', 55,
     'operational', 'dokumen', 'production_ready', '{}', null, null, false),
  ('u_lokasi', 'Cabang, gudang & mutasi stok', 'Stok & kas per lokasi, lokasi kerja karyawan, mutasi antar lokasi.',
     '{retail,jasa}', true, '{r_barang}', null, '{/mutasi}', 'Lokasi, stok per lokasi, mutasi', 'available', 56,
     'operational', 'persediaan', 'production_ready', '{}', 'stock', '/konfigurasi?tab=cabang', false)
on conflict (code) do nothing;
-- u_lokasi bergantung pada barang toko; untuk jasa barang ada di j_bahan
update public.modules set depends_on = '{}' where code = 'u_lokasi';

-- Modul dalam rencana (jujur: tampil "Dalam rencana", tidak bisa diaktifkan). Diperbarui saat dibangun.
insert into public.modules(code, name, description, applies_to, core, depends_on, paths, status, sort, module_type, category, impl_status, area) values
  ('u_pajak', 'Pajak (PPN)', 'Tarif pajak per barang/layanan, harga termasuk/tidak termasuk pajak, jurnal pajak keluaran & masukan.', '{retail,jasa,properti}', false, '{u_akuntansi}', '{}', 'segera', 60, 'core', 'keuangan', 'planned', 'finance'),
  ('u_penawaran', 'Penawaran & pesanan pelanggan', 'Penawaran harga → pesanan pelanggan → surat jalan → faktur, untuk penjualan grosir/B2B.', '{retail,jasa}', false, '{r_kontak}', '{}', 'segera', 61, 'operational', 'penjualan', 'planned', 'sell'),
  ('u_kredit', 'Batas kredit & harga pelanggan', 'Batas kasbon per pelanggan dan daftar harga khusus per pelanggan/kelompok.', '{retail}', false, '{r_kontak}', '{}', 'segera', 62, 'operational', 'pelanggan', 'planned', 'finance'),
  ('r_batch', 'Batch & kedaluwarsa', 'Nomor batch dan tanggal kedaluwarsa per penerimaan barang, peringatan mendekati kedaluwarsa.', '{retail,jasa}', false, '{r_barang}', '{}', 'segera', 63, 'operational', 'persediaan', 'planned', 'stock'),
  ('u_sdm', 'Karyawan, absensi & gaji', 'Data karyawan (termasuk tanpa akun), absensi, jadwal shift, gaji & lembur dengan jurnal gaji.', '{properti,retail,jasa,kustom}', false, '{}', '{}', 'segera', 64, 'administrative', 'tim', 'planned', 'team'),
  ('u_aset', 'Aset tetap & penyusutan', 'Daftar aset, metode penyusutan, jurnal penyusutan bulanan otomatis.', '{properti,retail,jasa,kustom}', false, '{u_akuntansi}', '{}', 'segera', 65, 'core', 'keuangan', 'planned', 'finance'),
  ('j_resep', 'Resep & food cost', 'Resep per menu, konsumsi bahan otomatis saat pesanan selesai, food cost & waste.', '{jasa}', false, '{j_bahan}', '{}', 'segera', 66, 'industry', 'kuliner', 'planned', 'stock'),
  ('r_promo', 'Promosi & bundling', 'Diskon terjadwal, beli X gratis Y, paket bundling di kasir.', '{retail,jasa}', false, '{}', '{}', 'segera', 67, 'operational', 'penjualan', 'planned', 'sell'),
  ('u_kesehatan', 'Kesehatan bisnis', 'Skor per dimensi (laba, likuiditas, kas, piutang, stok) dengan bobot transparan per jenis bisnis.', '{properti,retail,jasa,kustom}', false, '{u_akuntansi}', '{}', 'segera', 68, 'intelligence', 'analisis', 'planned', 'finance'),
  ('u_proyeksi', 'Proyeksi & skenario', 'Proyeksi pendapatan, biaya, dan kas dengan asumsi yang terlihat; titik impas.', '{properti,retail,jasa,kustom}', false, '{u_akuntansi}', '{}', 'segera', 69, 'intelligence', 'analisis', 'planned', 'finance'),
  ('u_chat', 'Chat & tiket pelanggan', 'Kotak masuk percakapan pelanggan dengan konteks transaksi dan catatan internal.', '{properti,retail,jasa}', false, '{}', '{}', 'segera', 70, 'integration', 'pelanggan', 'planned', 'sell,rent')
on conflict (code) do nothing;

-- Katalog untuk pemilik: status aktivasi dipisah dari status implementasi platform
create or replace function public.module_catalog(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text; v_susp boolean;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select business_type, suspended_at is not null into t, v_susp from kos where id = p_kos;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'code', m.code, 'name', m.name, 'description', m.description, 'core', m.core, 'status', m.status, 'version', m.version,
      'module_type', m.module_type, 'category', m.category, 'impl_status', m.impl_status, 'feature_keys', m.feature_keys,
      'config_path', m.config_path, 'owner_approval', m.owner_approval,
      'active', module_on(p_kos, m.code), 'depends_on', m.depends_on,
      'depends_names', (select coalesce(jsonb_agg(d.name), '[]') from modules d where d.code = any(m.depends_on)),
      'dependents', (select coalesce(jsonb_agg(d.name), '[]') from modules d where m.code = any(d.depends_on) and module_on(p_kos, d.code) and not d.core),
      'entitlement', m.entitlement, 'plan_ok', m.entitlement is null or plan_has(p_kos, m.entitlement),
      'paths', m.paths, 'data_used', m.data_used, 'open_items', case when m.status = 'available' then module_open_items(p_kos, m.code) end,
      'pending', (select r.action from config_requests r where r.kos_id = p_kos and r.module_code = m.code and r.status = 'menunggu' limit 1),
      'activation', case
        when m.impl_status in ('planned', 'in_development', 'testing') then 'dalam_rencana'
        when v_susp then 'ditangguhkan'
        when exists (select 1 from config_requests r where r.kos_id = p_kos and r.module_code = m.code and r.status = 'menunggu') then 'menunggu'
        when module_on(p_kos, m.code) then 'aktif'
        when m.entitlement is not null and not plan_has(p_kos, m.entitlement) then 'terkunci_paket'
        else 'tersedia' end
    ) order by m.sort), '[]') from modules m where t = any(m.applies_to) and m.impl_status <> 'deprecated');
end $$;

-- Dampak sebelum menonaktifkan (Bab 6): ditampilkan ke pemilik sebelum konfirmasi
create or replace function public.module_impact(p_kos uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m modules;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select * into m from modules where code = p_code;
  if m.code is null then raise exception 'Modul tidak dikenal'; end if;
  return jsonb_build_object(
    'code', m.code, 'name', m.name, 'core', m.core,
    'dependents_active', (select coalesce(jsonb_agg(d.name), '[]') from modules d where p_code = any(d.depends_on) and not d.core and module_on(p_kos, d.code)),
    'optional_for', (select coalesce(jsonb_agg(d.name), '[]') from modules d where p_code = any(d.optional_deps) and module_on(p_kos, d.code)),
    'open_items', module_open_items(p_kos, p_code),
    'menus_hidden', to_jsonb(m.paths),
    'data_kept', coalesce(m.data_used, 'Data modul'),
    'can_disable', not m.core and not exists (select 1 from modules d where p_code = any(d.depends_on) and not d.core and module_on(p_kos, d.code))
                   and (module_open_items(p_kos, p_code) is null or p_code = 'u_karyawan'));
end $$;
revoke execute on function public.module_impact(uuid, text) from public, anon;
grant execute on function public.module_impact(uuid, text) to authenticated;

-- Registry untuk staf platform (tanpa data transaksi pelanggan: hanya jumlah bisnis yang mengaktifkan)
create or replace function public.admin_module_registry()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(admin_can('system.view'), false) then raise exception 'Tidak punya izin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'code', m.code, 'name', m.name, 'description', m.description, 'applies_to', m.applies_to, 'core', m.core,
      'module_type', m.module_type, 'category', m.category, 'impl_status', m.impl_status, 'version', m.version,
      'depends_on', m.depends_on, 'optional_deps', m.optional_deps, 'entitlement', m.entitlement, 'feature_keys', m.feature_keys,
      'area', m.area, 'paths', m.paths, 'owner_approval', m.owner_approval, 'updated_at', m.updated_at,
      'bisnis_aktif', case when m.core then (select count(*) from kos k where k.business_type = any(m.applies_to) and k.closed_at is null)
                           else (select count(*) from business_modules b join kos k on k.id = b.kos_id where b.module_code = m.code and b.active and k.closed_at is null) end
    ) order by m.sort), '[]') from modules m);
end $$;
revoke execute on function public.admin_module_registry() from public, anon;
grant execute on function public.admin_module_registry() to authenticated;

-- Bisnis baru tidak mendapat modul yang belum siap / dihentikan (kos_seed_modules sudah memakai status='available')
