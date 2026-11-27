import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { userDb } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (value) => /^[a-f0-9]{64}$/.test(value || '');
const text = (value, size) => typeof value === 'string' ? value.slice(0, size) : '';
const maxBody = 32768;
const isId = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

const quoteBucket = 'portal-quote';
const maxFile = 3000000;

function attachmentType(name, buffer) {
  const ext = name.toLowerCase().split('.').pop();
  const starts = (bytes) => buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  if (ext === 'pdf' && starts('%PDF-')) return 'application/pdf';
  if (['jpg', 'jpeg'].includes(ext) && starts([255, 216, 255])) return 'image/jpeg';
  if (ext === 'png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (ext === 'webp' && starts('RIFF') && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (ext === 'xlsx' && starts([80, 75, 3, 4])) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls' && starts([208, 207, 17, 224, 161, 177, 26, 225])) return 'application/vnd.ms-excel';
  if (ext === 'csv' && !buffer.includes(0) && buffer.toString('utf8', 0, 512).trimStart()[0] !== '<') return 'text/csv';
  return null;
}

async function quoteAttachment(req, order) {
  if (!isId(order)) return json({ error: 'Lampiran tidak ditemukan.' }, 404);
  const user = userDb(req);
  if (!user) return json({ error: 'Silakan masuk lagi.' }, 401);
  const { data } = await user.from('so_orders').select('quote_attachment,quote_filename').eq('id', order).maybeSingle();
  if (!data?.quote_attachment) return json({ error: 'Lampiran tidak ditemukan.' }, 404);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data: signed } = await sb.storage.from(quoteBucket).createSignedUrl(data.quote_attachment, 120, { download: data.quote_filename || true });
  return signed?.signedUrl ? json({ url: signed.signedUrl }) : json({ error: 'Gagal membuka lampiran.' }, 500);
}

async function readBody(req, multipart) {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      const content = Buffer.concat(chunks, size);
      if (!multipart) return { body: JSON.parse(content.toString('utf8')) };
      const form = await new Response(content, { headers: { 'Content-Type': req.headers.get('content-type') } }).formData();
      const request = form.get('request');
      if (typeof request !== 'string' || request.length > maxBody) return {};
      return { body: JSON.parse(request), file: form.get('attachment') };
    }
    size += value.byteLength;
    if (size > (multipart ? maxFile + maxBody : maxBody)) {
      await reader.cancel();
      return {};
    }
    chunks.push(value);
  }
}

function context(req) {
  const slug = (req.nextUrl.searchParams.get('slug') || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return { error: json({ error: 'Halaman tidak ditemukan.' }, 404) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { error: json({ error: 'Layanan pesanan sedang tidak tersedia.' }, 503) };
  const cookie = 'prasara_shop_' + hash(slug).slice(0, 24);
  const token = req.cookies.get(cookie)?.value;
  return {
    slug, cookie, token: validToken(token) ? token : null, key,
    sb: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function GET(req) {
  const attachment = req.nextUrl.searchParams.get('attachment');
  if (attachment) {
    if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return json({ error: 'Penyimpanan lampiran sedang tidak tersedia.' }, 503);
    }
    return quoteAttachment(req, attachment);
  }
  const { sb, slug, cookie, token, error } = context(req);
  if (error) return error;
  const { data, error: failure } = token ? await sb.rpc('portal_shop_orders', { p_slug: slug, p_guest: hash(token) }) : { data: [] };
  if (failure) {
    console.error('[portal-shop] riwayat', failure.code);
    return json({ error: 'Gagal memuat pesanan.' }, 500);
  }
  const response = json({ orders: data || [] });
  if (!token) response.cookies.set(cookie, randomBytes(32).toString('hex'), {
    httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'strict',
    path: '/api/portal-shop', maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}

export async function POST(req) {
  const { sb, slug, token, key, error } = context(req);
  if (error) return error;
  const contentType = req.headers.get('content-type') || '';
  const multipart = contentType.startsWith('multipart/form-data');
  const origin = req.headers.get('origin');
  if ((origin && origin !== req.nextUrl.origin) || req.headers.get('sec-fetch-site') === 'cross-site' || (!multipart && !contentType.startsWith('application/json'))) {
    return json({ error: 'Permintaan tidak valid.' }, 400);
  }
  if (!token) return json({ error: 'Sesi belanja belum siap. Muat ulang halaman dan coba lagi.' }, 409);
  let body, file;
  try { ({ body, file } = await readBody(req, multipart) || {}); }
  catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  if (multipart && (!file || body?.kind !== 'penawaran' || typeof file.arrayBuffer !== 'function' || !file.size || file.size > maxFile)) {
    return json({ error: 'Lampiran penawaran harus berukuran maksimal 3 MB.' }, 400);
  }
  if (body?.action === 'approve-quote') {
    if (!isId(body.order) || !isId(body.revision)) return json({ error: 'Versi penawaran tidak valid.' }, 400);
    const { data, error: failure } = await sb.rpc('portal_quote_approve', {
      p_slug: slug, p_guest: hash(token), p_order: body.order, p_revision: body.revision,
    });
    if (failure) return json({ error: 'Gagal menyetujui penawaran. Coba lagi nanti.' }, 500);
    return data?.ok ? json({ number: data.number }) : json({ error: data?.error || 'Penawaran belum dapat disetujui.' }, 409);
  }
  if (body?.action === 'counter-quote') {
    if (!isId(body.order) || !isId(body.revision) || typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 500) {
      return json({ error: 'Isi pesan negosiasi (3–500 karakter).' }, 400);
    }
    const { data, error: failure } = await sb.rpc('portal_quote_counter', {
      p_slug: slug, p_guest: hash(token), p_order: body.order, p_revision: body.revision, p_message: body.message,
    });
    if (failure) return json({ error: 'Gagal mengirim negosiasi.' }, 500);
    return data ? json({ ok: true }) : json({ error: 'Penawaran telah berubah. Tinjau versi terbaru.' }, 409);
  }
  if (body?.action === 'rating') {
    if (!isId(body.order) || !isId(body.product) || !Number.isInteger(body.score) || body.score < 1 || body.score > 5) {
      return json({ error: 'Penilaian tidak valid.' }, 400);
    }
    const { data, error: failure } = await sb.rpc('portal_shop_rate', {
      p_slug: slug, p_guest: hash(token), p_order: body.order, p_product: body.product, p_score: body.score,
    });
    if (failure) return json({ error: 'Gagal menyimpan penilaian. Coba lagi nanti.' }, 500);
    return data ? json({ ok: true }) : json({ error: 'Pesanan belum dapat dinilai.' }, 400);
  }
  if (!Array.isArray(body?.lines) || body.lines.length > 100 || !body.lines.every((line) => line && Number.isFinite(line.qty))) {
    return json({ error: 'Pilih hingga 100 satuan barang untuk satu pesanan.' }, 400);
  }
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const p = {
    id: text(body.id, 40), kind: body.kind === 'penawaran' ? 'penawaran' : 'pesanan',
    name: text(body.name, 80), phone: text(body.phone, 30), consent: body.consent === true,
    fulfillment: text(body.fulfillment, 12) || null, payment: text(body.payment, 12) || null,
    ship_address: text(body.ship_address, 300), note: text(body.note, 350),
    lines: body.lines.map((line) => ({ product_id: text(line.product_id, 40), unit: text(line.unit, 40), qty: line.qty })),
  };
  const guest = hash(token);
  const device = createHmac('sha256', key).update('shop:' + ip).digest('hex');
  if (p.kind === 'penawaran') {
    p.purpose = ['Warung / Toko', 'Rumah Tangga', 'Usaha Lainnya'].includes(body.purpose) ? body.purpose : null;
    p.manual = text(body.manual, 2000);
    if (file) {
      if (!isId(p.id) || !p.consent || p.name.trim().length < 2 || !/^\d{9,15}$/.test(p.phone.replace(/\D/g, ''))) {
        return json({ error: 'Lengkapi data pemohon dan persetujuan untuk mengunggah lampiran.' }, 400);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = attachmentType(file.name, buffer);
      if (!contentType) return json({ error: 'Gunakan file Excel, CSV, foto JPG/PNG/WebP, atau PDF yang valid.' }, 400);
      const { data: permit, error: permitError } = await sb.rpc('portal_quote_prepare_upload', {
        p_slug: slug, p_guest: guest, p_device: createHmac('sha256', key).update('shop-upload:' + ip).digest('hex'), p_order: p.id,
      });
      if (permitError) return json({ error: 'Penyimpanan lampiran sedang tidak tersedia.' }, 503);
      if (!permit?.allowed) return json({ error: 'Unggahan belum dapat diterima. Coba lagi nanti.' }, 429);
      if (permit.id) return json({ id: permit.id, number: permit.number });
      p.filename = file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
      p.attachment = `${slug}/${guest}/${p.id.toLowerCase()}/${randomBytes(32).toString('hex')}`;
      const { error: uploadError } = await sb.storage.from(quoteBucket).upload(p.attachment, buffer, { contentType, upsert: false });
      if (uploadError) {
        return json({ error: 'Gagal menyimpan lampiran. Coba lagi nanti.' }, 502);
      }
    }
  }
  const { data, error: failure } = await sb.rpc('portal_shop_order', {
    p_slug: slug, p_guest: guest, p_device: device, p,
  });
  if (failure) {
    console.error('[portal-shop] pesanan', failure.code);
    return json({ error: 'Gagal membuat pesanan. Coba lagi nanti.' }, 500);
  }
  if (!data?.ok) return json({ error: data?.error || 'Gagal membuat pesanan.' }, 400);
  return json({ id: data.id, number: data.number, ...(p.kind !== 'penawaran' && { total: data.total }) }, data.duplicate ? 200 : 201);
}
