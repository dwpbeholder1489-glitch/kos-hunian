// Uji rumus perbaikan audit BI (migrasi 20261128020000) di lib/*.js. Data konsolidasi NYATA dari audit_bi_perbaikan.sql
// (supabase/tests/data/audit_consol.json): Toko E (Pro, 100%) menjual 150 rb (harga pokok 90 rb) ke Dasar D (Paket Dasar, 60%);
// D mencatat pembelian hanya 100 rb. Jalankan: node supabase/tests/audit_bi_js.mjs
import { readFileSync } from 'node:fs';
import { consolidate } from '../../lib/consolidation.js';
import { project } from '../../lib/scenario.js';
import { suggestions } from '../../lib/risk.js';
import { validateMultiple } from '../../lib/valuation.js';
import { periodIssue } from '../../lib/investorReport.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.5); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const rep = JSON.parse(readFileSync(new URL('./data/audit_consol.json', import.meta.url), 'utf8'));
const row = (c, k) => c.pl.concat(c.bs || []).find((r) => r.key === k);

// I · Konsolidasi
const c = consolidate(rep, 0);
eq('Dasar tanpa neraca → neraca gabungan ditahan', c.bsComplete, false);
eq('neraca gabungan tidak dihitung (null, bukan 0)', c.balance, null);
eq('nama bisnis tanpa neraca dilaporkan', c.noBs.join(), 'Dasar D');
eq('ekuitas KNP 40% ditahan', c.nciEquity, null);
eq('ekuitas KNP per bisnis ditahan', c.nci[0].equity, null);
eq('laba KNP tetap dihitung dari laba rugi (D laba 0 → 0)', c.nciProfit, 0);
eq('ekuitas milik pemilik ditahan', c.ownerEquity, null);
eq('eliminasi pendapatan hanya yang dicatat pembeli (100 rb)', row(c, 'pendapatan_usaha').elim, -100000);
eq('sisa 50 rb dilaporkan perlu eliminasi manual', c.unmatched[0]?.amount, 50000);
eq('0% terjual lagi: laba belum terjadi = 100 − 60 = 40 rb', c.unrealized, 40000);
eq('HPP gabungan = 90 − 60 = 30 rb (tidak negatif)', row(c, 'hpp').total, 30000);
eq('laba gabungan = 50 − 30 = 20 rb', c.netIncome, 20000);
const cAll = consolidate(rep, 100);
eq('isian 100% tetapi D belum menjual lagi (HPP 0) → dibatasi, HPP gabungan tetap 30 rb', row(cAll, 'hpp').total, 30000);
eq('pembatasan ditandai untuk layar', cAll.capped, true);
const c100 = consolidate({ ...rep, members: rep.members.map((m) => ({ ...m, pct: 100 })) }, 0);
eq('kepemilikan 100%: tanpa KNP', c100.nci.length, 0);
eq('kepemilikan 100%: neraca tetap ditahan bila ada bisnis tanpa neraca', c100.bsComplete, false);
// pembeli mencatat sebagai pengeluaran (tanpa pembelian barang): tidak boleh HPP negatif
const full = (name, pl, close) => ({ kos_id: name, name, pct: 100, fin: { laba_rugi: pl, close, neraca_ada: true } });
const svc = consolidate({ members: [full('Jasa', { pendapatan_usaha: 100, hpp: 60 }, { kas: 100, persediaan: -60, laba_ditahan: 40 }),
  full('Kantor', { beban_operasional: 100 }, { kas: -100, laba_ditahan: -100 })],
  auto_sales: [{ from: 'Jasa', to: 'Kantor', amount: 100, cost: 60, bought: 0 }], auto_arap: [], manual: [] }, 100);
eq('jasa dicatat pembeli sebagai beban: HPP tidak dieliminasi', row(svc, 'hpp').total, 60);
eq('pendapatan tidak dieliminasi otomatis (pos pembeli tidak diketahui)', row(svc, 'pendapatan_usaha').total, 100);
eq('laba gabungan tetap benar −60', svc.netIncome, -60);
eq('100 rb ditandai perlu eliminasi manual', svc.unmatched[0]?.amount, 100);
eq('neraca lengkap tetap seimbang', svc.balanced, true);

// E · Skenario v2: pinjaman lunas bulan 1 → bunga & pinjaman lancar ikut hilang; v1 tetap rumus lama
const base = { jenis: 'retail', pendapatan: 1000, hpp: 0, beban_operasional: 0, bunga: 50, kas: 5000, pinjaman: 1000, pinjaman_lancar: 1000, pokok_bulanan: 1000, bulan_data: 3, utang_usaha: 0, kewajiban_lain: 0 };
const a0 = { pendapatan: 0, biaya: 0, piutang_hari: 0, bunga_pp: 0, kejutan: 0, kejutan_bulan: 1, margin_pp: 0 };
const v2 = project({ ...base, model: 'v2' }, a0);
const v1 = project({ ...base, model: 'v1' }, a0);
eq('v2 bulan 1 bunga 50 (saldo awal)', v2.months[0].interest, 50);
eq('v2 bulan 2 bunga 0 (pinjaman lunas)', v2.months[1].interest, 0);
eq('v2 bulan 2 rasio lancar tanpa kewajiban = tidak dihitung', v2.months[1].ratio, null);
eq('v1 tetap: bunga 50 di bulan 2', v1.months[1].interest, 50);
eq('v1 tetap: rasio lancar memakai pinjaman lancar awal', v1.months[1].ratio > 0, true);

// F · Risiko: pengelola tanpa akses keuangan → saran dari sinyal saja
eq('tanpa titik awal + piutang lewat → 1 saran', suggestions(null, { piutang_lewat: 5e6, piutang_lewat_n: 2 }, 'retail').length, 1);
eq('kode saran piutang_lewat', suggestions(null, { piutang_lewat: 5e6, piutang_lewat_n: 2 }, 'properti')[0].code, 'piutang_lewat');
eq('tanpa sumber apa pun → 0 saran', suggestions(null, null).length, 0);

// G · Valuasi: presisi sama dengan valuation_clean
const vm = (low, mid, high) => validateMultiple({ basis: 'ebitda', low, mid, high, source: 'Penawaran' });
eq('0,001 ditolak', Boolean(vm(0.001, 0.002, 0.003)), true);
eq('1,234 ditolak', Boolean(vm(1.234, 2, 3)), true);
eq('0,01 / 1,25 / 3,5 diterima', vm(0.01, 1.25, 3.5), null);

// H · Laporan investor: satu batas periode
eq('500 hari ditolak di formulir', Boolean(periodIssue({ period_from: '2025-01-01', period_to: '2026-05-16' })), true);
eq('400 hari diterima', periodIssue({ period_from: '2025-01-01', period_to: '2026-02-05' }), null);
eq('pembanding > 400 hari ditolak', Boolean(periodIssue({ period_from: '2026-01-01', period_to: '2026-01-31', cmp_from: '2024-01-01', cmp_to: '2025-06-30' })), true);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
