// Uji rumus lib/valuation.js (Tahap G). Dasar = keluaran valuation_basis dari supabase/tests/valuasi_multiple_aset.sql
// (6 bulan: pendapatan 60 jt, HPP 36 jt, biaya 6 jt → laba 18 jt; kas 204 jt; laba ditahan 68 jt). Jalankan: node supabase/tests/valuasi_js.mjs
import { basisFigures, multipleValuation, assetValuation, summaryRange, validateMultiple } from '../../lib/valuation.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.5); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };

const B = { bulan_data: 6, laba_rugi: { pendapatan_usaha: 60e6, hpp: 36e6, beban_operasional: 6e6 }, neraca: { kas: 204e6, persediaan: -36e6, ekuitas: 100e6 }, laba_ditahan: 68e6, aset_tetap: [] };
const f = basisFigures(B);
eq('disetahunkan dari 6 bulan', f.annualized, true);
eq('pendapatan setahun 120 jt', f.pendapatan, 120e6);
eq('EBITDA setahun 36 jt', f.ebitda, 36e6);
eq('laba bersih setahun 36 jt', f.laba_bersih, 36e6);
eq('ekuitas neraca 168 jt', f.equity, 168e6);

const pe = multipleValuation(B, { basis: 'laba_bersih', low: 2, mid: 3, high: 4 });
eq('P/E 3× → ekuitas 108 jt', pe.mid.equity, 108e6);
eq('P/E: nilai usaha = ekuitas + utang bersih (−204 jt kas)', pe.mid.ev, 108e6 - 204e6);
const ev = multipleValuation(B, { basis: 'ebitda', low: 2, mid: 3, high: 4 });
eq('EV/EBITDA 3× → nilai usaha 108 jt', ev.mid.ev, 108e6);
eq('EV/EBITDA: ekuitas = EV − pinjaman + kas = 312 jt', ev.mid.equity, 312e6);
const B2 = { ...B, neraca: { kas: 20e6, pinjaman: 50e6, ekuitas: 100e6 } };
eq('dengan pinjaman 50 jt & kas 20 jt: ekuitas = 108 − 30 = 78 jt', multipleValuation(B2, { basis: 'ebitda', low: 3, mid: 3, high: 3 }).mid.equity, 78e6);
eq('rugi → tidak dihitung + alasan', Boolean(multipleValuation({ ...B, laba_rugi: { pendapatan_usaha: 10e6, beban_operasional: 20e6 } }, { basis: 'laba_bersih', low: 1, mid: 2, high: 3 }).reason), true);
eq('tanpa data → alasan', Boolean(multipleValuation({ bulan_data: 0 }, { basis: 'pendapatan', low: 1, mid: 1, high: 1 }).reason), true);

// aset: kas 10, piutang 20, persediaan 30, aset tetap 40 (daftar: mobil buku 30 → pasar 25; 10 di luar daftar), utang 15
const A = { bulan_data: 12, laba_rugi: {}, neraca: { kas: 10e6, piutang: 20e6, persediaan: 30e6, aset_tetap: 40e6, utang_usaha: 15e6, ekuitas: 85e6 }, laba_ditahan: 0,
  aset_tetap: [{ id: 'a1', name: 'Mobil', book: 30e6 }] };
const av = assetValuation(A, { inv_pct: 50, ar_pct: 90, assets: [{ id: 'a1', market: 25e6 }], other_adj: -1e6 });
eq('nilai buku ekuitas 85 jt', av.book, 85e6);
eq('disesuaikan: 10 + 18 + 15 + (25 + 10) − 1 − 15 = 62 jt', av.adjusted, 62e6);
eq('aset tetap di luar daftar tetap nilai buku 10 jt', av.fixedOther, 10e6);
eq('tanpa penyesuaian = nilai buku', assetValuation(A, {}).adjusted, 85e6);
eq('rentang gabungan min', summaryRange(multipleValuation(B, { basis: 'laba_bersih', low: 2, mid: 3, high: 4 }), assetValuation(B, {})).min, 72e6);
eq('rentang gabungan max', summaryRange(multipleValuation(B, { basis: 'laba_bersih', low: 2, mid: 3, high: 4 }), assetValuation(B, {})).max, 168e6);
eq('validasi: sumber wajib', validateMultiple({ basis: 'ebitda', low: 1, mid: 2, high: 3, source: '' }) != null, true);
eq('validasi: urutan', validateMultiple({ basis: 'ebitda', low: 3, mid: 2, high: 4, source: 'Konsultan' }) != null, true);
eq('validasi: lolos', validateMultiple({ basis: 'ebitda', low: 1, mid: 2, high: 3, source: 'Konsultan' }), null);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
