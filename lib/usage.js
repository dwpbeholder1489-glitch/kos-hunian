'use client';
// Pencatat pemakaian (Adaptive Experience Fase 7, §28). Hanya mencatat JUMLAH: menu yang dibuka (path tanpa query/ID)
// dan aksi cepat yang diketuk. Dikirim berkelompok ke exp_track (server menelan semua galat — tidak pernah mengganggu kerja).
// Pemakaian sendiri dari server (exp_usage_mine, 60 hari, semua perangkat) dipakai untuk urutan tombol (+).
import { supabase } from '@/lib/supabase';

const queue = new Map();            // kosId → Map("kind|key" → n)
let timer = null;
const mine = {};                    // kosId → { aksi:{}, menu:{} } dari server (+ yang baru diketuk)
const loading = {};

function flush() {
  timer = null;
  for (const [kosId, m] of queue) {
    if (!m.size) continue;
    const events = [...m].slice(0, 50).map(([k, n]) => { const [kind, key] = k.split('|'); return { k: kind, key, n: Math.min(n, 20) }; });
    queue.set(kosId, new Map([...m].slice(50)));
    supabase.rpc('exp_track', { p_kos: kosId, p_events: events }).then(() => {}, () => {});
  }
}
function schedule(ms = 8000) {
  if (typeof window === 'undefined') return;
  if (!timer) timer = setTimeout(flush, ms);
}
if (typeof window !== 'undefined') {
  const now = () => { if (timer) { clearTimeout(timer); timer = null; } flush(); };
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') now(); });
}

export function track(kosId, kind, key) {
  if (!kosId || !key || (kind !== 'menu' && kind !== 'aksi')) return;
  const m = queue.get(kosId) || new Map();
  const k = `${kind}|${key}`;
  m.set(k, (m.get(k) || 0) + 1);
  queue.set(kosId, m);
  if (mine[kosId]) { const b = mine[kosId][kind] || (mine[kosId][kind] = {}); b[key] = (b[key] || 0) + 1; }
  schedule();
}

// '/struk/abc-123?x=1' → '/struk'; '/catatan/proyek' tetap 2 bagian (jenis data kustom)
export function menuKey(path) {
  const seg = String(path || '').split('?')[0].split('#')[0].split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (!seg.length) return null;
  const key = seg[0] === 'catatan' && seg[1] ? `/catatan/${seg[1]}` : `/${seg[0]}`;
  return /^\/[a-z0-9-]{1,40}(\/[a-z0-9_-]{1,40})?$/.test(key) ? key : null;
}
export const trackMenu = (kosId, path) => { const k = menuKey(path); if (k) track(kosId, 'menu', k); };

// Muat pemakaian sendiri dari server sekali per bisnis per sesi
export function loadMine(kosId) {
  if (!kosId || mine[kosId] || loading[kosId]) return;
  loading[kosId] = true;
  supabase.rpc('exp_usage_mine', { p_kos: kosId }).then(({ data, error }) => {
    loading[kosId] = false;
    if (!error && data) mine[kosId] = { aksi: { ...(data.aksi || {}) }, menu: { ...(data.menu || {}) } };
  }, () => { loading[kosId] = false; });
}
// null = belum dimuat (pemanggil memakai cadangan per perangkat)
export const mineAksi = (kosId) => (mine[kosId] ? mine[kosId].aksi : null);
