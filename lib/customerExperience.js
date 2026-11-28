// Server: pintu chat & tracking pelanggan (dipakai /api/portal-shop [tamu toko], /api/portal-b2b [link grosir],
// /api/publik/chat [pesanan jasa]). Kredensial diperiksa ulang di database (cx_customer, hanya service_role).
// Lampiran: tipe dicek dari ISI file (bukan nama), maks 3 MB, disimpan di bucket privat customer-chat, dibuka lewat URL 10 menit.
import { randomBytes } from 'node:crypto';

export const CHAT_BUCKET = 'customer-chat';
export const CHAT_MAX_FILE = 3000000;
const MAX_JSON = 32768;
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const str = (value, size) => (typeof value === 'string' ? value.slice(0, size) : '');

// Jenis file dari byte awal: foto JPG/PNG/WebP atau PDF
export function chatFileType(buffer) {
  const starts = (bytes) => buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (starts('RIFF') && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (starts('%PDF-')) return 'application/pdf';
  return null;
}
export const cleanName = (name, mime) => {
  const base = String(name || '').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120);
  return base || (mime === 'application/pdf' ? 'dokumen.pdf' : 'foto.jpg');
};

// Isi permintaan JSON atau multipart (field "request" = JSON, "file" = lampiran), dengan batas ukuran
export async function readChatBody(req) {
  const type = req.headers.get('content-type') || '';
  const multipart = type.startsWith('multipart/form-data');
  if (!multipart && !type.startsWith('application/json')) return {};
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > (multipart ? CHAT_MAX_FILE + MAX_JSON : MAX_JSON)) { await reader.cancel(); return { tooLarge: true }; }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks, size);
  if (!multipart) return { body: JSON.parse(content.toString('utf8')) };
  const form = await new Response(content, { headers: { 'Content-Type': type } }).formData();
  const request = form.get('request');
  if (typeof request !== 'string' || request.length > MAX_JSON) return {};
  const file = form.get('file');
  return { body: JSON.parse(request), file: file && typeof file.arrayBuffer === 'function' ? file : null };
}

// Simpan lampiran; mengembalikan {path,name,mime,size} atau {error}
export async function storeChatFile(sb, file, prefix) {
  if (!file || !file.size || file.size > CHAT_MAX_FILE) return { error: 'Lampiran maksimal 3 MB.' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = chatFileType(buffer);
  if (!mime) return { error: 'Kirim foto JPG/PNG/WebP atau dokumen PDF.' };
  const path = `${prefix}/${randomBytes(32).toString('hex')}`;
  const { error } = await sb.storage.from(CHAT_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (error) {
    // bucket dibuat oleh migrasi; bila belum ada (proyek lama), buat sekali lalu coba lagi
    if (/not.?found/i.test(error.message || '')) {
      await sb.storage.createBucket(CHAT_BUCKET, { public: false, fileSizeLimit: CHAT_MAX_FILE, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] });
      const retry = await sb.storage.from(CHAT_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
      if (!retry.error) return { path, name: cleanName(file.name, mime), mime, size: buffer.length };
    }
    console.error('[chat] unggah gagal', error.message);
    return { error: 'Gagal menyimpan lampiran. Coba lagi.' };
  }
  return { path, name: cleanName(file.name, mime), mime, size: buffer.length };
}

export async function signedChatUrl(sb, info) {
  const { data } = await sb.storage.from(CHAT_BUCKET).createSignedUrl(info.path, 600,
    info.mime === 'application/pdf' ? { download: info.name || true } : undefined);
  return data?.signedUrl || null;
}

// base = {access:'guest'|'private'|'svc', slug?, credential?, number?, phone?}; sb = klien service role.
// Mengembalikan [payload, status HTTP].
export async function portalExchange(sb, body, base, file = null) {
  const { ref, operation, message, content, before, kind } = body || {};
  const ops = ['send', 'read', 'list', 'track', 'file'];
  if (!(uuid(ref) || ref === 'umum' || (ref === 'nomor' && base.access === 'svc')) || !ops.includes(operation) || (['read', 'file', 'send'].includes(operation) && !uuid(message))
      || (before != null && !uuid(before)) || (content != null && (typeof content !== 'string' || content.length > 2000))) {
    return [{ error: 'Permintaan percakapan tidak valid.' }, 400];
  }
  const p = { ...base, ref, op: operation, id: message || null, before: before || null, body: content || '',
    name: str(body.name, 80), phone: base.phone || str(body.contact_phone, 20) };
  const rpc = (x) => sb.rpc('cx_customer', { p: x });
  if (operation === 'send' && file) {
    const permit = await rpc({ ...p, op: 'upload' });
    if (permit.error) return [{ error: 'Percakapan sedang tidak tersedia.' }, 503];
    if (!permit.data) return [{ error: 'Percakapan tidak ditemukan atau akses sudah berakhir.' }, 404];
    if (permit.data.error) return [{ error: permit.data.error }, 400];
    const stored = await storeChatFile(sb, file, 'pelanggan');
    if (stored.error) return [{ error: stored.error }, 400];
    p.kind = stored.mime === 'application/pdf' ? 'dokumen' : 'gambar';
    p.file = stored;
    const { data, error } = await rpc(p);
    if (error || !data?.ok) {
      await sb.storage.from(CHAT_BUCKET).remove([stored.path]).catch(() => {});
      return [{ error: data?.error || 'Lampiran gagal dikirim.' }, error ? 503 : 400];
    }
    return [data, 200];
  }
  if (operation === 'send' && kind && kind !== 'teks') return [{ error: 'Pesan tidak valid.' }, 400];
  if (operation === 'send' && !String(content || '').trim()) return [{ error: 'Tulis pesan terlebih dahulu.' }, 400];
  const { data, error } = await rpc(p);
  if (error) { console.error('[chat] pelanggan', error.code, error.message); return [{ error: 'Percakapan sedang tidak tersedia.' }, 503]; }
  if (!data) return [{ error: 'Percakapan tidak ditemukan atau akses sudah berakhir.' }, 404];
  if (operation === 'file') {
    const url = await signedChatUrl(sb, data);
    return url ? [{ url, name: data.name, mime: data.mime }, 200] : [{ error: 'Gagal membuka lampiran.' }, 502];
  }
  return [data, data.error ? 400 : 200];
}
