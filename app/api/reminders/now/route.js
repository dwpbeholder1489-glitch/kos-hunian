// Tombol "Kirim daftar tagih sekarang" di Pengaturan: hanya untuk anggota kos yang login.
import { createClient } from '@supabase/supabase-js';
import { runReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const { kosId } = await req.json().catch(() => ({}));
  if (!token || !kosId) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: kos } = await user.from('kos').select('id').eq('id', kosId).maybeSingle();
  if (!kos) return Response.json({ error: 'Tidak punya akses ke kos ini' }, { status: 403 });
  const res = await runReminders({ origin: new URL(req.url).origin, onlyKos: kosId, force: true, tenants: false });
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
