'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { ROLE, can } from '@/lib/admin';

const NAV = [
  ['/admin', 'Dashboard', 'dashboard.view'],
  ['/admin/pelanggan', 'Pelanggan', 'customers.view'],
  ['/admin/tiket', 'Tiket', 'tickets.view'],
  ['/admin/langganan', 'Langganan & pembayaran', 'payments.view'],
  ['/admin/pengumuman', 'Pengumuman', 'announce.manage'],
  ['/admin/template', 'Template', 'templates.manage'],
  ['/admin/aktivitas', 'Catatan audit', 'audit.view'],
  ['/admin/staf', 'Staf & hak akses', 'staff.manage'],
];

// Management Center: area terpisah dari aplikasi pelanggan, menu sesuai izin peran
export default function AdminLayout({ children }) {
  const { session, adminMe } = useKos();
  const path = usePathname();
  if (session === undefined || (session && adminMe === undefined)) return <div className="adm"><main className="wrap" style={{ padding: 24 }}><p className="muted">Memeriksa hak akses…</p></main></div>;
  if (!session) return null;
  if (!adminMe) {
    return (
      <div className="adm"><main className="wrap" style={{ padding: '40px 16px' }}>
        <div className="empty"><h2>Khusus staf PRASARA</h2><p className="muted">Akun ini tidak punya akses ke Management Center.</p><Link href="/beranda"><button className="primary">Kembali ke aplikasi</button></Link></div>
      </main></div>
    );
  }
  const nav = NAV.filter(([, , perm]) => can(adminMe, perm));
  const active = (href) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (
    <div className="adm">
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <div className="brand"><span className="mark">P</span><div><h1>Management Center</h1><small>PRASARA · {ROLE[adminMe.role] || adminMe.role}</small></div></div>
            <Link href="/beranda" className="small" style={{ color: 'var(--brand-fg)', opacity: 0.85 }}>← Aplikasi</Link>
          </div>
          <nav className="tabs" aria-label="Menu admin">
            {nav.map(([href, label]) => <Link key={href} href={href} className={active(href) ? 'on' : ''} aria-current={active(href) ? 'page' : undefined}>{label}</Link>)}
          </nav>
        </div>
      </header>
      <main className="wrap" style={{ paddingTop: 20, paddingBottom: 60 }}>{children}</main>
    </div>
  );
}
