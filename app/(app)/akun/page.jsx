'use client';
// Akun: email masuk, bisnis aktif & ganti bisnis, paket, tampilan, bantuan, keluar.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import ThemeSwitch from '@/components/ThemeSwitch';
import NavIcon from '@/components/NavIcon';
import { typeOf, roleOf, ROLES, homeOf, canArea, isDraft, SETUP_STATUS } from '@/lib/business';
import { planOf, PLANS } from '@/lib/plan';

export default function Akun() {
  const router = useRouter();
  const { user, list, kos, kosId, pickKos } = useKos();
  if (!kos) return null;
  const role = roleOf(kos);
  const p = planOf(kos);
  const go = (k) => { pickKos(k.id); router.push(homeOf(k)); };
  return (
    <div className="stack">
      <h2>Akun</h2>
      <section className="panel" style={{ gap: 6 }}>
        <span className="label">Masuk sebagai</span>
        <b style={{ overflowWrap: 'anywhere' }}>{user?.email}</b>
        <span className="small muted">{ROLES[role]?.name || role} di {kos.name}{role === 'pemilik' && !p.owner ? ` · paket ${p.name || PLANS[p.plan]?.name || p.plan}${p.trial ? ' (masa coba)' : ''}` : ''}</span>
        {role === 'pemilik' && <Link href="/langganan" className="small">Lihat paket & langganan →</Link>}
      </section>
      <section className="panel" style={{ gap: 8 }}>
        <span className="label">Bisnis Anda</span>
        <div className="bizlist">
          {list.map((k) => (
            <button key={k.id} className={k.id === kosId ? 'on' : ''} onClick={() => go(k)} aria-current={k.id === kosId ? 'true' : undefined}>
              <span className="ic" aria-hidden="true">{typeOf(k).icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}><b style={{ overflowWrap: 'anywhere' }}>{k.name}</b><span className="small muted">{typeOf(k).name}{k.my_role && k.my_role !== 'pemilik' ? ` · ${ROLES[k.my_role]?.name}` : ''}{k.closed_at ? ' · ditutup (arsip)' : ''}</span></span>
              {isDraft(k) && <span className={'chip ' + (SETUP_STATUS[k.setup_status]?.[1] || 'void')}>{SETUP_STATUS[k.setup_status]?.[0] || 'Draf'}</span>}
              {k.id === kosId && <span className="chip good">Aktif</span>}
            </button>
          ))}
          <button onClick={() => router.push('/mulai')}><span className="ic" aria-hidden="true">＋</span><b>Tambah bisnis</b></button>
        </div>
        {list.length > 1 && canArea(kos, 'finance') && <Link href="/bisnis" className="small">Ringkasan semua bisnis →</Link>}
      </section>
      <section className="panel"><ThemeSwitch /><span className="small muted">Gelap adalah tampilan bawaan. Pilihan ini hanya untuk HP/perangkat ini.</span></section>
      <div className="modlist">
        <Link href="/bantuan" className="modrow"><span className="modic"><NavIcon name="/bantuan" /></span><span className="t"><b>Pusat bantuan</b><small>Panduan, tanya jawab, tiket bantuan</small></span></Link>
        <Link href="/panduan" className="modrow"><span className="modic"><NavIcon name="/catatan" /></span><span className="t"><b>Panduan bergambar</b><small>Langkah demi langkah semua menu</small></span></Link>
      </div>
      <button className="ghost danger" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/masuk'; }}>Keluar dari akun</button>
    </div>
  );
}
