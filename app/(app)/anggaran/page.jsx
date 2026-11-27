'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './anggaran.module.css';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { DataTable } from '@/components/Page';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Empty, Sheet, Field, run, toast } from '@/components/ui';
import { rp, angka, errMsg, bulan, thisMonth, addMonthsYm, parseRp, monthEnd, tgl } from '@/lib/format';
import { canArea } from '@/lib/business';

const pct = (amount, spent) => Number(amount) > 0 ? Number(spent) * 100 / Number(amount) : null;
const pctText = (value) => value == null ? '—' : `${angka(Math.round(value * 10) / 10)}%`;
const tone = (value) => value == null ? 'none' : value >= 100 ? 'bad' : value >= 80 ? 'warn' : 'good';
const KIND = { operasional: 'Operasional', modal: 'Modal/aset', non_operasional: 'Non-operasional' };

// Anggaran & realisasi (V2 §4.1, Paket Bisnis): rencana biaya per kategori per bulan dibanding pengeluaran yang tercatat.
// Realisasi dihitung server dari pengeluaran (budget_report); simpan/salin lewat budget_save/budget_copy (izin & paket dicek di server).
export default function Anggaran() {
  const { kos, kosId, ver } = useKos();
  if (!kos || !kosId) return <Loading />;
  return <BudgetWorkspace key={kosId} {...{ kos, kosId, ver }} />;
}

function BudgetWorkspace({ kos, kosId, ver }) {
  const [ym, setYm] = useState(thisMonth);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('category');
  const [kind, setKind] = useState('');
  const [sheet, setSheet] = useState(null);
  const request = useRef(0);
  const periodInput = useRef(null);
  const owner = canArea(kos, 'team');
  const canSettings = canArea(kos, 'settings');
  const previousMonth = addMonthsYm(ym, -1);
  const muat = async () => {
    const id = ++request.current;
    const { data, error } = await supabase.rpc('budget_report', { p_kos: kosId, p_month: ym + '-01' });
    if (id !== request.current) return;
    setErr(error ? errMsg(error) : null);
    if (!error) setD(data);
  };
  useEffect(() => { muat(); return () => { request.current++; }; }, [kosId, ym, ver]);

  const changeMonth = (value) => {
    if (busy || value === ym || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setD(null);
    setErr(null);
    setSheet(null);
    setYm(value);
  };
  const save = async (row, value) => {
    if (!row || busy) return;
    const amount = parseRp(value);
    if ((value.trim() && (!/\d/.test(value) || /[-−]/.test(value))) || amount > 999999999999) return toast('Nominal tidak valid');
    if (Number(row.anggaran || 0) === amount) { setSheet(null); return; }
    setBusy(true);
    const { error } = await supabase.rpc('budget_save', { p_kos: kosId, p_month: ym + '-01', p_category: row.id, p_amount: amount });
    if (error) { setBusy(false); return toast(errMsg(error)); }
    setSheet(null);
    toast(amount ? 'Anggaran disimpan' : 'Anggaran dihapus');
    await muat();
    setBusy(false);
  };
  const copy = async () => {
    if (busy || !d?.aktif || !d.ada_bulan_lalu) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('budget_copy', { p_kos: kosId, p_from: previousMonth + '-01', p_to: ym + '-01' });
    if (error) { setBusy(false); return toast(errMsg(error)); }
    setSheet(null);
    toast(data ? `${angka(data)} kategori disalin` : 'Tidak ada yang perlu disalin');
    await muat();
    setBusy(false);
  };

  const rows = d?.baris || [];
  const shown = rows.filter((row) => !kind || row.kind === kind);
  const budgeted = shown.filter((row) => Number(row.anggaran) > 0);
  const total = budgeted.reduce((sum, row) => sum + Number(row.anggaran), 0);
  const spent = budgeted.reduce((sum, row) => sum + Number(row.realisasi), 0);
  const noCategory = kind ? 0 : Number(d?.tanpa_kategori || 0);
  const outside = shown.filter((row) => !(Number(row.anggaran) > 0)).reduce((sum, row) => sum + Number(row.realisasi), noCategory);
  const used = pct(total, spent);
  const warning = budgeted.filter((row) => tone(pct(row.anggaran, row.realisasi)) === 'warn');
  const reached = budgeted.filter((row) => Number(row.realisasi) >= Number(row.anggaran));
  const expenseHref = kos.business_type === 'properti' ? '/pengeluaran' : '/kas';

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Budget Planning & Control Center">
        <div className={styles.heroCopy}>
          <h1>Anggaran</h1><p>Tetapkan batas bulanan per kategori dan bandingkan dengan pengeluaran yang tercatat.</p>
          <PageHelp page="anggaran" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Anggaran <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/anggaran-ringkasan.webp" alt="" fill priority sizes="(max-width: 600px) 36vw, 295px" /></span>
      </section>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => setSheet({ type: 'edit' })} disabled={!d?.aktif || !rows.length || busy}><NavIcon name="plus" /><span>Anggaran Baru</span></button>
        <button onClick={() => { if (periodInput.current?.showPicker) { try { periodInput.current.showPicker(); return; } catch {} } setSheet({ type: 'period' }); }} disabled={busy}><NavIcon name="calendar" /><span>Pilih Periode</span></button>
        <button onClick={() => setTab('compare')}><NavIcon name="/laporan" /><span>Laporan Anggaran</span></button>
        <button onClick={() => setSheet({ type: 'more' })}><NavIcon name="more" /><span>Lainnya</span></button>
      </div>
      <div className={styles.period}>
        <button aria-label="Bulan sebelumnya" onClick={() => changeMonth(previousMonth)} disabled={busy}><NavIcon name="prev" size={17} /></button>
        <label><NavIcon name="calendar" /><b>{bulan(ym)}</b><input ref={periodInput} aria-label="Bulan anggaran" type="month" value={ym} onChange={(event) => changeMonth(event.target.value)} disabled={busy} /></label>
        <button aria-label="Bulan berikutnya" onClick={() => changeMonth(addMonthsYm(ym, 1))} disabled={busy}><NavIcon name="next" size={17} /></button>
      </div>
      {err ? <p className="notice bad">{/budget_report/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</p> : !d ? <Loading /> : <>
        {!d.aktif && <FiturUpgrade kosId={kosId} owner={owner} event="BUDGET.CREATE_REQUESTED" title="Anggaran & realisasi tersedia mulai Paket Bisnis" text="Pengeluaran per kategori tetap tersedia di paket Anda." />}
        <div className={styles.metrics}>
          {d.aktif && <>
            <BudgetMetric icon="/anggaran" label="Anggaran" value={rp(total)} note={`${angka(budgeted.length)} kategori`} />
            <BudgetMetric icon="coins" label="Realisasi" value={rp(spent)} note={used == null ? '— dari anggaran' : `${pctText(used)} dari anggaran`} />
            <BudgetMetric icon="wallet" label="Sisa Anggaran" value={rp(total - spent)} note={total - spent < 0 ? 'Melampaui anggaran' : 'Belum terpakai'} />
          </>}
          <BudgetMetric icon="info" label={d.aktif ? 'Di Luar Anggaran' : 'Total Pengeluaran'} value={rp(d.aktif ? outside : spent + outside)} note={d.aktif ? kind ? 'Kategori tanpa anggaran' : 'Tanpa anggaran atau tanpa kategori' : bulan(ym)} />
        </div>
        <div className={styles.tabs} aria-label="Tampilan anggaran">{[['category', 'Per Kategori'], ['actual', 'Realisasi'], ['compare', 'Perbandingan'], ['history', 'Riwayat']].map(([key, label]) => (
          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}</div>
        {tab !== 'history' && <div className={styles.filters} aria-label="Jenis kategori">{[['', 'Semua'], ...Object.entries(KIND)].map(([key, label]) => (
          <button key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>
        ))}</div>}
        {tab !== 'history' && d.aktif && (warning.length > 0 || reached.length > 0) && <aside className={styles.alert}>
          <NavIcon name="info" /><span>{[warning.length > 0 && `${angka(warning.length)} kategori mencapai 80%`, reached.length > 0 && `${angka(reached.length)} kategori mencapai atau melampaui 100%`].filter(Boolean).join(' · ')}</span>
        </aside>}
        {tab === 'category' && <div className={styles.categories}>
          {shown.length ? shown.map((row) => {
            const planned = Number(row.anggaran || 0);
            const amount = Number(row.realisasi);
            const percent = pct(planned, amount);
            return <article key={row.id} className={styles.category}>
              <div className={styles.categoryHead}><span className={styles.categoryIcon}><NavIcon name={row.kind === 'modal' ? '/aset' : '/pengeluaran'} /></span>
                <div><h2>{row.nama}</h2><small>{KIND[row.kind] || row.kind}</small></div>
                <b>{d.aktif ? rp(planned) : '—'}</b>
              </div>
              <div className={styles.amounts}><span>Realisasi {rp(amount)} · {pctText(percent)}</span><span>{planned ? planned < amount ? `Lebih ${rp(amount - planned)}` : `Sisa ${rp(planned - amount)}` : 'Belum ditetapkan'}</span></div>
              {d.aktif && percent != null && <progress max="100" value={Math.min(100, Math.max(0, percent))} data-tone={tone(percent)} aria-label={`Pemakaian anggaran ${row.nama}`} />}
              <div className={styles.categoryActions}>
                {d.aktif && <button onClick={() => setSheet({ type: 'edit', row })}>Atur Anggaran</button>}
                {amount !== 0 && <button onClick={() => setSheet({ type: 'expense', row })}>Lihat Transaksi</button>}
              </div>
            </article>;
          }) : <Empty title="Belum ada kategori biaya" text="Kategori anggaran mengikuti kategori pengeluaran bisnis." />}
        </div>}
        {tab === 'actual' && <section className={styles.panel}>
          <h2>Realisasi {bulan(ym)}</h2>
          {shown.length ? <DataTable caption="Realisasi per kategori" rows={shown} onRow={(row) => setSheet({ type: 'expense', row })} rowLabel={(row) => row.nama} columns={[
            { key: 'name', label: 'Kategori', render: (row) => row.nama },
            { key: 'kind', label: 'Jenis', render: (row) => KIND[row.kind] || row.kind },
            { key: 'used', label: 'Realisasi', align: 'right', render: (row) => rp(row.realisasi) },
            { key: 'pct', label: 'Penggunaan', align: 'right', render: (row) => pctText(pct(row.anggaran, row.realisasi)) },
          ]} card={(row) => <><b>{row.nama}</b><div>{rp(row.realisasi)} · {pctText(pct(row.anggaran, row.realisasi))}</div></>} /> : <Empty title="Belum ada kategori" />}
        </section>}
        {tab === 'compare' && <BudgetComparison kosId={kosId} ym={ym} rows={shown} active={d.aktif} />}
        {tab === 'history' && <BudgetHistory kosId={kosId} allowed={canSettings} version={d} />}
        {tab !== 'history' && noCategory !== 0 && <button onClick={() => setSheet({ type: 'expense', row: null })}>Lihat transaksi tanpa kategori · {rp(noCategory)}</button>}
        {tab === 'category' && canSettings && <button className={styles.addCategory} onClick={() => setSheet({ type: 'category' })}><NavIcon name="plus" />Tambah Kategori Anggaran</button>}
      </>}
      <aside className={styles.notice}><NavIcon name="info" /><p><b>Tips.</b> Pantau realisasi secara berkala. Anggaran modal/aset ditampilkan terpisah dari operasional. <Link href={expenseHref}>Buka catatan pengeluaran</Link>.</p></aside>

      {sheet?.type === 'period' && <Sheet title="Pilih Periode" onClose={() => setSheet(null)}><Field label="Bulan"><input type="month" value={ym} onChange={(event) => changeMonth(event.target.value)} /></Field></Sheet>}
      {sheet?.type === 'more' && <Sheet title="Lainnya" onClose={() => setSheet(null)}>
        <button disabled={!d?.aktif || !d.ada_bulan_lalu || busy} onClick={() => setSheet({ type: 'copy' })}>Salin Anggaran Bulan Sebelumnya</button>
        {canSettings && <button onClick={() => setSheet({ type: 'category' })}>Tambah Kategori Anggaran</button>}
        <button onClick={() => { setTab('history'); setSheet(null); }}>Riwayat Perubahan</button>
      </Sheet>}
      {sheet?.type === 'copy' && <Sheet title="Salin Anggaran" onClose={() => { if (!busy) setSheet(null); }}>
        <p>Salin {bulan(previousMonth)} ke {bulan(ym)}. Sistem hanya mengisi kategori yang belum memiliki anggaran.</p>
        <button className="primary" onClick={copy} disabled={busy}>{busy ? 'Menyalin…' : 'Konfirmasi Salin'}</button>
      </Sheet>}
      {sheet?.type === 'edit' && d?.aktif && <EditBudget rows={rows} initial={sheet.row} busy={busy} onClose={() => { if (!busy) setSheet(null); }} onSave={save} />}
      {sheet?.type === 'category' && canSettings && <BudgetCategory kosId={kosId} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); muat(); }} />}
      {sheet?.type === 'expense' && <Sheet title={sheet.row?.nama || 'Transaksi Tanpa Kategori'} onClose={() => setSheet(null)}><ExpenseRows key={ym + (sheet.row?.id || 'none')} kosId={kosId} ym={ym} categoryId={sheet.row?.id ?? null} /></Sheet>}
    </div>
  );
}

function BudgetMetric({ icon, label, value, note }) {
  return <article className={styles.metric}><span><NavIcon name={icon} /></span><div><b>{label}</b><strong className={value.length > 15 ? styles.longValue : undefined}>{value}</strong><small>{note}</small></div></article>;
}

function EditBudget({ rows, initial, busy, onClose, onSave }) {
  const [categoryId, setCategoryId] = useState(initial?.id ?? '');
  const [value, setValue] = useState(initial?.anggaran ? angka(initial.anggaran) : '');
  const row = rows.find((item) => item.id === categoryId);
  return <Sheet title={initial ? `Anggaran · ${initial.nama}` : 'Anggaran Baru'} onClose={onClose}>
    <Field label="Kategori pengeluaran"><select value={categoryId} disabled={Boolean(initial) || busy} onChange={(event) => {
      setCategoryId(event.target.value); const item = rows.find((candidate) => candidate.id === event.target.value); setValue(item?.anggaran ? angka(item.anggaran) : '');
    }}><option value="">Pilih kategori</option>{rows.map((item) => <option value={item.id} key={item.id}>{item.nama} · {KIND[item.kind] || item.kind}</option>)}</select></Field>
    <Field label="Batas pengeluaran bulanan (Rp)" hint="Kosongkan atau isi 0 untuk menghapus batas."><input value={value} inputMode="numeric" disabled={busy} onChange={(event) => setValue(event.target.value)} /></Field>
    <button className="primary" disabled={!row || busy} onClick={() => onSave(row, value)}>{busy ? 'Menyimpan…' : 'Simpan Anggaran'}</button>
  </Sheet>;
}

function BudgetCategory({ kosId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('operasional');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    if (await run(() => supabase.from('expense_categories').insert({ kos_id: kosId, name: name.trim(), kind }), 'Kategori pengeluaran ditambahkan', errMsg)) onSaved();
    setBusy(false);
  };
  return <Sheet title="Tambah Kategori Anggaran" onClose={() => { if (!busy) onClose(); }}>
    <p>Kategori ini juga tersedia saat mencatat pengeluaran.</p>
    <Field label="Nama kategori"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></Field>
    <Field label="Jenis kategori"><select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(KIND).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <button className="primary" onClick={save} disabled={!name.trim() || busy}>Simpan Kategori</button>
  </Sheet>;
}

function BudgetComparison({ kosId, ym, rows, active }) {
  const prev = addMonthsYm(ym, -1);
  const [data, setData] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    supabase.rpc('budget_report', { p_kos: kosId, p_month: prev + '-01' }).abortSignal(controller.signal)
      .then(({ data, error }) => { if (!controller.signal.aborted) setData({ prev, data, error }); });
    return () => controller.abort();
  }, [kosId, prev]);
  if (data?.prev !== prev) return <Loading />;
  if (data.error) return <p className="notice bad">{errMsg(data.error)}</p>;
  const old = new Map((data.data?.baris || []).map((row) => [row.id, row]));
  const budgetValue = (value) => Number(value) > 0 ? rp(value) : '—';
  return <section className={styles.panel}>
    <h2>{bulan(ym)} dan {bulan(prev)}</h2>
    {rows.length ? <DataTable caption="Perbandingan anggaran dan realisasi" rows={rows} columns={[
      { key: 'name', label: 'Kategori', render: (row) => <>{row.nama} <small>{KIND[row.kind] || row.kind}</small></> },
      ...(active ? [{ key: 'budget', label: 'Anggaran sekarang', align: 'right', render: (row) => budgetValue(row.anggaran) },
        { key: 'oldBudget', label: 'Anggaran lalu', align: 'right', render: (row) => budgetValue(old.get(row.id)?.anggaran) }] : []),
      { key: 'actual', label: 'Realisasi sekarang', align: 'right', render: (row) => rp(row.realisasi) },
      { key: 'oldActual', label: 'Realisasi lalu', align: 'right', render: (row) => rp(row.bulan_lalu) },
    ]} card={(row) => <><b>{row.nama}</b>{active && <div>Anggaran {budgetValue(row.anggaran)} · lalu {budgetValue(old.get(row.id)?.anggaran)}</div>}<div>Realisasi {rp(row.realisasi)} · lalu {rp(row.bulan_lalu)}</div></>} /> : <Empty title="Belum ada kategori untuk dibandingkan" />}
  </section>;
}

function BudgetHistory({ kosId, allowed, version }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    supabase.from('config_history').select('id,action,target,actor,before,after,created_at').eq('kos_id', kosId)
      .in('action', ['ubah_anggaran', 'salin_anggaran']).order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal)
      .then((response) => { if (!controller.signal.aborted) setResult(response); });
    return () => controller.abort();
  }, [kosId, allowed, version]);
  if (!allowed) return <p className="notice">Riwayat audit tersedia bagi pengguna dengan izin Pengaturan.</p>;
  if (!result) return <Loading />;
  if (result.error) return <p className="notice bad">{errMsg(result.error)}</p>;
  return <section className={styles.panel}><h2>Riwayat Perubahan Anggaran</h2>
    {result.data.length ? <div className="list">{result.data.map((log) => <div className="li" key={log.id}><div className="main">
      <b>{log.action === 'salin_anggaran' ? 'Salin anggaran' : 'Ubah anggaran'} · {log.target}</b>
      <small>{log.actor || 'Sistem'} · {tgl(String(log.created_at).slice(0, 10))}</small>
      <small>{log.action === 'salin_anggaran' ? `${angka(log.after?.kategori)} kategori disalin` : `${log.before?.anggaran == null ? '—' : rp(log.before.anggaran)} → ${log.after?.anggaran == null ? '—' : rp(log.after.anggaran)}`}</small>
    </div></div>)}</div> : <Empty title="Belum ada riwayat perubahan anggaran" />}
  </section>;
}

function ExpenseRows({ kosId, ym, categoryId }) {
  const PAGE_SIZE = 25;
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    let query = supabase.from('expenses').select('id, date, description, amount', { count: 'exact' })
      .eq('kos_id', kosId).gte('date', ym + '-01').lte('date', monthEnd(ym))
      .order('date', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE - 1);
    query = categoryId == null ? query.is('category_id', null) : query.eq('category_id', categoryId);
    query.then((response) => { if (active) setResult(response); });
    return () => { active = false; };
  }, [kosId, ym, categoryId, offset]);
  if (!result) return <Loading />;
  if (result.error) return <div className="notice bad">{errMsg(result.error)}</div>;
  if (!result.data.length) return <p className="small muted">Belum ada transaksi pada halaman ini.</p>;
  return <div className="list">
    {result.data.map((row) => <div className="li small" key={row.id}><span>{tgl(row.date)} · {row.description || 'Pengeluaran'}</span><b>{rp(row.amount)}</b></div>)}
    <div className="row between">
      <button className="sm ghost" disabled={!offset} onClick={() => setOffset(offset - PAGE_SIZE)}>Sebelumnya</button>
      <span className="small muted">{offset + 1}–{offset + result.data.length} dari {result.count}</span>
      <button className="sm ghost" disabled={offset + PAGE_SIZE >= result.count} onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya</button>
    </div>
  </div>;
}
