'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sheet } from '@/components/ui';
import NavIcon from '@/components/NavIcon';
import ThemeSwitch from '@/components/ThemeSwitch';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS } from '@/lib/plan';
import NotifBell from '@/components/NotifBell';
import RetailBell from '@/components/RetailBell';
import AnnounceBanner from '@/components/AnnounceBanner';

import { typeOf, pathAllowed, pathOfType, tabsFor, homeOf, roleOf, ROLES, canArea, primaryTabs } from '@/lib/business';

const SHORT = { '/barang': 'Barang', '/laporan-toko': 'Laporan', '/kas': 'Kas', '/kontak': 'Kontak', '/shift': 'Shift', '/beranda': 'Beranda' };

function PlanBar({ kos }) {
  const p = planOf(kos);
  if (p.owner) return null;
  if (p.trial) return <Link href="/langganan" className="planbar trial">Masa coba semua fitur · {p.daysLeft} hari lagi · Lihat paket →</Link>;
  if (p.plan === 'gratis') return <Link href="/langganan" className="planbar free">Paket Gratis{kos.business_type === 'retail' ? ' · maks 1 karyawan' : ` · maks ${BUSINESS.freeRoomLimit} kamar terisi`} · Upgrade →</Link>;
  if (p.daysLeft <= 7) return <Link href="/langganan" className="planbar warn">Paket {PLANS[p.plan].name} berakhir {p.daysLeft === 0 ? 'hari ini' : `${p.daysLeft} hari lagi`} · Perpanjang →</Link>;
  return null;
}

export default function AppLayout({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { session, list, kos, kosId, pickKos, isAdmin } = useKos();
  const [sheet, setSheet] = useState(null); // 'biz' | 'more'

  if (!session || !list || !kos) {
    return <main className="wrap"><p className="muted">Membuka PRASARA…</p></main>;
  }
  const type = typeOf(kos);
  const own = tabsFor(kos);
  const tabs = isAdmin ? [...own, ['/admin', 'Admin']] : own;
  const role = roleOf(kos);
  const allowed = pathAllowed(kos, path);
  const prim = primaryTabs(kos);
  const rest = tabs.filter(([h]) => !prim.some(([p]) => p === h));
  const on = (h) => path === h || path.startsWith(h + '/');
  const restOn = rest.some(([h]) => on(h)) || on('/bantuan');
  const go = (k) => { setSheet(null); if (k === '+') return router.push('/mulai'); pickKos(k.id); router.push(homeOf(k)); };

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <button className="bizbtn" onClick={() => setSheet('biz')} aria-label={`${kos.name}, ganti bisnis`}>
              <span className="mark">P</span>
              <span className="t"><b>{kos.name}</b><small>{type.name}{role !== 'pemilik' ? ` · ${ROLES[role]?.name || role}` : ''}</small></span>
              <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="right">
              {kos.business_type !== 'retail' ? canArea(kos, 'rent') && <NotifBell /> : canArea(kos, 'stock,finance') && <RetailBell />}
              <Link href="/bantuan" className="helpbtn" aria-label="Pusat bantuan" title="Bantuan">?</Link>
            </div>
          </div>
          <nav className="tabs" aria-label="Menu">
            {tabs.map(([href, label]) => (
              <Link key={href} href={href} className={on(href) ? 'on' : ''} aria-current={on(href) ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      {!path.startsWith('/langganan') && role === 'pemilik' && <PlanBar kos={kos} />}
      <AnnounceBanner />
      <main className="wrap" key={kosId}>{kos.suspended_at ? (
        <div className="empty"><h2>Bisnis ini sedang ditangguhkan</h2><p className="muted">Alasan: {kos.suspend_reason || '—'}. Data Anda tetap tersimpan dan tidak dihapus.</p>
          <p className="small muted">Hubungi tim PRASARA untuk mengaktifkannya kembali.</p>
          <a href={`https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(`Halo tim PRASARA, bisnis "${kos.name}" saya ditangguhkan. Mohon info.`)}`} target="_blank" rel="noreferrer"><button className="primary">Hubungi via WhatsApp</button></a>
          {list.length > 1 && <span className="small muted">Bisnis lain bisa dibuka dengan mengetuk nama bisnis di kiri atas.</span>}</div>
      ) : allowed ? children : pathOfType(kos, path) ? (
        <div className="empty"><h2>Menu ini tidak termasuk tugas Anda</h2><p className="muted">Anda masuk sebagai {ROLES[role]?.name || role} di {kos.name}. Hubungi pemilik bila perlu akses.</p>{own[0] && <Link href={homeOf(kos)}><button className="primary">Buka {own[0][1]}</button></Link>}</div>
      ) : (
        <div className="empty"><h2>Menu ini bukan untuk {type.name}</h2><p className="muted">{kos.name} adalah bisnis {type.name}. Pilih menu lain, atau pindah bisnis dengan mengetuk nama bisnis di kiri atas.</p><Link href={homeOf(kos)}><button className="primary">Buka menu utama</button></Link></div>
      )}</main>

      <nav className="bnav" aria-label="Menu utama">
        {prim.map(([href, label]) => (
          <Link key={href} href={href} className={on(href) ? 'on' : ''} aria-current={on(href) ? 'page' : undefined}><NavIcon name={href} />{SHORT[href] || label}</Link>
        ))}
        <button className={restOn ? 'on' : ''} onClick={() => setSheet('more')} aria-haspopup="dialog"><NavIcon name="more" />Lainnya</button>
      </nav>

      {sheet === 'more' && (
        <Sheet title="Menu lainnya" onClose={() => setSheet(null)}>
          <div className="morelist">
            {rest.map(([href, label]) => <Link key={href} href={href} className={on(href) ? 'on' : ''} onClick={() => setSheet(null)}><NavIcon name={href} />{label}</Link>)}
            <Link href="/bantuan" className={on('/bantuan') ? 'on' : ''} onClick={() => setSheet(null)}><NavIcon name="/bantuan" />Bantuan</Link>
            <button onClick={() => setSheet('biz')}><NavIcon name="swap" />Ganti bisnis</button>
          </div>
          <ThemeSwitch />
          <button className="ghost" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/masuk'; }}>Keluar dari akun</button>
        </Sheet>
      )}
      {sheet === 'biz' && (
        <Sheet title="Bisnis Anda" onClose={() => setSheet(null)}>
          <div className="bizlist">
            {list.map((k) => (
              <button key={k.id} className={k.id === kosId ? 'on' : ''} onClick={() => go(k)} aria-current={k.id === kosId ? 'true' : undefined}>
                <span className="ic" aria-hidden="true">{typeOf(k).icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}><b style={{ overflowWrap: 'anywhere' }}>{k.name}</b><span className="small muted">{typeOf(k).name}{k.my_role && k.my_role !== 'pemilik' ? ` · ${ROLES[k.my_role]?.name}` : ''}</span></span>
                {k.id === kosId && <span className="chip info">Dibuka</span>}
              </button>
            ))}
            <button onClick={() => go('+')}><span className="ic" aria-hidden="true">＋</span><b>Tambah bisnis</b></button>
          </div>
          {list.length > 1 && canArea(kos, 'finance') && <Link href="/bisnis" onClick={() => setSheet(null)} className="small">Lihat ringkasan semua bisnis →</Link>}
        </Sheet>
      )}
    </>
  );
}
