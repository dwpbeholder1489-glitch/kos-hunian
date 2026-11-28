// Uji rumus lib/profitability.js dengan keluaran NYATA profit_analysis (supabase/tests/data/profit_analysis.json dari profitabilitas.sql).
// Data: pendapatan 161.000 − retur 10.000 = 151.000; HPP 102.000; beban operasional 31.000 (sewa 20.000 TETAP + listrik 5.000 + rusak 6.000).
// Jalankan: node supabase/tests/profitabilitas_js.mjs
import { readFileSync } from 'node:fs';
import { summary, breakEven, products, categories, leakage, opportunities, costs, drivers, dataIssues, recommendations, sectionStatus, projection, services, rooms, branches } from '../../lib/profitability.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.5); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const near = (name, a, b, eps = 1e-4) => { const pass = Math.abs(a - b) < eps; pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const d = JSON.parse(readFileSync(new URL('./data/profit_analysis.json', import.meta.url), 'utf8'));

const s = summary(d.cur);
eq('pendapatan bersih = 161.000 − 10.000', s.net, 151000);
eq('laba kotor = 151.000 − 102.000', s.gp, 49000);
eq('laba bersih = 49.000 − 31.000 (= laba jurnal)', s.netIncome, 18000);
eq('laba bersih sama dengan biz_figures_total', s.netIncome, Number(d.cur.laba));
near('margin kotor 32,45%', s.grossMargin, 49000 / 151000);

const be = breakEven(d.cur);
eq('biaya tetap = sewa 20.000', be.fixed, 20000);
eq('biaya variabel = 133.000 − 20.000', be.variable, 113000);
near('rasio margin kontribusi', be.cmr, 38000 / 151000);
eq('BEP = 20.000 ÷ (38.000/151.000)', be.bep, 20000 / (38000 / 151000));
eq('status BEP sehat (margin keamanan ≥ 20%)', be.status, 'sehat');
eq('tanpa biaya tetap → data belum cukup', breakEven({ ...d.cur, tetap: 0 }).status, 'data');
eq('biaya variabel ≥ pendapatan → risiko', breakEven({ pendapatan_usaha: 100, hpp: 120, beban_operasional: 10, tetap: 10 }).status, 'risiko');

const pr = products(d);
eq('produk teratas = Beras A', pr.rows[0].name, 'Beras A');
eq('laba Beras A 51.000', pr.rows[0].laba, 51000);
eq('Minyak B rugi → risiko', pr.rows.find((x) => x.name === 'Minyak B').status, 'risiko');
eq('kategori: satu kelompok Tanpa kategori', categories(pr).length, 1);

const lk = leakage(d);
eq('kebocoran aktual = diskon 5.000 + bawah modal 2.000 + rusak 6.000 + laci 3.000', lk.actual, 16000);
eq('retur & batal = info (tidak dijumlah)', lk.items.filter((x) => x.kind === 'info').length >= 2, true);
eq('kebocoran 10,6% → risiko', lk.status, 'risiko');

const op = opportunities(d);
const st = op.list.find((x) => x.key === 'stok_habis');
eq('stok habis: Beras A 10 hari', st.items[0].days, 10);
eq('laba hilang = 10 × (14/21) × (51.000/14)', st.value, 10 * (14 / 21) * (51000 / 14));
const cash = op.list.find((x) => x.key === 'kas_menganggur');
eq('kas menganggur = rata-rata saldo − 1 bulan uang keluar', cash.idle, 116225.81 - 35000 * 30 / 31);
eq('imbal hasil kas pada 6%/tahun', cash.value, (116225.81 - 35000 * 30 / 31) * 0.06 * 31 / 365);
eq('tanpa bunga acuan → tidak dihitung', opportunities({ ...d, opp_rate: null }).list.find((x) => x.key === 'kas_menganggur').value, null);
eq('peluang adaptif: toko tanpa kamar kosong', op.list.some((x) => x.key === 'kamar_kosong'), false);

const ct = costs(d);
eq('struktur biaya total = HPP + operasional', ct.total, 133000);
near('porsi biaya tetap', ct.fixedShare, 20000 / 133000);

const rec = recommendations(d);
eq('rekomendasi pertama tingkat risiko', rec[0].level, 'risiko');
eq('ada rekomendasi produk rugi', rec.some((x) => /produk rugi/.test(x.title)), true);
eq('setiap rekomendasi berisi angka bukti', rec.every((x) => /\d/.test(x.text)), true);
eq('status bagian: kebocoran risiko', sectionStatus(d).bocor, 'risiko');
eq('periode selesai → tanpa proyeksi', projection(d), null);
const pj = projection({ ...d, hari: 30, hari_berjalan: 15 });
eq('proyeksi: pendapatan × 2', pj.net, 302000);
eq('proyeksi: biaya tetap tidak dikalikan', pj.profitOp, 302000 - 2 * 113000 - 20000);
eq('data: tanpa masalah modal', dataIssues(d).some((x) => x.code === 'tanpa_modal'), false);
eq('data: < 5 transaksi ditandai', dataIssues(d).some((x) => x.code === 'sedikit'), true);
eq('pendorong omzet: pembanding kosong → tanpa dekomposisi', drivers(d).parts.length, 0);
const dr = drivers({ ...d, cmp: { pendapatan_usaha: 100000, transaksi: 2 } });
eq('efek volume = (3 − 2) × 50.000', dr.parts[0].effect, 50000);
eq('efek nilai = 3 × (50.333 − 50.000)', dr.parts[1].effect, 3 * (151000 / 3 - 50000));
eq('volume + nilai = selisih pendapatan', dr.parts[0].effect + dr.parts[1].effect, dr.change);

// Jenis lain
const sv = services({ layanan: [{ nama: 'Cuci kiloan', omzet: 100000, bahan: 30000, baris: 2, beresep: 2 }, { nama: 'Setrika', omzet: 50000, bahan: null, baris: 1, beresep: 0 }] });
eq('layanan dengan resep: laba 70.000', sv.rows[0].laba, 70000);
eq('layanan tanpa resep: laba tidak ditebak', sv.rows[1].laba, null);
const rm = rooms({ kamar: [{ nama: 'A1', tarif: 1500000, masuk: 1500000, hari_terisi: 30, hari: 30 }, { nama: 'A2', tarif: 1500000, masuk: 0, hari_terisi: 0, hari: 30 }] });
near('hunian 50%', rm.occupancy, 0.5);
const kos = opportunities({ jenis: 'properti', cur: {}, peluang: { kamar_kosong: [{ nama: 'A2', tarif: 1500000, hari_kosong: 30 }] } });
eq('kamar kosong 30 hari = 1.500.000', kos.list.find((x) => x.key === 'kamar_kosong').value, 1500000);
const br = branches({ cur: { pendapatan_usaha: 300, hpp: 100, beban_operasional: 50 }, cabang: [{ id: 'a', nama: 'Utama', v: { pendapatan_usaha: 200, hpp: 60, beban_operasional: 20 } }, { id: 'b', nama: 'Cabang', v: { pendapatan_usaha: 100, hpp: 40, beban_operasional: 10 } }] });
eq('biaya bersama tanpa lokasi = 50 − 30', br.find((x) => x.id === null).opex, 20);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
