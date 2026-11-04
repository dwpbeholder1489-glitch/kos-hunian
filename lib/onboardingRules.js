// Aturan pendampingan pengguna baru (tanpa ketergantungan server — dipakai cron dan halaman admin).
// r = satu baris dari onboarding_batch()/admin_onboarding().

export const STEPS = [
  ['rooms_priced', 'Harga kamar'],
  ['has_lease', 'Penghuni'],
  ['has_payment', 'Pembayaran'],
  ['has_expense', 'Pengeluaran'],
  ['has_info', 'Info penghuni'],
];
export const stepsDone = (r) => STEPS.filter(([k]) => r[k]).length;

// Status pelanggan, dari yang paling perlu perhatian
export function statusOf(r) {
  if (r.paid) return ['Berlangganan', 'good'];
  if (r.trial_left != null && r.trial_left >= 0 && r.trial_left <= 3) return ['Coba hampir habis', 'gold'];
  if (r.idle_days >= 14) return ['Berisiko', 'bad'];
  if (!r.has_lease && r.age_days >= 3) return ['Belum mulai', 'gold'];
  if (r.has_lease && r.has_payment) return ['Teraktivasi', 'good'];
  return ['Baru', ''];
}

const HOUR = 3600e3;
// Email arahan berikutnya untuk satu kos, atau null. Paling banyak satu email per 2 hari, tiap jenis sekali.
export function nextEmail(r, now = Date.now()) {
  if (!r.onboarding_emails || r.paid || r.age_days > 31) return null;
  if (r.last_sent && now - Date.parse(r.last_sent) < 44 * HOUR) return null;
  const sent = new Set(r.sent_kinds || []);
  const tl = r.trial_left;
  const rules = [
    ['coba2', tl != null && tl >= 0 && tl <= 2],
    ['coba5', tl != null && tl >= 3 && tl <= 5],
    ['h0', r.age_days <= 2],
    ['kamar', r.age_days >= 1 && !r.rooms_priced],
    ['penghuni', r.age_days >= 3 && !r.has_lease],
    ['bayar', r.age_days >= 7 && r.has_lease && !r.has_payment],
    ['sapa', r.age_days >= 14 && r.age_days <= 24 && r.idle_days >= 7],
    ['ringkasan', r.age_days >= 21 && r.has_lease],
  ];
  const hit = rules.find(([k, ok]) => ok && !sent.has(k) && !(k === 'coba5' && sent.has('coba2')));
  return hit ? hit[0] : null;
}
