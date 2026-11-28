// Uji rumus lib/propertyIntel.js dengan keluaran NYATA property_intel (supabase/tests/data/property_intel.json, dibuat properti_adaptif.sql -v out=…).
// Data: kamar A1 Rp1jt & B1 Rp600rb (Gedung B) terisi ±70 hari, A2 Rp800rb kosong; periode 30 hari: sewa masuk 1,6 jt, beban 250rb
// (150rb Gedung B + 100rb utama); 12 bulan penuh = 2 bulan data, pendapatan 3,2 jt; investasi 500 jt (utama, pasar 600 jt) + 200 jt (Gedung B).
// Jalankan: node supabase/tests/properti_adaptif_js.mjs
import { readFileSync } from 'node:fs';
import { noi, annual, values, returns, occupancySeries, roomStatus, collection, units, forecast, perProperty, insights, delta, occFromLeases } from '../../lib/propertyIntel.js';
import { termsFor } from '../../lib/propertyTerms.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.01); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const d = JSON.parse(readFileSync(new URL('./data/property_intel.json', import.meta.url), 'utf8'));

const x = noi(d.pnl);
eq('NOI periode = 1.600.000 − 250.000', x.noi, 1350000);
eq('margin NOI', x.margin, 1350000 / 1600000);
const a = annual(d);
eq('12 bulan: 2 bulan data → ESTIMASI', a.estimated, true);
eq('pendapatan setahun = 3.200.000 × 12 / 2', a.revenue, 19200000);
eq('NOI setahun (tanpa biaya di 2 bulan itu)', a.noi, 19200000);
eq('tanpa data 12 bulan → tidak dihitung', annual({ t12: {}, t12_period: { bulan: 0 } }).ok, false);

const v = values(d.props);
eq('total investasi 700 jt', v.invest, 700000000);
eq('nilai pasar belum lengkap (Gedung B)', v.missingMarket.join(), 'Gedung B');
const r = returns(d);
eq('yield memakai nilai investasi bila nilai pasar belum lengkap', r.yieldBasis, 'nilai investasi');
eq('gross yield = 19,2 jt / 700 jt', r.grossYield, 19200000 / 700000000);
eq('ROI = NOI setahun / investasi', r.roi, 19200000 / 700000000);
eq('balik modal = 700 jt / 19,2 jt (tahun)', r.payback, 700000000 / 19200000);
const noInv = returns({ ...d, props: d.props.map((p) => ({ ...p, invest: null, market: null })) });
eq('tanpa nilai investasi → ROI null + alasan', noInv.roi === null && Boolean(noInv.reasons.roi), true);
eq('NOI minus → balik modal tidak dihitung', returns({ ...d, t12: { pendapatan_usaha: 100, beban_operasional: 500 } }).payback, null);

const st = roomStatus(d.rooms);
eq('3 kamar, 2 terisi, 1 kosong', `${st.total}/${st.terisi}/${st.kosong}`, '3/2/1');
eq('hunian 2/3', st.occ, 2 / 3);
eq('sewa bulanan berjalan = 1,6 jt', st.rentRoll, 1600000);
eq('potensi kamar kosong = 800 rb', st.vacantRent, 800000);
const occ = occupancySeries(d);
eq('seri hunian 12 bulan', occ.length, 12);
eq('bulan terakhir terisi > 0', occ.at(-1).value > 0, true);

const col = collection(d);
eq('tagihan periode terbayar 100%', col.rate, 1);
eq('tanpa tunggakan = sehat', col.level, 'sehat');
const col2 = collection({ ...d, arrears: { total: 900000, count: 2, penghuni: 1, b30: 0, b60: 0, b90: 400000, b90p: 500000 } });
eq('tunggakan 900rb / sewa 1,6 jt → risiko (≥30%)', col2.level, 'risiko');
eq('tunggakan lama (>60 hari) = 900rb', col2.old, 900000);

const u = units(d);
eq('unit teratas = A1', u.rows[0].code, 'A1');
eq('pendapatan per unit tersedia = 1,6 jt / 3', u.revPau, 1600000 / 3);
eq('A2 kosong terdeteksi menganggur', u.idle.some((r) => r.code === 'A2'), true);

const f = forecast(d);
eq('proyeksi 12 bulan', f.rows.length, 12);
eq('dasar = sewa berjalan × 12', f.dasar, 1600000 * 12);
eq('potensi penuh = (1,6 jt + 800 rb) × 12', f.penuh, 2400000 * 12);
eq('konservatif = 0 (tidak ada sewa bertanggal selesai/booking)', f.konservatif, 0);

const pp = perProperty(d);
eq('dua properti', pp.length, 2);
const gb = pp.find((p) => p.name === 'Gedung B');
eq('NOI Gedung B = 600 rb − 150 rb', gb.noi, 450000);
eq('hunian Gedung B 100%', gb.occ, 1);
eq('Σ NOI per properti = NOI total', pp.reduce((s, p) => s + p.noi, 0), x.noi);

eq('temuan: hunian 67% < 70% → peringatan', insights(d).some((i) => i.text.startsWith('Hunian 67%')), true);
eq('delta +50%', delta(150, 100), 0.5);
eq('delta tanpa pembanding = null', delta(150, 0), null);

eq('istilah kos = Kamar/Penghuni', `${termsFor({ subcategory_code: 'properti_kos' }).unit}/${termsFor({ subcategory_code: 'properti_kos' }).tenant}`, 'Kamar/Penghuni');
eq('istilah ruko = Unit/Penyewa', `${termsFor({ subcategory_code: 'properti_ruko' }).unit}/${termsFor({ subcategory_code: 'properti_ruko' }).tenant}`, 'Unit/Penyewa');
eq('istilah villa = Tamu', termsFor({ subcategory_code: 'hospitality_villa' }).tenant, 'Tamu');
eq('tanpa subkategori = kos', termsFor({}).unit, 'Kamar');

// Hunian dari sewa (Beranda) = rumus database: 2 kamar disewakan, 1 sewa 10–20 Nov + sewa ganda tumpang tindih di kamar yang sama dihitung sekali
const oc = occFromLeases([{ id: 'a', status: 'terisi' }, { id: 'b', status: 'tersedia' }, { id: 'c', status: 'tidak_disewakan' }],
  [{ room_id: 'a', start_date: '2026-11-10', end_date: '2026-11-20' }, { room_id: 'a', start_date: '2026-11-15', end_date: '2026-11-22' }, { room_id: 'c', start_date: '2026-11-01', end_date: null }], 2, '2026-11-30');
eq('hunian Nov = 13 hari ÷ (30 × 2 kamar)', oc[1].value, 13 / 60);
eq('hunian Okt = 0', oc[0].value, 0);
eq('kamar tidak disewakan tidak dihitung', oc[1].hari, 60);
// Sama dengan SQL: bulan terakhir fixture (prop_occupancy) memakai rumus yang sama
console.log(`${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
