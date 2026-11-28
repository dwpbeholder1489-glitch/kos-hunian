'use client';
import { PageTourPrompt } from '@/components/InteractiveGuide';
import PageHelp from '@/components/PageHelp';
import NavIcon from '@/components/NavIcon';
import InvoiceReminder, { hasReminderPhone } from '@/components/InvoiceReminder';
import { pathAllowed } from '@/lib/business';
import { BatchPayment, InvoicePdf } from './BillingActions';
import styles from './tagihan.module.css';
import { useBaru } from '@/lib/useBaru';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import Link from 'next/link';
import { Sheet, Field, Loading, Empty, InvChip, PayChip, run, toast } from '@/components/ui';
import { hasFeature } from '@/lib/plan';
import { rp, tgl, today, parseRp, angka, invTitle, METHOD, errMsg } from '@/lib/format';
import PaySheet from '@/components/PaySheet';

const FILTERS = [['terbuka', 'Belum lunas'], ['menunggak', 'Menunggak'], ['lunas', 'Lunas'], ['semua', 'Semua']];

const total = (rows, key) => rows.reduce((sum, i) => sum + Number(i[key] || 0), 0);
const daysUntil = (date, base) => Math.round((Date.parse(date) - Date.parse(base)) / 86400000);
const isOpen = (i) => i.status !== 'batal' && i.outstanding > 0;
const dueLabel = (i, now) => {
  const days = daysUntil(i.due_date, now);
  return days === 0 ? 'Jatuh tempo hari ini' : days < 0 ? `Terlambat ${-days} hari` : `Jatuh tempo ${days} hari lagi`;
};

export default function Tagihan() {
  const { kos, user, kosId } = useKos();
  return <InvoiceCenter key={kosId} kos={kos} owner={Boolean(user?.id && user.id === kos?.owner_id)} />;
}

function InvoiceCenter({ kos, owner }) {
  const d = useData({ fullRoomHistory: true });
  const [f, setF] = useState('terbuka');
  const [q, setQ] = useState('');
  const [groupByTenant, setGroup] = useState(false);
  const [filtersOpen, setFilters] = useState(false);
  const [due, setDue] = useState('');
  const [month, setMonth] = useState('');
  const [sheet, setSheet] = useState(null);
  const [limit, setLimit] = useState(24);
  useEffect(() => {
    if (!d.ready) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('invoice');
    if (!id) return;
    if (d.invById.has(id)) setSheet({ t: 'detail', id });
    url.searchParams.delete('invoice');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [d.ready, d.invById]);
  useBaru(() => setSheet({ t: 'extra' }));
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const now = today();
  const currentMonth = now.slice(0, 7);
  const issued = d.invoices.filter((i) => i.status !== 'batal');
  const open = issued.filter(isOpen);
  const late = open.filter((i) => i.overdue);
  const settled = issued.filter((i) => i.pay_state === 'lunas');
  const months = [...new Set(d.invoices.map((i) => i.due_date.slice(0, 7)))].sort().reverse();
  const monthBills = issued.filter((i) => i.due_date.startsWith(currentMonth));
  const scopes = { terbuka: open, menunggak: late, lunas: settled, terbit: issued, semua: d.invoices };
  const w = q.trim().toLocaleLowerCase('id');
  const list = scopes[f].filter((i) => {
    const days = daysUntil(i.due_date, now);
    return (!month || i.due_date.startsWith(month))
      && (!due || (due === 'late' && days < 0) || (due === 'today' && days === 0) || (due === 'soon' && days > 0 && days <= 7))
      && (!w || [d.occName(i.occupant_id), d.roomCode(i.room_id), invTitle(i), tgl(i.due_date),
        tgl(i.period_start), tgl(i.period_end), i.due_date].join(' ').toLocaleLowerCase('id').includes(w));
  }).sort((a, b) => ['terbuka','menunggak'].includes(f) ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date));
  const grouped = new Map();
  for (const i of list) {
    if (!grouped.has(i.occupant_id)) grouped.set(i.occupant_id, []);
    grouped.get(i.occupant_id).push(i);
  }
  const close = () => setSheet(null);
  const show = (type, id) => setSheet({ t: type, id });
  const drill = (status, period = '') => { setF(status); setQ(''); setMonth(period); setDue(''); setLimit(24); };
  const reminders = sheet?.t !== 'reminder' ? [] : sheet.id ? open.filter((i) => i.id === sheet.id) : list.filter(isOpen);
  const reminderRows = new Map();
  for (const invoice of reminders) {
    const occ = d.occById.get(invoice.occupant_id);
    if (!hasReminderPhone(occ)) continue;
    if (!reminderRows.has(occ.id)) reminderRows.set(occ.id, { occ, lease: d.activeByOcc.get(occ.id), open: [] });
    reminderRows.get(occ.id).open.push(invoice);
  }
  const card = (i, compact = false) => <InvoiceCard key={i.id} d={d} inv={i} now={now} compact={compact} show={show} />;
  const balanceView = ['terbuka','menunggak'].includes(f);

  return <div className={styles.page}>
    <section className={styles.hero} data-guide-target="invoice-header">
      <div><h1>Tagihan</h1><p>Kelola tagihan sewa, pembayaran, dan pengingat penghuni.</p>
        <div className={styles.actionsInline}><PageHelp page="tagihan" label="Panduan Tagihan" /><PageTourPrompt /></div>
      </div>
      <img src="/kas-kasbon.webp" alt="" />
    </section>
    <div className={styles.kpis} aria-label="Ringkasan tagihan">
      <button aria-pressed={f === 'terbit'} onClick={() => drill('terbit')}><NavIcon name="calendar" /><b>{issued.length} Tagihan</b><small>{rp(total(issued, 'amount'))} · Total terbit</small></button>
      <button aria-pressed={f === 'lunas'} onClick={() => drill('lunas')}><NavIcon name="done" /><b>{settled.length} Lunas</b><small>{rp(total(settled, 'amount'))}</small></button>
      <button className={styles.late} aria-pressed={f === 'menunggak'} onClick={() => drill('menunggak')}><NavIcon name="clock" /><b>{late.length} Menunggak</b><small>{rp(total(late, 'outstanding'))} · Sisa</small></button>
    </div>
    <div className={styles.quick} aria-label="Aksi tagihan">
      <button className="primary" onClick={() => show('extra')} data-guide-target="invoice-new"><NavIcon name="plus" />Tambah Tagihan</button>
      <button onClick={() => show('batch')}><NavIcon name="wallet" />Catat Pembayaran</button>
      {owner && <button onClick={() => show('reminder')}><NavIcon name="message" />Kirim Pengingat</button>}
      <button onClick={() => show('report')}><NavIcon name="/laporan" />Laporan</button>
    </div>
    <div className={styles.tabs} aria-label="Status tagihan">{FILTERS.map(([key, label]) => <button key={key} aria-pressed={f === key} onClick={() => { setF(key); setLimit(24); }}>
      {label}{key !== 'semua' && ` (${scopes[key].length})`}</button>)}
      {f === 'terbit' && <button aria-pressed="true" onClick={() => drill('terbit')}>Terbit ({issued.length})</button>}
    </div>
    <div className={styles.search}>
      <label><NavIcon name="search" size={18} /><input type="search" aria-label="Cari penghuni, kamar, atau bulan" placeholder="Cari penghuni, kamar, atau bulan" value={q} onChange={(e) => { setQ(e.target.value); setLimit(24); }} /></label>
      <button onClick={() => setFilters(!filtersOpen)} aria-expanded={filtersOpen}><NavIcon name="filter" size={18} />Filter</button>
    </div>
    {filtersOpen && <div className={styles.form}>
      <Field label="Jatuh tempo"><select value={due} onChange={(e) => { setDue(e.target.value); setLimit(24); }}>
        <option value="">Semua tanggal</option><option value="late">Sudah lewat</option><option value="today">Hari ini</option><option value="soon">Dalam 7 hari</option>
      </select></Field>
      <Field label="Bulan jatuh tempo"><select value={month} onChange={(e) => { setMonth(e.target.value); setLimit(24); }}>
        <option value="">Semua bulan</option>{[...new Set([currentMonth, ...months])].map((ym) => <option key={ym} value={ym}>
          {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-01'))}
        </option>)}
      </select></Field>
    </div>}
    <div className={styles.listHead}>
      <small>{list.length} tagihan · {balanceView ? 'Sisa pembayaran' : 'Nilai tagihan'} {rp(total(list, balanceView ? 'outstanding' : 'amount'))}</small>
      {(month || due) && <button onClick={() => { setMonth(''); setDue(''); }}>Hapus filter tanggal</button>}
      <div className={styles.switch} aria-label="Pengelompokan">
        <button aria-pressed={!groupByTenant} onClick={() => { setGroup(false); setLimit(24); }}>Per tagihan</button>
        <button aria-pressed={groupByTenant} onClick={() => { setGroup(true); setLimit(24); }}>Per penghuni</button>
      </div>
    </div>
    {!list.length ? <Empty title="Tidak ada tagihan" text="Coba ubah status, tanggal, atau kata pencarian." /> :
      <div className={styles.grid}>{groupByTenant ? [...grouped].slice(0, limit).map(([id, items]) =>
        <details key={id} className={styles.group}><summary><strong>{d.occName(id)}</strong><small>{items.length} tagihan · Sisa {rp(total(items, 'outstanding'))}</small></summary>
          <div>{items.map((i) => card(i, true))}</div></details>) : list.slice(0, limit).map((i) => card(i))}</div>}
    {(groupByTenant ? grouped.size : list.length) > limit && <button onClick={() => setLimit(limit + 24)}>Tampilkan lebih banyak</button>}
    <button className={styles.month} onClick={() => drill('terbit', currentMonth)} aria-pressed={f === 'terbit' && month === currentMonth}>
      <NavIcon name="info" /><span>Tagihan jatuh tempo bulan ini</span><b>{rp(total(monthBills, 'amount'))}</b><NavIcon name="next" size={16} />
    </button>
    <p className={styles.note}>Tagihan sewa bulanan diterbitkan otomatis H-7 sebelum jatuh tempo.</p>

    {sheet?.t === 'detail' && <InvDetail d={d} inv={d.invById.get(sheet.id)} go={setSheet} owner={owner} onClose={close} />}
    {sheet?.t === 'pay' && <PaySheet key={sheet.id} d={d} inv={d.invById.get(sheet.id)} onClose={close} />}
    {sheet?.t === 'extra' && <ExtraSheet d={d} onClose={close} />}
    {sheet?.t === 'batch' && <BatchPayment d={d} invoices={open} onClose={close} onSingle={(id) => show('pay', id)} />}
    {sheet?.t === 'reminder' && owner && <InvoiceReminder kos={kos} d={d} records={[...reminderRows.values()]} onClose={close} />}
    {sheet?.t === 'report' && <Sheet title="Laporan tagihan" icon="/laporan" onClose={close}>
      <button onClick={() => { drill('terbit', currentMonth); close(); }}>Telusuri tagihan bulan ini · {rp(total(monthBills, 'amount'))}</button>
      <button onClick={() => { drill('menunggak'); close(); }}>Telusuri tunggakan · {rp(total(late, 'outstanding'))}</button>
      <Link href="/pembayaran">Riwayat pembayaran</Link>
      {pathAllowed(kos, '/laporan-analisis') && <Link href="/laporan-analisis">Buka Laporan &amp; Analisis</Link>}
      {pathAllowed(kos, '/meteran') && <Link href="/meteran">Meteran Listrik &amp; Air</Link>}
    </Sheet>}
  </div>;
}

function InvoiceCard({ d, inv, now, compact, show }) {
  return <article className={styles.card}>
    <div className={styles.cardHead}><span className={styles.avatar}><NavIcon name="bed" /></span>
      <div><strong>{compact ? invTitle(inv) : `${d.occName(inv.occupant_id)} · ${d.roomCode(inv.room_id)}`}</strong>
        <small>{compact ? d.roomCode(inv.room_id) : invTitle(inv)} · Jatuh tempo {tgl(inv.due_date)}</small></div>
      <div className={styles.amount}><b>{rp(isOpen(inv) ? inv.outstanding : inv.amount)}</b><InvChip inv={inv} /></div>
    </div>
    <dl className={styles.figures}>
      <div><dt>Nominal awal</dt><dd>{rp(inv.amount)}</dd></div>
      <div><dt>Diterima</dt><dd>{rp(inv.paid)}</dd></div>
      <div><dt>Sisa pembayaran</dt><dd>{rp(inv.outstanding)}</dd></div>
    </dl>
    <details className={styles.period}><summary>Rincian periode</summary>
      <p>{inv.kind === 'sewa' ? `${tgl(inv.period_start)} – ${tgl(inv.period_end)}` : invTitle(inv)}</p>
      {inv.pending > 0 && <small>{rp(inv.pending)} menunggu verifikasi</small>}
    </details>
    <div className={styles.cardFoot}>
      {isOpen(inv) && <span data-late={inv.overdue}><NavIcon name="clock" size={17} />{dueLabel(inv, now)}</span>}
      <div className={styles.actionsInline}>
        <button onClick={() => show('detail', inv.id)}>Detail</button>
        {isOpen(inv) && <button className="primary" onClick={() => show('pay', inv.id)}>Bayar</button>}
      </div>
    </div>
  </article>;
}

function InvDetail({ d, inv, go, owner, onClose }) {
  const { bump, kos } = useKos();
  const canReceipt = hasFeature(kos, 'kwitansi');
  if (!inv) return null;
  const pays = d.payments.filter((p) => p.invoice_id === inv.id);
  async function cancel() {
    const why = prompt('Alasan membatalkan tagihan ini?');
    if (why === null) return;
    if (pays.some((p) => p.status === 'terverifikasi' || p.status === 'menunggu')) return run(() => { throw new Error('Tagihan yang sudah ada pembayarannya tidak bisa dibatalkan. Batalkan pembayarannya dulu.'); });
    if (await run(() => supabase.from('invoices').update({ status: 'batal', cancel_reason: why || null }).eq('id', inv.id), 'Tagihan dibatalkan', errMsg)) { bump(); onClose(); }
  }
  return (
    <Sheet title={invTitle(inv)} onClose={onClose}>
      <dl className="kv">
        {inv.kind === 'sewa' && <><dt>Periode sewa</dt><dd>{tgl(inv.period_start)} – {tgl(inv.period_end)}</dd></>}
        <dt>Penghuni</dt><dd>{d.occName(inv.occupant_id)} · {d.roomCode(inv.room_id)}</dd>
        <dt>Jatuh tempo</dt><dd>{tgl(inv.due_date)}</dd>
        <dt>Jumlah</dt><dd>{rp(inv.amount)}</dd>
        <dt>Sudah dibayar</dt><dd>{rp(inv.paid)}</dd>
        {inv.pending > 0 && <><dt>Menunggu verifikasi</dt><dd>{rp(inv.pending)}</dd></>}
        <dt>Sisa</dt><dd style={{ color: inv.outstanding ? 'var(--bad)' : undefined }}>{rp(inv.outstanding)}</dd>
        <dt>Status</dt><dd><InvChip inv={inv} /></dd>
        {inv.cancel_reason && <><dt>Alasan batal</dt><dd>{inv.cancel_reason}</dd></>}
      </dl>
      {inv.status !== 'batal' && inv.outstanding > 0 && <button className="cta" onClick={() => go({ t: 'pay', id: inv.id })}>Catat pembayaran</button>}
      <InvoicePdf kos={kos} inv={inv} d={d} />
      {owner && isOpen(inv) && hasReminderPhone(d.occById.get(inv.occupant_id)) && <button onClick={() => go({ t: 'reminder', id: inv.id })}>Kirim pengingat WhatsApp</button>}
      <Link href={`/kamar?unit=${inv.room_id}`}>Buka detail kamar</Link>
      {pays.length > 0 && (
        <section className="panel"><span className="label">Riwayat pembayaran</span>
          <div className="list">{pays.map((p) => (
            <div className="li" key={p.id}><div className="main"><b>{rp(p.amount)}</b><span className="small muted">{tgl(p.paid_at)} · {METHOD[p.method]}</span>
              {p.status === 'terverifikasi' && <Link href={'/kwitansi/' + p.id} className="small" onClick={(e) => { if (!canReceipt) { e.preventDefault(); toast('Kwitansi PDF tersedia mulai Paket Dasar'); } }}>🧾 Kwitansi{!canReceipt && ' 🔒'}</Link>}</div><PayChip status={p.status} /></div>
          ))}</div>
        </section>
      )}
      {inv.status !== 'batal' && inv.pay_state !== 'lunas' && <button className="danger" onClick={cancel}>Batalkan tagihan</button>}
    </Sheet>
  );
}

function ExtraSheet({ d, onClose }) {
  const { kosId, bump } = useKos();
  const active = d.leases.filter((l) => l.status === 'aktif');
  const [leaseId, setLease] = useState(active[0]?.id || '');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [due, setDue] = useState(today());
  const [busy, setBusy] = useState(false);
  async function save() {
    const l = active.find((x) => x.id === leaseId);
    const a = parseRp(amt);
    if (!l) return run(() => { throw new Error('Pilih penghuni.'); });
    if (!desc.trim()) return run(() => { throw new Error('Isi keterangan tagihan.'); });
    if (!due) return toast('Pilih tanggal jatuh tempo.');
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah tagihan.'); });
    setBusy(true);
    const ok = await run(() => supabase.from('invoices').insert({ kos_id: kosId, lease_id: l.id, room_id: l.room_id, occupant_id: l.occupant_id, kind: 'tambahan', period_start: due, period_end: due, due_date: due, amount: a, description: desc.trim() }), 'Tagihan tambahan dibuat', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  if (active.length === 0) return <Sheet title="Tagihan tambahan" onClose={onClose}><p className="muted">Belum ada penghuni aktif.</p></Sheet>;
  return (
    <Sheet title="Tagihan tambahan" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Untuk biaya di luar sewa: listrik token, laundry, denda, deposit, dll.</p>
      <Field label="Penghuni"><select value={leaseId} onChange={(e) => setLease(e.target.value)}>{active.map((l) => <option key={l.id} value={l.id}>{d.occName(l.occupant_id)} · {d.roomCode(l.room_id)}</option>)}</select></Field>
      <Field label="Keterangan"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Listrik Oktober" /></Field>
      <div className="row">
        <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Jatuh tempo"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Buat tagihan'}</button>
    </Sheet>
  );
}
