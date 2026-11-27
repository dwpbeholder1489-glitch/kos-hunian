// Kunci publik VAPID untuk browser (applicationServerKey). Kunci privat tidak pernah keluar dari server.
import { vapidKeys } from '@/lib/notifServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const k = await vapidKeys();
    if (!k) return Response.json({ ready: false, reason: 'Server belum dikonfigurasi (SUPABASE_SECRET_KEY).' }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ready: true, publicKey: k.publicKey }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ ready: false, reason: 'Kunci notifikasi belum bisa disiapkan.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
