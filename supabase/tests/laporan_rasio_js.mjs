// Uji lib/finRatios.js: node supabase/tests/laporan_rasio_js.mjs → semua "OK".
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const f = tmpdir() + '/finRatios_test.mjs';
writeFileSync(f, readFileSync(new URL('../../lib/finRatios.js', import.meta.url), 'utf8'));
const R = await import(f);
let bad = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) bad++; console.log(`${ok ? 'OK' : 'GAGAL'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`}`); };
const cur = { pendapatan_usaha: 1000, retur: -100, hpp: 540, beban_operasional: 200, penyusutan: 20, pendapatan_lain: 10, beban_lain: 5 };
const s = R.incomeStatement(cur);
eq('pendapatan bersih', s.net, 900); eq('laba kotor', s.gp, 360); eq('EBITDA', s.ebitda, 160); eq('EBIT', s.ebit, 140); eq('laba bersih', s.netIncome, 145);
eq('laba bersih = Σpendapatan − Σbeban', s.netIncome, 1000 - 100 + 10 - 540 - 200 - 20 - 5);
const fin = { hari: 30, laba_rugi: { cur }, neraca: {
  open: { kas: 400, piutang: 100, persediaan: 300, aset_tetap: 200, utang_usaha: 150, pinjaman: 0, ekuitas: 700, laba_ditahan: 150 },
  close: { kas: 500, piutang: 100, persediaan: 300, aset_tetap: 180, utang_usaha: 250, kewajiban_lain: 0, pinjaman: 100, ekuitas: 400, laba_ditahan: 330 } } };
const b = R.balanceSheet(fin.neraca.close);
eq('neraca seimbang', b.assets, b.liabilities + b.equity);
const r = Object.fromEntries(R.ratios(fin).map((x) => [x.key, x]));
eq('margin kotor 40%', r.gpm.value, 40); eq('rasio lancar 900/250', r.cr.value, 3.6); eq('rasio cepat', r.qr.value, 2.4);
eq('modal kerja', r.wc.value, 650); eq('D/E 350/730', r.de.value, 0.48); eq('ROIC tidak dihitung', r.roic.value, null);
eq('cakupan bunga tidak dihitung', r.icr.value, null); eq('perputaran persediaan 540/300', r.it.value, 1.8);
const r0 = Object.fromEntries(R.ratios({ hari: 30, laba_rugi: { cur: {} }, neraca: { open: {}, close: {} } }).map((x) => [x.key, x]));
eq('tanpa pendapatan → margin null', r0.gpm.value, null); eq('tanpa kewajiban lancar → rasio lancar null', r0.cr.value, null);
const neg = Object.fromEntries(R.ratios({ ...fin, neraca: { open: { ...fin.neraca.open, ekuitas: -2000 }, close: { ...fin.neraca.close, ekuitas: -2000 } } }).map((x) => [x.key, x]));
eq('ekuitas negatif → ROE & D/E null', [neg.roe.value, neg.de.value], [null, null]);
console.log(bad ? `${bad} GAGAL` : 'SEMUA LULUS');
