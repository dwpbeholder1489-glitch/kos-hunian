// Uji rumus lib/consolidation.js (Tahap I) dengan keluaran NYATA consol_report (supabase/tests/data/consol_report.json dari konsolidasi.sql):
// Toko A (100%) jual 7 jt (5 jt ke Warung B milik 60%, harga pokok 3 jt; 2 jt ke luar, harga pokok 1 jt). B beli 5 jt utang. Eliminasi manual pinjaman 2 jt.
// Jalankan: node supabase/tests/konsolidasi_js.mjs
import { readFileSync } from 'node:fs';
import { consolidate } from '../../lib/consolidation.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.5); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const rep = JSON.parse(readFileSync(new URL('./data/consol_report.json', import.meta.url), 'utf8'));
const row = (c, k) => [...c.pl, ...c.bs].find((r) => r.key === k);

const c0 = consolidate(rep, 0); // barang dari A masih di gudang B
eq('pendapatan gabungan = penjualan ke luar 2 jt', row(c0, 'pendapatan_usaha').total, 2e6);
eq('HPP gabungan = harga pokok penjualan ke luar 1 jt', row(c0, 'hpp').total, 1e6);
eq('laba gabungan 1 jt (laba A atas barang di gudang B belum terjadi)', c0.netIncome, 1e6);
eq('laba belum terjadi 2 jt', c0.unrealized, 2e6);
eq('persediaan gabungan = −4 + 5 − 2 = −1 jt (barang di B dinilai harga pokok A)', row(c0, 'persediaan').total, -1e6);
eq('laba ditahan gabungan = 3 − 2 = 1 jt', row(c0, 'laba_ditahan').total, 1e6);
eq('piutang A ke B dieliminasi', row(c0, 'piutang').total, 0);
eq('utang B ke A dieliminasi', row(c0, 'utang_usaha').total, 0);
eq('eliminasi manual pinjaman mengurangi pinjaman', row(c0, 'pinjaman').elim, -2e6);
eq('neraca gabungan seimbang', c0.balanced, true);
eq('3 baris eliminasi (penjualan, piutang-utang, manual)', c0.items.length, 3);
eq('tanpa selisih piutang-utang', c0.gaps.length, 0);

const c1 = consolidate(rep, 100); // barang sudah dijual lagi oleh B
eq('100% terjual: HPP −5 jt penuh', row(c1, 'hpp').elim, -5e6);
eq('100% terjual: persediaan tidak dikoreksi', row(c1, 'persediaan').elim, 0);
eq('100% terjual: tetap seimbang', c1.balanced, true);
eq('50%: laba belum terjadi 1 jt', consolidate(rep, 50).unrealized, 1e6);
eq('50%: tetap seimbang', consolidate(rep, 50).balanced, true);

// Kepentingan nonpengendali: B 60% dengan laba 1 jt & ekuitas 10 jt
const nci = { members: [{ kos_id: 'a', name: 'A', pct: 100, fin: { laba_rugi: { pendapatan_usaha: 5e6, hpp: 2e6 }, close: { kas: 30e6, ekuitas: 27e6, laba_ditahan: 3e6 } } },
  { kos_id: 'b', name: 'B', pct: 60, fin: { laba_rugi: { pendapatan_usaha: 3e6, beban_operasional: 2e6 }, close: { kas: 10e6, ekuitas: 9e6, laba_ditahan: 1e6 } } }] };
const cn = consolidate(nci);
eq('laba gabungan 4 jt', cn.netIncome, 4e6);
eq('bagian nonpengendali atas laba = 40% × 1 jt', cn.nciProfit, 0.4e6);
eq('laba milik pemilik = 3,6 jt', cn.ownerProfit, 3.6e6);
eq('ekuitas nonpengendali = 40% × 10 jt', cn.nciEquity, 4e6);
eq('ekuitas milik pemilik = 40 − 4 = 36 jt', cn.ownerEquity, 36e6);
// selisih piutang ≠ utang dilaporkan
eq('selisih piutang/utang dilaporkan', consolidate({ ...rep, auto_arap: [{ creditor: rep.members[0].kos_id, debtor: rep.members[1].kos_id, piutang: 5e6, utang: 4e6 }] }).gaps[0].selisih, 1e6);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
