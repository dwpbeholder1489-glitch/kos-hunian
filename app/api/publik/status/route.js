// Cek status pesanan oleh pelanggan: nomor pesanan + No. WhatsApp yang sama (fungsi public_order_status, kunci server).
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s });

export async function POST(req) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Layanan belum dikonfigurasi.' }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'Permintaan tidak valid' }, 400); }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('public_order_status', { p_slug: String(b.slug || '').slice(0, 40), p_number: String(b.number || '').slice(0, 30), p_phone: String(b.phone || '').slice(0, 20) });
  if (error) { console.error('[publik] status gagal', error.message); return json({ ok: false, error: 'Gagal memuat. Coba lagi nanti.' }, 500); }
  return json(data || { ok: false, error: 'Pesanan tidak ditemukan.' }, data?.ok ? 200 : 404);
}
