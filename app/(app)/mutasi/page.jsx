'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Empty, toast } from '@/components/ui';
import { angka, tgl, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';
import { multiLoc } from '@/lib/business';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Mutasi stok antar lokasi (blueprint 25.12): tercatat sebagai transaksi transfer dengan jejak asal & tujuan; total stok bisnis tidak berubah
export default function Mutasi() {
  const { kos, kosId, ver, bump } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const locs = kos?.locs?.list || [];
  const locked = kos?.locs?.locked;
  const [from, setFrom] = useState(kos?.locs?.current || '');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);   // [{product_id, unit, qty}]
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState(uid);
  const load = async () => {
    const [p, u, l, h] = await Promise.all([
      supabase.from('products').select('id,name,base_unit,active').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      supabase.rpc('stock_levels_list', { p_kos: kosId }),
      supabase.from('stock_transfers').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(30),
    ]);
    const e = p.error || u.error || l.error || h.error;
    if (e) return setErr(errMsg(e));
    setD({ products: p.data, units: u.data, levels: l.data || [], hist: h.data || [] });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { setFrom(kos?.locs?.current || ''); }, [kos?.locs?.current]);
  if (!multiLoc(kos)) return (
    <div className="stack">
      <div className="row"><h2>Mutasi stok</h2><PageHelp page="mutasi" /></div>
      <Empty title="Baru ada satu lokasi" text="Mutasi stok untuk memindahkan barang antar lokasi, mis. dari gudang ke toko. Tambahkan dulu gudang atau cabang Anda; setelah itu menu ini, pilihan 📍 Lokasi kerja, dan stok per lokasi langsung aktif.">
        <Link href="/konfigurasi?tab=cabang"><button className="primary">+ Tambah gudang / cabang</button></Link>
      </Empty>
    </div>
  );
  if (err) return <div className="notice bad">{/stock_transfers|stock_levels/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const name = (id) => locs.find((b) => b.id === id)?.name || 'lokasi nonaktif';
  const have = (pid, bid) => Number(d.levels.find((l) => l.product_id === pid && l.branch_id === bid)?.qty || 0);
  const term = q.trim().toLowerCase();
  const found = term ? d.products.filter((p) => !items.some((i) => i.product_id === p.id) && term.split(/\s+/).every((w) => p.name.toLowerCase().includes(w))).slice(0, 8) : [];
  const baseOf = (it) => { const p = d.products.find((x) => x.id === it.product_id); const u = unitsOf(p, d.units).find((x) => x.name === it.unit); return (qtyNum(it.qty) || 0) * Number(u?.qty || 1); };
  const bad = items.find((it) => baseOf(it) <= 0 || baseOf(it) > have(it.product_id, from));

  const send = async () => {
    if (!to || to === from) return toast('Pilih lokasi tujuan yang berbeda.');
    if (bad) return toast('Periksa jumlah: harus lebih dari 0 dan tidak melebihi stok di lokasi asal.');
    if (!window.confirm(`Pindahkan ${items.length} barang dari ${name(from)} ke ${name(to)}?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('stock_transfer', { p_id: txId, p_kos: kosId, p_from: from, p_to: to, p_lines: items.map((it) => ({ product_id: it.product_id, qty: baseOf(it) })), p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`${data.number} tersimpan`); setItems([]); setNote(''); setTxId(uid()); bump(); load();
  };

  return (
    <div className="stack">
      <div className="row"><h2>Mutasi stok</h2><PageHelp page="mutasi" /></div>
      <p className="small muted" style={{ margin: 0 }}>Pindahkan barang antar lokasi (mis. dari gudang ke toko). Stok asal berkurang, stok tujuan bertambah, total stok dan nilai modal tidak berubah.</p>
      <section className="panel">
        <div className="row">
          <Field label="Dari">{locked ? <input value={name(from)} disabled /> : <select value={from} onChange={(e) => setFrom(e.target.value)}>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>
          <Field label="Ke"><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">— pilih —</option>{locs.filter((b) => b.id !== from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang yang dipindahkan" aria-label="Cari barang" />
        {found.length > 0 && <div className="list">{found.map((p) => (
          <button key={p.id} className="li click" onClick={() => { setItems([...items, { product_id: p.id, unit: unitsOf(p, d.units)[0]?.name || p.base_unit, qty: '' }]); setQ(''); }}
            style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <span className="small">{p.name}</span><span className="small muted">di {name(from)}: {angka(have(p.id, from))} {p.base_unit}</span>
          </button>
        ))}</div>}
        {items.map((it, i) => {
          const p = d.products.find((x) => x.id === it.product_id);
          const us = unitsOf(p, d.units);
          const over = baseOf(it) > have(p.id, from);
          return (
            <div key={it.product_id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{p.name}</b><button className="sm ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Hapus ${p.name}`}>✕</button></div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input inputMode="decimal" placeholder="Jumlah" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                {us.length > 1 && <select value={it.unit} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} style={{ maxWidth: 140 }}>{us.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select>}
              </div>
              <span className="small" style={{ color: over ? 'var(--bad)' : 'var(--muted)' }}>Stok di {name(from)}: {angka(have(p.id, from))} {p.base_unit}{baseOf(it) > 0 ? ` · dipindah ${angka(baseOf(it))} ${p.base_unit}` : ''}{over ? ' — melebihi stok' : ''}</span>
            </div>
          );
        })}
        {items.length > 0 && <>
          <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. kirim pagi, dibawa motor" /></Field>
          <button className="cta" onClick={send} disabled={busy || !to || Boolean(bad)}>{busy ? 'Menyimpan…' : `Pindahkan ${items.length} barang`}</button>
        </>}
      </section>
      <section className="panel">
        <h3>Riwayat mutasi</h3>
        {d.hist.length === 0 ? <span className="small muted">Belum ada mutasi.</span> : <div className="list">{d.hist.map((h) => (
          <div className="li" key={h.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{name(h.from_branch)} → {name(h.to_branch)}</b>
              <span className="small muted">{h.number} · {when(h.created_at)}{h.created_email ? ` · ${h.created_email}` : ''}{h.note ? ` · ${h.note}` : ''}</span>
              <span className="small">{(h.lines || []).map((x) => `${x.name} ${angka(x.qty)} ${x.unit}`).join(', ')}</span></div>
          </div>
        ))}</div>}
      </section>
    </div>
  );
}
