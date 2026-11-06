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
- Peran karyawan: RLS memakai `member_can(kos_id, 'area')`; RPC memeriksa `member_in('area', p_kos)` (area: sell, stock, finance, rent, team; lihat migrasi `20261106200000_karyawan.sql`). `is_member` = anggota peran apa pun — jangan dipakai untuk data uang/stok. `ALTER FUNCTION ... SET` variabel kustom ditolak di Supabase (bukan superuser).
