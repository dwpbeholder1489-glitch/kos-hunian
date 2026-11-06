// Status layanan untuk Management Center. Hanya mengembalikan "terpasang / belum" — tidak pernah nilai rahasia.
import { userDb } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = userDb(req);
  if (!user) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  const { data: allowed } = await user.rpc('admin_can', { p_perm: 'system.view' });
  if (!allowed) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const has = (k) => Boolean(process.env[k]);
  return Response.json({
    env: process.env.VERCEL_ENV || 'lokal',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    services: [
      ['Database (Supabase)', has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY')],
      ['Kunci server Supabase (untuk jadwal otomatis)', has('SUPABASE_SECRET_KEY') || has('SUPABASE_SERVICE_ROLE_KEY')],
      ['Email (Gmail SMTP)', has('SMTP_USER') && has('SMTP_PASS')],
      ['Pengaman jadwal otomatis (CRON_SECRET)', has('CRON_SECRET')],
      ['Alamat aplikasi (APP_URL / SITE_URL)', has('APP_URL') || has('NEXT_PUBLIC_SITE_URL')],
      ['AI (Anthropic)', has('ANTHROPIC_API_KEY')],
    ].map(([name, ok]) => ({ name, ok })),
    pending: ['WhatsApp API resmi', 'Payment gateway (QRIS otomatis)'],
  });
}
