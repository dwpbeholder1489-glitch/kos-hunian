'use client';
import Bagikan from '@/components/Bagikan';
import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { ClosedBar } from '@/components/DataTutup';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sheet } from '@/components/ui';
import NavIcon from '@/components/NavIcon';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS, limitOf } from '@/lib/plan';
import NotifBell from '@/components/NotifBell';
import RetailBell from '@/components/RetailBell';
import AnnounceBanner from '@/components/AnnounceBanner';

import { typeOf, pathAllowed, pathOfType, tabsFor, homeOf, roleOf, ROLES, canArea, pathModuleOff, moduleOn, isDraft, SETUP_STATUS } from '@/lib/business';
import { groupsFor, fourthTab, quickActions, GROUP_ICON } from '@/lib/menu';
import HomeTop from '@/components/HomeTop';
import { createPortal } from 'react-dom';
import { logoUrl } from '@/lib/logo';


function PlanBar({ kos }) {
  const p = planOf(kos);
  if (p.owner) return null;
  const byStaff = kos.business_type !== 'properti'; // toko & jasa dibatasi jumlah karyawan, kos dibatasi kamar terisi
  const lim = limitOf(kos, byStaff ? 'karyawan' : 'kamar_terisi');
  if (p.trial) return <Link href="/langganan" className="planbar trial">Masa coba semua fitur · {p.daysLeft} hari lagi · Lihat paket →</Link>;
  if (p.grace) return <Link href="/langganan" className="planbar warn">Paket {p.name} sudah habis · masa tenggang s.d. {tgl(p.until)} · Perpanjang →</Link>;
  if (p.free || p.plan === 'gratis') return <Link href="/langganan" className="planbar free">Paket {p.name || 'Gratis'}{lim != null ? (byStaff ? ` · maks ${lim} karyawan` : ` · maks ${lim} kamar terisi`) : ''} · Upgrade →</Link>;
  if (p.daysLeft != null && p.daysLeft <= 7 && !p.next) return <Link href="/langganan" className="planbar warn">Paket {p.name || PLANS[p.plan]?.name} berakhir {p.daysLeft === 0 ? 'hari ini' : `${p.daysLeft} hari lagi`} · {p.cancel ? 'Lihat paket' : 'Perpanjang'} →</Link>;
  return null;
}

// Menu samping (☰): kelompok modul, bantuan, akun, dan kartu bisnis aktif
function Drawer({ kos, on, onClose, onBiz }) {
  const groups = groupsFor(kos);
  const [open, setOpen] = useState(() => groups.find(([, , , items]) => items.some(([h]) => on(h)))?.[0] || groups[0]?.[0]);
  const home = homeOf(kos);
  const el = (
    <div className="drawer-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-h"><span className="logo"><LogoMark size={34} /><span className="logo-t"><b>PRASARA</b><small>Adaptive Business System</small></span></span>
          <button className="iconbtn" onClick={onClose} aria-label="Tutup menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
        <nav className="drawer-nav" aria-label="Semua menu">
          <Link href={home} className={'drawer-i' + (on(home) ? ' on' : '')} onClick={onClose}><NavIcon name="/beranda" />Beranda</Link>
          {groups.map(([k, name, , items]) => (
            <div key={k} className="drawer-g">
              <button className={'drawer-i' + (items.some(([h]) => on(h)) ? ' cur' : '')} aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                <NavIcon name={GROUP_ICON[k]} />{name}<svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
              {open === k && <div className="drawer-sub">{items.map(([h, l]) => <Link key={h} href={h} className={on(h) ? 'on' : ''} onClick={onClose}>{l}</Link>)}</div>}
            </div>
          ))}
          <hr />
          <Link href="/bantuan" className={'drawer-i' + (on('/bantuan') ? ' on' : '')} onClick={onClose}><NavIcon name="/bantuan" />Bantuan</Link>
          <Link href="/akun" className={'drawer-i' + (on('/akun') ? ' on' : '')} onClick={onClose}><NavIcon name="/karyawan" />Akun & tampilan</Link>
        </nav>
        <button className="drawer-biz" onClick={onBiz}><span className="ic" aria-hidden="true">{typeOf(kos).icon}</span><span className="t"><b>{kos.name}</b><small>{isDraft(kos) ? 'Draf · menunggu konfirmasi' : kos.closed_at ? 'Ditutup (arsip)' : 'Bisnis aktif'} · ganti bisnis</small></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
      </aside>
    </div>
  );
  return typeof document === 'undefined' ? el : createPortal(el, document.body);
}

export default function AppLayout({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { session, list, kos, kosId, pickKos, isAdmin } = useKos();
  const [sheet, setSheet] = useState(null); // 'biz' | 'menu' | 'quick'

  if (!session || !list || !kos) {
    return <main className="wrap"><p className="muted">Membuka PRASARA…</p></main>;
  }
  const type = typeOf(kos);
  const own = tabsFor(kos);
  const tabs = isAdmin ? [...own, ['/admin', 'Admin']] : own;
  const role = roleOf(kos);
  const allowed = pathAllowed(kos, path);
  const on = (h) => path === h || path.startsWith(h + '/');
  const home = homeOf(kos);
  const fourth = fourthTab(kos);
  const quick = quickActions(kos);
  const opsOn = on('/operasional') || (!on(home) && !(fourth && on(fourth[0])) && !on('/akun') && !on('/bantuan'));
  const go = (k) => { setSheet(null); if (k === '+') return router.push('/mulai'); pickKos(k.id); router.push(homeOf(k)); };

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <button className="bizbtn" onClick={() => setSheet('biz')} aria-label={`${kos.name}, ganti bisnis`}>
              {logoUrl(kos.profile?.logo_path) ? <img className="mark" src={logoUrl(kos.profile.logo_path)} alt="" style={{ objectFit: 'cover', padding: 0 }} /> : <LogoMark size={34} />}
              <span className="t"><b>{kos.name}</b><small>{type.name}{role !== 'pemilik' ? ` · ${ROLES[role]?.name || role}` : ''}</small></span>
              <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="right">
              <Link href="/operasional?cari=1" className="helpbtn" aria-label="Cari menu" title="Cari menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></Link>
              {isDraft(kos) ? null : kos.business_type !== 'retail' ? canArea(kos, 'rent') && moduleOn(kos, 'p_pengingat') && <NotifBell /> : canArea(kos, 'stock,finance') && moduleOn(kos, 'r_pengingat') && <RetailBell />}
              {!kos.closed_at && <Bagikan />}
              <button className="helpbtn menubtn" onClick={() => setSheet('menu')} aria-label="Buka menu" aria-haspopup="dialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
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
      <ClosedBar />
      <main className="wrap" key={kosId}>{kos.suspended_at ? (
        <div className="empty"><h2>Bisnis ini sedang ditangguhkan</h2><p className="muted">Alasan: {kos.suspend_reason || '—'}. Data Anda tetap tersimpan dan tidak dihapus.</p>
          <p className="small muted">Hubungi tim PRASARA untuk mengaktifkannya kembali.</p>
          <a href={`https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(`Halo tim PRASARA, bisnis "${kos.name}" saya ditangguhkan. Mohon info.`)}`} target="_blank" rel="noreferrer"><button className="primary">Hubungi via WhatsApp</button></a>
          {list.length > 1 && <span className="small muted">Bisnis lain bisa dibuka dengan mengetuk nama bisnis di kiri atas.</span>}</div>
      ) : allowed ? <>{path === home && <HomeTop kos={kos} />}{children}</> : isDraft(kos) ? (
        <div className="empty"><h2>{kos.name} masih dalam setup</h2><p className="muted">Menu operasional terbuka setelah pemilik meninjau dan mengaktifkan bisnis di Pusat Konfirmasi.</p>{canArea(kos, 'settings') && <Link href="/konfirmasi"><button className="primary">Buka Pusat Konfirmasi</button></Link>}</div>
      ) : pathOfType(kos, path) && pathModuleOff(kos, path) ? (
        <div className="empty"><h2>Modul ini sedang nonaktif</h2><p className="muted">Data lamanya tetap tersimpan. Pemilik atau pengelola bisa mengaktifkannya lagi di Pusat konfigurasi.</p>{canArea(kos, 'settings') && <Link href="/konfigurasi"><button className="primary">Buka Pusat konfigurasi</button></Link>}</div>
      ) : pathOfType(kos, path) ? (
        <div className="empty"><h2>Menu ini tidak termasuk tugas Anda</h2><p className="muted">Anda masuk sebagai {ROLES[role]?.name || role} di {kos.name}. Hubungi pemilik bila perlu akses.</p>{own[0] && <Link href={homeOf(kos)}><button className="primary">Buka {own[0][1]}</button></Link>}</div>
      ) : (
        <div className="empty"><h2>Menu ini bukan untuk {type.name}</h2><p className="muted">{kos.name} adalah bisnis {type.name}. Pilih menu lain, atau pindah bisnis dengan mengetuk nama bisnis di kiri atas.</p><Link href={homeOf(kos)}><button className="primary">Buka menu utama</button></Link></div>
      )}</main>

      <nav className={'bnav' + (quick.length ? ' hasfab' : '')} aria-label="Menu utama">
        <Link href={home} className={on(home) ? 'on' : ''} aria-current={on(home) ? 'page' : undefined}><NavIcon name="/beranda" />Beranda</Link>
        <Link href="/operasional" className={opsOn ? 'on' : ''} aria-current={on('/operasional') ? 'page' : undefined}><NavIcon name="/layers" />Operasional</Link>
        {quick.length > 0 && <button className="fab" onClick={() => setSheet('quick')} aria-label="Aksi cepat" aria-haspopup="dialog"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>}
        {fourth && <Link href={fourth[0]} className={on(fourth[0]) ? 'on' : ''} aria-current={on(fourth[0]) ? 'page' : undefined}><NavIcon name={fourth[2]} />{fourth[1]}</Link>}
        <Link href="/akun" className={on('/akun') ? 'on' : ''} aria-current={on('/akun') ? 'page' : undefined}><NavIcon name="/akun" />Akun</Link>
      </nav>

      {sheet === 'menu' && <Drawer kos={kos} on={on} onClose={() => setSheet(null)} onBiz={() => setSheet('biz')} />}
      {sheet === 'quick' && (
        <Sheet title="Aksi cepat" onClose={() => setSheet(null)}>
          <div className="morelist">
            {quick.map(([href, label, base]) => <Link key={href} href={href} onClick={() => setSheet(null)}><NavIcon name={base} />{label}</Link>)}
          </div>
        </Sheet>
      )}
      {sheet === 'biz' && (
        <Sheet title="Bisnis Anda" onClose={() => setSheet(null)}>
          <div className="bizlist">
            {list.map((k) => (
              <button key={k.id} className={k.id === kosId ? 'on' : ''} onClick={() => go(k)} aria-current={k.id === kosId ? 'true' : undefined}>
                <span className="ic" aria-hidden="true">{typeOf(k).icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}><b style={{ overflowWrap: 'anywhere' }}>{k.name}</b><span className="small muted">{typeOf(k).name}{k.my_role && k.my_role !== 'pemilik' ? ` · ${ROLES[k.my_role]?.name}` : ''}{k.closed_at ? ' · ditutup (arsip)' : ''}</span></span>
                {isDraft(k) && k.id !== kosId && <span className={'chip ' + (SETUP_STATUS[k.setup_status]?.[1] || 'void')}>{SETUP_STATUS[k.setup_status]?.[0] || 'Draf'}</span>}
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
