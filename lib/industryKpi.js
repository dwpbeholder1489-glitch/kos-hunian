// KPI industri (Tahap J Master Blueprint BI) — rumus TERTULIS atas angka mentah industry_kpi (data yang sudah dicatat).
// Setiap KPI: value (null + reason bila penyebut nol / data belum dicatat), prev (periode pembanding), better ('up'|'down'), formula.
const n = (v) => (v == null || v === '' ? null : Number(v));
const div = (a, b, why) => (n(b) > 0 && n(a) != null ? { value: n(a) / n(b) } : { value: null, reason: why });

function one(key, label, fmt, better, formula, calc, cur, prev) {
  const c = calc(cur || {}); const p = prev ? calc(prev) : null;
  return { key, label, fmt, better, formula, value: c.value, reason: c.reason, prev: p ? p.value : null };
}

function laundry(cur, prev, kuliner) {
  const L = [];
  const add = (...a) => L.push(one(...a, cur, prev));
  add('pesanan', 'Pesanan selesai', 'num', 'up', 'Jumlah pesanan diserahkan (tanpa cuci/kerja ulang).', (x) => ({ value: n(x.pesanan) }));
  add('nilai_pesanan', kuliner ? 'Rata-rata per pesanan' : 'Nilai rata-rata per pesanan', 'rp', 'up', 'Pendapatan pesanan selesai ÷ jumlah pesanan selesai.', (x) => div(x.pendapatan, x.pesanan, 'Belum ada pesanan selesai.'));
  if (!kuliner) {
    add('kg', 'Kiloan diproses', 'kg', 'up', 'Jumlah kg dari baris layanan bersatuan kg pada pesanan selesai.', (x) => (n(x.kg) > 0 ? { value: n(x.kg) } : { value: null, reason: 'Tidak ada layanan bersatuan kg.' }));
    add('rp_kg', 'Pendapatan per kg', 'rp', 'up', 'Nilai baris layanan kg ÷ total kg.', (x) => div(x.kg_pendapatan, x.kg, 'Tidak ada layanan bersatuan kg.'));
    add('kg_pesanan', 'Rata-rata kg per pesanan kiloan', 'kg', 'up', 'Total kg ÷ jumlah pesanan yang memuat layanan kg.', (x) => div(x.kg, x.kg_pesanan, 'Tidak ada layanan bersatuan kg.'));
    add('proses', 'Lama proses rata-rata', 'jam', 'down', 'Rata-rata jam dari pesanan diterima sampai diserahkan.', (x) => (n(x.proses_jam) != null ? { value: n(x.proses_jam) } : { value: null, reason: 'Belum ada pesanan selesai.' }));
    add('tepat', 'Siap tepat janji', 'pct', 'up', 'Pesanan berjanji selesai yang berstatus Siap sebelum batas janji ÷ pesanan berjanji selesai.', (x) => div(x.tepat_waktu, x.dengan_janji, 'Belum ada pesanan dengan janji selesai.'));
    add('ulang', 'Cuci/kerja ulang', 'pct', 'down', 'Pesanan ulang (gratis karena keluhan) ÷ pesanan selesai.', (x) => div(x.ulang, x.pesanan, 'Belum ada pesanan selesai.'));
    add('keluhan', 'Keluhan per 100 pesanan', 'num1', 'down', 'Keluhan tercatat ÷ pesanan selesai × 100.', (x) => (n(x.pesanan) > 0 ? { value: (n(x.keluhan) * 100) / n(x.pesanan) } : { value: null, reason: 'Belum ada pesanan selesai.' }));
    add('antar', 'Pakai antar-jemput', 'pct', null, 'Pesanan selesai yang dijemput atau diantar ÷ pesanan selesai.', (x) => div(x.antar_jemput, x.pesanan, 'Belum ada pesanan selesai.'));
  } else {
    add('tempat', 'Makan di tempat', 'pct', null, 'Pesanan selesai makan di tempat ÷ (makan di tempat + bungkus).', (x) => div(x.tempat, n(x.tempat) + n(x.bungkus), 'Belum ada pesanan bertanda makan di tempat/bungkus.'));
    add('meja', 'Pesanan per meja per hari', 'num2', 'up', 'Pesanan selesai bernomor meja ÷ (jumlah meja × jumlah hari).', (x) => div(x.meja_pesanan, n(x.meja) * n(x.hari), 'Jumlah meja belum diatur (Menu & tahap › Jumlah meja).'));
    add('food_cost', 'Food cost', 'pct', 'down', 'Biaya bahan resep pesanan selesai ÷ nilai baris menu yang punya resep.', (x) => div(x.biaya_resep, x.pendapatan_resep, 'Belum ada menu dengan resep (menu Resep).'));
  }
  add('online', 'Pesanan dari halaman bisnis', 'pct', 'up', 'Pesanan masuk dari halaman bisnis/QR ÷ semua pesanan masuk.', (x) => div(x.online, x.masuk, 'Belum ada pesanan masuk.'));
  add('batal', 'Pesanan batal', 'pct', 'down', 'Pesanan masuk yang dibatalkan ÷ pesanan masuk.', (x) => div(x.batal, x.masuk, 'Belum ada pesanan masuk.'));
  add('kembali', 'Pelanggan kembali', 'pct', 'up', 'Pelanggan (kontak / No. HP / nama) dengan ≥2 pesanan selesai ÷ semua pelanggan pada periode.', (x) => div(x.pelanggan_ulang, x.pelanggan, 'Belum ada pelanggan.'));
  return L;
}

function kos(cur, prev) {
  const L = [];
  const add = (...a) => L.push(one(...a, cur, prev));
  add('hunian', 'Hunian rata-rata', 'pct', 'up', 'Hari kamar terisi (sewa yang berjalan) ÷ (jumlah kamar × hari periode).', (x) => div(x.kamar_hari, n(x.kamar) * n(x.hari), 'Belum ada kamar.'));
  add('revpar', 'Uang masuk per kamar per bulan', 'rp', 'up', 'Pembayaran terverifikasi ÷ jumlah kamar ÷ (hari periode ÷ 30).', (x) => div(x.uang_masuk, (n(x.kamar) * n(x.hari)) / 30, 'Belum ada kamar.'));
  add('sewa', 'Sewa rata-rata kamar terisi', 'rp', 'up', 'Rata-rata harga sewa yang berjalan pada akhir periode.', (x) => (n(x.sewa_rata) != null ? { value: n(x.sewa_rata) } : { value: null, reason: 'Tidak ada sewa berjalan di akhir periode.' }));
  add('tepat_bayar', 'Tagihan dibayar tepat waktu', 'pct', 'up', 'Tagihan jatuh tempo di periode yang lunas paling lambat tanggal jatuh tempo ÷ tagihan jatuh tempo.', (x) => div(x.tepat_bayar, x.tagihan_n, 'Tidak ada tagihan jatuh tempo pada periode.'));
  add('tunggakan', 'Tunggakan', 'pct', 'down', 'Sisa belum dibayar dari tagihan jatuh tempo di periode ÷ nilai tagihan itu.', (x) => div(x.tunggakan, x.tagihan, 'Tidak ada tagihan jatuh tempo pada periode.'));
  add('keluar', 'Penghuni keluar', 'num', 'down', 'Sewa yang berakhir pada periode (pindah kamar tidak dihitung).', (x) => ({ value: n(x.keluar) }));
  add('masuk', 'Penghuni baru', 'num', 'up', 'Sewa baru yang mulai pada periode (pindah kamar tidak dihitung).', (x) => ({ value: n(x.masuk) }));
  add('lama', 'Lama tinggal rata-rata', 'bln', 'up', 'Rata-rata lama sewa (bulan) penghuni yang keluar pada periode.', (x) => (n(x.lama_tinggal_bln) != null ? { value: n(x.lama_tinggal_bln) } : { value: null, reason: 'Tidak ada penghuni keluar pada periode.' }));
  add('booking', 'Booking jadi masuk', 'pct', 'up', 'Booking yang berakhir dengan check-in ÷ booking yang ditutup pada periode (check-in, batal, atau hangus).', (x) => div(x.booking_masuk, x.booking_selesai, 'Tidak ada booking yang ditutup pada periode.'));
  return L;
}

export function industryKpis(data) {
  const cur = data?.cur; const prev = data?.cmp || null;
  if (!cur) return [];
  if (cur.jenis === 'properti') return kos(cur, prev);
  if (cur.jenis === 'jasa') return laundry(cur, prev, Boolean(cur.kuliner));
  return [];
}

// Perubahan vs pembanding: persen untuk nilai, poin persen untuk rasio
export function delta(k) {
  if (k.value == null || k.prev == null) return null;
  if (k.fmt === 'pct') return { kind: 'pp', v: (k.value - k.prev) * 100 };
  if (k.prev === 0) return null;
  return { kind: 'pct', v: ((k.value - k.prev) / Math.abs(k.prev)) * 100 };
}
export const good = (k, d) => (d == null || !k.better || d.v === 0 ? null : (d.v > 0) === (k.better === 'up'));

export function fmtKpi(k, v = k.value) {
  if (v == null) return '—';
  const id = (x, d = 0) => x.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  switch (k.fmt) {
    case 'pct': return id(v * 100, 1) + '%';
    case 'rp': return 'Rp ' + id(Math.round(v));
    case 'kg': return id(v, 1) + ' kg';
    case 'jam': return id(v, 1) + ' jam';
    case 'bln': return id(v, 1) + ' bulan';
    case 'num1': return id(v, 1);
    case 'num2': return id(v, 2);
    default: return id(v);
  }
}
