'use client';
import IsianTambahan from '@/components/IsianTambahan';
import { useBaru } from '@/lib/useBaru';
import { withApproval } from '@/lib/approval';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import CrmTimeline from '@/components/CrmTimeline';
import { rp, tgl, errMsg, waLink, angka, parseRp, today } from '@/lib/format';
import { canArea, moduleOn } from '@/lib/business';

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
  useBaru(() => setOpen({ kind: tab }));
  const [arsip, setArsip] = useState(false);
  const load = () => supabase.rpc('contacts_overview', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  useEffect(() => { setRows(null); load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/contacts_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const w = q.trim().toLowerCase();
  const archivedN = rows.filter((c) => c.kind === tab && c.archived_at).length;
  const shown = rows.filter((c) => c.kind === tab && Boolean(c.archived_at) === arsip && (!w || c.name.toLowerCase().includes(w) || (c.phone || '').includes(w)));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pelanggan & supplier</h2><PageHelp page="kontak" /></div><button className="primary" onClick={() => setOpen({ kind: tab })}>+ Tambah</button></div>
      {fin && <div className="seg">{['pelanggan', 'supplier'].map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{KIND[k]} ({rows.filter((c) => c.kind === k && !c.archived_at).length})</button>)}</div>}
      {(archivedN > 0 || arsip) && <button className="sm ghost" onClick={() => setArsip(!arsip)}>{arsip ? '← Kembali ke daftar aktif' : `Lihat arsip (${archivedN})`}</button>}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor" aria-label="Cari kontak" />
      {shown.length === 0 && arsip ? <Empty title="Arsip kosong" /> : shown.length === 0 ? <Empty title={`Belum ada ${KIND[tab].toLowerCase()}`} text={tab === 'pelanggan' ? 'Pelanggan juga bisa ditambahkan dari Kasir saat memilih Kasbon.' : 'Supplier juga bisa ditambahkan dari Belanja.'} /> : (
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
  const del = async () => {
    const used = Number(c.trx) > 0;
    if (!window.confirm(used ? `Hapus ${c.name}?\nKarena sudah punya riwayat transaksi, kontak ini akan DIARSIPKAN: hilang dari daftar dan pilihan, tetapi riwayat & laporan tetap utuh. Bisa dipulihkan.` : `Hapus ${c.name} permanen?`)) return;
    if (await withApproval(() => supabase.rpc('contact_delete', { p_id: c.id }), used ? 'Kontak diarsipkan' : 'Kontak dihapus',
      { kos: kosId, action: 'hapus_kontak', payload: { contact_id: c.id } })) onSaved();
  };
  const restore = async () => { if (await run(() => supabase.rpc('contact_restore', { p_id: c.id }), 'Kontak dipulihkan', errMsg)) onSaved(); };
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
      {!isNew && (c.archived_at
        ? <button onClick={restore}>Pulihkan dari arsip</button>
        : <button className="ghost danger" onClick={del}>Hapus {c.kind === 'supplier' ? 'supplier' : 'pelanggan'}</button>)}
      {!isNew && c.kind === 'pelanggan' && !c.archived_at && kos.business_type === 'retail' && moduleOn(kos, 'u_kredit') && <SyaratPelanggan c={c} kosId={kosId} canEdit={fin} />}
      {!isNew && <IsianTambahan entity="contact" id={c.id} area="sell,stock,finance" />}
      {!isNew && c.kind === 'pelanggan' && !c.archived_at && moduleOn(kos, 'u_crm') && canArea(kos, 'sell,rent') && <>
        <h3 style={{ margin: '8px 0 0' }}>Catatan & tindak lanjut</h3>
        <CrmTimeline kosId={kosId} contact={c.id} />
      </>}
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

// Syarat pelanggan grosir: batas kredit, tempo, daftar harga khusus, alamat kirim, NPWP + umur piutang (server: customer_credit, customer_terms_set)
function SyaratPelanggan({ c, kosId, canEdit }) {
  const [cr, setCr] = useState(null);
  const [lists, setLists] = useState([]);
  const [open, setOpen] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    supabase.rpc('customer_credit', { p_contact: c.id }).then(({ data }) => {
      setCr(data || null);
      if (data) setF({ credit_limit: data.limit != null ? angka(data.limit) : '', terms_days: data.terms_days != null ? String(data.terms_days) : '', price_list_id: data.price_list_id || '', address: data.address || '', npwp: data.npwp || '' });
    });
    supabase.rpc('receivable_open', { p_kos: kosId, p_contact: c.id }).then(({ data }) => setOpen(data || []));
  };
  useEffect(() => {
    load();
    supabase.from('price_lists').select('id,name').eq('kos_id', kosId).is('archived_at', null).order('name').then(({ data }) => setLists(data || []));
  }, [c.id]);
  if (!cr || !f) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('customer_terms_set', { p_contact: c.id, p: { ...f, credit_limit: f.credit_limit.trim() === '' ? null : parseRp(f.credit_limit), terms_days: f.terms_days === '' ? null : f.terms_days } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Syarat pelanggan disimpan'); load();
  };
  const t0 = today();
  return (
    <section className="panel" style={{ gap: 8 }}>
      <span className="label">Syarat pelanggan (grosir)</span>
      <div className="row">
        <Field label="Batas kredit" hint="kosong = tanpa batas"><input inputMode="numeric" value={f.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} disabled={!canEdit} placeholder="mis. 5jt" /></Field>
        <Field label="Tempo bayar (hari)"><input inputMode="numeric" value={f.terms_days} onChange={(e) => set('terms_days', e.target.value.replace(/\D/g, ''))} disabled={!canEdit} placeholder="mis. 14" /></Field>
      </div>
      <Field label="Daftar harga khusus"><select value={f.price_list_id} onChange={(e) => set('price_list_id', e.target.value)} disabled={!canEdit}><option value="">— harga biasa (grosir/eceran) —</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Alamat kirim"><input value={f.address} maxLength={300} onChange={(e) => set('address', e.target.value)} disabled={!canEdit} /></Field>
      <Field label="NPWP (opsional)"><input value={f.npwp} maxLength={30} onChange={(e) => set('npwp', e.target.value)} disabled={!canEdit} /></Field>
      {canEdit ? <button className="primary" disabled={busy} onClick={save}>Simpan syarat</button> : <span className="small muted">Hanya pemilik/bagian keuangan yang bisa mengubah syarat pelanggan.</span>}
      <span className="small">Piutang {rp(cr.balance)}{Number(cr.open_orders) > 0 ? ` · pesanan berjalan ${rp(cr.open_orders)}` : ''}{cr.limit != null ? ` · sisa batas ${rp(cr.available)}` : ''}</span>
      {open.length > 0 && <div className="list">{open.map((r) => (
        <div className="li" key={r.sale_id}><div className="main"><span className="small"><Link href={`/struk/${r.sale_id}`}>{r.number}</Link> · {tgl(r.sale_date)}</span>
          <span className="small" style={{ color: r.due_date < t0 ? 'var(--bad)' : undefined }}>{r.due_date < t0 ? `lewat tempo ${Math.round((new Date(t0) - new Date(r.due_date)) / 864e5)} hari` : `jatuh tempo ${tgl(r.due_date)}`}</span></div>
          <b className="small">{rp(r.open_amount)}</b></div>
      ))}</div>}
      {open.length > 0 && <span className="small muted">Pembayaran melunasi faktur terlama lebih dulu.</span>}
    </section>
  );
}
