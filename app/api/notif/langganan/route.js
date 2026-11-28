// Daftarkan / cek / hapus langganan push perangkat ini untuk akun yang sedang masuk.
// Kunci perangkat (p256dh, auth) dienkripsi di sini sebelum disimpan; browser tidak pernah membacanya kembali.
import { adminDb } from '@/lib/reminders';
import { vapidKeys, userFromRequest } from '@/lib/notifServer';
import { sealKeys, unb64u } from '@/lib/webpush';

export const dynamic = 'force-dynamic';
const no = (error, status = 400) => Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
const txt = (v, n) => String(v || '').replace(/[^\p{L}\p{N} ._()·-]/gu, '').slice(0, n);
// Layanan push browser yang dikenal (endpoint lain ditolak: mencegah server dipakai menembak alamat sembarang)
const HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/];
const okEndpoint = (e) => { try { const u = new URL(e); return u.protocol === 'https:' && e.length <= 1000 && HOSTS.some((h) => h.test(u.hostname)); } catch { return false; } };

export async function POST(req) {
  const sb = adminDb();
  if (!sb) return no('Server belum dikonfigurasi', 503);
  const user = await userFromRequest(req);
  if (!user) return no('Masuk dulu', 401);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return no('Permintaan tidak valid');
  const endpoint = String(b.subscription?.endpoint || b.endpoint || '');
  if (!okEndpoint(endpoint)) return no('Alamat layanan push tidak dikenal');

  if (b.action === 'hapus') {
    const { error } = await sb.rpc('push_sub_remove', { p_user: user.id, p_endpoint: endpoint });
    return error ? no('Gagal menghapus perangkat', 500) : Response.json({ ok: true });
  }
  if (b.action === 'cek') {
    const { data, error } = await sb.rpc('push_sub_check', { p_user: user.id, p_endpoint: endpoint, p_installed: b.installed === true });
    return error ? no('Gagal memeriksa perangkat', 500) : Response.json({ ok: true, ...data });
  }
  // simpan
  const keys = b.subscription?.keys || {};
  try { if (unb64u(keys.p256dh).length !== 65 || unb64u(keys.auth).length < 16) throw 0; } catch { return no('Kunci perangkat tidak sah'); }
  const device = String(b.device_id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) return no('Identitas perangkat tidak sah');
  const vapid = await vapidKeys(sb).catch(() => null);
  if (!vapid) return no('Kunci notifikasi belum siap', 503);
  if (b.app_key && b.app_key !== vapid.publicKey) return no('Kunci notifikasi sudah berganti. Muat ulang halaman lalu aktifkan lagi.', 409);
  const { data, error } = await sb.rpc('push_sub_save', {
    p_user: user.id, p_endpoint: endpoint, p_keys_enc: sealKeys(keys, vapid.privateKey), p_app_key: vapid.publicKey, p_device: device,
    p_label: txt(b.label, 60) || 'Perangkat', p_platform: txt(b.platform, 20) || 'lainnya', p_browser: txt(b.browser, 20) || 'lainnya', p_installed: b.installed === true,
  });
  if (error) return no('Gagal menyimpan perangkat', 500);
  return Response.json({ ok: true, ...data });
}
