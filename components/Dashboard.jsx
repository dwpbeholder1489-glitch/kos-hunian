'use client';
// Arsitektur dashboard bersama (Unified Design System §13): satu kerangka untuk semua jenis bisnis.
// Setiap jenis bisnis hanya menentukan DAFTAR WIDGET-nya; semua angka berasal dari data & aturan yang sudah ada.
// Widget bisa disembunyikan & diurutkan ("Atur dashboard"). Pemilik/pengelola: disimpan di server untuk seluruh bisnis
// (experience_configs.dash — berversi & bisa dipulihkan di Pusat Pengalaman). Karyawan lain: hanya untuk perangkatnya.
// Menyembunyikan widget TIDAK menghapus data sumbernya. Widget yang gagal memuat tidak menggagalkan widget lain.
import { Component, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import NavIcon from '@/components/NavIcon';
import { Sheet, Tile } from '@/components/ui';
import { rp } from '@/lib/format';
import { quickFor, quickUsed } from '@/lib/quick';
import { track } from '@/lib/usage';
import { useKos } from '@/components/KosProvider';
import { canArea } from '@/lib/business';
import { errMsg } from '@/lib/format';
import { toast } from '@/components/ui';
import { PERIODS, defaultKpis } from '@/lib/dashboards';

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
  const q = quickFor(kos);
  if (!q.length) return null;
  return <div className="qa">{q.map((a) => <Link key={a.id} href={a.href} onClick={() => { quickUsed(kos.id, a.id); track(kos.id, 'aksi', a.id); }}><NavIcon name={a.base} size={20} />{a.label}</Link>)}</div>;
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

// Preferensi dashboard: pengaturan bisnis (server, pemilik/pengelola) → pilihan perangkat (karyawan) → rekomendasi PRASARA.
// pref = { hidden[], order[], kpis[], period }. period aktif = pilihan sesaat di layar (tidak disimpan) atau periode bawaan.
export function useDashPrefs(id, fallbackPeriod = 'hari') {
  const { kos, kosId, loadKos } = useKos();
  const k = KEY(kosId, id);
  const owner = canArea(kos, 'settings');
  const server = kos?.exp?.dash?.[id] || null;
  const [pref, setPref] = useState(() => server || { hidden: [], order: [] });
  const [period, setPeriod] = useState(null);
  useEffect(() => { setPref((!owner && read(k)) || server || read(k) || { hidden: [], order: [] }); setPeriod(null); }, [k, owner, JSON.stringify(server)]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (p) => {
    const clean = { hidden: p.hidden || [], order: p.order || [], ...(p.kpis ? { kpis: p.kpis } : {}), ...(p.period ? { period: p.period } : {}) };
    setPref(clean);
    if (!owner) { try { localStorage.setItem(k, JSON.stringify(clean)); } catch {} return; }
    const all = { ...(kos?.exp?.dash || {}), [id]: clean };
    if (!clean.hidden.length && !clean.order.length && !clean.kpis && !clean.period) delete all[id];
    supabase.rpc('experience_save', { p_kos: kosId, p_part: 'dash', p_value: all, p_reason: 'Atur dashboard' })
      .then(({ error }) => { if (error) toast(errMsg(error)); else { try { localStorage.removeItem(k); } catch {} loadKos(); } });
  };
  return { id, pref, save, owner, period: period || pref.period || fallbackPeriod, setPeriod, kpiDefaults: defaultKpis(kos, id) };
}

// Pemilih periode (Hari ini / 7 hari / Bulan ini) — hanya mengubah tampilan sesaat
export function PeriodPicker({ prefs }) {
  return (
    <div className="seg dash-period" role="group" aria-label="Periode angka">
      {PERIODS.map(([k, l]) => <button key={k} type="button" className={prefs.period === k ? 'on' : ''} aria-pressed={prefs.period === k} onClick={() => prefs.setPeriod(k)}>{l}</button>)}
    </div>
  );
}

// Angka utama (KPI) yang bisa dipilih & diurutkan. items: [{ id, label, value, sub, tone }] — item null = tidak tersedia (izin/data/relevansi).
export function KpiGrid({ items, prefs }) {
  const avail = items.filter(Boolean);
  const want = prefs?.pref?.kpis?.length ? prefs.pref.kpis : prefs?.kpiDefaults?.length ? prefs.kpiDefaults : avail.map((x) => x.id);
  let shown = want.map((id) => avail.find((x) => x.id === id)).filter(Boolean);
  if (!shown.length) shown = avail.filter((x) => (prefs?.kpiDefaults || []).includes(x.id)); // pilihan pemilik tidak tersedia untuk peran ini
  if (!shown.length) shown = avail.slice(0, 4);
  if (!shown.length) return <p className="small muted" style={{ margin: 0 }}>Belum ada angka yang bisa ditampilkan untuk peran Anda.</p>;
  return <div className="grid">{shown.map((x) => <Tile key={x.id} label={x.label} value={x.value} sub={x.sub} tone={x.tone} icon={x.icon} />)}</div>;
}

// Denyut bisnis: 1–4 kalimat perbandingan dengan kondisi normal (aturan tertulis, dari data yang sama dengan laporan)
export function Pulse({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <section className="panel wg pulse">
      <div className="wg-h"><h3>Denyut bisnis</h3></div>
      <ul className="alerts">{list.map((a, i) => {
        const body = <><span className={'alerts-dot ' + (a.tone || 'info')} aria-hidden="true" /><span className="alerts-t">{a.text}</span>{a.href && <span aria-hidden="true" className="muted">›</span>}</>;
        return <li key={i}>{a.href ? <Link href={a.href}>{body}</Link> : <div>{body}</div>}</li>;
      })}</ul>
    </section>
  );
}

// Kegagalan satu widget tidak menggagalkan dashboard (§11.3 / §27)
class WidgetBoundary extends Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e) { try { console.error('Widget gagal', this.props.name, e); } catch {} }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <section className="panel wg"><div className="wg-h"><h3>{this.props.name}</h3></div>
        <p className="small muted" style={{ margin: 0 }}>Bagian ini gagal dimuat. Bagian lain tetap bisa dipakai.</p>
        <button className="sm ghost" onClick={() => this.setState({ err: false })}>Coba lagi</button></section>
    );
  }
}

// widgets: [{ id, title (nama di Atur dashboard), size: 'full'|'wide'|'normal', node }] — node null/false = tidak ditampilkan (tidak relevan / tidak ada data / tidak ada izin)
// kpis: katalog angka utama [{ id, label }] untuk "Atur dashboard" (opsional). header(atur, periode)
export default function Dashboard({ id, kosId, header, widgets, prefs: given, kpis, period: withPeriod }) {
  const own = useDashPrefs(id);
  const prefs = given || own;
  const { pref, save, owner } = prefs;
  const [edit, setEdit] = useState(false);
  const order = pref.order || [], hidden = pref.hidden || [];
  const avail = widgets.filter((w) => w.node);
  const rank = (w) => { const i = order.indexOf(w.id); return i < 0 ? 1000 + widgets.indexOf(w) : i; };
  const sorted = [...avail].sort((a, b) => rank(a) - rank(b));
  const shown = sorted.filter((w) => !hidden.includes(w.id));
  const move = (wid, dir) => {
    const ids = sorted.map((w) => w.id);
    const i = ids.indexOf(wid), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    save({ ...pref, order: ids });
  };
  const toggle = (wid) => save({ ...pref, hidden: hidden.includes(wid) ? hidden.filter((x) => x !== wid) : [...hidden, wid] });
  // KPI: daftar pilihan saat ini (pilihan pemilik atau rekomendasi), bisa dicentang & diurutkan
  const kOn = pref.kpis?.length ? pref.kpis : prefs.kpiDefaults || [];
  const kList = kpis ? [...kOn.map((x) => kpis.find((c) => c.id === x)).filter(Boolean), ...kpis.filter((c) => !kOn.includes(c.id))] : [];
  const kToggle = (kid) => save({ ...pref, kpis: kOn.includes(kid) ? kOn.filter((x) => x !== kid) : [...kOn, kid].slice(0, 16) });
  const kMove = (kid, dir) => { const a = [...kOn]; const i = a.indexOf(kid), j = i + dir; if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save({ ...pref, kpis: a }); };
  return (
    <div className="stack">
      {header?.(<button className="sm ghost" onClick={() => setEdit(true)}><NavIcon name="/konfigurasi" size={18} />Atur dashboard</button>, withPeriod ? <PeriodPicker prefs={prefs} /> : null)}
      <div className="dash">{shown.map((w) => <div key={w.id} data-widget={w.id} className={'dash-' + (w.size || 'normal')}><WidgetBoundary name={w.title}>{w.node}</WidgetBoundary></div>)}</div>
      {shown.length < avail.length && <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit(true)}>{avail.length - shown.length} bagian disembunyikan · tampilkan</button>}
      {edit && (
        <Sheet title="Atur dashboard" onClose={() => setEdit(false)}>
          <span className="small muted">{owner ? 'Berlaku untuk semua pengguna bisnis ini (bagian & angka tetap mengikuti izin masing-masing). Riwayat & pemulihan ada di Pusat Pengalaman.' : 'Pilihan ini hanya untuk perangkat Anda.'} Data tidak berubah.</span>
          <span className="label">Bagian dashboard</span>
          <ul className="dash-set">{sorted.map((w, i) => (
            <li key={w.id}>
              <label><input type="checkbox" checked={!hidden.includes(w.id)} onChange={() => toggle(w.id)} />{w.title}</label>
              <button className="sm ghost" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label={`Naikkan ${w.title}`}>↑</button>
              <button className="sm ghost" onClick={() => move(w.id, 1)} disabled={i === sorted.length - 1} aria-label={`Turunkan ${w.title}`}>↓</button>
            </li>
          ))}</ul>
          {kList.length > 0 && <>
            <span className="label">Angka utama {pref.kpis?.length ? '' : '(rekomendasi PRASARA dari profil bisnis)'}</span>
            <ul className="dash-set">{kList.map((c) => { const i = kOn.indexOf(c.id); return (
              <li key={c.id}>
                <label><input type="checkbox" checked={i >= 0} onChange={() => kToggle(c.id)} />{c.label}</label>
                <button className="sm ghost" onClick={() => kMove(c.id, -1)} disabled={i <= 0} aria-label={`Naikkan ${c.label}`}>↑</button>
                <button className="sm ghost" onClick={() => kMove(c.id, 1)} disabled={i < 0 || i === kOn.length - 1} aria-label={`Turunkan ${c.label}`}>↓</button>
              </li>
            ); })}</ul>
          </>}
          {withPeriod && <>
            <span className="label">Periode bawaan saat dashboard dibuka</span>
            <div className="seg">{PERIODS.map(([k, l]) => <button key={k} type="button" className={(pref.period || '') === k ? 'on' : ''} onClick={() => save({ ...pref, period: k })}>{l}</button>)}</div>
          </>}
          <div className="row"><button className="primary" onClick={() => setEdit(false)}>Selesai</button><button className="ghost" onClick={() => save({ hidden: [], order: [] })}>Kembalikan rekomendasi PRASARA</button></div>
        </Sheet>
      )}
    </div>
  );
}
