// Webhook masuk umum (Fase 6 Integrasi): POST /api/hook/<kode sambungan> → Prospek di CRM bisnis pemilik kode.
// Kode ada di alamat (rahasia, ditampilkan sekali di halaman Integrasi) dan hanya dibandingkan sebagai hash di database.
// Isi kiriman: JSON, formulir (x-www-form-urlencoded) atau multipart — nama kolom umum dikenali (name/nama, phone/telepon/hp, message/pesan, email).
// Kunci idempotensi (opsional): header Idempotency-Key atau kolom idempotency_key — kiriman ulang dengan kunci sama tidak membuat prospek kedua.
// Semua pengecekan (token, jeda, batas, validasi, duplikat) ada di fungsi database hook_inbound; di sini hanya membaca isi & meneruskan.
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 16 * 1024;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key', 'Access-Control-Max-Age': '86400' };
const json = (b, s = 200, extra = {}) => Response.json(b, { status: s, headers: { ...CORS, 'Cache-Control': 'no-store', ...extra } });

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export async function GET() { return json({ ok: false, error: 'Gunakan metode POST dengan isi JSON atau formulir.' }, 405, { Allow: 'POST, OPTIONS' }); }

// Datarkan isi kiriman menjadi objek sederhana; nilai formulir selalu teks
async function bacaIsi(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return { error: 'Isi kiriman terlalu besar (maks. 16 KB).', status: 413 };
  const type = (req.headers.get('content-type') || '').toLowerCase();
  if (type.includes('multipart/form-data')) {
    let fd; try { fd = await req.formData(); } catch { return { error: 'Isi formulir tidak bisa dibaca.', status: 400 }; }
    const o = {}; let n = 0;
    for (const [k, v] of fd.entries()) { if (typeof v !== 'string') continue; o[k] = v.slice(0, 2000); if (++n > 60) break; }
    return { body: o };
  }
  let raw; try { raw = await req.text(); } catch { return { error: 'Isi kiriman tidak bisa dibaca.', status: 400 }; }
  if (raw.length > MAX_BYTES) return { error: 'Isi kiriman terlalu besar (maks. 16 KB).', status: 413 };
  if (type.includes('application/x-www-form-urlencoded')) {
    const o = {}; let n = 0;
    for (const [k, v] of new URLSearchParams(raw).entries()) { o[k] = v.slice(0, 2000); if (++n > 60) break; }
    return { body: o };
  }
  try { return { body: JSON.parse(raw) }; } catch { return { error: 'Isi kiriman bukan JSON yang valid.', status: 400 }; }
}

export async function POST(req, { params }) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Layanan integrasi belum dikonfigurasi.' }, 503);
  const { token } = await params;
  if (!/^prs_[0-9a-f]{48}$/.test(String(token || ''))) return json({ ok: false, error: 'Tautan integrasi tidak dikenal.' }, 401);
  const isi = await bacaIsi(req);
  if (isi.error) return json({ ok: false, error: isi.error }, isi.status);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'tanpa-ip';
  const ipHash = createHash('sha256').update(ip + '|' + key.slice(-16)).digest('hex').slice(0, 32);  // IP asli tidak disimpan
  const body = isi.body;
  const idem = req.headers.get('idempotency-key') || (body && typeof body === 'object' && !Array.isArray(body) && typeof body.idempotency_key === 'string' ? body.idempotency_key : null);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('hook_inbound', { p_token: token, p_ip_hash: ipHash, p_body: body ?? null, p_idem: idem });
  if (error) { console.error('[hook] gagal', error.message); return json({ ok: false, error: 'Terjadi gangguan. Coba kirim lagi nanti.' }, 500); }
  const status = Number(data?.status) || (data?.ok ? 200 : 400);
  const out = data?.ok ? { ok: true, number: data.number, ...(data.duplicate ? { duplicate: true } : {}) } : { ok: false, error: data?.error || 'Kiriman ditolak.' };
  return json(out, status, status === 429 ? { 'Retry-After': '600' } : {});
}
