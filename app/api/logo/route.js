// Logo bisnis: izin di database (logo_prepare / logo_set atas nama pengguna), file di bucket publik "logo" (kunci server).
// Logo memang ditampilkan di halaman publik, jadi bucket-nya publik; foto lain (lampiran) tetap di bucket privat.
import { userDb } from '@/lib/serverAuth';
import { adminDb } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
const BUCKET = 'logo';
const MAX = 1024 * 1024;
const json = (b, s = 200) => Response.json(b, { status: s });

let ready = false;
async function ensureBucket(sb) {
  if (ready) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX, allowedMimeTypes: ['image/jpeg'] });
    if (error && !/exists/i.test(error.message)) throw error;
  }
  ready = true;
}
function setup(req) {
  const user = userDb(req);
  if (!user) return { err: json({ error: 'Silakan masuk lagi' }, 401) };
  const sb = adminDb();
  if (!sb) return { err: json({ error: 'Penyimpanan file belum diaktifkan di server (kunci server Supabase belum diisi).' }, 503) };
  return { user, sb };
}

export async function POST(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'File tidak valid' }, 400); }
  const kos = String(form.get('kos') || ''); const file = form.get('file');
  if (!kos || !file || typeof file.arrayBuffer !== 'function') return json({ error: 'Permintaan tidak valid' }, 400);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!buf.length || buf.length > MAX) return json({ error: 'Logo maks 1 MB' }, 400);
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return json({ error: 'Logo harus berupa gambar (JPG).' }, 400);
  const { data: path, error: e1 } = await user.rpc('logo_prepare', { p_kos: kos });
  if (e1) return json({ error: e1.message }, 403);
  try {
    await ensureBucket(sb);
    const { error: e2 } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (e2) throw e2;
  } catch (e) { console.error('[logo] unggah gagal', e?.message); return json({ error: 'Penyimpanan sedang bermasalah. Coba lagi.' }, 502); }
  const { data: old, error: e3 } = await user.rpc('logo_set', { p_kos: kos, p_path: path });
  if (e3) { await sb.storage.from(BUCKET).remove([path]); return json({ error: e3.message }, 400); }
  if (old) await sb.storage.from(BUCKET).remove([old]);
  return json({ ok: true, path });
}

export async function DELETE(req) {
  const { user, sb, err } = setup(req); if (err) return err;
  const kos = new URL(req.url).searchParams.get('kos');
  const { data: old, error } = await user.rpc('logo_set', { p_kos: kos, p_path: null });
  if (error) return json({ error: error.message }, 400);
  if (old) await sb.storage.from(BUCKET).remove([old]);
  return json({ ok: true });
}
