// Persetujuan / penolakan kontrak oleh penyewa (/k/[token]). Ditulis HANYA lewat server (kunci rahasia) ke contract_public_respond;
// alamat IP tidak disimpan — hanya sidik SHA-256 (IP + garam server) sebagai bagian jejak audit.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s, headers: { 'Cache-Control': 'no-store' } });
const str = (v, n) => String(v ?? '').slice(0, n);

export async function POST(req) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Layanan kontrak belum dikonfigurasi.' }, 503);
  if (req.headers.get('sec-fetch-site') === 'cross-site') return json({ ok: false, error: 'Permintaan tidak valid.' }, 400);
  let b;
  try { b = await req.json(); if (!b || typeof b !== 'object') throw new Error(); } catch { return json({ ok: false, error: 'Permintaan tidak valid' }, 400); }
  const token = str(b.token, 80);
  if (token.length < 40) return json({ ok: false, error: 'Link tidak berlaku.' }, 400);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'tanpa-ip';
  const ipHash = createHash('sha256').update(ip + ':' + (process.env.PUSH_KEYS_SECRET || key.slice(-16))).digest('hex').slice(0, 32);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('contract_public_respond', { p_token: token, p_decision: str(b.decision, 10), p_name: str(b.name, 80), p_note: str(b.note, 500) || null, p_ip_hash: ipHash, p_hash: str(b.hash, 64) });
  if (error) { console.error('[kontrak] gagal', error.message); return json({ ok: false, error: 'Gagal menyimpan. Coba lagi nanti.' }, 500); }
  return json(data?.ok ? { ok: true } : { ok: false, error: data?.error || 'Gagal' }, data?.ok ? 200 : 400);
}
