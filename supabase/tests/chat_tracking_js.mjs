// Uji aturan tahap tracking & teks kehadiran (lib/tracking.js). Jalankan: node supabase/tests/chat_tracking_js.mjs
import { soTracking, svcTracking, etaText, presenceText } from '../../lib/tracking.js';

let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('GAGAL:', name); } };
const now = new Date('2026-11-26T08:00:00Z'); // 15.00 WIB

// Toko: menunggu → diproses → disiapkan → dikirim → selesai
const base = { type: 'so_order', number: 'SO-1', status: 'penawaran', kind: 'pesanan', fulfillment: 'antar', deliveries: [], lines: [] };
let r = soTracking(base, now);
t('menunggu konfirmasi', r.headline === 'Menunggu Konfirmasi Toko' && r.current === -1 && r.steps.every((s) => !s.done));
r = soTracking({ ...base, status: 'dikonfirmasi', confirmed_at: '2026-11-26T06:01:00Z' }, now);
t('diproses', r.headline === 'Pesanan Diproses' && r.steps[0].state === 'current' && r.steps[1].state === 'todo');
r = soTracking({ ...base, status: 'dikonfirmasi', confirmed_at: '2026-11-26T06:01:00Z', prepared_at: '2026-11-26T06:30:00Z' }, now);
t('disiapkan', r.headline === 'Pesanan Sedang Disiapkan' && r.steps[0].state === 'done' && r.steps[1].state === 'current');
const dv = { number: 'SJ-1', status: 'dikirim', created_at: '2026-11-26T08:10:00Z', courier: 'Kurir Toko', tracking_no: 'TSB1', eta_from: '2026-11-26T10:00:00Z', eta_to: '2026-11-26T12:00:00Z' };
r = soTracking({ ...base, status: 'selesai', confirmed_at: '2026-11-26T06:01:00Z', prepared_at: '2026-11-26T06:30:00Z', deliveries: [dv] }, now);
t('dikirim (belum diterima → belum selesai)', r.headline === 'Pesanan Sedang Dikirim' && r.steps[2].state === 'current' && r.steps[3].state === 'todo');
t('estimasi dari penjual', r.delivery.eta === 'Hari ini, 17.00 – 19.00' && r.sub === 'Estimasi tiba hari ini, 17.00 – 19.00');
t('resi & kurir', r.delivery.tracking_no === 'TSB1' && r.delivery.courier === 'Kurir Toko');
r = soTracking({ ...base, status: 'selesai', confirmed_at: '2026-11-26T06:01:00Z', deliveries: [{ ...dv, eta_from: null, eta_to: null }] }, now);
t('tanpa estimasi = tidak ditebak', r.delivery.eta === null && r.sub === 'Estimasi tiba belum ditentukan toko');
r = soTracking({ ...base, status: 'selesai', confirmed_at: '2026-11-26T06:01:00Z', deliveries: [{ ...dv, status: 'diterima', received_at: '2026-11-26T11:00:00Z' }] }, now);
t('selesai', r.done && r.headline === 'Pesanan Selesai' && r.steps[3].at === '2026-11-26T11:00:00Z' && r.steps.every((s) => s.state === 'done'));
r = soTracking({ ...base, fulfillment: 'ambil', status: 'selesai', confirmed_at: '2026-11-26T06:01:00Z', deliveries: [dv] }, now);
t('ambil di toko', r.steps[2].label === 'Diserahkan' && r.headline === 'Pesanan Siap Diambil' && r.sub === null);
r = soTracking({ ...base, status: 'batal' }, now);
t('batal', r.cancelled && r.current === -1 && r.steps.every((s) => s.state === 'off'));
r = soTracking({ ...base, status: 'selesai', confirmed_at: '2026-11-26T06:01:00Z', deliveries: [{ ...dv, status: 'gagal' }] }, now);
t('kiriman gagal tidak dihitung dikirim', !r.steps[2].done && r.failed === 1);
r = soTracking({ ...base, kind: 'penawaran', quote_ready: true }, now);
t('penawaran siap', r.headline === 'Penawaran Siap Ditinjau');

// Jasa: tahap menyesuaikan
r = svcTracking({ type: 'svc_order', status: 'proses', stage: 'Cuci', pickup: true, pickup_status: 'dijemput', confirmed_at: '2026-11-26T01:00:00Z' }, now);
t('laundry jemput + tahap', r.steps.map((s) => s.key).join() === 'masuk,jemput,proses,siap,selesai' && r.headline === 'Sedang Diproses · Cuci' && r.steps[2].state === 'current');
r = svcTracking({ type: 'svc_order', status: 'diterima', pickup: true, pickup_status: 'menunggu' }, now);
t('menunggu jemput', r.headline === 'Menunggu Penjemputan' && r.steps[0].state === 'current' && r.steps[1].state === 'todo');
r = svcTracking({ type: 'svc_order', status: 'siap', kuliner: true, dine: 'tempat' }, now);
t('kuliner makan di tempat', r.steps.map((s) => s.label).join() === 'Diterima,Dimasak,Disajikan,Selesai' && r.headline === 'Siap Disajikan');
r = svcTracking({ type: 'svc_order', status: 'siap', deliver: true, delivery_status: 'dalam_pengantaran', delivery_date: '2026-11-26', delivery_slot: '15.00–17.00' }, now);
t('jasa diantar', r.headline === 'Pesanan Sedang Diantar' && r.sub.startsWith('Jadwal antar'));
r = svcTracking({ type: 'svc_order', status: 'permintaan' }, now);
t('permintaan', r.headline === 'Menunggu Konfirmasi' && r.current === -1);

// Teks waktu & kehadiran
t('besok', etaText('2026-11-27T02:00:00Z', null, now) === 'Besok, 09.00');
t('lain hari', etaText('2026-11-30T02:00:00Z', '2026-11-30T04:00:00Z', now).endsWith('09.00 – 11.00'));
t('online + cepat', JSON.stringify(presenceText({ online: true, response_minutes: 3 })) === '["Online","Biasanya membalas < 5 menit"]');
t('tanpa data = tidak ada klaim', presenceText({ online: false, last_seen: null, response_minutes: null }) === null);
t('balasan 20 menit', presenceText({ online: true, response_minutes: 18 })[1] === 'Biasanya membalas ± 20 menit');

console.log(`chat_tracking_js: ${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
