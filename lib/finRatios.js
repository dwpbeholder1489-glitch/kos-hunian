// Laporan keuangan bertingkat & standar rasio keuangan (Master Blueprint BI V2.0 §7, §32.4).
// Masukan = keluaran RPC biz_financials (saldo & mutasi jurnal). Logika murni — diuji: node supabase/tests/laporan_rasio_js.mjs.
// Aturan: rasio TIDAK dihitung bila komponennya tidak tersedia/tidak valid (penyebut 0 atau negatif) → value null + alasan.

const n = (v) => Number(v || 0);

// Laba rugi bertingkat dari kelas akun (biz_fin_class)
export function incomeStatement(c) {
  if (!c) return null;
  const gross = n(c.pendapatan_usaha);
  const retur = -n(c.retur); // retur tersimpan sebagai pendapatan negatif
  const net = gross - retur;
  const hpp = n(c.hpp);
  const gp = net - hpp;
  const opex = n(c.beban_operasional);
  const ebitda = gp - opex;
  const dep = n(c.penyusutan);
  const ebit = ebitda - dep;
  const interest = n(c.bunga);
  const other = n(c.pendapatan_lain) - n(c.beban_lain);
  const pbt = ebit - interest + other;
  const tax = n(c.pajak); // PPh final UMKM (akrual bulanan) — 0 bila profil pajak belum diatur
  return { gross, retur, net, hpp, gp, opex, ebitda, dep, ebit, interest, otherIncome: n(c.pendapatan_lain), otherExpense: n(c.beban_lain), pbt, tax, netIncome: pbt - tax };
}

// Baris laporan: [kunci, label, nilai, jenis] — jenis 'sub' = subtotal, 'neg' = pengurang
export function incomeLines(s) {
  return [
    ['gross', 'Pendapatan usaha (kotor)', s.gross], ['retur', 'Retur penjualan', -s.retur, 'neg'], ['net', 'Pendapatan bersih', s.net, 'sub'],
    ['hpp', 'Harga pokok penjualan (HPP)', -s.hpp, 'neg'], ['gp', 'Laba kotor', s.gp, 'sub'],
    ['opex', 'Beban operasional', -s.opex, 'neg'], ['ebitda', 'EBITDA', s.ebitda, 'sub'],
    ['dep', 'Penyusutan & amortisasi', -s.dep, 'neg'], ['ebit', 'EBIT (laba usaha)', s.ebit, 'sub'],
    ['interest', 'Beban bunga pinjaman', -s.interest, 'neg'],
    ['otherIncome', 'Pendapatan lain', s.otherIncome], ['otherExpense', 'Beban non-operasional', -s.otherExpense, 'neg'],
    ['pbt', 'Laba sebelum pajak', s.pbt, 'sub'], ['tax', 'Pajak penghasilan (PPh final)', -s.tax, 'neg'], ['netIncome', 'Laba bersih', s.netIncome, 'sub'],
  ];
}
// Kelas akun yang membentuk tiap baris laba rugi (untuk drill-down jurnal)
export const LINE_CLASSES = { gross: ['pendapatan_usaha'], retur: ['retur'], net: ['pendapatan_usaha', 'retur'], hpp: ['hpp'], gp: ['pendapatan_usaha', 'retur', 'hpp'],
  opex: ['beban_operasional'], ebitda: ['pendapatan_usaha', 'retur', 'hpp', 'beban_operasional'], dep: ['penyusutan'],
  ebit: ['pendapatan_usaha', 'retur', 'hpp', 'beban_operasional', 'penyusutan'], otherIncome: ['pendapatan_lain'], otherExpense: ['beban_lain'], interest: ['bunga'], tax: ['pajak'] };

// portion = loan_current_portion (pokok jatuh tempo ≤ 12 bulan) — dari daftar pinjaman, dibatasi saldo akun Pinjaman
export function balanceSheet(b, portion) {
  if (!b) return null;
  const cash = n(b.kas), ar = n(b.piutang), inv = n(b.persediaan), oca = n(b.aset_lancar_lain), fixed = n(b.aset_tetap);
  const ca = cash + ar + inv + oca;
  const assets = ca + fixed;
  const ap = n(b.utang_usaha), ocl = n(b.kewajiban_lain), loans = n(b.pinjaman);
  const loansCur = Math.max(0, Math.min(loans, n(portion?.lancar)));
  const loansLong = loans - loansCur;
  const cl = ap + ocl + loansCur;
  const liabilities = cl + loansLong;
  const equity = n(b.ekuitas) + n(b.laba_ditahan);
  return { cash, ar, inv, oca, ca, fixed, assets, ap, ocl, loansCur, loansLong, unscheduled: Math.max(0, Math.min(loansLong, n(portion?.tidak_terjadwal) + Math.max(0, loans - n(portion?.terdaftar)))), cl, loans, liabilities, contributed: n(b.ekuitas), retained: n(b.laba_ditahan), equity };
}
export function balanceLines(b) {
  return [
    ['h1', 'ASET', null, 'head'], ['cash', 'Kas & bank', b.cash], ['ar', 'Piutang', b.ar], ['inv', 'Persediaan', b.inv], ['oca', 'Aset lancar lain', b.oca],
    ['ca', 'Total aset lancar', b.ca, 'sub'], ['fixed', 'Aset tetap bersih', b.fixed], ['assets', 'TOTAL ASET', b.assets, 'sub'],
    ['h2', 'KEWAJIBAN', null, 'head'], ['ap', 'Utang usaha', b.ap], ['ocl', 'Kewajiban lancar lain', b.ocl], ['loansCur', 'Pinjaman jatuh tempo ≤ 12 bulan', b.loansCur], ['cl', 'Total kewajiban lancar', b.cl, 'sub'],
    ['loansLong', 'Pinjaman jangka panjang', b.loansLong], ['liabilities', 'TOTAL KEWAJIBAN', b.liabilities, 'sub'],
    ['h3', 'EKUITAS', null, 'head'], ['contributed', 'Modal, prive & saldo awal', b.contributed], ['retained', 'Laba ditahan (akumulasi)', b.retained],
    ['equity', 'TOTAL EKUITAS', b.equity, 'sub'], ['le', 'TOTAL KEWAJIBAN + EKUITAS', b.liabilities + b.equity, 'sub'],
  ];
}

// Standar rasio (§32.4): setiap rasio punya kelompok, formula, definisi, satuan, dan penanganan nilai tidak valid.
const div = (a, b, why) => (b > 0 ? { value: a / b } : { value: null, reason: why || 'Penyebut nol atau negatif.' });
export function ratios(fin) {
  const s = incomeStatement(fin.laba_rugi?.cur);
  const b1 = balanceSheet(fin.neraca?.close, fin.neraca?.pinjaman_close); const b0 = balanceSheet(fin.neraca?.open, fin.neraca?.pinjaman_open);
  const days = n(fin.hari) || 30;
  const out = [];
  const add = (group, key, label, unit, formula, def, r, interp) => out.push({ group, key, label, unit, formula, def, ...r, interp });
  const pctOf = (a, b) => div(a * 100, b, 'Belum ada pendapatan bersih.');
  add('Profitabilitas', 'gpm', 'Margin laba kotor', '%', 'Laba kotor ÷ pendapatan bersih', 'Bagian pendapatan yang tersisa setelah HPP.', pctOf(s.gp, s.net), 'Makin tinggi makin baik.');
  add('Profitabilitas', 'ebitdam', 'Margin EBITDA', '%', 'EBITDA ÷ pendapatan bersih', 'Laba operasi sebelum penyusutan, bunga, dan pajak.', pctOf(s.ebitda, s.net));
  add('Profitabilitas', 'ebitm', 'Margin EBIT', '%', 'EBIT ÷ pendapatan bersih', 'Laba usaha setelah penyusutan.', pctOf(s.ebit, s.net));
  add('Profitabilitas', 'npm', 'Margin laba bersih', '%', 'Laba bersih ÷ pendapatan bersih', 'Laba bersih (sebelum pajak penghasilan yang belum dicatat) per pendapatan.', pctOf(s.netIncome, s.net));
  if (b1 && b0) {
    const avgA = (b1.assets + b0.assets) / 2; const avgE = (b1.equity + b0.equity) / 2;
    const ann = 365 / days;
    add('Profitabilitas', 'roa', 'ROA (disetahunkan)', '%', 'Laba bersih × (365 ÷ hari periode) ÷ rata-rata total aset', 'Laba yang dihasilkan dari setiap rupiah aset.', div(s.netIncome * ann * 100, avgA, 'Total aset nol.'));
    add('Profitabilitas', 'roe', 'ROE (disetahunkan)', '%', 'Laba bersih × (365 ÷ hari periode) ÷ rata-rata ekuitas', 'Laba bagi pemilik dari setiap rupiah ekuitas.', div(s.netIncome * ann * 100, avgE, 'Ekuitas nol atau negatif — ROE tidak bermakna.'));
    const prof = fin.pajak_profil;
    const avgIC = (b1.equity + b1.loans + b0.equity + b0.loans) / 2;
    add('Profitabilitas', 'roic', 'ROIC (disetahunkan)', '%', '(EBIT − pajak penghasilan) × (365 ÷ hari) ÷ rata-rata (ekuitas + pinjaman)',
      'Imbal hasil dari seluruh modal yang ditanam pemilik dan pemberi pinjaman. NOPAT didekati EBIT dikurangi pajak penghasilan periode ini.',
      !prof || prof.regime === 'belum' ? { value: null, reason: 'Atur profil pajak dulu di Analisis Bisnis › Pajak agar pajak penghasilan ikut dihitung.' }
        : div((s.ebit - s.tax) * ann * 100, avgIC, 'Modal yang diinvestasikan nol atau negatif.'));
    add('Likuiditas', 'cr', 'Rasio lancar', '×', 'Aset lancar ÷ kewajiban lancar', 'Kemampuan membayar kewajiban jangka pendek.', div(b1.ca, b1.cl, 'Tidak ada kewajiban lancar.'), '≥ 1× berarti aset lancar menutup kewajiban lancar.');
    add('Likuiditas', 'qr', 'Rasio cepat', '×', '(Kas & bank + piutang) ÷ kewajiban lancar', 'Seperti rasio lancar tanpa persediaan.', div(b1.cash + b1.ar, b1.cl, 'Tidak ada kewajiban lancar.'));
    add('Likuiditas', 'cashr', 'Rasio kas', '×', 'Kas & bank ÷ kewajiban lancar', 'Kewajiban lancar yang bisa dibayar dengan kas saat ini.', div(b1.cash, b1.cl, 'Tidak ada kewajiban lancar.'));
    add('Likuiditas', 'wc', 'Modal kerja', 'rp', 'Aset lancar − kewajiban lancar', 'Dana operasional bersih jangka pendek.', { value: b1.ca - b1.cl });
    add('Solvabilitas', 'de', 'Utang terhadap ekuitas', '×', 'Total kewajiban ÷ total ekuitas', 'Seberapa besar bisnis dibiayai utang dibanding modal.', div(b1.liabilities, b1.equity, 'Ekuitas nol atau negatif.'));
    add('Solvabilitas', 'da', 'Utang terhadap aset', '%', 'Total kewajiban ÷ total aset', 'Bagian aset yang dibiayai kewajiban.', div(b1.liabilities * 100, b1.assets, 'Total aset nol.'));
    add('Solvabilitas', 'icr', 'Cakupan bunga', '×', 'EBIT ÷ beban bunga pinjaman', 'Kemampuan laba usaha menutup bunga.', div(s.ebit, s.interest, 'Tidak ada beban bunga pada periode ini.'), '≥ 3× umumnya dianggap aman.');
    add('Efisiensi', 'at', 'Perputaran aset (disetahunkan)', '×', 'Pendapatan bersih × (365 ÷ hari) ÷ rata-rata total aset', 'Pendapatan per rupiah aset.', div(s.net * ann, avgA, 'Total aset nol.'));
    const avgInv = (b1.inv + b0.inv) / 2; const avgAr = (b1.ar + b0.ar) / 2; const avgAp = (b1.ap + b0.ap) / 2;
    const it = div(s.hpp, avgInv, 'Tidak ada persediaan.');
    add('Efisiensi', 'it', 'Perputaran persediaan (periode)', '×', 'HPP ÷ rata-rata persediaan', 'Berapa kali persediaan habis terjual dalam periode.', it);
    const dio = s.hpp > 0 && avgInv > 0 ? avgInv / (s.hpp / days) : null;
    const dso = s.net > 0 ? avgAr / (s.net / days) : null;
    const dpo = s.hpp > 0 ? avgAp / (s.hpp / days) : null;
    add('Efisiensi', 'dio', 'Hari persediaan', 'hari', 'Rata-rata persediaan ÷ (HPP ÷ hari periode)', 'Lama rata-rata barang tersimpan sebelum terjual.', dio == null ? { value: null, reason: 'Butuh HPP dan persediaan.' } : { value: dio });
    add('Efisiensi', 'dso', 'Hari piutang', 'hari', 'Rata-rata piutang ÷ (pendapatan bersih ÷ hari periode)', 'Lama rata-rata piutang tertagih.', dso == null ? { value: null, reason: 'Belum ada pendapatan bersih.' } : { value: dso });
    add('Efisiensi', 'dpo', 'Hari utang', 'hari', 'Rata-rata utang usaha ÷ (HPP ÷ hari periode)', 'Lama rata-rata membayar supplier.', dpo == null ? { value: null, reason: 'Belum ada HPP.' } : { value: dpo });
    add('Efisiensi', 'ccc', 'Siklus konversi kas', 'hari', 'Hari persediaan + hari piutang − hari utang', 'Lama uang tertahan di operasional sebelum kembali menjadi kas.',
      dio != null && dso != null && dpo != null ? { value: dio + dso - dpo } : { value: null, reason: 'Butuh hari persediaan, piutang, dan utang.' });
  }
  return out.map((r) => ({ ...r, value: r.value == null || !isFinite(r.value) ? null : Math.round(r.value * 100) / 100 }));
}
export const fmtRatio = (r, rp) => (r.value == null ? '—' : r.unit === '%' ? `${r.value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
  : r.unit === '×' ? `${r.value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}×` : r.unit === 'hari' ? `${Math.round(r.value)} hari` : rp(r.value));

// Laporan perubahan ekuitas (Tahap C) dari biz_financials.neraca (laporan_lanjutan): ekuitas_mutasi per akun ekuitas
// (saldo awal, penambahan = kredit, pengurangan = debit, saldo akhir) + laba ditahan (akumulasi laba rugi, mutasi = laba periode).
// cocok = ekuitas akhir sama dengan total ekuitas neraca per tanggal akhir.
const EQ_LABEL = { modal: 'Modal pemilik', prive: 'Prive (diambil pemilik)', saldo_awal: 'Ekuitas saldo awal' };
export function equityChanges(fin) {
  const nr = fin?.neraca;
  if (!nr?.ekuitas_mutasi) return null;
  const acc = nr.ekuitas_mutasi.map((a) => ({ ...a, label: EQ_LABEL[a.sys_key] || a.name, open: n(a.open), tambah: n(a.tambah), kurang: n(a.kurang), close: n(a.close) }));
  const reOpen = n(nr.open?.laba_ditahan), reClose = n(nr.close?.laba_ditahan), profit = reClose - reOpen;
  const pick = (k) => acc.find((a) => a.sys_key === k);
  const lines = [];
  const modal = pick('modal'), prive = pick('prive'), sa = pick('saldo_awal');
  if (modal?.tambah) lines.push(['setoran', 'Setoran modal', modal.tambah]);
  if (modal?.kurang) lines.push(['tarik_modal', 'Penarikan modal', -modal.kurang]);
  if (sa && sa.tambah - sa.kurang) lines.push(['saldo_awal', 'Saldo awal & koreksi pembukaan', sa.tambah - sa.kurang]);
  if (prive && prive.kurang - prive.tambah) lines.push(['prive', 'Diambil pemilik (prive)', -(prive.kurang - prive.tambah)]);
  for (const a of acc) if (!EQ_LABEL[a.sys_key] && a.tambah - a.kurang) lines.push(['akun:' + a.id, a.label, a.tambah - a.kurang]);
  lines.push(['laba', profit >= 0 ? 'Laba bersih periode' : 'Rugi bersih periode', profit]);
  const open = acc.reduce((t, a) => t + a.open, 0) + reOpen;
  const close = acc.reduce((t, a) => t + a.close, 0) + reClose;
  const sheet = n(nr.close?.ekuitas) + reClose;
  const parts = [...acc.map((a) => ({ key: a.id, label: a.label, open: a.open, close: a.close })), { key: 'laba_ditahan', label: 'Laba ditahan (akumulasi)', open: reOpen, close: reClose }];
  return { open, close, lines, parts, profit, sheet, cocok: Math.abs(close - sheet) < 1 && Math.abs(open + lines.reduce((t, l) => t + l[2], 0) - close) < 1 };
}
