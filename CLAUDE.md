# Kos Hunian — catatan untuk Claude

SaaS manajemen kos (Next.js App Router + Supabase + Vercel). Pemilik: Dewo, mengerjakan dari HP — semua instruksi ke pengguna harus bisa dilakukan dari HP, dalam Bahasa Indonesia.

## Aturan tetap
- **Setiap perubahan/fitur baru WAJIB ikut memperbarui panduan**, dalam commit yang sama:
  - `app/panduan/page.jsx` (panduan lengkap bergaya buku, langkah bernomor + layar contoh di `components/demo/Screens.jsx`)
  - `lib/guide.js` (isi tombol "? Panduan" per menu; `step` = nomor langkah di /panduan — perbarui bila penomoran bergeser)
  - bila menyangkut paket/harga: `lib/plan.js` (tabel fitur landing & Langganan)
- Perubahan database: tambahkan file baru di `supabase/migrations/` (jangan ubah migrasi lama); Supabase memasang otomatis lewat integrasi GitHub saat push ke `main`.
- Uji migrasi di PostgreSQL lokal sebelum push (pgcrypto ada di skema `extensions` di Supabase — jangan pakai fungsinya tanpa prefiks).
- Push ke `main` = langsung online (Vercel).
