# PRASARA (dulu Kos Hunian) — catatan untuk Claude

PRASARA: platform bisnis multi-usaha, berawal dari SaaS manajemen kos (Next.js App Router + Supabase + Vercel). Pemilik: Dewo, mengerjakan dari HP — semua instruksi ke pengguna harus bisa dilakukan dari HP, dalam Bahasa Indonesia.

## Aturan tetap
- **Setiap perubahan/fitur baru WAJIB ikut memperbarui panduan**, dalam commit yang sama:
  - `app/panduan/page.jsx` (panduan lengkap bergaya buku, langkah bernomor + layar contoh di `components/demo/Screens.jsx`)
  - `lib/guide.js` (isi tombol "? Panduan" per menu; `step` = nomor langkah di /panduan — perbarui bila penomoran bergeser)
  - bila menyangkut paket/harga: `lib/plan.js` (tabel fitur landing & Langganan)
- Perubahan database: tambahkan file baru di `supabase/migrations/` (jangan ubah migrasi lama); Supabase memasang otomatis lewat integrasi GitHub saat push ke `main`.
- Uji migrasi di PostgreSQL lokal sebelum push (pgcrypto ada di skema `extensions` di Supabase — jangan pakai fungsinya tanpa prefiks).
- Push ke `main` = langsung online (Vercel).
- Lokasi stok (migrasi `20261107160000`): `products.stock` = total; `stock_levels` per lokasi diisi trigger `stock_moves_loc` (lokasi dari dokumen ref_id atau `stock_loc(kos)` = lokasi kerja pengguna). Fungsi stok baru cukup insert `stock_moves`; jangan update `stock_levels` langsung. Patch fungsi lama lewat `_prasara_patch` (buat & hapus di migrasi).
- Bisnis ditutup (`kos.closed_at`): trigger `zz_kos_open_guard` menolak tulis dari pengguna di semua tabel ber-`kos_id` (migrasi `20261107170000`). **Tabel baru ber-`kos_id` wajib diberi trigger yang sama**; jadwal harian harus melewati bisnis `closed_at is not null`. Uji isolasi: `supabase/tests/isolasi.sql`.
- Bisnis Jasa & Laundry (migrasi `20261107210000`): tabel `svc_*` (layanan, tahap, pesanan, pembayaran, keluhan, riwayat). Harga dihitung server (`svc_price_lines`); pendapatan diakui saat pesanan `selesai` (diserahkan), pembayaran sebelumnya = uang muka. Peran `operator` (area `ops`) tidak melihat uang. Fitur untuk jenis bisnis lain wajib ikut dicek untuk `jasa` (cari `business_type === 'retail'`).
- Properti lengkap (migrasi `20261107220000`): `deposits` (saldo = terima − kembali − potong; bayar tagihan dari deposit = payment `method='deposit'` yang hanya boleh dibuat `deposit_add`, dijaga trigger `payments_deposit_guard`), `maint_tickets`/`maint_events` (keluhan & perbaikan, portal `portal_report_issue`), `utility_types`/`meter_readings` (meteran → invoice `tambahan`). Laporan kos berbasis kas: deposit masuk/keluar = arus kas, bukan pendapatan.
- Peran karyawan: RLS memakai `member_can(kos_id, 'area')`; RPC memeriksa `member_in('area', p_kos)` (area: sell, stock, finance, rent, team; lihat migrasi `20261106200000_karyawan.sql`). `is_member` = anggota peran apa pun — jangan dipakai untuk data uang/stok. `ALTER FUNCTION ... SET` variabel kustom ditolak di Supabase (bukan superuser).

## Wajib dari blueprint PRASARA (baca sebelum tiap tahap; pemilik tidak mau ada yang terlewat)
- Brand: midnight navy, charcoal, ivory, warm grey, muted gold; minimalis, tanpa gradient; sans-serif (Plus Jakarta Sans). Dark mode didukung penuh + light mode; mobile-first dengan navigasi bawah.
- Tagline: "One Intelligence. Every Business." / "A smarter way to manage life and business."
- Jangan klaim fitur yang belum ada: tandai "Segera hadir"/"Dalam rencana" (AI, Business Builder, WhatsApp otomatis, jenis bisnis lain). Data contoh selalu diberi label DATA CONTOH.
- Menu menyesuaikan jenis bisnis & peran; jangan tampilkan menu yang tidak relevan.
- Keamanan: otorisasi di server/database, audit trail, tidak menampilkan rahasia, status jujur (Verified/Partial/UI only).
- Sebelum menyatakan selesai: uji (database lokal, esbuild, render statis + screenshot bila UI) dan pikirkan kasus nyata pengguna (mis. barang tanpa barcode, iPhone/Safari).
