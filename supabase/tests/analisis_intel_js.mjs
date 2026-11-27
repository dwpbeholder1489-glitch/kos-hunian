// Uji logika Analisis Bisnis (lib/bizIntel.js): node supabase/tests/analisis_intel_js.mjs → semua baris "OK", tanpa "GAGAL".
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const f = tmpdir() + '/bizIntel_test.mjs';
writeFileSync(f, readFileSync(new URL('../../lib/bizIntel.js', import.meta.url), 'utf8'));
const B = await import(f);
let bad = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) bad++; console.log(`${ok ? 'OK' : 'GAGAL'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`}`); };
// Periode
eq('bulan ini', B.presetRange('bulan', '2026-11-27'), { from: '2026-11-01', to: '2026-11-27' });
eq('pembanding bulan berjalan = hari yang sama bulan lalu', B.compareRange({ from: '2026-11-01', to: '2026-11-27' }, 'prev', 'bulan'), { from: '2026-10-01', to: '2026-10-27' });
eq('pembanding bulan penuh', B.compareRange({ from: '2026-10-01', to: '2026-10-31' }, 'prev', 'bulan_lalu'), { from: '2026-09-01', to: '2026-09-30' });
eq('31 Mar → 28 Feb', B.compareRange({ from: '2026-03-01', to: '2026-03-31' }, 'prev', 'bulan_lalu'), { from: '2026-02-01', to: '2026-02-28' });
eq('minggu ini (Jumat)', B.presetRange('minggu', '2026-11-27'), { from: '2026-11-23', to: '2026-11-27' });
eq('pembanding minggu', B.compareRange({ from: '2026-11-23', to: '2026-11-27' }, 'prev', 'minggu'), { from: '2026-11-18', to: '2026-11-22' });
eq('kuartal', B.presetRange('kuartal', '2026-11-27'), { from: '2026-10-01', to: '2026-11-27' });
eq('tahun lalu', B.compareRange({ from: '2026-01-01', to: '2026-11-27' }, 'yoy', 'tahun'), { from: '2025-01-01', to: '2025-11-27' });
eq('kustom tidak lewat hari ini', B.presetRange('kustom', '2026-11-27', { from: '2026-11-10', to: '2026-12-31' }), { from: '2026-11-10', to: '2026-11-27' });
eq('batas Dasar', B.dasarFloor('2026-11-27'), '2026-10-01');
// Skor kesehatan
const d = { jenis: 'retail', cur: { pendapatan: 50000000, hpp: 40000000, biaya: 5800000, laba: 4200000, transaksi: 1248 },
  cmp: { pendapatan: 44326241, hpp: 35800000, biaya: 5200000, laba: 3326241, transaksi: 1100 }, cmp_from: '2026-10-01',
  posisi: { kas: 30000000, kas_keluar_90: 45000000, hari_data: 400 }, piutang_lewat: { nilai: 0, dokumen: 0 } };
const h = B.healthScore(d, {});
eq('komponen profit (margin 8,4% → 53)', h.components.find((c) => c.key === 'profit').score, 54);
eq('likuiditas (2 bulan → 67)', h.components.find((c) => c.key === 'likuid').score, 67);
eq('risiko rendah', h.riskLevel, 'Rendah');
eq('skor dihitung', typeof h.score, 'number');
eq('transaksi < 5 → tanpa skor', B.healthScore({ ...d, cur: { ...d.cur, transaksi: 2 } }, {}).score, null);
const h0 = B.healthScore({ jenis: 'retail', cur: { pendapatan: 0, laba: 0 }, posisi: { kas: 0, hari_data: 5 } }, {});
eq('tanpa pendapatan → tanpa skor', h0.score, null);
const hl = B.healthScore({ ...d, cur: { ...d.cur, laba: -1000000 }, posisi: { ...d.posisi, kas: -5 } }, {});
eq('kas minus + rugi → risiko tinggi', hl.riskLevel, 'Tinggi');
// Insight
const ins = B.insights({ ...d, per_akun: [{ id: 'x', akun: 'Listrik', jenis: 'biaya', ini: 2000000, lalu: 300000 }] }, {});
eq('insight omzet ada', ins.some((i) => i.id === 'omzet'), true);
eq('insight biaya naik ada', ins.some((i) => i.id === 'biaya:x'), true);
// Proyeksi
const tren = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ mulai: m + '-01', pendapatan: 10 + i * 10 }));
const pj = B.projection(tren, '2026-11-27');
eq('proyeksi memakai 5 bulan penuh', pj.n, 5);
eq('proyeksi November dari Jun–Okt = 60', pj.value, 60);
eq('proyeksi < 3 bulan = null', B.projection(tren.slice(-3), '2026-11-27'), null);
console.log(bad ? `${bad} GAGAL` : 'SEMUA LULUS');
