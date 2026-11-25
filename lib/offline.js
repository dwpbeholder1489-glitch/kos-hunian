'use client';
// Kasir offline (Tahap 4 Retail): penyimpanan di HP (IndexedDB), antrean penjualan, pengiriman otomatis.
// Server: pos_offline_submit (idempoten per id transaksi; waktu transaksi dari HP; temuan untuk pemilik).
import { supabase } from '@/lib/supabase';
import { errMsg } from '@/lib/format';

const DB = 'prasara-offline';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('Penyimpanan HP tidak tersedia'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
function run(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    let out;
    const r = fn(t.objectStore(store));
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Penyimpanan HP penuh atau ditolak'));
  }));
}
export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)).catch(() => {});
const qAllRaw = () => run('queue', 'readonly', (s) => s.getAll()).then((x) => x || []).catch(() => []);
const qPut = (e) => run('queue', 'readwrite', (s) => s.put(e));
export const qDel = (id) => run('queue', 'readwrite', (s) => s.delete(id)).then(() => emit());

// ---------- status jaringan & jenis galat ----------
export const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
// Galat jaringan dari supabase-js: tanpa kode server, pesan "Failed to fetch" (Chrome) / "Load failed" (Safari) / "NetworkError" (Firefox)
export const isNetErr = (e) => {
  if (!e) return false;
  if (!online()) return true;
  const m = String(e.message || e);
  return !e.code && /failed to fetch|load failed|networkerror|network request failed|fetch failed|aborted|timed? ?out|err_internet|offline/i.test(m);
};
export const isAuthErr = (e) => Boolean(e) && (e.code === 'PGRST301' || e.code === 'PGRST302' || /jwt (expired|invalid)|invalid jwt|masuk dulu/i.test(String(e.message || '')));

// ---------- identitas HP ----------
export function deviceId() {
  try {
    let d = localStorage.getItem('prasara-device');
    if (!d) { d = 'hp-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('prasara-device', d); }
    return d;
  } catch { return 'hp'; }
}

// ---------- sesi saat offline ----------
// supabase-js mengosongkan sesi bila token kedaluwarsa dan pembaruannya gagal karena jaringan, tetapi TIDAK menghapus
// token tersimpan (hanya dihapus saat keluar/ditolak server). Token yang masih ada = sesi sah yang menunggu internet.
export function offlineSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^sb-.+-auth-token$/.test(k || '')) continue;
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      const v = s?.currentSession || s;
      if (v?.refresh_token && v?.user?.id) return { ...v, offline: true };
    }
  } catch {}
  return null;
}
// Daftar bisnis terakhir (untuk membuka aplikasi tanpa internet)
export const cacheKosList = (uid, list) => { try { localStorage.setItem('prasara.kos.cache.' + uid, JSON.stringify({ at: Date.now(), list })); } catch {} };
export const cachedKosList = (uid) => { try { return JSON.parse(localStorage.getItem('prasara.kos.cache.' + uid) || 'null')?.list || null; } catch { return null; } };

// ---------- katalog Kasir ----------
export const saveCatalog = (uid, kos, data) => kvSet('cat:' + uid + ':' + kos, { at: Date.now(), data });
export const loadCatalog = (uid, kos) => kvGet('cat:' + uid + ':' + kos);

// ---------- antrean ----------
const subs = new Set();
export function onQueue(f) { subs.add(f); return () => subs.delete(f); }
function emit() { subs.forEach((f) => { try { f(); } catch {} }); }

const DAY = 864e5;
// Semua entri (antre + riwayat). Riwayat terkirim tanpa temuan dibuang setelah 3 hari, yang bertemuan setelah 14 hari.
export async function qAll() {
  const all = await qAllRaw();
  const now = Date.now();
  const old = all.filter((e) => e.done_at && now - Date.parse(e.done_at) > (e.state === 'tersimpan' ? 3 : 14) * DAY);
  for (const e of old) await run('queue', 'readwrite', (s) => s.delete(e.id)).catch(() => {});
  return all.filter((e) => !old.includes(e)).sort((a, b) => (a.at < b.at ? 1 : -1));
}
export const pendingOf = (list, kos) => list.filter((e) => e.state === 'antre' && (!kos || e.kos === kos));
// Stok yang sudah terjual di HP tetapi belum terkirim (satuan utama), supaya stok di Kasir tidak terlihat lebih banyak
export function pendingStock(list, kos) {
  const m = {};
  for (const e of pendingOf(list, kos)) for (const l of e.view?.lines || []) m[l.product_id] = (m[l.product_id] || 0) + Number(l.qty) * Number(l.unit_qty || 1);
  return m;
}
// Nomor sementara di struk sebelum terkirim: OFF-<hp>-<jam>
export const localNumber = (dev) => 'OFF-' + String(dev || '').replace(/^hp-/, '').slice(0, 4).toUpperCase() + '-' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');

export async function enqueue(entry) {
  await qPut({ ...entry, state: 'antre', tries: 0, err: null });
  emit();
}

// Kirim semua antrean milik akun ini, berurutan (urutan waktu transaksi). Berhenti saat jaringan putus / sesi perlu diperbarui.
let busy = null;
export function syncNow(userId) {
  if (!userId || !online()) return Promise.resolve({ saved: 0, review: 0, failed: 0, pending: 0, stop: online() ? null : 'net' });
  if (busy) return busy;
  busy = (async () => {
    let saved = 0, review = 0, failed = 0, pending = 0, stop = null;
    try {
      const all = (await qAllRaw()).filter((e) => e.state === 'antre' && e.user === userId).sort((a, b) => (a.at < b.at ? -1 : 1));
      for (const e of all) {
        const { data, error } = await supabase.rpc('pos_offline_submit', { p_kos: e.kos, p_tx: e.payload });
        if (error) {
          if (isNetErr(error)) { stop = 'net'; break; }
          if (isAuthErr(error)) { stop = 'auth'; break; }
          // Ditolak tanpa dicatat server (mis. akses belum pernah ada, bisnis ditutup) → tetap di HP dengan pesan
          await qPut({ ...e, tries: (e.tries || 0) + 1, err: errMsg(error) });
          pending++;
          continue;
        }
        await qPut({ ...e, state: data.status, result: data, err: null, done_at: new Date().toISOString() });
        if (data.status === 'tersimpan') saved++;
        if (data.status === 'perlu_cek') review++;
        if (data.status === 'gagal') failed++;
        emit();
      }
    } finally { busy = null; emit(); }
    return { saved, review, failed, pending, stop };
  })();
  return busy;
}

// Entri milik akun lain di HP ini (kasir lain lupa mengirim sebelum keluar): pemilik/pengelola bisa mengirim atas namanya sendiri
export async function adopt(entry, userId, byName) {
  const note = [entry.payload.note, `Dicatat offline oleh ${entry.userName || 'akun lain'}${byName ? `, dikirim ${byName}` : ''}`].filter(Boolean).join(' · ');
  await qPut({ ...entry, user: userId, err: null, payload: { ...entry.payload, note } });
  emit();
}
