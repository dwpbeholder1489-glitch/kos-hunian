// Uji kriptografi Web Push (lib/webpush.js): vektor uji resmi RFC 8291 Lampiran A, JWT VAPID ES256, simpan kunci terenkripsi.
// node supabase/tests/notifikasi_push_js.mjs  → baris terakhir "N lulus, 0 gagal"
import crypto from 'node:crypto';
const { b64u, unb64u, generateVapid, vapidJwt, encryptPayload, decryptPayload, sealKeys, openKeys, topicOf } = await import(new URL('../../lib/webpush.js', import.meta.url));
const { pushPayload } = await import(new URL('../../lib/notifPayload.js', import.meta.url));
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('GAGAL', name); } };

// 1) RFC 8291 Lampiran A (hasil harus SAMA PERSIS byte demi byte)
const V = {
  plain: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw', auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const enc = encryptPayload(V.plain, { p256dh: V.uaPublic, auth: V.auth }, { asPrivate: unb64u(V.asPrivate), salt: unb64u(V.salt) });
t('rfc8291_vektor_resmi', b64u(enc) === V.body);
t('rfc8291_bisa_dibuka', decryptPayload(unb64u(V.body), { uaPrivate: unb64u(V.uaPrivate), uaPublic: V.uaPublic, auth: V.auth }) === V.plain);

// 2) Perangkat acak: enkripsi → dekripsi, kunci salah gagal
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = b64u(crypto.randomBytes(16));
const msg = JSON.stringify({ t: 'Pesanan baru', b: 'Toko · Ada pesanan baru', u: '/pusat-notifikasi/buka/x' });
const c1 = encryptPayload(msg, { p256dh: b64u(ua.getPublicKey()), auth });
t('acak_bolak_balik', decryptPayload(c1, { uaPrivate: ua.getPrivateKey(), uaPublic: b64u(ua.getPublicKey()), auth }) === msg);
const other = crypto.createECDH('prime256v1'); other.generateKeys();
let threw = false; try { decryptPayload(c1, { uaPrivate: other.getPrivateKey(), uaPublic: b64u(ua.getPublicKey()), auth }); } catch { threw = true; }
t('kunci_lain_tidak_bisa_membaca', threw);
t('salt_acak_tiap_kirim', b64u(c1.subarray(0, 16)) !== b64u(encryptPayload(msg, { p256dh: b64u(ua.getPublicKey()), auth }).subarray(0, 16)));
threw = false; try { encryptPayload('x'.repeat(4000), { p256dh: b64u(ua.getPublicKey()), auth }); } catch { threw = true; }
t('isi_terlalu_besar_ditolak', threw);
threw = false; try { encryptPayload('x', { p256dh: 'abc', auth }); } catch { threw = true; }
t('kunci_perangkat_rusak_ditolak', threw);

// 3) VAPID: kunci P-256 & JWT ES256 yang bisa diverifikasi dengan kunci publik
const k = generateVapid();
t('vapid_publik_65_byte', unb64u(k.publicKey).length === 65 && unb64u(k.publicKey)[0] === 4);
t('vapid_privat_32_byte', unb64u(k.privateKey).length === 32);
const jwt = vapidJwt('https://fcm.googleapis.com', { ...k, subject: 'mailto:a@b.c' }, 1_800_000_000);
const [h, p, s] = jwt.split('.');
const pub = unb64u(k.publicKey);
const pubKey = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
t('jwt_tanda_tangan_sah', crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pubKey, dsaEncoding: 'ieee-p1363' }, unb64u(s)));
const claims = JSON.parse(unb64u(p).toString());
t('jwt_klaim', claims.aud === 'https://fcm.googleapis.com' && claims.sub === 'mailto:a@b.c' && claims.exp === 1_800_000_000 + 43200);
t('jwt_header_es256', JSON.parse(unb64u(h).toString()).alg === 'ES256');
t('jwt_maks_24_jam', claims.exp - 1_800_000_000 <= 86400);

// 4) Kunci perangkat tersimpan terenkripsi
const sealed = sealKeys({ p256dh: 'P256', auth: 'AUTH' }, k.privateKey);
t('segel_tidak_memuat_teks_asli', !sealed.includes('P256') && sealed.startsWith('v1.'));
t('segel_bolak_balik', openKeys(sealed, k.privateKey).auth === 'AUTH');
threw = false; try { openKeys(sealed, generateVapid().privateKey); } catch { threw = true; }
t('segel_kunci_lain_gagal', threw);
threw = false; try { const raw = unb64u(sealed.slice(3)); raw[raw.length - 1] ^= 1; openKeys('v1.' + b64u(raw), k.privateKey); } catch { threw = true; }
t('segel_diubah_terdeteksi', threw);

// 5) Topic & isi push
const top = topicOf('a1b2:SaleCreated');
t('topik_maks_32_base64url', top.length <= 32 && /^[A-Za-z0-9_-]+$/.test(top));
const pl = pushPayload({ notif_id: 'n1', title: 'Pembayaran diterima', body: 'Pembayaran INV-1 · Rp 1.200.000 · transfer', kos_name: 'Kos Mawar', tag: 'x', priority: 'normal', unread: 3, hide_amount: true });
t('nominal_disembunyikan_di_layar_kunci', !pl.b.includes('1.200.000') && pl.b.includes('Rp •••'));
t('tautan_ke_pembuka_aman', pl.u === '/pusat-notifikasi/buka/n1');
const pl2 = pushPayload({ notif_id: 'n1', title: 'X', body: 'Rp 5.000', tag: 'x', priority: 'normal', hide_amount: false });
t('nominal_tampil_bila_diizinkan', pl2.b.includes('Rp 5.000'));
t('isi_push_kecil', JSON.stringify(pl).length < 600);

console.log(`${ok} lulus, ${bad} gagal`);
process.exit(bad ? 1 : 0);
