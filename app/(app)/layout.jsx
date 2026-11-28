'use client';
import KuotaBar from '@/components/KuotaBar';
import TrialReminder from '@/components/TrialReminder';
import GrowthAuto from '@/components/GrowthOffer';
import UpgradeSukses from '@/components/UpgradeSukses';
import Bagikan from '@/components/Bagikan';
import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { ClosedBar } from '@/components/DataTutup';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { trackMenu, loadMine } from '@/lib/usage';
import { Sheet } from '@/components/ui';
import NavIcon from '@/components/NavIcon';
import { useKos } from '@/components/KosProvider';
import { tgl, today } from '@/lib/format';
import { planOf, PLANS, BUSINESS, limitOf } from '@/lib/plan';
import { KosBell } from '@/components/NotifBell';
import { RetailNotifBell } from '@/components/RetailBell';
import { NotifBellMenu, NotifLive, ActivationCard } from '@/components/NotifCenter';
import ChatPresence from '@/components/chat/ChatPresence';
import AnnounceBanner from '@/components/AnnounceBanner';
import { OfflineSync } from '@/components/KasirOffline';

import { isKuliner, typeOf, pathAllowed, pathOfType, tabsFor, homeOf, roleOf, ROLES, canArea, pathModuleOff, moduleOn, isDraft, SETUP_STATUS, isEvent } from '@/lib/business';
import { sectionsFor, fourthTab, mainTabOf, groupIcon, pinsFor } from '@/lib/menu';
import QuickPanel from '@/components/QuickPanel';
import HomeTop from '@/components/HomeTop';
import SmartDetailSheet from '@/components/SmartDetailSheet';
import { logoUrl } from '@/lib/logo';
import { GuideBoundary, GuideFallback, OnboardingPrompt } from '@/components/InteractiveGuide';
import { Sidebar, Topbar, Crumbs, toggleSide } from '@/components/AppShell';


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
function Drawer({ kos, on, onClose, onBiz, admin }) {
  const secs = sectionsFor(kos);
  const groups = secs.flatMap(([, , gs]) => gs);
  const pins = pinsFor(kos);
  const [open, setOpen] = useState(() => groups.find(([, , , items]) => items.some(([h]) => on(h)))?.[0] || groups[0]?.[0]);
  const home = homeOf(kos);
  return (
    <SmartDetailSheet title="Menu PRASARA" subtitle={kos.name} icon="/operasional" side onClose={onClose}>
        <nav className="drawer-nav" aria-label="Semua menu">
          <Link href={home} className={'drawer-i' + (on(home) ? ' on' : '')} onClick={onClose}><NavIcon name="/beranda" />Beranda</Link>
          {pins.length > 0 && <><span className="drawer-sh">Pintasan</span>{pins.map(([h, l]) => <Link key={'pin' + h} href={h} className={'drawer-i' + (on(h) ? ' on' : '')} onClick={onClose}><NavIcon name={h} />{l}</Link>)}</>}
          {secs.map(([sk, title, gs]) => (
            <div key={sk}>
              <span className="drawer-sh">{title}</span>
              {gs.map(([k, name, , items]) => items.length === 1 ? (
                <Link key={k} href={items[0][0]} className={'drawer-i' + (on(items[0][0]) ? ' on' : '')} onClick={onClose}><NavIcon name={groupIcon(k)} />{items[0][1]}</Link>
              ) : (
                <div key={k} className="drawer-g">
                  <button className={'drawer-i' + (items.some(([h]) => on(h)) ? ' cur' : '')} aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                    <NavIcon name={groupIcon(k)} />{name}<svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
                  {open === k && <div className="drawer-sub">{items.map(([h, l]) => <Link key={h} href={h} className={on(h) ? 'on' : ''} onClick={onClose}>{l}</Link>)}</div>}
                </div>
              ))}
            </div>
          ))}
          <hr />
          <Link href="/operasional" className={'drawer-i' + (on('/operasional') ? ' on' : '')} onClick={onClose}><NavIcon name="/layers" />Semua modul</Link>
          {admin && <Link href="/admin" className={'drawer-i' + (on('/admin') ? ' on' : '')} onClick={onClose}><NavIcon name="/admin" />Admin PRASARA</Link>}
          <Link href="/bantuan" className={'drawer-i' + (on('/bantuan') ? ' on' : '')} onClick={onClose}><NavIcon name="/bantuan" />Panduan &amp; Bantuan</Link>
          <Link href="/akun" className={'drawer-i' + (on('/akun') ? ' on' : '')} onClick={onClose}><NavIcon name="/karyawan" />Akun & tampilan</Link>
        </nav>
        <button className="drawer-biz" onClick={onBiz}><span className="ic" aria-hidden="true">{typeOf(kos).icon}</span><span className="t"><b>{kos.name}</b><small>{isDraft(kos) ? 'Draf · menunggu konfirmasi' : kos.closed_at ? 'Ditutup (arsip)' : 'Bisnis aktif'} · ganti bisnis</small></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
    </SmartDetailSheet>
  );
}

// Tablet & desktop (≥768px) memakai sidebar + topbar; HP memakai header + menu bawah. Hanya satu yang dirender agar
// lonceng/bagikan tidak memuat data dua kali. CSS juga menyembunyikan yang tidak sesuai (cadangan).
function useWide() {
  const q = '(min-width: 768px)';
  const [w, setW] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setW(m.matches);
    f();
    m.addEventListener ? m.addEventListener('change', f) : m.addListener(f);
    return () => (m.removeEventListener ? m.removeEventListener('change', f) : m.removeListener(f));
  }, []);
  return w;
}

export default function AppLayout({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { session, list, kos, kosId, pickKos, isAdmin } = useKos();
  const [sheet, setSheet] = useState(null); // 'biz' | 'menu' | 'quick'
  const wide = useWide();
  // Fase 7: catat menu yang dibuka (jumlah saja) & muat pemakaian sendiri untuk urutan tombol (+)
  useEffect(() => { if (kosId && session) { loadMine(kosId); trackMenu(kosId, path); } }, [kosId, path, session]);

  if (!session || !list || !kos) {
    return <main className="wrap"><p className="muted">Membuka PRASARA…</p></main>;
  }
  const type = typeOf(kos);
  const own = tabsFor(kos);
  const role = roleOf(kos);
  const portfolio = path === '/bisnis';
  const ownsBusiness = list.some((business) => roleOf(business) === 'pemilik');
  const allowed = portfolio ? ownsBusiness : pathAllowed(kos, path);
  const activeTab = own.reduce((active, [href]) => (path === href || path.startsWith(href + '/')) && href.length > active.length ? href : active, '');
  const on = (h) => path === h || (path.startsWith(h + '/') && !activeTab.startsWith(h + '/'));
  const home = homeOf(kos);
  const fourth = fourthTab(kos);
  const main = mainTabOf(kos);
  const reportOn = fourth && (on(fourth[0]) || (fourth[0] === '/laporan-analisis' && (path.startsWith('/laporan') || ['/analisis', '/rekap', '/pembukuan'].includes(path))));
  const mainOn = on(main[0]) || (main[0] === '/operasional' && !on(home) && !reportOn && !on('/akun') && !on('/bantuan') && !on('/learning-center'));
  // Lonceng Pusat Notifikasi untuk semua peran; hitungan "perlu ditindaklanjuti" lama ikut bila peran & modulnya sesuai
  const bell = isDraft(kos) ? null : kos.business_type !== 'retail' ? (canArea(kos, 'rent') && moduleOn(kos, 'p_pengingat') ? <KosBell /> : <NotifBellMenu />) : (canArea(kos, 'stock,finance') && moduleOn(kos, 'r_pengingat') ? <RetailNotifBell /> : <NotifBellMenu />);
  // Tombol menu topbar: tablet (icon rail) → menu samping lengkap; desktop → lebarkan/ciutkan sidebar
  const onMenu = () => (window.innerWidth < 1024 ? setSheet('menu') : toggleSide());
  const go = (k) => { setSheet(null); if (k === '+') return router.push('/mulai'); pickKos(k.id); router.push(homeOf(k)); };

  return (
    <GuideBoundary key={`${session.user.id}:${kosId}:${role}`} scope={`${session.user.id}:${kosId}:${role}`} path={path} kos={kos}>
    <div className="shell" data-accounting={path === '/pembukuan' || undefined} data-fnb={isKuliner(kos) || undefined}>
      {wide && <Sidebar kos={kos} path={path} on={on} admin={isAdmin} onBiz={() => setSheet('biz')} />}
      <div className="shell-main">
      {wide ? <Topbar kos={kos} path={path} bell={bell} share={!kos.closed_at ? <Bagikan /> : null} admin={isAdmin} onMenu={onMenu} onBiz={() => setSheet('biz')} /> : (
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <button className="bizbtn" onClick={() => setSheet('biz')} aria-label={(portfolio ? "Semua Bisnis" : kos.name) + ", ganti bisnis"}>
              {!portfolio && logoUrl(kos.profile?.logo_path) ? <img className="mark" src={logoUrl(kos.profile.logo_path)} alt="" style={{ objectFit: 'cover', padding: 0 }} /> : <LogoMark size={34} />}
              <span className="t"><b>{portfolio ? 'Semua Bisnis' : kos.name}</b><small>{portfolio ? 'Ringkasan Pemilik' : type.name}{!portfolio && role !== 'pemilik' ? ` · ${ROLES[role]?.name || role}` : ''}</small></span>
              <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="right">
              <Link href="/operasional?cari=1" className="helpbtn" aria-label="Cari menu" title="Cari menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></Link>
              {bell}
              {!kos.closed_at && <Bagikan />}
              <button className="helpbtn menubtn" onClick={() => setSheet('menu')} aria-label="Buka menu" aria-haspopup="dialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
            </div>
          </div>
        </div>
      </header>
      )}
      <OfflineSync />
      <NotifLive />
      {!portfolio && (kos.business_type === 'retail' || kos.business_type === 'jasa') && (canArea(kos, 'sell') || canArea(kos, 'ops')) && <ChatPresence kosId={kos.id} />}
      {!path.startsWith('/langganan') && !portfolio && role === 'pemilik' && <PlanBar kos={kos} />}
      {!path.startsWith('/langganan') && !portfolio && role === 'pemilik' && <KuotaBar kosId={kos.id} />}
      {!path.startsWith('/langganan') && !portfolio && role === 'pemilik' && <TrialReminder kosId={kos.id} />}
      {!portfolio && role === 'pemilik' && <UpgradeSukses kosId={kos.id} skip={/^\/(kasir|dapur|meja|penjualan|pembayaran|shift|pesanan|chat)/.test(path)} />}
      {!portfolio && role === 'pemilik' && <GrowthAuto kosId={kos.id} event={path.startsWith('/laporan') ? 'LAPORAN.DIBUKA' : 'TRANSAKSI.PERTAMA'} skip={path.startsWith('/langganan') || /^\/(kasir|dapur|meja|penjualan|pembayaran|shift|pesanan|chat)/.test(path)} />}
      <AnnounceBanner />
      {!portfolio && <ClosedBar />}
      <main className="wrap" key={kosId} data-guide-page><Crumbs kos={kos} path={path} />{portfolio && !ownsBusiness ? <div className="empty"><h2>Ringkasan ini khusus pemilik bisnis</h2><Link href={home}>Buka bisnis aktif</Link></div> : !portfolio && kos.suspended_at ? (
        <div className="empty"><h2>Bisnis ini sedang ditangguhkan</h2><p className="muted">Alasan: {kos.suspend_reason || '—'}. Data Anda tetap tersimpan dan tidak dihapus.</p>
          <p className="small muted">Hubungi tim PRASARA untuk mengaktifkannya kembali.</p>
          <a href={`https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(`Halo tim PRASARA, bisnis "${kos.name}" saya ditangguhkan. Mohon info.`)}`} target="_blank" rel="noreferrer"><button className="primary">Hubungi via WhatsApp</button></a>
          {list.length > 1 && <span className="small muted">Bisnis lain bisa dibuka dengan mengetuk nama bisnis di kiri atas.</span>}</div>
      ) : allowed ? <>{path === home && path !== '/toko' && path !== '/beranda' && !isKuliner(kos) && !isEvent(kos) && <HomeTop kos={kos} />}{path === home && !isDraft(kos) && <ActivationCard />}<Suspense fallback={<p className="muted">Memuat…</p>}><GuideFallback />{path === home && <OnboardingPrompt />}<div data-guide-content style={{ display: "contents" }}>{children}</div></Suspense></> : isDraft(kos) ? (
        <div className="empty"><h2>{kos.name} masih dalam setup</h2><p className="muted">Menu operasional terbuka setelah pemilik meninjau dan mengaktifkan bisnis di Pusat Konfirmasi.</p>{canArea(kos, 'settings') && <Link href="/konfirmasi"><button className="primary">Buka Pusat Konfirmasi</button></Link>}</div>
      ) : pathOfType(kos, path) && pathModuleOff(kos, path) ? (
        <div className="empty"><h2>Modul ini sedang nonaktif</h2><p className="muted">Data lamanya tetap tersimpan. Pemilik atau pengelola bisa mengaktifkannya lagi di Pusat konfigurasi.</p>{canArea(kos, 'settings') && <Link href="/konfigurasi"><button className="primary">Buka Pusat konfigurasi</button></Link>}</div>
      ) : pathOfType(kos, path) ? (
        <div className="empty"><h2>Menu ini tidak termasuk tugas Anda</h2><p className="muted">Anda masuk sebagai {ROLES[role]?.name || role} di {kos.name}. Hubungi pemilik bila perlu akses.</p>{own[0] && <Link href={homeOf(kos)}><button className="primary">Buka {own[0][1]}</button></Link>}</div>
      ) : (
        <div className="empty"><h2>Menu ini bukan untuk {type.name}</h2><p className="muted">{kos.name} adalah bisnis {type.name}. Pilih menu lain, atau pindah bisnis dengan mengetuk nama bisnis di kiri atas.</p><Link href={homeOf(kos)}><button className="primary">Buka menu utama</button></Link></div>
      )}</main>
      </div>

      {/* Menu bawah tetap: [Beranda] [Menu utama kontekstual] [(+)] [Laporan] [Akun]. Tombol (+) PERMANEN di tengah (§13). */}
      {!wide && <nav className="bnav hasfab" aria-label="Menu utama">
        <Link href={home} className={on(home) ? 'on' : ''} aria-current={on(home) ? 'page' : undefined}><NavIcon name="/beranda" />Beranda</Link>
        <Link href={main[0]} className={mainOn ? 'on' : ''} aria-current={on(main[0]) ? 'page' : undefined}><NavIcon name={main[2]} />{main[1]}</Link>
        <button className="fab" onClick={() => setSheet('quick')} aria-label="Aksi cepat" aria-haspopup="dialog"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        {fourth ? <Link href={fourth[0]} className={reportOn || path === '/pembukuan' ? 'on' : ''} aria-current={on(fourth[0]) ? 'page' : undefined}><NavIcon name={fourth[2]} />{fourth[1]}</Link>
          : <Link href="/operasional" className={on('/operasional') ? 'on' : ''}><NavIcon name="/layers" />Menu</Link>}
        <Link href="/akun" className={on('/akun') ? 'on' : ''} aria-current={on('/akun') ? 'page' : undefined}><NavIcon name="/akun" />Akun</Link>
      </nav>}

      {sheet === 'menu' && <Drawer kos={kos} on={on} onClose={() => setSheet(null)} onBiz={() => setSheet('biz')} admin={isAdmin} />}
      {sheet === 'quick' && (
        <Sheet title="Aksi cepat" onClose={() => setSheet(null)}>
          <QuickPanel kos={kos} path={path} onPick={() => setSheet(null)} />
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
          {ownsBusiness && !portfolio && <Link href="/bisnis" onClick={() => setSheet(null)} className="small">Lihat ringkasan semua bisnis →</Link>}
        </Sheet>
      )}
    </div>
    </GuideBoundary>
  );
}
