'use client';
import { notaText } from '@/lib/nota';
import { autoPrint } from '@/lib/printer';
import styles from './fnb-pos.module.css';
import IsianTambahan from '@/components/IsianTambahan';
import { useBaru } from '@/lib/useBaru';
import Lampiran from '@/components/Lampiran';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader, DataTable, FilterToolbar, useMedia } from '@/components/Page';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { rp, angka, errMsg, parseRp, waLink } from '@/lib/format';
import { withApproval, requestApproval } from '@/lib/approval';
import { uid, qtyNum } from '@/lib/retail';
import { STATUS, COMPLAINT, PAYM, waktu, hari, sisa, stageLabel, late, linesText, waText, toLocalInput, fromLocalInput, waitPickup, onTheWay, PICKUP, DELIVERY, tgl2, mapsLink, terms, DINE, dineText, COMPLAINT_K } from '@/lib/jasa';
import { moduleOn } from '@/lib/business';

const printFailed = (error) =>
  toast('Pembayaran tersimpan. Cetak otomatis gagal: ' + errMsg(error) + ' Buka nota untuk mencetak ulang.');

// Pesanan jasa (blueprint 5.3 Laundry): terima → tahap proses → siap → diambil/diantar, dengan DP/lunas, nota, keluhan
export default function Pesanan() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('aktif');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [boardView, setBoardView] = useState(false);
  const [neu, setNeu] = useState(false);
  useBaru(() => setNeu(true));
  const desk = useMedia('(min-width: 1180px)');   // laptop: pesanan baru tampil penuh seperti Kasir
  const load = () => supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('baru')) setNeu(true); } catch {} }, []);
  if (neu && d?.money && (desk || terms(kos).kul)) return <NewOrder inline kosId={kosId} onClose={() => setNeu(false)} onSaved={(id) => { setNeu(false); load().then(() => setOpen(id)); }} />;
  if (err) return <div className="notice bad">{/svc_board/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const money = d.money;
  const T = terms(kos);
  const act = d.orders.filter((o) => !['selesai', 'batal'].includes(o.status));
  const req = act.filter((o) => o.status === 'permintaan');
  const chips = [
    ...(req.length ? [['permintaan', `Permintaan masuk (${req.length})`]] : []),
    ['aktif', `Semua aktif (${act.length})`],
    ['diterima', `Diterima (${act.filter((o) => o.status === 'diterima' && !waitPickup(o)).length})`],
    ...d.stages.map((s) => [s.id, `${s.name} (${act.filter((o) => o.stage_id === s.id).length})`]),
    ['siap', `Siap (${act.filter((o) => o.status === 'siap' && !onTheWay(o)).length})`],
    ...(T.kul ? [] : [['jemput', `Menunggu jemput (${act.filter(waitPickup).length})`]]),
    ['pengantaran', `Dalam pengantaran (${act.filter(onTheWay).length})`],
    ['terlambat', `Terlambat (${act.filter(late).length})`],
    ['tutup', 'Selesai & batal (30 hari)'],
  ];
  const term = q.trim().toLowerCase();
  const shown = d.orders.filter((o) => {
    const okF = f === 'aktif' ? act.includes(o) : f === 'tutup' ? !act.includes(o) : f === 'jemput' ? waitPickup(o) : f === 'pengantaran' ? onTheWay(o)
      : f === 'permintaan' ? o.status === 'permintaan' : f === 'terlambat' ? late(o) : f === 'diterima' ? o.status === 'diterima' && !waitPickup(o) : f === 'siap' ? o.status === 'siap' && !onTheWay(o) : o.stage_id === f;
    return okF && (!term || [o.number, o.customer_name, o.customer_phone].some((x) => (x || '').toLowerCase().includes(term)));
  });
  const cur = open && d.orders.find((o) => o.id === open);
  // Keterangan jemput/antar/meja/ulang — sama untuk tabel laptop & kartu HP
  const extraText = (o) => `${o.pickup ? ` · jemput${o.pickup_date && waitPickup(o) ? ` ${tgl2(o.pickup_date)}${o.pickup_slot ? ' ' + o.pickup_slot : ''}` : ''}` : ''}${o.deliver ? ' · 🛵 antar' : ''}${dineText(o) ? ` · ${dineText(o)}` : ''}${o.rework_of ? ` · ${T.rework.toLowerCase()} ${o.rework_of}` : ''}`;

  return (
    <div className="stack">
      <PageHeader title="Pesanan" help={<PageHelp page="pesanan" />} actions={<>{money && <button className="primary" onClick={() => setNeu(true)}>+ Pesanan baru</button>}</>} />
      {req.length > 0 && money && f !== 'permintaan' && <div className="notice"><b>{req.length} pesanan dari halaman bisnis</b> menunggu konfirmasi. <button className="sm" onClick={() => setF('permintaan')}>Lihat</button></div>}
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{chips.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>
      {T.kul && <div className="seg" aria-label="Tampilan pesanan">{[[false,'Daftar'],[true,'Papan dapur']].map(([board,label]) => <button key={label} aria-pressed={boardView === board} className={boardView === board ? 'on' : ''} onClick={() => setBoardView(board)}>{label}</button>)}</div>}
      <FilterToolbar q={q} onQ={setQ} placeholder="Cari nomor, nama, atau No. HP" />
      {shown.length === 0 ? <Empty title="Tidak ada pesanan di sini" text={money ? (T.kul ? 'Tekan + Pesanan baru saat pelanggan memesan.' : 'Tekan + Pesanan baru saat pelanggan menyerahkan cucian.') : 'Pesanan yang perlu dikerjakan akan muncul di sini.'} /> : T.kul && boardView ? <OrderBoard orders={shown} money={money} onOpen={setOpen} /> : (
        <DataTable rows={shown} caption="Daftar pesanan" onRow={(o) => setOpen(o.id)} rowLabel={(o) => `${o.number} ${o.customer_name}`} pageSize={50}
          columns={[
            { key: 'no', label: 'Nomor', sort: (o) => o.number, render: (o) => <span style={{ whiteSpace: 'nowrap' }}>{o.number}</span> },
            { key: 'cust', label: 'Pelanggan', sort: (o) => (o.customer_name || '').toLowerCase(), render: (o) => <b>{o.customer_name}</b> },
            { key: 'isi', label: T.kul ? 'Menu' : 'Layanan', hide: 'tablet', render: (o) => <span className="small">{linesText(o.lines)}{extraText(o)}</span> },
            { key: 'due', label: 'Janji / selesai', sort: (o) => (['selesai', 'batal'].includes(o.status) ? o.completed_at || o.received_at : o.due_at) || '', render: (o) => <span className="small" style={{ color: late(o) ? 'var(--bad)' : undefined }}>{['selesai', 'batal'].includes(o.status) ? waktu(o.completed_at || o.received_at) : `${hari(o.due_at)}${late(o) ? ' · terlambat' : ''}`}{o.open_complaints > 0 ? ' · ⚠ keluhan' : ''}</span> },
            ...(money ? [{ key: 'sisa', label: 'Sisa', align: 'right', sort: (o) => (o.status !== 'batal' && o.total != null ? sisa(o) : 0), render: (o) => (o.total != null && sisa(o) > 0 && o.status !== 'batal' ? rp(sisa(o)) : <span className="muted">—</span>) }] : []),
            { key: 'st', label: 'Status', render: (o) => <span className={'chip ' + (waitPickup(o) || onTheWay(o) ? 'gold' : STATUS[o.status]?.[1] || '')}>{stageLabel(o, true)}</span> },
          ]}
          card={(o) => <>
            <div className="dt-row"><div className="stack" style={{ gap: 2 }}><b className="small">{o.customer_name}</b>
              <span className="small muted"><span style={{ whiteSpace: 'nowrap' }}>{o.number}</span> · {linesText(o.lines)}{extraText(o)}</span>
              <span className="small" style={{ color: late(o) ? 'var(--bad)' : 'var(--muted)' }}>{['selesai', 'batal'].includes(o.status) ? waktu(o.completed_at || o.received_at) : `Janji ${hari(o.due_at)}${late(o) ? ' · terlambat' : ''}`}{money && o.total != null && sisa(o) > 0 && o.status !== 'batal' ? ` · sisa ${rp(sisa(o))}` : ''}{o.open_complaints > 0 ? ' · ⚠ keluhan' : ''}</span></div><span className={'chip ' + (waitPickup(o) || onTheWay(o) ? 'gold' : STATUS[o.status]?.[1] || '')}>{stageLabel(o, true)}</span></div>
          </>} />
      )}
      {neu && money && !desk && <NewOrder kosId={kosId} onClose={() => setNeu(false)} onSaved={(id) => { setNeu(false); load().then(() => setOpen(id)); }} />}
      {cur && <Detail o={cur} d={d} kos={kos} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function OrderBoard({orders, money, onOpen}) {
  const groups = new Map();
  for (const order of orders) {
    const label = stageLabel(order, true) || order.status;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(order);
  }
  return <div className={styles.board}>{Array.from(groups, ([label, rows]) => <section key={label} className="panel">
    <h3>{label} · {rows.length}</h3>
    {rows.map(o => <button key={o.id} type="button" onClick={() => onOpen(o.id)}>
      <b>{o.number}</b><small>{dineText(o) || o.customer_name} · {waktu(o.received_at)}</small>
      <span>{linesText(o.lines)}</span>
      {money && o.total != null && o.status !== 'batal' && <small>{rp(o.total)} · {sisa(o) === 0 ? 'Lunas' : Number(o.paid) > 0 ? 'Dibayar sebagian' : 'Belum dibayar'}</small>}
    </button>)}
  </section>)}</div>;
}

function NewOrder({ kosId, onClose, onSaved, inline }) {
  const compact = useMedia('(max-width: 767px)');
  const [cartOpen, setCartOpen] = useState(false);
  const [cat, setCat] = useState('');   // saring kategori di katalog
  const [sq, setSq] = useState('');     // cari layanan/menu
  const [optOpen, setOptOpen] = useState(null); // baris yang membuka catatan
  const { kos } = useKos();
  const logi = moduleOn(kos, 'j_antar');
  const T = terms(kos);
  const tables = Math.max(0, Math.min(200, Math.floor(Number(kos?.profile?.tables) || 0)));
  const [dine, setDine] = useState(T.kul ? (tables || kos.profile?.tables == null ? 'tempat' : 'bungkus') : null); // kuliner: tempat | bungkus | antar
  // dari Meja & reservasi: /pesanan?baru=1&meja=N → meja sudah terpilih
  const [table, setTable] = useState(() => { try { const m = new URLSearchParams(window.location.search).get('meja'); return T.kul && /^\d{1,3}$/.test(m || '') ? m : ''; } catch { return ''; } });
  const [zones, setZones] = useState([]);
  const [slots, setSlots] = useState([]);
  const [zoneId, setZoneId] = useState('');
  const [pDate, setPDate] = useState('');
  const [pSlot, setPSlot] = useState('');
  const [dDate, setDDate] = useState('');
  const [dSlot, setDSlot] = useState('');
  const [svc, setSvc] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [cq, setCq] = useState('');
  const [cust, setCust] = useState(null); // kontak terpilih
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState([]); // {service_id, qty, note}
  const [disc, setDisc] = useState('');
  const [deliver, setDeliver] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [addr, setAddr] = useState('');
  const [fee, setFee] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState('');
  const [method, setMethod] = useState('tunai');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const thumbs = useThumbs(kosId, 'service', 0);
  useEffect(() => {
    supabase.from('svc_services').select('*').eq('kos_id', kosId).eq('active', true).order('sort').then(({ data }) => setSvc(data || []));
    if (logi) {
      supabase.from('svc_zones').select('*').eq('kos_id', kosId).eq('active', true).order('sort').then(({ data }) => setZones(data || []));
      supabase.from('svc_slots').select('*').eq('kos_id', kosId).eq('active', true).order('sort').then(({ data }) => setSlots(data || []));
    }
    supabase.from('contacts').select('id,name,phone').eq('kos_id', kosId).eq('kind', 'pelanggan').is('archived_at', null).order('name').limit(500).then(({ data }) => setContacts(data || []));
  }, [kosId]);
  const priced = lines.map((l) => { const s = svc?.find((x) => x.id === l.service_id); const qn = qtyNum(l.qty) || 0; const cq2 = Math.max(qn, Number(s?.min_qty || 0)); return { ...l, s, qn, cq: cq2, total: cq2 * Number(s?.price || 0) }; });
  const sub = priced.reduce((a, l) => a + (l.qn > 0 ? l.total : 0), 0);
  const total = Math.max(0, sub - (parseRp(disc) || 0)) + (deliver || pickup ? parseRp(fee) || 0 : 0);
  const hours = Math.max(0, ...priced.map((l) => Number(l.s?.hours || 0)));
  const autoDue = hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
  const matches = useMemo(() => { const t = cq.trim().toLowerCase(); return t.length < 2 ? [] : contacts.filter((c) => c.name.toLowerCase().includes(t) || (c.phone || '').replace(/\D/g, '').includes(t.replace(/\D/g, '') || '§')).slice(0, 6); }, [cq, contacts]);
  const Wrap = ({ children }) => (inline ? <div className="stack">{children}</div> : <Sheet title="Pesanan baru" onClose={onClose}>{children}</Sheet>);
  if (!svc) return <Wrap><Loading /></Wrap>;
  if (!svc.length) return <Wrap><Empty title={`Belum ada ${T.svc.toLowerCase()}`} text={`Tambahkan ${T.svc.toLowerCase()} & harga dulu di menu ${T.svcs}.`}><Link href="/layanan"><button className="primary">Buka {T.svcs}</button></Link></Empty></Wrap>;
  // Ketuk layanan/menu: satuan hitung (pcs, porsi) → jumlah +1 bila sudah ada; satuan timbang (kg) → baris baru untuk diisi beratnya
  const addSvc = (s) => {
    const i = lines.findIndex((l) => l.service_id === s.id && s.unit !== 'kg' && !l.note);
    if (i >= 0) setLines(lines.map((l, j) => (j === i ? { ...l, qty: String((qtyNum(l.qty) || 0) + 1) } : l)));
    else setLines([...lines, { service_id: s.id, qty: s.unit === 'kg' ? '' : '1', note: '' }]);
    toast(`+ ${s.name}`);
  };
  const step = (i, dlt) => { const l = lines[i]; const n = Math.round(((qtyNum(l.qty) || 0) + dlt) * 1000) / 1000; if (n <= 0) setLines(lines.filter((_, j) => j !== i)); else setL(i, 'qty', String(n).replace('.', ',')); };
  const setL = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    if (!cust && name.trim().length < 2 && !(T.kul && dine === 'tempat' && table.trim())) return toast(T.kul ? 'Isi nama pelanggan atau nomor meja.' : 'Isi nama pelanggan.');
    if (!priced.length || priced.some((l) => !(l.qn > 0))) return toast(T.kul ? 'Pilih menu dan isi jumlahnya.' : 'Isi jumlah (kg/pcs) setiap layanan.');
    if ((parseRp(pay) || 0) > total) return toast('Pembayaran awal melebihi total.');
    if ((deliver || pickup) && zones.length && !zoneId) return toast('Pilih wilayah antar jemput. Alamat di luar wilayah yang dilayani tidak bisa dijemput/diantar.');
    if ((deliver || pickup) && addr.trim().length < 5) return toast('Isi alamat untuk antar jemput.');
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_order_create', { p_id: id, p_kos: kosId, p: {
      contact_id: cust?.id || null, name: cust ? cust.name : name.trim() || `Meja ${table.trim()}`, phone: cust ? cust.phone : phone,
      lines: priced.map((l) => ({ service_id: l.service_id, qty: l.qn, note: l.note })), discount: parseRp(disc) || 0,
      deliver, pickup, address: addr, ...(T.kul && dine !== 'antar' ? { dine, table_no: dine === 'tempat' ? table.trim() || null : null } : {}), delivery_fee: deliver || pickup ? parseRp(fee) || 0 : 0, due_at: fromLocalInput(due), note,
      ...(deliver || pickup ? { zone_id: zoneId, pickup_date: pickup ? pDate || null : null, pickup_slot: pickup ? pSlot : null, delivery_date: deliver ? dDate || null : null, delivery_slot: deliver ? dSlot : null } : {}),
      payment: (parseRp(pay) || 0) > 0 ? { amount: parseRp(pay), method } : null } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    if (parseRp(pay) > 0 && !data.duplicate) {
      autoPrint(kosId, async (paper) => {
        const { data: order, error: receiptError } = await supabase.from('svc_orders')
          .select('*, svc_order_lines(*)').eq('id', data.id).single();
        if (receiptError) throw receiptError;
        return notaText(kos, { ...order, lines: order.svc_order_lines, paid: parseRp(pay) }, paper);
      }, printFailed);
    }
    toast(`Pesanan ${data.number} tersimpan`); onSaved(data.id);
  };
  const cats = [...new Set(svc.map((x) => x.category || 'Lainnya'))];
  const sw = sq.trim().toLowerCase();
  const shownSvc = svc.filter((x) => (!cat || (x.category || 'Lainnya') === cat) && (!sw || x.name.toLowerCase().includes(sw)));
  const count = priced.length;
  const catalog = <>
    {cats.length > 1 && <div className="pos-tabs" role="tablist" aria-label="Kategori">{[['', 'Semua'], ...cats.map((c) => [c, c])].map(([k, l]) => <button key={k || 'all'} role="tab" aria-selected={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{l}</button>)}</div>}
    <label className="pos-q"><svg className="pos-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></svg>
      <input type="search" value={sq} onChange={(e) => setSq(e.target.value)} placeholder={`Cari ${T.svc.toLowerCase()}…`} aria-label={`Cari ${T.svc.toLowerCase()}`} /></label>
    {shownSvc.length === 0 ? <Empty title={`${T.svc} tidak ditemukan`} /> : <div className={inline ? 'pos-grid' : 'pos-grid pos-slide'}>{shownSvc.map((x) => (
      <article className="pos-prod" key={x.id}>
        <button type="button" className="pos-pic" onClick={() => addSvc(x)} aria-label={`Tambah ${x.name}`}>
          {thumbs[x.id] ? <ListThumb path={thumbs[x.id]} radius={0} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="pos-ini" aria-hidden="true">{x.name.trim().slice(0, 1).toUpperCase()}</span>}
        </button>
        <div className="pos-pi">
          <b className="pos-pn">{x.name}</b>
          <span className="pos-pu">per {x.unit}{Number(x.hours) > 0 ? ` · ${x.hours} jam` : ''}{Number(x.min_qty) > 0 ? ` · min ${angka(x.min_qty)}` : ''}</span>
          <div className="pos-pr"><b>{rp(x.price)}</b><button type="button" className="pos-add" onClick={() => addSvc(x)} aria-label={`Tambah ${x.name}`}>+</button></div>
        </div>
      </article>))}</div>}
  </>;
  const dineBlock = T.kul && <>
    <span className="label">Jenis pesanan</span>
    <div className="seg">{[['tempat', DINE.tempat], ['bungkus', DINE.bungkus], ...(logi ? [['antar', 'Diantar']] : [])].map(([k, l]) => <button key={k} className={dine === k ? 'on' : ''} onClick={() => { setDine(k); setDeliver(k === 'antar'); setPickup(false); }}>{l}</button>)}</div>
    {dine === 'tempat' && (tables > 0
      ? <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{Array.from({ length: tables }, (_, i2) => String(i2 + 1)).map((t) => <button key={t} className={'sm' + (table === t ? ' primary' : '')} onClick={() => setTable(table === t ? '' : t)} aria-label={`Meja ${t}`}>Meja {t}</button>)}</div>
      : <Field label="Nomor meja (opsional)"><input value={table} onChange={(e) => setTable(e.target.value)} maxLength={10} placeholder="mis. 3" /></Field>)}
  </>;
  const custBlock = <>
    <span className="label">Pelanggan{T.kul && dine === 'tempat' ? ' (opsional)' : ''}</span>
    {cust ? <div className="li"><span className="small"><b>{cust.name}</b>{cust.phone ? ` · ${cust.phone}` : ''}</span><button className="sm ghost" onClick={() => setCust(null)}>Ganti</button></div> : <>
      <input type="search" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Cari pelanggan lama (nama / No. HP)" aria-label="Cari pelanggan" />
      {matches.length > 0 && <div className="list">{matches.map((c) => <button key={c.id} className="li click" onClick={() => { setCust(c); setCq(''); }} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}><span className="small">{c.name}</span><span className="small muted">{c.phone}</span></button>)}</div>}
      <div className="row">
        <Field label={T.kul ? 'Nama' : 'Nama (pelanggan baru)'}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="08…" /></Field>
      </div>
      <span className="small muted">Dengan No. HP, pelanggan tersimpan otomatis (dicocokkan lewat nomor, tidak dobel).</span>
    </>}
  </>;
  const linesBlock = <div className="pos-items">{priced.map((l, i2) => {
    const kg = l.s?.unit === 'kg';
    return (
      <div key={i2} className="pos-item">
        <div className="pos-irow">
          <span className="pos-ith">{thumbs[l.service_id] ? <ListThumb path={thumbs[l.service_id]} size={44} radius={8} /> : <span className="pos-ini sm" aria-hidden="true">{(l.s?.name || '?').trim().slice(0, 1).toUpperCase()}</span>}</span>
          <div className="pos-iname"><b>{l.s?.name}</b><span>{l.qn > 0 ? `${angka(l.cq)} ${l.s?.unit} × ${rp(l.s?.price)}` : `${rp(l.s?.price)}/${l.s?.unit}`}{l.qn > 0 && l.cq > l.qn ? ` (minimal ${angka(l.s.min_qty)})` : ''}</span>{l.note && <span>Catatan: {l.note}</span>}</div>
          <b className="pos-isum">{l.qn > 0 ? rp(l.total) : '—'}</b>
        </div>
        <div className="pos-irow pos-ictl">
          {kg ? <Field label={`Berat (${l.s?.unit})`}><input inputMode="decimal" value={l.qty} onChange={(e) => setL(i2, 'qty', e.target.value)} placeholder="mis. 3,5" autoFocus={!l.qty} style={{ maxWidth: 140 }} /></Field>
            : <div className="qtybox"><button aria-label={`Kurangi ${l.s?.name}`} onClick={() => step(i2, -1)}>−</button><input inputMode="decimal" aria-label={`Jumlah ${l.s?.name}`} value={l.qty} onChange={(e) => setL(i2, 'qty', e.target.value)} /><button aria-label={`Tambah ${l.s?.name}`} onClick={() => step(i2, 1)}>+</button></div>}
          <button type="button" className="sm ghost pos-more" aria-expanded={optOpen === i2} aria-label={`Pilihan lain ${l.s?.name}`} onClick={() => setOptOpen(optOpen === i2 ? null : i2)}>⋯</button>
        </div>
        {optOpen === i2 && <div className="pos-iopt">
          <Field label="Catatan"><input value={l.note} onChange={(e) => setL(i2, 'note', e.target.value)} placeholder={T.kul ? 'mis. pedas, tanpa bawang' : 'mis. 3 kemeja putih'} maxLength={120} /></Field>
          <button type="button" className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => { setLines(lines.filter((_, j) => j !== i2)); setOptOpen(null); }}>Hapus dari pesanan</button>
        </div>}
      </div>
    );
  })}{!priced.length && <span className="small muted">Belum ada {T.svc.toLowerCase()}. Ketuk <b>+</b> pada katalog.</span>}</div>;
  const logiBlock = <>
    {logi && !T.kul && <div className="row">
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pickup} onChange={(e) => setPickup(e.target.checked)} />Dijemput</label>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={deliver} onChange={(e) => setDeliver(e.target.checked)} />Diantar</label>
    </div>}
    {logi && (deliver || pickup) && <>
      {zones.length > 0 ? <Field label="Wilayah" hint="hanya wilayah yang dilayani"><select value={zoneId} onChange={(e) => { const z = zones.find((x) => x.id === e.target.value); setZoneId(e.target.value); if (z) setFee(String(Math.round(z.fee))); }}>
        <option value="">— pilih wilayah —</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {Number(z.fee) > 0 ? rp(z.fee) : 'gratis'}</option>)}</select></Field>
        : <span className="small muted">Wilayah layanan belum diatur (menu {T.logi} › Wilayah & jadwal).</span>}
      <div className="row">
        <Field label="Alamat"><input value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={200} placeholder="jalan, nomor, patokan" /></Field>
        <Field label={T.kul ? 'Ongkos antar' : 'Ongkos antar-jemput'}><input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></Field>
      </div>
      {pickup && <div className="row">
        <Field label="Tanggal jemput (opsional)"><input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} /></Field>
        <Field label="Jam jemput"><select value={pSlot} onChange={(e) => setPSlot(e.target.value)}><option value="">—</option>{slots.filter((x) => x.kind !== 'antar').map((x) => <option key={x.id} value={x.label}>{x.label}</option>)}</select></Field>
      </div>}
      {deliver && <div className="row">
        <Field label="Tanggal antar (opsional)"><input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} /></Field>
        <Field label="Jam antar"><select value={dSlot} onChange={(e) => setDSlot(e.target.value)}><option value="">—</option>{slots.filter((x) => x.kind !== 'jemput').map((x) => <option key={x.id} value={x.label}>{x.label}</option>)}</select></Field>
      </div>}
      {pickup && <span className="small muted">Pesanan yang dijemput baru bisa diproses setelah ditandai <b>Sudah dijemput</b>.</span>}
    </>}
  </>;
  const tailBlock = <>
    <div className="row">
      <Field label="Diskon (opsional)"><input inputMode="numeric" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" /></Field>
      <Field label="Janji selesai" hint={autoDue && !due ? `otomatis ${hari(autoDue)} (${hours} jam)` : null}><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
    </div>
    <Field label="Catatan pesanan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={T.kul ? 'mis. sendok plastik 2' : 'mis. pisahkan baju putih'} /></Field>
    <div className="pos-sum">
      <div className="row between"><span>Subtotal ({count} item)</span><b>{rp(sub)}</b></div>
      {(parseRp(disc) || 0) > 0 && <div className="row between"><span>Diskon</span><span>−{rp(parseRp(disc))}</span></div>}
      {(deliver || pickup) && (parseRp(fee) || 0) > 0 && <div className="row between"><span>Ongkos antar</span><span>{rp(parseRp(fee))}</span></div>}
    </div>
    <div className="row">
      <Field label="Bayar sekarang (DP/lunas, opsional)"><input inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" /></Field>
      <Field label="Cara bayar"><select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    </div>
    <div className="row"><button className="sm ghost" onClick={() => setPay(String(total))}>Lunas sekarang</button><button className="sm ghost" onClick={() => setPay('')}>{T.kul ? 'Bayar nanti' : 'Bayar saat ambil'}</button></div>
    <span className="small muted">Harga dihitung ulang oleh server dari daftar {T.svc.toLowerCase()}.</span>
  </>;
  const footBlock = <div className="pos-foot">
    <div className="pos-total"><span>Total Bayar</span><b>{rp(total)}</b></div>
    <button type="button" className="pos-pay" onClick={save} disabled={busy} style={{ width: '100%' }}><span><b>{busy ? 'Menyimpan…' : 'Simpan pesanan'}</b><small>{(parseRp(pay) || 0) >= total && total > 0 ? 'lunas' : (parseRp(pay) || 0) > 0 ? `DP ${rp(parseRp(pay))}` : 'bayar nanti'}</small></span></button>
  </div>;
  const cartHead = <div className="pos-ch"><h3>Pesanan ({count})</h3>{count > 0 && <button type="button" className="sm ghost pos-clear" onClick={() => setLines([])}>Kosongkan</button>}</div>;
  if (T.kul) {
    const cart = <>{cartHead}{linesBlock}{dineBlock}{custBlock}{logiBlock}{tailBlock}{footBlock}</>;
    return <div className={styles.workspace}>
      <PageHeader title="Kasir kuliner" desc={kos.name} help={<PageHelp page="pesanan" />} actions={<button className="sm" onClick={onClose}>Daftar pesanan</button>} />
      <div className={styles.layout}>
        <section className={styles.catalog} aria-label="Katalog menu">{catalog}</section>
        {compact ? <>
          <button className={styles.cartButton} onClick={() => setCartOpen(true)} aria-haspopup="dialog">Keranjang · {count} jenis menu <strong>{rp(total)}</strong></button>
          {cartOpen && <Sheet title="Keranjang pesanan" onClose={() => setCartOpen(false)}>{cart}</Sheet>}
        </> : <aside className={'panel ' + styles.cart} aria-label="Keranjang pesanan">{cart}</aside>}
      </div>
    </div>;
  }
  // Laptop lebar: katalog kiri + panel pesanan kanan (sama dengan Kasir toko). HP/tablet: lembar Pesanan baru dengan katalog geser.
  if (inline) return (
    <div className="stack">
      <PageHeader title="Pesanan baru" help={<PageHelp page="pesanan" />} desc={false} actions={<button type="button" className="sm" onClick={onClose}>← Daftar pesanan</button>} />
      <div className="pos">
        <div className="stack pos-left" style={{ minWidth: 0 }}>{catalog}</div>
        <aside className="pos-cart panel" aria-label="Pesanan">{cartHead}{linesBlock}{dineBlock}{custBlock}{logiBlock}{tailBlock}{footBlock}</aside>
      </div>
    </div>
  );
  return (
    <Sheet title="Pesanan baru" onClose={onClose}>
      {dineBlock}{custBlock}
      <span className="label">{T.svc}</span>
      {catalog}
      {cartHead}{linesBlock}{logiBlock}{tailBlock}{footBlock}
    </Sheet>
  );
}

function Detail({ o, d, kos, onClose, onChanged }) {
  const money = d.money;
  const T = terms(kos);
  const [x, setX] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'bayar' | 'keluhan' | 'ubah'
  const loadX = () => supabase.rpc('svc_order_detail', { p_order: o.id }).then(({ data, error }) => (error ? toast(errMsg(error)) : setX(data)));
  useEffect(() => { loadX(); }, [o.id, o.status, o.stage_id, o.paid]);
  const refresh = () => { onChanged(); loadX(); };
  const idx = d.stages.findIndex((s) => s.id === o.stage_id);
  const nextName = o.status === 'diterima' ? d.stages[0]?.name : o.status === 'proses' ? d.stages[idx + 1]?.name || 'Siap' : null;
  const move = async (to) => {
    let note = null;
    if (to === 'prev') { note = window.prompt('Alasan mundur tahap?', ''); if (note == null) return; }
    if (to === 'selesai') {
      if (money && sisa(o) > 0 && !window.confirm(`Masih ada sisa bayar ${rp(sisa(o))}. Tetap serahkan? Sisa tercatat sebagai piutang pelanggan.`)) return;
      note = window.prompt(o.deliver ? 'Diantar ke / diterima oleh (opsional):' : 'Diambil oleh (opsional):', '');
      if (note == null) return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_order_move', { p_order: o.id, p_to: to, p_note: note });
    setBusy(false);
    if (error) {
      // Aturan alur kerja (menu Alur kerja) bisa meminta persetujuan pemilik untuk langkah ini
      if (/PERLU_PERSETUJUAN/.test(error.message || '') && (to === 'siap' || to === 'selesai')) {
        const why = errMsg(error).replace(/\s*Kirim permintaan dari aplikasi\.?\s*$/, '');
        if (window.confirm(`${why}\n\nKirim permintaan persetujuan sekarang?`)
            && await requestApproval({ kos: kos.id, action: 'langkah_pesanan_jasa', payload: { order_id: o.id, to, note } })) refresh();
        return;
      }
      return toast(errMsg(error));
    }
    toast(data.stage); refresh();
  };
  const cancel = async () => {
    const reason = window.prompt('Alasan pembatalan pesanan?', '');
    if (!reason) return;
    const r = await withApproval(() => supabase.rpc('svc_order_cancel', { p_order: o.id, p_reason: reason }), 'Pesanan dibatalkan', { kos: kos.id, action: 'batal_pesanan_jasa', payload: { order_id: o.id }, reason });
    if (r) refresh();
  };
  const voidPay = async (p) => {
    const reason = window.prompt(`Batalkan catatan ${p.kind === 'bayar' ? 'pembayaran' : 'pengembalian'} ${rp(p.amount)}? Alasan:`, '');
    if (!reason) return;
    const r = await withApproval(() => supabase.rpc('svc_payment_void', { p_payment: p.id, p_reason: reason }), 'Dibatalkan', { kos: kos.id, action: 'batal_bayar_jasa', payload: { payment_id: p.id }, reason });
    if (r) refresh();
  };
  const paid = Number(o.paid || 0);
  return (
    <Sheet title={`${o.number} · ${o.customer_name}`} onClose={onClose}>
      <div className="row"><span className={'chip ' + (waitPickup(o) || onTheWay(o) ? 'gold' : STATUS[o.status]?.[1] || '')}>{stageLabel(o)}</span>{late(o) && <span className="chip bad">Terlambat</span>}{o.rework_of && <span className="chip gold">{T.rework} {o.rework_of}</span>}{dineText(o) && <span className="chip">{dineText(o)}</span>}</div>
      <span className="small muted">Diterima {waktu(o.received_at)} · janji {waktu(o.due_at)}</span>
      {(o.pickup || o.deliver) && <div className="unitbox" style={{ gap: 4 }}>
        <span className="small" style={{ overflowWrap: 'anywhere' }}>📍 {o.zone_name ? `${o.zone_name} · ` : ''}{o.address || 'Alamat belum diisi'}{o.address && <> · <a href={mapsLink(o.address)} target="_blank" rel="noreferrer">Peta</a></>}{!money && o.logi_phone ? <> · <a href={waLink(o.logi_phone, `Halo ${o.customer_name}, dari ${kos.name}.`)} target="_blank" rel="noreferrer">WA</a></> : ''}</span>
        {o.pickup && <span className="small">Jemput: <b>{PICKUP[o.pickup_status] || '—'}</b>{o.pickup_date ? ` · ${tgl2(o.pickup_date)}${o.pickup_slot ? ' ' + o.pickup_slot : ''}` : ''}</span>}
        {o.deliver && <span className="small">Antar: <b>{DELIVERY[o.delivery_status] || '—'}</b>{o.delivery_date ? ` · ${tgl2(o.delivery_date)}${o.delivery_slot ? ' ' + o.delivery_slot : ''}` : ''}</span>}
        {moduleOn(kos, 'j_antar') && !['selesai', 'batal'].includes(o.status) && <Link href="/antar" className="small">Atur jadwal di {T.logi} →</Link>}
      </div>}
      {o.note && <span className="small">Catatan: {o.note}</span>}
      <div className="list">{(o.lines || []).map((l, i) => (
        <div className="li" key={i}><span className="small">{l.name} · {angka(l.qty)} {l.unit}{Number(l.charge_qty) > Number(l.qty) ? ` (dihitung ${angka(l.charge_qty)})` : ''}{l.note ? ` · ${l.note}` : ''}</span>{money && <b className="small">{rp(l.line_total)}</b>}</div>
      ))}</div>
      {money && <div className="list">
        {Number(o.discount) > 0 && <div className="li"><span className="small">Diskon</span><span className="small">−{rp(o.discount)}</span></div>}
        {Number(o.delivery_fee) > 0 && <div className="li"><span className="small">{T.kul ? 'Ongkos antar' : 'Antar-jemput'}</span><span className="small">{rp(o.delivery_fee)}</span></div>}
        <div className="li"><b>Total</b><b>{rp(o.total)}</b></div>
        <div className="li"><span className="small">Dibayar</span><span className="small">{rp(paid)}</span></div>
        {o.status !== 'batal' ? <div className="li"><b className="small">Sisa</b><b className="small" style={{ color: sisa(o) > 0 ? 'var(--bad)' : 'var(--good)' }}>{sisa(o) > 0 ? rp(sisa(o)) : 'Lunas'}</b></div>
          : paid > 0 && <div className="notice bad small">Pesanan batal. Uang {rp(paid)} perlu dikembalikan — catat lewat <b>Pengembalian uang</b>.</div>}
      </div>}

      {o.status === 'permintaan' && <RequestBox o={o} kos={kos} money={money} onDone={refresh} />}
      {/* tindakan tahap */}
      {!['selesai', 'batal', 'permintaan'].includes(o.status) && <div className="row">
        {waitPickup(o) && <button className="primary" disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.rpc('svc_pickup', { p_order: o.id, p_action: 'dijemput', p_note: null }); setBusy(false); if (error) return toast(errMsg(error)); toast('Sudah dijemput'); refresh(); }}>Sudah dijemput</button>}
        {waitPickup(o) && <button className="sm" disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.rpc('svc_pickup', { p_order: o.id, p_action: 'sendiri', p_note: null }); setBusy(false); if (error) return toast(errMsg(error)); toast('Dicatat: pelanggan mengantar sendiri'); refresh(); }}>Diantar pelanggan sendiri</button>}
        {o.status !== 'siap' && !waitPickup(o) && <button className="primary" disabled={busy} onClick={() => move('next')}>→ {nextName || 'Siap'}</button>}
        {o.status === 'siap' && o.deliver && !onTheWay(o) && <button className="sm" disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.rpc('svc_delivery', { p_order: o.id, p_action: 'berangkat', p_note: null }); setBusy(false); if (error) return toast(errMsg(error)); toast('Dalam pengantaran'); refresh(); }}>Berangkat antar</button>}
        {o.status === 'proses' && <button className="sm" disabled={busy} onClick={() => move('siap')}>Langsung siap</button>}
        {o.status !== 'diterima' && <button className="sm ghost" disabled={busy} onClick={() => move('prev')}>Mundur</button>}
        {o.status === 'siap' && money && <button className="primary" disabled={busy} onClick={() => move('selesai')}>{o.deliver ? 'Sudah diantar' : T.kul ? 'Sudah diserahkan' : 'Sudah diambil'}</button>}
      </div>}

      {/* WhatsApp ke pelanggan (dikirim manual) */}
      {money && o.customer_phone && <div className="row">
        <a href={waLink(o.customer_phone, waText('terima', o, kos.name))} target="_blank" rel="noreferrer"><button className="sm">WA: diterima</button></a>
        {o.status === 'siap' && <a href={waLink(o.customer_phone, waText('siap', o, kos.name))} target="_blank" rel="noreferrer"><button className="sm primary">WA: sudah siap</button></a>}
        {sisa(o) > 0 && o.status !== 'batal' && <a href={waLink(o.customer_phone, waText('tagih', o, kos.name))} target="_blank" rel="noreferrer"><button className="sm">WA: tagih</button></a>}
      </div>}

      {money && <div className="row">
        {o.status !== 'batal' && sisa(o) > 0 && <button className="sm" onClick={() => setMode(mode === 'bayar' ? null : 'bayar')}>+ Bayar</button>}
        {o.status === 'batal' && paid > 0 && <button className="sm" onClick={() => setMode(mode === 'kembali' ? null : 'kembali')}>Pengembalian uang</button>}
        <Link href={`/nota/${o.id}`}><button className="sm">Nota</button></Link>
        {['permintaan', 'diterima', 'proses', 'siap'].includes(o.status) && <button className="sm ghost" onClick={() => setMode(mode === 'ubah' ? null : 'ubah')}>Ubah isi</button>}
      </div>}
      {o.status !== 'batal' && <div className="row">
        <button className="sm ghost" onClick={() => setMode(mode === 'keluhan' ? null : 'keluhan')}>Catat keluhan</button>
        {money && !['selesai', 'batal', 'permintaan'].includes(o.status) && <button className="sm ghost danger" onClick={cancel}>Batalkan pesanan</button>}
      </div>}
      {mode === 'bayar' && <PayForm o={o} kind="bayar" max={sisa(o)} onDone={() => { setMode(null); refresh(); }} />}
      {mode === 'kembali' && <PayForm o={o} kind="kembali" max={paid} onDone={() => { setMode(null); refresh(); }} />}
      {mode === 'keluhan' && <ComplaintForm o={o} onDone={() => { setMode(null); refresh(); }} />}
      {mode === 'ubah' && <EditForm o={o} onDone={() => { setMode(null); refresh(); }} />}

      {!x ? <Loading /> : <>
        {x.complaints.length > 0 && <><span className="label">Keluhan</span><div className="list">{x.complaints.map((c) => <Complaint key={c.id} c={c} money={money} onDone={refresh} />)}</div></>}
        {money && x.payments.length > 0 && <><span className="label">Pembayaran</span><div className="list">{x.payments.map((p) => (
          <div className="li" key={p.id}><span className="small" style={{ textDecoration: p.status === 'batal' ? 'line-through' : 'none' }}>{p.kind === 'bayar' ? 'Bayar' : 'Dikembalikan'} {rp(p.amount)} · {PAYM[p.method]} · {p.paid_at}{p.void_reason ? ` · batal: ${p.void_reason}` : ''}</span>
            {p.status === 'selesai' && <button className="sm ghost" onClick={() => voidPay(p)} aria-label="Batalkan pembayaran">✕</button>}</div>
        ))}</div></>}
        <IsianTambahan entity="svc_order" id={o.id} area="sell" />
        <Lampiran entity="svc_order" id={o.id} hint={T.kul ? 'Mis. foto bukti transfer atau catatan pesanan katering.' : 'Foto barang saat diterima (noda, kerusakan) melindungi Anda bila ada komplain.'} />
        <span className="label">Riwayat</span>
        <div className="list">{x.events.map((e, i) => <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{waktu(e.at)}<br />{e.actor}</span></div>)}</div>
      </>}
    </Sheet>
  );
}

// Pesanan dari halaman bisnis: belum dikonfirmasi → Konfirmasi (boleh ubah ongkos/janji) atau Tolak
function RequestBox({ o, kos, money, onDone }) {
  const [fee, setFee] = useState(String(Math.round(o.delivery_fee || 0)));
  const [busy, setBusy] = useState(false);
  if (!money) return <div className="notice">Pesanan dari halaman bisnis — menunggu konfirmasi kasir/pemilik.</div>;
  const confirm = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('svc_request_confirm', { p_order: o.id, p: (o.pickup || o.deliver) ? { delivery_fee: parseRp(fee) || 0 } : {} });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Dikonfirmasi — kabari pelanggan lewat WA'); onDone();
  };
  const reject = async () => {
    const r = window.prompt('Alasan menolak (kabari pelanggan juga lewat WA):', ''); if (!r) return;
    const { error } = await supabase.rpc('svc_request_reject', { p_order: o.id, p_reason: r });
    if (error) return toast(errMsg(error));
    toast('Permintaan ditolak'); onDone();
  };
  return (
    <div className="unitbox">
      <b className="small">{o.table_no ? `Pesanan dari QR Meja ${o.table_no} — belum dikonfirmasi` : 'Pesanan dari halaman bisnis — belum dikonfirmasi'}</b>
      {o.table_no ? <span className="small muted">Pastikan memang ada tamu di Meja {o.table_no}, lalu Konfirmasi — pesanan langsung masuk Dapur. Pesanan iseng? Tolak.</span> : <span className="small muted">Cek layanan, jadwal & alamat. Setelah dikonfirmasi pesanan masuk antrean; janji selesai dihitung sejak konfirmasi. Berat/jumlah bisa diubah lewat Ubah isi setelah barang diterima.</span>}
      {(o.pickup || o.deliver) && <Field label="Ongkos antar jemput"><input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={confirm}>{busy ? 'Menyimpan…' : 'Konfirmasi'}</button>
        <button className="sm ghost danger" disabled={busy} onClick={reject}>Tolak</button>
        {o.customer_phone && <a href={waLink(o.customer_phone, `Halo ${o.customer_name}, pesanan ${o.number} di ${kos.name} sudah kami terima dan konfirmasi.`)} target="_blank" rel="noreferrer"><button className="sm">WA pelanggan</button></a>}
      </div>
    </div>
  );
}

function PayForm({ o, kind, max, onDone }) {
  const { kos } = useKos();
  const [amt, setAmt] = useState(String(Math.round(max)));
  const [method, setMethod] = useState('tunai');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const a = parseRp(amt);
    if (!(a > 0) || a > max) return toast(`Jumlah 1 sampai ${rp(max)}`);
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_payment_add', { p_id: id, p_order: o.id, p_amount: a, p_method: method, p_kind: kind });
    setBusy(false);
    if (error) return toast(errMsg(error));
    if (kind === 'bayar' && !data?.duplicate) {
      autoPrint(kos.id, (paper) => notaText(kos, { ...o, paid: data.paid }, paper), printFailed);
    }
    toast(kind === 'bayar' ? `Pembayaran ${rp(a)} tercatat` : `Pengembalian ${rp(a)} tercatat`); onDone();
  };
  return (
    <div className="unitbox">
      <div className="row">
        <Field label={kind === 'bayar' ? 'Jumlah dibayar' : 'Jumlah dikembalikan'}><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Cara"><select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </div>
  );
}

function ComplaintForm({ o, onDone }) {
  const { kos } = useKos();
  const T = terms(kos);
  const KINDS = T.kul ? COMPLAINT_K : COMPLAINT;
  const [kind, setKind] = useState('kurang_bersih');
  const [note, setNote] = useState('');
  const [rewash, setRewash] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_complaint_add', { p_order: o.id, p_kind: kind, p_note: note, p_rewash: rewash });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data?.rework_number ? `Keluhan dicatat · pesanan ${T.rework.toLowerCase()} ${data.rework_number} dibuat` : 'Keluhan dicatat'); onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Jenis keluhan"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Keterangan"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={T.kul ? 'mis. sayur kurang matang' : 'mis. noda di kerah kemeja putih'} /></Field>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={rewash} onChange={(e) => setRewash(e.target.checked)} />Kerjakan ulang tanpa biaya{o.status === 'selesai' ? ` (dibuat pesanan ${T.rework.toLowerCase()} baru)` : ' (kembali ke tahap pertama)'}</label>
      <button className="primary" disabled={busy || note.trim().length < 3} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan keluhan'}</button>
    </div>
  );
}

function Complaint({ c, money, onDone }) {
  const { kos } = useKos();
  const T = terms(kos);
  const resolve = async () => {
    const resolution = window.prompt('Bagaimana keluhan ini diselesaikan?', c.rewash ? (T.kul ? 'Sudah dibuatkan ulang, pelanggan puas' : 'Sudah dicuci ulang, pelanggan puas') : '');
    if (!resolution) return;
    const comp = money ? parseRp(window.prompt('Ganti rugi (Rp, isi 0 bila tidak ada):', '0') || '0') || 0 : 0;
    const { error } = await supabase.rpc('svc_complaint_resolve', { p_id: c.id, p_resolution: resolution, p_compensation: comp });
    if (error) return toast(errMsg(error));
    toast(comp > 0 ? 'Selesai. Catat ganti rugi di Kas › + Biaya (kategori Ganti rugi pelanggan).' : 'Keluhan selesai'); onDone();
  };
  return (
    <div className="li" style={{ alignItems: 'flex-start' }}>
      <div className="main"><span className="small"><b>{(T.kul ? COMPLAINT_K : COMPLAINT)[c.kind] || COMPLAINT[c.kind]}</b> · {c.note}{c.rewash ? ` · ${T.rework.toLowerCase()}` : ''}</span>
        <span className="small muted">{waktu(c.at)}{c.resolution ? ` · ${c.resolution}` : ''}{Number(c.compensation) > 0 ? ` · ganti rugi ${rp(c.compensation)}` : ''}</span></div>
      {c.status === 'terbuka' ? (money ? <button className="sm" onClick={resolve}>Selesaikan</button> : <span className="chip bad">Terbuka</span>) : <span className="chip good">Selesai</span>}
    </div>
  );
}

function EditForm({ o, onDone }) {
  const { kosId } = useKos();
  const [svc, setSvc] = useState(null);
  const [lines, setLines] = useState((o.lines || []).map((l) => ({ service_id: l.service_id, qty: String(Number(l.qty)), note: l.note || '' })));
  const [disc, setDisc] = useState(String(Math.round(o.discount || 0)));
  const [due, setDue] = useState(o.due_at ? toLocalInput(o.due_at) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('svc_services').select('*').eq('kos_id', kosId).order('sort').then(({ data }) => setSvc(data || [])); }, [kosId]);
  if (!svc) return <Loading />;
  const setL = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    if (lines.some((l) => !(qtyNum(l.qty) > 0))) return toast('Isi jumlah setiap layanan.');
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_order_edit', { p_order: o.id, p: { lines: lines.map((l) => ({ service_id: l.service_id, qty: qtyNum(l.qty), note: l.note })), discount: parseRp(disc) || 0, due_at: fromLocalInput(due), reason } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Total baru ${rp(data.total)}`); onDone();
  };
  return (
    <div className="unitbox">
      {lines.map((l, i) => { const s = svc.find((x) => x.id === l.service_id); return (
        <div className="row" key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
          <Field label={`${s?.name || 'Item'} (${s?.unit || ''})`}><input inputMode="decimal" value={l.qty} onChange={(e) => setL(i, 'qty', e.target.value)} /></Field>
          {lines.length > 1 && <button className="sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}
        </div>
      ); })}
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{svc.filter((s) => s.active).map((s) => <button key={s.id} className="sm ghost" onClick={() => setLines([...lines, { service_id: s.id, qty: '1', note: '' }])}>+ {s.name}</button>)}</div>
      <div className="row">
        <Field label="Diskon"><input inputMode="numeric" value={disc} onChange={(e) => setDisc(e.target.value)} /></Field>
        <Field label="Janji selesai"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <Field label="Alasan perubahan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. timbang ulang 4,2 kg" /></Field>
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
    </div>
  );
}
