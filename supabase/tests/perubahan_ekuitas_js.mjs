// Uji susunan laporan perubahan ekuitas (lib/finRatios.js equityChanges). Jalankan: node supabase/tests/perubahan_ekuitas_js.mjs
// Data A = keluaran nyata biz_financials dari supabase/tests/perubahan_ekuitas.sql (modal 50 jt + setor 10 jt, prive 3 jt, laba lama 3 jt, laba periode 6 jt).
import { equityChanges } from '../../lib/finRatios.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || Math.abs(Number(a) - Number(b)) < 0.01; pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };

const A = { neraca: { open: { ekuitas: 50000000, laba_ditahan: 3000000 }, close: { ekuitas: 57000000, laba_ditahan: 9000000 }, ekuitas_mutasi: [
  { id: 'm', code: '3-1000', name: 'Modal pemilik', open: 50000000, close: 60000000, kurang: 0, tambah: 10000000, sys_key: 'modal' },
  { id: 'p', code: '3-2000', name: 'Prive (diambil pemilik)', open: 0, close: -3000000, kurang: 3000000, tambah: 0, sys_key: 'prive' }] } };
const a = equityChanges(A);
eq('ekuitas awal 53 jt', a.open, 53e6);
eq('ekuitas akhir 66 jt', a.close, 66e6);
eq('akhir = neraca', a.sheet, 66e6);
eq('cocok', a.cocok, true);
eq('baris: setoran +10 jt', a.lines.find((l) => l[0] === 'setoran')[2], 10e6);
eq('baris: prive −3 jt', a.lines.find((l) => l[0] === 'prive')[2], -3e6);
eq('baris: laba periode +6 jt', a.lines.find((l) => l[0] === 'laba')[2], 6e6);
eq('komponen: laba ditahan awal 3 jt → akhir 9 jt', a.parts.find((p) => p.key === 'laba_ditahan').close, 9e6);

// rugi, akun ekuitas buatan sendiri, penarikan modal, saldo awal
const B = { neraca: { open: { ekuitas: 20e6, laba_ditahan: 0 }, close: { ekuitas: 23e6, laba_ditahan: -4e6 }, ekuitas_mutasi: [
  { id: 'm', name: 'Modal pemilik', sys_key: 'modal', open: 20e6, tambah: 0, kurang: 2e6, close: 18e6 },
  { id: 's', name: 'Ekuitas saldo awal', sys_key: 'saldo_awal', open: 0, tambah: 4e6, kurang: 0, close: 4e6 },
  { id: 'x', name: 'Cadangan umum', sys_key: null, open: 0, tambah: 1e6, kurang: 0, close: 1e6 }] } };
const b = equityChanges(B);
eq('rugi: label', b.lines.find((l) => l[0] === 'laba')[1], 'Rugi bersih periode');
eq('rugi: −4 jt', b.profit, -4e6);
eq('penarikan modal −2 jt', b.lines.find((l) => l[0] === 'tarik_modal')[2], -2e6);
eq('saldo awal +4 jt', b.lines.find((l) => l[0] === 'saldo_awal')[2], 4e6);
eq('akun lain memakai namanya', b.lines.find((l) => l[0] === 'akun:x')[1], 'Cadangan umum');
eq('akhir 19 jt = neraca 23 − 4', b.close, 19e6);
eq('cocok', b.cocok, true);

// tidak cocok bila neraca beda (mis. data rusak) → ditandai
eq('selisih terdeteksi', equityChanges({ neraca: { ...A.neraca, close: { ekuitas: 50e6, laba_ditahan: 9e6 } } }).cocok, false);
eq('tanpa neraca (paket tanpa laporan lanjutan) → null', equityChanges({ neraca: null }), null);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
