# Audit PRASARA terhadap Master Blueprint BI, Financial Management & Investment Analysis V2.0

Tanggal audit: 27 Nov 2026. Cakupan: repository `kos-hunian` (Next.js + Supabase), migrasi s.d. `20261127130000`.
Prinsip yang dipakai: **Analisis Bisnis = lapisan presentasi & pendukung keputusan** di atas mesin yang sudah ada;
tidak membuat mesin akuntansi/BI/investasi kedua. Status: **Ada** = berfungsi & teruji, **Parsial** = sebagian,
**Belum** = belum dibangun (tampil "Dalam rencana" di Analisis Bisnis › Peta modul, tidak dipalsukan).

## 1. Arsitektur yang sudah berjalan (Section 03)

| Lapisan blueprint | Implementasi PRASARA | Status |
|---|---|---|
| L1 Operasional | Kasir/penjualan, grosir, belanja, stok, kos (sewa/tagihan/deposit/booking), jasa/kuliner, proyek, SDM & gaji, pengeluaran, aset | Ada |
| L2 Transaction Engine | Tiap tabel operasional + `domain_events` (outbox, idempotency_key, correlation_id) | Parsial — tidak ada tabel `financial_transactions` tunggal; identitas transaksi = sumber jurnal (`source_type`,`source_id`) |
| L3 Accounting Engine | `acct_desired` → `acct_sync` (jurnal otomatis idempoten per sumber, koreksi = jurnal koreksi), `acct_accounts` (CoA sistem), jurnal manual, tutup periode `acct_periods`, rekonsiliasi bank | Ada |
| L4 Data warehouse | Tidak ada gudang data terpisah; laporan dihitung langsung dari `acct_lines` | Parsial (disengaja: satu sumber kebenaran) |
| L5 BI Engine | `biz_intel`, `biz_figures`, `retail_kpi`, `stock_health`, `svc_report`, `owner_overview2`, `lib/bizIntel.js` | Ada |
| L6 Investment Engine | `acct_investment_simulation` (NPV/IRR/payback/skenario), `acct_investment_actual` (realisasi), `lib/businessValuation.js` (DCF) | Parsial |
| L7 Forecast & Risk | Proyeksi linier (`lib/bizIntel.js`), `CashForecast` (toko), faktor risiko aturan tetap | Parsial |
| L8 Reporting | Laporan bulanan berversi `acct_monthly_drafts` (draf → tinjau → setujui → terbit, terkunci tutup buku), ekspor Excel/PDF | Parsial |

## 2. Pemetaan 16 modul

| # | Modul | Yang sudah ada (lokasi) | Gap utama | Status |
|---|---|---|---|---|
| 1 | Financial Command Center | Analisis Bisnis `/analisis` (skor kesehatan, KPI, insight, drill-down), Pembukuan › Ikhtisar | KPI aktual vs anggaran/forecast di kartu KPI | Ada/Parsial |
| 2 | Accounting Engine | Jurnal otomatis, manual, koreksi, tutup periode, neraca saldo, buku besar, rekonsiliasi bank | CoA kustom per jenis bisnis terbatas; jurnal berulang & jurnal pembalik terjadwal; kebijakan basis kas/akrual per entitas (saat ini akrual untuk jasa/proyek, kas untuk laporan kos) | Parsial |
| 3 | Revenue Intelligence | `biz_intel` produk/pelanggan/cabang, `retail_report`, `svc_report`, `wholesale_kpi` | Pendapatan berulang vs tidak, per karyawan/kanal | Parsial |
| 4 | Expense & Cost | Per akun & kategori, anggaran, persetujuan, `loss_watch` | Klasifikasi tetap/variabel, cost center/departemen, vendor comparison untuk biaya non-barang | Parsial |
| 5 | Tax | PPN keluaran/masukan `tax_report`, faktur supplier | **PPh** (profil wajib pajak, PPh final UMKM, potong/pungut), versi aturan pajak, kalender pajak | Parsial (PPN saja) |
| 6 | Cash Flow & Liquidity | `acct_cashflow` (operasi/investasi/pendanaan), kas per minggu, cadangan kas, proyeksi kas toko | Proyeksi 7/30/90 hari lintas jenis bisnis; kas dibatasi (restricted) | Parsial |
| 7 | Asset, Liability & Equity | Aset tetap & penyusutan, umur piutang/utang, neraca ringkas & rasio (**baru**: `biz_financials`) | Jadwal pinjaman (pokok/bunga/cicilan), pemisahan pinjaman pendek/panjang, laporan perubahan ekuitas | Parsial |
| 8 | Budgeting & Planning | `budgets`/`budget_report` (biaya per kategori per bulan) | Anggaran CAPEX/kas, anggaran per cabang (target pendapatan, persetujuan & proyeksi akhir bulan SUDAH — Tahap D) | Parsial |
| 9 | Business Performance | KPI toko/kos/jasa/kuliner (food cost), hunian, perputaran stok | KPI laundry per kg, utilisasi mesin, online (CAC/LTV), benchmark industri bersumber | Parsial |
| 10 | Investment & Capital | Simulasi investasi + realisasi + perbandingan (Pembukuan › Investasi) | Register sumber modal & penggunaan modal, ROIC (butuh pajak & bunga) | Parsial |
| 11 | Business Valuation | DCF dari arus kas historis (Pembukuan › Valuasi) | Asset-based, multiple EBITDA/revenue dengan pembanding bersumber | Parsial |
| 12 | Forecast & Scenario | Proyeksi linier pendapatan, skenario investasi, skenario Pesimis/Dasar/Optimis 12 bulan + 7 stress test tersimpan berversi (Tahap E) | Musim, rencana investasi/modal di dalam skenario, perbandingan versi vs realisasi | Sebagian besar |
| 13 | Risk Management | Faktor risiko aturan tetap (`lib/bizIntel.js`) | Register risiko (probabilitas, dampak, mitigasi, PIC, tinjauan) | Belum |
| 14 | Consolidation | Mode A portofolio `/bisnis` (pilihan eksplisit, Pro), gabungan badan usaha di Pembukuan (tanpa eliminasi) | Mode B konsolidasi formal: struktur kepemilikan, transaksi antarentitas, eliminasi | Parsial (Mode A) |
| 15 | Monthly Investor Report | Laporan bulanan berversi & terbit; ekspor Analisis Excel/PDF | Laporan riset §32 (cover, daftar isi, MD&A, valuasi, skenario, risiko, lampiran), arsip laporan lintas jenis | Parsial |
| 16 | Decision Support | Insight fakta/temuan/rekomendasi beralasan, tanpa AI generatif | Confidence level eksplisit per insight | Ada/Parsial |

## 3. Aturan keuangan non-negotiable (Section 27) — kondisi saat ini

Terpenuhi oleh mesin jurnal: setoran modal & pinjaman bukan pendapatan (akun ekuitas/kewajiban), prive bukan biaya,
pembelian aset masuk aset tetap + penyusutan, uang muka pelanggan/DP booking = kewajiban, piutang ≠ kas, laba ≠ kas
(arus kas terpisah), PPN keluaran = kewajiban bukan beban, retur mengurangi pendapatan, persediaan ↔ HPP, periode
tertutup dikunci, koreksi lewat jurnal koreksi (bukan hapus). **Belum**: pemisahan pokok vs bunga pinjaman (akun bunga
belum ada), transaksi antarentitas belum ditandai.

## 4. Yang dibangun pada tahap ini (27 Nov 2026)

1. `biz_financials` (migrasi `20261127130000`): Laba rugi bertingkat (pendapatan kotor → retur → bersih → HPP → laba kotor
   → beban operasional → **EBITDA** → penyusutan → **EBIT** → lain-lain → laba sebelum pajak), Neraca per tanggal dengan
   cek seimbang, riwayat 12 bulan. Sumber = jurnal yang sama dengan Pembukuan & `biz_intel` (laba bersih identik, teruji).
2. `lib/finRatios.js`: standar rasio §32.4 (profitabilitas, likuiditas, solvabilitas, efisiensi) lengkap dengan formula,
   definisi, dan alasan bila TIDAK dihitung (ROIC & cakupan bunga belum bisa — butuh pajak penghasilan & bunga).
3. Analisis Bisnis menjadi pusat modul: Ringkasan · Laporan Keuangan · Arus Kas · Pajak · Anggaran · Investasi & Valuasi ·
   Laporan & Portofolio · Peta modul — memakai mesin yang ada, dengan drill-down ke jurnal & modul asal.

## 5. Roadmap bertahap (urut dependensi)

| Tahap | Isi | Dependensi | Keputusan pemilik yang dibutuhkan |
|---|---|---|---|
| A | ✅ SELESAI 27 Nov 2026 (migrasi `20261127140000`): daftar pinjaman, bayar = pokok + bunga (akun Beban bunga 6-3000), porsi jatuh tempo ≤ 12 bulan, cakupan bunga | Mesin jurnal | Diputuskan: lewat menu Kas (kos: Pengeluaran › Pinjaman) |
| B | ✅ SELESAI 27 Nov 2026 (migrasi `20261127150000`): PPh final UMKM 0,5% — aturan berversi, profil pajak, perhitungan bulanan (Rp500 jt OP digabung per NPWP), akrual jurnal, setoran via Kas, jatuh tempo, peringatan batas Rp4,8 M/jangka/kos; ROIC aktif. Belum: PPh badan tarif normal, PPh 21/23/4(2) potong-pungut, e-Bupot | A, PPN | Diputuskan: PPh final UMKM 0,5% |
| C | ROIC, cakupan bunga, laporan perubahan ekuitas | A, B | — |
| D | ✅ SELESAI 27 Nov 2026 (migrasi `20261127160000`): target pendapatan per bulan, status draf → diajukan → disetujui/ditolak (revisi = kembali draf, tutup buku = terkunci), proyeksi akhir bulan (laju harian), dampak ke laba, ringkasan di Analisis › Anggaran. Belum: anggaran kas & CAPEX, anggaran per cabang | `budgets` | Alur bawaan (usulan): pengelola keuangan mengajukan, pemilik menyetujui — bisa diubah bila pemilik memutuskan lain |
| E | ✅ SELESAI 27 Nov 2026 (migrasi `20261127170000`): `scenario_baseline` (jurnal, rata 3 bulan penuh + posisi hari ini), rumus `lib/scenario.js` model v1, Pesimis/Dasar/Optimis 12 bulan (laba, kas, kas terendah, kebutuhan dana, rasio lancar), 7 stress test, versi tersimpan tak bisa diubah (`fin_scenarios`). Belum: musim, modal/prive/pembelian aset dalam skenario, pembanding versi vs realisasi | `biz_financials`, proyeksi | Diputuskan: variabel umum + khusus jenis, akses keuangan, Paket Bisnis & Pro |
| F | Register risiko (probabilitas × dampak, mitigasi, PIC) | — | Siapa boleh mengisi |
| G | Valuasi multiple & asset-based | C, sumber multiple bersumber | Sumber data pembanding (tidak boleh angka karangan) |
| H | Laporan riset/investor §32 (PDF A4 bercover, daftar isi, MD&A, lampiran) berversi & arsip | A–G (bagian yang belum ada ditandai) | Format & siapa penyetuju laporan final |
| I | Konsolidasi formal Mode B (kepemilikan, antarentitas, eliminasi) | Badan usaha (`legal_entities`) | Struktur kepemilikan nyata |
| J | KPI industri tambahan (laundry per kg, utilisasi, online) | Data operasional yang mencatatnya | Data apa yang mau dicatat |

Setiap tahap: migrasi baru + uji database + uji logika + render HP/desktop + panduan, baru dinyatakan selesai.
