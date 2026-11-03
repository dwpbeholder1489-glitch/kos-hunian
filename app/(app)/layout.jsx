'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS } from '@/lib/plan';

const TABS = [
  ['/beranda', 'Dashboard'], ['/kamar', 'Kamar'], ['/penghuni', 'Penghuni'], ['/tagihan', 'Tagihan'],
  ['/pembayaran', 'Pembayaran'], ['/pengeluaran', 'Pengeluaran'], ['/laporan', 'Laporan'],
  ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'],
];

function PlanBar({ kos }) {
  const p = planOf(kos);
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
  const tabs = isAdmin ? [...TABS, ['/admin', 'Admin']] : TABS;

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <div className="brand">
              <span className="mark">KH</span>
              <div><h1>{kos.name}</h1><small>Manage Smarter. Live Better.</small></div>
            </div>
            {list.length > 1 ? (
              <select className="kossel" value={kosId} onChange={(e) => (e.target.value === '+' ? router.push('/mulai') : pickKos(e.target.value))} aria-label="Pilih kos">
                {list.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                <option value="+">+ Tambah kos</option>
              </select>
            ) : <span className="small" style={{ opacity: 0.85 }}>{tgl(today())}</span>}
          </div>
          <nav className="tabs" aria-label="Menu">
            {tabs.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      {!path.startsWith('/langganan') && <PlanBar kos={kos} />}
      <main className="wrap" key={kosId}>{children}</main>
    </>
  );
}
