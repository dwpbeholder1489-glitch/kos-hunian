'use client';
// Pinjaman (Tahap A Master Blueprint BI, keputusan pemilik 27 Nov 2026: lewat menu Kas).
// Uang tetap lewat cash_entries (mesin lama) melalui RPC loan_move: bayar = pokok (akun Pinjaman) + bunga (Beban bunga).
// Daftar pinjaman (pokok, bunga %/tahun, tenor, cicilan, jatuh tempo) hanya rencana untuk porsi lancar & jadwal — bukan jurnal.
// Angka berakibat (bunga per cicilan) TIDAK diisi otomatis: ada tombol "Pakai perkiraan" yang jelas.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Empty, Field, Loading, Sheet, run, toast } from '@/components/ui';
import { errMsg, parseRp, rp, tgl, today } from '@/lib/format';
import { uid } from '@/lib/retail';

const ACC = { kas: 'Kas', bank: 'Bank' };
const n = (v) => Number(v || 0);
// Cicilan anuitas (pokok + bunga tetap per bulan) — hanya bantuan hitung saat pemilik menekan tombol
export const annuity = (principal, rateYear, months) => {
  const r = n(rateYear) / 1200; const m = n(months); const p = n(principal);
  if (!(p > 0) || !(m > 0)) return null;
  return Math.round(r > 0 ? (p * r) / (1 - (1 + r) ** -m) : p / m);
};
const addMonths = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + k); return t.toISOString().slice(0, 10); };

export default function Pinjaman({ kosId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    let on = true; setD(null);
    supabase.rpc('loan_overview', { p_kos: kosId }).then(({ data, error }) => { if (!on) return; if (error) setErr(error); else setD(data); });
    return () => { on = false; };
  }, [kosId, ver]);
  const done = () => { setSheet(null); setVer((v) => v + 1); };
  if (err) return <p className="notice bad">{/loan_overview/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p>;
  if (!d) return <Loading rows={3} />;
  const active = d.loans.filter((l) => l.status !== 'batal');
  const total = active.reduce((t, l) => t + n(l.balance), 0);
  const interest = active.reduce((t, l) => t + n(l.paid_interest), 0);
  const unlinkedNet = d.unlinked.reduce((t, c) => t + (c.kind === 'pinjaman_masuk' ? n(c.amount) : -n(c.amount)), 0);
  return <div className="stack" style={{ gap: 12 }}>
    <section className="panel">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div><span className="label">Sisa pokok pinjaman</span><h2 style={{ margin: '2px 0' }}>{rp(total)}</h2>
          <span className="small muted">Jatuh tempo ≤ 12 bulan {rp(d.porsi?.lancar)} · bunga sudah dibayar {rp(interest)}</span></div>
        <button className="primary" onClick={() => setSheet({ t: 'loan' })}>+ Pinjaman baru</button>
      </div>
      <p className="small muted" style={{ margin: '8px 0 0' }}>Pinjaman bukan pendapatan dan pembayaran pokoknya bukan biaya. Hanya <b>bunga</b> yang menjadi beban dan mengurangi laba.
        Saldo akun Pinjaman di Pembukuan: <b>{rp(d.akun_pinjaman)}</b>{Math.abs(n(d.akun_pinjaman) - total - unlinkedNet) > 1 ? ' — berbeda dari daftar; periksa catatan lama di bawah.' : (d.unlinked.length ? ' ✓ cocok (daftar + catatan lama belum terdaftar).' : ' ✓ cocok dengan daftar.')}</p>
    </section>
    {d.unlinked.length > 0 && <section className="panel">
      <h3 style={{ margin: 0 }}>Catatan pinjaman lama belum terdaftar</h3>
      <p className="small muted" style={{ margin: 0 }}>Tautkan ke pinjaman agar sisa pokok & jadwalnya terhitung. Jurnalnya tidak berubah.</p>
      <div className="list">{d.unlinked.map((c) => <div className="li" key={c.id}>
        <span className="small"><b>{c.kind === 'pinjaman_masuk' ? 'Diterima' : 'Dibayar'} {rp(c.amount)}</b><br /><span className="muted">{tgl(c.date)}{c.description ? ' · ' + c.description : ''}</span></span>
        <select aria-label="Tautkan ke pinjaman" value="" onChange={async (e) => { if (e.target.value && await run(() => supabase.rpc('loan_link', { p_kos: kosId, p_entry: c.id, p_loan: e.target.value }), 'Ditautkan', errMsg)) done(); }}>
          <option value="">Tautkan ke…</option>{active.map((l) => <option key={l.id} value={l.id}>{l.lender}</option>)}</select>
      </div>)}</div>
      {active.length === 0 && <p className="small">Buat pinjaman dulu dengan <b>+ Pinjaman baru</b>, lalu tautkan.</p>}
    </section>}
    {d.loans.length === 0 ? <Empty title="Belum ada pinjaman" text="Catat pinjaman bank, koperasi, atau keluarga beserta cicilannya agar bunga, sisa utang, dan jatuh tempo tercatat benar." /> :
      d.loans.map((l) => <section className="panel" key={l.id} style={{ opacity: l.status === 'batal' ? 0.6 : 1 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <b>{l.lender}</b><span className={'chip ' + (l.status === 'lunas' ? 'good' : l.status === 'batal' ? '' : 'gold')}>{l.status === 'lunas' ? 'Lunas' : l.status === 'batal' ? 'Batal' : 'Aktif'}</span></div>
        <dl className="kv">
          <dt>Sisa pokok</dt><dd><b>{rp(l.balance)}</b> dari {rp(l.received || l.principal)}</dd>
          <dt>Bunga</dt><dd>{l.rate_year != null ? `${l.rate_year}% per tahun` : '—'}{n(l.paid_interest) > 0 ? ` · dibayar ${rp(l.paid_interest)}` : ''}</dd>
          <dt>Cicilan</dt><dd>{l.installment ? `${rp(l.installment)} / bulan` : '—'}{l.term_months ? ` · ${l.term_months} bulan` : ''}</dd>
          <dt>Jatuh tempo akhir</dt><dd>{l.due_date ? tgl(l.due_date) : '—'}</dd>
          {l.last_payment && <><dt>Bayar terakhir</dt><dd>{tgl(l.last_payment)}</dd></>}
        </dl>
        {l.status !== 'batal' && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {n(l.received) < n(l.principal) && <button className="sm" onClick={() => setSheet({ t: 'move', kind: 'pinjaman_masuk', loan: l })}>Dana diterima</button>}
          {n(l.balance) > 0 && <button className="sm primary" onClick={() => setSheet({ t: 'move', kind: 'bayar_pinjaman', loan: l })}>Bayar cicilan</button>}
          <button className="sm" onClick={() => setSheet({ t: 'loan', loan: l })}>Ubah</button>
          {l.history.length > 0 && <button className="sm" onClick={() => setSheet({ t: 'hist', loan: l })}>Riwayat ({l.history.length})</button>}
          {l.history.length === 0 && <button className="sm" onClick={async () => { if (await run(() => supabase.rpc('loan_cancel', { p_kos: kosId, p_loan: l.id }), 'Pinjaman dibatalkan', errMsg)) done(); }}>Batalkan</button>}
        </div>}
      </section>)}
    {sheet?.t === 'loan' && <LoanForm kosId={kosId} loan={sheet.loan} onClose={() => setSheet(null)} onSaved={done} />}
    {sheet?.t === 'move' && <MoveForm kosId={kosId} kind={sheet.kind} loan={sheet.loan} onClose={() => setSheet(null)} onSaved={done} />}
    {sheet?.t === 'hist' && <Sheet title={`Riwayat · ${sheet.loan.lender}`} onClose={() => setSheet(null)}>
      <div className="list">{sheet.loan.history.map((h) => <div className="li" key={h.id}><span className="small"><b>{h.kind === 'pinjaman_masuk' ? 'Dana diterima' : 'Bayar'}</b><br />
        <span className="muted">{tgl(h.date)} · {ACC[h.account] || h.account}{h.kind === 'bayar_pinjaman' ? ` · pokok ${rp(n(h.amount) - n(h.interest))} · bunga ${rp(h.interest)}` : ''}</span></span><b className="small">{rp(h.amount)}</b></div>)}</div>
      <p className="small muted">Menghapus catatan dilakukan di riwayat Kas (pengeluaran/kas), sama seperti catatan lain.</p>
    </Sheet>}
  </div>;
}

function LoanForm({ kosId, loan, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ lender: loan?.lender || '', principal: loan ? String(loan.principal) : '', rate: loan?.rate_year != null ? String(loan.rate_year) : '',
    start: loan?.start_date || today(), term: loan?.term_months ? String(loan.term_months) : '', inst: loan?.installment ? String(loan.installment) : '', due: loan?.due_date || '', note: loan?.note || '' }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const calc = annuity(parseRp(f.principal), f.rate, f.term);
  const save = async () => {
    const p = parseRp(f.principal);
    if (f.lender.trim().length < 2) return toast('Isi nama pemberi pinjaman.');
    if (!(p > 0)) return toast('Isi jumlah pokok pinjaman.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('loan_save', { p_id: loan?.id || null, p_kos: kosId, p_data: { lender: f.lender, principal: p, rate_year: f.rate.replace(',', '.'),
      start_date: f.start, term_months: f.term, installment: f.inst ? String(parseRp(f.inst)) : '', due_date: f.due, note: f.note } }), 'Pinjaman disimpan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return <Sheet title={loan ? 'Ubah pinjaman' : 'Pinjaman baru'} onClose={onClose}>
    <Field label="Pemberi pinjaman"><input value={f.lender} onChange={set('lender')} placeholder="mis. Bank BRI, Koperasi, Pak Budi" /></Field>
    <div className="row"><Field label="Pokok pinjaman"><input inputMode="numeric" value={f.principal} onChange={set('principal')} placeholder="mis. 50jt" /></Field>
      <Field label="Tanggal mulai"><input type="date" value={f.start} onChange={set('start')} /></Field></div>
    <div className="row"><Field label="Bunga % per tahun" hint="Kosongkan bila tidak tahu / tanpa bunga"><input inputMode="decimal" value={f.rate} onChange={set('rate')} placeholder="mis. 12" /></Field>
      <Field label="Tenor (bulan)"><input inputMode="numeric" value={f.term} onChange={set('term')} placeholder="mis. 24" /></Field></div>
    <Field label="Cicilan per bulan (pokok + bunga)" hint="Sesuai perjanjian/rekening koran. Dipakai untuk menghitung pinjaman jatuh tempo ≤ 12 bulan.">
      <input inputMode="numeric" value={f.inst} onChange={set('inst')} /></Field>
    {calc && <button type="button" className="sm" onClick={() => setF((x) => ({ ...x, inst: String(calc) }))}>Pakai perhitungan anuitas: {rp(calc)} / bulan</button>}
    <Field label="Jatuh tempo akhir (opsional)"><input type="date" value={f.due} min={f.start} onChange={set('due')} /></Field>
    {f.term && f.start && !f.due && <button type="button" className="sm" onClick={() => setF((x) => ({ ...x, due: addMonths(x.start, n(x.term)) }))}>Isi jatuh tempo dari tenor: {tgl(addMonths(f.start, n(f.term)))}</button>}
    <Field label="Catatan (opsional)"><input value={f.note} onChange={set('note')} /></Field>
    <p className="small muted" style={{ margin: 0 }}>Menyimpan daftar ini belum mencatat uang. Setelah disimpan, ketuk <b>Dana diterima</b> saat uang pinjaman masuk.</p>
    <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pinjaman'}</button>
  </Sheet>;
}

function MoveForm({ kosId, kind, loan, onClose, onSaved }) {
  const pay = kind === 'bayar_pinjaman';
  const [id] = useState(uid);
  const [amount, setAmount] = useState(pay ? (loan.installment ? String(Math.round(n(loan.installment))) : '') : String(Math.max(0, n(loan.principal) - n(loan.received))));
  const [interest, setInterest] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState(pay ? 'kas' : 'bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const a = parseRp(amount); const i = interest ? parseRp(interest) : 0;
  const estimate = pay && loan.rate_year ? Math.round((n(loan.balance) * n(loan.rate_year)) / 1200) : null;
  const save = async () => {
    if (!(a > 0)) return toast('Isi jumlahnya.');
    if (pay && i > a) return toast('Bunga tidak boleh lebih besar dari jumlah yang dibayar.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('loan_move', { p_id: id, p_kos: kosId, p_loan: loan.id, p_kind: kind, p_amount: a, p_interest: pay ? i : 0, p_date: date, p_account: acc, p_note: note }),
      pay ? `Pembayaran ${rp(a)} tercatat` : `Dana ${rp(a)} tercatat`, errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return <Sheet title={pay ? `Bayar cicilan · ${loan.lender}` : `Dana diterima · ${loan.lender}`} onClose={onClose}>
    {pay && <p style={{ margin: 0 }}>Sisa pokok <b>{rp(loan.balance)}</b>.</p>}
    <div className="row"><Field label={pay ? 'Jumlah dibayar (total)' : 'Jumlah diterima'}><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
    {pay && <>
      <Field label="Bagian bunga" hint="Lihat rincian di rekening koran / kuitansi. Kosongkan bila seluruhnya pokok."><input inputMode="numeric" value={interest} onChange={(e) => setInterest(e.target.value)} /></Field>
      {estimate != null && <button type="button" className="sm" onClick={() => setInterest(String(estimate))}>Pakai perkiraan bunga 1 bulan: {rp(estimate)}</button>}
      <p className="small" style={{ margin: 0 }}>Pokok berkurang <b>{rp(Math.max(0, a - i))}</b> · beban bunga <b>{rp(i)}</b> (mengurangi laba)</p>
    </>}
    <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{pay ? 'Dibayar dari' : 'Masuk ke'} {l}</button>)}</div>
    <Field label="Keterangan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={pay ? 'mis. cicilan ke-3' : ''} /></Field>
    <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
  </Sheet>;
}
