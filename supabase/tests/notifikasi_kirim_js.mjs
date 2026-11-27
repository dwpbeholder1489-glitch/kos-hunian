// Uji pengiriman push (lib/webpush.js sendPush) ke LAYANAN PUSH TIRUAN lokal (HTTPS, sertifikat sementara):
// layanan tiruan memverifikasi JWT VAPID dengan kunci publik dari header, membaca header TTL/Urgency/Topic/Content-Encoding,
// mendekripsi isi dengan kunci "browser", lalu menjawab 201 / 410 / 503 / 429 sesuai jalur.
// node supabase/tests/notifikasi_kirim_js.mjs  → baris terakhir "N lulus, 0 gagal"
import crypto from 'node:crypto';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // hanya untuk sertifikat uji lokal
const { b64u, unb64u, generateVapid, decryptPayload, sendPush, topicOf } = await import(new URL('../../lib/webpush.js', import.meta.url));
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('GAGAL', name); } };

const dir = mkdtempSync(join(tmpdir(), 'pushuji-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });

const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = b64u(crypto.randomBytes(16));
const keys = { p256dh: b64u(ua.getPublicKey()), auth };
const vapid = { ...generateVapid(), subject: 'mailto:uji@prasara.id' };
const seen = [];
const srv = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.authorization || '');
    let jwtOk = false, aud = null, text = null;
    if (m) {
      const [h, p, s] = m[1].split('.'); const pub = unb64u(m[2]);
      const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
      jwtOk = crypto.verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
      aud = JSON.parse(unb64u(p).toString()).aud;
    }
    try { text = decryptPayload(body, { uaPrivate: ua.getPrivateKey(), uaPublic: keys.p256dh, auth }); } catch {}
    seen.push({ path: req.url, jwtOk, aud, text, h: req.headers });
    const code = { '/ok': 201, '/hilang': 410, '/sibuk': 503, '/batas': 429, '/salah': 400 }[req.url] || 404;
    res.writeHead(code); res.end();
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `https://localhost:${srv.address().port}`;
const payload = { id: 'n1', t: 'Pesanan baru', b: 'Toko · PSN-1', u: '/pusat-notifikasi/buka/n1', tag: 'k:ServiceOrderRequested', p: 'tinggi', n: 2 };
const cache = new Map();

const r1 = await sendPush({ endpoint: base + '/ok', keys, payload, priority: 'tinggi', tag: payload.tag, vapid, jwtCache: cache });
const s1 = seen.at(-1);
t('diterima_201', r1.status === 'diterima' && r1.http === 201);
t('jwt_vapid_sah_di_layanan', s1.jwtOk && s1.aud === base);
t('isi_terbaca_hanya_dengan_kunci_browser', s1.text && JSON.parse(s1.text).t === 'Pesanan baru');
t('header_enkripsi', s1.h['content-encoding'] === 'aes128gcm' && s1.h['content-type'] === 'application/octet-stream');
t('ttl_urgensi_prioritas_tinggi', s1.h.ttl === String(12 * 3600) && s1.h.urgency === 'high');
t('topic_untuk_menimpa', s1.h.topic === topicOf(payload.tag));
const r1b = await sendPush({ endpoint: base + '/ok', keys, payload, priority: 'info', vapid, jwtCache: cache });
t('jwt_dipakai_ulang_per_asal', cache.size === 1 && r1b.status === 'diterima');
t('info_urgensi_rendah', seen.at(-1).h.urgency === 'low' && seen.at(-1).h.ttl === '3600' && !seen.at(-1).h.topic);
t('410_langganan_kedaluwarsa', (await sendPush({ endpoint: base + '/hilang', keys, payload, vapid, jwtCache: cache })).status === 'kedaluwarsa');
t('404_langganan_kedaluwarsa', (await sendPush({ endpoint: base + '/tidakada', keys, payload, vapid, jwtCache: cache })).status === 'kedaluwarsa');
t('503_ditunda_untuk_diulang', (await sendPush({ endpoint: base + '/sibuk', keys, payload, vapid, jwtCache: cache })).status === 'ditunda');
t('429_ditunda', (await sendPush({ endpoint: base + '/batas', keys, payload, vapid, jwtCache: cache })).status === 'ditunda');
t('400_gagal_permanen', (await sendPush({ endpoint: base + '/salah', keys, payload, vapid, jwtCache: cache })).status === 'gagal');
t('http_biasa_ditolak', (await sendPush({ endpoint: 'http://localhost/x', keys, payload, vapid })).status === 'kedaluwarsa');
t('kunci_rusak_tidak_dikirim', (await sendPush({ endpoint: base + '/ok', keys: { p256dh: 'x', auth }, payload, vapid })).status === 'kedaluwarsa');
const r9 = await sendPush({ endpoint: 'https://127.0.0.1:1/x', keys, payload, vapid, timeoutMs: 2000 });
t('tak_terjangkau_ditunda', r9.status === 'ditunda');
srv.close();
console.log(`${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
