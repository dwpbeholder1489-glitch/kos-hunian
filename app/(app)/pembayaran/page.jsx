'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHelp from '@/components/PageHelp';
import NavIcon from '@/components/NavIcon';
import { Loading, Empty, PayChip, Sheet, Field, run, toast } from '@/components/ui';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { supabase } from '@/lib/supabase';
import { printVerifiedPayment } from '@/lib/print-payment';
import { pathAllowed } from '@/lib/business';
import { rp, tgl, thisMonth, bulan, addMonthsYm, invTitle, METHOD, PAY_ST, errMsg } from '@/lib/format';
import styles from './pembayaran.module.css';

const waktu = (iso) => new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short' }).format(new Date(iso));
const STATUS = [['semua','Semua'],['menunggu','Menunggu verifikasi'],['terverifikasi','Terverifikasi'],['dibatalkan','Dibatalkan'],['ditolak','Ditolak']];
const SOURCES = { penghuni: 'Portal penghuni', pengelola: 'Pengelola' };
const received = (rows) => rows.filter((p) => p.status === 'terverifikasi' && p.method !== 'deposit');
const sum = (rows) => rows.reduce((n,p) => n + p.amount,0);

export default function Pembayaran() {
  const { kos, kosId, bump } = useKos();
  return kosId ? <PaymentCenter key={kosId} kos={kos} bump={bump} /> : <Loading />;
}

function PaymentCenter({ kos, bump }) {
  const d = useData({ fullRoomHistory: true });
  const params = useSearchParams();
  const monthParam = params.get('bulan');
  const view = params.get('tampilan');
  const paymentParam = params.get('pembayaran');
  const verification = view === 'verifikasi';
  const receipts = view === 'kwitansi';
  const [ym,setYm] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam || '') && monthParam <= thisMonth() ? monthParam : thisMonth());
  const [period,setPeriod] = useState(verification ? 'all' : 'month');
  const [status,setStatus] = useState(verification ? 'menunggu' : receipts ? 'terverifikasi' : 'semua');
  const [room,setRoom] = useState('');
  const [method,setMethod] = useState('');
  const [source,setSource] = useState('');
  const [query,setQuery] = useState('');
  const [filters,setFilters] = useState(false);
  const [limit,setLimit] = useState(24);
  const [sheet,setSheet] = useState(paymentParam ? { t:'detail',id:paymentParam } : null);
  useEffect(() => { if (paymentParam) setSheet({ t:'detail',id:paymentParam }); else setSheet(null); }, [paymentParam,view]);
  useEffect(() => {
    setStatus(verification ? 'menunggu' : receipts ? 'terverifikasi' : 'semua');
    setPeriod(verification ? 'all' : 'month');
  }, [verification,receipts]);
  if (!d.ready) return d.err ? <p className="notice bad">{d.err}</p> : <Loading />;

  const scope = d.payments.filter((p) => period === 'all' || p.paid_at.startsWith(ym));
  const counts = Object.fromEntries(STATUS.map(([key]) => [key, key === 'semua' ? scope.length : scope.filter((p) => p.status === key).length]));
  const cash = received(scope);
  const match = query.trim().toLocaleLowerCase('id');
  const rows = scope.filter((p) => {
    const i = d.invById.get(p.invoice_id);
    return (status === 'semua' || (status === 'received' ? p.status === 'terverifikasi' && p.method !== 'deposit' : p.status === status))
      && (!room || room === i?.room_id) && (!method || method === p.method)
      && (!source || source === (p.source || 'pengelola'))
      && (!match || [i && d.occName(i.occupant_id),i && d.roomCode(i.room_id),METHOD[p.method],p.ref,tgl(p.paid_at),i && invTitle(i)].join(' ').toLocaleLowerCase('id').includes(match));
  }).sort((a,b) => b.paid_at.localeCompare(a.paid_at) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const drill = (key) => { setStatus(key); setRoom(''); setMethod(''); setSource(''); setQuery(''); setLimit(24); };
  const close = () => setSheet(null);
  const title = verification ? 'Verifikasi Pembayaran' : receipts ? 'Kuitansi & Bukti Bayar' : 'Pembayaran';
  const selected = d.payments.find((p) => p.id === sheet?.id);
  const items = [['received','Total Diterima',rp(sum(cash)),'wallet'],['menunggu','Menunggu Verifikasi',counts.menunggu,'clock'],
    ['terverifikasi','Terverifikasi',counts.terverifikasi,'done'],['dibatalkan','Dibatalkan',counts.dibatalkan,'return']];
  return <div className={styles.page}>
    <section className={styles.hero}><div><h1>{title}</h1><p>Catat pembayaran, periksa bukti transfer, dan kirim kuitansi ke penghuni.</p>
      <PageHelp page="pembayaran" label="Panduan Pembayaran" /></div><img src="/kas-kasbon.webp" alt="" /></section>
    {(verification || receipts) && <Link href="/pembayaran">← Semua pembayaran</Link>}
    <div className={styles.kpis} aria-label="Ringkasan periode">{items.map(([k,label,value,icon]) => <button key={k} data-tone={k} aria-pressed={status === k} onClick={() => drill(k)}>
      <NavIcon name={icon} /><small>{label}</small><b>{value}</b></button>)}</div>
    <nav className={styles.quick} aria-label="Aksi pembayaran">
      <Link className={styles.primary} href="/tagihan?bayar=1"><NavIcon name="plus" />Catat Pembayaran</Link>
      <button onClick={() => { setPeriod('all'); drill('menunggu'); }}><NavIcon name="done" />Verifikasi Pembayaran</button>
      <button onClick={() => drill('terverifikasi')}><NavIcon name="message" />Kirim Bukti</button>
      <button onClick={() => setSheet({ t: 'report' })}><NavIcon name="/laporan" />Laporan</button>
      <button onClick={() => setSheet({ t: 'more' })}><NavIcon name="more" />Lainnya</button>
    </nav>
    <div className={styles.period}>
      <button aria-label="Bulan sebelumnya" disabled={period === 'all'} onClick={() => { setYm(addMonthsYm(ym,-1)); setLimit(24); }}><NavIcon name="prev" /></button>
      <select aria-label="Periode pembayaran" value={period === 'all' ? 'all' : ym} onChange={(e) => { setPeriod(e.target.value === 'all' ? 'all' : 'month'); if (e.target.value !== 'all') setYm(e.target.value); setLimit(24); }}>
        <option value="all">Semua periode</option>{[...new Set([thisMonth(), ym, ...d.payments.map((p) => p.paid_at.slice(0,7))])].sort().reverse().map((m) => <option key={m} value={m}>{bulan(m)}</option>)}
      </select>
      <button aria-label="Bulan berikutnya" disabled={period === 'all' || ym >= thisMonth()} onClick={() => { setYm(addMonthsYm(ym,1)); setLimit(24); }}><NavIcon name="next" /></button>
    </div>
    <div className={styles.tabs} aria-label="Status pembayaran">{[...STATUS.filter(([k]) => k !== 'ditolak' || counts.ditolak), ...(status === 'received' ? [['received','Total diterima']] : [])].map(([k,label]) =>
      <button key={k} aria-pressed={status === k} onClick={() => { setStatus(k); setLimit(24); }}>{label} ({k === 'received' ? cash.length : counts[k]})</button>)}</div>
    <div className={styles.search}><label><NavIcon name="search" /><input type="search" aria-label="Cari pembayaran" placeholder="Cari penghuni, kamar, atau metode…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(24); }} /></label>
      <button onClick={() => setFilters(!filters)} aria-expanded={filters}><NavIcon name="filter" />Filter{(room || method || source) && ' •'}</button>
    </div>
    {filters && <div className={styles.form}>
      <Field label="Kamar"><select value={room} onChange={(e) => { setRoom(e.target.value); setLimit(24); }}><option value="">Semua kamar</option>{d.rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></Field>
      <Field label="Metode"><select value={method} onChange={(e) => { setMethod(e.target.value); setLimit(24); }}><option value="">Semua metode</option>{Object.entries(METHOD).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Sumber"><select value={source} onChange={(e) => { setSource(e.target.value); setLimit(24); }}><option value="">Semua sumber</option>{Object.entries(SOURCES).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    </div>}
    <div className={styles.summary}><NavIcon name="coins" /><span>Uang diterima pada periode ini <b>{rp(sum(cash))}</b></span><small>{rows.length} hasil</small></div>
    {!rows.length ? <Empty title={status === 'menunggu' ? 'Tidak ada pembayaran menunggu verifikasi' : receipts ? 'Belum ada kuitansi' : 'Tidak ada pembayaran yang cocok'} /> :
      <div className={styles.grid}>{rows.slice(0,limit).map((p) => {
        const i = d.invById.get(p.invoice_id);
        return <button key={p.id} className={styles.card} onClick={() => setSheet({ t:'detail',id:p.id })} aria-haspopup="dialog">
          <span className={styles.avatar}><NavIcon name="bed" /></span>
          <span className={styles.person}><strong>{i ? `${d.occName(i.occupant_id)} · ${d.roomCode(i.room_id)}` : 'Pembayaran'}</strong>
            <small>{i && invTitle(i)}</small><small>{tgl(p.paid_at)} · {METHOD[p.method]}</small>
            {p.source === 'penghuni' && <span className="chip info">Portal penghuni</span>}</span>
          <span className={styles.amount}><b>{rp(p.amount)}</b><PayChip status={p.status} /></span><NavIcon name="next" size={16} />
        </button>;
      })}</div>}
    {rows.length > limit && <button onClick={() => setLimit(limit+24)}>Tampilkan lebih banyak</button>}
    {sheet?.t === 'detail' && selected && <PaymentDetail key={selected.id} p={selected} d={d} kos={kos} bump={bump} onClose={close} />}
    {sheet?.t === 'report' && <Sheet title="Laporan pembayaran" onClose={close}>
      <p>{period === 'all' ? 'Semua periode' : bulan(ym)} · {rp(sum(cash))} diterima dari {cash.length} pembayaran.</p>
      <button onClick={() => { drill('received'); close(); }}>Telusuri uang yang diterima</button>
      {pathAllowed(kos,'/laporan-analisis') && <Link href={`/laporan-analisis?periode=bulanan&tanggal=${ym}-01`}>Buka Laporan &amp; Analisis</Link>}
      {pathAllowed(kos,'/pembukuan') && <Link href={`/pembukuan?tab=laporan&bulan=${ym}`}>Buka Pembukuan</Link>}
    </Sheet>}
    {sheet?.t === 'more' && <Sheet title="Lainnya" onClose={close}>
      <Link href="/pembayaran?tampilan=kwitansi">Kuitansi &amp; Bukti Bayar</Link><Link href="/tagihan">Tagihan</Link><Link href="/penghuni">Penghuni</Link>
      {pathAllowed(kos,'/pengeluaran') && <Link href={`/pengeluaran?bulan=${ym}`}>Kas &amp; Bank</Link>}
      {pathAllowed(kos,'/notifikasi') && <Link href="/notifikasi">Notifikasi dan pengingat</Link>}
    </Sheet>}
  </div>;
}

function PaymentDetail({ p,d,kos,bump,onClose }) {
  const i = d.invById.get(p.invoice_id);
  const [proof,setProof] = useState(null);
  const [busy,setBusy] = useState(false);
  const [cancel,setCancel] = useState(false);
  const [reason,setReason] = useState('');
  const [lastStatus,setLastStatus] = useState(null);
  const status = lastStatus || p.status;
  const waiting = status === 'menunggu';
  async function loadProof() {
    setProof({ loading:true });
    const { data,error } = await supabase.from('payment_proofs').select('image').eq('kos_id',kos.id).eq('payment_id',p.id).maybeSingle();
    setProof(error ? { error } : { image:data?.image });
  }

  async function review(next) {
    setBusy(true);
    let changed = false;
    const ok = await run(async () => {
      const result = await supabase.from('payments').update({ status:next, verified_at:next === 'terverifikasi' ? new Date().toISOString() : null })
        .eq('kos_id',kos.id).eq('id',p.id).eq('status','menunggu').select('id').maybeSingle();
      changed = Boolean(result.data);
      if (!result.error && !changed) throw new Error('Pembayaran sudah ditinjau. Muat ulang detail.');
      return result;
    }, next === 'terverifikasi' ? 'Pembayaran diverifikasi' : 'Pembayaran ditolak',errMsg);
    setBusy(false);
    if (ok) {
      setLastStatus(next);
      if (changed && next === 'terverifikasi') printVerifiedPayment(kos,d,p,(error) => toast('Pembayaran tersimpan. Cetak otomatis gagal: ' + errMsg(error)));
      bump();
    }
  }

  async function cancelPayment() {
    if (!reason.trim()) return;
    setBusy(true);
    const ok = await run(() => supabase.rpc('rent_payment_cancel',{ p_kos:kos.id,p_payment:p.id,p_reason:reason.trim() }), 'Pembayaran dibatalkan',errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }

  return <Sheet title="Detail pembayaran" subtitle={i && `${d.occName(i.occupant_id)} · ${d.roomCode(i.room_id)}`} icon="wallet" wide onClose={onClose}>
    <div className={styles.summary}><NavIcon name="wallet" /><b>{rp(p.amount)}</b><PayChip status={status} /></div>
    <dl className="kv"><dt>Tanggal transaksi</dt><dd>{tgl(p.paid_at)}</dd><dt>Metode</dt><dd>{METHOD[p.method]}</dd>
      <dt>Sumber</dt><dd>{SOURCES[p.source] || SOURCES.pengelola}</dd>
      {i && <><dt>Tagihan terkait</dt><dd><Link href={`/tagihan?invoice=${i.id}`}>{invTitle(i)}</Link></dd>
        {i.kind === 'sewa' && <><dt>Periode sewa</dt><dd>{tgl(i.period_start)} – {tgl(i.period_end)}</dd></>}
        <dt>Kamar</dt><dd><Link href={`/kamar?unit=${i.room_id}`}>{d.roomCode(i.room_id)}</Link></dd></>}
      {p.ref && <><dt>Referensi</dt><dd>{p.ref}</dd></>}
      {p.notes && <><dt>Catatan</dt><dd>{p.notes}</dd></>}
    </dl>
    <details className={styles.panel} onToggle={(e) => { if (e.currentTarget.open && !proof) loadProof(); }}>
      <summary>Bukti transfer</summary>
      {!proof || proof.loading ? <p>Memuat bukti…</p> : proof.error ? <><p role="alert">{errMsg(proof.error)}</p><button onClick={loadProof}>Coba lagi</button></>
        : proof.image ? <img src={proof.image} alt="Bukti transfer pembayaran" className="proofimg" /> : <p>Belum ada bukti yang dilampirkan.</p>}
    </details>
    <section className={styles.panel}><h3>Riwayat verifikasi</h3><ul>
      <li>Dicatat {p.created_at ? waktu(p.created_at) : tgl(p.paid_at)}</li>
      {p.verified_at && <li>Terverifikasi {waktu(p.verified_at)}</li>}
      {p.resolved_at && <li>{PAY_ST[status]?.[0]} {waktu(p.resolved_at)}</li>}
      {!p.resolved_at && ['ditolak','dibatalkan'].includes(status) && <li>{PAY_ST[status]?.[0]}</li>}
      {p.cancel_reason && <li>Alasan pembatalan · {p.cancel_reason}</li>}
    </ul></section>
    {waiting && <div className={styles.actions}><button className="primary" disabled={busy} onClick={() => review('terverifikasi')}>Uang sudah masuk</button>
      <button className="danger" disabled={busy} onClick={() => review('ditolak')}>Tolak</button></div>}
    {status === 'terverifikasi' && <><Link href={`/kwitansi/${p.id}`}>Unduh atau kirim kuitansi PDF</Link>
      {p.method === 'deposit' ? <p className="small muted">Koreksi potongan deposit melalui Penghuni → Deposit.</p> :
        !cancel && <button className="danger" onClick={() => setCancel(true)}>Batalkan pembayaran</button>}
    </>}
    {cancel && <section className={styles.panel}><h3>Konfirmasi pembatalan</h3>
      <p>Pembayaran dikeluarkan dari penerimaan dan saldo tagihan dihitung ulang. Jurnal yang sudah diposting akan dibalik.</p>
      <Field label="Alasan pembatalan"><textarea required value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className={styles.actions}><button disabled={busy} onClick={() => setCancel(false)}>Kembali</button>
        <button className="danger" disabled={busy || !reason.trim()} onClick={cancelPayment}>{busy ? 'Memproses…' : 'Konfirmasi pembatalan'}</button></div>
    </section>}
  </Sheet>;
}
