// Uji logika murni Rekap Bisnis (lib/recap.js): node supabase/tests/rekap_js.mjs  → semua baris "OK", keluar 0.
import assert from 'node:assert/strict';
import { periodOf, shiftPeriod, compareOf, seriesOf, derive, statusOf, sectionsFor, orderedSections, recapChanges, exportSheets, pct } from '../../lib/recap.js';

let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };
const today = '2026-11-27'; // Jumat

t('periode harian/mingguan/bulanan/kuartalan/tahunan memuat tanggal acuan', () => {
  assert.deepEqual([periodOf('harian', today, today).from, periodOf('harian', today, today).to], ['2026-11-27', '2026-11-27']);
  const w = periodOf('mingguan', today, today); assert.equal(w.from, '2026-11-23'); assert.equal(w.end, '2026-11-29'); assert.equal(w.to, today); assert.equal(w.running, true);
  const m = periodOf('bulanan', today, today); assert.equal(m.from, '2026-11-01'); assert.equal(m.end, '2026-11-30'); assert.equal(m.label, 'November 2026');
  const q = periodOf('kuartalan', '2026-08-15', today); assert.equal(q.from, '2026-07-01'); assert.equal(q.end, '2026-09-30'); assert.equal(q.running, false); assert.equal(q.label, 'Kuartal 3 2026');
  const y = periodOf('tahunan', today, today); assert.equal(y.from, '2026-01-01'); assert.equal(y.to, today);
  const k = periodOf('kustom', today, today, { from: '2026-11-10', to: '2026-12-31' }); assert.equal(k.to, today);
  const kr = periodOf('kustom', today, today, { from: '2026-11-20', to: '2026-11-05' }); assert.equal(kr.from, '2026-11-05');
});
t('geser periode tidak melewati hari ini; kabisat & akhir bulan aman', () => {
  assert.equal(shiftPeriod(periodOf('bulanan', today, today), 1, today), null);
  assert.equal(shiftPeriod(periodOf('bulanan', today, today), -1, today).anchor, '2026-10-01');
  assert.equal(shiftPeriod(periodOf('harian', today, today), -1, today).anchor, '2026-11-26');
  assert.equal(shiftPeriod(periodOf('mingguan', today, today), -1, today).anchor, '2026-11-16');
  assert.equal(periodOf('bulanan', '2024-02-10', today).end, '2024-02-29');
  const k = shiftPeriod(periodOf('kustom', today, today, { from: '2026-11-01', to: '2026-11-10' }), -1, today);
  assert.deepEqual(k.custom, { from: '2026-10-22', to: '2026-10-31' });
});
t('pembanding sepadan: periode berjalan dibanding hari yang sama', () => {
  const c = compareOf(periodOf('bulanan', today, today), 'prev'); assert.deepEqual([c.from, c.to], ['2026-10-01', '2026-10-27']);
  const c2 = compareOf(periodOf('bulanan', '2026-10-05', today), 'prev'); assert.deepEqual([c2.from, c2.to], ['2026-09-01', '2026-09-30']);
  const c3 = compareOf(periodOf('bulanan', '2026-03-31', today), 'prev'); assert.deepEqual([c3.from, c3.to], ['2026-02-01', '2026-02-28']);
  const y = compareOf(periodOf('tahunan', today, today), 'yoy'); assert.deepEqual([y.from, y.to], ['2025-01-01', '2025-11-27']);
  assert.equal(compareOf(periodOf('harian', today, today), 'none'), null);
  const leap = compareOf(periodOf('bulanan', '2025-02-01', today), 'yoy');
  assert.deepEqual([leap.from, leap.to], ['2024-02-01', '2024-02-29']);
  const future = periodOf('kustom', today, today, { from: '2027-01-01', to: '2028-12-31' });
  assert.equal(future.from, today); assert.equal(future.to, today);
  const invalid = periodOf('kustom', today, today, { from: '2026-11-31' });
  assert.equal(invalid.from, '2026-11-01');
  const w = compareOf(periodOf('mingguan', today, today), 'prev'); assert.deepEqual([w.from, w.to], ['2026-11-16', '2026-11-20']);
});
t('seri historis = N periode terakhir, berakhir di periode ini', () => {
  const s = seriesOf(periodOf('bulanan', today, today), today); assert.equal(s.length, 6); assert.equal(s[5].from, '2026-11-01'); assert.equal(s[5].to, today); assert.equal(s[0].from, '2026-06-01');
  assert.equal(seriesOf(periodOf('kustom', today, today), today).length, 0);
});

// Data contoh berbentuk keluaran biz_recap_core (angka uji, bukan data nyata)
const akun = [
  { name: 'Kas', type: 'aset', sys: 'kas', kelas: 'kas', open: 1000, dr: 5000, cr: 2000 },
  { name: 'Bank', type: 'aset', sys: 'bank', kelas: 'kas', open: 0, dr: 300, cr: 0 },
  { name: 'Piutang', type: 'aset', sys: 'piutang', kelas: 'piutang', open: 200, dr: 100, cr: 250 },
  { name: 'Persediaan', type: 'aset', sys: 'persediaan', kelas: 'persediaan', open: 500, dr: 400, cr: 300 },
  { name: 'Utang', type: 'kewajiban', sys: 'utang', kelas: 'utang_usaha', open: -400, dr: 100, cr: 400 },
  { name: 'PPN keluaran', type: 'kewajiban', sys: 'ppn_keluaran', kelas: 'kewajiban_lain', open: 0, dr: 0, cr: 50 },
  { name: 'Modal', type: 'ekuitas', sys: 'modal', kelas: 'ekuitas', open: -1300, dr: 0, cr: 600 },
  { name: 'Prive', type: 'ekuitas', sys: 'prive', kelas: 'ekuitas', open: 0, dr: 200, cr: 0 },
  { name: 'Penjualan', type: 'pendapatan', sys: 'penjualan', kelas: 'pendapatan_usaha', open: 0, dr: 0, cr: 4000 },
  { name: 'HPP', type: 'beban', sys: 'hpp', kelas: 'hpp', open: 0, dr: 300, cr: 0 },
  { name: 'Beban', type: 'beban', sys: 'beban_operasional', kelas: 'beban_operasional', open: 0, dr: 1200, cr: 0 },
];
// seimbang: Σ(open+dr−cr) = 0 ?
const cur = { jenis: 'retail', ringkas: { pendapatan: 4000, hpp: 300, biaya: 1200, laba: 2500, transaksi: 10 }, kelas: { pendapatan_usaha: 4000, hpp: 300, beban_operasional: 1200 },
  akun, kas: { masuk: 5100, keluar: 1800, buckets: [] }, setor_pajak: 0,
  persediaan: { awal: { qty: 10, nilai: 500 }, akhir: { qty: 12, nilai: 600 }, jenis: [{ kind: 'beli', qty: 8, nilai: 400 }, { kind: 'jual', qty: -5, nilai: -250 }, { kind: 'rusak', qty: -1, nilai: -50 }] },
  penjualan: { trx: 10, omzet: 4000, kategori: [], produk: [] }, pengeluaran: { n: 2, kategori: [] }, pelanggan: { aktif: 3, terdaftar: 5 }, tren: [] };

t('derive: kas, piutang, utang, persediaan, pajak, modal konsisten', () => {
  const sum = akun.reduce((s, a) => s + a.open + a.dr - a.cr, 0); assert.equal(sum, 0);
  const d = derive(cur);
  assert.equal(d.kas.awal, 1000); assert.equal(d.kas.akhir, 4300); assert.equal(d.kas.masuk, 5100); assert.equal(d.kas.keluar, 1800); assert.equal(d.kas.cocok, true);
  assert.deepEqual([d.piutang.awal, d.piutang.tambah, d.piutang.kurang, d.piutang.akhir], [200, 100, 250, 50]);
  assert.deepEqual([d.utang.awal, d.utang.tambah, d.utang.kurang, d.utang.akhir], [400, 400, 100, 700]);
  assert.equal(d.stok.awal + d.stok.masuk + d.stok.keluar + d.stok.penyesuaian, d.stok.akhir); assert.equal(d.stok.cocok, true); assert.equal(d.stok.buku, 600);
  assert.equal(d.pajak.ppn_keluaran, 50); assert.equal(d.pajak.kewajiban_akhir, 50); assert.equal(d.pajak.ada, true);
  assert.equal(d.modal.setoran, 600); assert.equal(d.modal.prive, 200); assert.equal(d.modal.laba, 2500);
  assert.equal(Math.round(d.modal.awal + d.modal.setoran - d.modal.prive + d.modal.laba + d.modal.lain), Math.round(d.modal.akhir));
  assert.equal(d.modal.lain, 0); assert.equal(d.seimbang, true);
  assert.equal(d.profit.laba_kotor, 3700); assert.equal(Math.round(d.profit.margin * 10) / 10, 62.5); assert.equal(d.profit.rata, 400);
});
t('status: berjalan, ditutup, belum direkonsiliasi, data belum lengkap', () => {
  assert.equal(statusOf({ berjalan: true, bulan: [] }, {}).main[0], 'berjalan');
  assert.equal(statusOf({ berjalan: false, ditutup: true, bulan: [] }, {}).main[0], 'ditutup');
  const s = statusOf({ berjalan: false, ditutup: false, direkonsiliasi: false, hari_jual: 5, hari_ditutup: 3, bulan: [{ rekon: 'belum' }] }, { tanpa_modal: 2 });
  assert.equal(s.main[0], 'belum'); assert.equal(s.hariBelum, 2); assert.equal(s.rekonBelum, 1); assert.equal(s.data[0], 'belum_lengkap'); assert.equal(s.flags.length, 1);
  assert.equal(statusOf({ berjalan: false, ditutup: true, bulan: [] }, {}, true).data[0], 'lengkap');
  assert.equal(statusOf({ berjalan: false, ditutup: true, bulan: [] }, null, true).data[0], 'tidak_tercatat');
  assert.equal(statusOf({ berjalan: true, bulan: [{ rekon: 'draf' }] }, { tanpa_modal: 1 }).bank, '1 bulan belum selesai');
});
t('bagian menyesuaikan jenis bisnis (tanpa indikator yang tidak relevan)', () => {
  const keys = (c) => sectionsFor(c, derive(c)).map((s) => s[0]);
  const r = keys(cur);
  assert.deepEqual(orderedSections(sectionsFor(cur, derive(cur)), 'retail').slice(0, 3), ['penjualan', 'persediaan', 'laba']);
  assert.ok(r.includes('penjualan') && r.includes('persediaan') && r.includes('utang') && r.includes('pajak') && !r.includes('sewa') && !r.includes('pesanan'));
  const kos = { jenis: 'properti', ringkas: {}, akun: [], kelas: {}, kas: {}, sewa: {}, operasional: {}, pelanggan: { aktif: 0, terdaftar: 0 } };
  const k = keys(kos);
  assert.ok(k.includes('sewa') && !k.includes('penjualan') && !k.includes('persediaan') && !k.includes('pelanggan') && !k.includes('pajak') && !k.includes('utang'));
  const jasa = keys({ jenis: 'jasa', ringkas: {}, akun: [], kelas: {}, kas: {}, operasional: { kuliner: true }, layanan: [] });
  assert.ok(jasa.includes('pesanan') && !jasa.includes('penjualan'));
});
t('ekspor: lembar ringkasan memuat pembanding & persentase', () => {
  const d = { cur, seri: [{ from: '2026-10-01', to: '2026-10-31', v: { pendapatan: 1, hpp: 0, biaya: 0, laba: 1, transaksi: 1 } }] };
  const sh = exportSheets(d, derive(cur), derive({ ...cur, ringkas: { ...cur.ringkas, pendapatan: 2000 } }), { periodLabel: 'November 2026', cmpLabel: 'bulan lalu', status: 'Aktual' });
  const r = sh[0].rows.find((x) => x[0] === 'Total pendapatan'); assert.deepEqual(r, ['Total pendapatan', 4000, 2000, 2000, 100]);
  assert.ok(sh.some((s) => s.name === 'Persediaan') && sh.some((s) => s.name === 'Antarperiode') && sh.some((s) => s.name === 'Penjualan'));
  sh.forEach((s) => s.rows.forEach((row) => assert.equal(row.length, s.cols.length, s.name)));
  assert.equal(pct(5, 0), null);
  const zero = exportSheets(d, derive(cur), derive({ ringkas: {} }), { version: 2, location: 'Cabang B', createdAt: '27 November 2026 09.00' })[0].rows;
  assert.deepEqual(zero.find(([k]) => k === 'Total pendapatan'), ['Total pendapatan', 4000, 0, 4000, null]);
  assert.equal(zero.find(([k]) => k === 'Versi arsip')[1], 'Versi 2');
  assert.equal(zero.find(([k]) => k === 'Lokasi')[1], 'Cabang B');
});
t('koreksi versi: laba kotor dan bersih dihitung dari versi masing-masing', () => {
  const rows = recapChanges({ pendapatan: 100, hpp: 30, biaya: 20, laba: 50 }, { pendapatan: 100, hpp: 0, biaya: 20, laba: 80 });
  assert.equal(rows.find(({ key }) => key === 'laba_kotor').change, -30);
  assert.equal(rows.find(({ key }) => key === 'laba').change, -30);
  assert.equal(rows.find(({ key }) => key === 'hpp').percent, null);
  assert.deepEqual(recapChanges({}, null), []);
});
console.log(`\n${ok} uji lulus`);
