# Audit & Rencana — Rekap Bisnis (Business Recap Center)

Tanggal audit: 27 Nov 2026. Permintaan pemilik: halaman **Rekap Bisnis** di bawah Analisis Bisnis (gambar acuan desktop + catatan implementasi 12 bagian).

## 1. Yang SUDAH ada di repository (dipakai ulang, tidak diduplikasi)

| Kebutuhan rekap | Mesin yang sudah ada | Dipakai sebagai |
|---|---|---|
| Pendapatan, HPP, biaya, laba, jumlah transaksi, pelanggan | `biz_figures` / `biz_figures_total` (jurnal `acct_lines` + transaksi; sama dengan Pembukuan & Analisis Bisnis) | KPI utama, tren, seri historis |
| Kelompok akun (pendapatan usaha/retur/lain, HPP, operasional, penyusutan, bunga, pajak; kas, piutang, persediaan, aset tetap, utang, pinjaman, ekuitas) | `biz_fin_class` | komposisi biaya, kas & bank, piutang/utang, aset, pajak, modal |
| Saldo kas & bank | baris akun Kas+Bank per jurnal (rumus `biz_intel.kas` = total `acct_cashflow`) | saldo awal → masuk/keluar → saldo akhir |
| Penjualan toko (omzet tanpa PPN, diskon, retur, cara bayar) | rumus `retail_report` (sales selesai + sale_returns) | rincian penjualan |
| Segmen pelanggan (baru/setia/kadang/tidak aktif) | `biz_customer_rows` | aktivitas pelanggan |
| Aktivitas operasional per jenis (pesanan, kg, meja, hunian, tagihan, tunggakan, booking) | `industry_kpi_period` (angka mentah) | rekap khusus kategori |
| Timeline aktivitas | `domain_events` + `activity_feed(kos, from, to, …)` | timeline & jumlah aktivitas |
| Tutup buku bulan | `acct_periods.closed_at` (prosedur di Pembukuan) | status periode "ditutup" |
| Rekonsiliasi bank | `bank_recons` (draf/selesai per bulan) | status "direkonsiliasi" |
| Tutup harian toko | `day_closings` | status hari ditutup (toko) |
| Drill-down jurnal + bukti | `JournalLines` (`app/(app)/analisis/Details.jsx`) + `lib/journalSource.js` | telusur sampai transaksi sumber |
| Grafik SVG | `app/(app)/analisis/Charts.jsx` (TrendChart, GroupBars, NetBars, Donut, Waterfall, Heatmap) | semua grafik rekap |
| Ekspor | `lib/xlsx.js` (`makeXlsx`), `lib/pdfExport.js` (`makePdf`), kuota `useKuotaEkspor`/`export_take` | Ekspor Excel & PDF |
| Arsip laporan bulanan berversi | `acct_monthly_drafts` (pola versi + snapshot) | pola tabel arsip rekap |
| Cron harian | `/api/cron/reminders` (Vercel, 1×/hari) | rekap otomatis & versi koreksi |

## 2. Kekurangan yang harus dilengkapi

1. **Tidak ada satu RPC rekap lintas modul.** Angka tersebar di `retail_report`, `svc_report`, `biz_intel`, `acct_cashflow`, dll. → dibuat `biz_recap_core` (fungsi baca, tanpa tabel transaksi baru) yang MEMANGGIL/MENYALIN rumus sumber di atas, dan pembungkus `biz_recap` (akses keuangan, pembanding, seri historis, info arsip).
2. **Belum ada arsip rekap.** → tabel `recap_snapshots` (tidak bisa diubah/dihapus; versi naik bila data sumber berubah; `data_hash` untuk mendeteksi perubahan).
3. **Belum ada rekap otomatis.** → `recap_auto_tick` di cron harian: arsip mingguan/bulanan/kuartalan/tahunan untuk periode yang baru selesai (mengejar bila cron terlewat) + versi koreksi otomatis bila data periode yang sudah diarsipkan berubah.
4. **Belum ada daftar transaksi sumber per angka rekap** di luar jurnal. → `recap_docs` (penjualan, retur, belanja, biaya, pesanan jasa, pembayaran sewa, gerak stok, gaji, aset, tagihan proyek, pelanggan).
5. **Modul tujuan belum menerima filter dari URL** (Penjualan, Belanja, Pengeluaran, Pembayaran). → ditambah `?tanggal=` / `?bulan=` agar tautan dari rekap membuka periode yang sama.
6. **Notification Center** belum tahu rekap. → kartu "Rekap periode … sudah diarsipkan / diperbarui" di Notifikasi.

## 3. Keputusan desain (perlu diketahui pemilik)

- **Tanpa batas periode per paket** untuk rekap (mengikuti keputusan 14 Nov 2026: riwayat transaksi tanpa batas; rekap = rangkuman hasil seperti Laporan). Satu permintaan maksimal 400 hari (tahun penuh tetap bisa).
- **Filter cabang = Paket Pro** (sama dengan Analisis Bisnis `analisis_mendalam`). Bagian yang tidak bisa dipisah per lokasi (kas, piutang/utang, modal, pajak, persediaan) diberi tanda "semua lokasi".
- **Peta aktivitas (heatmap) = Paket Pro**, sama dengan heatmap Analisis Bisnis.
- **Akses = area keuangan** (`member_in('finance')`), sama dengan Analisis Bisnis. Snapshot hanya dibaca lewat RPC (RLS tanpa policy + revoke).
- **Rekap harian otomatis** = dihitung langsung kapan pun dibuka (selalu terbaru) + Tutup harian toko yang sudah ada; arsip harian dibuat manual (tombol Arsipkan) agar database tidak terisi 365 snapshot/tahun per bisnis.
- **Penutupan periode TIDAK dibuat baru**: status "ditutup" membaca `acct_periods` (tutup buku di Pembukuan); "direkonsiliasi" membaca `bank_recons` + `day_closings`. Tombol di rekap hanya mengarahkan ke prosedur yang sudah ada.
- **Status data**: Aktual (periode selesai), Sementara (periode berjalan), Belum lengkap (penjualan tanpa modal, pembayaran menunggu verifikasi, transaksi offline perlu cek), Belum direkonsiliasi.
- Jumlah barang (qty) di rekap persediaan adalah jumlah satuan dasar campuran; nilai rupiah = dasar utama (diberi keterangan).

## 4. Status implementasi

Lihat bagian "Aturan tetap" di `CLAUDE.md` (bullet Rekap Bisnis) dan laporan sesi. Yang belum: rekap harian otomatis tersimpan sebagai arsip (sengaja manual), rekap per armada/manufaktur/pelatihan (belum ada modul sumbernya — tidak ditampilkan, tidak dipalsukan).
