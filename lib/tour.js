// Mesin tur kontekstual PRASARA — aturan MURNI (tanpa DOM, tanpa database) agar bisa diuji di Node.
// Komponen components/InteractiveGuide.jsx mengumpulkan elemen yang BENAR-BENAR tampil di layar,
// lalu fungsi di sini menyusun langkah: tur hanya menunjuk elemen yang ada, tidak pernah menekan
// tombol, mengisi formulir, atau menyimpan data bisnis. Progres tur = metadata belajar saja.

export const TOUR_STATUSES = ['active', 'paused', 'skipped', 'completed'];
export const TOUR_LABEL = { active: 'Sedang berjalan', paused: 'Dijeda', skipped: 'Dilewati', completed: 'Selesai' };
const ID_SEG = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9]+|[A-Z]{2,4}-\d[0-9A-Z-]*)$/i;

// Kunci tur stabil per halaman: segmen ID (uuid/angka/nomor dokumen) diganti ":id".
export function tourKey(path) {
  if (path === 'onboarding') return 'onboarding';
  const seg = String(path || '').split(/[?#]/)[0].split('/').filter(Boolean).slice(0, 4)
    .map((s) => (ID_SEG.test(s) ? ':id' : s.toLowerCase().replace(/[^a-z0-9_-]/g, '')));
  const key = 'page:/' + seg.filter(Boolean).join('/');
  return validTourKey(key) ? key : null;
}
export const validTourKey = (key) => typeof key === 'string' && /^(onboarding|page:\/[a-z0-9:/_-]{0,95})$/.test(key);

// Teks pembanding: huruf kecil, simbol jadi spasi.
export function norm(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const words = (s) => norm(s).replace(/\+/g, ' ').trim().split(' ').filter(Boolean);
const STOP = new Set(['lihat', 'buka', 'tutup', 'simpan', 'batal', 'ya', 'ok', 'semua', 'lainnya', 'detail', 'menu', 'kembali', 'baru', 'pilih', 'ubah', 'hapus', 'cari']);

// Nilai kecocokan label tombol/tautan/tab terhadap kalimat langkah panduan.
// 0 = tidak cocok. Label dengan simbol (+ Kamar) atau ≥2 kata lebih dipercaya; satu kata umum diabaikan.
export function labelScore(step, label) {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 3 || raw.length > 48) return 0;
  const s = ' ' + norm(step).replace(/\s*\+\s*/g, ' + ').trim() + ' ';
  const l = norm(raw).replace(/\+/g, ' + ').replace(/\s+/g, ' ').trim();
  const w = words(raw);
  if (!w.length) return 0;
  // Tombol aksi bertanda "+" hanya cocok bila langkah juga menulis "+ Nama".
  if (raw.includes('+')) return s.includes(' + ' + w.join(' ') + ' ') ? 100 + l.length : 0;
  const phrase = ' ' + w.join(' ') + ' ';
  if (!s.replace(/ \+ /g, ' ').includes(phrase)) return 0;
  if (w.length >= 2) return 50 + phrase.length;
  // Satu kata: hanya bila ditulis berhuruf kapital di tengah kalimat (penanda nama tombol), mis. "tekan Bayar".
  const word = raw.replace(/[^\p{L}\p{N}]/gu, '');
  if (word.length < 4 || STOP.has(w[0]) || !/^\p{Lu}/u.test(word)) return 0;
  const mid = new RegExp('[^.!?:\\s]\\s+' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u');
  return mid.test(String(step)) ? 10 + word.length : 0;
}

// Pilih elemen terbaik untuk satu langkah. candidates: [{ id, label }]
export function bestTarget(step, candidates) {
  let best = null;
  for (const c of candidates) {
    const score = labelScore(step, c.label);
    if (score && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

const ROLE_NOTE = (roleName) => `Anda masuk sebagai ${roleName}. Tombol dan menu yang tampil sudah disesuaikan dengan izin peran ini. Bila perlu akses lain, hubungi pemilik bisnis.`;

// Susun langkah tur halaman.
// found: { header, search, data, dashboard, tabs } → true bila elemen bersama itu tampil.
// candidates: tombol/tautan/tab yang tampil di area halaman [{ id, label }].
// Hasil: [{ target: 'header'|'search'|...|{ id }|null, text, kind }]
export function buildPageTour({ help, found = {}, candidates = [], role = 'pemilik', roleName, customer = false }) {
  const steps = [];
  const used = new Set();
  const intro = help.desc || (customer ? 'Halaman ini membantu Anda melihat informasi dan mengirim permintaan ke usaha.' : null);
  if (found.header) { steps.push({ target: 'header', text: `${help.title}. ${intro || 'Judul dan tombol utama halaman ada di bagian ini.'}`, kind: 'struktur' }); used.add('header'); }
  for (const text of help.steps || []) {
    const id = bestTarget(text, candidates);
    steps.push({ target: id != null ? { id } : null, text, kind: 'langkah' });
    if (id != null) used.add('el:' + id);
  }
  if (found.tabs && !used.has('tabs')) steps.push({ target: 'tabs', text: 'Pilih tab untuk berpindah bagian di halaman ini. Data tetap sama, hanya tampilannya yang berganti.', kind: 'struktur' });
  if (found.search) steps.push({ target: 'search', text: 'Ketik kata kunci untuk mencari, atau gunakan Filter untuk menyaring daftar. Pencarian tidak mengubah data.', kind: 'struktur' });
  if (found.data) steps.push({ target: 'data', text: 'Daftar data. Di laptop berupa tabel (klik judul kolom untuk mengurutkan); di HP berupa kartu. Ketuk baris untuk melihat detail.', kind: 'struktur' });
  if (found.dashboard) steps.push({ target: 'dashboard', text: 'Ringkasan angka dari data yang sudah dicatat. Gunakan Atur dashboard untuk memilih bagian yang ditampilkan.', kind: 'struktur' });
  for (const text of help.warn || []) {
    const id = bestTarget(text, candidates);
    steps.push({ target: id != null ? { id } : null, text: 'Perhatian: ' + text, kind: 'perhatian' });
  }
  if (!customer && role !== 'pemilik' && roleName) steps.push({ target: null, text: ROLE_NOTE(roleName), kind: 'peran' });
  steps.push({ target: 'replay', text: customer
    ? 'Selesai. Tombol Panduan ini bisa dibuka lagi kapan saja untuk mengulang langkah halaman ini.'
    : 'Selesai. Buka lagi panduan ini kapan saja lewat tombol ? Panduan. Semua tur modul dan progresnya ada di Panduan & Bantuan.', kind: 'penutup' });
  return steps;
}

// Gabung progres lokal & server: catatan yang lebih baru (at) menang per kunci tur.
export function mergeTours(local = {}, remote = []) {
  const patch = {};
  for (const r of remote) {
    if (!validTourKey(r.tour) || !TOUR_STATUSES.includes(r.status)) continue;
    const mine = local[r.tour];
    const at = new Date(r.updated_at).toISOString();
    if (!mine?.at || at > mine.at) patch[r.tour] = { status: r.status, index: r.step, steps: r.steps, runs: Math.max(r.runs || 0, mine?.runs || 0), at, synced: at };
  }
  return patch;
}

// Ringkasan katalog tur untuk Panduan & Bantuan / Learning Center.
export function tourSummary(record = {}, keys = []) {
  const items = keys.map((key) => ({ key, ...(record[key] || {}), status: record[key]?.status || 'new' }));
  return { items, done: items.filter((i) => i.status === 'completed').length, total: items.length };
}

export const actionLabel = (status) => status === 'paused' || status === 'active' ? 'Lanjutkan' : status === 'completed' || status === 'skipped' ? 'Ulangi' : 'Mulai';
