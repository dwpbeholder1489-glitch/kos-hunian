// Valuasi multiple & berbasis aset (Tahap G Master Blueprint BI). Model 'v1' — rumus TERTULIS.
// Dasar = valuation_basis (jurnal 12 bulan penuh terakhir, disetahunkan bila < 12 bulan; neraca hari ini).
// Kelipatan SELALU dari pemilik + sumbernya (PRASARA tidak punya data pasar). Hasil = ESTIMASI, bukan penilaian resmi.
import { incomeStatement, balanceSheet } from './finRatios.js';

export const BASES = {
  pendapatan: { label: 'Pendapatan bersih setahun', kind: 'ev', hint: 'Nilai usaha = pendapatan × kelipatan (EV/Revenue)' },
  ebitda: { label: 'EBITDA setahun', kind: 'ev', hint: 'Nilai usaha = EBITDA × kelipatan (EV/EBITDA)' },
  laba_bersih: { label: 'Laba bersih setahun', kind: 'equity', hint: 'Nilai ekuitas = laba bersih × kelipatan (P/E)' },
};
const n = (v) => Number(v) || 0;

export function basisFigures(basis) {
  const months = n(basis?.bulan_data);
  const factor = months > 0 ? 12 / months : 0;
  const s = incomeStatement(basis?.laba_rugi || {});
  const b = balanceSheet({ ...(basis?.neraca || {}), laba_ditahan: basis?.laba_ditahan });
  return {
    months, annualized: months > 0 && months < 12, factor,
    pendapatan: s.net * factor, ebitda: s.ebitda * factor, laba_bersih: s.netIncome * factor,
    cash: b.cash, debt: b.loans, netDebt: b.loans - b.cash, assets: b.assets, liabilities: b.liabilities, equity: b.equity, bs: b,
  };
}

// Valuasi multiple: rentang bawah–tengah–atas. EV ↔ ekuitas lewat utang bersih (pinjaman − kas).
export function multipleValuation(basis, m) {
  if (!m) return null;
  const f = basisFigures(basis);
  const base = f[m.basis];
  const meta = BASES[m.basis];
  if (!f.months) return { reason: 'Belum ada transaksi di Pembukuan 12 bulan terakhir.' };
  if (!(base > 0)) return { reason: `${meta.label} tidak positif (${Math.round(base).toLocaleString('id-ID')}) — valuasi kelipatan tidak bermakna. Pakai valuasi aset atau dasar lain.` };
  const row = (k) => {
    const x = base * n(m[k]);
    const ev = meta.kind === 'ev' ? x : x + f.netDebt;
    const equity = meta.kind === 'ev' ? x - f.netDebt : x;
    return { multiple: n(m[k]), ev, equity };
  };
  return { base, basisLabel: meta.label, kind: meta.kind, low: row('low'), mid: row('mid'), high: row('high'), netDebt: f.netDebt, annualized: f.annualized, months: f.months };
}

// Valuasi berbasis aset: nilai buku ekuitas, lalu penyesuaian pemilik (aset tetap ke nilai pasar, persediaan & piutang yang bernilai, lain-lain)
export function assetValuation(basis, a = {}) {
  const f = basisFigures(basis);
  const b = f.bs;
  const listed = basis?.aset_tetap || [];
  const market = new Map((a.assets || []).map((x) => [x.id, n(x.market)]));
  const fixedListedBook = listed.reduce((t, x) => t + n(x.book), 0);
  const fixedListedAdj = listed.reduce((t, x) => t + (market.has(x.id) ? market.get(x.id) : n(x.book)), 0);
  const fixedOther = b.fixed - fixedListedBook; // aset tetap di jurnal yang tidak ada di daftar Aset tetap (tetap nilai buku)
  const inv = b.inv * (a.inv_pct == null ? 1 : n(a.inv_pct) / 100);
  const ar = b.ar * (a.ar_pct == null ? 1 : n(a.ar_pct) / 100);
  const adjAssets = b.cash + ar + inv + b.oca + fixedListedAdj + fixedOther + n(a.other_adj);
  const lines = [
    ['Kas & bank', b.cash, b.cash], ['Piutang', b.ar, ar], ['Persediaan', b.inv, inv], ['Aset lancar lain', b.oca, b.oca],
    ['Aset tetap', b.fixed, fixedListedAdj + fixedOther], ...(n(a.other_adj) ? [['Penyesuaian lain', 0, n(a.other_adj)]] : []),
    ['Dikurangi: seluruh kewajiban', -b.liabilities, -b.liabilities],
  ];
  return { book: b.assets - b.liabilities, adjusted: adjAssets - b.liabilities, lines, fixedOther };
}

// Ringkasan rentang dari semua metode (untuk "football field"): hanya metode yang punya angka
export function summaryRange(multiple, asset) {
  const pts = [];
  if (multiple && multiple.mid) pts.push(multiple.low.equity, multiple.mid.equity, multiple.high.equity);
  if (asset) pts.push(asset.book, asset.adjusted);
  if (!pts.length) return null;
  return { min: Math.min(...pts), max: Math.max(...pts) };
}

export function validateMultiple(m) {
  if (!m) return null;
  if (!BASES[m.basis]) return 'Pilih dasar kelipatan';
  if (!(n(m.low) > 0 && n(m.low) <= n(m.mid) && n(m.mid) <= n(m.high) && n(m.high) <= 100)) return 'Kelipatan harus 0 < bawah ≤ tengah ≤ atas ≤ 100';
  const two = (v) => Math.abs(n(v) * 100 - Math.round(n(v) * 100)) < 1e-9;   // sama dengan valuation_clean: maks. 2 desimal, ≥ 0,01
  if (![m.low, m.mid, m.high].every(two) || n(m.low) < 0.01) return 'Kelipatan paling kecil 0,01 dan maks. 2 angka di belakang koma';
  if ((m.source || '').trim().length < 5) return 'Tulis sumber kelipatan (mis. penawaran pembeli, konsultan, data transaksi)';
  return null;
}
