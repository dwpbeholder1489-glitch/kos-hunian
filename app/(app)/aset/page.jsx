'use client';
// Aset tetap & penyusutan. Server: asset_list, asset_save, asset_dispose, asset_dispose_undo, asset_delete, asset_schedule.
// Penyusutan dihitung server tiap bulan yang sudah lewat dan otomatis masuk Pembukuan (bukan uang keluar).
import { Fragment, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { DataTable } from '@/components/Page';
import Image from 'next/image';
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { downloadCsv, useKuotaEkspor } from '@/lib/ekspor';
import styles from './aset.module.css';
import { useBaru } from '@/lib/useBaru';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg, addMonthsYm } from '@/lib/format';

const KATEGORI = ['Kendaraan', 'Mesin', 'Peralatan', 'Peralatan toko', 'Elektronik', 'Perabot', 'Bangunan', 'Tanah', 'Lainnya'];
const UMUR = [['12', '1 tahun'], ['24', '2 tahun'], ['48', '4 tahun'], ['96', '8 tahun'], ['240', '20 tahun']];
const LEPAS = { dijual: 'Dijual', dibuang: 'Dibuang / rusak', hilang: 'Hilang' };
const bulanNama = (iso) => new Date(iso + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'short', year: 'numeric' });
const umurTeks = (m) => (m == null ? 'tidak disusutkan' : m % 12 === 0 ? `${m / 12} tahun` : `${m} bulan`);

export default function Aset() {
  const { kosId, ver } = useKos();
  return kosId ? <AssetWorkspace key={kosId} {...{ kosId, ver }} /> : <Loading />;
}

const TABS = { list: 'Daftar Aset', schedule: 'Jadwal Penyusutan', history: 'Riwayat', categories: 'Kategori' };
const roundAmount = (n) => Math.round(n * 100) / 100;
const csvText = (v) => /^\s*[=+@-]|^[\t\r\n]/.test(v || '') ? "'" + v : v;

function AssetWorkspace({ kosId, ver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);   // null | {} | {expense} | asset (ubah)
  const [open, setOpen] = useState(null);
  const [status, setStatus] = useState('all');
  const [tab, setTab] = useState('list');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [filters, setFilters] = useState(false);
  const [sheet, setSheet] = useState(null);
  const { habis, info, jalankan } = useKuotaEkspor(kosId);
  useBaru(() => setForm({}));
  const load = () => supabase.rpc('asset_list', { p_kos: kosId }).then(({ data, error }) => {
    setErr(error ? errMsg(error) : null);
    if (!error) setD(data);
  });
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/asset_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const categories = [...new Set([...KATEGORI, ...d.assets.map((asset) => asset.category || 'Tanpa kategori')])];
  const needle = query.trim().toLocaleLowerCase('id-ID');
  const shown = d.assets.filter((a) => (status === 'all' || a.status === status)
    && (!category || (a.category || 'Tanpa kategori') === category)
    && (!needle || [a.name, a.category].some((value) => value?.toLocaleLowerCase('id-ID').includes(needle))));
  const active = d.assets.filter((a) => a.status === 'aktif');
  const exportReport = () => jalankan('aset', () => downloadCsv('laporan-aset.csv', [
    ['Nama aset', 'Kategori', 'Status', 'Tanggal perolehan', 'Harga perolehan', 'Akumulasi penyusutan', 'Nilai buku s.d. pelepasan', 'Tanggal pelepasan', 'Jenis pelepasan', 'Hasil pelepasan', 'Untung/rugi'],
    ...d.assets.map((a) => [csvText(a.name), csvText(a.category), a.status, a.start_date, a.cost, a.accumulated, a.book_value, a.disposed_date, LEPAS[a.disposal_kind], a.disposal_amount, a.gain]),
  ]));
  const actions = [
    ['plus', 'Tambah Aset', () => setForm({})],
    ['credit', 'Hitung Penyusutan', () => setSheet('simulate')],
    ['calendar', 'Jadwal Penyusutan', () => setTab('schedule')],
    ['/resep', 'Laporan Aset', () => setSheet('report')],
    ['more', 'Lainnya', () => setSheet('more')],
  ];
  const metrics = [
    ['/layers', 'Nilai Buku Sekarang', rp(d.total_book), `Harga perolehan ${rp(d.total_cost)}`],
    ['/laporan', 'Sudah Disusutkan', rp(d.total_accumulated), 'Akumulasi penyusutan'],
    ['calendar', 'Penyusutan per Bulan', rp(d.monthly), 'Beban nonkas'],
    ['/barang', 'Jumlah Aset', angka(active.length), 'Aset aktif'],
  ];
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Aset Tetap</h1>
          <p>Kelola aset usaha &amp; penyusutan secara otomatis dan terintegrasi dengan pembukuan.</p>
          <PageHelp page="aset" label={<><NavIcon name="/buku-besar" size={17} />Panduan Aset Tetap<NavIcon name="next" size={13} /></>} />
        </div>
        <div className={styles.heroArt} aria-hidden="true"><Image src="/aset-ringkasan.webp" alt="" fill unoptimized priority /></div>
      </header>
      <div className={styles.actions}>{actions.map(([icon, label, action], index) =>
        <button key={label} className={index === 0 ? styles.primary : ''} onClick={action}><NavIcon name={icon} />{label}</button>
      )}</div>
      <div className={styles.metrics}>{metrics.map(([icon, label, value, sub]) =>
        <div key={label} className={styles.metric}><span><NavIcon name={icon} /></span><div><strong>{label}</strong><b>{value}</b><small>{sub}</small></div></div>
      )}</div>
      <div className={styles.tabs} role="group" aria-label="Tampilan aset">
        {Object.entries(TABS).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === 'list' && <>
        <div className={styles.search}>
          <label><NavIcon name="search" /><input type="search" aria-label="Cari nama aset atau kategori" placeholder="Cari nama aset atau kategori" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <button onClick={() => setFilters(!filters)} aria-expanded={filters}><NavIcon name="filter" />Filter{(status !== 'all' || category) && ' •'}</button>
        </div>
        {filters && <div className={styles.filters}>
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Semua status</option><option value="aktif">Dipakai</option><option value="dilepas">Sudah dilepas</option></select></Field>
          <Field label="Kategori"><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <button onClick={() => { setStatus('all'); setCategory(''); }}>Reset filter</button>
        </div>}
      {d.candidates.length > 0 && <section className="panel" style={{ gap: 6 }}>
        <span className="label">Pengeluaran modal yang belum dicatat sebagai aset</span>
        <div className="list">{d.candidates.slice(0, 5).map((e) => (
          <div className="li" key={e.id}><div className="main"><b className="small">{e.description || 'Pengeluaran modal'}</b><span className="small muted">{tgl(e.date)} · {rp(e.amount)}</span></div>
            <button className="sm" onClick={() => setForm({ expense: e })}>Jadikan aset</button></div>
        ))}</div>
        <span className="small muted">Aset yang dicatat di sini disusutkan otomatis, sehingga laba di Pembukuan lebih wajar.</span>
      </section>}
      {d.assets.length === 0 ? (
        <Empty art="box" title="Belum ada aset" text="Catat barang yang dipakai usaha bertahun-tahun: motor, kulkas, mesin, etalase, komputer, bangunan. Nilainya dibagi rata per bulan (penyusutan) dan masuk Pembukuan otomatis.">
          <button className={styles.firstAsset} onClick={() => setForm({})}>+ Tambah aset pertama</button>
        </Empty>
      ) : shown.length === 0 ? <Empty title="Aset tidak ditemukan" text="Coba kata kunci atau filter lain." /> : <DataTable rows={shown} caption="Daftar aset" onRow={setOpen} rowLabel={(a) => a.name}
          columns={[
            { key: 'name', label: 'Aset', sort: (a) => a.name.toLowerCase(), render: (a) => <><b>{a.name}</b>{a.category && <div className="small muted">{a.category}</div>}</> },
            { key: 'start', label: 'Mulai dipakai', sort: (a) => a.start_date, render: (a) => tgl(a.start_date) },
            { key: 'cost', label: 'Harga perolehan', align: 'right', hide: 'tablet', sort: (a) => Number(a.cost), render: (a) => rp(a.cost) },
            { key: 'dep', label: 'Penyusutan / pelepasan', render: (a) => (a.status === 'aktif' ? (a.life_months == null ? <span className="muted">{umurTeks(a.life_months)}</span> : <span className="small">{a.months_left > 0 ? <>{rp(a.monthly)}/bulan · sisa {a.months_left} bulan</> : <span className="muted">sudah habis disusutkan</span>}</span>) : <span className="small">{LEPAS[a.disposal_kind]} {tgl(a.disposed_date)}{Number(a.disposal_amount) > 0 ? ` · ${rp(a.disposal_amount)}` : ''}</span>) },
            { key: 'val', label: 'Nilai buku / untung rugi', align: 'right', sort: (a) => Number(a.status === 'aktif' ? a.book_value : a.gain), render: (a) => (a.status === 'aktif' ? <b>{rp(a.book_value)}</b> : <span>{Number(a.gain) >= 0 ? `untung ${rp(a.gain)}` : `rugi ${rp(-a.gain)}`}</span>) },
          ]}
          card={(a) => <>
            <div className="dt-row"><b>{a.name}</b><b style={{ whiteSpace: 'nowrap' }}>{rp(a.status === 'aktif' ? a.book_value : a.disposal_amount || 0)}</b></div>
            <span className="small muted">{a.category ? `${a.category} · ` : ''}{tgl(a.start_date)} · {rp(a.cost)} · {umurTeks(a.life_months)}</span>
            {a.status === 'aktif' ? (a.life_months != null && <span className="small">{a.months_left > 0 ? <>susut {rp(a.monthly)}/bulan · sisa {a.months_left} bulan</> : <span className="muted">sudah habis disusutkan</span>}</span>)
              : <span className="small">{LEPAS[a.disposal_kind]} {tgl(a.disposed_date)}{Number(a.disposal_amount) > 0 ? ` · ${rp(a.disposal_amount)}` : ''}</span>}
            <span className="small muted">{a.status === 'aktif' ? 'nilai buku' : Number(a.gain) >= 0 ? `untung ${rp(a.gain)}` : `rugi ${rp(-a.gain)}`}</span>
          </>} />}
      </>}
      {tab === 'schedule' && <Schedule assets={d.assets} />}
      {tab === 'history' && <History kosId={kosId} />}
      {tab === 'categories' && <div className={styles.categories}>{categories.map((item) => {
        const group = d.assets.filter((asset) => (asset.category || 'Tanpa kategori') === item);
        return <button key={item} onClick={() => { setCategory(item); setStatus('all'); setQuery(''); setTab('list'); setFilters(true); }}>
          <NavIcon name="/barang" /><span><b>{item}</b><small>{group.length} aset</small></span><NavIcon name="next" size={15} />
        </button>;
      })}</div>}
      <aside className={styles.notice}><NavIcon name="info" /><p><b>Tips:</b> Tentukan umur manfaat dan nilai residu sebelum menyimpan. Penyusutan garis lurus masuk Pembukuan setelah bulan berakhir tanpa mengubah saldo kas. Tanah umumnya tidak disusutkan.</p></aside>
      {sheet === 'simulate' && <Simulation onClose={() => setSheet(null)} />}
      {sheet === 'report' && <Sheet title="Laporan Aset" onClose={() => setSheet(null)}>
        <dl className="kv">{metrics.map(([, label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}<dt>Harga perolehan aset aktif</dt><dd>{rp(d.total_cost)}</dd><dt>Aset dilepas</dt><dd>{angka(d.assets.length - active.length)}</dd></dl>
        <button className="primary" disabled={habis} onClick={exportReport}>Ekspor laporan CSV</button>
        {info && <small className="muted">{info}</small>}
        <button onClick={() => { setSheet(null); setTab('history'); }}>Lihat riwayat mutasi</button>
        <Link href="/pembukuan">Buka Pembukuan</Link>
      </Sheet>}
      {sheet === 'more' && <Sheet title="Lainnya" onClose={() => setSheet(null)}>
        <button onClick={() => setSheet('disposal')}>Pelepasan aset</button>
        <button disabled={habis} onClick={exportReport}>Ekspor laporan CSV</button>
        {info && <small className="muted">{info}</small>}
        <Link href="/pengingat">Buka Pengingat</Link>
      </Sheet>}
      {sheet === 'disposal' && <Sheet title="Pilih aset untuk dilepas" onClose={() => setSheet(null)}>
        {active.length ? active.map((a) => <button key={a.id} onClick={() => { setSheet(null); setOpen({ ...a, showDisposal: true }); }}>{a.name}</button>) : <Empty title="Belum ada aset aktif" />}
      </Sheet>}
      {form && <AssetForm kosId={kosId} init={form} categories={categories.filter((item) => item !== 'Tanpa kategori')} onClose={() => setForm(null)} onDone={() => { setForm(null); setOpen(null); load(); }} />}
      {open && <Detail a={open} onClose={() => setOpen(null)} onEdit={() => { setForm(open); setOpen(null); }} onDone={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function accumulatedAt(cost, salvage, months, elapsed) {
  const cents = BigInt(Math.round(cost * 100) - Math.round(salvage * 100));
  const life = BigInt(months);
  return Number((cents * BigInt(elapsed) * 2n + life) / (2n * life)) / 100;
}

function Schedule({ assets }) {
  const [selected, setSelected] = useState('');
  const options = assets.filter((a) => a.life_months != null);
  const asset = options.find((a) => a.id === selected) || options[0];
  if (!asset) return <Empty title="Belum ada jadwal penyusutan" text="Jadwal tersedia untuk aset yang memiliki umur manfaat." />;
  return <section className={styles.panel}>
    <Field label="Aset"><select value={asset.id} onChange={(e) => setSelected(e.target.value)}>
      {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select></Field>
    <ScheduleRows key={asset.id} asset={asset} />
  </section>;
}

function ScheduleRows({ asset }) {
  const [result, setResult] = useState(null);
  const [limit, setLimit] = useState(12);
  useEffect(() => {
    let mounted = true;
    supabase.rpc('asset_schedule', { p_asset: asset.id }).then((response) => { if (mounted) setResult(response); });
    return () => { mounted = false; };
  }, [asset.id]);
  if (!result) return <Loading />;
  if (result.error) return <div className="notice bad">{errMsg(result.error)}</div>;
  const posted = result.data || [];
  const forecast = asset.status === 'aktif' ? Array.from({ length: Math.max(0, asset.life_months - posted.length) }, (_, i) => {
    const n = posted.length + i;
    const amountAt = (elapsed) => accumulatedAt(asset.cost, asset.salvage, asset.life_months, elapsed);
    return { period: addMonthsYm(asset.start_date.slice(0, 7), n) + '-01', amount: roundAmount(amountAt(n + 1) - amountAt(n)), forecast: true };
  }) : [];
  const rows = [...forecast, ...posted];
  return <>
    <p className="small muted">{asset.status === 'aktif' ? `Sisa umur jadwal ${forecast.length} bulan` : 'Penyusutan berhenti saat aset dilepas'}</p>
    {rows.length ? <div className="list">{rows.slice(0, limit).map((row) =>
      <div className="li" key={row.period}><div className="main"><b>{bulanNama(row.period)}</b><small className="muted">{row.forecast ? 'Perkiraan' : 'Periode telah berakhir'}</small></div><b>{rp(row.amount)}</b></div>
    )}</div> : <p className="muted">Belum ada periode penyusutan.</p>}
    {rows.length > limit && <button onClick={() => setLimit(limit + 12)}>Tampilkan 12 bulan berikutnya</button>}
  </>;
}

function History({ kosId }) {
  const [result, setResult] = useState({ rows: [], cursor: null, done: false, error: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    setBusy(true);
    supabase.rpc('activity_feed', { p_kos: kosId, p_group: 'finance', p_limit: 100 }).then(({ data, error }) => {
      if (!mounted) return;
      append(data, error);
    });
    return () => { mounted = false; };
  }, [kosId]);
  function append(data, error) {
    const rows = data?.rows || [];
    setResult((previous) => error ? { ...previous, error } : { rows: [...previous.rows, ...rows.filter((row) => row.agg === 'fixed_asset')], cursor: rows.at(-1)?.id, done: rows.length < 100, error: null });
    setBusy(false);
  }
  function loadMore() {
    setBusy(true);
    supabase.rpc('activity_feed', { p_kos: kosId, p_group: 'finance', p_before: result.cursor, p_limit: 100 }).then(({ data, error }) => append(data, error));
  }
  return <section className={styles.panel}>
    <h2>Riwayat Aset</h2>
    {result.error && <div className="notice bad">{errMsg(result.error)}</div>}
    {result.rows.length ? <div className="list">{result.rows.map((event) => <div className="li" key={event.id}><div className="main">
      <b>{event.summary}</b><small className="muted">{new Date(event.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</small>
    </div></div>)}</div> : !busy && !result.error && <p className="muted">{result.done ? 'Belum ada aktivitas aset yang tercatat.' : 'Belum ditemukan aktivitas aset di bagian riwayat ini.'}</p>}
    {!result.done && <button disabled={busy} onClick={loadMore}>{busy ? 'Memuat…' : 'Telusuri riwayat lebih lama'}</button>}
  </section>;
}

function Simulation({ onClose }) {
  const [input, setInput] = useState({ cost: '', salvage: '', life: '', elapsed: '0', land: false });
  const set = (key, value) => setInput((previous) => ({ ...previous, [key]: value }));
  const cost = parseRp(input.cost);
  const salvage = parseRp(input.salvage);
  const life = Number(input.life);
  const elapsed = Number(input.elapsed);
  const valid = cost > 0 && cost < 1e12 && (input.land || (salvage < cost && Number.isInteger(life) && life >= 1 && life <= 600 && Number.isInteger(elapsed) && elapsed >= 0));
  const accumulated = valid && !input.land ? accumulatedAt(cost, salvage, life, Math.min(elapsed, life)) : 0;
  return <Sheet title="Hitung Penyusutan" onClose={onClose}>
    <Field label="Harga perolehan"><input inputMode="numeric" value={input.cost} onChange={(e) => set('cost', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={input.land} onChange={(e) => set('land', e.target.checked)} />Tanah / aset tanpa penyusutan</label>
    {!input.land && <>
      <Field label="Nilai residu"><input inputMode="numeric" value={input.salvage} onChange={(e) => set('salvage', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
      <Field label="Umur manfaat (bulan)"><input type="number" min="1" max="600" step="1" value={input.life} onChange={(e) => set('life', e.target.value)} /></Field>
      <Field label="Jumlah bulan yang sudah berakhir"><input type="number" min="0" step="1" value={input.elapsed} onChange={(e) => set('elapsed', e.target.value)} /></Field>
    </>}
    {valid ? <dl className="kv">
      <dt>Rata-rata per bulan</dt><dd>{rp(input.land ? 0 : roundAmount((cost - salvage) / life))}</dd>
      <dt>Akumulasi penyusutan</dt><dd>{rp(accumulated)}</dd>
      <dt>Perkiraan nilai buku</dt><dd><b>{rp(roundAmount(cost - accumulated))}</b></dd>
    </dl> : <p className="small muted">Isi harga perolehan dan umur manfaat yang valid. Nilai residu harus lebih kecil dari harga perolehan.</p>}
    <p className="small muted">Simulasi garis lurus. Nilai ini belum dicatat ke pembukuan.</p>
  </Sheet>;
}

function AssetForm({ kosId, init, categories, onClose, onDone }) {
  const edit = init.id ? init : null;
  const exp = init.expense || null;
  const [mode, setMode] = useState(edit ? (edit.source === 'awal' ? 'awal' : 'beli') : exp ? 'tautkan' : 'beli');
  const [f, setF] = useState({ name: edit?.name || (exp?.description || '').replace(/^Beli aset · /, ''), category: edit?.category || '', date: edit?.start_date || today(), cost: edit ? angka(edit.cost) : '',
    account: 'kas', salvage: edit && Number(edit.salvage) > 0 ? angka(edit.salvage) : '', life: edit ? (edit.life_months == null ? '' : String(edit.life_months)) : '', susut: edit ? edit.life_months != null : true, note: edit?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const land = f.category.trim().toLowerCase() === 'tanah';
  const depreciates = f.susut && !land;
  const costN = exp ? Number(exp.amount) : edit && edit.source !== 'awal' ? Number(edit.cost) : parseRp(f.cost) || 0;
  const salv = parseRp(f.salvage) || 0;
  const lifeN = depreciates ? parseInt(f.life, 10) || 0 : 0;
  const preview = costN > 0 && costN < 1e12 && salv < costN && (!depreciates || (lifeN >= 1 && lifeN <= 600));
  const startDate = exp?.date || (edit?.source === 'beli' ? edit.start_date : f.date) || today();
  const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
  const elapsed = Math.min(lifeN, Math.max(0, monthIndex(today()) - monthIndex(startDate)));
  const accumulated = preview && lifeN ? accumulatedAt(costN, salv, lifeN, elapsed) : 0;
  const monthly = preview && lifeN ? roundAmount((costN - salv) / lifeN) : 0;
  const lockValue = Boolean(exp) || (edit && edit.source !== 'awal');
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama aset.');
    if (!lockValue && !(costN > 0)) return toast(mode === 'awal' ? 'Isi perkiraan nilai aset saat ini.' : 'Isi harga beli aset.');
    if (depreciates && !(lifeN >= 1 && lifeN <= 600)) return toast('Isi umur manfaat antara 1 dan 600 bulan.');
    if (salv >= costN) return toast('Nilai sisa harus lebih kecil dari nilai aset.');
    setBusy(true);
    const p = { name: f.name, category: f.category || null, mode, expense_id: exp?.id || null, date: f.date || null, cost: lockValue ? null : costN, account: f.account, salvage: salv, life_months: depreciates ? lifeN : null, note: f.note };
    const ok = await run(() => supabase.rpc('asset_save', { p_kos: kosId, p_id: edit?.id || null, p }), edit ? 'Aset diperbarui' : 'Aset dicatat', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title={edit ? `Ubah · ${edit.name}` : exp ? 'Jadikan aset' : 'Tambah aset'} onClose={onClose}>
      {!edit && !exp && <div className="seg">{[['beli', 'Baru dibeli'], ['awal', 'Sudah dimiliki']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>}
      {!edit && !exp && <span className="small muted">{mode === 'beli' ? 'Pembelian dicatat sebagai pengeluaran modal (uang keluar dari kas/bank), bukan biaya bulan ini.' : 'Untuk aset yang sudah ada sebelum memakai PRASARA. Isi perkiraan nilainya sekarang dan sisa umur pakainya — tidak ada uang keluar.'}</span>}
      {exp && <div className="notice">Dari pengeluaran {tgl(exp.date)} · <b>{rp(exp.amount)}</b>. Nilai & tanggal mengikuti pengeluaran itu.</div>}
      <Field label="Nama aset"><input value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder="mis. Motor pengantar, Kulkas showcase" /></Field>
      <Field label="Kategori (opsional)"><input list="asset-categories" maxLength={40} value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Pilih atau tulis kategori" /><datalist id="asset-categories">{categories.map((k) => <option key={k} value={k} />)}</datalist></Field>
      {!lockValue && <div className="row">
        <Field label={mode === 'awal' ? 'Nilai saat ini' : 'Harga beli'}><input inputMode="numeric" value={f.cost} onChange={(e) => set('cost', e.target.value)} placeholder="mis. 12.000.000" /></Field>
        <Field label={mode === 'awal' ? 'Dicatat mulai' : 'Tanggal beli'}><input type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Field>
      </div>}
      {!edit && mode === 'beli' && <Field label="Dibayar dari"><select value={f.account} onChange={(e) => set('account', e.target.value)}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>}
      <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={depreciates} disabled={land} onChange={(e) => set('susut', e.target.checked)} />{land ? 'Tanah tidak disusutkan' : 'Disusutkan tiap bulan'}</label>
      {depreciates && <>
        <Field label={mode === 'awal' ? 'Sisa umur pakai (bulan)' : 'Umur manfaat (bulan)'} hint="perkiraan berapa lama aset dipakai usaha"><input inputMode="numeric" value={f.life} onChange={(e) => set('life', e.target.value.replace(/\D/g, ''))} /></Field>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{UMUR.map(([v, l]) => <button key={v} className={'sm' + (f.life === v ? ' primary' : '')} onClick={() => set('life', v)}>{l}</button>)}</div>
        <Field label="Perkiraan nilai sisa (opsional)" hint="harga jual kembali di akhir umur pakai; kosong = 0"><input inputMode="numeric" value={f.salvage} onChange={(e) => set('salvage', e.target.value)} placeholder="0" /></Field>
      </>}
      {preview && <div className="notice"><dl className="kv">
        <dt>Perkiraan penyusutan per bulan</dt><dd>{rp(monthly)}</dd>
        <dt>Perkiraan nilai buku sekarang</dt><dd><b>{rp(roundAmount(costN - accumulated))}</b></dd>
      </dl></div>}
      <Field label="Catatan lokasi dan kondisi (opsional)"><textarea value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="Mis. Gudang utama, kondisi baik, nomor seri 012" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {edit && edit.source !== 'awal' && <span className="small muted">Harga & tanggal beli mengikuti pengeluarannya ({rp(edit.cost)}, {tgl(edit.start_date)}). Mengubah umur/nilai sisa otomatis mengoreksi jurnal penyusutan.</span>}
    </Sheet>
  );
}

function Detail({ a, onClose, onEdit, onDone }) {
  const [sch, setSch] = useState(null);
  const [mode, setMode] = useState(a.showDisposal ? 'lepas' : null);
  const [g, setG] = useState({ kind: 'dijual', amount: '', account: 'kas', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.rpc('asset_schedule', { p_asset: a.id }).then(({ data }) => setSch(data || [])); }, [a.id]);
  const amt = g.kind === 'dijual' ? parseRp(g.amount) || 0 : 0;
  const selisih = amt - Number(a.book_value);
  const lepas = async () => {
    if (g.kind === 'dijual' && !(amt > 0)) return toast('Isi uang hasil penjualan.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('asset_dispose', { p_asset: a.id, p: { kind: g.kind, amount: amt, account: g.account, date: g.date || null, note: g.note } }), 'Aset dilepas & tercatat', errMsg);
    setBusy(false); if (ok) onDone();
  };
  const batal = async () => { const r = window.prompt('Alasan membatalkan pelepasan aset ini:') || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('asset_dispose_undo', { p_asset: a.id, p_reason: r }), 'Pelepasan dibatalkan', errMsg)) onDone(); };
  const hapus = async () => { const r = window.prompt(`Alasan menghapus "${a.name}" dari daftar aset (salah catat):`) || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('asset_delete', { p_asset: a.id, p_reason: r }), 'Aset dihapus dari daftar', errMsg)) onDone(); };
  return (
    <Sheet title={a.name} onClose={onClose}>
      <span className={'chip ' + (a.status === 'aktif' ? 'good' : 'void')} style={{ alignSelf: 'flex-start' }}>{a.status === 'aktif' ? 'Dipakai' : `${LEPAS[a.disposal_kind]} ${tgl(a.disposed_date)}`}</span>
      <dl className="kv">
        {a.category && <><dt>Jenis</dt><dd>{a.category}</dd></>}
        <dt>{a.source === 'awal' ? 'Dicatat mulai' : 'Tanggal beli'}</dt><dd>{tgl(a.start_date)}</dd>
        <dt>{a.source === 'awal' ? 'Nilai awal' : 'Harga beli'}</dt><dd>{rp(a.cost)}</dd>
        <dt>Umur manfaat</dt><dd>{umurTeks(a.life_months)}{a.life_months != null ? ` · berjalan ${a.months_done} bulan` : ''}</dd>
        {Number(a.salvage) > 0 && <><dt>Nilai sisa</dt><dd>{rp(a.salvage)}</dd></>}
        <dt>Sudah disusutkan</dt><dd>{rp(a.accumulated)}</dd>
        <dt>Nilai buku</dt><dd><b>{rp(a.book_value)}</b></dd>
        {a.status === 'dilepas' && <><dt>Hasil pelepasan</dt><dd>{rp(a.disposal_amount || 0)} · {Number(a.gain) >= 0 ? `untung ${rp(a.gain)}` : `rugi ${rp(-a.gain)}`}</dd></>}
        {a.disposal_note && <><dt>Keterangan</dt><dd>{a.disposal_note}</dd></>}
        {a.note && <><dt>Catatan</dt><dd>{a.note}</dd></>}
      </dl>
      {a.status === 'aktif' ? <>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button onClick={onEdit}>Ubah</button>
          <button className={mode === 'lepas' ? 'primary' : ''} onClick={() => setMode(mode === 'lepas' ? null : 'lepas')}>Jual / lepas aset</button>
          <button className="ghost danger" onClick={hapus}>Hapus (salah catat)</button>
        </div>
        {mode === 'lepas' && <div className="unitbox">
          <div className="seg">{Object.entries(LEPAS).map(([k, l]) => <button key={k} className={g.kind === k ? 'on' : ''} onClick={() => setG({ ...g, kind: k })}>{l}</button>)}</div>
          <div className="row">
            {g.kind === 'dijual' && <Field label="Uang diterima"><input inputMode="numeric" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} /></Field>}
            <Field label="Tanggal"><input type="date" value={g.date} max={today()} onChange={(e) => setG({ ...g, date: e.target.value })} /></Field>
          </div>
          {g.kind === 'dijual' && <Field label="Uang masuk ke"><select value={g.account} onChange={(e) => setG({ ...g, account: e.target.value })}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>}
          <Field label="Keterangan (opsional)"><input value={g.note} maxLength={300} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="mis. dijual ke Pak Budi" /></Field>
          <p className="small" style={{ margin: 0 }}>Nilai buku {rp(a.book_value)} → {selisih >= 0 ? <b style={{ color: 'var(--good)' }}>untung {rp(selisih)}</b> : <b style={{ color: 'var(--bad)' }}>rugi {rp(-selisih)}</b>} (masuk {selisih >= 0 ? 'Pendapatan lain' : 'Beban non-operasional'} di Pembukuan). Penyusutan berhenti.</p>
          <button className="primary" disabled={busy} onClick={lepas}>{busy ? 'Menyimpan…' : 'Simpan pelepasan'}</button>
        </div>}
      </> : <button className="ghost" onClick={batal}>Batalkan pelepasan (salah catat)</button>}
      {a.life_months != null && <>
        <span className="label">Riwayat penyusutan</span>
        {sch === null ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : sch.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada — penyusutan pertama dicatat setelah bulan perolehan berakhir.</p>
          : <div className="list">{sch.slice(0, 12).map((s) => <div className="li" key={s.period}><span className="small">{bulanNama(s.period)}</span><b className="small">{rp(s.amount)}</b></div>)}{sch.length > 12 && <span className="small muted">… dan {sch.length - 12} bulan sebelumnya</span>}</div>}
      </>}
    </Sheet>
  );
}
