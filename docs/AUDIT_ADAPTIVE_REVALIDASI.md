# PRASARA Adaptive Business Experience v3.0 — Revalidasi

Baseline `main` pada 25 November 2026 WIB, commit `89d3c80`. Audit ini memperbarui inventaris arsitektur, fitur, mesin bisnis, data, navigasi, dashboard, keamanan, dan roadmap di [audit sebelumnya](AUDIT_ADAPTIVE_EXPERIENCE.md). Hasil uji historis di sana bukan hasil uji ulang commit ini.

| Area | Bukti repositori | Keputusan |
|---|---|---|
| Fondasi | Next.js App Router, React, Supabase. 125 migrasi dan 59 berkas uji SQL pada baseline. | Pakai shell, provider, dan RPC existing. |
| Klasifikasi dan Business DNA | `biz_categories`, `biz_subcategories`, `biz_templates`, `business_profiles`, `biz_vocab` dan `lib/dna.js`. | Pertahankan registry, enam dimensi profil dan ID existing. Cakupan kategori dan seed perlu diuji di basis data hasil migrasi. |
| Kapabilitas, fitur dan rekomendasi | `modules`, `business_modules`, `relevance_rules`, `feature_recommendations`, `feature_relevance` dan `module_set`. | Gunakan metadata dan dependency existing. Aktivasi melalui server dengan izin, paket dan keputusan owner. |
| Onboarding | `app/mulai`, Pusat Konfirmasi, `setup_state` dan `setup_activate`. | Pratinjau perlu memproyeksikan persetujuan setup dan entitlement. Filter pada snapshot modul aktif tidak cukup untuk modul yang baru disetujui. |
| Navigasi | `AppShell`, layout aplikasi, `sectionsFor`, `mainTabOf` dan `fourthTab`. Tombol (+) sudah dirender di slot ketiga mobile. | Terapkan pengaturan menu tersembunyi pada pilihan otomatis dan slot laporan. Pertahankan pintasan yang dipilih secara eksplisit dan akses dari daftar Modul Bisnis. |
| Quick Actions | `lib/quick.js`, `QuickPanel`, preferensi dan pemakaian. | Saring tindakan pada bisnis arsip atau ditangguhkan. Tombol (+) tetap membuka panel yang menjelaskan statusnya. |
| Dashboard | `Dashboard`, `lib/dashboards.js`, Beranda properti, Toko, Jasa, dan Kerja. Preferensi di `experience_configs`. | Gunakan kembali widget, data dan boundary existing. Uji sumber KPI dan kegagalan parsial lintas lima profil. |
| Workflow dan evolusi | Migrasi `alur_kerja`, `domain_events`, sinyal bisnis dan kinerja pengalaman. | Pertahankan mesin workflow. Dukungan aturan berbeda menurut engine dan perlu divalidasi dalam matriks acceptance. |
| Multi-bisnis | `KosProvider`, pemilih bisnis, `portfolio_get` dan `portfolio_set`. | Uji perpindahan, scope anggota, gabungan Pro dan definisi laporan. |
| Akuntansi dan integrasi | `acct_sync`, migrasi akuntansi dagang, proyek, pembayaran, rekonsiliasi, registry integrasi dan webhook masuk. | Uji ulang integritas dari transaksi ke jurnal dan validasi integrasi. Audit lama mencatat webhook keluar serta beberapa provider masih tertunda. |
| Keamanan dan recovery | `member_can`, `member_in`, `plan_has`, RLS, `config_history`, versi konfigurasi dan fungsi pemulihan di migrasi. | Inspeksi kode memberi bukti desain. Kebijakan efektif dan pemulihan memerlukan pengujian basis data. |

## Rencana perubahan pertama

Gunakan persetujuan dari `setup_state` di Pusat Konfirmasi, fungsi penyaring yang sama pada navigasi bawah, dan registry aksi cepat existing. Perubahan menyentuh `lib/menu.js`, `lib/quick.js`, `components/QuickPanel.jsx` dan Pusat Konfirmasi. Skema, API publik dan data transaksi tidak membutuhkan migrasi pada tahap ini.

Setelah perubahan, periksa proyeksi setup, menu tersembunyi, status bisnis, izin pengguna, dan kelima profil melalui pengujian regresi. Tahap validasi selanjutnya menjalankan migrasi dan SQL di lingkungan uji, menguji onboarding dan pergantian bisnis di browser terautentikasi, serta memeriksa perangkat mobile dan desktop. Lanjutkan workflow lintas engine, KPI dan konektor yang belum memenuhi acceptance setelah statusnya terverifikasi.

## Lanjutan Fase 1 dan 2 — Penyimpanan Business DNA saat pendaftaran

`app/mulai/page.jsx` mengirim draf dan Business DNA ke `setup_create_with_dna`. RPC baru menggunakan izin pemanggil dan memanggil `setup_create` dan `dna_save` dalam satu transaksi. Kegagalan validasi profil membatalkan draf tersebut. Pendaftaran beberapa bisnis tetap menyimpan bisnis yang berhasil per draf. Persetujuan aktivasi tetap dilakukan di Pusat Konfirmasi. RPC `setup_create` tetap tersedia bagi klien lama.

Urutan penerapan: jalankan migrasi `20261125130000_setup_dna_atomik.sql` lebih dulu di Supabase, lalu rilis frontend. Jika frontend perlu dipulihkan, versi lama masih dapat memakai RPC sebelumnya.

### Hasil validasi lanjutan

| Area | Hasil |
|---|---|
| Migrasi | 126 migrasi diterapkan pada PostgreSQL lokal melalui PGlite dengan skema autentikasi tiruan. |
| Onboarding | `setup_dna_atomik.sql` lulus. Pilihan model dan kapabilitas bertahan, draf invalid dibatalkan, persetujuan tetap diperlukan, dan klien lama mendapat profil bawaan. |
| Pengujian SQL existing | Pemeriksaan boolean lulus untuk fondasi adaptif (86), dashboard (16), alur kerja (68), portofolio (15), webhook masuk (118), kinerja pengalaman (43), penagihan proyek (42), dan rekonsiliasi bank (3). Perintah psql untuk variabel dan keluaran disesuaikan pada runner lokal. Fixture draft pada uji workflow disesuaikan agar trigger modul bekerja sebelum status diubah ke draft. |
| Isolasi lintas bisnis | `isolasi.sql` melaporkan 292 pemeriksaan lulus menggunakan tenant dan akun luar lokal. |
| Frontend | Empat uji Node dan `next build` lulus. Build memakai placeholder Supabase. |

Validasi berikutnya membutuhkan lingkungan Supabase uji dan browser terautentikasi untuk jalur onboarding dari awal hingga aktivasi, pergantian workspace, integrasi eksternal, serta pemeriksaan safe area pada iPhone dan Android. Validasi akuntansi ini mencakup termin proyek dan rekonsiliasi. Matriks akuntansi lintas semua mesin bisnis masih terbuka.
