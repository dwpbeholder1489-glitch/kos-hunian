'use client';
// Konsinyasi (titip jual). Server: consign_overview, consign_doc_create; setoran ke penitip lewat debt_pay (sama dengan Kas › Utang supplier).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { useBaru } from '@/lib/useBaru';
import { Sheet, Field, Loading, Empty, Tile, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';

const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };

export default function Konsinyasi() {
  const { kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [m, setM] = useState(null);       // data master: produk, satuan, supplier
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null); // {kind:'terima'|'kembali', contact}
  const [open, setOpen] = useState(null); // id penitip
  const [pay, setPay] = useState(null);   // penitip yang disetor
  useBaru(() => setForm({ kind: 'terima', contact: '' }));
  const load = async () => {
    const [a, p, u, c, mv] = await Promise.all([supabase.rpc('consign_overview', { p_kos: kosId, p_from: null, p_to: null }),
      supabase.from('products').select('id, name, base_unit, stock, cost, consign_contact_id, active').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      supabase.from('contacts').select('id, name, archived_at').eq('kos_id', kosId).eq('kind', 'supplier').order('name'),
      supabase.from('stock_moves').select('product_id').eq('kos_id', kosId).limit(5000)]);
    if (a.error) return setErr(errMsg(a.error));
    setErr(null); setD(a.data);
    setM({ products: p.data || [], units: u.data || [], suppliers: (c.data || []).filter((s) => !s.archived_at), moved: new Set((mv.data || []).map((x) => x.product_id)) });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d || !m) return <Loading />;
  const list = d.penitip;
  const cur = open && list.find((x) => x.id === open);
  const sumStok = list.reduce((a, x) => a + Number(x.nilai_stok), 0);
  const sumSetor = list.reduce((a, x) => a + Math.max(0, Number(x.saldo) || 0), 0);
  const done = (msg) => { setForm(null); setPay(null); toast(msg); load(); };
  return (
    <div className="stack">
      <PageHeader title="Konsinyasi" help={<PageHelp page="konsinyasi" />} actions={<><button className="primary" onClick={() => setForm({ kind: 'terima', contact: '' })}>+ Terima titipan</button></>} />
      <div className="grid">
        <Tile label="Nilai barang titipan di toko" value={rp(sumStok)} sub="belum terjual · bukan milik toko" />
        {d.can_pay && <Tile label="Harus disetor ke penitip" value={rp(sumSetor)} tone={sumSetor > 0 ? 'gold' : ''} sub="dari yang terjual, rusak, atau hilang" />}
      </div>
      {list.length === 0 ? (
        <Empty title="Belum ada barang titipan" text="Untuk barang yang dititipkan orang lain di toko Anda: dijual lewat Kasir seperti biasa, dan yang terjual otomatis tercatat sebagai uang yang harus disetor ke penitip.">
          <button className="primary" onClick={() => setForm({ kind: 'terima', contact: '' })}>Terima titipan pertama</button>
        </Empty>
      ) : (
        <section className="panel"><div className="list">{list.map((x) => (
          <button className="li click" key={x.id} style={LI} onClick={() => setOpen(x.id)}>
            <div className="main"><b style={{ overflowWrap: 'anywhere' }}>{x.name}</b>
              <span className="small muted">{x.barang.length} barang · titipan di toko {rp(x.nilai_stok)}</span></div>
            {d.can_pay && <span style={{ flex: 'none', textAlign: 'right' }}><b className="small">{rp(Math.max(0, Number(x.saldo)))}</b><br /><span className="small muted">{Number(x.saldo) > 0 ? 'harus disetor' : Number(x.saldo) < 0 ? `lebih setor ${rp(-x.saldo)}` : 'lunas'}</span></span>}
          </button>
        ))}</div></section>
      )}
      <span className="small muted">Barang titipan dijual di Kasir seperti barang lain. Laba toko = harga jual − harga titip. Barang yang rusak atau hilang di toko dihitung harus disetor juga.</span>
      {cur && <Detail x={cur} d={d} onClose={() => setOpen(null)} onTerima={() => { setOpen(null); setForm({ kind: 'terima', contact: cur.id }); }} onKembali={() => { setOpen(null); setForm({ kind: 'kembali', contact: cur.id }); }} onSetor={() => { setOpen(null); setPay(cur); }} />}
      {form && <DocForm kosId={kosId} m={m} init={form} penitip={list} onClose={() => setForm(null)} onSaved={(r, kind) => done(kind === 'terima' ? `${r.number} tersimpan · stok titipan bertambah` : `${r.number} tersimpan · barang dikembalikan ke penitip`)} />}
      {pay && <SetorSheet kosId={kosId} x={pay} onClose={() => setPay(null)} onSaved={() => done('Setoran ke penitip tercatat')} />}
    </div>
  );
}

function Detail({ x, d, onClose, onTerima, onKembali, onSetor }) {
  const saldo = Number(x.saldo) || 0;
  return (
    <Sheet title={x.name} onClose={onClose}>
      {d.can_pay && <div className="row between"><span>{saldo < 0 ? 'Lebih setor' : 'Harus disetor'}</span><b style={{ fontSize: 20 }}>{rp(Math.abs(saldo))}</b></div>}
      {d.can_pay && saldo > 0 && <button className="cta" onClick={onSetor}>Setor ke penitip</button>}
      <div className="row"><button onClick={onTerima}>+ Terima titipan</button><button onClick={onKembali} disabled={!x.barang.some((b) => Number(b.stock) > 0)}>Kembalikan barang</button></div>
      <span className="label">Barang titipan · terjual {tgl(d.from)} – {tgl(d.to)}</span>
      <div className="list">{x.barang.map((b) => (
        <div className="li" key={b.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <b className="small" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{b.name}</b>
          <dl className="kv">
            <dt>Sisa di toko</dt><dd>{angka(b.stock)} {b.base_unit}</dd>
            <dt>Harga titip → jual</dt><dd>{rp(b.cost)} → {b.price != null ? rp(b.price) : '—'}</dd>
            <dt>Diterima · dikembalikan</dt><dd>{angka(b.diterima)} · {angka(b.dikembalikan)}</dd>
            <dt>Terjual (seluruhnya)</dt><dd>{angka(b.terjual)} {b.base_unit}</dd>
            {Number(b.susut) !== 0 && <><dt>Rusak / hilang / selisih</dt><dd>{angka(b.susut)} {b.base_unit}</dd></>}
            <dt>Terjual periode ini</dt><dd>{angka(b.terjual_periode)} {b.base_unit} · setor {rp(b.setor_periode)}</dd>
            {b.omzet_periode != null && Number(b.omzet_periode) > 0 && <><dt>Penjualan periode ini</dt><dd>{rp(b.omzet_periode)}</dd></>}
          </dl>
        </div>
      ))}</div>
      {x.dokumen.length > 0 && <>
        <span className="label">Riwayat terima & kembali</span>
        <div className="list">{x.dokumen.map((k) => (
          <div className="li" key={k.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{k.number} · {k.kind === 'terima' ? 'Terima titipan' : 'Dikembalikan'}</b>
              <span className="small muted">{tgl(k.date)} · {(k.lines || []).map((l) => `${l.name} ${angka(l.qty)} ${l.unit}`).join(', ')}{k.note ? ` · ${k.note}` : ''}</span></div>
            <b className="small" style={{ flex: 'none' }}>{k.kind === 'kembali' ? '−' : ''}{rp(k.total)}</b>
          </div>
        ))}</div>
      </>}
      <span className="small muted">Riwayat setoran ada di Kontak › {x.name} dan Kas & kasbon › Utang supplier.</span>
    </Sheet>
  );
}

function DocForm({ kosId, m, init, penitip, onClose, onSaved }) {
  const terima = init.kind === 'terima';
  const [contact, setContact] = useState(init.contact || '');
  const [newSup, setNewSup] = useState('');
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const prod = new Map(m.products.map((p) => [p.id, p]));
  // terima: barang titipan penitip ini + barang baru yang belum punya riwayat stok; kembali: barang titipan penitip ini yang masih ada stoknya
  const pool = m.products.filter((p) => (terima ? (p.consign_contact_id ? p.consign_contact_id === contact : !m.moved.has(p.id) && Number(p.stock) === 0) : p.consign_contact_id === contact && Number(p.stock) > 0))
    .filter((p) => !lines.some((l) => l.product_id === p.id));
  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = (w.length ? pool.filter((p) => w.every((t) => p.name.toLowerCase().includes(t))) : pool).slice(0, 8);
  const add = (p) => { const us = unitsOf(p, m.units); const u = [...us].sort((a, b) => a.qty - b.qty)[0]; setLines([...lines, { product_id: p.id, unit: u.name, qty: '', price: p.consign_contact_id && Number(p.cost) > 0 ? angka(Math.round(Number(p.cost) * Number(u.qty))) : '' }]); setQ(''); };
  const set = (pid, patch) => setLines(lines.map((l) => (l.product_id === pid ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + (qtyNum(l.qty) || 0) * (terima ? parseRp(l.price) : Number(prod.get(l.product_id)?.cost || 0) * Number(unitsOf(prod.get(l.product_id), m.units).find((u) => u.name === l.unit)?.qty || 1)), 0);
  const save = async () => {
    if (!lines.length) return toast('Tambahkan barangnya dulu.');
    const bad = lines.find((l) => !(qtyNum(l.qty) > 0) || (terima && l.price.trim() === ''));
    if (bad) return toast(`Isi jumlah${terima ? ' dan harga titip' : ''} untuk ${prod.get(bad.product_id)?.name}.`);
    setBusy(true);
    try {
      let cid = contact || null;
      if (!cid && newSup.trim()) {
        const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'supplier', p_name: newSup, p_phone: null });
        if (error) throw error;
        cid = data; setContact(data);
      }
      if (!cid) { toast('Pilih penitip atau isi nama penitip baru.'); setBusy(false); return; }
      const { data, error } = await supabase.rpc('consign_doc_create', { p_id: id, p_kos: kosId, p_kind: init.kind, p_contact: cid,
        p_lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), price: terima ? parseRp(l.price) : null })), p_date: null, p_note: note });
      if (error) throw error;
      onSaved(data, init.kind);
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Sheet title={terima ? 'Terima titipan' : 'Kembalikan barang titipan'} onClose={onClose}>
      <span className="small muted">{terima ? 'Stok bertambah, tetapi belum ada utang: Anda baru berutang setelah barangnya terjual.' : 'Stok berkurang dan tidak perlu disetor. Hanya untuk barang yang benar-benar dibawa pulang penitip.'}</span>
      <Field label="Penitip"><select value={contact} onChange={(e) => { setContact(e.target.value); setLines([]); }} disabled={!terima && !!init.contact}>
        {terima && <option value="">— penitip baru —</option>}{(terima ? m.suppliers : penitip).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {terima && !contact && <Field label="Nama penitip baru" hint="Tersimpan sebagai supplier di Kontak."><input value={newSup} onChange={(e) => setNewSup(e.target.value)} placeholder="mis. Bu Ani (keripik)" /></Field>}
      {lines.map((l) => { const p = prod.get(l.product_id); const us = unitsOf(p, m.units); const u = us.find((z) => z.name === l.unit) || us[0]; const pr = parseRp(l.price); const jual = Number(u.price_retail) || 0;
        return (
          <div className="unitbox" key={l.product_id}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</b><button className="sm ghost" onClick={() => setLines(lines.filter((z) => z.product_id !== l.product_id))}>Hapus</button></div>
            {!terima && <span className="small muted">Stok {angka(p.stock)} {p.base_unit}</span>}
            <div className="row">
              <Field label="Jumlah"><input inputMode="decimal" value={l.qty} onChange={(e) => set(l.product_id, { qty: e.target.value })} placeholder="0" /></Field>
              <Field label="Satuan"><select value={l.unit} onChange={(e) => set(l.product_id, { unit: e.target.value })}>{us.map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}</select></Field>
              {terima && <Field label={`Harga titip per ${l.unit}`}><input inputMode="numeric" value={l.price} onChange={(e) => set(l.product_id, { price: e.target.value })} placeholder="yang disetor" /></Field>}
            </div>
            {terima && pr > 0 && jual > 0 && <span className="small" style={{ color: jual > pr ? 'var(--muted)' : 'var(--warn)' }}>{jual > pr ? `Harga jual ${rp(jual)} · laba toko ${rp(jual - pr)} per ${l.unit}` : `Harga jual ${rp(jual)} tidak lebih tinggi dari harga titip — toko tidak mendapat laba.`}</span>}
          </div>); })}
      {contact || terima ? <>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Cari barang" aria-label="Cari barang" />
        {found.length > 0 && <div className="list">{found.map((p) => <button key={p.id} className="li click" style={LI} onClick={() => add(p)}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span><span className="small muted" style={{ flex: 'none' }}>{p.consign_contact_id ? 'titipan' : 'barang baru'} · tambah ›</span></button>)}</div>}
        {found.length === 0 && terima && <p className="small muted" style={{ margin: 0 }}>Barang titipan baru dibuat dulu di <Link href="/barang?baru=1">Barang & stok</Link> dengan <b>stok awal 0</b> dan harga jualnya, lalu pilih di sini. Barang milik toko yang sudah punya riwayat stok tidak bisa dijadikan titipan.</p>}
      </> : null}
      <Field label="Catatan (opsional)"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row between"><b>{terima ? 'Nilai titipan' : 'Nilai dikembalikan'}</b><b>{rp(total)}</b></div>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : terima ? 'Simpan penerimaan' : 'Simpan pengembalian'}</button>
    </Sheet>
  );
}

function SetorSheet({ kosId, x, onClose, onSaved }) {
  const saldo = Math.max(0, Number(x.saldo) || 0);
  const [amount, setAmount] = useState(angka(saldo));
  const [account, setAccount] = useState('kas');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const n = parseRp(amount);
    if (!(n > 0)) return toast('Isi jumlah setoran.');
    setBusy(true);
    const { error } = await supabase.rpc('debt_pay', { p_id: id, p_kos: kosId, p_contact: x.id, p_amount: n, p_account: account, p_date: date, p_note: 'Setoran barang titipan' });
    setBusy(false);
    if (error) return toast(errMsg(error));
    onSaved();
  };
  return (
    <Sheet title={`Setor ke ${x.name}`} onClose={onClose}>
      <div className="row between"><span>Harus disetor</span><b>{rp(saldo)}</b></div>
      <Field label="Jumlah disetor" hint="Boleh sebagian."><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <div className="seg">{[['kas', 'Tunai (Kas)'], ['bank', 'Transfer (Bank)']].map(([k, l]) => <button key={k} className={account === k ? 'on' : ''} onClick={() => setAccount(k)} aria-pressed={account === k}>{l}</button>)}</div>
      <Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <span className="small muted">Bila penitip ini juga supplier belanja utang Anda, jumlah di atas sudah termasuk utang belanjanya.</span>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan setoran'}</button>
    </Sheet>
  );
}
