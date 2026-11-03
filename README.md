# Kos Hunian

**Manage Smarter. Live Better.** Aplikasi web pengelolaan kos untuk banyak pemilik kos: setiap akun punya data kosnya sendiri yang terpisah dan aman.

Fitur versi ini:
- Daftar & masuk dengan email, satu akun bisa mengelola beberapa kos
- Kamar (status, harga, fasilitas) dan penghuni (kontak, riwayat)
- Sewa: isi kamar, akhiri sewa; tagihan sewa bulanan dibuat otomatis
- Tagihan tambahan, pencatatan & verifikasi pembayaran, pengingat WhatsApp
- Pengeluaran per kategori
- Dashboard dan laporan laba rugi bulanan berbasis kas

Teknologi: Next.js (App Router) + Supabase (PostgreSQL, Auth, Row Level Security), di-hosting di Vercel.

---

## Panduan memasang (bisa dari HP)

Pakai browser Chrome di HP. Kalau tampilan situs terlalu kecil atau tombol tidak muncul, buka menu ⋮ lalu centang **Situs desktop**.

### 1. Buat database di Supabase

> Cara termudah dari HP: sambungkan repo ini di Supabase → Integrations → GitHub (Working directory `.`, Deploy to production ON, branch `main`). Skema di `supabase/migrations` terpasang otomatis. Langkah manual di bawah hanya cadangan.

1. Buka **supabase.com** → *Start your project* → daftar dengan akun GitHub.
2. *New project*. Isi nama `kos-hunian`, buat **Database Password** (simpan baik-baik), Region pilih **Southeast Asia (Singapore)**. Klik *Create*. Tunggu ±2 menit.
3. Di menu kiri buka **SQL Editor** → *New query*.
4. Buka file `supabase/schema.sql` di GitHub repo ini → tombol **Raw** → tekan lama → *Pilih semua* → *Salin*.
5. Tempel di SQL Editor Supabase → **Run**. Harus muncul *Success. No rows returned*.

### 2. Ambil kunci koneksi
Di Supabase: **Project Settings → API** (atau *Data API*). Catat dua nilai:
- **Project URL** (contoh `https://abcd1234.supabase.co`)
- **anon public key** (teks panjang diawali `eyJ…`, atau `sb_publishable_…`)

Kunci *anon/publishable* memang aman dipakai di aplikasi. **Jangan** pernah memakai atau membagikan kunci `service_role` / `secret`.

### 3. Online-kan di Vercel
1. Buka **vercel.com** → *Sign up* → *Continue with GitHub*.
2. *Add New… → Project* → pilih repo **kos-hunian** → *Import*.
3. Buka bagian **Environment Variables**, tambahkan dua baris:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL dari langkah 2
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key dari langkah 2
4. Klik **Deploy**. Tunggu 1–3 menit sampai muncul alamat seperti `kos-hunian-xxx.vercel.app`.

### 4. Sambungkan login ke alamat aplikasi
Di Supabase: **Authentication → URL Configuration**
- **Site URL**: alamat Vercel Anda, mis. `https://kos-hunian-xxx.vercel.app`
- **Redirect URLs**: tambahkan `https://kos-hunian-xxx.vercel.app/**`

Tanpa langkah ini, tautan konfirmasi di email pendaftaran akan mengarah ke alamat yang salah.

### 5. Coba
Buka alamat Vercel → **Daftar baru** → konfirmasi email → masuk → isi nama kos dan jumlah kamar.

Setiap kali kode di GitHub diperbarui, Vercel otomatis memasang versi terbaru.

---

## Struktur kode

```
supabase/schema.sql   tabel, keamanan per kos (RLS), tagihan otomatis
lib/                  koneksi Supabase, format rupiah & tanggal, pemuat data
components/           kerangka aplikasi, formulir sewa, komponen tampilan
app/masuk             login & daftar
app/mulai             membuat kos baru
app/(app)/…           beranda, kamar, penghuni, tagihan, pembayaran, pengeluaran, laporan, pengaturan
```

## Belum ada di versi ini (rencana berikutnya)
- Asisten AI
- Langganan berbayar (Midtrans/Xendit) dan batas paket
- Akun pengelola/penjaga kos dengan hak terbatas
- Portal penghuni (penghuni melihat tagihan & kirim bukti transfer)
- Ekspor laporan ke Excel/PDF
