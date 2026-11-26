import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (value) => /^[a-f0-9]{64}$/.test(value || '');
const text = (value, size) => typeof value === 'string' ? value.slice(0, size) : '';
const maxBody = 32768;
const isId = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

async function readBody(req) {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let content = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return JSON.parse(content + decoder.decode());
    size += value.byteLength;
    if (size > maxBody) {
      await reader.cancel();
      return null;
    }
    content += decoder.decode(value, { stream: true });
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
  if (req.headers.get('sec-fetch-site') === 'cross-site' || !req.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: 'Permintaan tidak valid.' }, 400);
  }
  if (!token) return json({ error: 'Sesi belanja belum siap. Muat ulang halaman dan coba lagi.' }, 409);
  let body;
  try { body = await readBody(req); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
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
  const { data, error: failure } = await sb.rpc('portal_shop_order', {
    p_slug: slug, p_guest: hash(token), p_device: createHmac('sha256', key).update('shop:' + ip).digest('hex'), p,
  });
  if (failure) {
    console.error('[portal-shop] pesanan', failure.code);
    return json({ error: 'Gagal membuat pesanan. Coba lagi nanti.' }, 500);
  }
  if (!data?.ok) return json({ error: data?.error || 'Gagal membuat pesanan.' }, 400);
  return json({ id: data.id, number: data.number, total: data.total }, data.duplicate ? 200 : 201);
}
