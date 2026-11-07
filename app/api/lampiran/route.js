// Lampiran foto/file. Izin diputuskan database (att_* atas nama pengguna); file disimpan di Supabase Storage
// (bucket privat "lampiran") memakai kunci server, dan dibuka lewat tautan sementara (10 menit).
import { userDb } from '@/lib/serverAuth';
import { adminDb } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'lampiran';
const MAX = 4 * 1024 * 1024; // batas body Vercel ±4,5 MB
const ENTITIES = ['bb_record', 'svc_order', 'maint_ticket', 'occupant', 'expense'];
const json = (b, s = 200) => Response.json(b, { status: s });
const clean = (m) => String(m || 'Gagal').replace(/^BATAS_GRATIS:\s*/, '');

// Jenis file dari isi (bukan dari nama / klaim browser)
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

let bucketReady = false;
async function ensureBucket(sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] });
    if (error && !/exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

function setup(req) {
  const user = userDb(req);
  if (!user) return { err: json({ error: 'Silakan masuk lagi' }, 401) };
  const sb = adminDb();
  if (!sb) return { err: json({ error: 'Penyimpanan lampiran belum diaktifkan di server (kunci server Supabase belum diisi).' }, 503) };
  return { user, sb };
}

// Daftar lampiran + tautan sementara
export async function GET(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  const u = new URL(req.url); const entity = u.searchParams.get('entity'); const id = u.searchParams.get('id');
  if (!ENTITIES.includes(entity) || !id) return json({ error: 'Permintaan tidak valid' }, 400);
  const { data, error } = await user.rpc('att_list', { p_entity: entity, p_id: id });
  if (error) return json({ error: clean(error.message) }, 403);
  const items = data.items || [];
  let urls = [];
  if (items.length) {
    const r = await sb.storage.from(BUCKET).createSignedUrls(items.map((x) => x.path), 600);
    urls = r.data || [];
  }
  return json({ ...data, items: items.map(({ path, ...x }, i) => ({ ...x, url: urls[i]?.signedUrl || null })) });
}

// Unggah satu file (multipart: entity, id, file)
export async function POST(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'File terlalu besar atau rusak (maks 4 MB)' }, 400); }
  const entity = String(form.get('entity') || ''); const id = String(form.get('id') || ''); const file = form.get('file');
  if (!ENTITIES.includes(entity) || !id || !file || typeof file.arrayBuffer !== 'function') return json({ error: 'Permintaan tidak valid' }, 400);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!buf.length) return json({ error: 'File kosong' }, 400);
  if (buf.length > MAX) return json({ error: 'File terlalu besar (maks 4 MB)' }, 400);
  const mime = sniff(buf);
  if (!mime) return json({ error: 'Jenis file tidak didukung. Pakai foto (JPG/PNG) atau PDF.' }, 400);
  const { data: prep, error: e1 } = await user.rpc('att_prepare', { p_entity: entity, p_id: id, p_name: String(file.name || ''), p_mime: mime, p_size: buf.length });
  if (e1) return json({ error: clean(e1.message), limit: /^BATAS_GRATIS/.test(e1.message) }, 400);
  try {
    await ensureBucket(sb);
    const { error: e2 } = await sb.storage.from(BUCKET).upload(prep.path, buf, { contentType: mime, upsert: false, cacheControl: '3600' });
    if (e2) throw e2;
  } catch (e) {
    console.error('[lampiran] unggah gagal', e?.message);
    return json({ error: 'Penyimpanan file sedang bermasalah. Coba lagi sebentar lagi.' }, 502); // baris "sedang diunggah" dibersihkan otomatis
  }
  const { error: e3 } = await user.rpc('att_commit', { p_att: prep.id });
  if (e3) { await sb.storage.from(BUCKET).remove([prep.path]); return json({ error: clean(e3.message) }, 400); }
  return json({ ok: true, id: prep.id });
}

// Hapus (catatan tetap tersimpan untuk jejak audit; file dihapus dari penyimpanan)
export async function DELETE(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  const id = new URL(req.url).searchParams.get('att');
  if (!id) return json({ error: 'Permintaan tidak valid' }, 400);
  const { data: path, error } = await user.rpc('att_delete', { p_att: id });
  if (error) return json({ error: clean(error.message) }, 400);
  const { error: e2 } = await sb.storage.from(BUCKET).remove([path]);
  if (!e2) await sb.rpc('att_purged', { p_ids: [id] });
  return json({ ok: true });
}
