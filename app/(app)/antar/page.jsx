'use client';
// Antar jemput (bisnis jasa/laundry): daftar jemput & antar, jadwal per wilayah, serta pengaturan wilayah, biaya, dan jam.
// Status & aturan di server (svc_logistics, svc_pickup, svc_delivery, svc_logistics_set, svc_zone_save, svc_slot_save).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { rp, today, errMsg, parseRp, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';
import { PICKUP, DELIVERY, tgl2, mapsLink, hari } from '@/lib/jasa';

const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const KIND = { jemput: 'Jemput', antar: 'Antar', keduanya: 'Jemput & antar' };

export default function Antar() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('jemput');
  const [plan, setPlan] = useState(null);   // {o, leg}
  const [zone, setZone] = useState(null);
  const [slot, setSlot] = useState(null);
  const load = () => supabase.rpc('svc_logistics', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/svc_logistics/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const settings = canArea(kos, 'settings');
  const money = canArea(kos, 'sell');
  const t = today();
  const jemput = d.orders.filter((o) => o.pickup && o.pickup_status !== 'dijemput' && o.status === 'diterima');
  const antar = d.orders.filter((o) => o.deliver && o.status === 'siap');
  const when = (date) => (!date ? 'Belum dijadwalkan' : date < t ? 'Terlewat' : date === t ? 'Hari ini' : date === addDays(t, 1) ? 'Besok' : tgl2(date));
  const order = ['Terlewat', 'Hari ini', 'Besok'];
  const groups = (rows, key) => {
    const g = {};
    rows.forEach((o) => { const k = when(o[key]); (g[k] = g[k] || []).push(o); });
    return Object.entries(g).sort(([a], [b]) => (order.indexOf(a) + 1 || (a === 'Belum dijadwalkan' ? 99 : 50)) - (order.indexOf(b) + 1 || (b === 'Belum dijadwalkan' ? 99 : 50)));
  };

  const act = async (fn, args, ok) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) return toast(errMsg(error));
    toast(ok); load();
  };
  const fail = (o, leg) => { const r = window.prompt(`Alasan ${leg === 'jemput' ? 'jemput' : 'antar'} gagal? (mis. pelanggan tidak di rumah)`, ''); if (r) act(leg === 'jemput' ? 'svc_pickup' : 'svc_delivery', { p_order: o.id, p_action: 'gagal', p_note: r }, 'Dicatat — jadwalkan ulang'); };
  const handover = (o) => {
    if (!o.lunas && !money) return toast('Belum lunas — serahkan lewat kasir/pemilik.');
    if (money && !o.lunas && !window.confirm(`Masih ada sisa bayar ${rp(o.sisa)}. Tetap serahkan? Sisa tercatat sebagai piutang.`)) return;
    const r = window.prompt('Diterima oleh (opsional):', ''); if (r === null) return;
    act('svc_delivery', { p_order: o.id, p_action: 'terkirim', p_note: r }, 'Terkirim — pesanan selesai');
  };

  const Card = ({ o, leg }) => {
    const st = leg === 'jemput' ? PICKUP[o.pickup_status] : DELIVERY[o.delivery_status];
    const slotTxt = leg === 'jemput' ? [tgl2(o.pickup_date), o.pickup_slot].filter(Boolean).join(' · ') : [tgl2(o.delivery_date), o.delivery_slot].filter(Boolean).join(' · ');
    return (
      <div className="li" style={{ display: 'block' }}>
        <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <span className="small" style={{ minWidth: 0 }}><b>{o.customer_name}</b> · {o.number}<br /><span className="muted">{o.items}</span></span>
          <span className={'chip ' + (/gagal/.test(st) ? 'bad' : o.delivery_status === 'dalam_pengantaran' ? 'gold' : 'info')} style={{ flex: 'none' }}>{st}</span>
        </div>
        <span className="small" style={{ display: 'block', overflowWrap: 'anywhere' }}>📍 {o.zone_name ? `${o.zone_name} · ` : ''}{o.address || 'Alamat belum diisi'}{o.address && <> · <a href={mapsLink(o.address)} target="_blank" rel="noreferrer">Peta</a></>}</span>
        <span className="small muted">{slotTxt || 'Jadwal belum diatur'}{leg === 'antar' && money && o.sisa > 0 ? ` · sisa bayar ${rp(o.sisa)}` : leg === 'antar' && o.lunas ? ' · lunas' : ''}{leg === 'jemput' ? ` · janji selesai ${hari(o.due_at)}` : ''}</span>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {leg === 'jemput' && <button className="sm primary" onClick={() => act('svc_pickup', { p_order: o.id, p_action: 'dijemput', p_note: null }, 'Sudah dijemput — siap diproses')}>Sudah dijemput</button>}
          {leg === 'antar' && o.delivery_status !== 'dalam_pengantaran' && <button className="sm primary" onClick={() => act('svc_delivery', { p_order: o.id, p_action: 'berangkat', p_note: null }, 'Dalam pengantaran')}>Berangkat antar</button>}
          {leg === 'antar' && <button className={'sm' + (o.delivery_status === 'dalam_pengantaran' ? ' primary' : '')} onClick={() => handover(o)}>Sudah diterima pelanggan</button>}
          <button className="sm" onClick={() => setPlan({ o, leg })}>Jadwal</button>
          {o.customer_phone && <a href={waLink(o.customer_phone, leg === 'jemput' ? `Halo ${o.customer_name}, kami dari ${kos.name} akan menjemput cucian${slotTxt ? ` (${slotTxt})` : ''}.` : `Halo ${o.customer_name}, pesanan ${o.number} dari ${kos.name} sedang kami antar.`)} target="_blank" rel="noreferrer"><button className="sm ghost">WA</button></a>}
          <button className="sm ghost danger" onClick={() => fail(o, leg)}>Gagal</button>
        </div>
      </div>
    );
  };
  const List = ({ rows, leg, key2 }) => rows.length === 0
    ? <Empty title={leg === 'jemput' ? 'Tidak ada yang perlu dijemput' : 'Tidak ada yang perlu diantar'} text={leg === 'jemput' ? 'Pesanan dengan "Dijemput" yang belum diambil muncul di sini.' : 'Pesanan "Diantar" yang sudah siap muncul di sini.'} />
    : groups(rows, key2).map(([g, xs]) => <section className="panel" key={g}><h3 style={{ color: g === 'Terlewat' ? 'var(--bad)' : undefined }}>{g} ({xs.length})</h3><div className="list">{xs.map((o) => <Card key={o.id} o={o} leg={leg} />)}</div></section>);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Antar jemput</h2><PageHelp page="antar" /></div>{money && <Link href="/pesanan?baru=1"><button className="primary">+ Pesanan</button></Link>}</div>
      <div className="seg">{[['jemput', `Jemput (${jemput.length})`], ['antar', `Antar (${antar.length})`], ...(settings ? [['atur', 'Wilayah & jadwal']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab !== 'atur' && d.zones.filter((z) => z.active).length === 0 && <div className="notice">Wilayah layanan belum diatur{settings ? <> — buka <b>Wilayah & jadwal</b>. Tanpa daftar wilayah, alamat mana pun bisa dicatat.</> : '. Minta pemilik mengaturnya.'}</div>}
      {tab === 'jemput' && <List rows={jemput} leg="jemput" key2="pickup_date" />}
      {tab === 'antar' && <List rows={antar} leg="antar" key2="delivery_date" />}
      {tab === 'atur' && settings && <>
        <section className="panel">
          <div className="row between"><h3>Wilayah & biaya</h3><button className="sm" onClick={() => setZone({ active: true })}>+ Wilayah</button></div>
          <span className="small muted">Hanya wilayah di daftar ini yang bisa dipilih saat menerima pesanan antar jemput. Biaya terisi otomatis (bisa diubah per pesanan).</span>
          {d.zones.length === 0 ? <span className="small muted">Belum ada wilayah.</span> : <div className="list">{d.zones.map((z) => (
            <button key={z.id} className="li click" onClick={() => setZone(z)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: z.active ? 1 : 0.55 }}>
              <span className="small"><b>{z.name}</b>{!z.active && ' (nonaktif)'}{z.note ? <><br /><span className="muted">{z.note}</span></> : ''}</span><b className="small">{Number(z.fee) > 0 ? rp(z.fee) : 'Gratis'}</b></button>
          ))}</div>}
        </section>
        <section className="panel">
          <div className="row between"><h3>Jadwal jemput & antar</h3><button className="sm" onClick={() => setSlot({ kind: 'keduanya', active: true })}>+ Jam</button></div>
          <span className="small muted">Pilihan jam saat menjadwalkan. Isi kapasitas bila satu jam hanya sanggup sekian pesanan per hari.</span>
          {d.note?.schedule && <span className="small muted">Dari setup: “{d.note.schedule}”</span>}
          {d.slots.length === 0 ? <span className="small muted">Belum ada jam.</span> : <div className="list">{d.slots.map((s) => (
            <button key={s.id} className="li click" onClick={() => setSlot(s)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: s.active ? 1 : 0.55 }}>
              <span className="small"><b>{s.label}</b> · {KIND[s.kind]}{!s.active && ' (nonaktif)'}</span><span className="small muted">{s.capacity ? `maks ${s.capacity}/hari` : 'tanpa batas'}</span></button>
          ))}</div>}
        </section>
      </>}
      {plan && <PlanSheet o={plan.o} leg={plan.leg} slots={d.slots} zones={d.zones} onClose={() => setPlan(null)} onSaved={() => { setPlan(null); load(); }} />}
      {zone && <ZoneSheet kosId={kosId} z={zone} onClose={() => setZone(null)} onSaved={() => { setZone(null); load(); }} />}
      {slot && <SlotSheet kosId={kosId} s={slot} onClose={() => setSlot(null)} onSaved={() => { setSlot(null); load(); }} />}
    </div>
  );
}

function PlanSheet({ o, leg, slots, zones, onClose, onSaved }) {
  const k = leg === 'jemput' ? 'pickup' : 'delivery';
  const [date, setDate] = useState(o[`${k}_date`] || today());
  const [sl, setSl] = useState(o[`${k}_slot`] || '');
  const [addr, setAddr] = useState(o.address || '');
  const opts = slots.filter((s) => s.active && (s.kind === 'keduanya' || s.kind === (leg === 'jemput' ? 'jemput' : 'antar')));
  const save = async () => {
    const { error } = await supabase.rpc('svc_logistics_set', { p_order: o.id, p: { [`${k}_date`]: date, [`${k}_slot`]: sl, address: addr } });
    if (error) return toast(errMsg(error));
    toast('Jadwal disimpan'); onSaved();
  };
  return (
    <Sheet title={`Jadwal ${leg} · ${o.customer_name}`} onClose={onClose}>
      <Field label="Tanggal"><input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      {opts.length > 0 ? <Field label="Jam"><select value={sl} onChange={(e) => setSl(e.target.value)}><option value="">— pilih —</option>{opts.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}</select></Field>
        : <Field label="Jam (opsional)"><input value={sl} maxLength={40} onChange={(e) => setSl(e.target.value)} placeholder="mis. 08.00–10.00" /></Field>}
      <Field label="Alamat"><input value={addr} maxLength={200} onChange={(e) => setAddr(e.target.value)} /></Field>
      <button className="primary" onClick={save}>Simpan jadwal</button>
    </Sheet>
  );
}

function ZoneSheet({ kosId, z, onClose, onSaved }) {
  const [f, setF] = useState({ name: z.name || '', fee: z.fee != null ? String(Math.round(z.fee)) : '', note: z.note || '', active: z.active !== false });
  const save = async () => {
    const { error } = await supabase.rpc('svc_zone_save', { p_kos: kosId, p_id: z.id || null, p: { ...f, fee: parseRp(f.fee) || 0 } });
    if (error) return toast(errMsg(error));
    toast('Wilayah disimpan'); onSaved();
  };
  return (
    <Sheet title={z.id ? 'Ubah wilayah' : 'Wilayah baru'} onClose={onClose}>
      <Field label="Nama wilayah" hint="mis. kecamatan, kelurahan, atau perumahan"><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Biaya antar jemput (Rp)" hint="isi 0 bila gratis"><input inputMode="numeric" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="mis. gratis minimal 5 kg" /></Field>
      {z.id && <div className="seg">{[[true, 'Dilayani'], [false, 'Tidak dilayani']].map(([k, l]) => <button key={l} className={f.active === k ? 'on' : ''} onClick={() => setF({ ...f, active: k })}>{l}</button>)}</div>}
      <button className="primary" onClick={save}>Simpan</button>
    </Sheet>
  );
}

function SlotSheet({ kosId, s, onClose, onSaved }) {
  const [f, setF] = useState({ label: s.label || '', kind: s.kind || 'keduanya', capacity: s.capacity ? String(s.capacity) : '', active: s.active !== false });
  const save = async () => {
    const { error } = await supabase.rpc('svc_slot_save', { p_kos: kosId, p_id: s.id || null, p: { ...f, capacity: f.capacity.replace(/\D/g, '') } });
    if (error) return toast(errMsg(error));
    toast('Jadwal disimpan'); onSaved();
  };
  return (
    <Sheet title={s.id ? 'Ubah jam' : 'Jam baru'} onClose={onClose}>
      <Field label="Jam"><input value={f.label} maxLength={40} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="mis. 08.00–10.00" /></Field>
      <div className="seg">{Object.entries(KIND).map(([k, l]) => <button key={k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>
      <Field label="Kapasitas per hari (opsional)"><input inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} placeholder="kosongkan = tanpa batas" /></Field>
      {s.id && <div className="seg">{[[true, 'Aktif'], [false, 'Nonaktif']].map(([k, l]) => <button key={l} className={f.active === k ? 'on' : ''} onClick={() => setF({ ...f, active: k })}>{l}</button>)}</div>}
      <button className="primary" onClick={save}>Simpan</button>
    </Sheet>
  );
}
