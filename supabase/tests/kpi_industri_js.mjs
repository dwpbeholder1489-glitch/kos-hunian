// Uji rumus lib/industryKpi.js (Tahap J). Data = keluaran industry_kpi dari supabase/tests/kpi_industri.sql. Jalankan: node supabase/tests/kpi_industri_js.mjs
import { industryKpis, delta, good, fmtKpi } from '../../lib/industryKpi.js';

let ok = 0, bad = 0;
const eq = (name, a, b) => { const pass = a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.001); pass ? ok++ : bad++; console.log(pass ? 'OK  ' : 'GAGAL', name, pass ? '' : `→ dapat ${a}, harus ${b}`); };
const get = (l, k) => l.find((x) => x.key === k);

const laundry = { jenis: 'jasa', hari: 31, pesanan: 3, ulang: 1, pendapatan: 106000, masuk: 5, batal: 1, online: 1, kg: 8, kg_pendapatan: 56000, kg_pesanan: 2, proses_jam: 36,
  dengan_janji: 2, tepat_waktu: 1, keluhan: 1, antar_jemput: 2, pelanggan: 2, pelanggan_ulang: 1, kuliner: false };
const L = industryKpis({ cur: laundry, cmp: { ...laundry, pesanan: 2, pendapatan: 60000, tepat_waktu: 2 } });
eq('laundry: nilai per pesanan 35.333', get(L, 'nilai_pesanan').value, 106000 / 3);
eq('laundry: Rp per kg 7.000', get(L, 'rp_kg').value, 7000);
eq('laundry: kg per pesanan kiloan 4', get(L, 'kg_pesanan').value, 4);
eq('laundry: tepat janji 50%', get(L, 'tepat').value, 0.5);
eq('laundry: cuci ulang 33%', get(L, 'ulang').value, 1 / 3);
eq('laundry: keluhan per 100 = 33,3', get(L, 'keluhan').value, 100 / 3);
eq('laundry: online 20%', get(L, 'online').value, 0.2);
eq('laundry: pelanggan kembali 50%', get(L, 'kembali').value, 0.5);
eq('laundry: tanpa KPI kuliner', get(L, 'food_cost'), undefined);
const dTepat = delta(get(L, 'tepat'));
eq('delta rasio = poin persen (50% vs 100% → −50 poin)', dTepat.v, -50);
eq('turun pada KPI "naik lebih baik" = buruk', good(get(L, 'tepat'), dTepat), false);
eq('delta nilai = persen (35.333 vs 30.000 → +17,8%)', Math.round(delta(get(L, 'nilai_pesanan')).v * 10) / 10, 17.8);
eq('format Rp', fmtKpi(get(L, 'rp_kg')), 'Rp 7.000');
eq('format persen', fmtKpi(get(L, 'tepat')), '50%');
eq('format 2 desimal (pesanan per meja kecil tidak jadi 0)', fmtKpi({ fmt: 'num2', value: 2 / 124 }), '0,02');

const noKg = industryKpis({ cur: { ...laundry, kg: 0, kg_pendapatan: 0, kg_pesanan: 0 } });
eq('tanpa layanan kg: Rp/kg kosong dengan alasan', get(noKg, 'rp_kg').value === null && /kg/.test(get(noKg, 'rp_kg').reason), true);

const kul = { jenis: 'jasa', kuliner: true, hari: 31, pesanan: 3, pendapatan: 60000, masuk: 3, batal: 0, online: 0, tempat: 2, bungkus: 1, meja_pesanan: 2, meja: 4, biaya_resep: 18000, pendapatan_resep: 60000, pelanggan: 3, pelanggan_ulang: 0 };
const K = industryKpis({ cur: kul });
eq('kuliner: food cost 30%', get(K, 'food_cost').value, 0.3);
eq('kuliner: makan di tempat 66,7%', get(K, 'tempat').value, 2 / 3);
eq('kuliner: pesanan per meja per hari = 2 ÷ (4×31)', get(K, 'meja').value, 2 / 124);
eq('kuliner: tanpa KPI kg', get(K, 'rp_kg'), undefined);
eq('kuliner tanpa jumlah meja → alasan', get(industryKpis({ cur: { ...kul, meja: null } }), 'meja').value, null);

const kos = { jenis: 'properti', hari: 31, kamar: 2, kamar_hari: 46, sewa_rata: 1000000, terisi_akhir: 1, uang_masuk: 1500000, tagihan: 2000000, tagihan_n: 2, tunggakan: 500000, tepat_bayar: 1,
  masuk: 0, keluar: 1, lama_tinggal_bln: 3.5, booking_selesai: 0, booking_masuk: 0 };
const R = industryKpis({ cur: kos, cmp: { ...kos, hari: 30, kamar_hari: 60 } });
eq('kos: hunian 46 ÷ 62 = 74,2%', get(R, 'hunian').value, 46 / 62);
eq('kos: pembanding September 100%', get(R, 'hunian').prev, 1);
eq('kos: uang masuk per kamar per bulan = 1,5 jt ÷ (2 × 31/30)', get(R, 'revpar').value, 1500000 / (62 / 30));
eq('kos: tepat bayar 50%', get(R, 'tepat_bayar').value, 0.5);
eq('kos: tunggakan 25%', get(R, 'tunggakan').value, 0.25);
eq('kos: tunggakan naik = buruk', good(get(R, 'tunggakan'), { v: 5 }), false);
eq('kos: booking tanpa data → alasan', get(R, 'booking').value === null && Boolean(get(R, 'booking').reason), true);
eq('toko/kustom: kosong (retail memakai Indikator toko)', industryKpis({ cur: { jenis: 'retail' } }).length, 0);

console.log(`\n${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
