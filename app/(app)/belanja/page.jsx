'use client';
import { withApproval } from '@/lib/approval';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './belanja.module.css';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { DataTable } from '@/components/Page';
import LokasiBar from '@/components/LokasiBar';
import { canArea, multiLoc, pathAllowed } from '@/lib/business';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg, bulan, monthEnd } from '@/lib/format';
import { qtyNum, uid } from '@/lib/retail';
import { Permintaan, Faktur, FakturSheet, KinerjaSupplier } from '@/components/Pengadaan';
import RestockGuidance from './RestockGuidance';

import { BUY, loadPurchaseCatalog, purchasePath, storePurchasePrefill } from './purchase-data';
const REFUND = { potong_utang: 'Potong utang ke supplier', tunai: 'Uang kembali tunai', transfer: 'Uang kembali transfer' };
const TABS = [['belanja', 'Belanja'], ['permintaan', 'Permintaan'], ['faktur', 'Faktur supplier'], ['supplier', 'Kinerja supplier']];
const ST = { dipesan: ['Dipesan', 'gold'], sebagian: ['Diterima sebagian', 'info'], batal: ['Batal', 'void'] };

async function readAll(makeQuery, signal) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await makeQuery().range(start, start + 499).abortSignal(signal);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

// Belanja ke supplier: menambah stok dan menghitung ulang harga modal rata-rata
export default function Belanja() {
  const { kosId, ver, kos } = useKos();
  if (!kosId || !kos) return <Loading />;
  return <BelanjaWorkspace key={kosId} kosId={kosId} kos={kos} ver={ver} />;
}

function BelanjaWorkspace({ kosId, kos, ver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [saran, setSaran] = useState(false);
  // ?bulan=YYYY-MM dari tautan halaman lain (mis. drill-down Rekap Bisnis)
  const [month, setMonth] = useState(() => { try { const b = new URLSearchParams(window.location.search).get('bulan'); return /^\d{4}-\d{2}$/.test(b || '') && b <= today().slice(0, 7) ? b : today().slice(0, 7); } catch { return today().slice(0, 7); } });
  const [dashboard, setDashboard] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [status, setStatus] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [history, setHistory] = useState(false);
  const [menu, setMenu] = useState(null);
  const [revision, setRevision] = useState(0);
  const router = useRouter();
  const legacyNew = useSearchParams().has('baru');
  useEffect(() => { if (legacyNew) router.replace(purchasePath({ month })); }, [legacyNew, router, month]);
  const [open, setOpen] = useState(null);
  const [linkedPurchase, setLinkedPurchase] = useState(null);
  const [linkError, setLinkError] = useState(false);
  const [tab, setTab] = useState('belanja');
  const [fk, setFk] = useState(null);   // belanja yang fakturnya sedang dibuka
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    const id = params.get('pesanan');
    const linked = id && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? id : null;
    setLinkedPurchase(linked);
    if (!linked && TABS.some(([k]) => k === t)) setTab(t);
  }, []);
  useEffect(() => {
    if (!linkedPurchase) return;
    const controller = new AbortController();
    supabase.from('purchases').select('*').eq('kos_id', kosId).eq('id', linkedPurchase)
      .abortSignal(controller.signal).maybeSingle().then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error || !data) setLinkError(true);
        else setOpen(data);
      });
    return () => controller.abort();
  }, [kosId, linkedPurchase]);
  const load = async () => {
    try {
      const data = await loadPurchaseCatalog(kosId);
      setErr(null); setD(data);
    } catch (error) { setErr(errMsg(error)); }
  };
  useEffect(() => { load(); }, [kosId, ver, revision]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const dateOrder = (query) => query.order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
    const start = month + '-01';
    const end = monthEnd(month);
    Promise.all([
      readAll(() => dateOrder(supabase.from('purchases').select('*').eq('kos_id', kosId).gte('purchase_date', start).lte('purchase_date', end)), signal),
      readAll(() => dateOrder(supabase.from('purchases').select('*').eq('kos_id', kosId).in('status', ['dipesan', 'sebagian'])), signal),
      readAll(() => supabase.from('purchase_returns').select('purchase_id,total,return_date').eq('kos_id', kosId).gte('return_date', start).lte('return_date', end).order('id'), signal),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('kos_id', kosId).eq('kind', 'supplier').is('archived_at', null).abortSignal(signal),
    ]).then(([purchases, waiting, returns, suppliers]) => {
      if (signal.aborted) return;
      setSummaryError(null);
      setDashboard({ month, purchases, waiting, returns, supplierCount: suppliers.error ? null : suppliers.count });
    }).catch((error) => {
      if (!signal.aborted) { setDashboard(null); setSummaryError(errMsg(error)); }
    });
    return () => controller.abort();
  }, [kosId, ver, month, revision]);
  if (err) return <div className="notice bad">{err.includes('purchase') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const sup = new Map(d.suppliers.map((s) => [s.id, s.name]));
  const ready = dashboard?.month === month;
  const purchases = ready ? dashboard.purchases : [];
  const waiting = ready ? dashboard.waiting : [];
  const returns = ready ? dashboard.returns : [];
  const booked = purchases.filter((item) => item.status === 'selesai' || item.status === 'sebagian');
  const retMonth = returns.reduce((total, item) => total + Number(item.total), 0);
  const returnsByPurchase = new Map();
  for (const item of returns) returnsByPurchase.set(item.purchase_id, (returnsByPurchase.get(item.purchase_id) || 0) + Number(item.total));
  const retOf = (id) => returnsByPurchase.get(id) || 0;
  const selectedPurchases = purchases.filter((item) => (
    (status === 'all' || item.status === status) && (!supplierFilter || item.contact_id === supplierFilter)
  ));
  const canReport = pathAllowed(kos, '/laporan-toko');
  const canContact = pathAllowed(kos, '/kontak');
  const canStock = pathAllowed(kos, '/barang');
  const selectMonth = (value) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value > today().slice(0, 7) || value === month) return;
    setSummaryError(null);
    setMonth(value);
  };
  const locName = (id) => kos.locs?.list?.find((x) => x.id === id)?.name;
  const newHref = purchasePath({ month });
  const fromSuggestion = (init) => {
    try {
      const draft = storePurchasePrefill(kosId, init);
      setSaran(false);
      router.push(purchasePath({ month, draft }));
    } catch { toast('Formulir belum bisa dibuka. Penyimpanan sesi browser tidak tersedia.'); }
  };
  const reviewPurchase = async (id) => {
    const { data, error } = await supabase.from('purchases').select('*').eq('kos_id', kosId).eq('id', id).maybeSingle();
    if (error || !data) return toast(error ? errMsg(error) : 'Pesanan supplier tidak ditemukan.');
    setSaran(false);
    setTab('belanja');
    setOpen(data);
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Procurement Management Center">
        <div className={styles.heroCopy}>
          <h1>Belanja (Pembelian)</h1>
          <p>Kelola pemesanan, penerimaan, dan pembayaran ke supplier secara mudah.</p>
          <PageHelp page="belanja" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Belanja <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/belanja-pembelian.webp" alt="" fill sizes="(max-width: 600px) 37vw, 310px" priority /></span>
      </section>
      <div className={styles.actions}>
        <Link className={styles.primary} href={newHref}><NavIcon name="/penjualan" />＋ Belanja</Link>
        <button onClick={() => setSaran(true)} disabled={!d.products.length}><NavIcon name="/konfirmasi" />Saran Belanja</button>
        <button onClick={() => setMenu('import')}><NavIcon name="upload" />Import</button>
        <button onClick={() => setMenu('more')}><NavIcon name="more" />Lainnya</button>
      </div>
      {linkError && <div className="notice bad">Pesanan supplier rujukan tidak bisa dibuka di bisnis aktif.</div>}
      <div className={styles.tabs} aria-label="Menu pembelian">{TABS.map(([key, label]) => (
        <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key}>{label}</button>
      ))}</div>
      {tab === 'permintaan' && <Permintaan kosId={kosId} d={d} onOrder={fromSuggestion} />}
      {tab === 'faktur' && <Faktur kosId={kosId} />}
      {tab === 'supplier' && <KinerjaSupplier kosId={kosId} />}
      {tab === 'belanja' && <>
        <LokasiBar note="Belanja baru dicatat untuk lokasi ini; barang masuk ke stok lokasi tempat belanja dicatat." />
        <div className={styles.toolbar}>
          <label className={styles.period}><NavIcon name="calendar" /><b>{bulan(month)}</b><NavIcon name="down" size={16} />
            <input type="month" aria-label="Periode belanja" max={today().slice(0, 7)} value={month} onChange={(event) => selectMonth(event.target.value)} />
          </label>
          <button aria-haspopup="dialog" onClick={() => setMenu('filter')}><NavIcon name="filter" />Filter{(status !== 'all' || supplierFilter) && ' aktif'}</button>
        </div>
        {summaryError ? <div className="notice bad">{summaryError} <button onClick={() => { setSummaryError(null); setRevision((value) => value + 1); }}>Coba Lagi</button></div> : !ready ? <Loading /> : <>
          <div className={styles.metrics}>
            <PurchaseMetric icon="/penjualan" label={month === today().slice(0, 7) ? 'Belanja Bulan Ini' : 'Belanja Periode Ini'} value={rp(booked.reduce((total, item) => total + Number(item.total), 0) - retMonth)} note={`${angka(booked.length)} nota${retMonth ? ` · retur ${rp(retMonth)}` : ''}`} />
            <PurchaseMetric icon="wallet" label="Belanja Utang" value={rp(booked.filter((item) => item.pay_method === 'utang').reduce((total, item) => total + Number(item.total), 0))} note="Pelunasan di Kas & Kasbon" />
            <PurchaseMetric icon="/grosir" label="Pesanan Belum Datang" value={angka(waiting.length)} note={waiting.length ? `Sisa ${rp(waiting.reduce((total, item) => total + Number(item.order_total ?? item.total) - Number(item.total), 0))}` : 'Tidak ada'} />
            <PurchaseMetric icon="/barang" label="Jumlah Supplier" value={dashboard.supplierCount == null ? '—' : angka(dashboard.supplierCount)} note={dashboard.supplierCount == null ? 'Data belum tersedia' : 'Supplier aktif tercatat'} />
          </div>
          <div className={styles.content} data-history={history}>
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2>{history ? 'Riwayat Belanja' : 'Transaksi Terbaru'}</h2>
                {selectedPurchases.length > 0 && <button onClick={() => setHistory(!history)}>{history ? 'Ringkas' : 'Lihat Semua'}<NavIcon name={history ? 'prev' : 'next'} size={15} /></button>}
              </div>
              {selectedPurchases.length === 0 ? <Empty title={purchases.length ? 'Tidak ada transaksi yang cocok' : 'Belum ada belanja pada periode ini'} text={purchases.length ? 'Ubah filter untuk melihat transaksi lain.' : 'Pilih periode lain atau catat belanja baru.'}>
                {!d.products.length && canStock && <Link href="/barang">Buka Barang &amp; Stok</Link>}
              </Empty> : !history ? <div className={styles.recent}>
                {selectedPurchases.slice(0, 5).map((item) => <button key={item.id} onClick={() => setOpen(item)}>
                  <span className={styles.recentIcon}><NavIcon name="/barang" /></span>
                  <span className={styles.recentCopy}><b>{sup.get(item.contact_id) || 'Tanpa supplier'} {ST[item.status] && <span className={'chip ' + ST[item.status][1]}>{ST[item.status][0]}</span>}</b>
                    <small>{tgl(item.purchase_date)} · {item.number} · {BUY[item.pay_method]}</small></span>
                  <strong className={item.status === 'batal' ? styles.voidTotal : undefined}>{rp(item.status === 'dipesan' ? item.order_total : item.total)}</strong><NavIcon name="next" size={16} />
                </button>)}
              </div> : (
                <DataTable rows={selectedPurchases} caption="Daftar belanja" onRow={setOpen} rowLabel={(b) => `${b.number} ${sup.get(b.contact_id) || 'Tanpa supplier'}`} pageSize={50}
                  columns={[
                    { key: 'date', label: 'Tanggal', sort: (b) => b.purchase_date, render: (b) => tgl(b.purchase_date) },
                    { key: 'no', label: 'Nomor', sort: (b) => b.number, render: (b) => <span style={{ whiteSpace: 'nowrap' }}>{b.number}</span> },
                    { key: 'sup', label: 'Supplier', sort: (b) => (sup.get(b.contact_id) || '').toLowerCase(), render: (b) => <b>{sup.get(b.contact_id) || 'Tanpa supplier'}</b> },
                    { key: 'pay', label: 'Bayar', hide: 'tablet', render: (b) => <span className="small">{BUY[b.pay_method]}{b.status === 'dipesan' && b.expected_date ? ` · datang ${tgl(b.expected_date)}` : ''}{multiLoc(kos) && locName(b.branch_id) ? ` · ${locName(b.branch_id)}` : ''}{retOf(b.id) > 0 ? ` · diretur ${rp(retOf(b.id))}` : ''}</span> },
                    { key: 'st', label: 'Status', render: (b) => (ST[b.status] ? <span className={'chip ' + ST[b.status][1]}>{ST[b.status][0]}</span> : <span className="chip good">Diterima</span>) },
                    { key: 'tot', label: 'Total', align: 'right', sort: (b) => Number(b.status === 'dipesan' ? b.order_total : b.total), render: (b) => <b style={{ textDecoration: b.status === 'batal' ? 'line-through' : 'none' }}>{rp(b.status === 'dipesan' ? b.order_total : b.total)}</b> },
                  ]}
                  card={(b) => <>
                    <div className="dt-row"><b>{sup.get(b.contact_id) || 'Tanpa supplier'}{ST[b.status] && <span className={'chip ' + ST[b.status][1]} style={{ marginLeft: 6 }}>{ST[b.status][0]}</span>}</b><b style={{ textDecoration: b.status === 'batal' ? 'line-through' : 'none' }}>{rp(b.status === 'dipesan' ? b.order_total : b.total)}</b></div>
                    <span className="small muted">{tgl(b.purchase_date)} · {b.number} · {BUY[b.pay_method]}{b.status === 'dipesan' && b.expected_date ? ` · datang ${tgl(b.expected_date)}` : ''}{multiLoc(kos) && locName(b.branch_id) ? ` · ${locName(b.branch_id)}` : ''}{retOf(b.id) > 0 ? ` · diretur ${rp(retOf(b.id))}` : ''}</span>
                  </>} />
              )}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2>Akses Cepat</h2></div>
              <div className={styles.quick}>
                <button onClick={() => setMenu('receive')}><NavIcon name="/grosir" />Penerimaan Barang</button>
                <button onClick={() => setMenu('scan')}><NavIcon name="barcode" />Scan Nota Supplier</button>
                {canReport && <Link href="/laporan-toko"><NavIcon name="/laporan" />Laporan Belanja</Link>}
                {canContact && <Link href="/kontak?tab=supplier"><NavIcon name="/penghuni" />Supplier</Link>}
                <button onClick={() => setMenu('frequent')}><NavIcon name="/layers" />Produk Sering Dibeli</button>
                <button onClick={() => setMenu('settings')}><NavIcon name="/pengaturan" />Pengaturan Pembelian</button>
              </div>
            </section>
          </div>
        </>}
      </>}
      {menu === 'filter' && <Sheet title="Filter Belanja" onClose={() => setMenu(null)}>
        <Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Semua status</option><option value="selesai">Diterima</option>
          {Object.entries(ST).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        <Field label="Supplier"><select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
          <option value="">Semua supplier</option>{d.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>
        <button className="primary" onClick={() => setMenu(null)}>Lihat Hasil</button>
        <button onClick={() => { setStatus('all'); setSupplierFilter(''); }}>Reset Filter</button>
      </Sheet>}
      {menu === 'more' && <Sheet title="Lainnya" onClose={() => setMenu(null)}>
        <button onClick={() => setMenu('receive')}>Penerimaan Barang</button>
        <button onClick={() => setMenu('scan')}>Scan Nota Supplier</button>
        <button onClick={() => setMenu('frequent')}>Produk Sering Dibeli</button>
        <button onClick={() => setMenu('settings')}>Pengaturan Pembelian</button>
      </Sheet>}
      {menu === 'receive' && <Sheet title="Penerimaan Barang" onClose={() => setMenu(null)}>
        {!ready ? <p>Daftar pesanan belum tersedia.</p> : waiting.length ? waiting.map((item) => (
          <button key={item.id} onClick={() => { setMenu(null); setOpen(item); }}>{item.number} · {sup.get(item.contact_id) || 'Tanpa supplier'}{item.expected_date ? ` · ${tgl(item.expected_date)}` : ''}</button>
        )) : <p>Tidak ada pesanan yang menunggu penerimaan.</p>}
      </Sheet>}
      {menu === 'scan' && <SupplierReceiptScan onClose={() => setMenu(null)} onInvoices={() => { setMenu(null); setTab('faktur'); }} />}
      {['import', 'frequent', 'settings'].includes(menu) && <Sheet title={{ import: 'Import Belanja', frequent: 'Produk Sering Dibeli', settings: 'Pengaturan Pembelian' }[menu]} onClose={() => setMenu(null)}>
        <p>Fitur ini masih berupa usulan pengembangan.</p>
      </Sheet>}
      {saran && (kos.business_type === 'retail'
        ? <RestockGuidance kosId={kosId} version={ver} onClose={() => setSaran(false)} onPick={fromSuggestion} onReview={reviewPurchase} />
        : <SaranBelanja kosId={kosId} d={d} onClose={() => setSaran(false)} onPick={fromSuggestion} />)}

      {open && <Detail key={open.id} tracked={new Set(d.products.filter((p) => p.track_expiry).map((p) => p.id))} b={open} supplier={sup.get(open.contact_id)} loc={multiLoc(kos) ? locName(open.branch_id) : null}
        canOpenOrder={canArea(kos, 'sell') || canArea(kos, 'finance')} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); setRevision((value) => value + 1); }} onFaktur={() => { setFk(open.id); setOpen(null); }} />}
      {fk && <FakturSheet purchaseId={fk} onClose={() => { setFk(null); setRevision((value) => value + 1); }} />}
    </div>
  );
}

function PurchaseMetric({ icon, label, value, note }) {
  return <article className={styles.metric}><span className={styles.metricIcon}><NavIcon name={icon} /></span>
    <div><b>{label}</b><strong>{value}</strong><small>{note}</small></div>
  </article>;
}

function SupplierReceiptScan({ onClose, onInvoices }) {
  const current = useRef(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => () => current.current?.abort(), []);
  const scan = async (file) => {
    if (!file) return;
    const controller = new AbortController();
    current.current?.abort();
    current.current = controller;
    setBusy(true);
    setMessage('');
    setText('');
    try {
      const { readProductPhotoText } = await import('@/lib/product-photo-ocr');
      const result = (await readProductPhotoText(file, { signal: controller.signal })).trim();
      if (controller.signal.aborted) return;
      setText(result);
      if (!result) setMessage('Tulisan tidak terbaca. Coba foto yang lebih jelas.');
    } catch {
      if (!controller.signal.aborted) setMessage('Foto belum bisa dibaca. Coba foto yang lebih jelas.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <Sheet title="Scan Nota Supplier" onClose={onClose}>
    <p>Pilih foto nota. Periksa teks hasil scan sebelum menggunakannya untuk mengisi faktur.</p>
    <Field label="Foto nota supplier"><input type="file" accept="image/*" onChange={(event) => scan(event.target.files?.[0])} /></Field>
    <p role="status">{busy ? 'Membaca foto nota…' : message}</p>
    {text && <Field label="Teks hasil scan"><textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} /></Field>}
    <button className="primary" onClick={onInvoices}>Buka Faktur Supplier</button>
  </Sheet>;
}

function Detail({ b, supplier, loc, tracked, canOpenOrder, onClose, onChanged, onFaktur }) {
  const [editingExpected, setEditingExpected] = useState(false);
  const [expected, setExpected] = useState(b.expected_date || '');
  const [lines, setLines] = useState(null);
  const [rets, setRets] = useState([]);   // retur ke supplier: [{...header, lines}]
  const [ret, setRet] = useState(null);   // form retur: {qty: {line_id: '...'}, refund, reason}
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [recv, setRecv] = useState(null);   // {line_id: {qty, price}}
  const [busy, setBusy] = useState(false);
  const [by, setBy] = useState(null);
  useEffect(() => {
    supabase.from('purchase_lines').select('*').eq('purchase_id', b.id).then(({ data }) => setLines(data || []));
    supabase.from('purchase_returns').select('*, purchase_return_lines(*)').eq('purchase_id', b.id).order('created_at').then(({ data }) => setRets(data || []));
  }, [b.id]);
  const returned = (l) => rets.reduce((a, r) => a + (r.purchase_return_lines || []).filter((x) => x.purchase_line_id === l.id).reduce((s, x) => s + Number(x.qty), 0), 0);
  const canRet = (l) => Math.max(0, Number(l.qty_received) - returned(l));
  const retTotal = ret && lines ? lines.reduce((a, l) => a + (qtyNum(ret.qty[l.id] || '') || 0) * Number(l.price), 0) : 0;
  const startRet = () => setRet({ qty: {}, refund: b.pay_method === 'utang' ? 'potong_utang' : 'tunai', reason: '' });
  const doRet = async () => {
    const items = lines.map((l) => ({ line_id: l.id, qty: qtyNum(ret.qty[l.id] || '') || 0 })).filter((x) => x.qty > 0);
    if (!items.length) return toast('Isi jumlah barang yang dikembalikan.');
    if (items.some((x) => x.qty > canRet(lines.find((l) => l.id === x.line_id)))) return toast('Jumlah retur melebihi barang yang diterima.');
    if (!window.confirm(`Retur ke ${supplier || 'supplier'} senilai ${rp(retTotal)}?\n${REFUND[ret.refund]}. Stok berkurang dan tidak bisa dibatalkan.`)) return;
    setBusy(true);
    const r = await withApproval(() => supabase.rpc('purchase_return_create', { p_id: uid(), p_purchase: b.id, p_lines: items, p_refund: ret.refund, p_reason: ret.reason }), 'Retur tersimpan, stok dikurangi',
      { kos: b.kos_id, action: 'retur_belanja', payload: { purchase_id: b.id, lines: items, refund: ret.refund }, reason: ret.reason });
    setBusy(false);
    if (r) onChanged();
  };
  useEffect(() => { if (b.created_by) supabase.rpc('member_names', { p_kos: b.kos_id }).then(({ data }) => setBy(data?.[b.created_by] || 'karyawan lama')); }, [b.id]);
  const open = b.status === 'dipesan' || b.status === 'sebagian';
  const saveExpected = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('purchase_expected_set', { p_purchase: b.id, p_expected: expected || null }), 'Jadwal kedatangan diperbarui', errMsg);
    setBusy(false);
    if (ok) onChanged();
  };
  const left = (l) => Math.max(0, Number(l.qty) - Number(l.qty_received));
  const startRecv = () => setRecv(Object.fromEntries(lines.map((l) => [l.id, { qty: String(left(l)).replace('.', ','), price: angka(l.price), expiry: l.expiry || '', lot: l.lot || '' }])));
  const doVoid = async () => {
    if (await withApproval(() => supabase.rpc('purchase_void', { p_purchase: b.id, p_reason: reason }), Number(b.total) > 0 ? 'Belanja dibatalkan, stok dikurangi lagi' : 'Pesanan dibatalkan',
      { kos: b.kos_id, action: 'batal_belanja', payload: { purchase_id: b.id }, reason })) onChanged();
  };
  const receive = async (close) => {
    const items = recv ? lines.map((l) => ({ line_id: l.id, qty: qtyNum(recv[l.id].qty) || 0, price: parseRp(recv[l.id].price), expiry: recv[l.id].expiry || null, lot: recv[l.id].lot || null })).filter((x) => x.qty > 0) : [];
    if (!close && !items.length) return toast('Isi jumlah barang yang diterima.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('purchase_receive', { p_purchase: b.id, p_lines: items, p_date: null, p_close: close }), close && !items.length ? 'Pesanan ditutup' : 'Barang diterima, stok bertambah', errMsg);
    setBusy(false);
    if (ok) onChanged();
  };
  return (
    <Sheet title={b.number} onClose={onClose}>
      <span className="small muted">{tgl(b.purchase_date)} · {supplier || 'Tanpa supplier'} · {BUY[b.pay_method]}{b.due_date ? ` · jatuh tempo ${tgl(b.due_date)}` : ''}{b.expected_date && open ? ` · perkiraan datang ${tgl(b.expected_date)}` : ''}</span>
      {ST[b.status] && <span className={'chip ' + ST[b.status][1]} style={{ alignSelf: 'flex-start' }}>{ST[b.status][0]}</span>}
      {b.note && <span className="small">Catatan: {b.note}</span>}
      {open && !editingExpected && <button type="button" className="sm ghost" onClick={() => setEditingExpected(true)}>
        {b.expected_date ? 'Ubah perkiraan datang' : 'Isi perkiraan datang'}
      </button>}
      {open && editingExpected && <div className="stack">
        <Field label="Perkiraan datang"><input type="date" min={today()} value={expected} onChange={(event) => setExpected(event.target.value)} /></Field>
        <div className="row">
          <button type="button" className="sm primary" disabled={busy || Boolean(expected && expected < today())} onClick={saveExpected}>Simpan jadwal</button>
          <button type="button" className="sm ghost" disabled={busy} onClick={() => setEditingExpected(false)}>Batal</button>
        </div>
      </div>}
      {b.so_order_id && canOpenOrder && <Link href={`/grosir?pesanan=${b.so_order_id}`} className="small">Buka pesanan pelanggan</Link>}
      {by && <span className="small muted">Dicatat oleh {by}{loc ? ` · ${loc}` : ''}</span>}
      {b.status === 'batal' && <div className="notice bad">Dibatalkan: {b.void_reason}</div>}
      {!lines ? <Loading /> : <div className="list">{lines.map((l) => (
        <div className="li" key={l.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{l.name}</b><b className="small">{rp(Number(l.line_total) || Number(l.qty) * Number(l.price))}</b></div>
          <span className="small muted">dipesan {angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.qty_received) !== Number(l.qty) || open ? ` · diterima ${angka(l.qty_received)}` : ''}{open && left(l) > 0 ? ` · kurang ${angka(left(l))}` : ''}{returned(l) > 0 ? ` · diretur ${angka(returned(l))}` : ''}</span>
          {ret && canRet(l) > 0 && <Field label={`Dikembalikan (${l.unit}, maks ${angka(canRet(l))})`}><input inputMode="decimal" value={ret.qty[l.id] || ''} onChange={(e) => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} placeholder="0" /></Field>}
          {recv && <div className="row">
            <Field label={`Diterima sekarang (${l.unit})`}><input inputMode="decimal" value={recv[l.id].qty} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], qty: e.target.value } })} /></Field>
            <Field label={`Harga per ${l.unit}`}><input inputMode="numeric" value={recv[l.id].price} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], price: e.target.value } })} /></Field>
          </div>}
          {recv && tracked?.has(l.product_id) && <div className="row">
            <Field label="Tanggal kedaluwarsa"><input type="date" value={recv[l.id].expiry} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], expiry: e.target.value } })} /></Field>
            <Field label="No. batch (opsional)"><input value={recv[l.id].lot} maxLength={40} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], lot: e.target.value } })} /></Field>
          </div>}
          {!recv && (l.expiry || l.lot) && <span className="small muted">{l.expiry ? `Exp ${tgl(l.expiry)}` : ''}{l.lot ? ` · batch ${l.lot}` : ''}</span>}
        </div>
      ))}</div>}
      <div className="row between"><b>{open ? 'Sudah diterima' : 'Total'}</b><b>{rp(b.total)}</b></div>
      {open && <div className="row between small muted"><span>Nilai pesanan</span><span>{rp(b.order_total)}</span></div>}
      {open && lines && (!recv ? <>
        <button className="cta" onClick={startRecv}>Terima barang</button>
        <button className="ghost" onClick={() => receive(true)} disabled={busy}>{Number(b.total) > 0 ? 'Tutup pesanan (sisa tidak dikirim)' : 'Batalkan pesanan (tidak jadi)'}</button>
      </> : <>
        <p className="small muted" style={{ margin: 0 }}>Isi jumlah yang benar-benar datang. Kosongkan atau isi 0 untuk barang yang belum datang.</p>
        <button className="cta" onClick={() => receive(false)} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan penerimaan'}</button>
        <button className="ghost" onClick={() => receive(true)} disabled={busy}>Simpan & tutup pesanan</button>
      </>)}
      {b.contact_id && b.status !== 'batal' && !recv && !ret && <button onClick={onFaktur}>Faktur supplier</button>}
      {rets.length > 0 && <>
        <span className="label">Retur ke supplier</span>
        <div className="list">{rets.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{r.number} · {REFUND[r.refund_method]}</b>
              <span className="small muted">{tgl(r.return_date)} · {(r.purchase_return_lines || []).map((x) => `${x.name} ${angka(x.qty)} ${x.unit}`).join(', ')} · {r.reason}</span></div>
            <b className="small">−{rp(r.total)}</b>
          </div>
        ))}</div>
      </>}
      {lines && (b.status === 'selesai' || b.status === 'sebagian') && lines.some((l) => canRet(l) > 0) && !recv && (!ret ? <button className="ghost" onClick={startRet}>Retur ke supplier</button> : <>
        <Field label="Pengembalian dari supplier"><select value={ret.refund} onChange={(e) => setRet({ ...ret, refund: e.target.value })}>
          {(b.pay_method === 'utang' ? ['potong_utang', 'tunai', 'transfer'] : ['tunai', 'transfer']).map((k) => <option key={k} value={k}>{REFUND[k]}</option>)}
        </select></Field>
        <Field label="Alasan retur"><input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="mis. kemasan rusak, salah kirim, kedaluwarsa" /></Field>
        <div className="row between"><span className="small">Nilai retur (harga beli)</span><b>{rp(retTotal)}</b></div>
        <button className="cta" onClick={doRet} disabled={busy || retTotal <= 0 || ret.reason.trim().length < 3}>{busy ? 'Menyimpan…' : 'Simpan retur'}</button>
        <button className="ghost" onClick={() => setRet(null)}>Batal</button>
      </>)}
      {Number(b.total) > 0 && b.status !== 'batal' && !rets.length && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>Batalkan belanja</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang diretur" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>Ya, batalkan & kurangi stok</button>
      </>)}
    </Sheet>
  );
}

// Saran belanja ulang (server: reorder_suggest) — dikelompokkan per supplier terakhir, lalu jadi pesanan ke supplier
function SaranBelanja({ kosId, d, onClose, onPick }) {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState({});
  const [cover, setCover] = useState(14);
  useEffect(() => {
    setRows(null);
    supabase.rpc('reorder_suggest', { p_kos: kosId, p_cover: cover, p_lookback: 30, p_safety: 2 }).then(({ data, error }) => {
      if (error) { toast(errMsg(error)); setRows([]); return; }
      setRows(data || []);
      setPick(Object.fromEntries((data || []).map((r) => [r.product_id, { on: true, qty: String(r.suggest) }])));
    });
  }, [cover]);
  const sup = new Map(d.suppliers.map((s) => [s.id, s.name]));
  const groups = {};
  for (const r of rows || []) (groups[r.supplier_id || ''] ||= []).push(r);
  const make = (sid) => {
    const lines = (groups[sid] || []).filter((r) => pick[r.product_id]?.on && qtyNum(pick[r.product_id].qty) > 0)
      .map((r) => ({ product_id: r.product_id, unit: r.unit, qty: String(qtyNum(pick[r.product_id].qty)), price: Number(r.price) > 0 ? angka(r.price) : '' }));
    if (!lines.length) return toast('Centang barang yang mau dipesan.');
    onPick({ supplier: sid || '', lines });
  };
  return (
    <Sheet title="Saran belanja" onClose={onClose}>
      <span className="small muted">Dihitung dari rata-rata barang keluar 30 hari terakhir, waktu tunggu supplier, stok minimum, dan pesanan yang belum datang. Supplier utama, harga sepakat & minimal pesan diambil dari Barang › Ubah › Harga dari supplier.</span>
      <div className="seg">{[[7, 'Cukup 1 minggu'], [14, '2 minggu'], [30, '1 bulan']].map(([v, l]) => <button key={v} className={cover === v ? 'on' : ''} onClick={() => setCover(v)}>{l}</button>)}</div>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="Belum ada yang perlu dibeli" text="Stok semua barang masih cukup untuk rentang ini. Barang tanpa penjualan & tanpa stok minimum tidak dihitung." /> :
        Object.entries(groups).map(([sid, list]) => (
          <section className="panel" key={sid || 'tanpa'} style={{ gap: 6 }}>
            <span className="label">{sid ? sup.get(sid) || list[0].supplier || 'Supplier' : 'Belum pernah dibeli / tanpa supplier'}</span>
            {list.map((r) => (
              <div key={r.product_id} className="li" style={{ alignItems: 'flex-start', gap: 8 }}>
                <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
                  <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pick[r.product_id]?.on || false} onChange={(e) => setPick({ ...pick, [r.product_id]: { ...pick[r.product_id], on: e.target.checked } })} />
                  <span style={{ minWidth: 0 }}><b>{r.name}</b><br /><span className="muted">Stok {angka(r.stock)} {r.base_unit} · {r.reason}{Number(r.per_day) > 0 ? ` · keluar ±${angka(r.per_day)}/hari` : ''}{Number(r.on_order) > 0 ? ` · dipesan ${angka(r.on_order)}` : ''}{r.moq_applied ? ` · dibulatkan ke minimal pesan ${angka(r.moq)} ${r.unit}` : ''}{r.preferred ? ' · supplier utama' : ''}</span></span>
                </label>
                <span className="row" style={{ flexWrap: 'nowrap', gap: 4, flex: 'none' }}><input inputMode="decimal" value={pick[r.product_id]?.qty || ''} onChange={(e) => setPick({ ...pick, [r.product_id]: { ...pick[r.product_id], qty: e.target.value } })} style={{ width: 64 }} aria-label={`Jumlah ${r.name}`} /><span className="small">{r.unit}</span></span>
              </div>
            ))}
            <button className="primary" onClick={() => make(sid)}>Buat pesanan{sid ? ` ke ${sup.get(sid) || list[0].supplier}` : ''}</button>
          </section>
        ))}
    </Sheet>
  );
}
