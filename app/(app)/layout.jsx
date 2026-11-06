'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS } from '@/lib/plan';
import NotifBell from '@/components/NotifBell';
import AnnounceBanner from '@/components/AnnounceBanner';

import { typeOf, pathAllowed, BUSINESS_TYPES } from '@/lib/business';

function PlanBar({ kos }) {
  const p = planOf(kos);
  if (p.owner) return null;
  if (p.trial) return <Link href="/langganan" className="planbar trial">Masa coba semua fitur · {p.daysLeft} hari lagi · Lihat paket →</Link>;
  if (p.plan === 'gratis') return <Link href="/langganan" className="planbar free">Paket Gratis · maks {BUSINESS.freeRoomLimit} kamar terisi · Upgrade →</Link>;
  if (p.daysLeft <= 7) return <Link href="/langganan" className="planbar warn">Paket {PLANS[p.plan].name} berakhir {p.daysLeft === 0 ? 'hari ini' : `${p.daysLeft} hari lagi`} · Perpanjang →</Link>;
  return null;
}

export default function AppLayout({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { session, list, kos, kosId, pickKos, isAdmin } = useKos();

  if (!session || !list || !kos) {
    return <main className="wrap"><p className="muted">Membuka buku kos…</p></main>;
  }
  const type = typeOf(kos);
  const tabs = isAdmin ? [...type.tabs, ['/admin', 'Admin']] : type.tabs;
  const allowed = pathAllowed(kos, path);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <div className="brand">
              <span className="mark">P</span>
              <div><h1>{kos.name}</h1><small>{type.icon} {type.name}</small></div>
            </div>
            <div className="right">
            {list.length > 1 ? (
              <select className="kossel" value={kosId} onChange={(e) => { const v = e.target.value; if (v === '+') return router.push('/mulai'); pickKos(v); const k = list.find((x) => x.id === v); router.push(typeOf(k).home); }} aria-label="Pilih bisnis">
                {list.map((k) => <option key={k.id} value={k.id}>{typeOf(k).icon} {k.name}</option>)}
                <option value="+">+ Tambah bisnis</option>
              </select>
            ) : <span className="small" style={{ opacity: 0.85 }}>{tgl(today())}</span>}
            {kos.business_type !== 'retail' && <NotifBell />}
            <Link href="/bantuan" className="helpbtn" aria-label="Pusat bantuan" title="Bantuan">?</Link>
            </div>
          </div>
          <nav className="tabs" aria-label="Menu">
            {tabs.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      {!path.startsWith('/langganan') && kos.business_type !== 'retail' && <PlanBar kos={kos} />}
      <AnnounceBanner />
      <main className="wrap" key={kosId}>{allowed ? children : (
        <div className="empty"><h2>Menu ini bukan untuk {type.name}</h2><p className="muted">{kos.name} adalah bisnis {type.name}. Pilih menu di atas, atau pindah bisnis lewat pilihan di kanan atas.</p><Link href={type.home}><button className="primary">Buka {type.tabs[0][1]}</button></Link></div>
      )}</main>
    </>
  );
}
