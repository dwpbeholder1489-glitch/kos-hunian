# PRASARA — Audit Ulang terhadap Master Prompt "Sistem Modul Semua Bisnis" V2.0

Tanggal: 15 Nov 2026 · Dasar: repository `kos-hunian` (commit ac66635), 89 migrasi, database uji lokal (semua migrasi terpasang), 39 file uji SQL.
Audit ini MENGGANTIKAN versi 14 Nov, yang terlalu longgar: beberapa bab ditandai "VERIFIED" padahal hanya inti yang ada, dan beberapa baris saling bertentangan (mis. Retail ditandai VERIFIED dengan celah "analitik kasir" saja).

**Status yang dipakai (Bab 4):**
- **ADA** — ada di database + layar + diuji (uji SQL dan/atau render), dipakai di produksi.
- **SEBAGIAN** — ada, tetapi tidak selengkap yang diminta V2.0 (keterangan di kolom catatan).
- **BELUM** — tidak ada fungsi nyata. "Template Business Builder" = pemilik bisa menyusun formulir & status sendiri, tetapi TIDAK terhubung ke stok/akuntansi khusus industri itu → dihitung BELUM untuk mesin industrinya.

Yang belum pernah diuji sama sekali di proyek ini: uji unit/E2E frontend, uji aksesibilitas, uji performa/beban, uji keamanan dari luar (pentest). Uji yang ada: uji SQL per fitur + uji isolasi tenant (193 kasus) + render layar 390px.

---

## BAGIAN V — Core (Bab 9–16)

### Bab 9 Command Center — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Pendapatan, biaya, laba kotor, laba bersih | ADA | `/bisnis`, `/pembukuan`, `/analisis` (angka dari jurnal) |
| Posisi kas, ringkasan piutang & utang | SEBAGIAN | Ada di Kas & kasbon dan Pembukuan, belum satu layar pusat |
| Peringatan stok, pesanan tertunda, tugas operasional | SEBAGIAN | Per jenis bisnis (dashboard toko/jasa/kos), tidak satu pusat lintas modul |
| Kesehatan bisnis (Business Health) | BELUM | |
| Tren & rekomendasi | SEBAGIAN | `/analisis` "Temuan dari data" (aturan tetap); belum standar insight Bab 32 |
| Filter periode / cabang / perbandingan | SEBAGIAN | Ada di Analisis & Pembukuan; dashboard utama belum |
| Drill-down, preferensi tersimpan, status pembaruan data | BELUM | |
| Aksi cepat, empty state | ADA | Tombol + per halaman |

### Bab 10 Sales & POS — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Cari barang, barcode, keranjang, pilih pelanggan | ADA | `/kasir` (kamera, tanpa barcode juga bisa) |
| Varian produk (ukuran/warna/rasa) | ADA (15 Nov) | Grup varian + kombinasi otomatis; tiap varian = barang dengan stok/harga/barcode sendiri. Belum: gambar per varian di portal |
| Konversi satuan | ADA | Mesin konversi 14 Nov |
| Harga bertingkat | SEBAGIAN | Eceran/grosir + daftar harga per pelanggan; **harga per jumlah beli BELUM** |
| Diskon, promo | ADA | |
| Pajak | SEBAGIAN | PPN keluaran toko saja; tanpa tanggal berlaku tarif; **jasa/kuliner/kos BELUM ada PPN** |
| Bayar campuran, kasbon, tunai/kredit | ADA | |
| Faktur, struk, retur, refund | ADA | Faktur dari Pesanan grosir |
| Shift kasir | ADA | Buka/tutup laci + selisih |
| Tutup harian (daily closing) | ADA (15 Nov) | Rekap + bukti per hari/lokasi, kas catatan vs dihitung, tanda berubah setelah ditutup, tutup ulang. Sengaja tidak mengunci transaksi |
| Pesanan penjualan & penawaran | ADA | Grosir (toko) saja; **jasa BELUM punya penawaran** |
| **Komisi penjualan** | **BELUM** | |
| Kinerja penjualan per kasir | ADA (15 Nov) | Indikator toko & tutup harian. **Per sales (grosir) BELUM** |

### Bab 11 Inventory & Gudang — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Master barang, SKU, barcode | ADA | |
| Kategori barang | ADA (15 Nov) | Satu tingkat (tanpa sub-kategori) |
| Varian | ADA (15 Nov) | |
| Satuan & konversi | ADA | |
| Gudang/cabang, mutasi antar lokasi | ADA | `branches`, `stock_transfers` |
| **Lokasi rak (bin)** | **BELUM** | |
| Terima, keluar, opname, penyesuaian beralasan | ADA | |
| **Reservasi stok; stok fisik/dipesan/tersedia/dalam perjalanan** | **BELUM** | Mutasi langsung pindah; pesanan grosir tidak memesan stok |
| Batch & kedaluwarsa (FEFO) | ADA | |
| **Nomor seri** | **BELUM** | |
| Titik pesan ulang, stok pengaman | SEBAGIAN | Stok minimum + Saran belanja; stok pengaman = parameter tetap |
| Valuasi persediaan | SEBAGIAN | Rata-rata tertimbang saja; **FIFO & pilihan metode BELUM** |
| **Umur stok (aging)** | **BELUM** | |
| Kartu stok / ledger | ADA | `stock_moves` |
| **Kebijakan stok minus** | **BELUM** | Kasir & resep mengizinkan minus tanpa setelan |

### Bab 12 Akuntansi — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Bagan akun, jurnal otomatis, jurnal manual, buku besar | ADA | Jurnal manual & rincian buku besar = Bisnis/Pro |
| **Neraca saldo (trial balance)** | **BELUM** | Tidak ada laporan terpisah |
| Piutang, utang, kas & bank, rekonsiliasi bank | ADA | |
| Periode & tutup buku | ADA | |
| Neraca, laba rugi, arus kas | ADA | |
| Aset tetap & penyusutan | ADA | Garis lurus saja |
| **Akrual & biaya dibayar dimuka** | **BELUM** | |
| Anggaran | ADA | Per kategori biaya |
| **Pusat biaya (cost center) / departemen** | **BELUM** | |
| Akuntansi per cabang | SEBAGIAN | Laporan per lokasi (Pro), bukan buku per cabang |
| Pengaturan pajak | SEBAGIAN | PPN saja; **PPh (21/23/final UMKM) BELUM** |

### Bab 13 Pengadaan — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Supplier, permintaan pembelian + persetujuan, pesanan, terima sebagian | ADA | 15 Nov |
| **Permintaan penawaran (RFQ) & penawaran supplier, perbandingan** | **BELUM** | |
| Faktur supplier, pencocokan 3 arah, PPN masukan | ADA | 15 Nov |
| Retur pembelian, pembayaran supplier | ADA | |
| Kinerja supplier | ADA | Ringkas |
| Analitik pembelian | SEBAGIAN | |
| **Persetujuan pesanan pembelian berdasarkan nominal** | **BELUM** | Persetujuan baru untuk permintaan, belum untuk PO |

### Bab 14 CRM — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Pelanggan, kontak, riwayat penjualan, batas kredit | ADA | Batas kredit untuk grosir |
| **Klasifikasi/segmen pelanggan** | **BELUM** | |
| **Loyalti / poin / member** | **BELUM** | |
| Catatan & tindak lanjut | ADA | `crm_activities`, `crm_tasks` |
| **Masukan pelanggan (feedback/rating)** | **BELUM** | |
| Tiket keluhan | SEBAGIAN | Jasa (keluhan pesanan) & kos (perbaikan); **toko BELUM** |
| **Retensi & profitabilitas pelanggan** | **BELUM** | |

### Bab 15 SDM — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Data karyawan, peran, absensi, shift, lembur, gaji | ADA | 14 Nov |
| **Struktur organisasi / departemen** | **BELUM** | |
| Cuti | SEBAGIAN | Status "cuti" di absensi; **pengajuan & saldo cuti BELUM** |
| Insentif | SEBAGIAN | Bonus manual di gaji |
| **Komisi, penilaian kinerja, dokumen karyawan** | **BELUM** | |
| **PPh 21 & BPJS** | **BELUM** | |

### Bab 16 Dokumen — SEBAGIAN
| Submodul | Status | Catatan |
|---|---|---|
| Struk, kwitansi, nota, faktur, surat jalan, penawaran (grosir), slip gaji | ADA | |
| **Cetak pesanan pembelian (PO) & kontrak sewa** | **BELUM** | |
| **Template dokumen yang bisa diatur** | **BELUM** | Tata letak tetap |
| Penomoran | SEBAGIAN | Nomor otomatis per jenis, belum aturan penomoran terpusat yang bisa diatur |
| **Riwayat versi dokumen** | **BELUM** | |
| Riwayat persetujuan, lampiran, ekspor Excel, cetak | ADA | |
| PDF | SEBAGIAN | Lewat cetak browser; PDF langsung hanya sebagian |

## BAGIAN VI — Industri (Bab 17–31)

### Bab 17 Toko & grosir eceran — SEBAGIAN
| Submodul | Status |
|---|---|
| POS, barcode, konversi satuan, harga eceran/grosir, promo, bundling, konsinyasi, shift, saran belanja, kedaluwarsa, mutasi toko | ADA (konsinyasi tanpa komisi persen & tanpa laporan cetak penitip) |
| Varian produk | ADA (15 Nov) |
| Tutup harian | ADA (15 Nov) |
| Pencegahan kehilangan | SEBAGIAN (15 Nov: susut, pembatalan & retur & selisih laci per kasir terlihat; peringatan otomatis & batas pembatalan BELUM) |
| Analitik toko | SEBAGIAN (per kategori & varian ADA) |
| KPI: omzet, margin kotor | ADA |
| KPI: rata-rata keranjang, perputaran persediaan, stok habis, susut, penjualan per kasir | ADA (15 Nov, Laporan toko › Indikator toko) |

### Bab 18 Grosir & distribusi — SEBAGIAN
| Submodul | Status |
|---|---|
| Daftar harga pelanggan, batas kredit, pesanan, surat jalan bertahap, faktur, piutang & umur piutang | ADA |
| **Harga bertingkat per jumlah** | **BELUM** |
| **Tenaga penjual (sales rep) & kinerjanya** | **BELUM** |
| **Jadwal kirim, rute, armada, pengemudi** | **BELUM** |
| **Alokasi stok & picking** | **BELUM** |
| Bukti terima | SEBAGIAN (nama penerima; foto/tanda tangan BELUM) |
| **Penagihan terjadwal (collection)** | **BELUM** |
| **Biaya distribusi, profitabilitas pelanggan** | **BELUM** |
| **KPI: fill rate, tepat waktu kirim, margin per pelanggan, biaya per pesanan** | **BELUM** (umur piutang ADA) |

### Bab 19 Kuliner — SEBAGIAN
| Submodul | Status |
|---|---|
| Meja, reservasi, QR per meja, layar dapur, bungkus, resep, stok bahan, food cost | ADA |
| POS restoran | SEBAGIAN (lewat Pesanan + tagihan meja; belum layar kasir restoran khusus) |
| Waste | SEBAGIAN (dicatat sebagai rusak, tampil di laporan) |
| **Menu engineering** | **BELUM** (margin per menu ada, klasifikasi star/plowhorse/dll belum) |
| **Delivery kuliner** | **BELUM** |
| **Produksi dapur / sub-resep / central kitchen** | **BELUM** |
| **Kinerja per outlet** | **BELUM** |
| **KPI: perputaran meja, waktu masak** | **BELUM** |

### Bab 20 Laundry — SEBAGIAN
| Submodul | Status |
|---|---|
| Katalog, per kg & per item, terima order, nota, antrean & tahap (bisa diatur), tracking, jemput & antar | ADA |
| Penimbangan | SEBAGIAN (input manual) |
| Klaim kerusakan | SEBAGIAN (keluhan pesanan; ganti rugi belum tercatat khusus) |
| **Perawatan mesin** | **BELUM** |
| **KPI: rata-rata waktu selesai, biaya produksi per kg, tingkat kerusakan, pelanggan kembali** | **BELUM** (pesanan selesai & terlambat ADA) |

### Bab 21 Properti & kos — SEBAGIAN
| Submodul | Status |
|---|---|
| Kamar, penghuni, sewa, tagihan berulang, bayar sebagian, deposit, meteran, perbaikan + biaya, hunian, booking, pindah kamar | ADA |
| **Multi-properti / gedung dalam satu bisnis** | **BELUM** (satu bisnis = satu properti) |
| Kontrak sewa | SEBAGIAN (data sewa ada; dokumen kontrak BELUM) |
| Perpanjangan kontrak | SEBAGIAN (ubah tanggal selesai; alur perpanjangan BELUM) |
| **Laporan multi-properti, NOI, lama kamar kosong** | **BELUM** |

### Bab 22 Jasa profesional — BELUM (mesin)
Katalog layanan & pesanan memakai mesin Jasa (ADA). **Penawaran jasa, work order bertugas, proyek, tugas, timesheet, penugasan staf, milestone, tagihan proyek, SLA, garansi, masukan pelanggan: BELUM** (hanya template Business Builder `bb_proyek`).

### Bab 23 E-commerce — BELUM
Halaman bisnis + permintaan (Pro) bukan toko online: tidak ada keranjang online, pembayaran online pelanggan, marketplace, sinkron stok, pengemasan, ongkir, retur online, rekonsiliasi COD.

### Bab 24 Manufaktur — BELUM
Hanya template Builder `bb_produksi`. BOM, MRP, perintah produksi, pengeluaran bahan, WIP, barang jadi, biaya produksi, kapasitas mesin, QC, traceability, scrap, yield: BELUM. (Keputusan MFG-001…020 di Project.)

### Bab 25–31 — BELUM (mesin)
| Bab | Industri | Yang ada |
|---|---|---|
| 25 | Bengkel | Template Builder `bengkel` (data kendaraan & status). Estimasi, work order mekanik, suku cadang dari stok, tagihan jasa, garansi, pengingat servis: BELUM |
| 26 | Klinik & apotek | Template `bb_klinik`. Sengaja tidak menyimpan data medis tanpa kontrol khusus |
| 27 | Pendidikan | Template `bb_pendidikan` |
| 28 | Pertanian & peternakan | Template `bb_tani` |
| 29 | Hotel | Tidak ada (kos ≠ hotel harian: check-in/out per malam, housekeeping, channel) |
| 30 | Konstruksi | Template `bb_proyek` |
| 31 | Logistik | Template `bb_kirim` |

## BAGIAN VII–XVI — Intelligence, otomatisasi, portal, platform

| Bab | Modul | Status | Catatan |
|---|---|---|---|
| 32 | Business Intelligence | SEBAGIAN | Analisis keuangan bertingkat. Intelijen stok, pelanggan, supplier, harga, karyawan, risiko, pertumbuhan: BELUM; standar insight (sumber, metode, kecukupan data, terakhir diperbarui) belum seragam |
| 33 | Business Health Score | BELUM | (Skor "kesehatan" di Admin = kesehatan akun pelanggan platform, bukan bisnis) |
| 34 | Proyeksi & skenario | BELUM | |
| 35 | Automation rule builder | BELUM | Yang ada = resep otomatisasi tetap + log + jeda (ADA) |
| 36 | Matriks persetujuan | SEBAGIAN | Per tindakan, nominal, 2 tingkat; per cabang/departemen/risiko BELUM |
| 37–38 | Onboarding & rekomendasi modul | ADA | |
| 39 | Adaptasi pertumbuhan | SEBAGIAN | Penawaran naik paket; rekomendasi modul dari sinyal pertumbuhan BELUM |
| 40 | Portal pelanggan | SEBAGIAN | Portal penghuni kos, cek status pesanan jasa, halaman terkirim. Login pelanggan, riwayat pesanan & faktur pelanggan toko/grosir: BELUM |
| 41 | Tracking | SEBAGIAN | Tahap jasa bisa diatur; visibilitas & aturan notifikasi per status BELUM; tracking pengiriman grosir BELUM |
| 42 | Chat & dukungan pelanggan | BELUM | (`u_chat` dalam rencana; tiket di Admin = dukungan platform) |
| 43–44 | Admin platform | ADA | Peran staf, MFA, akses bantuan tercatat, tiket, registry modul, status sistem; pemantauan error & integrasi SEBAGIAN |
| 45 | Entitlement | ADA | Cek server `plan_has` |
| 47–48 | Tampilan HP / desktop | SEBAGIAN | HP ADA; desktop: sidebar ada, pencarian global & personalisasi widget BELUM |
| 51 | Keamanan multi-tenant | SEBAGIAN | Isolasi diuji (193 kasus), RLS, otorisasi server ADA; rate limiting hanya di jalur publik; backup/pemulihan = bawaan Supabase, belum diuji pemulihannya |
| 53 | Observability | SEBAGIAN | Log cron, peristiwa, status sistem; pelacakan error terstruktur BELUM |
| 56 | Pengujian | SEBAGIAN | Uji SQL + isolasi + render; uji unit/E2E frontend, aksesibilitas, performa: BELUM |
| 57 | Skenario bisnis A–F | A–E ADA (uji SQL), **F manufaktur BELUM** |

## Ralat klaim sebelumnya

1. 15 Nov (pagi) saya menulis "backlog P2 untuk toko sudah habis". **Salah.** Saat itu toko masih belum punya varian produk, kategori barang, tutup harian, pencegahan kehilangan, KPI toko, komisi, harga per jumlah beli, nomor seri, dan reservasi stok (empat yang pertama selesai di Toko lanjutan 1).
2. Audit 14 Nov menandai Retail, Laundry, Properti, Akuntansi "VERIFIED". Yang benar: **inti**-nya berjalan dan diuji, tetapi tiap bab masih punya submodul BELUM (tabel di atas).
3. Bisnis jasa, kuliner, dan kos belum mendapat beberapa fitur yang sudah ada di toko (PPN, penawaran, promo).

## Backlog berprioritas baru (Bab 54–55)

| Prio | Pekerjaan | Jenis bisnis |
|---|---|---|
| P1 | ~~Toko lanjutan 1: kategori barang, varian produk, tutup harian, KPI toko~~ — selesai 15 Nov | Toko |
| P1 | Toko lanjutan 2: harga per jumlah beli, komisi kasir/sales, pencegahan kehilangan, kebijakan stok minus | Toko, grosir |
| P1 | Kesetaraan lintas bisnis: PPN untuk jasa/kuliner/kos, penawaran untuk jasa, promo untuk kuliner | Jasa, kuliner, kos |
| P1 | Akuntansi lanjutan: neraca saldo, akrual & dibayar dimuka, pusat biaya/departemen, PPh UMKM | Semua |
| P1 | Command Center lintas modul (kas, piutang, utang, pesanan tertunda, peringatan, filter cabang & periode) | Semua |
| P2 | Grosir & distribusi: reservasi stok + picking, jadwal kirim, rute, armada & pengemudi, bukti terima foto, penagihan, sales rep, biaya distribusi | Grosir |
| P2 | Jasa profesional: penawaran, work order bertugas, proyek & tugas, timesheet, milestone & tagihan proyek, SLA, garansi | Jasa |
| P2 | Properti: multi-gedung, dokumen kontrak & perpanjangan, NOI, lama kosong | Kos |
| P2 | Kuliner: delivery, sub-resep & produksi dapur, menu engineering, waktu masak, perputaran meja | Kuliner |
| P2 | Laundry: perawatan mesin, KPI waktu selesai & biaya per kg, klaim kerusakan dengan ganti rugi | Laundry |
| P2 | CRM: segmen pelanggan, loyalti/poin/member, masukan pelanggan, profitabilitas pelanggan | Semua |
| P2 | Pengadaan: RFQ & perbandingan penawaran, persetujuan PO per nominal | Semua |
| P2 | SDM: departemen, pengajuan & saldo cuti, komisi, penilaian kinerja, dokumen karyawan, PPh 21/BPJS | Semua |
| P2 | Dokumen: cetak PO & kontrak, aturan penomoran, template, riwayat versi | Semua |
| P3 | Mesin Manufaktur (MFG-001…020), Logistik, Event | Industri baru |
| P3 | Bengkel, hotel, pendidikan, pertanian, konstruksi sebagai mesin (bukan hanya template) | Industri baru |
| P3 | Business Health Score per jenis bisnis, proyeksi & skenario, intelijen stok/pelanggan/supplier | Semua |
| P3 | Rule builder otomatisasi, matriks persetujuan per cabang/departemen | Semua |
| P4 | Portal & login pelanggan, chat & tiket pelanggan, toko online & marketplace | Semua |
| — | Pengujian: uji E2E frontend, aksesibilitas, performa | Platform |

Setiap item dinyatakan selesai hanya bila: database + RPC + layar HP + panduan + uji SQL + uji isolasi + regresi penuh lulus + terverifikasi di produksi (Bab 59).

## Riwayat yang sudah selesai (14–15 Nov, tetap berlaku)
Module Registry V2, peristiwa & riwayat aktivitas, PPN keluaran & bayar campuran (toko), grosir B2B (penawaran → pesanan → surat jalan → faktur, batas kredit, daftar harga), pindah kamar, batch & kedaluwarsa + saran belanja, SDM & gaji, mesin konversi satuan, aset tetap & penyusutan, resep & food cost, promo & bundling, permintaan pembelian + faktur supplier + PPN masukan + kinerja supplier, konsinyasi, landing baru. Rincian teknis di `CLAUDE.md`.
