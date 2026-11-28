'use client';
// Pembelian & supplier properti — HYBRID di atas mesin yang sudah ada:
//   Persediaan (barang habis pakai berstok) → menu Belanja (purchases) + Barang; Biaya langsung & Aset tetap → purchase_direct
//   (expenses + contact_id, asset_save). Rekap per supplier = supplier_spend.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader, DataTable } from '@/components/Page';
import { Loading, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import { rp, today, errMsg, parseRp } from '@/lib/format';
import { pathAllowed } from '@/lib/business';
import styles from './pembelian.module.css';

const addDays = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const PER = [['30', '30 hari'], ['90', '3 bulan'], ['365', '12 bulan']];

export default function Pembelian() {
  const { kos, kosId, ver, bump } = useKos();
  const [per, setPer] = useState('30');
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  useEffect(() => {
    let on = true; setRows(null);
    supabase.rpc('supplier_spend', { p_kos: kosId, p_from: addDays(today(), -Number(per) + 1), p_to: today() }).then(({ data, error }) => on && setRows(error ? { error: errMsg(error) } : data || []));
    return () => { on = false; };
  }, [kosId, ver, per]);
  const stock = pathAllowed(kos, '/belanja');
  return <div className={styles.page}>
    <PageHeader title="Pembelian & supplier" help={<PageHelp page="pembelian" />} desc="Catat belanja sesuai jenisnya — semua tetap masuk kas, laporan, dan pembukuan yang sama." />
    <div className={styles.ways}>
      <article className="panel"><b>Persediaan</b><span className="small muted">Barang habis pakai yang disimpan & dipakai bertahap (sabun, tisu, lampu cadangan, gas). Stok & nilai persediaan tercatat; saat dipakai jadi biaya.</span>
        {stock ? <div className="row"><Link className="primary" href="/belanja?baru=1">Belanja persediaan</Link><Link href="/barang">Daftar persediaan</Link></div>
          : <span className="small muted">Aktifkan modul Belanja di Konfigurasi › Modul.</span>}</article>
      <article className="panel"><b>Biaya langsung</b><span className="small muted">Jasa & barang yang langsung habis (servis pompa, cat ulang kecil, kebersihan). Langsung jadi pengeluaran dengan nama supplier.</span>
        <button className="primary" onClick={() => setForm('biaya')}>Catat biaya langsung</button></article>
      <article className="panel"><b>Aset tetap</b><span className="small muted">Barang tahan lama (AC, kasur, water heater, renovasi besar). Dicatat sebagai aset dan disusutkan tiap bulan.</span>
        <button className="primary" onClick={() => setForm('aset')}>Catat aset tetap</button></article>
    </div>
    <section className="panel">
      <div className="row between"><h3 style={{ margin: 0 }}>Belanja per supplier</h3>
        <div className="seg">{PER.map(([k, l]) => <button key={k} className={per === k ? 'on' : ''} onClick={() => setPer(k)}>{l}</button>)}</div></div>
      {!rows ? <Loading /> : rows.error ? <div className="notice bad">{rows.error}</div> : rows.length === 0 ? <p className="muted small">Belum ada pembelian bersupplier pada periode ini.</p> :
        <DataTable rows={rows} pageSize={10} caption="Belanja per supplier" columns={[
          { key: 'name', label: 'Supplier', main: true, render: (x) => <b>{x.name}</b> },
          { key: 'p', label: 'Persediaan', align: 'right', render: (x) => rp(x.persediaan) },
          { key: 'b', label: 'Biaya langsung', align: 'right', render: (x) => rp(x.biaya) },
          { key: 'a', label: 'Aset tetap', align: 'right', hide: 'tablet', render: (x) => rp(x.aset) },
          { key: 't', label: 'Total', align: 'right', render: (x) => <b>{rp(Number(x.persediaan) + Number(x.biaya) + Number(x.aset))}</b> },
        ]} />}
      {pathAllowed(kos, '/kontak') && <Link href="/kontak" className="small">Kelola supplier →</Link>}
    </section>
    {form && <DirectForm kos={kos} kosId={kosId} mode={form} onClose={() => setForm(null)} onDone={() => { setForm(null); bump(); }} />}
  </div>;
}

function DirectForm({ kos, kosId, mode, onClose, onDone }) {
  const [sup, setSup] = useState(null);
  const [cats, setCats] = useState([]);
  const [p, setP] = useState({ contact_id: '', newSup: '', date: today(), amount: '', account: 'kas', category_id: '', description: '', name: '', life_months: '60', branch_id: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    supabase.from('contacts').select('id,name').eq('kos_id', kosId).eq('kind', 'supplier').is('archived_at', null).order('name').then(({ data }) => setSup(data || []));
    supabase.from('expense_categories').select('id,name,kind').eq('kos_id', kosId).order('name').then(({ data }) => setCats((data || []).filter((c) => c.kind === 'operasional')));
  }, [kosId]);
  const locs = (kos?.locs?.list || []).filter((b) => b.kind === 'cabang');
  const save = async () => {
    const amount = parseRp(p.amount);
    if (!(amount > 0)) return toast('Isi nilai pembelian.');
    if (mode === 'aset' && p.name.trim().length < 2) return toast('Isi nama aset.');
    setBusy(true);
    const ok = await run(async () => {
      let contact = p.contact_id;
      if (contact === 'baru') {
        const r = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'supplier', p_name: p.newSup.trim(), p_phone: null });
        if (r.error) return r;
        contact = r.data;
      }
      return supabase.rpc('purchase_direct', { p_kos: kosId, p: { mode, contact_id: contact || null, date: p.date, amount, account: p.account, category_id: p.category_id || null,
        description: p.description, name: p.name, life_months: p.life_months, branch_id: p.branch_id || null } });
    }, mode === 'aset' ? 'Aset tetap dicatat' : 'Biaya dicatat', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return <Sheet title={mode === 'aset' ? 'Catat aset tetap' : 'Catat biaya langsung'} onClose={onClose}>
    <Field label="Supplier (opsional)"><select value={p.contact_id} onChange={(e) => set('contact_id', e.target.value)}><option value="">Tanpa supplier</option>
      {(sup || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="baru">+ Supplier baru…</option></select></Field>
    {p.contact_id === 'baru' && <Field label="Nama supplier baru"><input value={p.newSup} maxLength={80} onChange={(e) => set('newSup', e.target.value)} /></Field>}
    {mode === 'aset' && <Field label="Nama aset"><input value={p.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="mis. AC kamar A05" /></Field>}
    <div className="row">
      <Field label="Tanggal"><input type="date" value={p.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Field>
      <Field label="Nilai"><input inputMode="numeric" value={p.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
    </div>
    <div className="seg">{[['kas', 'Dibayar dari kas'], ['bank', 'Dari bank']].map(([k, l]) => <button key={k} type="button" className={p.account === k ? 'on' : ''} onClick={() => set('account', k)}>{l}</button>)}</div>
    {mode === 'biaya' ? <Field label="Kategori pengeluaran"><select value={p.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Tanpa kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      : <Field label="Umur manfaat (bulan)" hint="Dipakai menghitung penyusutan bulanan"><input inputMode="numeric" value={p.life_months} onChange={(e) => set('life_months', e.target.value.replace(/\D/g, ''))} /></Field>}
    {locs.length > 1 && <Field label="Properti / lokasi"><select value={p.branch_id} onChange={(e) => set('branch_id', e.target.value)}><option value="">Lokasi kerja saya</option>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
    <Field label="Keterangan"><input value={p.description} maxLength={200} onChange={(e) => set('description', e.target.value)} /></Field>
    <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
  </Sheet>;
}
