'use client';
import IsianTambahan from '@/components/IsianTambahan';
import Lampiran from '@/components/Lampiran';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { rp, angka, errMsg, parseRp, waLink } from '@/lib/format';
import { withApproval } from '@/lib/approval';
import { uid, qtyNum } from '@/lib/retail';
import { STATUS, COMPLAINT, PAYM, waktu, hari, sisa, stageLabel, late, linesText, waText, toLocalInput, fromLocalInput, waitPickup, onTheWay, PICKUP, DELIVERY, tgl2, mapsLink } from '@/lib/jasa';
import { moduleOn } from '@/lib/business';

// Pesanan jasa (blueprint 5.3 Laundry): terima → tahap proses → siap → diambil/diantar, dengan DP/lunas, nota, keluhan
export default function Pesanan() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('aktif');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [neu, setNeu] = useState(false);
  const load = () => supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('baru')) setNeu(true); } catch {} }, []);
  if (err) return <div className="notice bad">{/svc_board/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const money = d.money;
  const act = d.orders.filter((o) => !['selesai', 'batal'].includes(o.status));
  const chips = [
    ['aktif', `Semua aktif (${act.length})`],
    ['diterima', `Diterima (${act.filter((o) => o.status === 'diterima' && !waitPickup(o)).length})`],
    ...d.stages.map((s) => [s.id, `${s.name} (${act.filter((o) => o.stage_id === s.id).length})`]),
    ['siap', `Siap (${act.filter((o) => o.status === 'siap' && !onTheWay(o)).length})`],
    ['jemput', `Menunggu jemput (${act.filter(waitPickup).length})`],
    ['pengantaran', `Dalam pengantaran (${act.filter(onTheWay).length})`],
    ['terlambat', `Terlambat (${act.filter(late).length})`],
    ['tutup', 'Selesai & batal (30 hari)'],
  ];
  const term = q.trim().toLowerCase();
  const shown = d.orders.filter((o) => {
    const okF = f === 'aktif' ? act.includes(o) : f === 'tutup' ? !act.includes(o) : f === 'jemput' ? waitPickup(o) : f === 'pengantaran' ? onTheWay(o)
      : f === 'terlambat' ? late(o) : f === 'diterima' ? o.status === 'diterima' && !waitPickup(o) : f === 'siap' ? o.status === 'siap' && !onTheWay(o) : o.stage_id === f;
    return okF && (!term || [o.number, o.customer_name, o.customer_phone].some((x) => (x || '').toLowerCase().includes(term)));
  });
  const cur = open && d.orders.find((o) => o.id === open);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pesanan</h2><PageHelp page="pesanan" /></div>{money && <button className="primary" onClick={() => setNeu(true)}>+ Pesanan baru</button>}</div>
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{chips.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor, nama, atau No. HP" aria-label="Cari pesanan" />
      {shown.length === 0 ? <Empty title="Tidak ada pesanan di sini" text={money ? 'Tekan + Pesanan baru saat pelanggan menyerahkan cucian.' : 'Pesanan yang perlu dikerjakan akan muncul di sini.'} /> : (
        <section className="panel"><div className="list">{shown.map((o) => (
          <button key={o.id} className="li click" onClick={() => setOpen(o.id)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{o.customer_name} <span className="muted">· {o.number}</span></b>
              <span className="small muted">{linesText(o.lines)}{o.pickup ? ` · jemput${o.pickup_date && waitPickup(o) ? ` ${tgl2(o.pickup_date)}${o.pickup_slot ? ' ' + o.pickup_slot : ''}` : ''}` : ''}{o.deliver ? ' · 🛵 antar' : ''}{o.rework_of ? ` · cuci ulang ${o.rework_of}` : ''}</span>
              <span className="small" style={{ color: late(o) ? 'var(--bad)' : 'var(--muted)' }}>{['selesai', 'batal'].includes(o.status) ? waktu(o.completed_at || o.received_at) : `Janji ${hari(o.due_at)}${late(o) ? ' · terlambat' : ''}`}{money && o.total != null && sisa(o) > 0 && o.status !== 'batal' ? ` · sisa ${rp(sisa(o))}` : ''}{o.open_complaints > 0 ? ' · ⚠ keluhan' : ''}</span></div>
            <span className={'chip ' + (waitPickup(o) || onTheWay(o) ? 'gold' : STATUS[o.status]?.[1] || '')}>{stageLabel(o)}</span>
          </button>
        ))}</div></section>
      )}
      {neu && <NewOrder kosId={kosId} onClose={() => setNeu(false)} onSaved={(id) => { setNeu(false); load().then(() => setOpen(id)); }} />}
      {cur && <Detail o={cur} d={d} kos={kos} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function NewOrder({ kosId, onClose, onSaved }) {
  const { kos } = useKos();
  const logi = moduleOn(kos, 'j_antar');
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
  if (!svc) return <Sheet title="Pesanan baru" onClose={onClose}><Loading /></Sheet>;
  if (!svc.length) return <Sheet title="Pesanan baru" onClose={onClose}><Empty title="Belum ada layanan" text="Tambahkan layanan & harga dulu di menu Layanan & tahap."><Link href="/layanan"><button className="primary">Buka Layanan</button></Link></Empty></Sheet>;
  const addSvc = (s) => setLines([...lines, { service_id: s.id, qty: s.unit === 'kg' ? '' : '1', note: '' }]);
  const setL = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    if (!cust && name.trim().length < 2) return toast('Isi nama pelanggan.');
    if (!priced.length || priced.some((l) => !(l.qn > 0))) return toast('Isi jumlah (kg/pcs) setiap layanan.');
    if ((parseRp(pay) || 0) > total) return toast('Pembayaran awal melebihi total.');
    if ((deliver || pickup) && zones.length && !zoneId) return toast('Pilih wilayah antar jemput. Alamat di luar wilayah yang dilayani tidak bisa dijemput/diantar.');
    if ((deliver || pickup) && addr.trim().length < 5) return toast('Isi alamat untuk antar jemput.');
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_order_create', { p_id: id, p_kos: kosId, p: {
      contact_id: cust?.id || null, name: cust ? cust.name : name, phone: cust ? cust.phone : phone,
      lines: priced.map((l) => ({ service_id: l.service_id, qty: l.qn, note: l.note })), discount: parseRp(disc) || 0,
      deliver, pickup, address: addr, delivery_fee: deliver || pickup ? parseRp(fee) || 0 : 0, due_at: fromLocalInput(due), note,
      ...(deliver || pickup ? { zone_id: zoneId, pickup_date: pickup ? pDate || null : null, pickup_slot: pickup ? pSlot : null, delivery_date: deliver ? dDate || null : null, delivery_slot: deliver ? dSlot : null } : {}),
      payment: (parseRp(pay) || 0) > 0 ? { amount: parseRp(pay), method } : null } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Pesanan ${data.number} tersimpan`); onSaved(data.id);
  };
  return (
    <Sheet title="Pesanan baru" onClose={onClose}>
      <span className="label">Pelanggan</span>
      {cust ? <div className="li"><span className="small"><b>{cust.name}</b>{cust.phone ? ` · ${cust.phone}` : ''}</span><button className="sm ghost" onClick={() => setCust(null)}>Ganti</button></div> : <>
        <input type="search" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Cari pelanggan lama (nama / No. HP)" aria-label="Cari pelanggan" />
        {matches.length > 0 && <div className="list">{matches.map((c) => <button key={c.id} className="li click" onClick={() => { setCust(c); setCq(''); }} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}><span className="small">{c.name}</span><span className="small muted">{c.phone}</span></button>)}</div>}
        <div className="row">
          <Field label="Nama (pelanggan baru)"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="08…" /></Field>
        </div>
        <span className="small muted">Dengan No. HP, pelanggan tersimpan otomatis (dicocokkan lewat nomor, tidak dobel).</span>
      </>}
      <span className="label">Layanan</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{svc.map((s) => <button key={s.id} className="sm" onClick={() => addSvc(s)}>+ {s.name}</button>)}</div>
      {priced.map((l, i) => (
        <div key={i} className="unitbox">
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{l.s?.name}</b><button className="sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Hapus">✕</button></div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Field label={`Jumlah (${l.s?.unit})`}><input inputMode="decimal" value={l.qty} onChange={(e) => setL(i, 'qty', e.target.value)} placeholder={l.s?.unit === 'kg' ? 'mis. 3,5' : '1'} autoFocus={l.s?.unit === 'kg' && !l.qty} /></Field>
            <Field label="Catatan"><input value={l.note} onChange={(e) => setL(i, 'note', e.target.value)} placeholder="mis. 3 kemeja putih" maxLength={120} /></Field>
          </div>
          <span className="small muted">{rp(l.s?.price)}/{l.s?.unit}{Number(l.s?.min_qty) > 0 ? ` · minimal ${angka(l.s.min_qty)} ${l.s.unit}` : ''}{l.qn > 0 ? ` · dihitung ${angka(l.cq)} ${l.s?.unit} = ${rp(l.total)}` : ''}</span>
        </div>
      ))}
      {logi && <div className="row">
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pickup} onChange={(e) => setPickup(e.target.checked)} />Dijemput</label>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={deliver} onChange={(e) => setDeliver(e.target.checked)} />Diantar</label>
      </div>}
      {logi && (deliver || pickup) && <>
        {zones.length > 0 ? <Field label="Wilayah" hint="hanya wilayah yang dilayani"><select value={zoneId} onChange={(e) => { const z = zones.find((x) => x.id === e.target.value); setZoneId(e.target.value); if (z) setFee(String(Math.round(z.fee))); }}>
          <option value="">— pilih wilayah —</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {Number(z.fee) > 0 ? rp(z.fee) : 'gratis'}</option>)}</select></Field>
          : <span className="small muted">Wilayah layanan belum diatur (menu Antar jemput › Wilayah & jadwal).</span>}
        <div className="row">
          <Field label="Alamat"><input value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={200} placeholder="jalan, nomor, patokan" /></Field>
          <Field label="Ongkos antar-jemput"><input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></Field>
        </div>
        {pickup && <div className="row">
          <Field label="Tanggal jemput (opsional)"><input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} /></Field>
          <Field label="Jam jemput"><select value={pSlot} onChange={(e) => setPSlot(e.target.value)}><option value="">—</option>{slots.filter((s) => s.kind !== 'antar').map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}</select></Field>
        </div>}
        {deliver && <div className="row">
          <Field label="Tanggal antar (opsional)"><input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} /></Field>
          <Field label="Jam antar"><select value={dSlot} onChange={(e) => setDSlot(e.target.value)}><option value="">—</option>{slots.filter((s) => s.kind !== 'jemput').map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}</select></Field>
        </div>}
        {pickup && <span className="small muted">Pesanan yang dijemput baru bisa diproses setelah ditandai <b>Sudah dijemput</b>.</span>}
      </>}
      <div className="row">
        <Field label="Diskon (opsional)"><input inputMode="numeric" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" /></Field>
        <Field label="Janji selesai" hint={autoDue && !due ? `otomatis ${hari(autoDue)} (${hours} jam)` : null}><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <Field label="Catatan pesanan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="mis. pisahkan baju putih" /></Field>
      <div className="li"><b>Total</b><b>{rp(total)}</b></div>
      <div className="row">
        <Field label="Bayar sekarang (DP/lunas, opsional)"><input inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" /></Field>
        <Field label="Cara bayar"><select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <div className="row"><button className="sm ghost" onClick={() => setPay(String(total))}>Lunas sekarang</button><button className="sm ghost" onClick={() => setPay('')}>Bayar saat ambil</button></div>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pesanan'}</button>
      <span className="small muted">Harga dihitung ulang oleh server dari daftar layanan.</span>
    </Sheet>
  );
}

function Detail({ o, d, kos, onClose, onChanged }) {
  const money = d.money;
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
    if (error) return toast(errMsg(error));
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
      <div className="row"><span className={'chip ' + (waitPickup(o) || onTheWay(o) ? 'gold' : STATUS[o.status]?.[1] || '')}>{stageLabel(o)}</span>{late(o) && <span className="chip bad">Terlambat</span>}{o.rework_of && <span className="chip gold">Cuci ulang {o.rework_of}</span>}</div>
      <span className="small muted">Diterima {waktu(o.received_at)} · janji {waktu(o.due_at)}</span>
      {(o.pickup || o.deliver) && <div className="unitbox" style={{ gap: 4 }}>
        <span className="small" style={{ overflowWrap: 'anywhere' }}>📍 {o.zone_name ? `${o.zone_name} · ` : ''}{o.address || 'Alamat belum diisi'}{o.address && <> · <a href={mapsLink(o.address)} target="_blank" rel="noreferrer">Peta</a></>}{!money && o.logi_phone ? <> · <a href={waLink(o.logi_phone, `Halo ${o.customer_name}, dari ${kos.name}.`)} target="_blank" rel="noreferrer">WA</a></> : ''}</span>
        {o.pickup && <span className="small">Jemput: <b>{PICKUP[o.pickup_status] || '—'}</b>{o.pickup_date ? ` · ${tgl2(o.pickup_date)}${o.pickup_slot ? ' ' + o.pickup_slot : ''}` : ''}</span>}
        {o.deliver && <span className="small">Antar: <b>{DELIVERY[o.delivery_status] || '—'}</b>{o.delivery_date ? ` · ${tgl2(o.delivery_date)}${o.delivery_slot ? ' ' + o.delivery_slot : ''}` : ''}</span>}
        {moduleOn(kos, 'j_antar') && !['selesai', 'batal'].includes(o.status) && <Link href="/antar" className="small">Atur jadwal di Antar jemput →</Link>}
      </div>}
      {o.note && <span className="small">Catatan: {o.note}</span>}
      <div className="list">{(o.lines || []).map((l, i) => (
        <div className="li" key={i}><span className="small">{l.name} · {angka(l.qty)} {l.unit}{Number(l.charge_qty) > Number(l.qty) ? ` (dihitung ${angka(l.charge_qty)})` : ''}{l.note ? ` · ${l.note}` : ''}</span>{money && <b className="small">{rp(l.line_total)}</b>}</div>
      ))}</div>
      {money && <div className="list">
        {Number(o.discount) > 0 && <div className="li"><span className="small">Diskon</span><span className="small">−{rp(o.discount)}</span></div>}
        {Number(o.delivery_fee) > 0 && <div className="li"><span className="small">Antar-jemput</span><span className="small">{rp(o.delivery_fee)}</span></div>}
        <div className="li"><b>Total</b><b>{rp(o.total)}</b></div>
        <div className="li"><span className="small">Dibayar</span><span className="small">{rp(paid)}</span></div>
        {o.status !== 'batal' ? <div className="li"><b className="small">Sisa</b><b className="small" style={{ color: sisa(o) > 0 ? 'var(--bad)' : 'var(--good)' }}>{sisa(o) > 0 ? rp(sisa(o)) : 'Lunas'}</b></div>
          : paid > 0 && <div className="notice bad small">Pesanan batal. Uang {rp(paid)} perlu dikembalikan — catat lewat <b>Pengembalian uang</b>.</div>}
      </div>}

      {/* tindakan tahap */}
      {!['selesai', 'batal'].includes(o.status) && <div className="row">
        {waitPickup(o) && <button className="primary" disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.rpc('svc_pickup', { p_order: o.id, p_action: 'dijemput', p_note: null }); setBusy(false); if (error) return toast(errMsg(error)); toast('Sudah dijemput'); refresh(); }}>Sudah dijemput</button>}
        {o.status !== 'siap' && !waitPickup(o) && <button className="primary" disabled={busy} onClick={() => move('next')}>→ {nextName || 'Siap'}</button>}
        {o.status === 'siap' && o.deliver && !onTheWay(o) && <button className="sm" disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.rpc('svc_delivery', { p_order: o.id, p_action: 'berangkat', p_note: null }); setBusy(false); if (error) return toast(errMsg(error)); toast('Dalam pengantaran'); refresh(); }}>Berangkat antar</button>}
        {o.status === 'proses' && <button className="sm" disabled={busy} onClick={() => move('siap')}>Langsung siap</button>}
        {o.status !== 'diterima' && <button className="sm ghost" disabled={busy} onClick={() => move('prev')}>Mundur</button>}
        {o.status === 'siap' && money && <button className="primary" disabled={busy} onClick={() => move('selesai')}>{o.deliver ? 'Sudah diantar' : 'Sudah diambil'}</button>}
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
        {['diterima', 'proses'].includes(o.status) && <button className="sm ghost" onClick={() => setMode(mode === 'ubah' ? null : 'ubah')}>Ubah isi</button>}
      </div>}
      {o.status !== 'batal' && <div className="row">
        <button className="sm ghost" onClick={() => setMode(mode === 'keluhan' ? null : 'keluhan')}>Catat keluhan</button>
        {money && !['selesai', 'batal'].includes(o.status) && <button className="sm ghost danger" onClick={cancel}>Batalkan pesanan</button>}
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
        <Lampiran entity="svc_order" id={o.id} hint="Foto barang saat diterima (noda, kerusakan) melindungi Anda bila ada komplain." />
        <span className="label">Riwayat</span>
        <div className="list">{x.events.map((e, i) => <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{waktu(e.at)}<br />{e.actor}</span></div>)}</div>
      </>}
    </Sheet>
  );
}

function PayForm({ o, kind, max, onDone }) {
  const [amt, setAmt] = useState(String(Math.round(max)));
  const [method, setMethod] = useState('tunai');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const a = parseRp(amt);
    if (!(a > 0) || a > max) return toast(`Jumlah 1 sampai ${rp(max)}`);
    setBusy(true);
    const { error } = await supabase.rpc('svc_payment_add', { p_id: id, p_order: o.id, p_amount: a, p_method: method, p_kind: kind });
    setBusy(false);
    if (error) return toast(errMsg(error));
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
  const [kind, setKind] = useState('kurang_bersih');
  const [note, setNote] = useState('');
  const [rewash, setRewash] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('svc_complaint_add', { p_order: o.id, p_kind: kind, p_note: note, p_rewash: rewash });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data?.rework_number ? `Keluhan dicatat · pesanan cuci ulang ${data.rework_number} dibuat` : 'Keluhan dicatat'); onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Jenis keluhan"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(COMPLAINT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Keterangan"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="mis. noda di kerah kemeja putih" /></Field>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={rewash} onChange={(e) => setRewash(e.target.checked)} />Kerjakan ulang tanpa biaya{o.status === 'selesai' ? ' (dibuat pesanan cuci ulang baru)' : ' (kembali ke tahap pertama)'}</label>
      <button className="primary" disabled={busy || note.trim().length < 3} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan keluhan'}</button>
    </div>
  );
}

function Complaint({ c, money, onDone }) {
  const resolve = async () => {
    const resolution = window.prompt('Bagaimana keluhan ini diselesaikan?', c.rewash ? 'Sudah dicuci ulang, pelanggan puas' : '');
    if (!resolution) return;
    const comp = money ? parseRp(window.prompt('Ganti rugi (Rp, isi 0 bila tidak ada):', '0') || '0') || 0 : 0;
    const { error } = await supabase.rpc('svc_complaint_resolve', { p_id: c.id, p_resolution: resolution, p_compensation: comp });
    if (error) return toast(errMsg(error));
    toast(comp > 0 ? 'Selesai. Catat ganti rugi di Kas › + Biaya (kategori Ganti rugi pelanggan).' : 'Keluhan selesai'); onDone();
  };
  return (
    <div className="li" style={{ alignItems: 'flex-start' }}>
      <div className="main"><span className="small"><b>{COMPLAINT[c.kind]}</b> · {c.note}{c.rewash ? ' · cuci ulang' : ''}</span>
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
          <Field label={`${s?.name || 'Layanan'} (${s?.unit || ''})`}><input inputMode="decimal" value={l.qty} onChange={(e) => setL(i, 'qty', e.target.value)} /></Field>
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
