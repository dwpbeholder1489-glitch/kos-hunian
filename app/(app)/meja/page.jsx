'use client';
// Kuliner: peta meja (tagihan per meja, bayar semua / bagi rata / per item, tutup meja) dan reservasi meja.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { rp, angka, errMsg, waLink } from '@/lib/format';
import { uid } from '@/lib/retail';
import { PAYM, sisa, stageLabel, STATUS, jakartaDate, isKul } from '@/lib/jasa';

const tz = { timeZone: 'Asia/Jakarta' };
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { ...tz, hour: '2-digit', minute: '2-digit' });
const tglPanjang = (ts) => new Date(ts).toLocaleDateString('id-ID', { ...tz, weekday: 'long', day: 'numeric', month: 'long' });
const todayJ = () => jakartaDate(Date.now());
const RSTATUS = { permintaan: ['Menunggu konfirmasi', 'gold'], dipesan: ['Dipesan', 'info'], datang: ['Tamu datang', 'good'], selesai: ['Selesai', ''], batal: ['Batal', 'void'], tidak_datang: ['Tidak datang', 'bad'] };
const ACTIVE = ['permintaan', 'diterima', 'proses', 'siap'];
// tagihan terbuka meja: pesanan aktif, atau sudah diserahkan hari ini tapi belum lunas
const openOf = (orders, t) => orders.filter((o) => o.dine === 'tempat' && o.table_no === String(t) && o.status !== 'batal'
  && (ACTIVE.includes(o.status) || (o.status === 'selesai' && sisa(o) > 0 && jakartaDate(o.received_at) === todayJ())));

// bagi uang ke beberapa pesanan: isi sisa pesanan terlama dulu
function fill(orders, amount) {
  let left = Math.round(amount); const parts = [];
  for (const o of orders) { if (left <= 0) break; const s = Math.round(sisa(o)); if (s <= 0) continue; const a = Math.min(s, left); parts.push({ order_id: o.id, amount: a }); left -= a; }
  return parts;
}

export default function Meja() {
  const { kos, kosId, ver } = useKos();
  const [tab, setTab] = useState('meja');
  const [d, setD] = useState(null);
  const [rs, setRs] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => Promise.all([
    supabase.rpc('svc_board', { p_kos: kosId }),
    supabase.from('kul_reservations').select('*').eq('kos_id', kosId).gte('starts_at', new Date(Date.now() - 2 * 864e5).toISOString()).order('starts_at').limit(300),
  ]).then(([a, b]) => { if (a.error || b.error) return setErr(errMsg(a.error || b.error)); setErr(null); setD(a.data); setRs(b.data || []); });
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [kosId, ver]);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'reservasi') setTab('reservasi'); } catch {} }, []);
  if (!isKul(kos)) return <Empty title="Khusus bisnis Kuliner" text="Menu meja & reservasi hanya untuk warung, kafe, dan katering." />;
  if (err) return <div className="notice bad">{/kul_reservations|svc_board/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d || !rs) return <Loading />;
  const tables = Math.max(0, Math.min(200, Number(kos.profile?.tables) || 0));
  const req = rs.filter((r) => r.status === 'permintaan');
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Meja & reservasi</h2><PageHelp page="meja" /></div></div>
      <div className="seg"><button className={tab === 'meja' ? 'on' : ''} onClick={() => setTab('meja')}>Meja</button><button className={tab === 'reservasi' ? 'on' : ''} onClick={() => setTab('reservasi')}>Reservasi{req.length ? ` (${req.length} baru)` : ''}</button></div>
      {tab === 'meja' && (tables === 0
        ? <Empty title="Jumlah meja belum diisi" text="Isi jumlah meja di menu Menu & tahap › Meja."><Link href="/layanan"><button className="primary">Isi jumlah meja</button></Link></Empty>
        : <TableGrid d={d} rs={rs} tables={tables} onOpen={setOpen} />)}
      {tab === 'reservasi' && <Reservations rs={rs} tables={tables} kos={kos} onChanged={load} />}
      {open && <TableSheet t={open} d={d} rs={rs} kos={kos} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function tableState(d, rs, t) {
  const os = openOf(d.orders, t);
  const now = Date.now();
  const resv = rs.find((r) => r.table_no === String(t) && (r.status === 'datang' || (r.status === 'dipesan' && new Date(r.starts_at).getTime() - now < 3 * 36e5 && new Date(r.starts_at).getTime() + r.minutes * 6e4 > now)));
  const due = os.reduce((a, o) => a + sisa(o), 0);
  if (os.some((o) => o.status === 'siap')) return { os, resv, due, label: 'Siap saji', tone: 'good' };
  if (os.some((o) => ACTIVE.includes(o.status))) return { os, resv, due, label: os.some((o) => o.status === 'permintaan') ? 'QR baru' : 'Terisi', tone: 'gold' };
  if (due > 0) return { os, resv, due, label: 'Belum lunas', tone: 'bad' };
  if (resv) return { os, resv, due, label: resv.status === 'datang' ? 'Tamu reservasi' : `Dipesan ${jam(resv.starts_at)}`, tone: 'info' };
  return { os, resv, due, label: 'Kosong', tone: '' };
}

function TableGrid({ d, rs, tables, onOpen }) {
  const money = d.money;
  return (
    <>
      <div className="tablegrid">{Array.from({ length: tables }, (_, i) => i + 1).map((t) => {
        const s = tableState(d, rs, t);
        return (
          <button key={t} className={'tablecell ' + (s.tone || 'free')} onClick={() => onOpen(t)} aria-label={`Meja ${t}: ${s.label}`}>
            <b>Meja {t}</b>
            <span className={'chip ' + s.tone}>{s.label}</span>
            {money && s.due > 0 && <span className="small">sisa {rp(s.due)}</span>}
            {s.resv && s.label !== `Dipesan ${jam(s.resv.starts_at)}` && s.resv.status === 'dipesan' && <span className="small muted">dipesan {jam(s.resv.starts_at)}</span>}
          </button>
        );
      })}</div>
      <span className="small muted">Ketuk meja untuk melihat pesanan, menagih (semua / bagi rata / per item), dan menutup meja. Layar memuat ulang tiap 30 detik.</span>
    </>
  );
}

function TableSheet({ t, d, rs, kos, onClose, onChanged }) {
  const money = d.money;
  const s = tableState(d, rs, t);
  const os = s.os;
  const [mode, setMode] = useState(null); // semua | rata | item
  const [method, setMethod] = useState('tunai');
  const [people, setPeople] = useState('2');
  const [sel, setSel] = useState({});
  const [paidUnits, setPaidUnits] = useState({});
  const [busy, setBusy] = useState(false);
  const due = Math.round(os.reduce((a, o) => a + sisa(o), 0));
  const todayR = rs.filter((r) => r.table_no === String(t) && jakartaDate(r.starts_at) === todayJ() && ['dipesan', 'datang'].includes(r.status));
  // unit per item: harga sudah termasuk diskon/ongkos pesanan secara proporsional
  const units = useMemo(() => os.filter((o) => sisa(o) > 0).flatMap((o) => {
    const sub = (o.lines || []).reduce((a, l) => a + Number(l.line_total || 0), 0) || 1; const ratio = Number(o.total) / sub;
    return (o.lines || []).flatMap((l, li) => {
      const q = Number(l.qty); const each = Number(l.line_total) * ratio;
      if (Number.isInteger(q) && q >= 1 && q <= 30) return Array.from({ length: q }, (_, k) => ({ key: `${o.id}|${li}|${k}`, order: o, name: l.name, note: l.note, amount: each / q }));
      return [{ key: `${o.id}|${li}|0`, order: o, name: `${l.name} ${angka(q)} ${l.unit}`, note: l.note, amount: each }];
    });
  }).filter((u) => !paidUnits[u.key]), [os, paidUnits]);
  const pay = async (parts, label, after) => {
    if (!parts.length) return toast('Tidak ada yang dibayar');
    setBusy(true);
    const { data, error } = await supabase.rpc('kul_table_pay', { p_kos: kos.id, p_key: uid(), p_parts: parts, p_method: method, p_label: label });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Bayar ${rp(data.paid)} tercatat`); after?.(); onChanged();
  };
  const n = Math.max(1, Math.min(50, parseInt(people, 10) || 1));
  const per = n <= 1 ? due : Math.round(due / n);
  const selAmt = Object.keys(sel).filter((k) => sel[k]).reduce((a, k) => a + (units.find((u) => u.key === k)?.amount || 0), 0);
  const payItems = () => {
    const by = {};
    units.filter((u) => sel[u.key]).forEach((u) => { by[u.order.id] = (by[u.order.id] || 0) + u.amount; });
    const parts = Object.entries(by).map(([id, a]) => { const o = os.find((x) => x.id === id); return { order_id: id, amount: Math.min(Math.round(sisa(o)), Math.round(a)) }; }).filter((p) => p.amount > 0);
    pay(parts, `Bayar per item (${units.filter((u) => sel[u.key]).map((u) => u.name).join(', ').slice(0, 90)})`, () => { setPaidUnits({ ...paidUnits, ...sel }); setSel({}); });
  };
  const close = async () => {
    const notReady = os.filter((o) => ['permintaan', 'diterima', 'proses'].includes(o.status)).length;
    if (due > 0 && !window.confirm(`Masih ada sisa ${rp(due)}. Tetap tutup meja? Sisa tercatat sebagai piutang.`)) return;
    if (notReady && !window.confirm(`${notReady} pesanan belum siap dan tidak ikut ditutup. Lanjut?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('kul_table_close', { p_kos: kos.id, p_table: String(t) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`${data.closed} pesanan diserahkan${data.waiting ? `, ${data.waiting} masih proses` : ''}`); onChanged(); if (!data.waiting) onClose();
  };
  return (
    <Sheet title={`Meja ${t}`} onClose={onClose}>
      <div className="row"><span className={'chip ' + s.tone}>{s.label}</span>{todayR.map((r) => <span key={r.id} className="chip info">{r.status === 'datang' ? 'Tamu' : 'Reservasi'} {jam(r.starts_at)} · {r.name} · {r.party} org</span>)}</div>
      {os.length === 0 ? <span className="small muted">Belum ada pesanan di meja ini.</span> : (
        <div className="list">{os.map((o) => (
          <Link key={o.id} href="/pesanan" className="li" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
            <div className="main"><span className="small"><b>{o.number}</b> · {(o.lines || []).map((l) => `${angka(l.qty)}× ${l.name}`).join(', ')}</span>
              {money && <span className="small muted">Total {rp(o.total)}{sisa(o) > 0 ? ` · sisa ${rp(sisa(o))}` : ' · lunas'}</span>}</div>
            <span className={'chip ' + (STATUS[o.status]?.[1] || '')}>{o.status === 'selesai' ? 'Diserahkan' : stageLabel(o)}</span>
          </Link>
        ))}</div>
      )}
      {money && <Link href={`/pesanan?baru=1&meja=${t}`}><button className="primary" style={{ width: '100%' }}>+ Pesanan untuk Meja {t}</button></Link>}
      {money && due > 0 && <>
        <div className="li"><b>Sisa tagihan meja</b><b>{rp(due)}</b></div>
        <div className="seg">{[['semua', 'Bayar semua'], ['rata', 'Bagi rata'], ['item', 'Per item']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(mode === k ? null : k)}>{l}</button>)}</div>
        {mode && <Field label="Cara bayar"><select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        {mode === 'semua' && <button className="cta" disabled={busy} onClick={() => pay(fill(os, due), 'Bayar semua tagihan meja ' + t)}>Bayar {rp(due)}</button>}
        {mode === 'rata' && <div className="unitbox">
          <Field label="Jumlah orang yang belum bayar"><input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ''))} /></Field>
          <span className="small">{n > 1 ? <>Per orang <b>{rp(per)}</b> ({n} orang; orang terakhir membayar sisanya)</> : <>Orang terakhir membayar <b>{rp(due)}</b></>}</span>
          <button className="cta" disabled={busy} onClick={() => pay(fill(os, n <= 1 ? due : per), `Bagi rata: 1 dari ${n} orang`, () => setPeople(String(Math.max(1, n - 1))))}>Catat bayar 1 orang · {rp(n <= 1 ? due : per)}</button>
        </div>}
        {mode === 'item' && <div className="unitbox">
          <span className="small muted">Centang yang dimakan orang ini, lalu bayar. Ulangi untuk orang berikutnya. Diskon/ongkos dibagi sebanding harga.</span>
          <div className="list">{units.map((u) => (
            <label key={u.key} className="li" style={{ cursor: 'pointer' }}>
              <span className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={Boolean(sel[u.key])} onChange={(e) => setSel({ ...sel, [u.key]: e.target.checked })} />{u.name}{u.note ? <span className="muted"> · {u.note}</span> : null}</span>
              <span className="small">{rp(u.amount)}</span>
            </label>
          ))}</div>
          <button className="cta" disabled={busy || selAmt <= 0} onClick={payItems}>Bayar item terpilih · {rp(Math.round(selAmt))}</button>
        </div>}
      </>}
      {money && os.some((o) => o.status !== 'selesai') && <button className="ghost" disabled={busy} onClick={close}>Tutup meja (serahkan pesanan yang siap)</button>}
      {money && os.length > 0 && <span className="small muted">Nota per pesanan ada di Pesanan › ketuk pesanan › Nota.</span>}
    </Sheet>
  );
}

function Reservations({ rs, tables, kos, onChanged }) {
  const [f, setF] = useState(rs.some((r) => r.status === 'permintaan') ? 'permintaan' : 'hari');
  const [edit, setEdit] = useState(null);
  const [cur, setCur] = useState(null);
  const t0 = todayJ();
  const chips = [['permintaan', 'Permintaan', (r) => r.status === 'permintaan'], ['hari', 'Hari ini', (r) => jakartaDate(r.starts_at) === t0 && r.status !== 'permintaan'],
    ['nanti', 'Mendatang', (r) => jakartaDate(r.starts_at) > t0 && ['dipesan'].includes(r.status)], ['riwayat', 'Riwayat', (r) => ['selesai', 'batal', 'tidak_datang'].includes(r.status)]];
  const shown = rs.filter(chips.find((c) => c[0] === f)[2]);
  const groups = [...new Set(shown.map((r) => jakartaDate(r.starts_at)))];
  return (
    <>
      <div className="row between"><div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap', flex: 1 }}>{chips.map(([k, l, fn]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} style={{ whiteSpace: 'nowrap' }}>{l} ({rs.filter(fn).length})</button>)}</div></div>
      <button className="primary" onClick={() => setEdit({})}>+ Reservasi</button>
      {shown.length === 0 ? <Empty title="Tidak ada reservasi di sini" text="Catat reservasi lewat telepon/WA dengan + Reservasi. Tamu juga bisa meminta reservasi dari halaman bisnis." /> : groups.map((g) => (
        <section className="panel" key={g}>
          <h3>{tglPanjang(g + 'T12:00:00+07:00')}</h3>
          <div className="list">{shown.filter((r) => jakartaDate(r.starts_at) === g).map((r) => (
            <button key={r.id} className="li click" onClick={() => setCur(r)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
              <div className="main"><b className="small">{jam(r.starts_at)} · {r.name} · {r.party} orang</b><span className="small muted">{r.table_no ? `Meja ${r.table_no}` : 'Meja belum ditentukan'}{r.source === 'portal' ? ' · dari halaman bisnis' : ''}{r.note ? ` · ${r.note}` : ''}</span></div>
              <span className={'chip ' + RSTATUS[r.status][1]}>{RSTATUS[r.status][0]}</span>
            </button>
          ))}</div>
        </section>
      ))}
      {edit && <ResvForm r={edit} tables={tables} kos={kos} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setCur(null); onChanged(); }} />}
      {cur && !edit && <ResvSheet r={rs.find((x) => x.id === cur.id) || cur} tables={tables} kos={kos} onClose={() => setCur(null)} onEdit={(r) => setEdit(r)} onChanged={onChanged} />}
    </>
  );
}

function ResvSheet({ r, tables, kos, onClose, onEdit, onChanged }) {
  const [tbl, setTbl] = useState(r.table_no || '');
  const [busy, setBusy] = useState(false);
  const act = async (status) => {
    let note = null;
    if (status === 'batal') { note = window.prompt('Alasan pembatalan?', ''); if (!note) return; }
    setBusy(true);
    const { error } = await supabase.rpc('kul_resv_status', { p_id: r.id, p_status: status, p_note: note, p_table: tbl || null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(RSTATUS[status][0]); onChanged(); if (['batal', 'tidak_datang', 'selesai'].includes(status)) onClose();
  };
  const msg = `Halo ${r.name}, reservasi ${r.number} di ${kos.name} untuk ${r.party} orang pada ${tglPanjang(r.starts_at)} jam ${jam(r.starts_at)}${tbl ? ` (meja ${tbl})` : ''} sudah kami konfirmasi. Sampai jumpa!`;
  return (
    <Sheet title={`${r.number} · ${r.name}`} onClose={onClose}>
      <span className={'chip ' + RSTATUS[r.status][1]} style={{ alignSelf: 'flex-start' }}>{RSTATUS[r.status][0]}</span>
      <span className="small"><b>{tglPanjang(r.starts_at)}, {jam(r.starts_at)}</b> · {r.party} orang · ±{r.minutes} menit</span>
      {r.phone && <span className="small">WhatsApp: {r.phone}</span>}
      {r.note && <span className="small">Catatan: {r.note}</span>}
      {['permintaan', 'dipesan'].includes(r.status) && tables > 0 && <Field label="Meja"><select value={tbl} onChange={(e) => setTbl(e.target.value)}><option value="">— belum ditentukan —</option>{Array.from({ length: tables }, (_, i) => <option key={i} value={i + 1}>Meja {i + 1}</option>)}</select></Field>}
      <div className="row">
        {r.status === 'permintaan' && <button className="primary" disabled={busy} onClick={() => act('dipesan')}>Konfirmasi</button>}
        {r.status === 'dipesan' && <button className="primary" disabled={busy} onClick={() => act('datang')}>Tamu datang</button>}
        {r.status === 'permintaan' && <button className="sm" disabled={busy} onClick={() => act('datang')}>Tamu sudah datang</button>}
        {r.status === 'tidak_datang' && <button className="primary" disabled={busy} onClick={() => act('datang')}>Ternyata datang (terlambat)</button>}
        {r.status === 'datang' && <button className="primary" disabled={busy} onClick={() => act('selesai')}>Selesai</button>}
        {r.status === 'dipesan' && <button className="sm ghost" disabled={busy} onClick={() => act('tidak_datang')}>Tidak datang</button>}
        {['permintaan', 'dipesan'].includes(r.status) && <button className="sm ghost" onClick={() => onEdit(r)}>Ubah</button>}
        {['permintaan', 'dipesan'].includes(r.status) && <button className="sm ghost danger" disabled={busy} onClick={() => act(r.status === 'permintaan' ? 'batal' : 'batal')}>{r.status === 'permintaan' ? 'Tolak' : 'Batalkan'}</button>}
      </div>
      {r.phone && <div className="row">
        <a href={waLink(r.phone, msg)} target="_blank" rel="noreferrer"><button className="sm">WA: konfirmasi</button></a>
        <a href={waLink(r.phone, `Halo ${r.name}, mengingatkan reservasi Anda di ${kos.name} hari ${tglPanjang(r.starts_at)} jam ${jam(r.starts_at)} untuk ${r.party} orang.`)} target="_blank" rel="noreferrer"><button className="sm">WA: pengingat</button></a>
      </div>}
      <span className="label">Riwayat</span>
      <div className="list">{(r.log || []).map((e, i) => <div className="li" key={i}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{new Date(e.at).toLocaleString('id-ID', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<br />{e.actor}</span></div>)}</div>
    </Sheet>
  );
}

function ResvForm({ r, tables, kos, onClose, onSaved }) {
  const start = r.starts_at ? new Date(new Date(r.starts_at).getTime() + 7 * 36e5).toISOString() : '';
  const [f, setF] = useState({ name: r.name || '', phone: r.phone || '', party: String(r.party || 2), date: start ? start.slice(0, 10) : todayJ(), time: start ? start.slice(11, 16) : '19:00', minutes: String(r.minutes || 90), table_no: r.table_no || '', note: r.note || '' });
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => r.id || uid());
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama pemesan');
    if (!f.date || !/^\d{2}:\d{2}$/.test(f.time)) return toast('Isi tanggal & jam');
    setBusy(true);
    const { error } = await supabase.rpc('kul_resv_save', { p_kos: kos.id, p_id: id, p: { ...f, party: parseInt(f.party, 10) || 0, minutes: parseInt(f.minutes, 10) || 90, starts_at: `${f.date}T${f.time}:00+07:00` } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(r.id ? 'Reservasi diubah' : 'Reservasi dicatat'); onSaved();
  };
  return (
    <Sheet title={r.id ? `Ubah ${r.number}` : 'Reservasi baru'} onClose={onClose}>
      <div className="row">
        <Field label="Nama pemesan"><input value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="No. WhatsApp (opsional)"><input inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} placeholder="08…" /></Field>
      </div>
      <div className="row">
        <Field label="Tanggal"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Jam"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Jumlah orang"><input inputMode="numeric" value={f.party} onChange={(e) => set('party', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Lama (menit)"><select value={f.minutes} onChange={(e) => set('minutes', e.target.value)}>{['60', '90', '120', '180', '240'].map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
      </div>
      {tables > 0 && <Field label="Meja (opsional)" hint="bisa ditentukan nanti"><select value={f.table_no} onChange={(e) => set('table_no', e.target.value)}><option value="">— belum ditentukan —</option>{Array.from({ length: tables }, (_, i) => <option key={i} value={i + 1}>Meja {i + 1}</option>)}</select></Field>}
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="mis. ulang tahun, kursi bayi" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan reservasi'}</button>
      <span className="small muted">Meja yang sudah dipesan di jam yang bertumpuk ditolak otomatis.</span>
    </Sheet>
  );
}
