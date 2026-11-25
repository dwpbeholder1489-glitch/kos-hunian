'use client';
// Tagihan termin & pembayaran klien (Tahap 1D, keputusan K3). Server: prj_billing, prj_invoice_create/void, prj_payment_add/void.
// Jurnal otomatis di server: uang masuk sebelum milestone diserahkan = uang muka; milestone selesai = pendapatan (kekurangan = piutang).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, Tile, run, toast } from '@/components/ui';
import { angka, parseRp, rp, tgl, tglShort, today, errMsg } from '@/lib/format';

export const INV_ST = { belum: ['Belum dibayar', 'info'], sebagian: ['Dibayar sebagian', 'gold'], lunas: ['Lunas', 'good'], batal: ['Dibatalkan', 'void'] };
export const invChip = (i) => (i.overdue ? ['Lewat jatuh tempo', 'bad'] : INV_ST[i.state] || [i.state, 'void']);
const PAY_KIND = { bayar: 'Terima pembayaran', kembali: 'Uang muka dikembalikan', hangus: 'Uang muka hangus' };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export default function BillingPanel({ project, onChange }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);   // {inv: {milestone?}} | {pay: {kind, invoice?}}
  const load = () => supabase.rpc('prj_billing', { p_project: project.id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [project.id, project.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => { setSheet(null); load(); onChange?.(); };
  const created = (id) => { done(); if (id) router.push(`/proyek/tagihan/${id}`); };
  if (err) return <section className="panel"><span className="label">Tagihan & pembayaran</span><span className="small" style={{ color: 'var(--bad)' }}>{err}</span></section>;
  if (!d) return <section className="panel"><span className="label">Tagihan & pembayaran</span><span className="small muted">Memuat…</span></section>;
  const canInv = d.allowed && !['batal', 'penawaran'].includes(d.status);
  const canPay = d.status !== 'penawaran';
  const voidInv = async (i) => { const r = window.prompt(`Alasan membatalkan tagihan ${i.number}:`) || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('prj_invoice_void', { p_id: i.id, p_reason: r }), 'Tagihan dibatalkan', errMsg)) done(); };
  const voidPay = async (y) => { const r = window.prompt(`Alasan membatalkan ${PAY_KIND[y.kind].toLowerCase()} ${rp(y.amount)}:`) || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('prj_payment_void', { p_id: y.id, p_reason: r }), 'Dibatalkan — jurnal dikoreksi otomatis', errMsg)) done(); };
  const toBill = d.milestones.filter((m) => Number(m.amount) > Number(m.billed));
  return (
    <section className="panel" style={{ gap: 10 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="label">Tagihan & pembayaran klien</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {canInv && <button className="sm" onClick={() => setSheet({ inv: {} })}>+ Tagihan</button>}
          {canPay && <button className="sm primary" onClick={() => setSheet({ pay: { kind: 'bayar' } })}>+ Terima pembayaran</button>}
        </div>
      </div>
      <div className="grid">
        <Tile label="Nilai kontrak" value={d.value != null ? rp(d.value) : '—'} sub={`ditagih ${rp(d.billed)}`} />
        <Tile label="Sudah diterima" value={rp(Number(d.received) - Number(d.refunded))} sub={Number(d.refunded) > 0 ? `setelah dikembalikan ${rp(d.refunded)}` : 'pembayaran klien'} />
        <Tile label="Belum dibayar klien" value={rp(d.invoices_open)} tone={Number(d.overdue) > 0 ? 'bad' : ''} sub={Number(d.overdue) > 0 ? `${rp(d.overdue)} lewat jatuh tempo` : 'total ditagih − uang diterima'} />
        <Tile label="Pendapatan diakui" value={rp(d.recognized)} sub={Number(d.advance) > 0 ? `uang muka ${rp(d.advance)} belum diakui` : Number(d.receivable) > 0 ? `piutang ${rp(d.receivable)}` : 'dari milestone yang diserahkan'} />
      </div>
      <span className="small muted">Uang yang diterima sebelum milestone diserahkan dicatat sebagai <b>uang muka</b> di Pembukuan. Saat milestone ditandai selesai, nilainya menjadi <b>pendapatan</b> (kekurangannya menjadi piutang). Saat proyek selesai, sisa nilai kontrak ikut diakui.</span>

      {toBill.length > 0 && canInv && <>
        <span className="label">Termin yang belum ditagih</span>
        <div className="list">{toBill.map((m) => (
          <div className="li" key={m.id}>
            <div className="main"><b className="small">{m.name}</b><span className="small muted">{rp(Number(m.amount) - Number(m.billed))}{Number(m.billed) > 0 ? ` dari ${rp(m.amount)}` : ''}{m.status === 'selesai' ? ' · sudah diserahkan' : m.due_date ? ` · target ${tglShort(m.due_date)}` : ''}</span></div>
            <button className="sm" onClick={() => setSheet({ inv: { milestone: m } })}>Tagihkan</button>
          </div>))}</div>
      </>}

      {d.invoices.length > 0 && <>
        <span className="label">Tagihan ({d.invoices.length})</span>
        {Number(d.unlinked) > 0 && <span className="small muted">Ada pembayaran tanpa tagihan {rp(d.unlinked)}: sudah mengurangi "Belum dibayar klien" proyek ini, tetapi status tiap tagihan di bawah tidak ikut berubah.</span>}
        <div className="list">{d.invoices.map((i) => { const st = invChip(i); return (
          <div className="li" key={i.id} style={{ flexWrap: 'wrap' }}>
            <Link href={`/proyek/tagihan/${i.id}`} className="main" style={{ flex: '1 1 200px', textDecoration: 'none', color: 'inherit' }}>
              <b className="small">{i.number} · {i.description}</b>
              <span className="small muted">{tgl(i.issue_date)}{i.due_date ? ` · jatuh tempo ${tglShort(i.due_date)}` : ''} · <b>{rp(i.amount)}</b>{i.state === 'sebagian' ? ` · dibayar ${rp(i.paid)}` : ''}</span></Link>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span className={'chip ' + st[1]}>{st[0]}</span>
              {i.status === 'terbit' && i.state !== 'lunas' && <button className="sm primary" onClick={() => setSheet({ pay: { kind: 'bayar', invoice: i } })}>Catat bayar</button>}
              {i.status === 'terbit' && Number(i.paid) === 0 && <button className="sm ghost danger" onClick={() => voidInv(i)}>Batal</button>}</div>
          </div>); })}</div>
      </>}

      {d.payments.length > 0 && <>
        <span className="label">Riwayat uang ({d.payments.length})</span>
        <div className="list">{d.payments.map((y) => (
          <div className="li" key={y.id}>
            <div className="main"><b className="small" style={y.status === 'batal' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null}>{PAY_KIND[y.kind]}{y.invoice ? ` · ${y.invoice}` : y.kind === 'bayar' ? ' · tanpa tagihan' : ''}</b>
              <span className="small muted">{tgl(y.pay_date)}{y.account ? ` · ${y.account === 'bank' ? 'Bank' : 'Kas'}` : ' · jadi pendapatan lain'}{y.note ? ` · ${y.note}` : ''}{y.status === 'batal' ? ` · dibatalkan: ${y.void_reason}` : ''}</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><b className="small" style={{ whiteSpace: 'nowrap', color: y.kind === 'bayar' ? undefined : 'var(--bad)' }}>{y.kind === 'bayar' ? '' : '−'}{rp(y.amount)}</b>
              {y.status === 'selesai' && <button className="sm ghost" aria-label="Batalkan" onClick={() => voidPay(y)}>Batal</button>}</div>
          </div>))}</div>
      </>}

      {Number(d.advance) > 0 && (d.status === 'batal' || d.status === 'selesai') && <div className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="small">Masih ada uang muka <b>{rp(d.advance)}</b> yang belum menjadi pendapatan{d.status === 'batal' ? ' (proyek batal)' : ''}. Kembalikan ke klien, atau nyatakan hangus sesuai kesepakatan.</span>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><button className="sm" onClick={() => setSheet({ pay: { kind: 'kembali' } })}>Kembalikan uang muka</button><button className="sm" onClick={() => setSheet({ pay: { kind: 'hangus' } })}>Uang muka hangus</button></div>
      </div>}
      {Number(d.advance) > 0 && !['batal', 'selesai'].includes(d.status) && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><button className="sm ghost" onClick={() => setSheet({ pay: { kind: 'kembali' } })}>Kembalikan uang muka</button><button className="sm ghost" onClick={() => setSheet({ pay: { kind: 'hangus' } })}>Uang muka hangus</button></div>}

      {sheet?.inv && <InvoiceSheet project={project} d={d} init={sheet.inv} onClose={() => setSheet(null)} onDone={created} />}
      {sheet?.pay && <PaySheet project={project} d={d} init={sheet.pay} onClose={() => setSheet(null)} onDone={done} />}
    </section>
  );
}

function InvoiceSheet({ project, d, init, onClose, onDone }) {
  const m = init.milestone;
  const [f, setF] = useState({ description: m?.name || '', amount: m ? angka(Number(m.amount) - Number(m.billed)) : '', issue_date: today(), due_date: addDays(today(), 7), note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const amt = parseRp(f.amount);
  const over = d.value != null && Number(d.billed) + amt > Number(d.value);
  const save = async () => {
    if (!(amt > 0)) return toast('Isi nominal tagihan.');
    if (f.description.trim().length < 2) return toast('Isi uraian tagihan.');
    setBusy(true);
    let id = null;
    const ok = await run(async () => { const r = await supabase.rpc('prj_invoice_create', { p_project: project.id, p: { ...f, amount: amt, milestone_id: m?.id || null, due_date: f.due_date || null } }); id = r.data; return r; }, 'Tagihan dibuat', errMsg);
    setBusy(false);
    if (ok) onDone(id);
  };
  return (
    <Sheet title={m ? `Tagihkan · ${m.name}` : 'Tagihan baru'} onClose={onClose}>
      <span className="small muted">Tagihan adalah dokumen untuk klien (cetak/PDF atau WA). Tagihan belum mengubah Pembukuan — uang tercatat saat pembayaran diterima.</span>
      <Field label="Uraian"><input value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} placeholder="mis. DP 30%, Pelunasan, Tambahan dokumentasi" /></Field>
      <Field label="Nominal"><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
      {over && <div className="notice">Total tagihan akan melebihi nilai kontrak ({rp(Number(d.billed) + amt)} dari {rp(d.value)}). Tetap boleh bila memang ada tambahan.</div>}
      <div className="row">
        <Field label="Tanggal tagihan"><input type="date" value={f.issue_date} max={today()} onChange={(e) => set('issue_date', e.target.value)} /></Field>
        <Field label="Jatuh tempo"><input type="date" value={f.due_date} min={f.issue_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{[['Hari ini', 0], ['+7 hari', 7], ['+14 hari', 14], ['+30 hari', 30]].map(([l, n]) => <button type="button" key={l} className={'sm' + (f.due_date === addDays(f.issue_date, n) ? ' primary' : '')} onClick={() => set('due_date', addDays(f.issue_date, n))}>{l}</button>)}</div>
      <Field label="Catatan untuk klien (opsional)"><input value={f.note} maxLength={500} onChange={(e) => set('note', e.target.value)} placeholder="mis. mohon cantumkan nomor tagihan saat transfer" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Buat tagihan'}</button>
    </Sheet>
  );
}

function PaySheet({ project, d, init, onClose, onDone }) {
  const kind = init.kind;
  const inv = init.invoice;
  const open = d.invoices.filter((i) => i.status === 'terbit' && i.state !== 'lunas');
  const [f, setF] = useState({ invoice_id: inv?.id || '', amount: inv ? angka(Number(inv.amount) - Number(inv.paid)) : kind !== 'bayar' ? angka(d.advance) : '', pay_date: today(), account: 'bank', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const pick = open.find((i) => i.id === f.invoice_id);
  const save = async () => {
    const amt = parseRp(f.amount);
    if (!(amt > 0)) return toast('Isi nominal.');
    if (pick && amt > Number(pick.amount) - Number(pick.paid)) return toast(`Maksimal ${rp(Number(pick.amount) - Number(pick.paid))} untuk tagihan ini. Catat kelebihannya tanpa memilih tagihan.`);
    if (kind !== 'bayar' && amt > Number(d.advance)) return toast(`Maksimal ${rp(d.advance)} (uang muka yang ada).`);
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_payment_add', { p_project: project.id, p: { kind, amount: amt, pay_date: f.pay_date, account: kind === 'hangus' ? null : f.account, invoice_id: kind === 'bayar' ? f.invoice_id || null : null, note: f.note } }),
      kind === 'bayar' ? 'Pembayaran dicatat di Kas & Pembukuan' : kind === 'kembali' ? 'Pengembalian dicatat' : 'Uang muka hangus dicatat sebagai pendapatan lain', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title={PAY_KIND[kind]} onClose={onClose}>
      {kind === 'bayar' && <>
        {open.length > 0 && <Field label="Untuk tagihan" hint="kosong = pembayaran tanpa tagihan, mis. DP yang langsung ditransfer"><select value={f.invoice_id} onChange={(e) => { const i = open.find((x) => x.id === e.target.value); setF((x) => ({ ...x, invoice_id: e.target.value, amount: i ? angka(Number(i.amount) - Number(i.paid)) : x.amount })); }}>
          <option value="">— tanpa tagihan —</option>{open.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.description} · sisa {rp(Number(i.amount) - Number(i.paid))}</option>)}</select></Field>}
      </>}
      {kind === 'kembali' && <span className="small muted">Uang dikembalikan ke klien dari kas/bank. Maksimal uang muka yang belum menjadi pendapatan ({rp(d.advance)}).</span>}
      {kind === 'hangus' && <span className="small muted">Uang muka tidak dikembalikan (mis. acara dibatalkan klien sesuai kontrak). Dicatat sebagai <b>pendapatan lain</b>, tidak ada uang yang keluar. Maksimal {rp(d.advance)}.</span>}
      <div className="row">
        <Field label="Nominal"><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Tanggal"><input type="date" value={f.pay_date} max={today()} onChange={(e) => set('pay_date', e.target.value)} /></Field>
      </div>
      {kind !== 'hangus' && <Field label={kind === 'bayar' ? 'Masuk ke' : 'Keluar dari'}><select value={f.account} onChange={(e) => set('account', e.target.value)}><option value="bank">Bank / transfer</option><option value="kas">Kas / tunai</option></select></Field>}
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder={kind === 'bayar' ? 'mis. transfer BCA a.n. Rina' : 'mis. sesuai pasal pembatalan kontrak'} /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}
