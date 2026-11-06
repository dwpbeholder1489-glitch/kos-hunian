'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { rp, tgl, errMsg, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';

const KIND = { pelanggan: 'Pelanggan', supplier: 'Supplier' };
const ST = { batal: 'Batal', dipesan: 'Dipesan', sebagian: 'Sebagian' };

// Pelanggan & supplier: daftar, saldo kasbon/utang, riwayat transaksi, ubah nama & nomor
export default function Kontak() {
  const { kosId, kos, ver } = useKos();
  const fin = canArea(kos, 'finance');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState(fin ? 'pelanggan' : 'supplier');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const load = () => supabase.rpc('contacts_overview', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  useEffect(() => { setRows(null); load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/contacts_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const w = q.trim().toLowerCase();
  const shown = rows.filter((c) => c.kind === tab && (!w || c.name.toLowerCase().includes(w) || (c.phone || '').includes(w)));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pelanggan & supplier</h2><PageHelp page="kontak" /></div><button className="primary" onClick={() => setOpen({ kind: tab })}>+ Tambah</button></div>
      {fin && <div className="seg">{['pelanggan', 'supplier'].map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{KIND[k]} ({rows.filter((c) => c.kind === k).length})</button>)}</div>}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor" aria-label="Cari kontak" />
      {shown.length === 0 ? <Empty title={`Belum ada ${KIND[tab].toLowerCase()}`} text={tab === 'pelanggan' ? 'Pelanggan juga bisa ditambahkan dari Kasir saat memilih Kasbon.' : 'Supplier juga bisa ditambahkan dari Belanja.'} /> : (
        <section className="panel"><div className="list">{shown.map((c) => (
          <button key={c.id} className="li click" onClick={() => setOpen(c)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b>{c.name}</b><span className="small muted">{c.phone || 'tanpa nomor'} · {c.trx} transaksi{c.last_at ? ` · terakhir ${tgl(String(c.last_at).slice(0, 10))}` : ''}</span></div>
            {c.balance != null && Number(c.balance) > 0 && <span className="chip bad">{tab === 'pelanggan' ? 'Kasbon' : 'Utang'} {rp(c.balance)}</span>}
          </button>
        ))}</div></section>
      )}
      {open && <Detail c={open} fin={fin} kosId={kosId} kos={kos} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Detail({ c, fin, kosId, kos, onClose, onSaved }) {
  const isNew = !c.id;
  const [name, setName] = useState(c.name || '');
  const [phone, setPhone] = useState(c.phone || '');
  const [hist, setHist] = useState(isNew ? [] : null);
  useEffect(() => { if (!isNew && (fin || c.kind === 'supplier')) supabase.rpc('contact_history', { p_contact: c.id }).then(({ data }) => setHist(data || [])); }, [c.id]);
  const save = async () => {
    if (await run(() => supabase.rpc('contact_save', { p_kos: kosId, p_id: c.id || null, p_kind: c.kind, p_name: name, p_phone: phone }), isNew ? 'Kontak ditambahkan' : 'Kontak disimpan', errMsg)) onSaved();
  };
  const bal = Number(c.balance) || 0;
  return (
    <Sheet title={isNew ? `${KIND[c.kind]} baru` : c.name} onClose={onClose}>
      {!isNew && c.balance != null && <div className={'notice' + (bal > 0 ? ' bad' : ' good')}>{bal > 0 ? `${c.kind === 'pelanggan' ? 'Sisa kasbon' : 'Sisa utang ke supplier'}: ${rp(bal)}` : 'Tidak ada sisa kasbon/utang.'}</div>}
      {!isNew && bal > 0 && <div className="row">
        <Link href="/kas"><button className="sm primary">{c.kind === 'pelanggan' ? 'Terima bayar di Kas' : 'Bayar di Kas'}</button></Link>
        {c.kind === 'pelanggan' && c.phone && <a href={waLink(c.phone, `Halo ${c.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(bal)}. Terima kasih.`)} target="_blank" rel="noreferrer"><button className="sm">Ingatkan WA</button></a>}
      </div>}
      <Field label="Nama"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" /></Field>
      <button className="primary" onClick={save} disabled={!name.trim()}>Simpan</button>
      {!isNew && hist && <>
        <h3 style={{ margin: '8px 0 0' }}>Riwayat</h3>
        {hist.length === 0 ? <span className="small muted">Belum ada transaksi.</span> : <div className="list">{hist.map((h, i) => (
          <div className="li" key={i}>
            <div className="main"><span className="small">{h.sale_id ? <Link href={`/struk/${h.sale_id}`}>{h.what}</Link> : h.what}</span><span className="small muted">{tgl(h.date)}{ST[h.status] ? ` · ${ST[h.status]}` : ''}</span></div>
            <b className="small" style={{ textDecoration: h.status === 'batal' ? 'line-through' : 'none' }}>{rp(h.amount)}</b>
          </div>
        ))}</div>}
      </>}
    </Sheet>
  );
}
