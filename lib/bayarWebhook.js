// Penerima webhook pembayaran (Tahap D).
// Rumus tanda tangan Lynk (dari dokumentasi resmi): X-Lynk-Signature = sha256(amount + refId + message_id + merchant_key), hex.
// Kunci merchant hanya dibaca di server dari env LYNK_MERCHANT_KEY (Vercel). Tanpa kunci → belum bisa diverifikasi → hanya dicatat.
// Kunci terpasang → pay_event_ingest (aktivasi hanya bila tagihan cocok; lihat migrasi 20261113110000 & 20261113150000).
// Kunci belum terpasang → pay_event_catat (hanya mencatat, tidak pernah mengaktifkan).
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';

export const MAKS_BYTE = 16384;
const PROVIDER_OK = /^[a-z][a-z0-9_]{1,20}$/;
// Nilai header yang bisa berupa rahasia tidak disimpan (namanya tetap dicatat)
const RAHASIA = /authorization|cookie|secret|token|api[-_]?key|(^|[-_])key$/i;

export function adminClient() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

// Kunci idempotensi = hash isi notifikasi: pengiriman ulang isi yang sama hanya menambah penghitung
export function kunciIsi(provider, teks) {
  return provider + ':' + createHash('sha256').update(teks).digest('hex').slice(0, 40);
}

export function headerAman(headers) {
  const out = {};
  let n = 0;
  for (const [k, v] of headers.entries()) {
    if (++n > 40) break;
    out[k.slice(0, 80)] = RAHASIA.test(k) ? '(disembunyikan)' : String(v).slice(0, 300);
  }
  return out;
}

export function isiAman(teks) {
  const payload = { raw: teks.slice(0, 8000), panjang_byte: Buffer.byteLength(teks), json: null };
  try { payload.json = JSON.parse(teks); } catch { /* bukan JSON: cukup disimpan sebagai teks */ }
  return payload;
}

// Verifikasi notifikasi Lynk. Mengembalikan { ok: true|false|null, norm }
//   null  = kunci belum dipasang (tidak bisa diverifikasi)
//   false = tanda tangan hilang / tidak cocok / isi tidak lengkap
export function verifikasiLynk(teks, headers, mentah = process.env.LYNK_MERCHANT_KEY) {
  let j = null;
  try { j = JSON.parse(teks); } catch { /* bukan JSON */ }
  const d = j?.data;
  const md = d?.message_data;
  const ref = md?.refId;
  const msg = d?.message_id;
  const grand = md?.totals?.grandTotal;
  const aksi = d?.message_action;
  const norm = {
    event: j?.event ?? null,
    action: aksi ?? null,
    paid: j?.event === 'payment.received' && aksi === 'SUCCESS',
    ref: ref ?? null,
    amount: typeof grand === 'number' || typeof grand === 'string' ? Number(grand) : null,
    message_id: msg ?? null,
    email: md?.customer?.email ?? null,
    created_at: md?.createdAt ?? null,
  };
  const kunci = (mentah || '').trim();
  if (!kunci) return { ok: null, norm };

  const sig = (headers.get('x-lynk-signature') || '').trim().toLowerCase();
  if (!sig || ref == null || msg == null || grand == null) return { ok: false, norm };

  // Diagnosis aman: hanya panjang, ada/tidaknya spasi, dan NAMA varian yang cocok (kunci & hash tidak disimpan)
  const cocok = (teksSign) => {
    const h = createHash('sha256').update(teksSign).digest('hex');
    const a = Buffer.from(h), b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const nominal = String(grand);
  const nominal2 = typeof grand === 'number' ? grand.toFixed(2) : null;
  const pola = [
    ['kunci_bersih_nominal', nominal, kunci],
    ['kunci_mentah_nominal', nominal, mentah],
    ['kunci_bersih_2desimal', nominal2, kunci],
    ['kunci_mentah_2desimal', nominal2, mentah],
  ].filter(([, n, k]) => n != null && k != null)
   .filter(([, n, k]) => cocok(n + String(ref) + String(msg) + k))
   .map(([nama]) => nama);
  norm.diag = {
    kunci_panjang: kunci.length,
    kunci_ada_spasi: mentah !== kunci,
    nominal_tipe: typeof grand,
    nominal_teks: nominal,
    sig_panjang: sig.length,
    cocok_dengan: pola,
  };
  // Diterima hanya bila format standar dokumentasi cocok (nominal apa adanya, kunci setelah dipangkas)
  return { ok: pola.includes('kunci_bersih_nominal') || pola.includes('kunci_mentah_nominal'), norm };
}

const VERIFIKATOR = { lynk: verifikasiLynk };

export async function catatWebhook(provider, req, db = adminClient()) {
  const json = (obj, status = 200) => Response.json(obj, { status });
  if (!PROVIDER_OK.test(provider || '')) return json({ ok: false, error: 'Tidak ditemukan' }, 404);

  const teks = await req.text();
  if (Buffer.byteLength(teks) > MAKS_BYTE) return json({ ok: false, error: 'Isi terlalu besar' }, 413);
  if (!db) return json({ ok: false, error: 'Penerimaan belum dikonfigurasi' }, 503);

  const v = VERIFIKATOR[provider] ? VERIFIKATOR[provider](teks, req.headers) : { ok: null, norm: null };
  const args = { p_provider: provider, p_event_key: kunciIsi(provider, teks), p_payload: isiAman(teks), p_headers: headerAman(req.headers) };

  // Kunci belum dipasang (ok null) → hanya dicatat, tidak pernah mengaktifkan apa pun.
  // Tanda tangan sudah bisa diperiksa (ok true/false) → pay_event_ingest: satu-satunya jalur aktivasi, dengan semua pemeriksaan tagihan.
  const pakaiIngest = v.ok !== null;
  const { data, error } = pakaiIngest
    ? await db.rpc('pay_event_ingest', { ...args, p_signature_ok: v.ok, p_norm: v.norm })
    : await db.rpc('pay_event_catat', { ...args, p_signature_ok: null, p_norm: v.norm });
  if (error) {
    if (/tidak dikenal/i.test(error.message)) return json({ ok: false, error: 'Tidak ditemukan' }, 404);
    console.error(pakaiIngest ? 'pay_event_ingest' : 'pay_event_catat', error.message);
    return json({ ok: false, error: 'Gagal mencatat' }, 500);
  }
  const hasil = pakaiIngest ? (data?.status ?? null) : data;
  return json({ ok: true, hasil });
}
