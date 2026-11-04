// Tombol "Kirim contoh ringkasan" di halaman Notifikasi: hanya pemilik kos yang login, dikirim ke email pemilik.
import { createClient } from '@supabase/supabase-js';
import { runSummaries } from '@/lib/summaries';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const { kosId, kind } = await req.json().catch(() => ({}));
  if (!token || !kosId || !['mingguan', 'bulanan'].includes(kind)) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await user.auth.getUser();
  const { data: kos } = await user.from('kos').select('id, owner_id').eq('id', kosId).maybeSingle();
  if (!kos || !u?.user || kos.owner_id !== u.user.id) return Response.json({ error: 'Hanya pemilik kos yang bisa mengirim contoh' }, { status: 403 });
  const res = await runSummaries({ origin: new URL(req.url).origin, kinds: [kind], onlyKos: kosId, force: true });
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
