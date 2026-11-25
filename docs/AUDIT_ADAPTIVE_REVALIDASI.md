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
