// Isi push (fungsi murni, tanpa ketergantungan) — dipakai pengirim server & uji otomatis.
const mask = (s) => String(s || '').replace(/Rp\s?[\d.,]+/g, 'Rp •••');

// Isi push dibuat sekecil mungkin; detail lengkap dibuka di aplikasi setelah lolos pemeriksaan hak akses
export function pushPayload(it) {
  const body = (it.hide_amount ? mask(it.body) : it.body) || 'Ketuk untuk melihat detail.';
  return {
    id: it.notif_id, t: String(it.title).slice(0, 80), b: ((it.kos_name ? it.kos_name + ' · ' : '') + body).slice(0, 180),
    u: '/pusat-notifikasi/buka/' + it.notif_id, tag: String(it.tag).slice(0, 80), p: it.priority, n: Number(it.unread) || 0,
    v: it.vibrate !== false, ts: Date.now(),
  };
}

