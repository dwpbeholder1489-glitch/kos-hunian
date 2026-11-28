// Pengirim push PRASARA (server). Dipanggil /api/notif/kirim (dibangunkan pg_net seketika, pg_cron tiap menit bila ada,
// tombol Uji, cron harian). Antrean & aturan ada di database (notif_claim/notif_report); di sini hanya enkripsi & kirim.
import { createClient } from '@supabase/supabase-js';
import { adminDb } from '@/lib/reminders';
import { generateVapid, openKeys, sendPush } from '@/lib/webpush';
import { pushPayload } from '@/lib/notifPayload';

let cached = null;
// Kunci VAPID: env (bila lengkap) diutamakan; kalau tidak, dibuat SEKALI & disimpan di notif_config (hanya service role)
export async function vapidKeys(sb = adminDb()) {
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@prasara.id';
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject, source: 'env' };
  if (cached) return cached;
  if (!sb) return null;
  const { data, error } = await sb.rpc('notif_config_get');
  if (error) throw error;
  let pub = data?.vapid_public, prv = data?.vapid_private;
  if (!pub || !prv) {
    const k = generateVapid();
    const r = await sb.rpc('notif_vapid_init', { p_public: k.publicKey, p_private: k.privateKey });
    if (r.error) throw r.error;
    pub = r.data?.vapid_public; prv = r.data?.vapid_private; // bila server lain lebih dulu membuat, pakai miliknya
  }
  cached = pub && prv ? { publicKey: pub, privateKey: prv, subject, source: 'database' } : null;
  return cached;
}

// Pengguna dari token sesi (Bearer) — HANYA untuk memastikan siapa yang meminta; data tetap lewat RPC service role
export async function userFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await c.auth.getUser(token).catch(() => ({ data: null }));
  return data?.user || null;
}

const quiet = (p) => Promise.resolve(p).catch(() => null);
async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// Satu putaran pengiriman: ambil antrean jatuh tempo (berkelompok), kirim ke semua perangkat, laporkan. Berhenti bila kosong / waktu habis.
export async function dispatch({ origin, budgetMs = 45000, reason = 'manual' } = {}) {
  const sb = adminDb();
  if (!sb) return { ok: true, skipped: 'SUPABASE_SECRET_KEY belum dipasang' };
  const t0 = Date.now();
  if (origin && /^https:\/\//.test(origin)) await quiet(sb.rpc('notif_config_set', { p_app_url: origin, p_run: null }));
  const vapid = await vapidKeys(sb);
  if (!vapid) return { ok: false, error: 'Kunci VAPID tidak tersedia' };
  const jwtCache = new Map();
  const sum = { putaran: 0, item: 0, diterima: 0, ditunda: 0, kedaluwarsa: 0, gagal: 0, alasan: reason };
  while (Date.now() - t0 < budgetMs) {
    const { data: items, error } = await sb.rpc('notif_claim', { p_limit: 100 });
    if (error) return { ok: false, error: error.message, ...sum };
    if (!items?.length) break;
    sum.putaran++; sum.item += items.length;
    const results = await pool(items, 8, async (it) => {
      if (!it.member_ok) return { queue_id: it.queue_id, outcome: 'dilewati', error: 'penerima bukan anggota lagi', subs: [] };
      if (!it.subs?.length) return { queue_id: it.queue_id, outcome: 'dilewati', error: 'tidak ada perangkat aktif', subs: [] };
      const payload = pushPayload(it);
      const subs = await pool(it.subs, 4, async (s) => {
        if (s.app_key !== vapid.publicKey) return { id: s.id, status: 'kedaluwarsa', http: 0, error: 'kunci VAPID berganti; perangkat perlu mengaktifkan ulang' };
        let keys; try { keys = openKeys(s.keys, vapid.privateKey); } catch { return { id: s.id, status: 'kedaluwarsa', http: 0, error: 'kunci perangkat tidak bisa dibuka' }; }
        const r = await sendPush({ endpoint: s.endpoint, keys, payload, priority: it.priority, tag: it.tag, vapid, jwtCache });
        sum[r.status] = (sum[r.status] || 0) + 1;
        return { id: s.id, ...r };
      });
      const ok = subs.some((x) => x.status === 'diterima');
      const later = subs.some((x) => x.status === 'ditunda');
      return { queue_id: it.queue_id, outcome: ok ? 'terkirim' : later ? 'ulang' : 'gagal', error: ok ? null : subs.map((x) => x.error).filter(Boolean)[0] || null, subs };
    });
    const rep = await sb.rpc('notif_report', { p_results: results });
    if (rep.error) return { ok: false, error: rep.error.message, ...sum };
    if (items.length < 100) break;
  }
  const res = { ok: true, ...sum, ms: Date.now() - t0, kunci: vapid.source };
  await quiet(sb.rpc('notif_config_set', { p_app_url: null, p_run: res }));
  return res;
}
