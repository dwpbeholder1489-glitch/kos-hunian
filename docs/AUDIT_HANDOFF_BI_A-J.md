# Serah-terima audit: Business Intelligence PRASARA (Analisis Bisnis + Tahap A–J)

Dokumen ini untuk **pengembang/agen lain (mis. Codex) yang mengaudit** pekerjaan modul Business Intelligence (BI).
Ditulis oleh pengembang sebelumnya (Claude Code) pada 27–28 Nov 2026. Bahasa kode & catatan proyek: Indonesia.

---

## 0. Tugas untuk auditor (salin ke Codex)

> Audit pekerjaan modul Business Intelligence PRASARA yang dijelaskan di `docs/AUDIT_HANDOFF_BI_A-J.md`.
> 1. Baca `CLAUDE.md` (aturan tetap proyek) dan dokumen ini sampai habis sebelum mengubah apa pun.
> 2. Jalankan `bash supabase/tests/harness/run_bi.sh` (lihat §2). Laporkan hasilnya apa adanya.
> 3. Periksa setiap tahap di §4 terhadap daftar periksa §6: **benar / kurang / belum ada / perlu dikembangkan**.
> 4. Untuk setiap temuan tulis: lokasi (file:baris), skenario konkret yang gagal (input → hasil salah), tingkat
>    (kritis / penting / kecil), dan usulan perbaikan. Bedakan **fakta yang terbukti** (uji/kode) dari **dugaan**.
> 5. **Jangan** "memperbaiki" keputusan pemilik di §3 — itu disengaja. Bila menurut Anda keputusannya keliru, tulis sebagai usulan.
> 6. Perubahan database WAJIB migrasi baru (jangan ubah migrasi lama); nomor harus lebih besar dari migrasi terakhir di `main`.

---

## 1. Lingkup yang diaudit

Semua sudah digabung ke `main` dan online (Vercel produksi Ready; migrasi Supabase terpasang — dicek 28 Nov 2026).

| PR | Tahap | Migrasi | Isi singkat |
|---|---|---|---|
| #26 | Analisis Bisnis | `20261127120000_analisis_bisnis_intel` | Pusat Analisis Bisnis: skor kesehatan, KPI, insight, filter, drill-down jurnal, ekspor (`biz_intel`) |
| #27 | Laporan keuangan & rasio | `20261127130000_laporan_keuangan_rasio` | `biz_financials`, laba rugi bertingkat (EBITDA/EBIT), neraca, rasio §32.4, pusat modul Analisis |
| #28 | A | `20261127140000_pinjaman_bunga` | Daftar pinjaman, bayar = pokok + bunga, porsi jatuh tempo ≤ 12 bulan, cakupan bunga |
| #29 | B | `20261127150000_pph_final_umkm` | PPh final UMKM 0,5% berversi, profil pajak, akrual jurnal, setoran via Kas |
| #30 | D | `20261127160000_anggaran_target_persetujuan` | Target pendapatan, persetujuan anggaran, proyeksi akhir bulan |
| #31 | E | `20261127170000_skenario_stress_test` | Skenario Pesimis/Dasar/Optimis 12 bulan, 7 stress test, versi tersimpan |
| #32 | C | `20261127180000_perubahan_ekuitas` | Laporan perubahan ekuitas |
| #34 | F | `20261127190000_daftar_risiko` | Daftar risiko 5×5, PIC, tinjauan, saran dari data |
| #35 | J | `20261127195000_kpi_industri` | KPI industri laundry/jasa, kuliner, kos dari data yang sudah dicatat |
| #36 | G | `20261127210000_valuasi_multiple_aset` | Valuasi kelipatan (sumber dari pemilik) & berbasis aset, berversi |
| #37 | H | `20261127220000_laporan_investor` | Laporan investor A4 berversi (Paket Pro) |
| #39 | I | `20261127240000_konsolidasi` | Konsolidasi: eliminasi antarbisnis, kepentingan nonpengendali (Paket Pro) |
| (PR serah-terima ini) | I (perbaikan) | `20261128005000_konsolidasi_bisnis_tutup` | Grup berisi bisnis yang ditutup sebelumnya tidak bisa diubah/dihapus — ditemukan saat menyiapkan audit |

Bukan bagian audit ini (sesi lain): PR #38 Rekap Bisnis (`20261127230000`), PR #33 Workspace Event (masih terbuka, nomor migrasinya bentrok — lihat §7).

Peta roadmap & status per modul: `docs/AUDIT_BI_MASTER_V2.md`. Ringkasan teknis per fitur: bullet-bullet di `CLAUDE.md`
(cari judul: "Analisis Bisnis / Business Intelligence Center", "Laporan keuangan & rasio", "Pinjaman & beban bunga", "PPh final UMKM",
"Target & persetujuan anggaran", "Skenario & stress test", "Laporan perubahan ekuitas", "Daftar risiko", "KPI industri",
"Valuasi multiple & aset", "Laporan investor", "Konsolidasi").

---

## 2. Cara menjalankan uji

Tidak perlu Supabase. Cukup PostgreSQL 15+ (superuser) dan Node 18+.

```bash
# dari akar repo; sesuaikan koneksi psql
PSQL="psql -h localhost -p 5432 -U postgres" bash supabase/tests/harness/run_bi.sh prasara_bi_audit
```

Skrip membuat database baru, memasang stub Supabase (`supabase/tests/harness/mock_supabase.sql`: peran anon/authenticated/service_role,
`auth.uid()` dari `set_config('request.jwt.claims', …)`, storage/cron/net palsu), menjalankan **semua** migrasi berurutan, lalu:
12 uji SQL BI, uji isolasi antar bisnis (`isolasi.sql`), dan 9 uji rumus JS. Hasil terakhir (28 Nov 2026): **SEMUA LULUS**
(154 migrasi, isolasi 267/0).

Aturan baca hasil uji SQL: kolom berawalan huruf uji harus `t`/angka sesuai nama kolom; NOTICE harus diawali `OK`. Psql mode rata-kolom
bisa menyembunyikan `f` — skrip memakai `-A`. Uji `rekap_bisnis.sql` (sesi lain) memang menghasilkan 7 ERROR penolakan yang diharapkan.

Uji frontend: **belum ada uji otomatis UI** untuk modul ini. Verifikasi UI dilakukan dengan render Playwright (HP 390px & desktop 1440px,
cek `scrollWidth`, tangkapan layar) terhadap `next start` dengan panggilan Supabase dialihkan ke PostgreSQL lokal — harness itu tidak
ada di repo. `npm run build` lulus.

---

## 3. Keputusan pemilik (JANGAN diubah tanpa izin pemilik)

| Topik | Keputusan (27 Nov 2026) |
|---|---|
| Pinjaman (A) | Lewat menu Kas (kos: Pengeluaran › Pinjaman); tabel `loans` = daftar/rencana, uang tetap `cash_entries` |
| Pajak (B) | PPh final UMKM 0,5% (PP 23/2018 → PP 55/2022), aturan berversi; perhitungan internal, bukan pengganti DJP |
| Anggaran (D) | Alur usulan: bagian keuangan mengajukan, pemilik (area `team`) menyetujui; pemilik boleh langsung menyetujui |
| Skenario (E) | Variabel umum + khusus jenis (kos = hunian, jasa = jumlah pesanan); area finance; Paket Bisnis & Pro (`laporan_lanjutan`) |
| Risiko (F) | Dikelola area finance ATAU settings; PIC anggota mana pun memperbarui risikonya; saran dari data harus DITERIMA dulu; Bisnis & Pro |
| Valuasi (G) | Kelipatan DIISI PEMILIK dengan SUMBER WAJIB — PRASARA tidak punya data pasar, dilarang mengarang angka bawaan; Bisnis & Pro |
| Laporan investor (H) | PDF A4 + arsip versi; keuangan menyusun, hanya pemilik memfinalkan; Paket Pro saja (fitur baru `laporan_investor`) |
| Konsolidasi (I) | Persen kepemilikan; transaksi antarbisnis dikenali dari kontak yang ditautkan + eliminasi manual wajib alasan; Paket Pro |
| KPI industri (J) | Tayang langsung; HANYA data yang sudah dicatat (tanpa pencatatan baru) |
| Umum | Tanpa angka contoh/karangan; status jujur ("Dalam rencana"); tanpa branding AI; instruksi bisa dilakukan dari HP |

---

## 4. Ringkasan teknis per tahap + titik yang minta diperiksa

Prinsip yang dipegang di semua tahap (periksa konsistensinya):
- **Satu sumber angka**: uang dari jurnal Pembukuan (`acct_lines` via `acct_desired` → `acct_sync_internal`), dikelompokkan `biz_fin_class`.
  Rumus tampilan hanya di satu file `lib/*.js` (diuji node), tidak dihitung ulang di halaman.
- **Otorisasi di server**: RPC `security definer` + `member_in(area, kos)`; tabel baru umumnya tanpa policy + `revoke` (akses hanya RPC);
  paket lewat `plan_has(kos, fitur)`; pesan batas paket berawalan `BATAS_PAKET:`.
- **Tabel ber-`kos_id`** diberi `zz_kos_open_guard` (kecuali yang disebut sengaja).
- **Patch fungsi lama** lewat `_prasara_patch(sig, old, new)` (ganti string di `pg_get_functiondef`) — rapuh bila fungsi itu ditulis ulang migrasi lain.

### Analisis Bisnis & laporan keuangan (#26, #27)
File: `app/(app)/analisis/*`, `lib/bizIntel.js`, `lib/finRatios.js`, `lib/journalSource.js`. RPC `biz_intel`, `biz_figures*`, `biz_financials`, `biz_fin_class`.
Periksa: batas paket periode di `biz_intel` (Dasar/Bisnis/Pro); skor kesehatan (aturan `HEALTH_RULES`, minimal 5 transaksi);
proyeksi regresi linier; rasio yang dikembalikan `null` + alasan; laba bersih = Σpendapatan − Σbeban sama dengan Pembukuan.

### A — Pinjaman (`components/Pinjaman.jsx`)
`loans` + `cash_entries.loan_id/interest`; jurnal bayar = Pinjaman (pokok) + Beban bunga 6-3000 ↔ kas/bank; `loan_current_portion`
(anuitas dari cicilan & bunga, tanpa jadwal → `tidak_terjadwal`). Periksa: perhitungan porsi ≤ 12 bulan untuk tiap pola pinjaman;
trigger status lunas saat catatan dihapus; pinjaman lama tanpa bunga.

### B — PPh final UMKM (`components/PajakPPh.jsx`)
`tax_rules` berversi, `tax_profiles`, `pph_rows`/`pph_group` (OP: kumulatif setahun digabung per pemilik+NPWP+jenis WP, dibagi sebanding omzet),
akrual `beban_pph`↔`utang_pph`, setoran `cash_entries` kind `bayar_pajak`. **Perlu ditinjau ahli pajak**: kebenaran hukum aturan, pembulatan
(`floor`), perlakuan bulan berjalan, jangka waktu WP, kos (sewa bangunan umumnya PPh 10% — hanya dikonfirmasi `rent_ack`).

### D — Anggaran (`components/AnggaranRencana.jsx`, `app/(app)/anggaran/page.jsx`)
`budget_plans` (status draf/diajukan/disetujui/ditolak, revisi). Perubahan isi pada rencana yang diajukan/disetujui = revisi → draf (`budget_touch`,
dipatch ke `budget_save`/`budget_copy`). Bulan tutup buku terkunci. `budget_summary`: pendapatan dari jurnal (`pph_gross`), biaya dari tabel `expenses`.
Periksa: biaya anggaran = `expenses` (bukan jurnal) — HPP/penyusutan tidak masuk; proyeksi = laju harian (biaya bulanan sekali bayar ikut dilinierkan).

### E — Skenario & stress test (`lib/scenario.js`, `app/(app)/analisis/Scenario.jsx`)
`scenario_baseline` = rata-rata ≤3 bulan penuh + posisi neraca hari ini; `fin_scenarios` berversi (salinan titik awal, tidak bisa diubah).
Rumus di header `lib/scenario.js`. Periksa: asumsi persediaan & utang usaha tetap; tanpa musim, prive, setoran modal, capex; status
aman/waspada/bahaya; faktor hunian kos bila hunian sekarang 0.

### C — Perubahan ekuitas (`lib/finRatios.js` `equityChanges`)
`biz_financials.neraca.ekuitas_mutasi` per akun ekuitas. Laba ditahan = akumulasi laba rugi (belum ada jurnal penutup tahunan). Periksa cek `cocok`.

### F — Daftar risiko (`lib/risk.js`, `app/(app)/risiko/page.jsx`)
`risks`, `risk_dismissals`; `my_access` ditulis ulang untuk menambah `risks` (menu PIC). Saran dari `scenario_baseline` + `risk_signals` + stress test.
Periksa: `my_access` ditulis ulang utuh di migrasi ini — migrasi lain yang menulis ulang `my_access` bisa menghilangkan menu PIC;
belum ada pengingat tinjau (lonceng/email).

### J — KPI industri (`lib/industryKpi.js`, `app/(app)/analisis/Industry.jsx`)
`industry_kpi_period` mengirim angka mentah. Periksa: deteksi satuan kg dari teks unit (`kg/kilo/kilogram`); `kamar_hari` menjumlah hari sewa yang
beririsan — sewa ganda pada kamar yang sama di hari pindah kamar bisa terhitung dua kali; definisi "pelanggan kembali" (kontak/No. HP/nama).

### G — Valuasi (`lib/valuation.js`, `app/(app)/analisis/Valuation.jsx`)
`valuation_basis` 12 bulan penuh (disetahunkan bila kurang), `valuations` berversi. EV ↔ ekuitas lewat utang bersih (pinjaman − kas); P/E langsung ekuitas.
Periksa: utang bersih hanya `pinjaman` (bukan utang usaha); nilai usaha negatif bila kas besar (dijelaskan di layar); `asset_accumulated` per baris (kinerja).

### H — Laporan investor (`lib/investorReport.js`, `components/InvestorDoc.jsx`, `app/(app)/laporan-investor/*`)
`investor_snapshot` = satu sumber data draf & final; final dibekukan & dikunci trigger. Fitur Pro baru ditambahkan **dinamis** ke `plan_feature_codes`,
constraint `growth_rules_trigger_event_check`, dan `growth_event_feature` (regex atas definisi fungsi). Periksa: PDF lewat cetak browser
(belum diuji di Safari iPhone nyata); ukuran snapshot; `investor_report_get` menyinkronkan jurnal setiap membuka draf (kinerja);
migrasi lain yang menulis ulang `plan_feature_codes` statis bisa menghapus `laporan_investor`.

### I — Konsolidasi (`lib/consolidation.js`, `app/(app)/konsolidasi/page.jsx`, `components/KontakBisnis.jsx`)
`contacts.related_kos_id`, grup milik akun, `consol_report`. Eliminasi selalu mengurangi satu pos debit & satu pos kredit (neraca tetap seimbang).
Laba belum terjadi: `HPP −(r·S+(1−r)·K)`, `persediaan −(1−r)(S−K)` dengan r = persen yang sudah dijual lagi (isian pengguna, tidak disimpan).
Periksa: pembeli yang mencatat pembelian antarbisnis sebagai **biaya** (bukan persediaan) → eliminasi tetap ke HPP (laba sama, baris berbeda);
jasa antarbisnis dianggap terealisasi penuh; piutang/utang otomatis hanya untuk periode yang berakhir ≥ hari ini; tanpa goodwill/akuisisi;
kepentingan nonpengendali dari laba & ekuitas mandiri tiap bisnis.

---

## 5. Kekhawatiran pengembang sebelumnya (dugaan — minta dibuktikan/dibantah)

1. **Patch berbasis string** (`_prasara_patch`) pada `budget_save`, `budget_copy`, `biz_financials`, `biz_fin_class`, fungsi kas: bila migrasi lain menulis
   ulang fungsi-fungsi ini, perilaku tambahan (revisi anggaran, kunci tutup buku, ekuitas_mutasi, kelas pajak/bunga) bisa hilang tanpa error.
2. **Fungsi yang ditulis ulang utuh** (`my_access`, `plan_feature_codes`, `growth_event_feature`): risiko saling timpa antar sesi pengembang.
3. **Laporan kos berbasis kas vs toko berbasis akrual**: rasio, skenario, valuasi, dan konsolidasi mencampur keduanya bila grup berisi kos + toko.
4. **Zona waktu**: "hari ini" = `Asia/Jakarta` di server; beberapa uji memakai `current_date` (UTC) — periksa kasus pergantian hari 00.00–07.00 WIB.
5. **Kinerja**: `acct_sync_internal` dipanggil di banyak RPC baca (scenario_baseline, budget_summary, valuation_basis, investor_report_get, consol_report via biz_financials)
   — untuk bisnis dengan banyak transaksi bisa lambat.
6. **Pembulatan**: rupiah dibulatkan 2 desimal di SQL, ditampilkan bulat di UI; PPh memakai `floor`.
7. **Aksesibilitas & HP**: tabel lebar memakai geser horizontal di dalam kartu (skenario, konsolidasi, valuasi) — perlu uji nyata di HP kecil.
8. **Uji UI otomatis tidak ada** untuk modul ini.

## 6. Daftar periksa audit

- **Keamanan**: setiap RPC baru memeriksa `member_in`/kepemilikan; tidak ada tabel baru yang bisa dibaca/ditulis langsung oleh `authenticated`/`anon`
  tanpa sengaja; `security definer` + `set search_path`; tidak ada data bisnis lain bocor (konsolidasi lintas bisnis, laporan investor, risiko PIC).
- **Kebenaran angka**: bandingkan hasil RPC dengan Pembukuan untuk data yang sama (laba rugi, neraca seimbang, arus kas cocok); uji kasus tepi
  (data kosong, rugi, angka negatif, retur, PPN, pinjaman lunas, kepemilikan 100% vs < 100%).
- **Paket**: fitur Bisnis/Pro tertutup di paket bawah dan tampil penawaran (`FiturUpgrade`); bisnis lama yang punya `legacy_features` tetap berhak.
- **Konsistensi**: rumus hanya di `lib/*`; tidak ada angka contoh; label ESTIMASI/PROYEKSI di semua hasil perkiraan.
- **Migrasi**: urutan nomor, idempoten bila perlu, tidak mengubah migrasi lama, aman dijalankan di Supabase (pgcrypto di skema `extensions`).
- **UX**: bisa dipakai dari HP (390px), teks panjang membungkus, tidak ada geser halaman horizontal, pesan galat jelas (`errMsg`).
- **Dokumentasi**: `app/panduan/page.jsx` (Langkah 139–143 untuk tahap F–I) & `lib/guide.js` sesuai perilaku nyata.

## 7. Belum ada / dalam rencana (diketahui)

Anggaran kas & CAPEX; anggaran per cabang; pengingat tinjau risiko (lonceng/email); risiko per proyek/cabang; KPI yang butuh pencatatan baru
(utilisasi mesin, berat per kantong, kanal pesanan, tamu per meja, biaya per kamar); pembanding versi skenario vs realisasi; musim dalam skenario;
PPh badan tarif normal & potong-pungut (PPh 21/23/4(2)); laporan investor: lampiran berkas, kirim email, tanda tangan digital;
konsolidasi: goodwill/akuisisi, laba belum terjadi dari data stok nyata.

PR #33 (Workspace Event, sesi lain) masih terbuka dengan migrasi `20261127170000_event_workspace.sql` — **bentrok nomor** dengan
`20261127170000_skenario_stress_test.sql` di `main`; harus diganti ke nomor > migrasi terakhir di `main` dan digabung dengan `main` terbaru sebelum merge.
