// Web Push tanpa layanan berbayar & tanpa paket npm (hanya node:crypto).
// • VAPID (RFC 8292): JWT ES256 ditandatangani kunci privat server → layanan push browser (FCM, Apple, Mozilla) gratis.
// • Enkripsi isi (RFC 8291, aes128gcm): hanya browser pelanggan yang bisa membaca isi; layanan push tidak.
// • Kunci perangkat (p256dh + auth) disimpan TERENKRIPSI AES-256-GCM di database (sealKeys/openKeys).
// Kunci VAPID: env VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT), atau bila env kosong dibuat SEKALI
// oleh server dan disimpan di notif_config (hanya service role) — lihat vapidKeys().
import crypto from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Pasangan kunci VAPID baru (P-256): publik 65 byte tak terkompresi, privat 32 byte — keduanya base64url
export function generateVapid() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' }); const prv = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), privateKey: prv.d };
}

function vapidPrivateKeyObject(publicKey, privateKey) {
  const pub = unb64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Kunci publik VAPID tidak sah');
  return crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
}

// JWT VAPID untuk satu asal layanan push (berlaku 12 jam; di-cache per asal)
export function vapidJwt(audience, { publicKey, privateKey, subject }, now = Math.floor(Date.now() / 1000)) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject || 'mailto:admin@prasara.id' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: vapidPrivateKeyObject(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 8291 — enkripsi isi pesan untuk satu langganan (p256dh & auth dari browser). Satu rekaman (≤ 4096 byte).
export function encryptPayload(plaintext, { p256dh, auth }, opts = {}) {
  const uaPublic = unb64u(p256dh); const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Kunci perangkat tidak sah');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(opts.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt || crypto.randomBytes(16);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]);       // 0x02 = rekaman terakhir
  if (data.length + 16 > 4096 - 86) throw new Error('Isi notifikasi terlalu panjang');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

// Kebalikan encryptPayload (dipakai uji otomatis untuk membuktikan enkripsi benar; browser melakukan ini sendiri)
export function decryptPayload(body, { uaPrivate, uaPublic, auth }) {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPublic = body.subarray(21, 21 + idlen); const enc = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const prkKey = hmac(unb64u(auth), shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), unb64u(uaPublic), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(enc.subarray(enc.length - 16));
  const out = Buffer.concat([d.update(enc.subarray(0, enc.length - 16)), d.final()]);
  let end = out.length - 1; while (end >= 0 && out[end] === 0) end--;   // buang bantalan
  if (out[end] !== 2) throw new Error('Penanda rekaman salah');
  return out.subarray(0, end).toString();
}

// ---------- Kunci perangkat terenkripsi di database ----------
const sealKey = (vapidPrivate) => crypto.createHash('sha256').update('prasara-push-keys:' + (process.env.PUSH_KEYS_SECRET || vapidPrivate)).digest();
export function sealKeys(keys, vapidPrivate) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sealKey(vapidPrivate), iv);
  const enc = Buffer.concat([c.update(JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth })), c.final()]);
  return 'v1.' + b64u(Buffer.concat([iv, c.getAuthTag(), enc]));
}
export function openKeys(sealed, vapidPrivate) {
  const raw = unb64u(String(sealed).replace(/^v1\./, ''));
  const d = crypto.createDecipheriv('aes-256-gcm', sealKey(vapidPrivate), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString());
}

// Topic (≤ 32 karakter base64url): push yang belum terkirim dengan topik sama DITIMPA layanan push → hemat & tidak menumpuk
export const topicOf = (tag) => b64u(crypto.createHash('sha256').update(String(tag)).digest()).slice(0, 32);

const TTL = { kritis: 24 * 3600, tinggi: 12 * 3600, normal: 4 * 3600, info: 3600 };
const URGENCY = { kritis: 'high', tinggi: 'high', normal: 'normal', info: 'low' };

// Kirim satu push. Hasil: { status: 'diterima'|'kedaluwarsa'|'ditunda'|'gagal', http, error }
// "diterima" = layanan push menerima pesan (BUKAN bukti pengguna melihatnya).
export async function sendPush({ endpoint, keys, payload, priority = 'normal', tag, vapid, jwtCache, timeoutMs = 10000 }) {
  let url;
  try { url = new URL(endpoint); } catch { return { status: 'kedaluwarsa', http: 0, error: 'endpoint tidak sah' }; }
  if (url.protocol !== 'https:') return { status: 'kedaluwarsa', http: 0, error: 'endpoint bukan https' };
  const aud = url.origin;
  let jwt = jwtCache?.get(aud);
  if (!jwt) { jwt = vapidJwt(aud, vapid); jwtCache?.set(aud, jwt); }
  let body;
  try { body = encryptPayload(JSON.stringify(payload), keys); } catch (e) { return { status: 'kedaluwarsa', http: 0, error: e.message }; }
  const headers = {
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(TTL[priority] || 3600),
    Urgency: URGENCY[priority] || 'normal', Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
  };
  if (tag) headers.Topic = topicOf(tag);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(endpoint, { method: 'POST', headers, body, signal: ctl.signal });
    const txt = r.ok ? '' : (await r.text().catch(() => '')).slice(0, 200);
    if (r.status >= 200 && r.status < 300) return { status: 'diterima', http: r.status };
    if (r.status === 404 || r.status === 410) return { status: 'kedaluwarsa', http: r.status, error: 'langganan sudah tidak berlaku' };
    if (r.status === 401 || r.status === 403) return { status: 'kedaluwarsa', http: r.status, error: 'kunci VAPID tidak cocok' + (txt ? ': ' + txt : '') };
    if (r.status === 429 || r.status >= 500) return { status: 'ditunda', http: r.status, error: `HTTP ${r.status}` };
    return { status: 'gagal', http: r.status, error: `HTTP ${r.status}${txt ? ': ' + txt : ''}` };
  } catch (e) {
    return { status: 'ditunda', http: 0, error: e.name === 'AbortError' ? 'waktu habis' : String(e.message || e).slice(0, 200) };
  } finally { clearTimeout(timer); }
}
