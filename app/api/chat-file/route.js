// Lampiran chat pelanggan dari sisi staf (pemilik/kasir/operasional). Izin SELALU dari database atas nama pengguna
// (cx_thread / cx_file_staff memeriksa member_in area chat); kunci server hanya untuk menyimpan & menandatangani file.
// POST multipart: request = {conversation, kos, id, body} + file → simpan di customer-chat/<kos>/<acak> → cx_thread send.
// GET ?m=<id pesan> → URL bertanda tangan 10 menit.
import { createClient } from '@supabase/supabase-js';
import { userDb } from '@/lib/serverAuth';
import { CHAT_BUCKET, readChatBody, signedChatUrl, storeChatFile } from '@/lib/customerExperience';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const admin = () => process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }) : null;

export async function GET(req) {
  const user = userDb(req);
  if (!user) return json({ error: 'Silakan masuk lagi.' }, 401);
  const sb = admin();
  if (!sb) return json({ error: 'Penyimpanan lampiran belum dikonfigurasi.' }, 503);
  const id = req.nextUrl.searchParams.get('m');
  if (!uuid(id)) return json({ error: 'Lampiran tidak ditemukan.' }, 404);
  const { data, error } = await user.rpc('cx_file_staff', { p_message: id });
  if (error || !data) return json({ error: 'Lampiran tidak ditemukan.' }, 404);
  const url = await signedChatUrl(sb, data);
  return url ? json({ url, name: data.name, mime: data.mime }) : json({ error: 'Gagal membuka lampiran.' }, 502);
}

export async function POST(req) {
  const user = userDb(req);
  if (!user) return json({ error: 'Silakan masuk lagi.' }, 401);
  const sb = admin();
  if (!sb) return json({ error: 'Penyimpanan lampiran belum dikonfigurasi.' }, 503);
  let parsed;
  try { parsed = await readChatBody(req); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  if (parsed.tooLarge) return json({ error: 'Lampiran maksimal 3 MB.' }, 413);
  const b = parsed.body || {};
  if (!parsed.file || !uuid(b.conversation) || !uuid(b.kos) || !uuid(b.id)) return json({ error: 'Permintaan tidak valid.' }, 400);
  // akses dicek dulu (tanpa menyimpan apa pun) agar orang luar tidak bisa mengisi penyimpanan
  const check = await user.rpc('cx_thread', { p_conv: b.conversation, p_op: 'read', p: {} });
  if (check.error) return json({ error: 'Percakapan tidak ditemukan.' }, 404);
  const stored = await storeChatFile(sb, parsed.file, b.kos.toLowerCase());
  if (stored.error) return json({ error: stored.error }, 400);
  const { data, error } = await user.rpc('cx_thread', { p_conv: b.conversation, p_op: 'send', p: {
    id: b.id, kind: stored.mime === 'application/pdf' ? 'dokumen' : 'gambar', body: typeof b.body === 'string' ? b.body.slice(0, 2000) : '', file: stored,
  } });
  if (error || !data?.ok) {
    await sb.storage.from(CHAT_BUCKET).remove([stored.path]).catch(() => {});
    return json({ error: data?.error || error?.message || 'Lampiran gagal dikirim.' }, 400);
  }
  return json(data);
}
