# PRASARA Notification Engine & Web Push

Status per 28 Nov 2026 (migrasi `20261128100000_notifikasi_push.sql`). Semua yang ditulis "Verified" sudah diuji otomatis; "Belum diverifikasi" belum bisa diuji di lingkungan pengembangan (butuh HP/browser nyata + produksi).

## 1. Audit kondisi sebelum fitur ini

| Bagian | Yang sudah ada | Keputusan |
|---|---|---|
| Framework | Next.js 15 App Router + Supabase + Vercel | Tetap |
| PWA | `app/manifest.js` (standalone, ikon), `public/sw.js` (Kasir offline), didaftarkan `OfflineSync` di layout | Dipakai ulang; SW ditambah handler push — tidak membuat SW kedua |
| Lonceng | `NotifBell` (kos, hitungan tindak lanjut) & `RetailBell` (toko) — hanya peran tertentu | Hitungannya dipertahankan dan dijumlahkan ke lonceng baru untuk semua peran |
| Peristiwa | `domain_events` = outbox transaksional di ±30 tabel (kolom `processed_at` disiapkan untuk "penangan notifikasi") | Jadi sumber utama; tidak ada trigger per modul baru |
| Penjadwal | Cron Vercel harian saja | Ditambah pg_net + pg_cron (ekstensi bawaan Supabase, gratis) secara bersyarat |
| Email | Ringkasan & daftar tagih (nodemailer) | Tidak diubah; email/WhatsApp tidak wajib |

## 2. Arsitektur

```
Transaksi (sales, payments, svc_orders, approvals, …)
  └─ trigger dom_* → domain_events (outbox, transaksi yang sama)
        └─ trigger per-pernyataan notif_from_events
              └─ notif_emit_safe → notif_event_types (aturan)
                    → notif_targets (anggota aktif + izin area, bukan pelaku)
                    → notif_items (kotak masuk, idempoten, digabung)
                    → notif_queue (bila ada perangkat & push menyala; jam tenang)
                          └─ trigger notif_queue_kick → pg_net POST /api/notif/kirim
pg_cron tiap menit → notif_cron_kick (hanya bila ada antrean jatuh tempo)
cron harian Vercel → notif_daily_tick + notif_purge + dispatch (cadangan)
/api/notif/kirim → notif_claim (SKIP LOCKED) → enkripsi RFC 8291 + VAPID → FCM/Apple/Mozilla/WNS → notif_report
Browser: public/sw.js push → showNotification (+ badge, getar) → postMessage ke aplikasi terbuka (nada khusus)
```

Hemat server & database:
- Satu trigger per pernyataan (impor/aksi massal = satu pemicu), satu panggilan pg_net per pernyataan, tidak dibangunkan lagi bila antrean baru belum diambil.
- Peristiwa berfrekuensi tinggi digabung per jendela (`group_minutes`): satu baris "12 penjualan baru", maks. satu push per jendela, header `Topic` membuat layanan push menimpa push yang belum terkirim.
- Push tidak diantre bila penerima tidak punya perangkat aktif; dilewati bila sudah dibaca di aplikasi sebelum terkirim.
- pg_cron hanya membangunkan server bila ada antrean jatuh tempo (cek indeks parsial).
- Retensi: notifikasi info 60 hari, lainnya 180 hari; antrean & log 14 hari; perangkat mati 30 hari.

## 3. Skema database

| Tabel | Isi | Akses |
|---|---|---|
| `notif_event_types` | Katalog aturan (kategori, prioritas, audience, area, judul, gabungan, push bawaan, tautan, modul) | Baca semua pengguna masuk; tulis hanya migrasi |
| `notif_items` | Kotak masuk per penerima (`user_id`, `kos_id` null = notifikasi akun) | Tanpa policy, hanya RPC |
| `notif_user_settings` | Jam tenang, suara, getar, sembunyikan nominal (per akun) | RPC |
| `notif_prefs` | Kategori app/push + prioritas minimum push (per akun × bisnis) + `zz_kos_open_guard` | RPC |
| `push_subscriptions` | Perangkat: endpoint, kunci terenkripsi, kunci VAPID saat berlangganan, label, platform, browser, PWA, aktif/mati, status | RPC / service role |
| `notif_queue` | Antrean push: antre/proses/terkirim/gagal/kedaluwarsa/dilewati, percobaan, `next_at` | Service role |
| `notif_deliveries` | Log per perangkat: diterima/gagal/kedaluwarsa/ditunda, kode HTTP | Service role |
| `notif_config` | Alamat aplikasi, token pembangun, kunci VAPID cadangan, hasil & galat terakhir | Service role |

Status pengiriman dibedakan jujur: **Diterima layanan push ≠ dilihat pengguna**. "Dibuka" dicatat saat pengguna membuka notifikasi (`opened_at`).

## 4. API

| Rute | Siapa | Fungsi |
|---|---|---|
| `GET /api/notif/kunci` | publik | Kunci publik VAPID (privat tidak pernah keluar) |
| `POST /api/notif/langganan` `{action:'simpan'|'cek'|'hapus'}` | Bearer sesi | Simpan (kunci dienkripsi di server), cek status, hapus perangkat ini |
| `POST /api/notif/ganti` | service worker | `pushsubscriptionchange`; hanya bila endpoint lama terdaftar |
| `POST /api/notif/kirim` | pg_net (token), CRON_SECRET, atau pengguna masuk | Satu putaran pengiriman |

RPC pengguna: `notif_list`, `notif_counts`, `notif_get`, `notif_mark`, `notif_mark_all`, `notif_archive`, `notif_delete`, `notif_open`, `notif_settings_get/set`, `push_devices`, `push_device_set`, `push_device_delete`, `notif_test`. Admin: `admin_notif_overview` (angka saja).

## 5. Deteksi perangkat & alur aktivasi

Keputusan teknis memakai *feature detection* (`isSecureContext`, `serviceWorker`, `PushManager`, `Notification`, `display-mode: standalone`/`navigator.standalone`); user-agent hanya untuk memilih panduan.

| Kelas | Kondisi | Tindakan |
|---|---|---|
| A | Push didukung | Tombol Aktifkan → izin → langganan → notifikasi "Perangkat baru" sebagai bukti |
| B | iPhone/iPad iOS ≥16.4 belum dari Layar Utama | Panduan Bagikan → Tambahkan ke Layar Utama → buka dari ikon → aktifkan |
| C | Hanya notifikasi dalam aplikasi | Penjelasan; Pusat Notifikasi tetap jalan |
| D | Tidak didukung | Penjelasan; PRASARA tetap normal |

Izin TIDAK diminta otomatis saat login. Kartu aktivasi hanya di Beranda, bisa "Nanti saja" 14 hari, tidak muncul bila izin ditolak (diganti panduan mengizinkan). Keluar akun = perangkat berhenti menerima push akun itu.

## 6. Keamanan

- Isolasi tenant: penerima dihitung di database dari keanggotaan aktif + izin area (`notif_member_ok`), dibaca ulang saat membaca & saat mengirim; anggota dinonaktifkan tidak lagi melihat notifikasi bisnis itu. Uji isolasi lulus (269 pemeriksaan).
- Tautan tujuan hanya path aplikasi (`notif_link_ok`); klik push membuka `/pusat-notifikasi/buka/<id>` dan tujuan diambil dari database → tanpa open redirect.
- Kunci perangkat AES-256-GCM di database; endpoint hanya host layanan push dikenal (cegah SSRF); token pembangun dibandingkan *timing-safe*.
- Isi push minimal; nominal disembunyikan di layar kunci secara bawaan ("Rp •••").
- Peristiwa keamanan: perangkat baru, hak akses diubah/dinonaktifkan (kritis, tidak bisa dimatikan).
- Batas: uji 5/jam, 10 perangkat aktif per akun, ulang maks. 5 kali, antrean >24 jam kedaluwarsa.

## 7. Pengujian

| Uji | Hasil |
|---|---|
| `supabase/tests/notifikasi_push.sql` (database baru + semua migrasi) | 75 pernyataan, semua t — Verified |
| `node supabase/tests/notifikasi_push_js.mjs` — termasuk vektor uji resmi RFC 8291 Lampiran A (byte-per-byte), JWT ES256, kunci terenkripsi | 22/22 — Verified |
| `node supabase/tests/notifikasi_kirim_js.mjs` — layanan push tiruan HTTPS: verifikasi JWT, dekripsi, header TTL/Urgency/Topic, 201/404/410/429/503/400 | 16/16 — Verified |
| `supabase/tests/isolasi.sql` (+ RPC pengaturan notifikasi) | LULUS 269 — Verified |
| Regresi uji lama (peristiwa, kasir offline, stok, persetujuan, proyek, SDM, integrasi, portal B2B) dengan vs tanpa migrasi | Keluaran identik — Verified |
| `next build` | Lulus — Verified |
| Render 390px & 1280px (Pusat, Pengaturan, Perangkat, Aktifkan, Detail, Bantuan, dropdown lonceng) | Tanpa galat, tanpa melebar — Verified (data contoh) |
| Push nyata ke Android Chrome, iPhone Safari (Layar Utama), Windows Chrome/Edge, macOS Safari/Chrome | **Belum diverifikasi** — perlu dicoba di perangkat nyata setelah deploy |
| pg_net & pg_cron terpasang di Supabase produksi | **Belum diverifikasi** — lihat Admin › Status sistem setelah deploy |

## 8. Deploy (bisa dari HP)

1. Merge ke `main` → Supabase memasang migrasi, Vercel men-deploy.
2. Tidak ada env baru yang wajib. Kunci VAPID dibuat otomatis oleh server saat pertama dibutuhkan (tersimpan di `notif_config`, hanya service role). Opsional: isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:…) di Vercel — **jangan ganti kunci setelah ada pelanggan**, semua perangkat harus mengaktifkan ulang.
3. Buka Admin › Status sistem › Notifikasi & push: pastikan pg_net & pg_cron "aktif" dan alamat aplikasi terdaftar (terdaftar otomatis setelah cron harian atau tombol Uji pertama). Bila pg_net/pg_cron "tidak tersedia": Supabase Dashboard › Database › Extensions › aktifkan `pg_net` dan `pg_cron`, lalu jalankan ulang bagian penjadwal di migrasi (atau hubungi pengembang).
4. Uji di HP: lonceng › Pengaturan › Aktifkan Notifikasi › Kirim notifikasi uji.

## 9. Pemeliharaan

- Peristiwa baru → tambah baris `notif_event_types` di migrasi baru (jangan ubah migrasi lama). Peristiwa yang tidak lewat `domain_events` → panggil `notif_emit_safe` dari trigger.
- Kategori baru → tambah di constraint `notif_event_types.category`, `notif_settings_set`, dan `CATS` (`lib/notif.js`).
- Pantau `galat_terakhir` di Admin › Status sistem: galat pembuatan notifikasi tidak menggagalkan transaksi, tetapi dicatat di sana.
- Dalam rencana (belum dibuat): notifikasi login baru (perlu hook autentikasi Supabase), pengumuman platform sebagai notifikasi, sinkron dibaca lintas tab secara realtime (sekarang polling 60 detik + pesan service worker).
