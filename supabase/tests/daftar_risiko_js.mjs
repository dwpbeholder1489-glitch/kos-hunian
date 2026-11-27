// Uji aturan lib/risk.js (Tahap F). Jalankan: node supabase/tests/daftar_risiko_js.mjs
import { level, suggestions, openSuggestions, heat } from '../../lib/risk.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b; pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const codes = (l) => l.map((s) => s.code).sort().join(',');

eq('skor 4 rendah', level(4).key, 'rendah');
eq('skor 5 sedang', level(5).key, 'sedang');
eq('skor 10 tinggi', level(10).key, 'tinggi');
eq('skor 15 sangat tinggi', level(15).key, 'kritis');

const sehat = { aktif: true, jenis: 'retail', bulan_data: 3, pendapatan: 12e6, hpp: 7.2e6, beban_operasional: 2e6, kas: 40e6, piutang: 0, pinjaman: 0, pinjaman_lancar: 0, pokok_bulanan: 0 };
eq('bisnis sehat: tanpa saran', suggestions(sehat, { piutang_lewat: 0 }).length, 0);
eq('paket tanpa fitur: tanpa saran', suggestions({ aktif: false }, {}).length, 0);
eq('belum ada data: tanpa saran kas', suggestions({ ...sehat, bulan_data: 0, kas: 0 }, {}).length, 0);

const tipis = { ...sehat, kas: 5e6 };
eq('kas 5 jt < biaya 9,2 jt → kas_tipis (+ stress)', codes(suggestions(tipis, {})), 'kas_tipis,stress_kas_minus');
eq('rugi', suggestions({ ...sehat, beban_operasional: 6e6 }, {}).some((s) => s.code === 'rugi_berulang'), true);
eq('pinjaman ≤12 bln > kas', suggestions({ ...sehat, pinjaman: 60e6, pinjaman_lancar: 50e6 }, {}).some((s) => s.code === 'pinjaman_jatuh_tempo'), true);
eq('piutang lewat 1 jt (<10% pendapatan) tidak disarankan', suggestions(sehat, { piutang_lewat: 1e6 }).length, 0);
const p = suggestions(sehat, { piutang_lewat: 3e6, piutang_lewat_n: 2 }).find((s) => s.code === 'piutang_lewat');
eq('piutang lewat 3 jt (25%) disarankan', Boolean(p), true);
eq('piutang: alasan menyebut 25%', p.why.includes('25%'), true);
eq('kos: judul tagihan sewa', suggestions({ ...sehat, jenis: 'properti', hpp: 0 }, { piutang_lewat: 3e6 }).find((s) => s.code === 'piutang_lewat').title, 'Tagihan sewa menunggak');
eq('margin tipis (HPP 90%)', suggestions({ ...sehat, hpp: 10.8e6, beban_operasional: 0.5e6 }, {}).some((s) => s.code === 'margin_tipis'), true);
eq('kos tidak dapat saran margin', suggestions({ ...sehat, jenis: 'properti', hpp: 11e6, beban_operasional: 0 }, {}).some((s) => s.code === 'margin_tipis'), false);

const list = suggestions(tipis, {});
eq('saran hilang bila sudah ada risiko terbuka dari saran itu', codes(openSuggestions(list, [{ source: 'saran:kas_tipis', status: 'terbuka' }], [])), 'stress_kas_minus');
eq('risiko dari saran ditutup → saran muncul lagi', codes(openSuggestions(list, [{ source: 'saran:kas_tipis', status: 'ditutup' }], [])), 'kas_tipis,stress_kas_minus');
eq('saran diabaikan disembunyikan', codes(openSuggestions(list, [], ['stress_kas_minus'])), 'kas_tipis');

const h = heat([{ likelihood: 3, impact: 4, status: 'terbuka' }, { likelihood: 3, impact: 4, status: 'ditangani' }, { likelihood: 5, impact: 5, status: 'ditutup' }]);
eq('peta panas: 2 di (3,4)', h[3][4], 2);
eq('peta panas: yang ditutup tidak dihitung', h[5][5], 0);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
