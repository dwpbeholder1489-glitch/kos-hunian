// Uji susunan dokumen lib/investorReport.js (Tahap H) dengan data NYATA investor_snapshot (supabase/tests/data/investor_snapshot.json,
// dihasilkan dari database uji laporan_investor.sql + skenario, valuasi, risiko). Jalankan: node supabase/tests/laporan_investor_js.mjs
import { readFileSync } from 'node:fs';
import { buildReport } from '../../lib/investorReport.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b; pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${JSON.stringify(a)}, harus ${JSON.stringify(b)}`); };
const data = JSON.parse(readFileSync(new URL('./data/investor_snapshot.json', import.meta.url), 'utf8'));
const ids = (r) => r.map((s) => s.id).join(',');
const find = (r, id) => r.find((s) => s.id === id);
const txt = (s) => JSON.stringify(s.blocks);

const full = buildReport({ sections: { ringkasan: 'Stabil.', mdna: 'Margin baik.', prospek: 'Buka cabang.', catatan: 'Belum diaudit.' }, include: {} }, data);
eq('semua bagian ada (toko: tanpa KPI industri)', ids(full), 'ringkasan,mdna,keuangan,ekuitas,kas,rasio,skenario,risiko,valuasi,prospek,metodologi');
eq('ringkasan memuat pendapatan bersih 15 jt', txt(find(full, 'ringkasan')).includes('Rp 15.000.000'), true);
eq('laba rugi: baris pendapatan bersih 15.000.000', txt(find(full, 'keuangan')).includes('15.000.000'), true);
eq('neraca seimbang dicatat', txt(find(full, 'keuangan')).includes('Neraca seimbang'), true);
eq('perubahan ekuitas cocok dengan neraca', txt(find(full, 'ekuitas')).includes('Cocok dengan neraca'), true);
eq('arus kas: saldo akhir 35.000.000', txt(find(full, 'kas')).includes('35.000.000'), true);
eq('skenario memuat 3 kolom & label PROYEKSI', txt(find(full, 'skenario')).includes('Pesimis') && txt(find(full, 'skenario')).includes('PROYEKSI'), true);
eq('risiko: Pemasok berhenti skor 12 tinggi', txt(find(full, 'risiko')).includes('12 · Tinggi'), true);
eq('valuasi: sumber & ESTIMASI tertulis', txt(find(full, 'valuasi')).includes('Penawaran pembeli') && txt(find(full, 'valuasi')).includes('ESTIMASI'), true);
eq('metodologi memuat catatan pemilik', txt(find(full, 'metodologi')).includes('Belum diaudit.'), true);

const minimal = buildReport({ sections: {}, include: { keuangan: false, ekuitas: false, kas: false, rasio: false, kpi: false, skenario: false, risiko: false, valuasi: false, metodologi: false } }, data);
eq('semua dimatikan: hanya ringkasan', ids(minimal), 'ringkasan');
eq('ringkasan kosong diberi catatan', txt(minimal[0]).includes('belum ditulis'), true);
eq('tanpa skenario & valuasi terpilih: bagian dilewati', ids(buildReport({ sections: {}, include: {} }, { ...data, skenario: null, valuasi: null })).includes('skenario'), false);
const kos = { ...data, kpi: { cur: { jenis: 'properti', hari: 30, kamar: 2, kamar_hari: 45, uang_masuk: 2e6, tagihan: 2e6, tagihan_n: 2, tunggakan: 0, tepat_bayar: 2, masuk: 0, keluar: 0 } } };
eq('kos: bagian KPI industri muncul', ids(buildReport({ sections: {}, include: {} }, kos)).includes('kpi'), true);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
