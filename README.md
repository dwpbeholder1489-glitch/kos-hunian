# PRASARA (dulu Kos Hunian)

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
2. *New project*. Isi nama `prasara`, buat **Database Password** (simpan baik-baik), Region pilih **Southeast Asia (Singapore)**. Klik *Create*. Tunggu ±2 menit.
3. Di menu kiri buka **SQL Editor** → *New query*.
4. Buka file pertama di `supabase/migrations/` di GitHub repo ini → tombol **Raw** → tekan lama → *Pilih semua* → *Salin*.
5. Tempel di SQL Editor Supabase → **Run**. Harus muncul *Success. No rows returned*.
6. Ulangi untuk setiap file lain di `supabase/migrations/` sesuai urutan nama file.

### 2. Ambil kunci koneksi
Di Supabase: **Project Settings → API** (atau *Data API*). Catat dua nilai:
- **Project URL** (contoh `https://abcd1234.supabase.co`)
- **anon public key** (teks panjang diawali `eyJ…`, atau `sb_publishable_…`)

Kunci *anon/publishable* memang aman dipakai di aplikasi. **Jangan** pernah memakai atau membagikan kunci `service_role` / `secret`.

### 3. Online-kan di Vercel
1. Buka **vercel.com** → *Sign up* → *Continue with GitHub*.
2. *Add New… → Project* → pilih repo aplikasi ini → *Import*.
3. Buka bagian **Environment Variables**, tambahkan dua baris:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL dari langkah 2
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key dari langkah 2
4. Klik **Deploy**. Tunggu 1–3 menit sampai muncul alamat seperti `prasara.vercel.app`.

### 4. Sambungkan login ke alamat aplikasi
Di Supabase: **Authentication → URL Configuration**
- **Site URL**: alamat Vercel Anda, mis. `https://prasara.vercel.app`
- **Redirect URLs**: tambahkan `https://prasara.vercel.app/**`

Tanpa langkah ini, tautan konfirmasi di email pendaftaran akan mengarah ke alamat yang salah.

### 5. Coba
Buka alamat Vercel → **Daftar baru** → konfirmasi email → masuk → isi nama kos dan jumlah kamar.

Setiap kali kode di GitHub diperbarui, Vercel otomatis memasang versi terbaru.

---

## Struktur kode

```
supabase/migrations/  skema database berurutan (tabel, RLS, tagihan otomatis, paket langganan)
lib/plan.js           harga paket, fitur per paket, nomor WhatsApp & rekening pembayaran
lib/                  koneksi Supabase, format rupiah & tanggal, pemuat data
components/           kerangka aplikasi, formulir sewa, komponen tampilan
app/masuk             login & daftar
app/mulai             membuat kos baru
app/(app)/…           beranda, kamar, penghuni, tagihan, pembayaran, pengeluaran, laporan, pengaturan
```

## Paket & langganan
- Gratis: maks 5 kamar terisi · Standar Rp100.000/bln · Pro Rp150.000/bln (atur di `lib/plan.js` dan fungsi `plan_price` di database)
- Kos baru otomatis mendapat masa coba 30 hari semua fitur
- Pembayaran manual: QRIS / transfer → pengguna konfirmasi di menu Langganan → admin menyetujui di menu Admin
- Admin ditentukan oleh tabel `app_admins` (berisi email)

## Rencana berikutnya (paket Pro)
- Asisten AI
- Portal penghuni (lihat tagihan & kirim bukti transfer)
- Pengingat WhatsApp otomatis
- Akun penjaga/pengelola dengan hak terbatas
- Pembayaran otomatis lewat payment gateway

## Environment variables (Vercel)
| Nama | Wajib | Untuk |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | koneksi database |
| `ANTHROPIC_API_KEY` | opsional | asisten AI di portal penghuni |
| `SUPABASE_SECRET_KEY` | opsional | email notifikasi (membaca email pemilik kos) — rahasia, hanya di server |
| `SMTP_USER`, `SMTP_PASS` | opsional | akun Gmail + App Password pengirim email notifikasi & pengingat |
| `CRON_SECRET` | opsional | mengamankan pengingat harian (`vercel.json`, tiap 07.00 WIB) |
