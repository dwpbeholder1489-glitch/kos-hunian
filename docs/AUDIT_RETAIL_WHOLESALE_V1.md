# Audit sinkron — PRASARA Retail & Wholesale Master Prompt v1.0 + Blueprint v1.0

Tanggal: 15 Nov 2026 (setelah Toko lanjutan 2 online, migrasi terakhir `20261115120000`).
Dasar: isi repository & database nyata (bukan rencana). Status memakai istilah dokumen (Bagian 26 Tahap G):
**Verified** = ada di DB + UI + uji otomatis · **Partial** = sebagian · **Not Started** · **Needs Decision** = sudah berjalan, tetapi
dokumen mewajibkan keputusan pemilik (tidak boleh saya kunci sendiri).

## 0. Keputusan final RET-001…005 vs kondisi nyata

| Keputusan FINAL | Kondisi sekarang | Status |
|---|---|---|
| RET-001 Hybrid Product Master (master bersama + produk lokal, SKU lokal, multi-barcode, varian, katalog per brand/outlet) | Produk hanya **lokal per bisnis** (`products` ber-kos_id). SKU lokal ✔, varian ✔ (grup varian), kategori ✔, **satu barcode per satuan** (belum multi-barcode per satuan), belum ada master bersama lintas bisnis, belum ada katalog per outlet | Partial |
| RET-002 Hybrid Inventory (sederhana ↔ multi-gudang, lokasi simpan, transfer, reservasi, in-transit, rusak, karantina, batch/serial/expiry) | Sederhana ✔, multi-lokasi ✔, mutasi langsung ✔ **+ kirim/dalam perjalanan/terima ✔**, **reservasi dari pesanan grosir ✔**, **ditahan rusak/karantina/periksa/retur rusak ✔**, batch+expiry ✔ (Toko lanjutan 3, 15 Nov). **Belum**: rak/bin, nomor seri | Partial (inti ✔) |
| RET-003 Advanced Pricing (eceran, grosir, reseller, distributor, khusus pelanggan, kontrak, per outlet, per jumlah, tanggal berlaku, promo, diskon, segmen) | Eceran/grosir ✔, daftar harga (reseller/distributor/dll) dipasang per pelanggan ✔, per jumlah ✔ (15 Nov), promo berjadwal ✔. **Belum**: harga per outlet, tanggal berlaku pada daftar harga/kontrak, kelompok pelanggan, batas diskon & margin minimum, riwayat perubahan harga | Partial |
| RET-004 Unified Customer (B2C/B2B/reseller/distributor/institusi, grup, banyak kontak & alamat, termin, limit, harga khusus, riwayat, piutang) | Satu tabel `contacts` ✔, termin+limit+daftar harga+NPWP+alamat ✔, riwayat & piutang ✔. **Belum**: tipe/segmen pelanggan, grup, banyak kontak person, banyak alamat (tagih/kirim), sales rep per pelanggan | Partial |
| RET-005 Full Distribution (picking, packing, dispatch, driver, armada, rute, tracking, POD, kirim sebagian, gagal, retur kirim, rekonsiliasi) | Surat jalan bertahap ✔, status dikirim/diterima(+nama penerima)/gagal ✔ (gagal = faktur batal, stok & piutang kembali). **Belum**: picking/packing list, armada & driver, rute/zona, POD foto/tanda tangan, retur sebagian dari pengiriman, rekonsiliasi pengiriman, biaya kirim | Partial (dasar) |

## 1. Per bagian Master Prompt

| Bagian | Isi | Status | Catatan jujur |
|---|---|---|---|
| 4 Organisasi | Legal Entity → Brand/BU → Outlet → Gudang → Lokasi simpan | Partial | `legal_entities` mengelompokkan beberapa bisnis (laporan gabungan Pro); bisnis = brand/BU; `branches` = outlet/gudang; akses karyawan per lokasi (`member_locations`). Belum: lokasi simpan, transaksi antar-entitas/antar-bisnis |
| 5.2 Hak akses | peran, aksi, outlet, gudang, kewenangan persetujuan, audit | Partial | peran+area ✔, area per orang (Bisnis) ✔, izin per aksi (Pro) ✔, persetujuan bertingkat ✔, lokasi kerja dikunci ✔. Belum: peran driver/gudang/procurement khusus, batas nilai transaksi per orang |
| 5.3 Katalog | SKU, barcode, kategori, merek produk, varian, satuan, bundling, foto | Partial | Belum: **merek produk**, **multi-barcode**, **bundling/kit yang memotong stok komponen** (promo paket hanya harga), deskripsi/dokumen produk |
| 5.6 Pembayaran | tunai, transfer, digital, parsial, multi-metode, settlement, refund, rekonsiliasi | Partial | campuran ✔, kasbon+pelunasan ✔, rekonsiliasi bank ✔. QRIS = dicatat manual (tidak terintegrasi gateway — sudah benar dibedakan). Belum: settlement penyedia, uang muka penjualan toko |
| 5.7 / 9 Persediaan | on-hand vs available vs reserved vs in-transit vs damaged vs quarantine | Verified (15 Nov) | fisik, dipesan, ditahan (rusak/karantina), dalam perjalanan, tersedia = fisik − dipesan − ditahan; Kasir & aturan Tolak memakai tersedia. Aturan keras #12 terpenuhi |
| 9.5 Kontrol stok | min, max, reorder point, safety stock, aging, dead/slow/fast moving, rekonsiliasi | Verified (15 Nov) | min ✔, **maks ✔**, saran belanja (memperhitungkan dipesan & maks) ✔, **umur stok ✔**, **cepat/normal/lambat/mati/baru ✔** (aturan tertulis), opname ✔. Safety stock = cadangan hari tetap di saran belanja (belum diatur per barang) |
| 10 Harga & promo | resolusi harga, prioritas konflik, stacking, batas diskon, margin floor, override & audit | **Needs Decision** + Partial | Urutan yang **sudah berjalan** (saya yang menetapkan, belum disetujui): harga manual › daftar harga pelanggan › grosir › eceran; lalu harga per jumlah (ambil termurah); lalu promo (satu barang satu promo); diskon manual tanpa batas. Dokumen melarang mengarang prioritas → perlu keputusan |
| 11 Kredit | limit, termin, jatuh tempo, utilisasi, overdue, credit hold, persetujuan, riwayat, aging | Partial | limit+termin+jatuh tempo+aging ✔, lewat limit hanya pengelola+alasan ✔. Belum: **tahan kredit karena lewat jatuh tempo**, kasbon di Kasir belum dicek limit, riwayat perubahan limit, limit per cabang pelanggan |
| 12.1 POS | barcode, cari, keranjang, diskon, pajak, multi-bayar, struk, refund, retur, shift, laci | Verified | + kategori, varian, harga per jumlah, aturan stok minus. Belum: tukar barang (exchange) & nota kredit/saldo toko |
| 12.2–12.3 Penjualan grosir | penawaran, PO pelanggan, SO, cek kredit, cek stok, **reservasi**, pemenuhan, faktur | Partial | Semua ✔ (No. PO pelanggan = kolom Ref/PO pelanggan ✔). Reservasi ✔ sejak 15 Nov (Toko lanjutan 3). Belum: backorder eksplisit |
| 12.4 Retur | sebagian/penuh, refund, tukar, nota kredit, restock, retur rusak | Partial | retur sebagian/penuh + refund ✔, **retur rusak → ditahan ✔** (15 Nov). Belum: tukar barang, nota kredit |
| 13 Pengadaan | PR → persetujuan → PO → terima → faktur → bayar, katalog & harga supplier, MOQ, lead time, kinerja, retur | Partial | alur lengkap ✔, terima sebagian ✔, retur beli ✔, kinerja supplier ✔, lead time ✔. Belum: **katalog/harga per supplier & MOQ**, perbandingan penawaran (RFQ), umur utang (AP aging) |
| 14 Distribusi | lihat RET-005 | Partial (dasar) | |
| 15 Portal & omnichannel | katalog, keranjang, akun pelanggan, bayar, status; B2B login, harga kontrak, reorder | Partial | Halaman toko: katalog + permintaan → prospek → keranjang Kasir. Belum: **keranjang & pesanan langsung toko**, akun pelanggan, **portal B2B**, marketplace (konektor eksternal = Not Started, jangan diklaim) |
| 16 Akuntansi | posting 20 jenis transaksi, valuasi, HPP, laporan minimum | Partial | jurnal otomatis double-entry ✔ untuk penjualan/kredit/retur/beli/retur beli/bayar supplier/persediaan/HPP/diskon/PPN/biaya/aset/bank. Laporan: L/R ✔, neraca ✔, arus kas ✔, buku besar ✔, umur piutang ✔. Belum: **neraca saldo (trial balance)**, **umur utang**, **laporan nilai persediaan**, biaya distribusi terpisah |
| 16 Metode HPP | FIFO vs rata-rata tertimbang | **Needs Decision** | Yang berjalan: **rata-rata tertimbang bergerak** (moving average) sejak awal. Dokumen: jangan memilih tanpa kajian → perlu keputusan resmi (rekomendasi saya: tetap rata-rata, alasan di §3) |
| 17 KPI | retail, wholesale, distribusi; tiap KPI berdefinisi & berformula | Partial | Retail: rata-rata transaksi, jenis/transaksi, margin, perputaran, hari persediaan, stok habis, susut, per kasir, per kategori ✔. Belum: penjualan per jam, return rate, dead stock %. Wholesale: fill rate, on-time, utilisasi kredit, DSO, margin per pelanggan, per sales = Not Started. Distribusi = Not Started |
| 18 POS offline | antrean lokal, sinkron, idempotensi, konflik | Verified (21 Nov) | Tahap 4 — Kasir toko bisa dipakai tanpa internet, antrean di HP dikirim otomatis tanpa dobel, temuan untuk pemilik. Lihat §8 |
| 20 Keamanan & audit | riwayat transaksi, persetujuan, **harga**, **limit kredit**, penyesuaian stok, izin, versi dokumen | Partial | transaksi/persetujuan/stok/modul tercatat (`domain_events`, `config_history`). Belum: **riwayat perubahan harga**, **riwayat limit kredit**, riwayat perubahan izin karyawan (perlu dicek), versi dokumen penawaran |
| 21 Konfigurasi | template, dependensi modul, izin bawaan, upgrade path | Partial | template + Pusat Konfirmasi + registri modul ✔. Belum: template khusus Grosir/Distributor/Fashion/Specialty (sekarang satu template toko) |
| 23 Tier pengalaman | Retail / Wholesale & Distribution / Enterprise | Partial | Satu ruang kerja toko dengan modul menyala/mati; belum ada tampilan per tier |

## 2. Aturan keras — yang saat ini dilanggar / berisiko

- **#11 Harga final tanpa mekanisme resolusi konflik yang disetujui** → resolusi sudah ada di server, tetapi urutannya belum disetujui (RET-008).
- ~~#12 Stok fisik = stok tersedia~~ → **diperbaiki 15 Nov** (Toko lanjutan 3).
- **#13 Pesanan ≠ pengiriman** → sudah terpenuhi (SO terpisah dari surat jalan).
- **#14 Pembayaran ≠ settlement** → terpenuhi untuk pencatatan manual; belum ada settlement gateway (tidak diklaim).
- **#15 Integrasi eksternal** → marketplace/ekspedisi/gateway toko tidak diklaim di aplikasi (perlu tetap dijaga di landing & panduan).

## 3. Proposal teknis RET-006…014 (STATUS: PROPOSAL, belum final)

| ID | Usulan | Kondisi sekarang | Rekomendasi singkat |
|---|---|---|---|
| RET-006 | Identitas produk dipisah dari listing katalog | belum (produk = listing) | Tunda sampai ada master bersama; tambah dulu multi-barcode & merek |
| RET-007 | Satu stock ledger | **sudah**: `stock_moves` satu-satunya sumber, `stock_levels`/`stock_batches` turunan | Setujui sebagai final (sudah teruji di semua fitur) |
| RET-008 | Pricing Resolution Engine | ada (lihat §1 Bagian 10) | Minta keputusan urutan + stacking + batas diskon |
| RET-009 | Unified customer + segmentasi | contacts tunggal tanpa segmen | Tambah tipe & grup pelanggan di tabel yang sama |
| RET-010 | SO dan Shipment dipisah | **sudah** (`so_orders` vs `so_deliveries`) | Setujui sebagai final |
| RET-011 | Reservasi stok | **dibangun 15 Nov** (dihitung dari sisa pesanan, tanpa tabel) | Mohon disetujui sebagai final |
| RET-012 | Armada internal + pihak ketiga | belum | Kendaraan/driver sendiri + "ekspedisi" sebagai teks/kontak; tanpa optimasi rute |
| RET-013 | Rekonsiliasi pengiriman | belum | Per pengiriman: dikirim vs diterima vs kembali, otomatis retur sebagian |
| RET-014 | Audit & persetujuan perubahan harga/kredit | belum | Riwayat harga & limit + persetujuan diskon di atas batas |

Metode HPP (bukan nomor RET di Master Prompt, tetapi wajib dikaji): rata-rata bergerak sudah dipakai untuk seluruh data lama; mengganti ke FIFO
mengubah HPP historis dan laporan. Rekomendasi: tetapkan rata-rata bergerak sebagai metode resmi (umum dipakai UMKM dagang, sesuai SAK EMKM/ETAP
yang mengizinkan rata-rata tertimbang), FIFO hanya untuk urutan keluar batch kedaluwarsa (sudah: FEFO) — perlu konfirmasi pemilik/akuntan.

## 3b. Keputusan pemilik 15 Nov 2026 (FINAL)

- **RET-008 urutan harga**: harga manual › daftar harga pelanggan › grosir › eceran; lalu harga beli banyak (ambil termurah); lalu promo (satu barang satu promo). Diresmikan apa adanya.
- **Metode HPP**: rata-rata bergerak (moving average) = metode resmi; batch kedaluwarsa tetap keluar duluan (FEFO).
- **Batas diskon & margin minimum**: diisi pemilik sendiri di Pengaturan; bawaan kosong = tanpa batas. Di atas batas → persetujuan pemilik/pengelola.
- **Tahap 1 — jatuh tempo (15 Nov 2026)**: piutang lewat jatuh tempo HANYA memberi peringatan (tidak menahan pesanan grosir).
- **Tahap 1 — kasbon Kasir melewati batas kredit (15 Nov 2026)**: tidak kaku. Sistem mengizinkan, memberi peringatan, dan mencatat di riwayat. Pemilik meminta sistem selalu siap menghadapi kondisi lapangan yang tidak bisa dikendalikan.

## 4. Usulan urutan tahap

1. ~~**Toko lanjutan 3 — Persediaan tersedia**~~ SELESAI 15 Nov: reservasi dari pesanan grosir, mutasi dalam perjalanan (kirim → terima), stok rusak/karantina terpisah dari stok jual, retur barang rusak, stok maksimum + umur stok + fast/slow/dead.
Urutan yang disetujui pemilik 15 Nov 2026 (sesuai Master Prompt Bagian 24 & Blueprint §17; wajib selesai semua sebelum pindah ke bisnis atau modul lain):

2. ✅ **Tahap 1 — Tata kelola harga & kredit** (Phase 3, SELESAI 20 Nov 2026 — lihat §5): urutan harga yang disetujui, harga per outlet, tanggal berlaku daftar harga/kontrak, batas diskon kasir + persetujuan, margin minimum, riwayat harga & limit, tahan kredit bila lewat jatuh tempo, cek limit untuk kasbon Kasir, tipe/grup pelanggan, sales rep. (RET-003, RET-008, RET-014, RET-004, RET-009)
3. ✅ **Tahap 2 — Fondasi akuntansi dagang** (Phase 1, SELESAI 21 Nov 2026 — lihat §6): neraca saldo (trial balance), umur utang (AP aging), laporan nilai persediaan, + KPI grosir.
4. ✅ **Tahap 3 — Katalog lanjutan** (SELESAI 21 Nov 2026 — lihat §7) (Phase 1, RET-001): multi-barcode per satuan, merek produk, paket/kit yang memotong stok komponen, nomor seri + garansi (toko elektronik/specialty), tukar barang & nota kredit (RET-008), harga & MOQ per supplier.
5. ✅ **Tahap 4 — POS offline** (SELESAI 21 Nov 2026 — lihat §8) (prioritas: Master Bagian 18, ADR-003): antrean lokal + sinkron idempoten, deteksi konflik stok/harga, batas jelas apa yang boleh offline.
6. ✅ **Tahap 5 — Portal B2B & pesanan langsung** (Phase 3, SELESAI 22 Nov 2026 — lihat §9): keranjang + pesanan langsung toko, akun pelanggan B2B dengan harga kontrak, riwayat dan faktur, pemesanan ulang.
7. **Tahap 6 — Distribusi** (Phase 4, RET-005, RET-012, RET-013): picking/packing list, kendaraan & driver internal serta pihak ketiga, jadwal kirim, POD (nama + foto), retur sebagian dari pengiriman, rekonsiliasi & biaya kirim, KPI distribusi.
8. **Tahap 7 — Multi-outlet, konsolidasi & franchise** (Phase 5–6): katalog & harga per outlet terkonsolidasi, laporan gabungan lintas outlet, standarisasi katalog franchise (RET-012), tampilan per tier (Blueprint §19).

Aturan pengerjaan: setiap tahap wajib lengkap (backend, database, UI, uji, panduan) sebelum tahap berikutnya dimulai. KPI grosir (fill rate, DSO, margin per pelanggan/sales) dikerjakan bersama tahap 1–2 karena bergantung pada data kredit dan akuntansi.

## 5. Status Tahap 1 — Tata kelola harga & kredit (20 Nov 2026)

Migrasi `20261115140000`–`20261115180000`. Uji `supabase/tests/tata_kelola_harga_1.sql` (28), `_2.sql` (21), `_3.sql` (24), `_4.sql` (11) lulus semua; regresi penuh (44 berkas uji) dan isolasi (220) lulus. Layar diuji di lebar HP 390 px (terang & gelap).

| Butir | Status | Bukti |
|---|---|---|
| Urutan harga resmi (manual › daftar pelanggan › outlet/umum › beli banyak › promo) | Verified Implemented | `price_resolve` dipakai `sale_create` & `promo_preview`; sebelumnya Kasir TIDAK memakai daftar harga pelanggan — diperbaiki. Pratinjau Kasir = server (`kasir_catalog.list_items`, harga outlet di `units`) |
| Harga per outlet (RET-003) | Verified Implemented | `outlet_prices` + `outlet_price_set`; outlet = lokasi kerja (`stock_loc`) |
| Tanggal berlaku daftar harga / kontrak (RET-003) | Verified Implemented | `price_lists.valid_from/valid_to`, `price_list_live` |
| Batas diskon kasir & margin minimum + persetujuan (Bagian 10) | Verified Implemented | `price_policy_set`, `discount_guard` (`BATAS_DISKON`), izin pemilik/pengelola + alasan → `discount_overrides` |
| Riwayat perubahan harga (RET-014, §20) | Verified Implemented | `price_history` (eceran/grosir/daftar/outlet), `price_history_list` |
| Riwayat perubahan limit kredit (RET-014, §20) | Verified Implemented | `customer_terms_set` kini menyimpan nilai sebelum; tampil sebelum → sesudah di Syarat pelanggan & Konfigurasi › Riwayat |
| Tahan kredit lewat jatuh tempo (§11.3) | Verified Implemented — sesuai keputusan pemilik: PERINGATAN saja | `so_confirm` (sudah ada) + `kasbon_check` |
| Cek limit kasbon di Kasir (§11.3) | Verified Implemented — PERINGATAN, tidak memblokir (keputusan pemilik) | `kasbon_check`, peringatan kuning di Kasir |
| Tipe/grup pelanggan (RET-004, RET-009) | Verified Implemented | `contacts.tipe` (umum/reseller/distributor/institusi), tampil di daftar kontak |
| Sales yang memegang pelanggan (§11.2) | Verified Implemented (penugasan) | `contacts.sales_user`, `customer_profile_set` |
| Laporan kinerja per sales, margin per pelanggan, DSO, fill rate (§17 KPI grosir) | Verified Implemented (Tahap 2) | `wholesale_kpi`, lihat §6 |
| Limit kredit per cabang pelanggan (§11.3) | Not Started | pelanggan belum punya cabang; menunggu kebutuhan nyata |
| Persetujuan diskon jarak jauh (pemilik tidak di tempat) | Not Started | sekarang pemilik/pengelola harus login di perangkat itu (pola `BATAS_KREDIT`) |

Status proposal: RET-008 (Pricing Resolution Engine) dan RET-014 (audit & persetujuan harga/kredit) sudah diimplementasikan sesuai keputusan pemilik 15 Nov, tetapi statusnya tetap **proposal** sampai pemilik menyatakan final.

## 6. Status Tahap 2 — Fondasi akuntansi dagang (21 Nov 2026)

Migrasi `20261121170000_akuntansi_dagang.sql` (tanpa tabel baru; semua laporan dihitung dari jurnal & kartu stok yang sudah ada). Uji `supabase/tests/akuntansi_dagang.sql` (44) lulus; isolasi (240) lulus; layar diuji di HP 390 px & laptop 1280 px.

| Butir | Status | Bukti |
|---|---|---|
| Neraca saldo / trial balance (§16) | Verified Implemented | `acct_trial_balance` (saldo awal, debit, kredit, saldo akhir D/K, `seimbang`); Paket Dasar ringkas (aset/kewajiban/ekuitas 3 baris), rinci = `laporan_lanjutan` |
| Umur utang / AP aging (§16) | Verified Implemented | `payable_open` (beli utang, faktur diposting, titipan terjual; FIFO) + `aging_report('utang')`; total = `contact_balance` (diuji) |
| Umur piutang (sudah ada `receivable_open`) | Verified Implemented — kini dengan kelompok jatuh tempo & rentang pilihan | `aging_report('piutang', {30,60,90} / {7,14,30})`, lebih bayar dipisah |
| Nilai persediaan per tanggal (§16) | Verified Implemented | `inventory_valuation`: milik/titipan/dalam perjalanan, per kategori & lokasi; hari ini dibanding akun Persediaan (selisih 0 di uji) |
| Nilai persediaan tanggal lampau persis = jurnal | Partial | kartu stok memakai waktu dicatat, jurnal memakai tanggal dokumen — ditulis jujur di layar |
| KPI grosir (§17): DSO, tertagih, margin per pelanggan, pemakaian limit, per sales, fill rate, tepat waktu, gagal kirim | Verified Implemented | `wholesale_kpi`, Laporan toko › Indikator grosir (finance; modul u_penawaran/u_kredit) |
| Ekspor Excel/CSV laporan akuntansi | Verified Implemented | `downloadCsv` + `export_take` (neraca_saldo, umur_piutang, umur_utang, nilai_persediaan) |

## 7. Status Tahap 3 — Katalog lanjutan (21 Nov 2026)

Migrasi `20261121180000_katalog_1`, `…190000_katalog_2_paket`, `…200000_katalog_3_seri_garansi`, `…210000_katalog_4_nota_tukar`. Uji `supabase/tests/katalog_lanjutan.sql` (71) lulus; isolasi (267) lulus; layar diuji di HP 390 px & laptop 1366 px.

| Butir | Status | Bukti / catatan |
|---|---|---|
| Multi-barcode per satuan (RET-001) | Verified Implemented | `product_barcodes`, `unit_barcodes_set`, `barcode_find`; Kasir & Barang mencari semua kode; bertahan saat barang disimpan ulang |
| Merek produk (§5.3) | Verified Implemented | `product_brands`, filter Barang, pencarian Kasir, `brand_report` di Laporan toko |
| Paket/kit memotong stok komponen (§5.3) | Verified Implemented | `kit_*`, `sale_line_parts`, retur/batal tepat; neraca saldo & nilai persediaan tetap cocok |
| Nomor seri + garansi (RET-002) | Verified Implemented | `product_serials`, `warranty_claims`, menu Garansi, struk menampilkan SN & garansi |
| Tukar barang & nota kredit (§12.1, §12.4) | Verified Implemented | `sale_exchange` atomik; `credit_notes` + jurnal Nota kredit (2-1700) & hangus → pendapatan lain |
| Harga & MOQ per supplier (§13) | Verified Implemented | `supplier_items`, harga otomatis & peringatan MOQ di Belanja, Saran belanja memakai supplier utama + MOQ |
| Reservasi stok untuk paket di pesanan grosir | Partial | pesanan grosir berisi paket belum memesan stok komponennya (cek stok pesanan melihat paket = 0) |
| Mencairkan nota kredit jadi uang tunai | Not Started | sisa nota hanya bisa dipakai belanja atau dihanguskan pemilik |
| Nomor seri di penerimaan Belanja | Not Started | nomor seri didaftarkan dari Barang atau saat dijual |
| Master produk bersama lintas bisnis (RET-001/RET-006) | Not Started | tetap proposal |


## 8. Status Tahap 4 — Kasir offline (21 Nov 2026)

Keputusan pemilik 21 Nov 2026: tunai, transfer/QRIS, kasbon, dan campuran BOLEH dicatat offline. Migrasi `20261121220000_kasir_offline.sql`. Uji `supabase/tests/kasir_offline.sql` (42) lulus; isolasi (271) lulus; penyimpan halaman diuji di Chromium (offline: Kasir terbuka & JS berjalan, halaman lain → "Sedang offline"); alur Kasir offline → antrean → kirim otomatis diuji di harness (HP 390 px & laptop 1366 px).

| Butir | Status | Bukti / catatan |
|---|---|---|
| Kasir terbuka tanpa internet (Master Bagian 18) | Verified Implemented | `public/sw.js` (Kasir & pembuka + file JS/CSS-nya), sesi tersimpan (`offlineSession`), daftar bisnis & katalog di HP |
| Antrean lokal + sinkron idempoten (ADR-003) | Verified Implemented | IndexedDB `prasara-offline`; `pos_offline_submit` idempoten per id transaksi (juga bila sudah tersimpan lewat jalur online); urutan waktu transaksi |
| Waktu transaksi asli | Verified Implemented | tanggal & nomor TRX hari itu, `sold_at` (shift), kartu stok; jam HP di masa depan → waktu terima + temuan |
| Deteksi konflik harga/promo/stok/batas diskon/kredit | Verified Implemented | temuan `pos_offline.issues`; transaksi TETAP tersimpan (uang sudah diterima); stok minus 'tolak' & batas diskon tidak menolak transaksi offline |
| Batas yang boleh offline | Verified Implemented | nota kredit ditolak (HP & server); promo otomatis tidak dihitung (ditandai); diskon di atas batas wajib alasan |
| Shift / tutup harian yang sudah ditutup | Verified Implemented | ditandai untuk pemilik (laci & rekap berubah) |
| Akses kasir dicabut sebelum terkirim | Verified Implemented | tidak jadi penjualan; dicatat 'Tidak tersimpan' untuk pemilik bila akun pernah bekerja di bisnis itu; orang asing ditolak |
| Pemeriksaan pemilik | Verified Implemented | Penjualan › Offline (`pos_offline_list/review`), lonceng & Pengingat (`retail_alerts.offline`) |
| Promo dihitung di HP saat offline | Not Started | butuh salinan aturan promo di HP — sengaja ditunda (temuan 'promo' memberi tahu pemilik) |
| Nota kredit saat offline | Not Started | saldo harus dicek server (risiko dipakai dua kali) |
| Kasir jasa/kuliner (pesanan) offline | Not Started | Tahap ini khusus Kasir toko |
| Kamera pindai barcode saat offline tanpa pernah dipakai online | Partial | file pemindai kamera disimpan setelah dipakai sekali saat online; scanner Bluetooth/USB & ketik kode tetap jalan |


## 9. Status Tahap 5 — Portal pelanggan grosir / B2B (22 Nov 2026)

Migrasi `20261121230000_portal_b2b.sql` (tanpa tabel baru; mesin pesanan/surat jalan/faktur tidak diubah). Uji `supabase/tests/portal_b2b.sql` (±60 pemeriksaan) lulus; regresi seluruh berkas uji: jumlah ERROR/f setiap berkas sama persis sebelum & sesudah migrasi (penolakan yang memang diharapkan). Layar diuji di HP 390 px & laptop 1280 px (portal pelanggan: katalog, periksa pesanan, terkirim, pesanan, tagihan; penjual: tab Penawaran bertanda portal, detail, tab Portal pelanggan), `scrollWidth` = lebar layar, tanpa galat skrip.

Keputusan desain (mohon dikonfirmasi): portal = **link pribadi tanpa akun/sandi** (pola portal penghuni yang sudah dipakai, paling mudah dari HP); masuk **Paket Pro** lewat fitur `portal_bisnis` yang sudah ada (V2 "Portal hanya Pro"; bisnis sebelum 14 Nov tetap lewat `legacy_features`).

| Butir Master Prompt Bagian 15 (B2B Portal) | Status | Bukti / catatan |
|---|---|---|
| Business account (akses pelanggan bisnis) | Verified Implemented — sebagai link pribadi | `cportal_link/off/list`; ganti link = link lama mati seketika; terakhir dibuka tercatat |
| Customer-specific catalog & contract price | Verified Implemented | `cportal_price` = urutan harga resmi (daftar pelanggan berlaku › outlet/grosir › eceran) + harga beli banyak; barang tanpa harga disembunyikan |
| Wholesale quantity (dus/karton, beli banyak) | Verified Implemented | semua satuan jual + tingkat harga per jumlah (tier semua/grosir) |
| Quotation request | Verified Implemented | jenis "Minta penawaran dulu" (`portal_kind`) |
| Purchase order | Verified Implemented | No. PO pelanggan, tanggal dibutuhkan, alamat kirim, catatan → `so_orders` |
| Credit terms | Verified Implemented | batas, sisa, pesanan berjalan, tempo; lewat batas = peringatan ke pelanggan, keputusan tetap di `so_confirm` |
| Invoice & payment status | Verified Implemented | faktur + sisa per faktur (FIFO sama dengan umur piutang), pembayaran tercatat, cara bayar |
| Order history & status pengiriman | Verified Implemented | status, jumlah terkirim, surat jalan, nomor faktur |
| Reorder | Verified Implemented | "Pesan lagi" (barang yang sudah tidak dijual dilewati & diberi tahu) |
| Pembatalan oleh pelanggan | Verified Implemented | hanya sebelum dikonfirmasi; penjual diberi tahu lewat lonceng |
| Notifikasi penjual | Verified Implemented | lonceng/Pengingat toko, tanda "Baru dari portal", email (`notify_email`) |
| Keamanan | Verified Implemented | tulis hanya lewat server (service_role); harga dihitung server; tanpa modal/angka stok; idempoten; batas 10/jam & 20 menunggu; anon tidak bisa membaca tabel |
| Unggah bukti bayar dari portal B2B | Not Started | sementara tombol WhatsApp ke penjual; pembayaran dicatat penjual di Kas & kasbon |
| Banyak kontak/pengguna per pelanggan bisnis | Not Started | satu link per pelanggan (RET-004 banyak kontak belum ada) |
| Retail portal (keranjang & pesanan langsung toko untuk umum) | Partial (sudah ada sebelumnya) | halaman bisnis: pilih barang → permintaan → prospek → keranjang Kasir, dikonfirmasi pemilik |
| Marketplace / e-commerce eksternal | Not Started | konektor eksternal tidak diklaim |

Perbaikan ikut: portal penghuni `/p` kehilangan header & tab di layar ≥768 px (aturan CSS shell aplikasi) — diperbaiki lewat kelas `header.top.portal`.
