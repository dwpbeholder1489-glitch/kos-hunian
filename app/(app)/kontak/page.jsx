'use client';
import IsianTambahan from '@/components/IsianTambahan';
import KontakBisnis from '@/components/KontakBisnis';
import { useBaru } from '@/lib/useBaru';
import { withApproval } from '@/lib/approval';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './kontak.module.css';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { DataTable, FilterToolbar } from '@/components/Page';
import { SheetEmpty } from '@/components/SmartDetailSheet';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import CrmTimeline from '@/components/CrmTimeline';
import { rp, tgl, errMsg, waLink, angka, parseRp, today } from '@/lib/format';
import { diffText } from '@/lib/riwayat';
import { canArea, moduleOn } from '@/lib/business';

const KIND = { pelanggan: 'Pelanggan', supplier: 'Supplier' };
const TIPE = { umum: 'Umum', reseller: 'Reseller', distributor: 'Distributor', institusi: 'Institusi' };
const phoneKey = (phone) => String(phone || '').replace(/\D/g, '').replace(/^(62|0)/, '');
const initials = (name) => name.trim().split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const ST = { batal: 'Batal', dipesan: 'Dipesan', sebagian: 'Sebagian' };

// Pelanggan & supplier: daftar, saldo kasbon/utang, riwayat transaksi, ubah nama & nomor
export default function Kontak() {
  const { kosId, kos, ver, user, bump } = useKos();
  if (!kosId || !kos || !user) return <Loading />;
  const fin = canArea(kos, 'finance');
  return <ContactsWorkspace key={`${kosId}:${user.id}:${fin}`} {...{ kosId, kos, ver, fin, bump }} />;
}

function ContactsWorkspace({ kosId, kos, ver, fin, bump }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState(fin ? 'pelanggan' : 'supplier');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'supplier') setTab('supplier'); }, []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  useBaru(() => setOpen({ kind: !fin || new URLSearchParams(window.location.search).get('tab') === 'supplier' ? 'supplier' : 'pelanggan' }));
  const viewedLink = useRef(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('kontak');
    if (!id || viewedLink.current === id || !rows) return;
    const contact = rows.find((row) => row.id === id && (fin || row.kind === 'supplier'));
    if (!contact) return;
    viewedLink.current = id;
    setTab(contact.kind);
    setArsip(Boolean(contact.archived_at));
    setOpen(contact);
  }, [rows, fin]);
  const [arsip, setArsip] = useState(false);
  const [filter, setFilter] = useState('all');
  const [menu, setMenu] = useState(null);
  const load = () => supabase.rpc('contacts_overview', { p_kos: kosId }).then(({ data, error }) => {
    if (error) return setErr(errMsg(error));
    setErr(null);
    setRows(data);
  });
  useEffect(() => { setRows(null); load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/contacts_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const w = q.trim().toLowerCase();
  const phoneSearch = /^[+\d\s().-]+$/.test(w) ? phoneKey(w) : '';
  const counts = { pelanggan: 0, supplier: 0 };
  const groups = new Map();
  for (const row of rows) {
    if (row.archived_at) continue;
    counts[row.kind]++;
    const key = phoneKey(row.phone);
    if (row.kind === 'pelanggan' && key) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.map((row) => row.id)));
  const inTab = rows.filter((row) => row.kind === tab);
  const archivedN = inTab.filter((row) => row.archived_at).length;
  const balance = inTab.reduce((sum, row) => sum + Math.max(0, Number(row.balance) || 0), 0);
  const transactions = inTab.reduce((sum, row) => sum + Number(row.trx || 0), 0);
  const shown = inTab.filter((row) => Boolean(row.archived_at) === arsip &&
    (!w || row.name.toLowerCase().includes(w) || (row.phone || '').includes(w) || (phoneSearch && phoneKey(row.phone).includes(phoneSearch))) &&
    (filter !== 'phone' || phoneKey(row.phone)) &&
    (filter !== 'balance' || Number(row.balance) > 0) &&
    (filter !== 'duplicate' || duplicateIds.has(row.id)));
  const changeTab = (kind) => { setTab(kind); setArsip(false); setFilter('all'); };
  const viewDuplicates = () => { changeTab('pelanggan'); setQ(''); setFilter('duplicate'); setMenu(null); };
  const showWa = (row) => phoneKey(row.phone) ? <a className={styles.whatsapp} href={waLink(row.phone, '')} target="_blank" rel="noreferrer"
    aria-label={`WhatsApp ${row.name}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>WhatsApp</a> : <span className="muted">—</span>;
  const balanceLabel = tab === 'pelanggan' ? 'Total Kasbon' : 'Total Utang';
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Customer & Supplier Management Center">
        <div className={styles.heroCopy}>
          <h1>Pelanggan &amp; Supplier</h1>
          <p>Kelola data kontak, sisa kasbon dan utang, serta riwayat transaksi.</p>
          <PageHelp page="kontak" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Kontak <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/pelanggan-supplier.webp" alt="" fill sizes="(max-width: 600px) 36vw, 300px" priority /></span>
      </section>
      <div className={styles.actions}>
        {fin && <button onClick={() => setOpen({ kind: 'pelanggan' })}><NavIcon name="/penghuni" />＋ Pelanggan</button>}
        <button onClick={() => setOpen({ kind: 'supplier' })}><NavIcon name="/barang" />＋ Supplier</button>
        <button onClick={() => setMenu('more')}><NavIcon name="more" />Lainnya</button>
      </div>
      {fin && <div className={styles.tabs} aria-label="Jenis kontak">{['pelanggan', 'supplier'].map((kind) => (
        <button key={kind} onClick={() => changeTab(kind)} aria-pressed={tab === kind}>{KIND[kind]} ({angka(counts[kind])})</button>
      ))}</div>}
      <div className={styles.metrics}>
        <ContactMetric icon={tab === 'pelanggan' ? '/penghuni' : '/barang'} label={`Total ${KIND[tab]}`} value={angka(counts[tab])} note="Kontak aktif" />
        {fin && <ContactMetric icon="wallet" label={balanceLabel} value={rp(balance)} note="Termasuk saldo kontak arsip" />}
        <ContactMetric icon="/penjualan" label="Total Transaksi" value={angka(transactions)} note="Termasuk kontak arsip" />
      </div>
      {fin && tab === 'pelanggan' && duplicateGroups.length > 0 && <aside className={styles.duplicateNotice}>
        <NavIcon name="info" /><div><b>Kemungkinan kontak ganda</b><p>{angka(duplicateGroups.length)} nomor dipakai oleh lebih dari satu pelanggan aktif.</p></div>
        <button onClick={() => setMenu('duplicates')}>Tinjau Duplikasi</button>
      </aside>}
      {(archivedN > 0 || arsip) && <button className={styles.archive} onClick={() => { setArsip(!arsip); setFilter('all'); }}>{arsip ? 'Kembali ke daftar aktif' : `Lihat arsip (${angka(archivedN)})`}</button>}
      <div className={styles.toolbar}>
        <FilterToolbar q={q} onQ={setQ} placeholder="Cari nama atau nomor" />
        <button onClick={() => setMenu('filter')}><NavIcon name="filter" size={17} />{filter === 'all' ? 'Filter' : 'Filter Aktif'}</button>
      </div>
      {shown.length === 0 ? <Empty title={w || filter !== 'all' ? 'Tidak ada kontak yang cocok' : arsip ? 'Arsip kosong' : `Belum ada ${KIND[tab].toLowerCase()}`} /> : (
        <div className={styles.results}><DataTable rows={shown} caption={KIND[tab]} onRow={setOpen} rowLabel={(row) => row.name} initialSort={null}
          columns={[
            { key: 'name', label: 'Nama', sort: (row) => row.name.toLowerCase(), render: (row) => <ContactName row={row} duplicate={duplicateIds.has(row.id)} /> },
            { key: 'phone', label: 'Nomor HP', render: (row) => row.phone || <span className="muted">—</span> },
            { key: 'trx', label: 'Transaksi', align: 'right', sort: (row) => Number(row.trx) || 0, render: (row) => angka(row.trx || 0) },
            { key: 'last', label: 'Terakhir', hide: 'tablet', sort: (row) => row.last_at || '', render: (row) => row.last_at ? tgl(String(row.last_at).slice(0, 10)) : '—' },
            ...(fin ? [{ key: 'bal', label: tab === 'pelanggan' ? 'Sisa kasbon' : 'Sisa utang', align: 'right', sort: (row) => Number(row.balance) || 0, render: (row) => Number(row.balance) > 0 ? <span className="chip bad">{rp(row.balance)}</span> : <span className="muted">—</span> }] : []),
            { key: 'wa', label: 'Akses Cepat', hide: 'tablet', render: showWa },
          ]}
          card={(row) => <div className={styles.card}>
            <span className={styles.avatar}>{initials(row.name)}</span>
            <span className={styles.cardBody}>
              <b>{row.name}</b><small>{row.phone || 'Tanpa nomor'}</small>
              <small>{angka(row.trx || 0)} transaksi{row.last_at ? ` · terakhir ${tgl(String(row.last_at).slice(0, 10))}` : ''}</small>
              {duplicateIds.has(row.id) && <span className="chip gold">Nomor sama</span>}
              {Number(row.balance) > 0 && <span className="chip bad">{tab === 'pelanggan' ? 'Kasbon' : 'Utang'} {rp(row.balance)}</span>}
            </span>
            <span className={styles.cardEnd}><span className="chip good">{KIND[tab]}</span><NavIcon name="next" size={15} /></span>
          </div>} /></div>
      )}
      <aside className={styles.notice}><NavIcon name="info" /><p><b>Tip.</b> Simpan data pelanggan dan supplier untuk memudahkan pencatatan kasbon, utang, dan riwayat transaksi.</p></aside>
      {menu === 'filter' && <Sheet title="Filter Kontak" onClose={() => setMenu(null)}>
        <Field label="Tampilkan"><select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Semua kontak</option><option value="phone">Punya nomor WhatsApp</option>
          {fin && <option value="balance">Masih punya saldo</option>}
          {fin && tab === 'pelanggan' && !arsip && <option value="duplicate">Kemungkinan duplikat</option>}
        </select></Field>
        <button className="primary" onClick={() => setMenu(null)}>Tampilkan Hasil</button>
      </Sheet>}
      {menu === 'more' && <Sheet title="Lainnya" onClose={() => setMenu(null)}>
        {fin && <button onClick={() => setMenu('duplicates')}>Tinjau Duplikasi Pelanggan</button>}
        <button onClick={() => { setArsip(!arsip); setFilter('all'); setMenu(null); }}>{arsip ? 'Kembali ke daftar aktif' : 'Lihat Arsip Kontak'}</button>
      </Sheet>}
      {menu === 'duplicates' && fin && <Sheet title="Kemungkinan Duplikasi Pelanggan" onClose={() => setMenu(null)}>
        {duplicateGroups.length > 0 && <p>Nomor yang sama dapat dipakai oleh lebih dari satu orang. Periksa detail identitas, riwayat, dan saldo setiap kontak.</p>}
        {duplicateGroups.length ? duplicateGroups.map((group) => <section className="panel" key={group[0].id}>
          <b>{group[0].phone}</b>
          {group.map((row) => <button key={row.id} onClick={() => { setMenu(null); setOpen(row); }}>{row.name} · {angka(row.trx || 0)} transaksi · {rp(row.balance)}</button>)}
        </section>) : <SheetEmpty icon="/penghuni" title="Tidak ada nomor yang sama"
          text="Kontak pelanggan aktif tidak memiliki nomor WhatsApp yang tercatat lebih dari sekali.">
          <button className="primary" onClick={() => setMenu(null)}>Kembali ke daftar kontak</button>
        </SheetEmpty>}
        {duplicateGroups.length > 0 && <button onClick={viewDuplicates}>Tampilkan di Daftar</button>}
        {duplicateGroups.length > 0 && <p className="small muted">Peninjauan hanya menampilkan kontak dan saldo masing-masing.</p>}
      </Sheet>}
      {open && <Detail c={open} fin={fin} kosId={kosId} kos={kos} onTasksChanged={bump} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} onReload={load} />}
    </div>
  );
}

function ContactMetric({ icon, label, value, note }) {
  return <article className={styles.metric}><NavIcon name={icon} /><div><b>{label}</b><strong>{value}</strong><small>{note}</small></div></article>;
}

function ContactName({ row, duplicate }) {
  return <div className={styles.name}><span className={styles.avatar}>{initials(row.name)}</span>
    <span><b>{row.name}</b>{row.tipe && <span className="chip">{TIPE[row.tipe]}</span>}
      {duplicate && <span className="chip gold">Nomor sama</span>}</span>
  </div>;
}

function Detail({ c, fin, kosId, kos, onTasksChanged, onClose, onSaved, onReload }) {
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
      {!isNew && phoneKey(c.phone) && <a className={styles.whatsapp} href={waLink(c.phone, '')} target="_blank" rel="noreferrer">Buka WhatsApp</a>}
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
      {!isNew && c.kind === 'pelanggan' && !c.archived_at && kos.business_type === 'retail' && moduleOn(kos, 'u_kredit') && <SyaratPelanggan c={c} kosId={kosId} canEdit={fin} onReload={onReload} />}
      {!isNew && fin && !c.archived_at && <KontakBisnis contactId={c.id} kosId={kosId} />}
      {!isNew && <IsianTambahan entity="contact" id={c.id} area="sell,stock,finance" />}
      {!isNew && c.kind === 'pelanggan' && !c.archived_at && moduleOn(kos, 'u_crm') && canArea(kos, 'sell,rent') && <>
        <h3 style={{ margin: '8px 0 0' }}>Catatan & tindak lanjut</h3>
        <CrmTimeline kosId={kosId} contact={c.id} onTasksChanged={onTasksChanged} />
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
function SyaratPelanggan({ c, kosId, canEdit, onReload }) {
  const [cr, setCr] = useState(null);
  const [lists, setLists] = useState([]);
  const [open, setOpen] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  // Tipe pelanggan & sales yang memegang (server: customer_profile_set; sales harus anggota bisnis)
  const [tipe, setTipe] = useState(c.tipe || '');
  const [sales, setSales] = useState(c.sales_user || '');
  const [names, setNames] = useState({});
  const [hist, setHist] = useState([]);
  // Riwayat syarat & profil pelanggan (sebelum → sesudah). config_history hanya terbaca pemilik/pengelola; selain itu kosong.
  const loadHist = () => supabase.from('config_history').select('*').eq('kos_id', kosId).in('action', ['syarat_pelanggan', 'profil_pelanggan'])
    .in('target', [`Syarat pelanggan ${c.name}`, `Profil pelanggan ${c.name}`]).order('created_at', { ascending: false }).limit(10).then(({ data }) => setHist(data || []));
  useEffect(() => { loadHist(); }, [c.id]);
  useEffect(() => { supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);
  const saveProfile = async () => {
    const { error } = await supabase.rpc('customer_profile_set', { p_contact: c.id, p_tipe: tipe || null, p_sales: sales || null });
    if (error) return toast(errMsg(error));
    toast('Tipe & sales disimpan'); onReload?.(); loadHist();
  };
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
    toast('Syarat pelanggan disimpan'); load(); loadHist();
  };
  const t0 = today();
  return (
    <section className="panel" style={{ gap: 8 }}>
      <span className="label">Syarat pelanggan (grosir)</span>
      <div className="row">
        <Field label="Tipe pelanggan"><select value={tipe} onChange={(e) => setTipe(e.target.value)} disabled={!canEdit}><option value="">— belum diatur —</option>{[['umum', 'Umum'], ['reseller', 'Reseller'], ['distributor', 'Distributor'], ['institusi', 'Institusi / kantor']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Sales yang memegang"><select value={sales} onChange={(e) => setSales(e.target.value)} disabled={!canEdit}><option value="">— tidak ada —</option>{Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
      </div>
      {canEdit && <button className="sm" onClick={saveProfile} style={{ alignSelf: 'flex-start' }}>Simpan tipe & sales</button>}
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
      {hist.filter((h) => diffText(h)).length > 0 && <>
        <span className="label" style={{ marginTop: 6 }}>Riwayat syarat</span>
        <div className="list">{hist.filter((h) => diffText(h)).map((h) => (
          <div className="li" key={h.id} style={{ alignItems: 'flex-start' }}><div className="main" style={{ minWidth: 0 }}>
            <span className="small" style={{ overflowWrap: 'anywhere' }}>{diffText(h)}</span>
            <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{tgl(String(h.created_at).slice(0, 10))} · {h.actor || 'sistem'}</span></div></div>
        ))}</div>
      </>}
    </section>
  );
}
