// Chat & tracking pesanan jasa/laundry/kuliner dari halaman Cek status (/b/[slug]/cek): kredensial = nomor pesanan + No. WhatsApp
// yang sama dengan saat memesan (diperiksa ulang di database tiap permintaan, seperti public_order_status). Hanya lewat server.
import { createClient } from '@supabase/supabase-js';
import { portalExchange, readChatBody } from '@/lib/customerExperience';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return json({ error: 'Layanan belum dikonfigurasi.' }, 503);
  const origin = req.headers.get('origin');
  if ((origin && origin !== req.nextUrl.origin) || req.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Permintaan tidak valid.' }, 400);
  let parsed;
  try { parsed = await readChatBody(req); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  if (parsed.tooLarge) return json({ error: 'Lampiran maksimal 3 MB.' }, 413);
  const b = parsed.body;
  if (!b || typeof b !== 'object') return json({ error: 'Permintaan tidak valid.' }, 400);
  const slug = String(b.slug || '').toLowerCase().slice(0, 80);
  const number = String(b.number || '').slice(0, 30);
  const phone = String(b.phone || '').slice(0, 20);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) || !number || phone.replace(/\D/g, '').length < 8) return json({ error: 'Periksa nomor pesanan dan No. WhatsApp.' }, 400);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [data, status] = await portalExchange(sb, b, { access: 'svc', slug, number, phone }, parsed.file);
  return json(data, status);
}
