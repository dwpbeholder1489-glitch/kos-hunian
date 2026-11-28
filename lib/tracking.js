// Tahapan tracking pelanggan — SATU sumber aturan untuk portal toko (/b), portal grosir (/c), cek pesanan jasa (/b/[slug]/cek)
// dan panel pemilik (/chat). Semua tanggal dari data nyata (cx_track); tahap tanpa tanggal = belum terjadi.
// Estimasi tiba HANYA dari isian penjual (so_deliveries.eta_*) atau jadwal antar jasa; kosong = "belum ditentukan" (tidak ditebak).

const tz = { timeZone: 'Asia/Jakarta' };
function formatDate(value, locale, options) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { ...tz, ...options }).format(date)
    : '';
}
export const fmtTime = (value) => formatDate(value, 'id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
export const fmtDay = (value) => formatDate(value, 'id-ID', { day: 'numeric', month: 'short' });
const dayKey = (value) => formatDate(value, 'en-CA');

// "Hari ini, 17.00 – 19.00" / "Besok, 09.00" / "28 Nov, 17.00 – 19.00"
export function etaText(from, to, now = new Date()) {
  if (!from && !to) return null;
  const a = from || to; const b = to && from && to !== from ? to : null;
  const today = dayKey(now); const tomorrow = dayKey(new Date(now.getTime() + 864e5));
  const d = dayKey(a);
  const day = d === today ? 'Hari ini' : d === tomorrow ? 'Besok' : fmtDay(a);
  const sameDay = b && dayKey(b) === d;
  return `${day}, ${fmtTime(a)}${b ? ` – ${sameDay ? '' : fmtDay(b) + ' '}${fmtTime(b)}` : ''}`;
}

const step = (key, label, at, done, extra = {}) => ({ key, label, at: at || null, done: Boolean(done), ...extra });
// Tahap yang SEDANG berjalan = tahap terakhir yang sudah tercapai (seperti gambar acuan: "Dikirim" disorot saat barang di jalan).
// Sebelum itu = selesai (✓), sesudahnya = belum. Semua tercapai = semua selesai. Batal = tidak ada yang berjalan.
function stateOf(steps, cancelled) {
  const last = steps.map((x) => x.done).lastIndexOf(true);
  const all = last === steps.length - 1;
  const current = cancelled || all ? -1 : last;
  return { current, steps: steps.map((x, i) => ({ ...x, state: cancelled ? (x.done ? 'done' : 'off') : i < last || (all && i === last) ? 'done' : i === last ? 'current' : 'todo' })) };
}

// Pesanan toko / grosir (so_order)
export function soTracking(t, now = new Date()) {
  const deliveries = (t.deliveries || []).filter((d) => d.status !== 'gagal');
  const failed = (t.deliveries || []).filter((d) => d.status === 'gagal');
  const last = deliveries[deliveries.length - 1] || null;
  const pickup = t.fulfillment === 'ambil';
  const received = [...deliveries].reverse().find((d) => d.received_at)?.received_at || null;
  const cancelled = t.status === 'batal';
  const done = t.status === 'selesai' && (deliveries.length === 0 || deliveries.every((d) => d.status === 'diterima'));
  const steps = [
    step('proses', 'Diproses', t.confirmed_at, t.confirmed_at),
    step('siap', 'Disiapkan', t.prepared_at || last?.created_at, t.prepared_at || last),
    step('kirim', pickup ? 'Diserahkan' : 'Dikirim', last?.created_at, last),
    step('selesai', 'Selesai', done ? received || t.closed_at : null, done),
  ];
  const st = stateOf(steps, cancelled);
  let headline; let sub = null;
  if (cancelled) headline = 'Pesanan Dibatalkan';
  else if (t.status === 'penawaran') { headline = t.kind === 'penawaran' || t.quote_ready ? (t.quote_ready ? 'Penawaran Siap Ditinjau' : 'Menunggu Penawaran Toko') : 'Menunggu Konfirmasi Toko'; }
  else if (done) headline = 'Pesanan Selesai';
  else if (last && last.status === 'dikirim') headline = pickup ? 'Pesanan Siap Diambil' : 'Pesanan Sedang Dikirim';
  else if (t.prepared_at) headline = 'Pesanan Sedang Disiapkan';
  else headline = 'Pesanan Diproses';
  const eta = last && last.status === 'dikirim' ? etaText(last.eta_from, last.eta_to, now) : null;
  if (!cancelled && !done && last && last.status === 'dikirim' && !pickup) sub = eta ? `Estimasi tiba ${eta.charAt(0).toLowerCase()}${eta.slice(1)}` : 'Estimasi tiba belum ditentukan toko';
  return {
    headline, sub, cancelled, done, pickup, ...st,
    delivery: last ? { courier: last.courier || null, driver: last.driver || null, vehicle: last.vehicle || null, tracking_no: last.tracking_no || null,
      number: last.number, eta, status: last.status, recipient: last.recipient || null, received_at: last.received_at || null } : null,
    failed: failed.length,
  };
}

// Pesanan jasa / laundry / kuliner (svc_order) — tahap menyesuaikan jemput, antar, makan di tempat
export function svcTracking(t, now = new Date()) {
  const rank = { permintaan: 0, diterima: 1, proses: 2, siap: 3, selesai: 4 }[t.status] ?? -1;
  const cancelled = t.status === 'batal';
  const picked = !t.pickup || t.pickup_status === 'dijemput';
  const cook = t.kuliner;
  const steps = [step('masuk', 'Diterima', t.confirmed_at || (rank >= 1 ? t.received_at : null), rank >= 1)];
  if (t.pickup) steps.push(step('jemput', 'Dijemput', null, rank >= 1 && picked));
  steps.push(step('proses', cook ? 'Dimasak' : 'Diproses', null, rank >= 2, { note: rank === 2 && t.stage ? t.stage : null }));
  steps.push(step('siap', t.deliver ? 'Diantar' : cook && t.dine === 'tempat' ? 'Disajikan' : 'Siap diambil', null,
    t.deliver ? t.delivery_status === 'dalam_pengantaran' || rank >= 4 : rank >= 3));
  steps.push(step('selesai', 'Selesai', t.completed_at, rank >= 4));
  const st = stateOf(steps, cancelled);
  let headline;
  if (cancelled) headline = 'Pesanan Dibatalkan';
  else if (rank === 0) headline = 'Menunggu Konfirmasi';
  else if (rank >= 4) headline = 'Pesanan Selesai';
  else if (t.deliver && t.delivery_status === 'dalam_pengantaran') headline = 'Pesanan Sedang Diantar';
  else if (rank === 3) headline = t.deliver ? 'Siap Diantar' : cook && t.dine === 'tempat' ? 'Siap Disajikan' : 'Siap Diambil';
  else if (t.pickup && !picked) headline = 'Menunggu Penjemputan';
  else if (rank === 2) headline = cook ? 'Sedang Dimasak' : `Sedang Diproses${t.stage ? ` · ${t.stage}` : ''}`;
  else headline = 'Pesanan Diterima';
  let sub = null;
  if (!cancelled && rank < 4) {
    if (t.deliver && t.delivery_date) sub = `Jadwal antar ${fmtDay(t.delivery_date + 'T12:00:00+07:00')}${t.delivery_slot ? ' · ' + t.delivery_slot : ''}`;
    else if (t.due_at) sub = `Perkiraan selesai ${etaText(t.due_at, null, now)?.toLowerCase()}`;
  }
  return {
    headline, sub, cancelled, done: rank >= 4, ...st,
    delivery: null,
  };
}

export const trackingOf = (t, now) => (t?.type === 'svc_order' ? svcTracking(t, now) : soTracking(t, now));

// Teks status online & waktu respons dari data nyata (cx_business_info)
export function presenceText(b) {
  if (!b) return null;
  const parts = [];
  if (b.online) parts.push('Online');
  else if (b.last_seen) {
    const mins = Math.round((Date.now() - new Date(b.last_seen).getTime()) / 60000);
    parts.push(mins < 60 ? `Aktif ${Math.max(mins, 1)} menit lalu` : mins < 1440 ? `Aktif ${Math.round(mins / 60)} jam lalu` : 'Sedang tidak aktif');
  }
  const r = b.response_minutes == null ? null : Number(b.response_minutes);
  if (r != null) parts.push(r < 5 ? 'Biasanya membalas < 5 menit' : r < 60 ? `Biasanya membalas ± ${Math.ceil(r / 5) * 5} menit` : `Biasanya membalas ± ${Math.round(r / 60)} jam`);
  return parts.length ? parts : null;
}

export const CONV_STATUS = { baru: ['Menunggu dibalas', 'warn'], ditangani: ['Sedang ditangani', 'gold'], menunggu_pelanggan: ['Menunggu pelanggan', 'void'], selesai: ['Selesai', 'good'] };
