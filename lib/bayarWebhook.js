// Penerima webhook pembayaran (Tahap D, MODE CATAT SAJA).
// Notifikasi dari luar TIDAK dipercaya: isinya hanya disimpan ke pay_events (status 'diabaikan') untuk diperiksa.
// Tidak ada tagihan yang dilunasi dan tidak ada paket yang diaktifkan dari jalur ini.
// Format & tanda tangan penyedia baru dipakai setelah diverifikasi dari notifikasi nyata (lihat CLAUDE.md).
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

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

export async function catatWebhook(provider, req, db = adminClient()) {
  const json = (obj, status = 200) => Response.json(obj, { status });
  if (!PROVIDER_OK.test(provider || '')) return json({ ok: false, error: 'Tidak ditemukan' }, 404);

  const teks = await req.text();
  if (Buffer.byteLength(teks) > MAKS_BYTE) return json({ ok: false, error: 'Isi terlalu besar' }, 413);
  if (!db) return json({ ok: false, error: 'Penerimaan belum dikonfigurasi' }, 503);

  const { data, error } = await db.rpc('pay_event_catat', {
    p_provider: provider,
    p_event_key: kunciIsi(provider, teks),
    p_payload: isiAman(teks),
    p_headers: headerAman(req.headers),
  });
  if (error) {
    if (/tidak dikenal/i.test(error.message)) return json({ ok: false, error: 'Tidak ditemukan' }, 404);
    console.error('pay_event_catat', error.message);
    return json({ ok: false, error: 'Gagal mencatat' }, 500);
  }
  return json({ ok: true, hasil: data });
}
