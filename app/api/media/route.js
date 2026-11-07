// Media Library: izin & kuota di database (media_prepare / media_replace_* / media_delete atas nama pengguna),
// file di Supabase Storage bucket publik "media" (kunci server). Foto memang untuk ditampilkan (halaman bisnis, katalog),
// dokumentasi internal tetap lewat /api/lampiran (bucket privat).
// Browser sudah mengecilkan foto: "full" (maks 1600 px) + "thumb" (maks 480 px), keduanya JPEG.
import { userDb } from '@/lib/serverAuth';
import { adminDb } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
const BUCKET = 'media';
const MAX_FULL = 3 * 1024 * 1024;
const MAX_THUMB = 400 * 1024;
const json = (b, s = 200) => Response.json(b, { status: s });
const clean = (m) => String(m || 'Gagal').replace(/^BATAS_GRATIS:\s*/, '').replace(/^MASIH_DIPAKAI:\s*/, '');

let ready = false;
async function ensureBucket(sb) {
  if (ready) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_FULL, allowedMimeTypes: ['image/jpeg'] });
    if (error && !/exists/i.test(error.message)) throw error;
  }
  ready = true;
}
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
function setup(req) {
  const user = userDb(req);
  if (!user) return { err: json({ error: 'Silakan masuk lagi' }, 401) };
  const sb = adminDb();
  if (!sb) return { err: json({ error: 'Penyimpanan foto belum diaktifkan di server (kunci server Supabase belum diisi).' }, 503) };
  return { user, sb };
}
async function readFiles(form) {
  const f = form.get('full'); const t = form.get('thumb');
  if (!f || !t || typeof f.arrayBuffer !== 'function' || typeof t.arrayBuffer !== 'function') return { e: 'Foto tidak terbaca' };
  const full = new Uint8Array(await f.arrayBuffer()); const thumb = new Uint8Array(await t.arrayBuffer());
  if (!full.length || !thumb.length) return { e: 'Foto kosong' };
  if (full.length > MAX_FULL || thumb.length > MAX_THUMB) return { e: 'Foto terlalu besar' };
  if (!isJpeg(full) || !isJpeg(thumb)) return { e: 'Format foto tidak didukung' }; // browser selalu mengirim JPEG hasil kompres
  return { full, thumb };
}
async function put(sb, path, buf) {
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw error;
}

export async function POST(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Foto terlalu besar atau rusak' }, 400); }
  const action = String(form.get('action') || 'upload');
  const w = parseInt(form.get('w'), 10) || null; const h = parseInt(form.get('h'), 10) || null;
  const { full, thumb, e } = await readFiles(form);
  if (e) return json({ error: e }, 400);
  const size = full.length + thumb.length;
  try { await ensureBucket(sb); } catch (x) { console.error('[media] bucket', x?.message); return json({ error: 'Penyimpanan foto sedang bermasalah. Coba lagi sebentar lagi.' }, 502); }

  if (action === 'replace') {
    const id = String(form.get('id') || '');
    const { data: p, error: e1 } = await user.rpc('media_replace_prepare', { p_id: id, p_size: size, p_w: w, p_h: h });
    if (e1) return json({ error: clean(e1.message) }, 400);
    try { await put(sb, p.path, full); await put(sb, p.thumb_path, thumb); } catch (x) {
      console.error('[media] ganti gagal', x?.message); return json({ error: 'Gagal menyimpan foto. Coba lagi.', retry: true }, 502);
    }
    const { data, error: e2 } = await user.rpc('media_replace_commit', { p_id: id });
    if (e2) return json({ error: clean(e2.message) }, 400);
    // file lama dibuang sekarang; sisanya oleh pembersihan harian
    const { data: old } = await sb.rpc('media_purge_list', { p_limit: 50 });
    const mine = (old || []).map((r) => r.path).filter((x) => x.startsWith(data.path.split('/')[0] + '/' + id));
    if (mine.length) { const r = await sb.storage.from(BUCKET).remove(mine); if (!r.error) await sb.rpc('media_purged', { p_paths: mine }); }
    return json({ ok: true, ...data });
  }

  const kos = String(form.get('kos') || ''); const category = String(form.get('category') || 'lainnya'); const name = String(form.get('name') || '').slice(0, 120);
  const { data: p, error: e1 } = await user.rpc('media_prepare', { p_kos: kos, p_category: category, p_size: size, p_w: w, p_h: h, p_name: name });
  if (e1) return json({ error: clean(e1.message), limit: /^BATAS_GRATIS/.test(e1.message) }, 400);
  try { await put(sb, p.path, full); await put(sb, p.thumb_path, thumb); } catch (x) {
    console.error('[media] unggah gagal', x?.message); return json({ error: 'Gagal menyimpan foto. Coba lagi.', retry: true }, 502); // baris setengah jadi dibersihkan otomatis
  }
  const { data, error: e3 } = await user.rpc('media_commit', { p_id: p.id });
  if (e3) return json({ error: clean(e3.message) }, 400);
  return json({ ok: true, ...data });
}

export async function DELETE(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  const u = new URL(req.url); const id = u.searchParams.get('id'); const force = u.searchParams.get('force') === '1';
  if (!id) return json({ error: 'Permintaan tidak valid' }, 400);
  const { data, error } = await user.rpc('media_delete', { p_id: id, p_force: force });
  if (error) return json({ error: clean(error.message), inUse: /^MASIH_DIPAKAI/.test(error.message) }, 400);
  const paths = data?.paths || [];
  if (paths.length) { const r = await sb.storage.from(BUCKET).remove(paths); if (!r.error) await sb.rpc('media_purged', { p_paths: paths }); }
  return json({ ok: true });
}
