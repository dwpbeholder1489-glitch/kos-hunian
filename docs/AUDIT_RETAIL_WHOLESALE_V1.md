# Audit sinkron — PRASARA Retail & Wholesale Master Prompt v1.0 + Blueprint v1.0

Tanggal: 15 Nov 2026 (setelah Toko lanjutan 2 online, migrasi terakhir `20261115120000`).
Dasar: isi repository & database nyata (bukan rencana). Status memakai istilah dokumen (Bagian 26 Tahap G):
**Verified** = ada di DB + UI + uji otomatis · **Partial** = sebagian · **Not Started** · **Needs Decision** = sudah berjalan, tetapi
dokumen mewajibkan keputusan pemilik (tidak boleh saya kunci sendiri).

## 0. Keputusan final RET-001…005 vs kondisi nyata

| Keputusan FINAL | Kondisi sekarang | Status |
|---|---|---|
| RET-001 Hybrid Product Master (master bersama + produk lokal, SKU lokal, multi-barcode, varian, katalog per brand/outlet) | Produk hanya **lokal per bisnis** (`products` ber-kos_id). SKU lokal ✔, varian ✔ (grup varian), kategori ✔, **satu barcode per satuan** (belum multi-barcode per satuan), belum ada master bersama lintas bisnis, belum ada katalog per outlet | Partial |
| RET-002 Hybrid Inventory (sederhana ↔ multi-gudang, lokasi simpan, transfer, reservasi, in-transit, rusak, karantina, batch/serial/expiry) | Sederhana ✔, multi-lokasi cabang/gudang ✔ (`stock_levels`), mutasi ✔ (**langsung sampai, tanpa status dalam perjalanan**), batch+expiry ✔, rusak = gerak keluar (bukan status stok), **belum**: rak/bin, reservasi, in-transit, karantina, nomor seri | Partial |
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
| 5.7 / 9 Persediaan | on-hand vs available vs reserved vs in-transit vs damaged vs quarantine | **Not Started** (status stok) | Sekarang hanya on-hand. Aturan keras #12 ("stok fisik ≠ tersedia") belum terpenuhi untuk pesanan grosir |
| 9.5 Kontrol stok | min, max, reorder point, safety stock, aging, dead/slow/fast moving, rekonsiliasi | Partial | min ✔, saran belanja (rata-rata keluar × waktu tunggu) ✔, tidak laku ✔, opname ✔. Belum: stok maksimum, safety stock eksplisit, umur stok, klasifikasi fast/slow/dead |
| 10 Harga & promo | resolusi harga, prioritas konflik, stacking, batas diskon, margin floor, override & audit | **Needs Decision** + Partial | Urutan yang **sudah berjalan** (saya yang menetapkan, belum disetujui): harga manual › daftar harga pelanggan › grosir › eceran; lalu harga per jumlah (ambil termurah); lalu promo (satu barang satu promo); diskon manual tanpa batas. Dokumen melarang mengarang prioritas → perlu keputusan |
| 11 Kredit | limit, termin, jatuh tempo, utilisasi, overdue, credit hold, persetujuan, riwayat, aging | Partial | limit+termin+jatuh tempo+aging ✔, lewat limit hanya pengelola+alasan ✔. Belum: **tahan kredit karena lewat jatuh tempo**, kasbon di Kasir belum dicek limit, riwayat perubahan limit, limit per cabang pelanggan |
| 12.1 POS | barcode, cari, keranjang, diskon, pajak, multi-bayar, struk, refund, retur, shift, laci | Verified | + kategori, varian, harga per jumlah, aturan stok minus. Belum: tukar barang (exchange) & nota kredit/saldo toko |
| 12.2–12.3 Penjualan grosir | penawaran, PO pelanggan, SO, cek kredit, cek stok, **reservasi**, pemenuhan, faktur | Partial | Semua ✔ kecuali **reservasi stok**, backorder eksplisit, dan kolom **No. PO pelanggan** (belum ada) |
| 12.4 Retur | sebagian/penuh, refund, tukar, nota kredit, restock, retur rusak | Partial | retur sebagian/penuh + refund tunai/kasbon ✔, stok kembali ✔. Belum: retur barang rusak (tidak kembali ke stok jual), tukar, nota kredit |
| 13 Pengadaan | PR → persetujuan → PO → terima → faktur → bayar, katalog & harga supplier, MOQ, lead time, kinerja, retur | Partial | alur lengkap ✔, terima sebagian ✔, retur beli ✔, kinerja supplier ✔, lead time ✔. Belum: **katalog/harga per supplier & MOQ**, perbandingan penawaran (RFQ), umur utang (AP aging) |
| 14 Distribusi | lihat RET-005 | Partial (dasar) | |
| 15 Portal & omnichannel | katalog, keranjang, akun pelanggan, bayar, status; B2B login, harga kontrak, reorder | Partial | Halaman toko: katalog + permintaan → prospek → keranjang Kasir. Belum: **keranjang & pesanan langsung toko**, akun pelanggan, **portal B2B**, marketplace (konektor eksternal = Not Started, jangan diklaim) |
| 16 Akuntansi | posting 20 jenis transaksi, valuasi, HPP, laporan minimum | Partial | jurnal otomatis double-entry ✔ untuk penjualan/kredit/retur/beli/retur beli/bayar supplier/persediaan/HPP/diskon/PPN/biaya/aset/bank. Laporan: L/R ✔, neraca ✔, arus kas ✔, buku besar ✔, umur piutang ✔. Belum: **neraca saldo (trial balance)**, **umur utang**, **laporan nilai persediaan**, biaya distribusi terpisah |
| 16 Metode HPP | FIFO vs rata-rata tertimbang | **Needs Decision** | Yang berjalan: **rata-rata tertimbang bergerak** (moving average) sejak awal. Dokumen: jangan memilih tanpa kajian → perlu keputusan resmi (rekomendasi saya: tetap rata-rata, alasan di §3) |
| 17 KPI | retail, wholesale, distribusi; tiap KPI berdefinisi & berformula | Partial | Retail: rata-rata transaksi, jenis/transaksi, margin, perputaran, hari persediaan, stok habis, susut, per kasir, per kategori ✔. Belum: penjualan per jam, return rate, dead stock %. Wholesale: fill rate, on-time, utilisasi kredit, DSO, margin per pelanggan, per sales = Not Started. Distribusi = Not Started |
| 18 POS offline | antrean lokal, sinkron, idempotensi, konflik | **Not Started** | Hanya: id transaksi idempoten (simpan dua kali aman) + keranjang tersimpan di HP. Kasir tidak bisa menyimpan tanpa internet |
| 20 Keamanan & audit | riwayat transaksi, persetujuan, **harga**, **limit kredit**, penyesuaian stok, izin, versi dokumen | Partial | transaksi/persetujuan/stok/modul tercatat (`domain_events`, `config_history`). Belum: **riwayat perubahan harga**, **riwayat limit kredit**, riwayat perubahan izin karyawan (perlu dicek), versi dokumen penawaran |
| 21 Konfigurasi | template, dependensi modul, izin bawaan, upgrade path | Partial | template + Pusat Konfirmasi + registri modul ✔. Belum: template khusus Grosir/Distributor/Fashion/Specialty (sekarang satu template toko) |
| 23 Tier pengalaman | Retail / Wholesale & Distribution / Enterprise | Partial | Satu ruang kerja toko dengan modul menyala/mati; belum ada tampilan per tier |

## 2. Aturan keras — yang saat ini dilanggar / berisiko

- **#11 Harga final tanpa mekanisme resolusi konflik yang disetujui** → resolusi sudah ada di server, tetapi urutannya belum disetujui (RET-008).
- **#12 Stok fisik = stok tersedia** → belum ada reservasi; pesanan grosir yang dikonfirmasi tidak menahan stok, Kasir bisa menjual barang yang sudah dijanjikan.
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
| RET-011 | Reservasi stok | belum | Reservasi saat SO dikonfirmasi, lepas saat dikirim/batal; Kasir melihat "tersedia" |
| RET-012 | Armada internal + pihak ketiga | belum | Kendaraan/driver sendiri + "ekspedisi" sebagai teks/kontak; tanpa optimasi rute |
| RET-013 | Rekonsiliasi pengiriman | belum | Per pengiriman: dikirim vs diterima vs kembali, otomatis retur sebagian |
| RET-014 | Audit & persetujuan perubahan harga/kredit | belum | Riwayat harga & limit + persetujuan diskon di atas batas |

Metode HPP (bukan nomor RET di Master Prompt, tetapi wajib dikaji): rata-rata bergerak sudah dipakai untuk seluruh data lama; mengganti ke FIFO
mengubah HPP historis dan laporan. Rekomendasi: tetapkan rata-rata bergerak sebagai metode resmi (umum dipakai UMKM dagang, sesuai SAK EMKM/ETAP
yang mengizinkan rata-rata tertimbang), FIFO hanya untuk urutan keluar batch kedaluwarsa (sudah: FEFO) — perlu konfirmasi pemilik/akuntan.

## 4. Usulan urutan tahap (setelah keputusan)

1. **Toko lanjutan 3 — Persediaan tersedia**: reservasi dari pesanan grosir, mutasi dalam perjalanan (kirim → terima), stok rusak/karantina terpisah dari stok jual, retur barang rusak, stok maksimum + umur stok + fast/slow/dead.
2. **Toko lanjutan 4 — Tata kelola harga & kredit**: urutan harga yang disetujui, harga per outlet, tanggal berlaku daftar harga/kontrak, batas diskon kasir + persetujuan, margin minimum, riwayat harga & limit, tahan kredit bila lewat jatuh tempo, cek limit untuk kasbon Kasir, tipe/grup pelanggan, sales rep.
3. **Katalog lanjutan**: multi-barcode, merek produk, paket/kit yang memotong stok komponen, nomor seri + garansi (toko elektronik/specialty), tukar barang & nota kredit.
4. **Distribusi**: picking/packing list, kendaraan & driver, jadwal kirim, POD (nama + foto), retur sebagian dari pengiriman, rekonsiliasi & biaya kirim, KPI distribusi.
5. **Laporan akuntansi dagang**: neraca saldo, umur utang, nilai persediaan, harga & MOQ per supplier, KPI grosir (fill rate, DSO, margin per pelanggan/sales).
6. **Portal toko & B2B**: keranjang + pesanan langsung, akun pelanggan B2B dengan harga kontrak & riwayat/faktur.
7. **POS offline** (antrean lokal + sinkron idempoten, batas jelas apa yang boleh offline).
