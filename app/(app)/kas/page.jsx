'use client';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './kas.module.css';
import { useBaru } from '@/lib/useBaru';
import { withApproval } from '@/lib/approval';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { DataTable, FilterToolbar } from '@/components/Page';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg, waLink, ENTRY } from '@/lib/format';
import { uid } from '@/lib/retail';
import LokasiBar from '@/components/LokasiBar';
import Lampiran from '@/components/Lampiran';
import { multiLoc } from '@/lib/business';
import Pinjaman from '@/components/Pinjaman';

const ACC = { kas: 'Kas (laci)', bank: 'Bank' };
const TRANSFERS = new Set(['setor_bank', 'tarik_bank', 'pindah_kas']);
const EMPTY_FILTERS = { from: '', to: '', account: '', category: '', type: '' };
const OTHER = {
  setoran_modal: ['Setor modal / uang awal', 'masuk'],
  prive: ['Diambil pemilik untuk pribadi (prive)', 'keluar'],
  pendapatan_lain: ['Pemasukan lain (bukan jualan)', 'masuk'],
  setor_bank: ['Setor uang kas ke bank', 'pindah'],
  tarik_bank: ['Tarik uang bank ke kas', 'pindah'],
};

async function readCashRows(makeQuery, signal) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await makeQuery().range(from, from + 499).abortSignal(signal);
    if (error) return { error };
    rows.push(...data);
    if (data.length < 500) return { data: rows };
  }
}

// Kas & kasbon toko: saldo kas/bank dihitung dari semua catatan; kasbon pelanggan & utang supplier dengan pelunasan
export default function Kas() {
  const { kos, kosId, ver } = useKos();
  if (!kos || !kosId) return <Loading />;
  return <CashWorkspace key={kosId} {...{ kos, kosId, ver }} />;
}

function CashWorkspace({ kos, kosId, ver }) {
  const [tab, setTab] = useState('kas');
  useEffect(() => { try { const t = new URLSearchParams(window.location.search).get('tab'); if (['kas', ...(kos.business_type === 'retail' ? ['kasbon'] : []), ...(kos.business_type !== 'kustom' ? ['utang'] : []), 'pinjaman', 'arus'].includes(t)) setTab(t); } catch {} }, []); // tautan dari dashboard
  const [q, setQ] = useState('');
  const [history, setHistory] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [revision, setRevision] = useState(0);
  const [filteredFeed, setFilteredFeed] = useState(null);
  const [feedError, setFeedError] = useState(null);
  const filtered = Object.values(filters).some(Boolean);
  const scope = history || filtered;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);
  useBaru((v) => {
    if (v === 'setor_bank') {
      setTab('kas');
      setSheet({ t: 'cash', kind: 'setor_bank' });
    } else setSheet(v === 'masuk' ? { t: 'cash', kind: 'pendapatan_lain' } : { t: 'exp' });
  }); // (+) › Catat pemasukan / pengeluaran
  const load = async () => {
    const multi = multiLoc(kos);
    const [l, e, c, p, cat, loc] = await Promise.all([
      supabase.rpc('retail_ledger', { p_kos: kosId }),
      supabase.from('expenses').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(40),
      supabase.from('cash_entries').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(40),
      supabase.from('debt_payments').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
      supabase.from('expense_categories').select('*').eq('kos_id', kosId).order('name'),
      multi ? supabase.rpc('cash_by_location', { p_kos: kosId }) : Promise.resolve({ data: null }),
    ]);
    const x = l.error || e.error || c.error || p.error || cat.error;
    if (x) return setErr(errMsg(x));
    setErr(null);
    setD({ led: l.data, expenses: e.data, cash: c.data, pays: p.data, cats: cat.data, loc: loc.data });
  };
  useEffect(() => { load(); }, [kosId, ver, kos?.locs?.list?.length, revision]);
  useEffect(() => {
    if (!scope || tab !== 'kas') return;
    const controller = new AbortController();
    const { signal } = controller;
    const query = (table) => {
      let source = supabase.from(table).select('*').eq('kos_id', kosId);
      if (filters.from) source = source.gte('date', filters.from);
      if (filters.to) source = source.lte('date', filters.to);
      if (table === 'debt_payments') source = source.eq('status', 'selesai');
      return source.order('date', { ascending: false }).order('created_at', { ascending: false }).order('id');
    };
    setFilteredFeed(null);
    setFeedError(null);
    Promise.all(['expenses', 'cash_entries', 'debt_payments'].map((table) => readCashRows(() => query(table), signal)))
      .then(([expenses, cash, pays]) => {
        if (signal.aborted) return;
        const error = expenses.error || cash.error || pays.error;
        if (error) return setFeedError(errMsg(error));
        setFilteredFeed({ expenses: expenses.data, cash: cash.data, pays: pays.data });
      });
    return () => controller.abort();
  }, [scope, filters.from, filters.to, kosId, ver, revision, tab]);
  if (err) return <div className="notice bad">{err.includes('retail_ledger') || err.includes('debt_payments') || err.includes('account') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const { led } = d;
  const kustom = kos.business_type === 'kustom'; // bisnis kustom: uang masuk dari catatan (Business Builder), tanpa kasbon & utang supplier
  const jasa = kos.business_type === 'jasa' || kustom; // bisnis jasa: piutang pelanggan ada di Pesanan (sisa bayar), bukan kasbon
  const totKasbon = led.kasbon.reduce((a, x) => a + Number(x.sisa), 0);
  const totUtang = led.utang.reduce((a, x) => a + Number(x.sisa), 0);
  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const done = () => { setSheet(null); setRevision((value) => value + 1); };
  const multi = multiLoc(kos) && Array.isArray(d.loc);
  const locName = (id) => kos.locs?.list?.find((b) => b.id === id)?.name || d.loc?.find((b) => b.id === id)?.name || '';
  const at = (id) => (multi && id ? ` · ${locName(id)}` : '');

  // Riwayat catatan manual (penjualan & belanja ada di menunya sendiri)
  const activity = (scope && filteredFeed) || d;
  const feed = [
    ...activity.expenses.map((x) => ({ id: x.id, t: 'exp', date: x.date, at: x.created_at, type: 'expense', category: x.category_id, accounts: [x.account], label: catName.get(x.category_id) || 'Biaya', note: x.description, acc: (ACC[x.account] || x.account) + at(x.branch_id), amt: -Number(x.amount) })),
    ...activity.cash.map((x) => ({ id: x.id, t: 'cash', date: x.date, at: x.created_at, type: x.kind, accounts: ['setor_bank', 'tarik_bank'].includes(x.kind) ? ['kas', 'bank'] : [x.account], label: x.kind === 'pindah_kas' ? 'Pindah uang kas antar lokasi' : OTHER[x.kind]?.[0] || ENTRY[x.kind]?.[0] || x.kind, note: x.description,
      acc: x.kind === 'pindah_kas' ? `${locName(x.branch_id)} → ${locName(x.to_branch)}` : (x.kind === 'setor_bank' ? 'kas → bank' : x.kind === 'tarik_bank' ? 'bank → kas' : ACC[x.account] || x.account) + at(x.branch_id),
      amt: ['prive', 'bayar_pinjaman', 'bayar_pajak'].includes(x.kind) ? -Number(x.amount) : TRANSFERS.has(x.kind) ? 0 : Number(x.amount), raw: Number(x.amount) })),
    ...activity.pays.filter((x) => x.status === 'selesai').map((x) => ({ id: x.id, t: 'pay', date: x.date, at: x.created_at, type: x.kind, accounts: [x.account], label: x.kind === 'piutang' ? 'Pelunasan kasbon' : 'Bayar utang supplier', note: x.note, acc: (ACC[x.account] || x.account) + at(x.branch_id), amt: x.kind === 'piutang' ? Number(x.amount) : -Number(x.amount), contact: x.contact_id })),
  ].sort((a, b) => (a.date === b.date ? String(b.at).localeCompare(String(a.at)) : b.date.localeCompare(a.date)));

  const title = kustom ? 'Kas & Biaya' : jasa ? 'Kas' : 'Kas & Kasbon';
  const help = kustom ? 'kas-kustom' : jasa ? 'kas-jasa' : 'kas';
  const needle = q.trim().toLowerCase();
  const rows = feed.filter((item) => (
    (!needle || `${item.label} ${item.acc} ${item.note || ''}`.toLowerCase().includes(needle)) &&
    (!filters.account || item.accounts.includes(filters.account)) &&
    (!filters.category || item.category === filters.category) &&
    (!filters.type || (filters.type === 'transfer' ? TRANSFERS.has(item.type) : item.type === filters.type))
  ));
  const displayAmount = (item) => <b className={styles.amount} data-direction={item.amt > 0 ? 'in' : item.amt < 0 ? 'out' : 'transfer'}>
    {item.amt > 0 ? '+ ' : item.amt < 0 ? '− ' : ''}{rp(item.amt === 0 ? item.raw : Math.abs(item.amt))}
  </b>;
  const acts = (item) => <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
    {item.t === 'exp' && <button className="sm ghost" aria-label="Foto nota" onClick={() => setSheet({ t: 'att', f: item })}>📎</button>}
    <button className="sm ghost" aria-label="Hapus atau batalkan" onClick={() => setSheet({ t: 'del', f: item })}>✕</button>
  </div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Cash Flow & Receivables Management Center">
        <div className={styles.heroCopy}><h1>{title}</h1>
          <p>{jasa ? 'Kelola kas, bank, dan biaya operasional.' : 'Kelola saldo kas, bank, kasbon pelanggan, utang supplier, dan arus uang.'}</p>
          <PageHelp page={help} label={<><NavIcon name="/buku-besar" size={17} /> Panduan {title} <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/kas-kasbon.webp" alt="" fill sizes="(max-width: 600px) 35vw, 295px" priority /></span>
      </section>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => setSheet({ t: 'exp' })}><NavIcon name="/tagihan" />＋ Biaya</button>
        <button onClick={() => setSheet({ t: 'choose', kind: 'deposit' })}><NavIcon name="/pengeluaran" />Setor Kas</button>
        <button onClick={() => setSheet({ t: 'choose', kind: 'withdraw' })}><NavIcon name="upload" />Tarik Kas</button>
        <button onClick={() => setSheet({ t: 'cash', kind: 'pendapatan_lain' })}><NavIcon name="more" />Uang Lainnya</button>
      </div>
      <div className={styles.metrics}>
        <CashMetric icon="wallet" label="Kas (Laci)" value={rp(led.kas)} note={Number(led.kas) < 0 ? 'Saldo kas tercatat minus' : 'Menurut catatan'} />
        <CashMetric icon="/pembayaran" label="Bank" value={rp(led.bank)} note="Saldo seluruh rekening tercatat" />
        {!jasa && <CashMetric icon="/akun" label="Kasbon Pelanggan" value={rp(totKasbon)} note={`${angka(led.kasbon.length)} orang`} />}
        {!kustom && <CashMetric icon="/grosir" label="Utang ke Supplier" value={rp(totUtang)} note={`${angka(led.utang.length)} supplier`} />}
      </div>
      <div className={styles.total}><NavIcon name="wallet" /><span>Total Dana Tersedia</span><b>{rp(Number(led.kas || 0) + Number(led.bank || 0))}</b></div>
      <LokasiBar note="Biaya, uang masuk/keluar lain, dan pembayaran kasbon/utang dicatat di lokasi ini." />
      {multi && tab === 'kas' && <section className="panel">
        <div className="row between"><h3>Uang kas per lokasi</h3><button className="sm" onClick={() => setSheet({ t: 'move' })}>Pindahkan uang kas</button></div>
        <div className="list">{d.loc.map((b) => <div className="li" key={b.id}><span className="small">{b.name}{b.is_main ? ' (utama)' : ''}{!b.active ? ' · nonaktif' : ''}</span><b className="small" style={{ color: Number(b.kas) < 0 ? 'var(--bad)' : undefined }}>{rp(b.kas)}</b></div>)}</div>
        <span className="small muted">Uang laci di tiap lokasi menurut catatan (penjualan tunai, belanja tunai, biaya, kasbon, dan pindah kas). Bank tetap satu untuk seluruh bisnis.</span>
      </section>}
      <div className={styles.tabs} aria-label="Menu kas">{[['kas', 'Kas & Bank'], ...(jasa ? [] : [['kasbon', 'Kasbon Pelanggan']]), ...(kustom ? [] : [['utang', 'Utang Supplier']]), ['pinjaman', 'Pinjaman'], ['arus', 'Arus Kas']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === 'kas' && <>
        <aside className={styles.notice}><NavIcon name="info" /><p><b>Saldo</b> mengikuti transaksi, pelunasan, dan catatan kas. Transfer antar akun hanya memindahkan dana.{kustom && <> Sumber catatan diatur di <Link href="/builder?langkah=data">Business Builder</Link>.</>}{jasa && !kustom && <> Sisa bayar pelanggan ada di <Link href="/pesanan">Pesanan</Link>.</>}</p></aside>
        <div className={styles.toolbar}>
          <FilterToolbar q={q} onQ={setQ} placeholder="Cari jenis, akun, atau keterangan" />
          <button onClick={() => { setDraft(filters); setSheet({ t: 'filters' }); }}><NavIcon name="filter" size={17} />{filtered ? 'Filter Aktif' : 'Filter'}</button>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>{history ? 'Riwayat Catatan Kas' : 'Transaksi Terbaru'}</h2><button onClick={() => setHistory(!history)}>{history ? 'Ringkas' : 'Lihat Semua'}<NavIcon name="next" size={15} /></button></div>
          <p className="small muted">Catatan biaya, uang lainnya, dan pelunasan. Penjualan dan pembelian lengkap tersedia di modul masing-masing.</p>
          {scope && feedError ? <p className="notice bad">{feedError}</p> : scope && !filteredFeed ? <Loading /> : rows.length === 0 ? <Empty title="Tidak ada catatan kas yang cocok" /> :
            history ? <DataTable rows={rows} rowKey={(item) => item.t + item.id} caption="Catatan kas & bank" pageSize={50}
              columns={[
                { key: 'date', label: 'Tanggal', sort: (item) => item.date, render: (item) => tgl(item.date) },
                { key: 'label', label: 'Jenis', sort: (item) => item.label, render: (item) => <b>{item.label}</b> },
                { key: 'acc', label: 'Akun', render: (item) => item.acc },
                { key: 'note', label: 'Keterangan', hide: 'tablet', render: (item) => item.note },
                { key: 'amt', label: 'Jumlah', align: 'right', sort: (item) => item.amt, render: displayAmount },
                { key: 'act', label: <span className="vh">Tindakan</span>, render: acts },
              ]}
              card={(item) => <><div className="dt-row"><b>{item.label}</b>{displayAmount(item)}</div><div className="dt-row"><span>{tgl(item.date)} · {item.acc}</span>{acts(item)}</div></>} />
              : <div className={styles.recent}>{rows.slice(0, 5).map((item) => <button key={item.t + item.id} onClick={() => setSheet({ t: 'entry', f: item })}>
                <span className={styles.entryIcon}><NavIcon name={item.amt > 0 ? 'upload' : item.amt < 0 ? '/pengeluaran' : 'swap'} /></span>
                <span><b>{item.label}</b><small>{tgl(item.date)} · {item.acc}</small></span>{displayAmount(item)}<NavIcon name="next" size={15} />
              </button>)}</div>}
        </section>
      </>}
      {tab === 'pinjaman' && <Pinjaman kosId={kosId} />}
      {tab === 'arus' && <CashFlow kosId={kosId} version={`${ver}:${revision}`} />}

      {['kasbon', 'utang'].includes(tab) && (() => {
        const list = tab === 'kasbon' ? led.kasbon : led.utang;
        return list.length === 0 ? <Empty title={tab === 'kasbon' ? 'Tidak ada kasbon' : 'Tidak ada utang ke supplier'} text={tab === 'kasbon' ? 'Kasbon muncul saat penjualan di Kasir dibayar dengan Kasbon.' : 'Utang muncul saat belanja dibayar dengan Utang ke supplier.'} /> : (
          (() => {
            const late = (x) => x.due && x.due < today();
            const acts = (x) => <div className="row" style={{ gap: 6 }}>
              <button className="sm" onClick={() => setSheet({ t: 'debtHistory', c: x, kind: tab })}>Riwayat</button>
              <button className="sm primary" onClick={() => setSheet({ t: 'pay', c: x, kind: tab })}>{tab === 'kasbon' ? 'Terima bayar' : 'Bayar'}</button>
              {tab === 'kasbon' && x.phone && <a href={waLink(x.phone, `Halo ${x.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(x.sisa)}. Terima kasih.`)} target="_blank" rel="noreferrer"><button className="sm">Ingatkan WA</button></a>}
            </div>;
            return <DataTable rows={list} caption={tab === 'kasbon' ? 'Kasbon pelanggan' : 'Utang supplier'} pageSize={50}
              columns={[
                { key: 'name', label: tab === 'kasbon' ? 'Pelanggan' : 'Supplier', sort: (x) => x.name.toLowerCase(), render: (x) => <b>{x.name}</b> },
                { key: 'since', label: 'Sejak', sort: (x) => x.since || '', render: (x) => tgl(x.since) },
                { key: 'due', label: tab === 'kasbon' ? 'Janji bayar' : 'Jatuh tempo', sort: (x) => x.due || '', render: (x) => (x.due ? <>{tgl(x.due)}{late(x) && <span className="chip bad" style={{ marginLeft: 6 }}>Lewat</span>}</> : <span className="muted">—</span>) },
                { key: 'sisa', label: 'Sisa', align: 'right', sort: (x) => Number(x.sisa), render: (x) => <b style={{ color: 'var(--bad)' }}>{rp(x.sisa)}</b> },
                { key: 'act', label: <span className="vh">Tindakan</span>, render: acts },
              ]}
              card={(x) => <>
                <div className="dt-row"><b>{x.name}</b><b style={{ color: 'var(--bad)' }}>{rp(x.sisa)}</b></div>
                <span className="small muted">sejak {tgl(x.since)}{x.due ? ` · janji bayar ${tgl(x.due)}` : ''}{late(x) && <span className="chip bad" style={{ marginLeft: 6 }}>Lewat</span>}</span>
                {acts(x)}
              </>} />;
          })()
        );
      })()}

      {sheet?.t === 'choose' && <Sheet title={sheet.kind === 'deposit' ? 'Setor Kas' : 'Tarik Kas'} onClose={() => setSheet(null)}>
        {sheet.kind === 'deposit' ? <>
          <button onClick={() => setSheet({ t: 'cash', kind: 'setoran_modal' })}>Setor Modal / Uang Awal</button>
          <button onClick={() => setSheet({ t: 'cash', kind: 'setor_bank' })}>Transfer Kas ke Bank</button>
        </> : <>
          <button onClick={() => setSheet({ t: 'cash', kind: 'prive' })}>Penarikan Pribadi (Prive)</button>
          <button onClick={() => setSheet({ t: 'cash', kind: 'tarik_bank' })}>Transfer Bank ke Kas</button>
        </>}
      </Sheet>}
      {sheet?.t === 'filters' && <Sheet title="Filter Catatan Kas" onClose={() => setSheet(null)}>
        <div className="row">
          <Field label="Dari tanggal"><input type="date" value={draft.from} max={draft.to || today()} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field>
          <Field label="Sampai tanggal"><input type="date" value={draft.to} min={draft.from || undefined} max={today()} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field>
        </div>
        <Field label="Akun"><select value={draft.account} onChange={(event) => setDraft({ ...draft, account: event.target.value })}><option value="">Semua akun</option>{Object.entries(ACC).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Kategori biaya"><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="">Semua kategori</option>{d.cats.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
        <Field label="Jenis transaksi"><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
          <option value="">Semua jenis</option><option value="expense">Biaya</option><option value="transfer">Perpindahan dana</option><option value="piutang">Pelunasan kasbon</option><option value="utang">Bayar utang supplier</option>
          {Object.entries(OTHER).filter(([key]) => !TRANSFERS.has(key)).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        <button className="primary" disabled={Boolean(draft.from && draft.to && draft.from > draft.to)} onClick={() => { setFilters(draft); setSheet(null); }}>Tampilkan Hasil</button>
        <button onClick={() => setDraft(EMPTY_FILTERS)}>Reset Filter</button>
      </Sheet>}
      {sheet?.t === 'entry' && <Sheet title={sheet.f.label} onClose={() => setSheet(null)}>
        <p>{tgl(sheet.f.date)} · {sheet.f.acc}</p>{displayAmount(sheet.f)}{sheet.f.note && <p>{sheet.f.note}</p>}
        {sheet.f.amt === 0 && <p>Perpindahan dana antar akun.</p>}{acts(sheet.f)}
      </Sheet>}
      {sheet?.t === 'debtHistory' && <DebtHistory contact={sheet.c} kosId={kosId} kind={sheet.kind} onClose={() => setSheet(null)} />}
      {sheet?.t === 'exp' && <ExpenseForm kosId={kosId} cats={d.cats} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'cash' && <CashForm kosId={kosId} initial={sheet.kind} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'pay' && <PayForm kosId={kosId} c={sheet.c} kind={sheet.kind} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'move' && <MoveCash kosId={kosId} locs={d.loc.filter((b) => b.active)} cur={kos.locs?.current} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'att' && <Sheet title={`${sheet.f.label} · ${tgl(sheet.f.date)}`} onClose={() => setSheet(null)}>
        <p className="small" style={{ margin: 0 }}>{rp(Math.abs(sheet.f.amt))} · {sheet.f.acc}{sheet.f.note ? ` · ${sheet.f.note}` : ''}</p>
        <Lampiran entity="expense" id={sheet.f.id} title="Foto nota / kuitansi" hint="Belum ada foto nota untuk biaya ini." />
      </Sheet>}
      {sheet?.t === 'del' && <DeleteEntry f={sheet.f} onClose={() => setSheet(null)} onSaved={done} />}
    </div>
  );
}

function CashMetric({ icon, label, value, note }) {
  return <article className={styles.metric}><span><NavIcon name={icon} /></span><div><b>{label}</b><strong>{value}</strong>{note && <small>{note}</small>}</div></article>;
}

function CashFlow({ kosId, version }) {
  const [from, setFrom] = useState(() => today().slice(0, 7) + '-01');
  const [to, setTo] = useState(today);
  const [result, setResult] = useState(null);
  const valid = from && to && from <= to && to <= today() && (Date.parse(to) - Date.parse(from)) / 864e5 <= 400;
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: from, p_to: to }).abortSignal(controller.signal)
      .then(({ data, error }) => { if (!controller.signal.aborted) setResult({ from, to, version, data, error }); });
    return () => controller.abort();
  }, [kosId, from, to, valid, version]);
  const current = result?.from === from && result.to === to && result.version === version ? result : null;
  const c = current?.data;
  return <section className={styles.panel}>
    <div className={styles.panelHead}><h2>Arus Kas</h2></div>
    <div className="row"><Field label="Dari tanggal"><input type="date" value={from} max={to || today()} onChange={(event) => setFrom(event.target.value)} /></Field>
      <Field label="Sampai tanggal"><input type="date" value={to} min={from || undefined} max={today()} onChange={(event) => setTo(event.target.value)} /></Field></div>
    <p className="small muted">Dari jurnal Kas dan Bank. Perpindahan dana antar akun internal dikecualikan.</p>
    {!valid ? <p className="notice">Pilih rentang tanggal yang valid, maksimal 400 hari.</p> : current?.error ? <p className="notice bad">{errMsg(current.error)}</p> : !c ? <Loading /> :
      <><div className={styles.metrics}>
        <CashMetric icon="upload" label="Uang Masuk" value={rp(c.masuk)} />
        <CashMetric icon="/pengeluaran" label="Uang Keluar" value={rp(c.keluar)} />
        <CashMetric icon="/laporan" label="Arus Kas Bersih" value={rp(Number(c.masuk) - Number(c.keluar))} />
      </div><dl className="kv"><dt>Saldo awal</dt><dd>{rp(c.saldo_awal)}</dd><dt>Saldo akhir</dt><dd>{rp(c.saldo_akhir)}</dd></dl>
        {!c.cocok && <p className="notice bad">Saldo jurnal belum cocok dengan total arus kas.</p>}</>}
  </section>;
}

function DebtHistory({ contact, kosId, kind, onClose }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    readCashRows(() => supabase.from('debt_payments').select('id,date,amount,account,note,status').eq('kos_id', kosId)
      .eq('contact_id', contact.id).eq('kind', kind === 'kasbon' ? 'piutang' : 'utang').order('date', { ascending: false }).order('id'), controller.signal)
      .then((value) => { if (!controller.signal.aborted) setResult(value); });
    return () => controller.abort();
  }, [kosId, contact.id, kind]);
  return <Sheet title={`Riwayat Pembayaran · ${contact.name}`} onClose={onClose}>
    <p>Sisa <b>{rp(contact.sisa)}</b>{contact.due ? ` · jatuh tempo ${tgl(contact.due)}` : ''}</p>
    {!result ? <Loading /> : result.error ? <p className="notice bad">{errMsg(result.error)}</p> : !result.data.length ? <p>Belum ada pembayaran.</p> :
      <div className="list">{result.data.map((item) => <div className="li" key={item.id}><span>{tgl(item.date)} · {ACC[item.account] || item.account}{item.note ? ` · ${item.note}` : ''}</span><b>{rp(item.amount)}{item.status === 'batal' ? ' · Batal' : ''}</b></div>)}</div>}
  </Sheet>;
}

function ExpenseForm({ kosId, cats, onClose, onSaved }) {
  const [saved, setSaved] = useState(null); // id biaya yang baru tersimpan → bisa tambah foto nota
  const [cat, setCat] = useState(cats.find((c) => c.kind === 'operasional')?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState('kas');
  const [desc, setDesc] = useState('');
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    const c = cats.find((x) => x.id === cat);
    const { data: row, error } = await supabase.from('expenses').insert({ kos_id: kosId, date, amount: a, category_id: cat || null, kind: c?.kind || 'operasional', account: acc, description: desc || null }).select('id').single();
    if (error) return toast(errMsg(error));
    toast('Biaya tercatat'); setSaved(row.id);
  };
  if (saved) return (
    <Sheet title="Biaya tercatat" onClose={onSaved}>
      <p className="small" style={{ margin: 0 }}>✓ {rp(parseRp(amount))} · {cats.find((x) => x.id === cat)?.name || 'Biaya'} · {tgl(date)}</p>
      <Lampiran entity="expense" id={saved} title="Foto nota / kuitansi" hint="Opsional: foto nota agar mudah dicek nanti." />
      <button className="cta" onClick={onSaved}>Selesai</button>
    </Sheet>
  );
  return (
    <Sheet title="Catat biaya" onClose={onClose}>
      <Field label="Jenis biaya"><select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'modal' ? ' (modal)' : ''}</option>)}</select></Field>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="mis. 150rb" /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>Dibayar dari {l}</button>)}</div>
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. token listrik, gaji Budi" /></Field>
      <button className="cta" onClick={save}>Simpan biaya</button>
    </Sheet>
  );
}

function CashForm({ kosId, onClose, onSaved, initial }) {
  const [kind, setKind] = useState(initial && OTHER[initial] ? initial : 'setoran_modal');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState('kas');
  const [desc, setDesc] = useState('');
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const move = OTHER[kind][1] === 'pindah';
  const save = async () => {
    if (inFlight.current) return;
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    inFlight.current = true;
    setBusy(true);
    try {
      if (await run(() => supabase.from('cash_entries').insert({ kos_id: kosId, kind, date, amount: a, account: move ? 'kas' : acc, description: desc || null }), 'Tercatat', errMsg)) onSaved();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet title="Uang masuk / keluar lain" onClose={onClose}>
      <Field label="Jenis"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(OTHER).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {!move && <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>}
      {move && <p className="small muted">{kind === 'setor_bank' ? 'Kas → Bank' : 'Bank → Kas'}. Transfer tercatat sekali sebagai perpindahan dana.</p>}
      {kind === 'setoran_modal' && <p className="small muted">Setoran modal menambah ekuitas dan saldo akun yang dipilih.</p>}
      {kind === 'prive' && <p className="small muted" style={{ margin: 0 }}>Prive bukan biaya toko: tidak mengurangi laba, tetapi mengurangi kas.</p>}
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function PayForm({ kosId, c, kind, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(Math.round(c.sisa)));
  const [acc, setAcc] = useState('kas');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('debt_pay', { p_id: id, p_kos: kosId, p_contact: c.id, p_amount: a, p_account: acc, p_date: date, p_note: note }), kind === 'kasbon' ? `Pembayaran ${rp(a)} dari ${c.name} tercatat` : `Pembayaran ${rp(a)} ke ${c.name} tercatat`, errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={kind === 'kasbon' ? `Terima bayar · ${c.name}` : `Bayar utang · ${c.name}`} onClose={onClose}>
      <p style={{ margin: 0 }}>Sisa <b>{rp(c.sisa)}</b>. Boleh dibayar sebagian.</p>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{kind === 'kasbon' ? 'Masuk ke' : 'Dari'} {l}</button>)}</div>
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</button>
    </Sheet>
  );
}

function DeleteEntry({ f, onClose, onSaved }) {
  const { kosId } = useKos();
  const [reason, setReason] = useState('');
  const go = async () => {
    if (f.t === 'pay') {
      if (await withApproval(() => supabase.rpc('debt_payment_void', { p_payment: f.id, p_reason: reason }), 'Pembayaran dibatalkan',
        { kos: kosId, action: 'batal_pelunasan', payload: { payment_id: f.id }, reason })) onSaved();
      return;
    }
    if (await run(() => supabase.from(f.t === 'exp' ? 'expenses' : 'cash_entries').delete().eq('id', f.id), 'Catatan dihapus', errMsg)) onSaved();
  };
  return (
    <Sheet title={f.t === 'pay' ? 'Batalkan pembayaran?' : 'Hapus catatan?'} onClose={onClose}>
      <p style={{ margin: 0 }}><b>{f.label}</b> · {tgl(f.date)} · {rp(Math.abs(f.amt) || f.raw)}</p>
      {f.t === 'pay' ? <>
        <p className="small muted" style={{ margin: 0 }}>Sisa kasbon/utang akan kembali seperti sebelum pembayaran ini. Catatannya tetap tersimpan sebagai Batal.</p>
        <Field label="Alasan"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="danger" onClick={go} disabled={!reason.trim()}>Ya, batalkan</button>
      </> : <button className="danger" onClick={go}>Ya, hapus</button>}
      <button className="ghost" onClick={onClose}>Tidak jadi</button>
    </Sheet>
  );
}

// Pindah uang kas antar lokasi (mis. setoran laci cabang ke toko utama); total kas bisnis tidak berubah
function MoveCash({ kosId, locs, cur, onClose, onSaved }) {
  const [from, setFrom] = useState(cur || locs[0]?.id);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const have = Number(locs.find((b) => b.id === from)?.kas || 0);
  const a = parseRp(amt);
  const save = async () => {
    if (await run(() => supabase.rpc('cash_move', { p_kos: kosId, p_from: from, p_to: to, p_amount: a, p_date: date, p_note: note }), 'Uang kas dipindahkan', errMsg)) onSaved();
  };
  return (
    <Sheet title="Pindahkan uang kas" onClose={onClose}>
      <div className="row">
        <Field label="Dari"><select value={from} onChange={(e) => setFrom(e.target.value)}>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Ke"><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">— pilih —</option>{locs.filter((b) => b.id !== from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      </div>
      <span className="small muted">Kas tercatat di lokasi asal: {rp(have)}</span>
      <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Rp" /></Field>
      <Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. setoran laci cabang" /></Field>
      <button className="primary" onClick={save} disabled={!to || !(a > 0) || a > have}>Pindahkan</button>
    </Sheet>
  );
}
