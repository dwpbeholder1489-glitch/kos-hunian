// Alamat webhook pembayaran: POST /api/bayar/<kode penyedia>. Verifikasi + aktivasi bila tagihan cocok (lihat lib/bayarWebhook.js).
import { catatWebhook } from '@/lib/bayarWebhook';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(req, { params }) {
  const { provider } = await params;
  return catatWebhook(provider, req);
}

export function GET() {
  return Response.json({ ok: false, error: 'Metode tidak diizinkan' }, { status: 405 });
}
