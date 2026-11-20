'use client';
// Arsitektur dashboard bersama (Unified Design System §13): satu kerangka untuk semua jenis bisnis.
// Setiap jenis bisnis hanya menentukan DAFTAR WIDGET-nya; semua angka berasal dari data & aturan yang sudah ada.
// Widget bisa disembunyikan & diurutkan ("Atur dashboard"); pilihan disimpan per perangkat & per bisnis.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import NavIcon from '@/components/NavIcon';
import { Sheet } from '@/components/ui';
import { rp } from '@/lib/format';
import { quickActions } from '@/lib/menu';

const KEY = (kosId, id) => `prasara-dash-${id}-${kosId}`;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

// Kartu widget: judul, tautan aksi di kanan, isi
export function Widget({ title, action, children }) {
  return (
    <section className="panel wg">
      {(title || action) && <div className="wg-h">{title && <h3>{title}</h3>}{action}</div>}
      {children}
    </section>
  );
}

// Daftar peringatan berbasis aturan (stok di bawah minimum, tagihan lewat jatuh tempo, dsb.)
// items: [{ tone: 'bad'|'warn'|'info'|'good', text, href }]
export function Alerts({ items }) {
  if (!items.length) return <p className="small muted" style={{ margin: 0 }}>Tidak ada yang perlu ditindaklanjuti sekarang.</p>;
  return (
    <ul className="alerts">{items.map((a, i) => {
      const body = <><span className={'alerts-dot ' + (a.tone || 'info')} aria-hidden="true" /><span className="alerts-t">{a.text}</span>{a.href && <span aria-hidden="true" className="muted">›</span>}</>;
      return <li key={i}>{a.href ? <Link href={a.href}>{body}</Link> : <div>{body}</div>}</li>;
    })}</ul>
  );
}

// Aksi cepat (sama dengan tombol + di HP; hanya menu yang boleh dibuka peran ini)
export function QuickActions({ kos }) {
  const q = quickActions(kos);
  if (!q.length) return null;
  return <div className="qa">{q.map(([href, label, base]) => <Link key={href} href={href}><NavIcon name={base} size={20} />{label}</Link>)}</div>;
}

const jam = (ts) => new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
const LINK = (e) => (e.agg === 'sale' ? `/struk/${e.agg_id}` : e.agg === 'svc_order' ? `/nota/${e.agg_id}` : e.agg === 'purchase' ? '/belanja' : e.agg === 'invoice' ? '/tagihan' : e.agg === 'approval' ? '/persetujuan' : null);

// Aktivitas terbaru dari riwayat aktivitas (server hanya mengirim yang boleh dilihat pengguna)
export function useActivity(kosId, ver, limit = 6) {
  const [rows, setRows] = useState(undefined); // undefined = memuat, null = tidak tersedia
  useEffect(() => {
    let alive = true;
    supabase.rpc('activity_feed', { p_kos: kosId, p_from: null, p_to: null, p_group: null, p_before: null, p_limit: limit })
      .then(({ data, error }) => alive && setRows(error ? null : data?.rows || []));
    return () => { alive = false; };
  }, [kosId, ver, limit]);
  return rows;
}
export function ActivityList({ rows }) {
  if (!rows.length) return <p className="small muted" style={{ margin: 0 }}>Belum ada aktivitas tercatat.</p>;
  return (
    <ul className="alerts">{rows.map((e) => {
      const h = LINK(e);
      const body = <><span className="alerts-t"><span className="small">{e.summary || e.label}</span><span className="small muted">{jam(e.at)}{e.actor ? ` · ${e.actor}` : ''}</span></span>{e.amount != null && <b className="small" style={{ whiteSpace: 'nowrap' }}>{rp(e.amount)}</b>}</>;
      return <li key={e.id}>{h ? <Link href={h}>{body}</Link> : <div>{body}</div>}</li>;
    })}</ul>
  );
}

// widgets: [{ id, title (nama di Atur dashboard), size: 'full'|'wide'|'normal', node }] — node null/false = tidak ditampilkan (tidak relevan / tidak ada data / tidak ada izin)
export default function Dashboard({ id, kosId, header, widgets }) {
  const k = KEY(kosId, id);
  const [pref, setPref] = useState({ hidden: [], order: [] });
  const [edit, setEdit] = useState(false);
  useEffect(() => { setPref(read(k) || { hidden: [], order: [] }); }, [k]);
  const save = (p) => { setPref(p); try { localStorage.setItem(k, JSON.stringify(p)); } catch {} };
  const avail = widgets.filter((w) => w.node);
  const rank = (w) => { const i = pref.order.indexOf(w.id); return i < 0 ? 1000 + widgets.indexOf(w) : i; };
  const sorted = [...avail].sort((a, b) => rank(a) - rank(b));
  const shown = sorted.filter((w) => !pref.hidden.includes(w.id));
  const move = (wid, dir) => {
    const ids = sorted.map((w) => w.id);
    const i = ids.indexOf(wid), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    save({ ...pref, order: ids });
  };
  const toggle = (wid) => save({ ...pref, hidden: pref.hidden.includes(wid) ? pref.hidden.filter((x) => x !== wid) : [...pref.hidden, wid] });
  return (
    <div className="stack">
      {header?.(<button className="sm ghost" onClick={() => setEdit(true)}><NavIcon name="/konfigurasi" size={18} />Atur dashboard</button>)}
      <div className="dash">{shown.map((w) => <div key={w.id} className={'dash-' + (w.size || 'normal')}>{w.node}</div>)}</div>
      {shown.length < avail.length && <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit(true)}>{avail.length - shown.length} bagian disembunyikan · tampilkan</button>}
      {edit && (
        <Sheet title="Atur dashboard" onClose={() => setEdit(false)}>
          <span className="small muted">Pilih bagian yang ditampilkan dan urutannya. Pilihan ini hanya untuk perangkat ini dan bisnis ini; data tidak berubah.</span>
          <ul className="dash-set">{sorted.map((w, i) => (
            <li key={w.id}>
              <label><input type="checkbox" checked={!pref.hidden.includes(w.id)} onChange={() => toggle(w.id)} />{w.title}</label>
              <button className="sm ghost" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label={`Naikkan ${w.title}`}>↑</button>
              <button className="sm ghost" onClick={() => move(w.id, 1)} disabled={i === sorted.length - 1} aria-label={`Turunkan ${w.title}`}>↓</button>
            </li>
          ))}</ul>
          <div className="row"><button className="primary" onClick={() => setEdit(false)}>Selesai</button><button className="ghost" onClick={() => save({ hidden: [], order: [] })}>Kembalikan bawaan</button></div>
        </Sheet>
      )}
    </div>
  );
}
