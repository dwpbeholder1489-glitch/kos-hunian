'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';

const TABS = [
  ['/beranda', 'Dashboard'], ['/kamar', 'Kamar'], ['/penghuni', 'Penghuni'], ['/tagihan', 'Tagihan'],
  ['/pembayaran', 'Pembayaran'], ['/pengeluaran', 'Pengeluaran'], ['/laporan', 'Laporan'], ['/pengaturan', 'Pengaturan'],
];

export default function AppLayout({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { session, list, kos, kosId, pickKos } = useKos();

  if (!session || !list || !kos) {
    return <main className="wrap"><p className="muted">Membuka buku kos…</p></main>;
  }

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
            {TABS.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap" key={kosId}>{children}</main>
    </>
  );
}
