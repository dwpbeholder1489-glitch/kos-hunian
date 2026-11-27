'use client';
// Shell aplikasi untuk tablet & desktop (Unified Design System §5–6, §15).
// - Sidebar: ≥1024px lebar penuh (bisa diciutkan, disimpan per perangkat); 768–1023px icon rail.
// - Topbar: tombol menu, pencarian menu, aksi cepat, notifikasi, bantuan, bagikan, profil.
// - HP (<768px) tidak memakai komponen ini: tetap header + menu bawah di app/(app)/layout.jsx.
// Isi menu SELALU dari sectionsFor/quickFor (profil navigasi per jenis bisnis + pengaturan pemilik; sudah tersaring paket, modul aktif, peran).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NavIcon from '@/components/NavIcon';
import { LogoMark } from '@/components/Logo';
import { useKos } from '@/components/KosProvider';
import { supabase } from '@/lib/supabase';
import { notifSignOut } from '@/lib/notif';
import { logoUrl } from '@/lib/logo';
import { SIDE_KEY } from '@/lib/theme';
import { isKuliner, typeOf, roleOf, ROLES, isDraft, homeOf } from '@/lib/business';
import { sectionsFor, groupsFor, subOf, bizIcon, crumbsFor, groupIcon, pinsFor } from '@/lib/menu';
import QuickPanel from '@/components/QuickPanel';

const Chev = ({ dir = 'down', size = 16 }) => (
  <svg className="chev" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={{ down: 'm6 9 6 6 6-6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6' }[dir]} />
  </svg>
);

// Tutup saat klik di luar / Esc
function useDismiss(open, ref, close) {
  useEffect(() => {
    if (!open) return;
    const p = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const k = (e) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('pointerdown', p);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', p); document.removeEventListener('keydown', k); };
  }, [open, ref, close]);
}

// Menu tarik-turun yang bisa dipakai ulang (klik/ketuk untuk buka, klik di luar atau Esc untuk tutup)
export function Dropdown({ label, button, className = 'helpbtn', align = 'right', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = (focus) => { setOpen(false); if (focus === true) ref.current?.querySelector('button')?.focus(); };
  useDismiss(open, ref, close);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>{button}</button>
      {open && <div className={'dd-menu ' + align} role="menu" onClick={(e) => { if (e.target.closest('a,[data-close]')) setOpen(false); }}>{children}</div>}
    </div>
  );
}

function BizMark({ kos, size = 34 }) {
  const url = logoUrl(kos.profile?.logo_path);
  return <span className="bizmark" style={{ width: size, height: size }} aria-hidden="true">{url ? <img src={url} alt="" /> : <NavIcon name={bizIcon(kos)} size={Math.round(size * 0.55)} />}</span>;
}

export const isMiniNow = () => typeof window !== 'undefined' && (window.innerWidth < 1024 || document.documentElement.dataset.side === 'mini');

export function toggleSide() {
  const d = document.documentElement;
  if (d.dataset.side === 'mini') { delete d.dataset.side; try { localStorage.removeItem(SIDE_KEY); } catch {} }
  else { d.dataset.side = 'mini'; try { localStorage.setItem(SIDE_KEY, 'mini'); } catch {} }
  window.dispatchEvent(new Event('prasara-side'));
}

function useMini() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const f = () => setM(document.documentElement.dataset.side === 'mini');
    f();
    window.addEventListener('prasara-side', f);
    return () => window.removeEventListener('prasara-side', f);
  }, []);
  return m;
}

export function Sidebar({ kos, path, on, admin, onBiz }) {
  const home = homeOf(kos);
  const secs = sectionsFor(kos);
  const pins = pinsFor(kos);
  const all = secs.flatMap(([, , gs]) => gs);
  const curG = all.find(([, , , items]) => items.some(([h]) => on(h)))?.[0] || null;
  const [open, setOpen] = useState(() => new Set(curG ? [curG] : []));
  const [fly, setFly] = useState(null); // { k, top } — menu kelompok saat sidebar ciut
  const flyRef = useRef(null);
  const [tip, setTip] = useState(null); // { text, top } — label saat sidebar ciut (hover / fokus keyboard)
  const mini = useMini();
  useEffect(() => { if (curG) setOpen((s) => (s.has(curG) ? s : new Set([...s, curG]))); }, [curG]);
  useEffect(() => { setFly(null); setTip(null); }, [path]);
  const showTip = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || !isMiniNow()) return setTip(null);
    const r = t.getBoundingClientRect();
    setTip({ text: t.dataset.tip, top: r.top + r.height / 2 });
  };
  useDismiss(!!fly, flyRef, () => setFly(null));

  const tapGroup = (k, e) => {
    if (isMiniNow()) {
      const r = e.currentTarget.getBoundingClientRect();
      setTip(null);
      setFly(fly?.k === k ? null : { k, top: Math.min(r.top, window.innerHeight - 320) });
      return;
    }
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const flyGroup = fly && all.find(([k]) => k === fly.k);

  const group = ([k, name, , items]) => {
    const cur = items.some(([h]) => on(h));
    if (items.length === 1) {
      const [h, l] = items[0];
      return <Link key={k} href={h} className={'side-i' + (on(h) ? ' on' : '')} aria-current={on(h) ? 'page' : undefined} data-tip={name}><NavIcon name={groupIcon(k)} size={20} /><span className="side-t">{name === l ? name : l}</span></Link>;
    }
    const isOpen = open.has(k);
    return (
      <div key={k} className="side-g">
        <button type="button" className={'side-i' + (cur ? ' cur' : '')} aria-expanded={mini ? fly?.k === k : isOpen} onClick={(e) => tapGroup(k, e)} data-tip={name}>
          <NavIcon name={groupIcon(k)} size={20} /><span className="side-t">{name}</span><Chev dir={isOpen ? 'down' : 'right'} />
        </button>
        {isOpen && <div className="side-sub">{items.map(([h, l]) => <Link key={h} href={h} className={on(h) ? 'on' : ''} aria-current={on(h) ? 'page' : undefined}>{l}</Link>)}</div>}
      </div>
    );
  };

  return (
    <aside className="side" aria-label="Navigasi utama" onMouseOver={showTip} onMouseLeave={() => setTip(null)} onFocus={showTip} onBlur={() => setTip(null)} onScroll={() => setTip(null)}>
      <div className="side-h">
        <Link href={home} className="side-logo" aria-label="PRASARA, ke Beranda"><LogoMark size={30} /><b className="side-t">PRASARA</b></Link>
        <button type="button" className="side-col" onClick={toggleSide} aria-label={mini ? 'Lebarkan menu samping' : 'Ciutkan menu samping'} title={mini ? 'Lebarkan menu' : 'Ciutkan menu'}><Chev dir={mini ? 'right' : 'left'} size={18} /></button>
      </div>
      <button type="button" className="side-biz" onClick={onBiz} data-tip={(path === '/bisnis' ? 'Semua Bisnis' : kos.name) + ' · ganti bisnis'}
        aria-label={(path === '/bisnis' ? 'Semua Bisnis' : kos.name) + ', ganti bisnis'}>
        {path === '/bisnis' ? <LogoMark size={32} /> : <BizMark kos={kos} size={32} />}
        <span className="side-t"><b>{path === '/bisnis' ? 'Semua Bisnis' : kos.name}</b><small>{path === '/bisnis' ? 'Ringkasan Pemilik' : isDraft(kos) ? 'Draf · menunggu konfirmasi' : typeOf(kos).name}</small></span>
        <Chev />
      </button>
      <nav className="side-nav" aria-label="Menu bisnis">
        {secs.length === 0 && <Link href={home} className={'side-i' + (on(home) ? ' on' : '')} data-tip="Beranda"><NavIcon name="/beranda" size={20} /><span className="side-t">Beranda</span></Link>}
        {pins.length > 0 && (
          <div className="side-sec">
            <span className="side-sh">Pintasan</span>
            {pins.map(([h, l]) => <Link key={'pin' + h} href={h} className={'side-i' + (on(h) ? ' on' : '')} data-tip={l}><NavIcon name={h} size={20} /><span className="side-t">{l}</span></Link>)}
          </div>
        )}
        {secs.map(([k, name, gs], i) => (
          <div key={k} className="side-sec">
            <span className="side-sh">{name}</span>
            {i === 0 && <Link href={home} className={'side-i' + (on(home) ? ' on' : '')} aria-current={on(home) ? 'page' : undefined} data-tip="Beranda"><NavIcon name="/beranda" size={20} /><span className="side-t">Beranda</span></Link>}
            {gs.map(group)}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        {isKuliner(kos) && <img className="fnb-side-mascot" alt="Maskot PRASARA" src="/retail/prasara-maskot.webp" />}
        {admin && <Link href="/admin" className={'side-i' + (on('/admin') ? ' on' : '')} data-tip="Admin PRASARA"><NavIcon name="/admin" size={20} /><span className="side-t">Admin PRASARA</span></Link>}
        <Link href="/bantuan" className={'side-i' + ((on('/bantuan') || on('/learning-center')) ? ' on' : '')} data-tip="Panduan & Bantuan"><NavIcon name="/bantuan" size={20} /><span className="side-t">Panduan &amp; Bantuan</span></Link>
      </div>
      {tip && !fly && <div className="side-tip" style={{ top: tip.top }} role="tooltip">{tip.text}</div>}
      {flyGroup && (
        <div className="side-fly" ref={flyRef} style={{ top: Math.max(8, fly.top) }} role="menu" aria-label={flyGroup[1]}>
          <b>{flyGroup[1]}</b>
          {flyGroup[3].map(([h, l]) => <Link key={h} href={h} role="menuitem" className={on(h) ? 'on' : ''}><NavIcon name={h} size={18} />{l}</Link>)}
        </div>
      )}
    </aside>
  );
}

// Pencarian di topbar: menemukan menu/fitur yang boleh dibuka (tanpa data bisnis lain). Ctrl+K atau "/" untuk fokus.
function MenuSearch({ kos }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  useEffect(() => {
    const k = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); ref.current?.querySelector('input')?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const term = q.trim().toLowerCase();
  const pool = [['Beranda', homeOf(kos), 'Beranda'], ...groupsFor(kos, { all: true }).flatMap(([, g, , items]) => items.map(([h, l]) => [l, h, g])), ['Akun & tampilan', '/akun', 'Akun'], ['Panduan & Bantuan', '/bantuan', 'Bantuan'], ['Learning Center', '/learning-center', 'Bantuan'], ['Notifikasi', '/notifikasi', 'Akun']];
  const hits = term ? pool.filter(([l, h, g]) => `${l} ${subOf(h)} ${g}`.toLowerCase().includes(term)).slice(0, 8) : [];
  const go = (h) => { setQ(''); setOpen(false); router.push(h); };
  return (
    <div className="tb-search" ref={ref}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={q} placeholder="Cari menu atau fitur…" aria-label="Cari menu atau fitur" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="tb-search-list" aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel][1]); }
          else if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); }
        }} />
      <kbd className="tb-kbd" aria-hidden="true">Ctrl K</kbd>
      {open && term && (
        <div className="tb-results" id="tb-search-list" role="listbox">
          {hits.length ? hits.map(([l, h, g], i) => (
            <button type="button" key={h} role="option" aria-selected={i === sel} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
              <NavIcon name={h} size={18} /><span className="t"><b>{l}</b><small>{g}{subOf(h) ? ` · ${subOf(h)}` : ''}</small></span>
            </button>
          )) : <p className="small muted" style={{ margin: 0, padding: '10px 12px' }}>Tidak ada menu yang cocok. Menu di luar jenis bisnis atau peran Anda memang tidak ditampilkan.</p>}
        </div>
      )}
    </div>
  );
}

export function Topbar({ kos, path, bell, share, admin, onMenu, onBiz }) {
  const { user } = useKos();
  const role = roleOf(kos);
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Akun';
  const initial = String(name).trim().charAt(0).toUpperCase() || 'A';
  return (
    <header className="topbar">
      <button type="button" className="iconbtn tb-menu" onClick={onMenu} aria-label="Menu" title="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <MenuSearch kos={kos} />
      <div className="tb-right">
        {/* (+) permanen di desktop/tablet — padanan tombol tengah menu bawah HP (§13, §26) */}
        <Dropdown label="Aksi cepat" className="primary tb-quick" button={<><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span className="tb-ql">Aksi cepat</span></>}>
          <QuickPanel kos={kos} path={path} menu />
        </Dropdown>
        <Link href="/bantuan" className="helpbtn" aria-label="Bantuan" title="Bantuan"><NavIcon name="/bantuan" size={20} /></Link>
        {bell}
        {share}
        <Dropdown label="Profil dan akun" className="tb-prof" button={<><span className="avatar" aria-hidden="true">{initial}</span><span className="tb-pn"><b>{String(name).split(' ')[0]}</b><small>{ROLES[role]?.name || role}</small></span><Chev /></>}>
          <div className="dd-head"><b>{name}</b><small>{ROLES[role]?.name || role} · {kos.name}</small></div>
          <Link href="/akun" role="menuitem"><NavIcon name="/akun" size={18} />Akun & tampilan</Link>
          <button type="button" role="menuitem" data-close onClick={onBiz}><NavIcon name="swap" size={18} />Ganti bisnis</button>
          <Link href="/panduan" role="menuitem"><NavIcon name="/catatan" size={18} />Panduan lengkap</Link>
          {admin && <Link href="/admin" role="menuitem"><NavIcon name="/admin" size={18} />Admin PRASARA</Link>}
          <hr />
          <button type="button" role="menuitem" data-close className="danger" onClick={async () => { await notifSignOut(); await supabase.auth.signOut(); window.location.href = '/masuk'; }}><NavIcon name="logout" size={18} />Keluar</button>
        </Dropdown>
      </div>
    </header>
  );
}

// Breadcrumb di atas judul halaman (tablet & desktop)
export function Crumbs({ kos, path }) {
  const c = crumbsFor(kos, path);
  if (c.length < 2) return null;
  return (
    <nav className="crumbs" aria-label="Lokasi halaman">
      <ol>{c.map(([l, h], i) => <li key={i}>{h && i < c.length - 1 ? <Link href={h}>{l}</Link> : <span aria-current={i === c.length - 1 ? 'page' : undefined}>{l}</span>}</li>)}</ol>
    </nav>
  );
}
