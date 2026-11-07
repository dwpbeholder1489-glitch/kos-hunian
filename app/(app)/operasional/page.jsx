'use client';
// Modul Bisnis: semua menu yang boleh dibuka, dikelompokkan (Operasional, Transaksi, Pelanggan, Inventaris, Keuangan, Laporan, Pengaturan).
// Isi sudah tersaring per jenis bisnis, peran, dan modul aktif (lib/menu.js → tabsFor).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import { groupsFor, subOf, GROUP_ICON } from '@/lib/menu';

export default function Operasional() {
  const { kos } = useKos();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('cari')) ref.current?.focus(); } catch {} }, []);
  if (!kos) return null;
  const groups = groupsFor(kos);
  const term = q.trim().toLowerCase();
  const hits = term ? groups.flatMap(([, g, , items]) => items.map((x) => [...x, g])).filter(([h, l, g]) => `${l} ${subOf(h)} ${g}`.toLowerCase().includes(term)) : [];
  return (
    <div className="stack">
      <div className="row"><h2>Modul Bisnis</h2><PageHelp page="operasional" /></div>
      <label className="searchbox"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={ref} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari modul atau fitur…" aria-label="Cari modul atau fitur" /></label>
      {term ? (
        hits.length ? <div className="modlist">{hits.map(([h, l, g]) => (
          <Link key={h} href={h} className="modrow"><span className="modic"><NavIcon name={h} /></span><span className="t"><b>{l}</b><small>{g}{subOf(h) ? ` · ${subOf(h)}` : ''}</small></span><Chev /></Link>
        ))}</div> : <span className="small muted">Tidak ada menu yang cocok. Menu yang tidak sesuai jenis bisnis atau peran Anda memang tidak ditampilkan.</span>
      ) : (
        <div className="modlist">{groups.map(([k, name, desc, items]) => (
          <div key={k} className={'modgroup' + (open === k ? ' open' : '')}>
            <button className="modrow" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <span className="modic"><NavIcon name={GROUP_ICON[k]} /></span><span className="t"><b>{name}</b><small>{desc}</small></span><Chev down={open === k} />
            </button>
            {open === k && <div className="modsub">{items.map(([h, l]) => (
              <Link key={h} href={h}><NavIcon name={h} size={20} /><span className="t"><b>{l}</b>{subOf(h) && <small>{subOf(h)}</small>}</span><Chev /></Link>
            ))}</div>}
          </div>
        ))}</div>
      )}
    </div>
  );
}

function Chev({ down }) {
  return <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ transform: down ? 'rotate(90deg)' : undefined }}><path d="m9 6 6 6-6 6" /></svg>;
}
