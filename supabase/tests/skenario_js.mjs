// Uji rumus lib/scenario.js (Tahap E). Jalankan: node supabase/tests/skenario_js.mjs
import { project, defaults, runStress, validate, occupancy, fieldsFor, baselineIssues } from '../../lib/scenario.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = Math.abs(Number(a) - Number(b)) < 0.01 || a === b; pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };

const toko = { jenis: 'retail', bulan_data: 3, pendapatan: 12e6, hpp: 7.2e6, beban_operasional: 2e6, penyusutan: 0, bunga: 0, pendapatan_lain: 0, beban_lain: 0, pajak: 0,
  kas: 10e6, piutang: 15e6, persediaan: 5e6, aset_lancar_lain: 0, utang_usaha: 4e6, kewajiban_lain: 1e6, pinjaman: 0, pinjaman_lancar: 0, pokok_bulanan: 0 };

const dasar = project(toko, { pendapatan: 0 });
eq('dasar: laba/bulan 2,8 jt', dasar.months[0].profit, 2.8e6);
eq('dasar: laba 12 bulan 33,6 jt', dasar.profit, 33.6e6);
eq('dasar: kas akhir 43,6 jt', dasar.cashEnd, 43.6e6);
eq('dasar: rasio lancar akhir (43,6+15+5)/5', dasar.ratioEnd, 12.72);
eq('dasar: status aman', dasar.status, 'aman');

const pes = project(toko, { pendapatan: -15, margin_pp: -2, biaya: 5, piutang_hari: 15 });
eq('pesimis: pendapatan 10,2 jt', pes.months[0].rev, 10.2e6);
eq('pesimis: HPP 62% = 6,324 jt', pes.months[0].hpp, 6.324e6);
eq('pesimis: laba/bulan 1,776 jt', pes.months[0].profit, 1.776e6);
eq('pesimis: kas bulan 1 = 10 + 1,776 − kenaikan piutang 2,85', pes.months[0].cash, 8.926e6);
eq('pesimis: kas akhir', pes.cashEnd, 8.926e6 + 11 * 1.776e6);
eq('pesimis: kas terendah bulan 1', pes.cashMinMonth, 1);
eq('pesimis: waspada (kas terendah < biaya tunai sebulan 9,2 jt)', pes.status, 'waspada');

const shock = project(toko, { kejutan: 20e6, kejutan_bulan: 2 });
eq('kejutan: kas negatif di bulan 2', shock.negMonth, 2);
eq('kejutan: kebutuhan dana = −kas terendah', shock.need, -(10e6 + 2.8e6 + 2.8e6 - 20e6));
eq('kejutan: status bahaya', shock.status, 'bahaya');

// pinjaman & bunga
const utang = { ...toko, bunga: 100000, pinjaman: 12e6, pinjaman_lancar: 6e6, pokok_bulanan: 1e6 };
const naik = project(utang, { bunga_pp: 6 });
eq('bunga: bulan 1 = 100rb + 12 jt × 6% ÷ 12', naik.months[0].interest, 160000);
eq('bunga: bulan 2 dari sisa 11 jt', naik.months[1].interest, 155000);
eq('pokok berhenti setelah lunas (bulan 12 = 1 jt, total 12 jt)', naik.months.reduce((t, m) => t + m.principal, 0), 12e6);

// kos: hunian
const kos = { ...toko, jenis: 'properti', hpp: 0, piutang: 0, hunian: { kamar: 10, terisi: 8 } };
eq('kos: hunian sekarang 80%', occupancy(kos), 80);
eq('kos: hunian 60% → pendapatan × 0,75', project(kos, { hunian: 60 }).months[0].rev, 9e6);
eq('kos: tidak ada variabel margin', fieldsFor('properti').some((f) => f.key === 'margin_pp'), false);
eq('kos: bawaan pesimis hunian 65%', defaults(kos)[0].hunian, 65);

// jasa: pesanan × nilai
const jasa = { ...toko, jenis: 'jasa' };
eq('jasa: pesanan +20% & nilai −10% → 12 × 1,2 × 0,9', project(jasa, { pesanan: 20, pendapatan: -10 }).months[0].rev, 12.96e6);

// stress test
const st = runStress(toko, defaults(toko)[1]);
eq('stress toko: 7 uji', st.length, 7);
eq('stress turun30: pendapatan 8,4 jt', st.find((s) => s.code === 'turun30').result.months[0].rev, 8.4e6);
eq('stress kejutan = 3 × 2 jt', st.find((s) => s.code === 'kejutan').result.months[0].shock, 6e6);
eq('stress kos punya uji hunian', runStress(kos, defaults(kos)[1]).some((s) => s.code === 'hunian20'), true);

eq('validasi: pendapatan −150 ditolak', validate({ pendapatan: -150 }) != null, true);
eq('validasi: bulan 13 ditolak', validate({ kejutan_bulan: 13 }) != null, true);
eq('validasi: wajar lolos', validate({ pendapatan: 10, biaya: -5 }), null);
eq('data kosong: ada peringatan', baselineIssues({ bulan_data: 0 }).length > 0, true);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
