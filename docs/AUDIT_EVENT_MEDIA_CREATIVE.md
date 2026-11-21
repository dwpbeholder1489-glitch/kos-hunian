# Audit Fondasi — PRASARA Event, Media & Creative Production

Dokumen acuan: `PRASARA_EVENT_MEDIA_CREATIVE_MASTER_BLUEPRINT_v1.0` + `PRASARA_EVENT_MEDIA_CREATIVE_DEEP_DIVE` (21 Nov 2026).
Ini adalah **Phase 0 — Foundation & Validation** (Bagian XV §32 & Bagian XIX blueprint): memetakan apa yang SUDAH ada di kode sebelum membangun, agar tidak membangun ulang mesin yang sama (aturan implementasi #1).

Status: **Existing** · **Partial** · **Missing** · **Needs extension** · **Needs integration** (istilah blueprint §45).
Semua status di bawah diverifikasi dari isi `supabase/migrations/` dan `app/` per commit `5eb5c56` — bukan dari ingatan.

---

## 1. Kondisi sekarang dalam satu kalimat

Industri ini **sudah bisa dipilih saat pendaftaran**, tetapi dilayani oleh mesin umum yang belum cocok:

| Kategori di `/mulai` | Mesin yang dipakai sekarang | Akibatnya |
|---|---|---|
| Event, Hiburan & Entertainment (`event`) | Business Builder, template `bb_event` (Acara, Klien, Tugas, Vendor — isi di `bb_records.data` jsonb) | Nilai kontrak hanya angka di catatan: **tidak masuk Pembukuan**, tidak ada termin, anggaran vs realisasi, rundown, venue bentrok |
| Studio / Venue (`event_studio`, `event_venue`), Rental (`rental`) | Business Builder `bb_rental` | Ketersediaan unit **tidak dicek berdasarkan waktu**; deposit tidak tercatat sebagai kewajiban |
| Media, Kreatif & Komunikasi (`media`) | Mesin Jasa (`svc_orders`, tahap, pembayaran) | Cocok untuk pesanan kecil; **tanpa penawaran, versi karya, review, batas revisi** |
| Manufaktur / percetakan | Business Builder `bb_produksi` | Tanpa BOM, tanpa pemakaian bahan dari stok |

Kesimpulan: blueprint ini **bukan sekadar menambah menu**; ia membutuhkan mesin inti baru (Proyek + penagihan proyek) yang terhubung ke Pembukuan. Tanpa itu, prinsip "satu fondasi transaksi dan keuangan" (Kesimpulan blueprint) dilanggar oleh template Builder yang sekarang.

---

## 2. Audit checklist §45 (komponen platform)

| Komponen | Status | Bukti di kode | Catatan |
|---|---|---|---|
| CRM | **Partial** | `crm_leads`, `crm_activities`, `crm_tasks`, halaman `/crm` | Lead → konfirmasi ke kos/toko/jasa. Belum ada *opportunity* bernilai, brief, tahap pipeline per proyek |
| Pelanggan (Customer master) | **Existing** | `contacts` (kind `pelanggan`/`supplier`, batas kredit, tempo, NPWP) | Dipakai ulang. Vendor = `supplier`. Klien korporat dengan beberapa *contact person*: **Missing** |
| Project Engine | **Missing** | Hanya template Builder `bb_proyek`/`bb_event` (jsonb) | Inti blueprint §8 |
| Quotation & Proposal | **Partial** | `so_orders` (penawaran grosir **barang**), tanpa penawaran jasa (lihat `AUDIT_MODUL_V2.md` baris 42) | Perlu penawaran jasa/proyek dengan scope, revisi, termin |
| Contract | **Missing** | — | Hanya lampiran PDF |
| Payment Engine | **Partial / terpecah** | `payments` (kos), `svc_payments` (jasa), `sales` (kasir), `pay_*` (langganan platform), `deposits` | Tiga jalur uang pelanggan. Proyek harus memakai salah satu pola ini, bukan membuat jalur keempat tanpa alasan → **keputusan K3** |
| Accounting Engine | **Existing** | `acct_*`, `acct_desired` (sumber jurnal per dokumen), neraca saldo, arus kas, umur piutang | Proyek cukup menjadi sumber baru di `acct_desired`. `bb_records` **tidak** pernah dijurnal |
| Deposit sebagai kewajiban | **Existing (pola)** | `deposits` kos, DP booking = akun uang muka, uang muka jasa | Pola dipakai ulang untuk deposit sewa alat & DP event (EVT-019) |
| Asset Management | **Partial** | `fixed_assets` + penyusutan | Aset akuntansi, bukan **unit peralatan bertanggal** (serial, kondisi, status sewa) |
| Inventory Engine | **Existing** | `products`, `stock_moves`, lokasi, batch, nomor seri | Material produksi & merchandise bisa memakai ini |
| Ketersediaan berbasis waktu | **Partial (pola)** | `bookings` mengunci kamar; `kul_resv_clash` bentrok meja | Pola bentrok jadwal ada, tetapi khusus kamar/meja. Scheduling Engine umum: **Missing** |
| Vendor & Procurement | **Existing** | `purchase_requests`, `purchases`, `supplier_invoices`, `supplier_scorecard` | Untuk barang. Vendor **jasa** per proyek (sound, dekorasi) + komitmen biaya: **Needs extension** |
| Workforce | **Partial** | `staff`, `staff_shifts`, `attendance`, `payroll_*`, `kos_members` | Karyawan tetap. Freelancer/talent/crew harian + fee per proyek: **Missing** |
| User & Permission per proyek | **Missing** | Izin per area (`member_in`, `kos_members.areas`, `perms`) | Blueprint §15.1/§17 minta akses berbasis penugasan proyek |
| Approval | **Existing** | `approval_*`, bertingkat (Pro), `wf_check` | Tambah tindakan baru (anggaran proyek, perubahan scope, final deliverable) |
| Workflow per tipe | **Existing** | `workflow_*`, `svc_stages`, `bb_statuses/transitions` | Lifecycle event 15 status (§5.2) bisa memakai pola ini |
| Notification | **Partial** | `/notifikasi`, pengingat, otomatisasi harian | Tanpa WhatsApp/email otomatis per kejadian (sudah ditandai "Dalam rencana") |
| Customer Portal | **Partial** | Halaman publik `/b/[slug]`, portal penghuni, cek status pesanan | Portal klien proyek (lihat status, review karya, setujui) : **Missing** |
| Audit Trail | **Existing** | `domain_events` + `/aktivitas`, `config_history`, `admin_log` | Tabel baru wajib diberi trigger `dom_*` |
| Document/File | **Partial** | `attachments` (bucket privat, maks 4 MB, JPEG/PNG/WEBP/PDF), `media` (foto publik) | Tidak cocok untuk video/desain besar. Blueprint EVT-002 = external-first → **keputusan K4** |
| Ticketing & Registration | **Missing** | — | Formulir publik + `public_*` + pembayaran Lynk (khusus langganan platform) bisa dipakai sebagian |
| Payment gateway untuk pelanggan bisnis | **Missing** | Lynk hanya untuk tagihan langganan PRASARA | Tiket berbayar online butuh gateway milik pemilik bisnis → tidak bisa diklaim sekarang |
| Reporting | **Existing** | Laporan, Analisis, Pembukuan | Laba per proyek: **Missing** (butuh Project Costing) |

---

## 3. Audit per domain (Bagian III blueprint)

### 3.1 Event Operations
| Fitur | Status |
|---|---|
| Event master, kalender | Partial — catatan Builder `acara` (tanggal, klien, lokasi, nilai) |
| Lifecycle 15 status + aturan transisi | Partial — status Builder bebas, tanpa syarat komersial |
| Checklist, milestone, risk register, readiness | Partial — hanya `tugas` Builder |
| Venue + bentrok jadwal | Missing |
| Rundown berversi (sumber jadwal operasional) | Missing |
| Event budgeting (initial/approved/committed/actual/forecast/variance) | Missing — `budgets` yang ada per bulan × kategori, bukan per proyek |
| Sponsor | Missing |
| Event execution (live rundown, incident log) | Missing |

### 3.2 Creative & Media Operations
| Fitur | Status |
|---|---|
| Creative brief + status kelengkapan | Missing |
| Deliverable + 8 status | Missing (Jasa hanya punya tahap pesanan) |
| Versi karya, komentar per versi, final lock | Missing |
| Batas revisi → change request berbayar | Missing |
| Editorial workflow, campaign, ad spend terpisah | Missing (Phase 6 blueprint) |

### 3.3 Production & Asset Operations
| Fitur | Status |
|---|---|
| Production project (pre-prod → delivery) | Missing |
| Equipment unit (serial, kondisi, status) | Partial — `product_serials` (barang dagang), `fixed_assets` (akuntansi) |
| Availability per tanggal (reserved/in-use/maintenance/…) | Missing |
| Rental workflow (booking → dispatch → return → inspeksi → settlement) | Partial — Builder `bb_rental` tanpa cek bentrok & tanpa jurnal |
| BOM, work order, QC | Missing (sudah tercatat di registri modul sebagai rencana) |

---

## 4. Risiko & konflik yang ditemukan

1. **Bisnis lama yang memakai template Builder** (`bb_event`, `bb_rental`, `bb_proyek`, `bb_produksi`) — datanya di `bb_records`. Mesin baru tidak boleh merusak/menghilangkan data itu. Perlu jalur: tetap jalan seperti sekarang + tawaran pindah (impor) yang disetujui pemilik. Jumlah bisnis nyata yang memakai template ini **belum diverifikasi** (perlu dicek di database produksi sebelum memutuskan cara migrasi).
2. **Jalur uang keempat.** Bila proyek membuat tabel pembayaran sendiri tanpa disiplin, laporan kas/piutang/umur piutang akan pecah. Proyek wajib masuk `acct_desired`, `contact_balance`/`receivable_open`, `domain_events`, `zz_kos_open_guard`, batas paket, dan Analisis.
3. **Nama bentrok.** Sudah ada tabel `media` (foto publik), `bb_events` (riwayat Builder), `bookings` (kamar), `deposits` (penghuni). Mesin baru perlu prefiks sendiri (usulan `prj_*`, `evt_*`, `crv_*`, `eqp_*`).
4. **Paket & harga.** Blueprint tidak menyebut paket. Fitur baru perlu kode fitur di `plan_versions` + `lib/plan.js` → keputusan pemilik.
5. **Payment gateway untuk tiket** belum ada untuk bisnis pelanggan (Lynk hanya untuk langganan PRASARA). Ticketing berbayar online tidak boleh diklaim sebelum ini ada; tiket gratis/bayar manual bisa lebih dulu.

---

## 5. Usulan urutan kerja (menyesuaikan blueprint Bagian XV dengan kondisi kode)

Blueprint menyarankan Phase 1 Commercial & Project Foundation dulu. Hasil audit mendukung urutan itu, dengan rincian:

| Tahap | Isi | Memakai ulang |
|---|---|---|
| **1A — Mesin Proyek** | `prj_projects` (tipe event/creative/production/umum, klien = `contacts`, PM, status, tanggal, nilai kontrak), milestone, tugas, penugasan anggota, riwayat, lampiran, `dom_*`, guard | contacts, staff/kos_members, attachments, workflow, approval |
| **1B — Penawaran & scope** | Penawaran proyek (baris layanan, scope termasuk/tidak, batas revisi, termin), disetujui → proyek dibuat; perubahan scope = change request | approval, nomor dokumen, cetak `/dokumen` |
| **1C — Anggaran & biaya proyek** | Anggaran per kategori (venue, sound, talent, …), komitmen (PO/vendor), biaya aktual (`expenses`/`purchases` bertanda proyek), laba proyek | expenses, purchases, supplier_invoices, acct |
| **1D — Tagihan termin & pembayaran klien** | Termin → tagihan → pembayaran → jurnal; DP = uang muka sampai diakui | pola uang muka jasa/booking, acct_desired, receivable_open |
| 2 — Creative | Brief, deliverable, versi (tautan eksternal + metadata), review per versi, batas revisi, final lock | Mesin Proyek |
| 3 — Event | Event master di atas proyek, venue + bentrok, rundown berversi, crew, readiness | Mesin Proyek, Scheduling |
| 4 — Ticketing | Registrasi, jenis tiket, QR, check-in anti dobel (bayar manual dulu) | public_*, lib/qr.js |
| 5 — Peralatan & sewa | Unit alat, ketersediaan per waktu, booking → kirim → kembali → inspeksi, deposit | pola bookings, fixed_assets |
| 6 — Lanjutan | Editorial, kampanye, BOM/work order, QC | inventory |

Setiap tahap: migrasi baru (tidak mengubah migrasi lama), uji SQL di PostgreSQL lokal (`supabase/tests/`), uji isolasi, panduan (`app/panduan`, `lib/guide.js`), registri modul (`impl_status`).

---

## 6. Keputusan yang dibutuhkan dari pemilik sebelum Tahap 1A

Blueprint §44 melarang memutuskan ini dengan asumsi.

| Kode | Pertanyaan | Rekomendasi | Alasan |
|---|---|---|---|
| K1 | Mesin dasar: tabel Proyek baru vs memperluas Business Builder vs memperluas mesin Jasa | **Tabel Proyek baru** (`prj_*`) | Builder (jsonb) tidak bisa dijurnal/divalidasi; Jasa dirancang untuk pesanan pendek tanpa milestone/anggaran |
| K2 | Event = objek sendiri yang selalu punya proyek induk (boleh subproyek), atau event = salah satu tipe proyek | **Event = perluasan 1-ke-1 dari proyek bertipe event; subproyek opsional** | Biaya, tagihan, tugas tetap satu tempat (proyek); data khusus event (venue, rundown) di tabel event |
| K3 | Kapan pendapatan proyek diakui | **Pembayaran sebelum serah terima = uang muka; diakui saat termin/milestone dinyatakan selesai (diserahkan)** | Konsisten dengan Jasa (diakui saat diserahkan) tetapi tidak menunggu proyek panjang selesai seluruhnya |
| K4 | Penyimpanan file karya | **Tahap awal: tautan eksternal (Google Drive/Dropbox/dll.) + metadata & versi di PRASARA; file kecil tetap lewat Lampiran. Konektor OAuth menyusul** | Sesuai EVT-002 & EVT-022 tanpa biaya penyimpanan besar; tidak mengklaim integrasi yang belum diuji |
| K5 | Paket untuk mesin proyek | Perlu keputusan pemilik | Mempengaruhi `plan_versions` & tabel fitur |
| K6 | Template Builder lama (`bb_event`, dst.) | Tetap berjalan; bisnis baru kategori event/media memakai mesin baru setelah siap; impor data lama atas persetujuan pemilik | Tidak menghilangkan fitur yang sudah ada |

Keputusan EVT-001…003 tetap **Dipilih** (baseline). EVT-004…026 tetap **Proposed** sampai pemilik menguncinya.

---

## 7. Keputusan pemilik (21 Nov 2026)

| Kode | Keputusan | Status |
|---|---|---|
| K1 | Mesin Proyek baru (`prj_*`), template Builder lama tetap berjalan | **Final** |
| K2 | Event = proyek bertipe event (perluasan 1-ke-1), subproyek opsional | **Final** (menjawab Open Question #1; mengunci EVT-004, EVT-017) |
| K3 | Pembayaran sebelum serah terima = uang muka; pendapatan diakui per termin/milestone yang diserahkan | **Final** |
| K4 | File karya tahap awal = tautan eksternal + metadata & versi di PRASARA; file kecil lewat Lampiran; konektor OAuth menyusul setelah diuji | **Final** (menjawab Open Question #3; mengunci arah EVT-012, EVT-022) |
| K5 | Paket untuk Mesin Proyek | Menunggu |
| K6 | Cara pindah data template Builder lama | Menunggu (cek jumlah pemakai di produksi dulu) |
