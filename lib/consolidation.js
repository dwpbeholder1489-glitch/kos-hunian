// Konsolidasi formal (Tahap I Master Blueprint BI) — rumus TERTULIS atas keluaran consol_report.
// 1) Jumlahkan pos (biz_fin_class) semua bisnis grup. 2) Eliminasi: penjualan antarbisnis (pendapatan ↔ HPP), piutang ↔ utang antarbisnis
//    (yang lebih kecil; selisih dilaporkan), eliminasi manual (satu pos debit & satu pos kredit dikurangi sama besar → neraca tetap seimbang).
// 3) Kepentingan nonpengendali (KNP) = laba & ekuitas bisnis × (100% − persen kepemilikan).
// Batasan (ditulis di layar): tanpa goodwill/biaya investasi, laba belum terealisasi di persediaan akhir tidak dieliminasi,
// piutang/utang antarbisnis otomatis hanya untuk periode yang berakhir hari ini atau sesudahnya.
import { incomeStatement, balanceSheet } from './finRatios.js';

const n = (v) => Number(v) || 0;
export const PL = ['pendapatan_usaha', 'retur', 'pendapatan_lain', 'hpp', 'beban_operasional', 'penyusutan', 'bunga', 'beban_lain', 'pajak'];
export const BS = ['kas', 'piutang', 'persediaan', 'aset_lancar_lain', 'aset_tetap', 'utang_usaha', 'kewajiban_lain', 'pinjaman', 'ekuitas', 'laba_ditahan'];
export const LABEL = {
  pendapatan_usaha: 'Pendapatan usaha', retur: 'Retur penjualan', pendapatan_lain: 'Pendapatan lain', hpp: 'Harga pokok penjualan', beban_operasional: 'Beban operasional',
  penyusutan: 'Penyusutan', bunga: 'Beban bunga', beban_lain: 'Beban lain', pajak: 'Pajak penghasilan', kas: 'Kas & bank', piutang: 'Piutang', persediaan: 'Persediaan',
  aset_lancar_lain: 'Aset lancar lain', aset_tetap: 'Aset tetap bersih', utang_usaha: 'Utang usaha', kewajiban_lain: 'Kewajiban lain', pinjaman: 'Pinjaman',
  ekuitas: 'Modal, prive & saldo awal', laba_ditahan: 'Laba ditahan',
};
const REVENUE = new Set(['pendapatan_usaha', 'pendapatan_lain']);
const EXPENSE = new Set(['hpp', 'beban_operasional', 'beban_lain', 'penyusutan', 'bunga', 'pajak']);

// realized = persen barang antarbisnis yang sudah dijual lagi ke pihak luar / terpakai (0–100, bawaan 100).
// Per pasangan: pendapatan −S; HPP −(r·S + (1−r)·K); persediaan −(1−r)·(S − K)  [S = nilai jual, K = harga pokok penjual].
// Bila r = 100%: pendapatan ↔ HPP penuh. Bila < 100%: laba penjual atas barang yang masih di gudang pembeli belum terjadi → persediaan turun.
export function consolidate(rep, realized = 100) {
  const r = Math.min(100, Math.max(0, n(realized))) / 100;
  const members = rep?.members || [];
  const names = Object.fromEntries(members.map((m) => [m.kos_id, m.name]));
  const elim = Object.fromEntries([...PL, ...BS].map((k) => [k, 0]));
  const items = [];
  const cut = (k, a) => { elim[k] -= a; };
  // laba bersih berubah bila eliminasi menyentuh pos laba rugi → laba ditahan akhir ikut
  const plImpact = (d, c, a) => (EXPENSE.has(d) ? a : 0) - (REVENUE.has(c) ? a : 0);
  let unrealized = 0;
  for (const s of rep?.auto_sales || []) {
    const S = n(s.amount); const K = Math.min(S, Math.max(0, n(s.cost ?? S)));
    const u = (1 - r) * (S - K);
    cut('pendapatan_usaha', S); cut('hpp', S - u); if (u) cut('persediaan', u);
    unrealized += u;
    items.push({ kind: 'Penjualan antarbisnis', text: `${names[s.from] || '?'} → ${names[s.to] || '?'}`, amount: S, auto: true, unrealized: u });
  }
  const gaps = [];
  for (const x of rep?.auto_arap || []) {
    const a = Math.min(n(x.piutang), n(x.utang));
    if (a > 0) { cut('piutang', a); cut('utang_usaha', a); items.push({ kind: 'Piutang ↔ utang antarbisnis', text: `${names[x.creditor] || '?'} ↔ ${names[x.debtor] || '?'}`, amount: a, auto: true }); }
    if (Math.abs(n(x.piutang) - n(x.utang)) >= 1) gaps.push({ creditor: names[x.creditor], debtor: names[x.debtor], piutang: n(x.piutang), utang: n(x.utang), selisih: n(x.piutang) - n(x.utang) });
  }
  let reImpact = 0;
  for (const e of rep?.manual || []) {
    cut(e.debit_class, n(e.amount)); cut(e.credit_class, n(e.amount));
    reImpact += plImpact(e.debit_class, e.credit_class, n(e.amount));
    items.push({ id: e.id, kind: 'Manual', text: e.reason, amount: n(e.amount), date: e.date, debit: e.debit_class, credit: e.credit_class });
  }
  elim.laba_ditahan += reImpact - unrealized;

  const val = (m, k, side) => n(PL.includes(k) ? m.fin?.laba_rugi?.[k] : m.fin?.[side]?.[k]);
  const rows = (keys, side) => keys.map((k) => {
    const per = members.map((m) => val(m, k, side));
    const sum = per.reduce((t, v) => t + v, 0);
    return { key: k, label: LABEL[k], per, sum, elim: PL.includes(k) || side === 'close' ? elim[k] : 0, total: sum + (PL.includes(k) || side === 'close' ? elim[k] : 0) };
  });
  const pl = rows(PL, 'pl');
  const bs = rows(BS, 'close');
  const plTotal = Object.fromEntries(pl.map((r) => [r.key, r.total]));
  const s = incomeStatement(plTotal);
  const bsTotal = Object.fromEntries(bs.map((r) => [r.key, r.total]));
  const b = balanceSheet(bsTotal);
  // KNP
  const nci = members.filter((m) => n(m.pct) < 100).map((m) => {
    const share = 1 - n(m.pct) / 100;
    const ni = incomeStatement(m.fin?.laba_rugi || {}).netIncome;
    const eq = n(m.fin?.close?.ekuitas) + n(m.fin?.close?.laba_ditahan);
    return { kos_id: m.kos_id, name: m.name, pct: n(m.pct), profit: ni * share, equity: eq * share };
  });
  const nciProfit = nci.reduce((t, x) => t + x.profit, 0);
  const nciEquity = nci.reduce((t, x) => t + x.equity, 0);
  const balanced = Math.abs(b.assets - b.liabilities - b.equity) < 1;
  return {
    members: members.map((m) => ({ kos_id: m.kos_id, name: m.name, pct: n(m.pct), seimbang: m.fin?.seimbang, lengkap: m.fin?.lengkap })),
    pl, bs, items, gaps, unrealized, realized: r * 100, elimTotal: items.reduce((t, x) => t + x.amount, 0),
    income: s, netIncome: s.netIncome, nciProfit, ownerProfit: s.netIncome - nciProfit,
    balance: b, nci, nciEquity, ownerEquity: b.equity - nciEquity, balanced,
  };
}

export function validateElim(e) {
  if (!(n(e.amount) > 0)) return 'Isi jumlah';
  if ((e.reason || '').trim().length < 5) return 'Tulis alasan (min. 5 huruf)';
  if (e.kind === 'lainnya' && (!e.debit_class || !e.credit_class)) return 'Pilih kedua pos';
  return null;
}
export const ELIM_KINDS = { jual_beli: 'Jual-beli antarbisnis (pendapatan ↔ HPP)', piutang_utang: 'Piutang ↔ utang antarbisnis', pinjaman: 'Pinjaman antarbisnis (aset lain ↔ pinjaman)', lainnya: 'Lainnya (pilih pos)' };
export const ELIM_SIDES = { debit: ['hpp', 'beban_operasional', 'beban_lain', 'piutang', 'aset_lancar_lain', 'persediaan'], credit: ['pendapatan_usaha', 'pendapatan_lain', 'utang_usaha', 'kewajiban_lain', 'pinjaman'] };
