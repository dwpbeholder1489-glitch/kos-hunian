'use client';
// Notifikasi di browser: deteksi kemampuan perangkat, aktivasi push, sinkron langganan, suara khusus & getar saat aplikasi terbuka.
// Keputusan teknis memakai FEATURE DETECTION; jenis HP/browser (user-agent) hanya untuk memilih panduan yang ditampilkan.
import { supabase } from '@/lib/supabase';

// Kategori & prioritas (sama dengan notif_event_types di database)
export const CATS = {
  aktivitas: ['Aktivitas bisnis', 'Persetujuan, proyek, perubahan penting'],
  penjualan: ['Penjualan', 'Penjualan, pesanan, reservasi, kasir offline'],
  pembelian: ['Pembelian', 'Permintaan & pesanan ke supplier, barang diterima'],
  keuangan: ['Keuangan', 'Tagihan, pembayaran, pengeluaran, kas'],
  inventaris: ['Inventaris', 'Stok menipis, stok habis, mutasi'],
  karyawan: ['Karyawan', 'Tugas untuk Anda'],
  pelanggan: ['Pelanggan', 'Prospek, booking, penghuni, keluhan'],
  pengingat: ['Pengingat', 'Tagihan jatuh tempo, pesanan terlambat (pagi hari)'],
  sistem: ['Sistem & keamanan', 'Perangkat baru, hak akses berubah'],
};
export const PRIORITY = { kritis: ['Kritis', 'bad'], tinggi: ['Penting', 'warn'], normal: ['Normal', ''], info: ['Info', 'void'] };

// ---------- Deteksi ----------
export function detect() {
  if (typeof window === 'undefined') return { status: 'D', ready: false };
  const ua = navigator.userAgent || '';
  const touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const platform = /iPhone|iPod/.test(ua) ? 'ios' : /iPad/.test(ua) || touchMac ? 'ipados' : /Android/.test(ua) ? 'android'
    : /Windows/.test(ua) ? 'windows' : /Macintosh/.test(ua) ? 'mac' : /CrOS/.test(ua) ? 'chromeos' : /Linux/.test(ua) ? 'linux' : 'lainnya';
  const browser = /SamsungBrowser/.test(ua) ? 'samsung' : /EdgA?\/|EdgiOS/.test(ua) ? 'edge' : /OPR\/|OPT\//.test(ua) ? 'opera'
    : /Firefox|FxiOS/.test(ua) ? 'firefox' : /CriOS|Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'lainnya';
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  const iosVer = (platform === 'ios' || platform === 'ipados') && m ? Number(m[1]) + Number(m[2]) / 100 : null;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const secure = window.isSecureContext;
  const sw = 'serviceWorker' in navigator;
  const push = sw && 'PushManager' in window;
  const notif = 'Notification' in window;
  const permission = notif ? Notification.permission : 'unsupported';
  const apple = platform === 'ios' || platform === 'ipados';
  // A = bisa langsung; B = harus dipasang ke Layar Utama dulu (iPhone/iPad iOS 16.4+); C = hanya dalam aplikasi; D = tidak didukung
  let status;
  if (secure && push && notif) status = 'A';
  else if (apple && !standalone && (iosVer == null || iosVer >= 16.4)) status = 'B';
  else if (notif || sw) status = 'C';
  else status = 'D';
  const P = { ios: 'iPhone', ipados: 'iPad', android: 'Android', windows: 'Windows', mac: 'Mac', chromeos: 'Chromebook', linux: 'Linux', lainnya: 'Perangkat' };
  const B = { samsung: 'Samsung Internet', edge: 'Edge', opera: 'Opera', firefox: 'Firefox', chrome: 'Chrome', safari: 'Safari', lainnya: 'Browser' };
  return { status, platform, browser, iosVer, standalone, secure, sw, push, notif, permission, apple, mobile: /Mobi|Android|iPhone|iPad/.test(ua) || touchMac,
    label: `${P[platform]} · ${B[browser]}`, platformName: P[platform], browserName: B[browser] };
}

// Panduan yang cocok untuk perangkat ini
export function guideFor(d) {
  if (d.apple) return 'ios';
  if (d.platform === 'android') return 'android';
  if (d.platform === 'mac' && d.browser === 'safari') return 'mac-safari';
  return 'desktop';
}

// ---------- Identitas perangkat (acak, bukan sidik jari) ----------
export function deviceId() {
  try {
    let id = localStorage.getItem('prasara-device-id');
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)); localStorage.setItem('prasara-device-id', id); }
    return id;
  } catch { return 'tanpa-penyimpanan-' + Math.random().toString(36).slice(2, 10); }
}

const keyBytes = (b64) => { const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'); const r = atob(s); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const bytesKey = (buf) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null);

let keyCache = null;
export async function serverKey() {
  if (keyCache) return keyCache;
  const r = await fetch('/api/notif/kunci', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({ ready: false }));
  if (r.ready) keyCache = r.publicKey;
  return r.ready ? r.publicKey : null;
}
export async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js')); } catch { return null; }
}
async function api(body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Masuk dulu');
  const r = await fetch('/api/notif/langganan', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  const x = await r.json().catch(() => ({}));
  if (!r.ok || x.ok === false) throw new Error(x.error || 'Gagal terhubung ke server');
  return x;
}
async function save(sub, d, key) {
  return api({ action: 'simpan', subscription: sub.toJSON(), device_id: deviceId(), label: d.label, platform: d.platform, browser: d.browser, installed: Boolean(d.standalone), app_key: key });
}

// Status lengkap perangkat ini (untuk kartu aktivasi & Pengaturan)
// kode: tidak_didukung | perlu_pasang | hanya_aplikasi | belum_diminta | ditolak | aktif | dimatikan | perlu_ulang | belum_siap
export async function pushStatus() {
  const d = detect();
  if (d.status === 'D') return { ...d, code: 'tidak_didukung' };
  if (d.status === 'B') return { ...d, code: 'perlu_pasang' };
  if (d.status === 'C') return { ...d, code: 'hanya_aplikasi' };
  if (d.permission === 'denied') return { ...d, code: 'ditolak' };
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (d.permission !== 'granted' || !sub) return { ...d, code: d.permission === 'granted' ? 'perlu_ulang' : 'belum_diminta' };
  try {
    const c = await api({ action: 'cek', endpoint: sub.endpoint, installed: Boolean(d.standalone) });
    if (!c.known || c.status !== 'aktif') return { ...d, code: 'perlu_ulang', sub };
    const key = await serverKey();
    if (key && c.app_key !== key) return { ...d, code: 'perlu_ulang', sub };
    return { ...d, code: c.enabled ? 'aktif' : 'dimatikan', sub, server: c };
  } catch { return { ...d, code: 'belum_siap', sub }; }
}

// Aktifkan — WAJIB dipanggil langsung dari ketukan tombol (izin diminta di baris pertama, syarat Safari & Firefox)
export async function enablePush() {
  const d = detect();
  if (d.status !== 'A') throw new Error(d.status === 'B' ? 'Pasang PRASARA ke Layar Utama dulu, lalu buka dari ikonnya.' : 'Browser ini belum mendukung notifikasi push.');
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Izin notifikasi ditolak. Ubah izinnya di pengaturan browser/HP (lihat Bantuan).' : 'Izin belum diberikan.');
  const [reg, key] = await Promise.all([registration().then((r) => r && navigator.serviceWorker.ready), serverKey()]);
  if (!reg) throw new Error('Service worker tidak aktif di browser ini.');
  if (!key) throw new Error('Server notifikasi belum siap. Coba lagi beberapa saat lagi.');
  let sub = await reg.pushManager.getSubscription();
  if (sub && bytesKey(sub.options?.applicationServerKey) && bytesKey(sub.options.applicationServerKey) !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  return save(sub, d, key);
}

export async function disablePush() {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await api({ action: 'hapus', endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Saat aplikasi dibuka: langganan yang belum dikenal server (ganti akun di HP yang sama, kunci berganti) didaftarkan ulang diam-diam
export async function syncPush() {
  try {
    const d = detect();
    if (d.status !== 'A' || d.permission !== 'granted') return null;
    const st = await pushStatus();
    if (st.code !== 'perlu_ulang') return st.code;
    const key = await serverKey();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && bytesKey(sub.options?.applicationServerKey) !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await save(sub, d, key);
    return 'aktif';
  } catch { return null; }
}

// Dipanggil SEBELUM keluar akun: perangkat ini berhenti menerima notifikasi akun tersebut
export async function notifSignOut() {
  try { await Promise.race([disablePush(), new Promise((r) => setTimeout(r, 2500))]); } catch {}
  try { navigator.clearAppBadge?.(); } catch {}
}

// Kirim uji: buat notifikasi uji lalu bangunkan pengirim
export async function sendTest() {
  const { data, error } = await supabase.rpc('notif_test');
  if (error) throw error;
  const { data: s } = await supabase.auth.getSession();
  await fetch('/api/notif/kirim', { method: 'POST', headers: { authorization: 'Bearer ' + s.session?.access_token } }).catch(() => {});
  return data;
}

// ---------- Suara khusus, getar, badge (saat aplikasi terbuka) ----------
let ctx = null;
export function primeAudio() {
  // AudioContext hanya boleh berbunyi setelah pengguna berinteraksi dengan halaman (aturan autoplay)
  if (ctx || typeof window === 'undefined') return;
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return;
  try { ctx = new A(); } catch { ctx = null; }
}
// Nada PRASARA: dua nada naik lembut (dibuat dengan Web Audio — tanpa file suara)
export function chime(strong = false) {
  try {
    if (!ctx) primeAudio();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const notes = strong ? [784, 1046.5, 1318.5] : [880, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const s = t0 + i * 0.14;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.18, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32);
      o.connect(g).connect(ctx.destination); o.start(s); o.stop(s + 0.34);
    });
    return true;
  } catch { return false; }
}
export function buzz(strong = false) { try { navigator.vibrate?.(strong ? [200, 80, 200, 80, 200] : [140, 70, 140]); } catch {} }
export function setBadge(n) { try { if (n > 0) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch {} }

// ---------- Hitungan belum dibaca bersama (satu polling untuk lonceng & halaman) ----------
const store = { kos: null, data: { unread: 0, unread_all: 0, by_cat: {} }, subs: new Set(), timer: null, at: 0 };
export async function refreshCounts(kos = store.kos) {
  if (!kos) return store.data;
  store.kos = kos;
  const { data } = await supabase.rpc('notif_counts', { p_kos: kos });
  if (data) { store.data = data; store.at = Date.now(); store.subs.forEach((f) => f(data)); setBadge(data.unread_all || 0); }
  return store.data;
}
export function subscribeCounts(kos, fn) {
  store.subs.add(fn); fn(store.data);
  if (store.kos !== kos || Date.now() - store.at > 15000) refreshCounts(kos);
  if (!store.timer) store.timer = setInterval(() => { if (document.visibilityState === 'visible') refreshCounts(); }, 60000);
  return () => { store.subs.delete(fn); if (!store.subs.size) { clearInterval(store.timer); store.timer = null; } };
}

// Waktu relatif singkat dalam Bahasa Indonesia
export function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt';
  if (s < 86400) return Math.floor(s / 3600) + ' jam';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' hari';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
}
