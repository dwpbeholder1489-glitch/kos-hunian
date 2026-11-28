'use client';
// Tarif & kalender sewa (Universal Rental Engine, modul p_tarif). Kalender = rental_calendar; harga = rental_quote (server);
// tarif & aturan ditulis lewat rental_rate_save / rental_rule_save / rental_rate_delete (pemilik/pengelola).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { PageHeader } from '@/components/Page';
import { Loading, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import { UNITS, UNIT_NAME, UnitPicker, SpanFields, emptySpan, useQuote, QuoteBox, RentalStartSheet } from '@/components/SewaFleksibel';
import { canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';
import { rp, tgl, today, errMsg, parseRp, angka } from '@/lib/format';
import styles from './tarif.module.css';

const addDays = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const DOW = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const RULE_KIND = { musim: 'Musim / periode', hari_pekan: 'Hari tertentu (mis. akhir pekan)', tanggal: 'Tanggal khusus (libur, event)', durasi: 'Diskon sewa lama' };

export default function TarifPage() {
  const { kos, kosId, ver } = useKos();
  const sp = useSearchParams();
  const t = termsFor(kos);
  const [tab, setTab] = useState(sp.get('tab') || 'kalender');
  const pricing = canArea(kos, 'settings') || canArea(kos, 'finance');
  return <div className={styles.page}>
    <PageHeader title="Tarif & kalender sewa" help={<PageHelp page="tarif" />}
      desc={`Ketersediaan ${t.unit.toLowerCase()} per hari, tarif per jam/harian/mingguan/bulanan/tahunan, dan aturan harga dinamis.`} />
    <div className={styles.tabs} role="tablist">{[['kalender', 'Kalender'], ['harga', 'Cek harga & sewa'], ['tarif', 'Tarif'], ['aturan', 'Aturan tarif']].map(([k, l]) =>
      <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'kalender' && <Calendar kosId={kosId} ver={ver} t={t} />}
    {tab === 'harga' && <Quote kosId={kosId} t={t} />}
    {tab === 'tarif' && <Rates kosId={kosId} ver={ver} t={t} edit={pricing} />}
    {tab === 'aturan' && <Rules kosId={kosId} ver={ver} edit={pricing} />}
  </div>;
}

function Calendar({ kosId, ver, t }) {
  const [from, setFrom] = useState(today());
  const [len, setLen] = useState(14);
  const [d, setD] = useState(null);
  const [pick, setPick] = useState(null);
  useEffect(() => {
    let on = true; setD(null);
    supabase.rpc('rental_calendar', { p_kos: kosId, p_from: from, p_to: addDays(from, len - 1) }).then(({ data, error }) => on && setD(error ? { error: errMsg(error) } : data));
    return () => { on = false; };
  }, [kosId, ver, from, len]);
  const days = useMemo(() => Array.from({ length: len }, (_, i) => addDays(from, i)), [from, len]);
  if (!d) return <Loading rows={5} />;
  if (d.error) return <div className="notice bad">{d.error}</div>;
  const dayStart = (x) => new Date(x + 'T00:00:00+07:00').getTime();
  const cell = (room, day) => {
    const a = dayStart(day), b = a + 864e5;
    const hit = d.items.filter((it) => it.room_id === room.id && new Date(it.from).getTime() < b && (!it.to || new Date(it.to).getTime() > a));
    if (hit.length) return hit;
    return room.status === 'perbaikan' ? [{ kind: 'rawat', label: 'Perbaikan' }] : room.status === 'tidak_disewakan' ? [{ kind: 'tidak', label: 'Tidak disewakan' }] : [];
  };
  return <>
    <div className={styles.bar}>
      <button className="sm" onClick={() => setFrom(addDays(from, -len))} aria-label="Sebelumnya">‹</button>
      <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Mulai tanggal" />
      <button className="sm" onClick={() => setFrom(addDays(from, len))} aria-label="Berikutnya">›</button>
      <div className="seg">{[[7, '7 hari'], [14, '14 hari'], [31, '31 hari']].map(([n, l]) => <button key={n} className={len === n ? 'on' : ''} onClick={() => setLen(n)}>{l}</button>)}</div>
    </div>
    <div className={styles.legend}><span data-k="kosong">Kosong</span><span data-k="sewa">Terisi</span><span data-k="booking">Booking</span><span data-k="rawat">Perbaikan</span></div>
    <div className={styles.gridWrap} role="region" aria-label="Kalender ketersediaan" tabIndex={0}>
      <table className={styles.grid}>
        <thead><tr><th scope="col">{t.unit}</th>{days.map((x) => <th key={x} scope="col" data-today={x === today()}><span>{DOW[new Date(x + 'T00:00:00Z').getUTCDay() || 7]}</span><b>{Number(x.slice(8))}</b></th>)}</tr></thead>
        <tbody>{d.rooms.map((r) => <tr key={r.id}><th scope="row">{r.code}</th>{days.map((x) => {
          const its = cell(r, x); const k = its[0]?.kind || 'kosong';
          return <td key={x} data-k={k}><button aria-label={`${r.code} ${tgl(x)}: ${its.map((i) => i.label).join(', ') || 'kosong'}`} onClick={() => setPick({ room: r, day: x, its })}>{its.length > 1 ? its.length : ''}</button></td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    <p className="small muted">Geser tabel ke samping untuk tanggal berikutnya. Ketuk kotak untuk rinciannya.</p>
    {pick && <Sheet title={`${pick.room.code} · ${tgl(pick.day)}`} onClose={() => setPick(null)}>
      {pick.its.length === 0 ? <p>Kosong pada tanggal ini.</p> : <div className="list">{pick.its.map((i, n) => <div className="li" key={n}><div className="main"><b>{i.label}</b>
        <span className="small muted">{i.kind === 'sewa' ? 'Sedang menyewa' : i.kind === 'booking' ? 'Booking' : ''}{i.cycle ? ` · ${UNITS.find(([k]) => k === i.cycle)?.[1]}` : ''}{i.from ? ` · ${new Date(i.from).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: i.cycle === 'jam' ? 'short' : undefined })}` : ''}{i.to ? ` – ${new Date(i.to).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: i.cycle === 'jam' ? 'short' : undefined })}` : ' – tanpa akhir'}</span></div></div>)}</div>}
      <a href={`/booking?kamar=${pick.room.id}`}>Booking {t.unit.toLowerCase()} ini</a>
    </Sheet>}
  </>;
}

function Quote({ kosId, t }) {
  const d = useData();
  const [room, setRoom] = useState('');
  const [unit, setUnit] = useState('hari');
  const [span, setSpan] = useState(emptySpan('hari'));
  const [start, setStart] = useState(false);
  const q = useQuote(kosId, room, unit, span);
  if (!d.ready) return <Loading />;
  return <section className="panel">
    <Field label={t.unit}><select value={room} onChange={(e) => setRoom(e.target.value)}><option value="">Pilih…</option>{d.rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></Field>
    <UnitPicker value={unit} onChange={(u) => { setUnit(u); setSpan(emptySpan(u)); }} />
    <SpanFields unit={unit} value={span} onChange={setSpan} />
    <QuoteBox q={q} unit={unit} />
    <div className="row">
      {q && !q.error && !q.clash && <a className="primary" href={`/booking?kamar=${room}`}>Buat booking</a>}
      {unit !== 'bulan' && <button onClick={() => setStart(true)}>Sewa langsung (tamu datang sekarang)</button>}
    </div>
    {start && <RentalStartSheet d={d} roomId={room} onClose={() => setStart(false)} />}
  </section>;
}

function Rates({ kosId, ver, t, edit }) {
  const d = useData();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const load = () => supabase.from('rental_rates').select('*').eq('kos_id', kosId).order('unit').then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || !d.ready) return <Loading />;
  const del = async (r) => { if (confirm('Hapus tarif ini?') && await run(() => supabase.rpc('rental_rate_delete', { p_kos: kosId, p_kind: 'rate', p_id: r.id }), 'Tarif dihapus', errMsg)) load(); };
  return <>
    <p className="small muted">Tarif bulanan tanpa isian di sini memakai harga sewa di data {t.unit.toLowerCase()}. Tarif khusus satu {t.unit.toLowerCase()} mengalahkan tarif "semua".</p>
    {rows.length === 0 ? <p className="muted">Belum ada tarif. Tambahkan mis. harian Rp150.000 untuk semua {t.unit.toLowerCase()}.</p> :
      <div className="list">{rows.map((r) => <div className="li" key={r.id}>
        <div className="main"><b>{UNITS.find(([k]) => k === r.unit)?.[1]} · {r.room_id ? d.roomCode(r.room_id) : `Semua ${t.unit.toLowerCase()}`}</b>
          <span className="small muted">{rp(r.price)}/{UNIT_NAME[r.unit]}{r.min_qty > 1 ? ` · minimal ${r.min_qty} ${UNIT_NAME[r.unit]}` : ''}{r.active ? '' : ' · nonaktif'}{r.note ? ` · ${r.note}` : ''}</span></div>
        {edit && <div className="row" style={{ flexWrap: 'nowrap' }}><button className="sm" onClick={() => setForm(r)}>Ubah</button><button className="sm ghost danger" onClick={() => del(r)}>Hapus</button></div>}
      </div>)}</div>}
    {edit ? <button className="primary" onClick={() => setForm({})}>+ Tarif</button> : <p className="small muted">Tarif diatur pemilik/pengelola.</p>}
    {form && <RateForm kosId={kosId} d={d} r={form} t={t} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
  </>;
}
function RateForm({ kosId, d, r, t, onClose, onDone }) {
  const [p, setP] = useState({ unit: r.unit || 'hari', room_id: r.room_id || '', price: r.price ? angka(r.price) : '', min_qty: String(r.min_qty || 1), active: r.active !== false, note: r.note || '' });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!(parseRp(p.price) > 0)) return toast('Isi harga.');
    if (await run(() => supabase.rpc('rental_rate_save', { p_kos: kosId, p_id: r.id || null, p: { ...p, price: parseRp(p.price), min_qty: Number(p.min_qty) || 1 } }), 'Tarif disimpan', errMsg)) onDone();
  };
  return <Sheet title={r.id ? 'Ubah tarif' : 'Tambah tarif'} onClose={onClose}>
    <UnitPicker value={p.unit} onChange={(u) => set('unit', u)} allowed={['jam', 'hari', 'minggu', 'bulan', 'tahun']} />
    <Field label={t.unit}><select value={p.room_id} onChange={(e) => set('room_id', e.target.value)}><option value="">Semua {t.unit.toLowerCase()}</option>{d.rooms.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></Field>
    <div className="row"><Field label={`Harga per ${UNIT_NAME[p.unit]}`}><input inputMode="numeric" value={p.price} onChange={(e) => set('price', e.target.value)} /></Field>
      <Field label={`Minimal (${UNIT_NAME[p.unit]})`}><input inputMode="numeric" value={p.min_qty} onChange={(e) => set('min_qty', e.target.value.replace(/\D/g, ''))} /></Field></div>
    <Field label="Catatan"><input value={p.note} maxLength={200} onChange={(e) => set('note', e.target.value)} /></Field>
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.active} onChange={(e) => set('active', e.target.checked)} />Aktif</label>
    <button className="cta" onClick={save}>Simpan</button>
  </Sheet>;
}

function Rules({ kosId, ver, edit }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const load = () => supabase.from('rental_rate_rules').select('*').eq('kos_id', kosId).order('priority').order('name').then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  const adj = (r) => `${Number(r.adj_value) > 0 ? '+' : ''}${r.adj_kind === 'persen' ? `${Number(r.adj_value)}%` : rp(r.adj_value)}`;
  const when = (r) => r.kind === 'hari_pekan' ? r.days.map((x) => DOW[x]).join(', ') : r.kind === 'durasi' ? `sewa ≥ ${r.min_qty}` : `${tgl(r.start_date)} – ${tgl(r.end_date)}`;
  const del = async (r) => { if (confirm(`Hapus aturan ${r.name}?`) && await run(() => supabase.rpc('rental_rate_delete', { p_kos: kosId, p_kind: 'rule', p_id: r.id }), 'Aturan dihapus', errMsg)) load(); };
  return <>
    <p className="small muted">Aturan tanggal (musim, hari, tanggal khusus) diterapkan per malam/jam/periode berurutan menurut prioritas; diskon sewa lama diterapkan sekali ke total. Persen bisa minus (diskon) atau plus (kenaikan).</p>
    {rows.length === 0 ? <p className="muted">Belum ada aturan. Contoh: Akhir pekan +20% (Sab, Min) untuk harian.</p> :
      <div className="list">{rows.map((r) => <div className="li" key={r.id}><div className="main"><b>{r.name} <span className="chip">{adj(r)}</span></b>
        <span className="small muted">{RULE_KIND[r.kind]} · {when(r)}{r.units.length ? ` · ${r.units.map((u) => UNITS.find(([k]) => k === u)?.[1]).join(', ')}` : ' · semua satuan'}{r.active ? '' : ' · nonaktif'}</span></div>
        {edit && <div className="row" style={{ flexWrap: 'nowrap' }}><button className="sm" onClick={() => setForm(r)}>Ubah</button><button className="sm ghost danger" onClick={() => del(r)}>Hapus</button></div>}</div>)}</div>}
    {edit && <button className="primary" onClick={() => setForm({})}>+ Aturan tarif</button>}
    {form && <RuleForm kosId={kosId} r={form} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
  </>;
}
function RuleForm({ kosId, r, onClose, onDone }) {
  const [p, setP] = useState({ name: r.name || '', kind: r.kind || 'hari_pekan', start_date: r.start_date || '', end_date: r.end_date || '', days: r.days || [6, 7], min_qty: r.min_qty ? String(r.min_qty) : '7',
    adj_kind: r.adj_kind || 'persen', adj_value: r.adj_value != null ? String(Number(r.adj_value)) : '', units: r.units || [], priority: String(r.priority || 0), active: r.active !== false });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const tog = (k, v) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);
  const save = async () => {
    if (!p.adj_value || isNaN(Number(p.adj_value.replace(',', '.')))) return toast('Isi besar penyesuaian (mis. 20 atau -10).');
    const body = { ...p, adj_value: Number(p.adj_value.replace(',', '.')), min_qty: p.kind === 'durasi' ? Number(p.min_qty) : null, priority: Number(p.priority) || 0 };
    if (await run(() => supabase.rpc('rental_rule_save', { p_kos: kosId, p_id: r.id || null, p: body }), 'Aturan disimpan', errMsg)) onDone();
  };
  return <Sheet title={r.id ? 'Ubah aturan tarif' : 'Aturan tarif baru'} onClose={onClose}>
    <Field label="Nama"><input value={p.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="mis. Akhir pekan, Lebaran, Promo 7 malam" /></Field>
    <Field label="Jenis"><select value={p.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(RULE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    {['musim', 'tanggal'].includes(p.kind) && <div className="row"><Field label="Dari"><input type="date" value={p.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
      <Field label="Sampai"><input type="date" value={p.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field></div>}
    {p.kind === 'hari_pekan' && <div className="seg">{[1, 2, 3, 4, 5, 6, 7].map((x) => <button key={x} type="button" className={p.days.includes(x) ? 'on' : ''} onClick={() => tog('days', x)}>{DOW[x]}</button>)}</div>}
    {p.kind === 'durasi' && <Field label="Berlaku bila lama sewa minimal"><input inputMode="numeric" value={p.min_qty} onChange={(e) => set('min_qty', e.target.value.replace(/\D/g, ''))} /></Field>}
    <div className="row">
      <Field label="Penyesuaian"><select value={p.adj_kind} onChange={(e) => set('adj_kind', e.target.value)}><option value="persen">Persen (%)</option><option value="nominal">Rupiah</option></select></Field>
      <Field label="Besar" hint="minus = diskon"><input inputMode="decimal" value={p.adj_value} onChange={(e) => set('adj_value', e.target.value)} placeholder="20 atau -10" /></Field>
    </div>
    <span className="label">Berlaku untuk satuan (kosong = semua)</span>
    <div className="seg">{UNITS.filter(([k]) => k !== 'khusus').map(([k, l]) => <button key={k} type="button" className={p.units.includes(k) ? 'on' : ''} onClick={() => tog('units', k)}>{l}</button>)}</div>
    <Field label="Prioritas" hint="angka kecil diterapkan lebih dulu"><input inputMode="numeric" value={p.priority} onChange={(e) => set('priority', e.target.value.replace(/[^\d-]/g, ''))} /></Field>
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.active} onChange={(e) => set('active', e.target.checked)} />Aktif</label>
    <button className="cta" onClick={save}>Simpan</button>
  </Sheet>;
}
