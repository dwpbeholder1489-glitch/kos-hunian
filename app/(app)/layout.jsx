'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS } from '@/lib/plan';
import NotifBell from '@/components/NotifBell';
import RetailBell from '@/components/RetailBell';
import AnnounceBanner from '@/components/AnnounceBanner';

import { typeOf, pathAllowed, pathOfType, tabsFor, homeOf, roleOf, ROLES, canArea } from '@/lib/business';

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
  const own = tabsFor(kos);
  const tabs = isAdmin ? [...own, ['/admin', 'Admin']] : own;
  const role = roleOf(kos);
  const allowed = pathAllowed(kos, path);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <div className="brand">
              <span className="mark">P</span>
              <div><h1>{kos.name}</h1><small>{type.icon} {type.name}{role !== 'pemilik' ? ` · ${ROLES[role]?.name || role}` : ''}</small></div>
            </div>
            <div className="right">
            {list.length > 1 ? (
              <select className="kossel" value={kosId} onChange={(e) => { const v = e.target.value; if (v === '+') return router.push('/mulai'); pickKos(v); const k = list.find((x) => x.id === v); router.push(homeOf(k)); }} aria-label="Pilih bisnis">
                {list.map((k) => <option key={k.id} value={k.id}>{typeOf(k).icon} {k.name}</option>)}
                <option value="+">+ Tambah bisnis</option>
              </select>
            ) : <span className="small" style={{ opacity: 0.85 }}>{tgl(today())}</span>}
            {kos.business_type !== 'retail' ? canArea(kos, 'rent') && <NotifBell /> : canArea(kos, 'stock,finance') && <RetailBell />}
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
      {!path.startsWith('/langganan') && kos.business_type !== 'retail' && role === 'pemilik' && <PlanBar kos={kos} />}
      <AnnounceBanner />
      <main className="wrap" key={kosId}>{kos.suspended_at ? (
        <div className="empty"><h2>Bisnis ini sedang ditangguhkan</h2><p className="muted">Alasan: {kos.suspend_reason || '—'}. Data Anda tetap tersimpan dan tidak dihapus.</p>
          <p className="small muted">Hubungi tim PRASARA untuk mengaktifkannya kembali.</p>
          <a href={`https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(`Halo tim PRASARA, bisnis "${kos.name}" saya ditangguhkan. Mohon info.`)}`} target="_blank" rel="noreferrer"><button className="primary">Hubungi via WhatsApp</button></a>
          {list.length > 1 && <span className="small muted">Bisnis lain bisa dibuka lewat pilihan di kanan atas.</span>}</div>
      ) : allowed ? children : pathOfType(kos, path) ? (
        <div className="empty"><h2>Menu ini tidak termasuk tugas Anda</h2><p className="muted">Anda masuk sebagai {ROLES[role]?.name || role} di {kos.name}. Hubungi pemilik bila perlu akses.</p>{own[0] && <Link href={homeOf(kos)}><button className="primary">Buka {own[0][1]}</button></Link>}</div>
      ) : (
        <div className="empty"><h2>Menu ini bukan untuk {type.name}</h2><p className="muted">{kos.name} adalah bisnis {type.name}. Pilih menu di atas, atau pindah bisnis lewat pilihan di kanan atas.</p><Link href={homeOf(kos)}><button className="primary">Buka menu utama</button></Link></div>
      )}</main>
    </>
  );
}
