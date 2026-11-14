'use client';
import { useEffect, useState } from 'react';
import { useBaru } from '@/lib/useBaru';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, tgl, today, parseRp, errMsg, waLink } from '@/lib/format';
import { uid } from '@/lib/retail';
import { FirstDue } from '@/components/LeaseForms';
import { canArea } from '@/lib/business';

const ACC = [['kas', 'Kas (tunai)'], ['bank', 'Bank / transfer']];
const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const days = (iso) => Math.round((new Date(iso + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 864e5);
const when = (iso) => { const n = days(iso); return n === 0 ? 'hari ini' : n === 1 ? 'besok' : n > 0 ? `${n} hari lagi` : `lewat ${-n} hari`; };

// Booking kamar: calon penghuni memesan kamar untuk tanggal masuk tertentu, boleh dengan uang tanda jadi (DP)
export default function Booking() {
  const d = useData();
  const { kos, kosId } = useKos();
  const [f, setF] = useState('aktif');
  const [neu, setNeu] = useState(null);
  useBaru(() => setNeu({}));
  const [open, setOpen] = useState(null);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const room = sp.get('kamar'), lead = sp.get('lead');
      if (lead) supabase.from('crm_leads').select('id,name,phone,need').eq('id', lead).maybeSingle().then(({ data }) => data && setNeu({ lead_id: data.id, name: data.name, phone: data.phone || '', note: data.need || '' }));
      else if (room) setNeu({ room_id: room });
    } catch {}
  }, []);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;
  const list = d.bookings.filter((b) => b.status === f).sort((a, b) => (f === 'aktif' ? a.check_in.localeCompare(b.check_in) : (b.closed_at || '').localeCompare(a.closed_at || '')));
  const cur = open && d.bookings.find((b) => b.id === open);
  const dpHeld = d.bookings.filter((b) => b.status === 'aktif').reduce((s, b) => s + b.dp_amount, 0);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Booking kamar</h2><PageHelp page="booking" /></div><button className="primary" onClick={() => setNeu({})}>+ Booking</button></div>
      <div className="seg">{[['aktif', `Aktif (${d.bookings.filter((b) => b.status === 'aktif').length})`], ['selesai', 'Sudah masuk'], ['batal', 'Batal']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
      {f === 'aktif' && dpHeld > 0 && <span className="small muted">Uang tanda jadi yang dipegang: <b>{rp(dpHeld)}</b> (bukan pendapatan sampai penghuni masuk atau DP hangus).</span>}
      {list.length === 0 ? <Empty title={f === 'aktif' ? 'Belum ada booking aktif' : 'Tidak ada data'} text="Catat calon penghuni yang sudah pasti mau masuk agar kamarnya tidak diisi orang lain." /> : (
        <section className="panel"><div className="list">{list.map((b) => {
          const late = b.status === 'aktif' && days(b.check_in) < 0;
          const exp = b.status === 'aktif' && b.expires_on && b.expires_on < today();
          return (
            <button key={b.id} className="li click" onClick={() => setOpen(b.id)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{b.name} · Kamar {d.roomCode(b.room_id)}</b>
                <span className="small muted">{b.number} · masuk {tgl(b.check_in)}{b.status === 'aktif' ? ` (${when(b.check_in)})` : ''}</span>
                <span className="small muted">{rp(b.rent)}/bulan{b.dp_amount > 0 ? ` · DP ${rp(b.dp_amount)}` : ' · tanpa DP'}{b.status === 'batal' ? ` · ${b.close_reason}` : ''}</span></div>
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                {b.status === 'aktif' && <span className={'chip ' + (late ? 'bad' : days(b.check_in) <= 3 ? 'gold' : 'info')}>{late ? 'Terlewat' : days(b.check_in) <= 3 ? 'Segera masuk' : 'Menunggu'}</span>}
                {exp && <span className="chip bad">Lewat batas</span>}
                {b.status === 'selesai' && <span className="chip good">Sudah masuk</span>}
                {b.status === 'batal' && <span className="chip void">{b.forfeit_amount > 0 ? 'Batal · DP hangus' : 'Batal'}</span>}
              </div>
            </button>
          );
        })}</div></section>
      )}
      {neu && <BookingForm d={d} kosId={kosId} init={neu} onClose={() => setNeu(null)} onSaved={() => setNeu(null)} />}
      {cur && <Detail d={d} kos={kos} b={cur} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BookingForm({ d, kosId, init, b, onClose, onSaved }) {
  const { bump } = useKos();
  const edit = Boolean(b);
  const src = b || init;
  const [p, setP] = useState({ room_id: src.room_id || '', name: src.name || '', phone: src.phone || '', check_in: src.check_in || addDays(today(), 7), months: src.months ? String(src.months) : '',
    rent: src.rent != null ? String(Math.round(src.rent)) : '', expires_on: src.expires_on || '', note: src.note || '', dp: '', dp_account: 'kas', dp_date: today() });
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const room = p.room_id && d.roomById.get(p.room_id);
  useEffect(() => { if (room && !edit && !p.rent && room.rent) set('rent', String(Math.round(room.rent))); }, [p.room_id]);
  const occ = room && d.activeByRoom.get(room.id);
  // kamar yang bisa dipilih: belum dibooking orang lain dan bukan "tidak disewakan"
  const rooms = d.rooms.filter((r) => r.status !== 'tidak_disewakan' && (!d.bookByRoom.get(r.id) || d.bookByRoom.get(r.id).id === b?.id));
  const save = async () => {
    if (!p.room_id) return toast('Pilih kamar.');
    if (p.name.trim().length < 2) return toast('Isi nama calon penghuni.');
    if (!p.check_in) return toast('Isi tanggal masuk.');
    const rent = parseRp(p.rent);
    if (!(rent >= 0) || p.rent === '') return toast('Isi harga sewa yang disepakati.');
    const dp = p.dp.trim() ? parseRp(p.dp) : 0;
    if (p.dp.trim() && !(dp > 0)) return toast('Jumlah DP tidak valid.');
    setBusy(true);
    const body = { room_id: p.room_id, name: p.name, phone: p.phone, check_in: p.check_in, months: p.months, rent, expires_on: p.expires_on, note: p.note };
    const ok = edit
      ? await run(() => supabase.rpc('booking_update', { p_booking: b.id, p: body }), 'Booking diperbarui', errMsg)
      : await run(() => supabase.rpc('booking_create', { p_id: id, p_kos: kosId, p: { ...body, lead_id: init.lead_id || null, dp_amount: dp, dp_account: p.dp_account, dp_date: p.dp_date } }), 'Booking dicatat', errMsg);
    setBusy(false);
    if (ok) { bump(); onSaved(); }
  };
  return (
    <Sheet title={edit ? `Ubah ${b.number}` : 'Booking kamar'} onClose={onClose}>
      {init?.lead_id && <div className="notice small">Dari prospek: {init.name}. Saat check-in, prospek otomatis ditandai Jadi.</div>}
      <Field label="Kamar"><select value={p.room_id} onChange={(e) => set('room_id', e.target.value)}><option value="">Pilih kamar…</option>
        {rooms.map((r) => { const l = d.activeByRoom.get(r.id); return <option key={r.id} value={r.id}>{r.code}{l ? ` · terisi${l.end_date ? ` s/d ${tgl(l.end_date)}` : ''}` : r.status === 'perbaikan' ? ' · perbaikan' : ' · kosong'}{r.rent ? ` · ${rp(r.rent)}` : ''}</option>; })}</select></Field>
      {occ && <span className="small muted">Kamar ini masih terisi {d.occName(occ.occupant_id)}{occ.end_date ? ` sampai ${tgl(occ.end_date)} — tanggal masuk harus setelahnya.` : ' tanpa rencana selesai. Isi dulu di Penghuni › ketuk nama › Rencana selesai › ubah.'}</span>}
      <div className="row">
        <Field label="Nama calon penghuni"><input value={p.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="No. WhatsApp"><input inputMode="tel" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Tanggal masuk"><input type="date" value={p.check_in} onChange={(e) => set('check_in', e.target.value)} /></Field>
        <Field label="Lama sewa (bulan, opsional)"><input inputMode="numeric" value={p.months} onChange={(e) => set('months', e.target.value.replace(/\D/g, ''))} placeholder="mis. 6" /></Field>
      </div>
      <div className="row">
        <Field label="Sewa per bulan (disepakati)"><input inputMode="numeric" value={p.rent} onChange={(e) => set('rent', e.target.value)} /></Field>
        <Field label="Batas konfirmasi (opsional)" hint="lewat tanggal ini tampil peringatan"><input type="date" value={p.expires_on} onChange={(e) => set('expires_on', e.target.value)} /></Field>
      </div>
      {!edit && <>
        <Field label="Uang tanda jadi / DP (opsional)" hint="Dipegang dulu; saat check-in jadi deposit atau bayar tagihan pertama"><input inputMode="numeric" value={p.dp} onChange={(e) => set('dp', e.target.value)} placeholder="mis. 300rb" /></Field>
        {p.dp.trim() && <div className="row">
          <div className="seg">{ACC.map(([k, l]) => <button key={k} className={p.dp_account === k ? 'on' : ''} onClick={() => set('dp_account', k)}>{l}</button>)}</div>
          <Field label="Tanggal DP diterima"><input type="date" value={p.dp_date} max={today()} onChange={(e) => set('dp_date', e.target.value)} /></Field>
        </div>}
      </>}
      <Field label="Catatan (opsional)"><input value={p.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="mis. mahasiswi, minta kasur baru" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function Detail({ d, kos, b, onClose }) {
  const { bump } = useKos();
  const money = canArea(kos, 'finance');
  const [mode, setMode] = useState(null); // 'checkin' | 'batal' | 'ubah'
  const room = d.roomById.get(b.room_id);
  const occ = d.activeByRoom.get(b.room_id);
  const canIn = b.status === 'aktif' && room?.status === 'tersedia';
  const msg = `Halo ${b.name}, booking kamar ${room?.code} di ${kos.name} sudah kami catat (${b.number}). Tanggal masuk ${tgl(b.check_in)}, sewa ${rp(b.rent)}/bulan${b.dp_amount > 0 ? `, uang tanda jadi ${rp(b.dp_amount)} sudah kami terima` : ''}${b.expires_on ? `. Mohon konfirmasi sebelum ${tgl(b.expires_on)}` : ''}. Terima kasih.`;
  if (mode === 'ubah') return <BookingForm d={d} kosId={kos.id} b={b} onClose={() => setMode(null)} onSaved={() => setMode(null)} />;
  return (
    <Sheet title={`${b.number} · ${b.name}`} onClose={onClose}>
      <dl className="kv">
        <dt>Kamar</dt><dd>{room?.code}</dd>
        <dt>Tanggal masuk</dt><dd>{tgl(b.check_in)}{b.status === 'aktif' ? ` (${when(b.check_in)})` : ''}</dd>
        {b.months && <><dt>Lama sewa</dt><dd>{b.months} bulan</dd></>}
        <dt>Sewa</dt><dd>{rp(b.rent)}/bulan</dd>
        <dt>Uang tanda jadi</dt><dd>{b.dp_amount > 0 ? `${rp(b.dp_amount)} · ${b.dp_account === 'bank' ? 'bank' : 'kas'} · ${tgl(b.dp_date)}` : '—'}</dd>
        {b.phone && <><dt>WhatsApp</dt><dd>{b.phone}</dd></>}
        {b.applicant?.address && <><dt>Alamat asal</dt><dd style={{ overflowWrap: 'anywhere' }}>{b.applicant.address}</dd></>}
        {b.applicant?.emergency_phone && <><dt>Kontak darurat</dt><dd>{b.applicant.emergency_name}{b.applicant.emergency_rel ? ` (${b.applicant.emergency_rel})` : ''} · {b.applicant.emergency_phone}</dd></>}
        {b.expires_on && <><dt>Batas konfirmasi</dt><dd style={{ color: b.status === 'aktif' && b.expires_on < today() ? 'var(--bad)' : undefined }}>{tgl(b.expires_on)}</dd></>}
        {b.note && <><dt>Catatan</dt><dd>{b.note}</dd></>}
        {b.status !== 'aktif' && <><dt>{b.status === 'selesai' ? 'Masuk' : 'Dibatalkan'}</dt><dd>{tgl(b.closed_date)} · {b.closed_by}</dd></>}
        {b.status === 'batal' && <><dt>Alasan</dt><dd>{b.close_reason}</dd>{b.dp_amount > 0 && <><dt>DP</dt><dd>dikembalikan {rp(b.refund_amount)} · hangus {rp(b.forfeit_amount)}</dd></>}</>}
        <dt>Dicatat</dt><dd>{b.created_by}</dd>
      </dl>
      {b.status === 'aktif' && <>
        {!canIn && occ && <div className="notice small">Kamar masih ditempati {d.occName(occ.occupant_id)}. Akhiri sewanya dulu (Kamar › Akhiri sewa), lalu Check-in.</div>}
        {!canIn && !occ && room?.status === 'perbaikan' && <div className="notice small">Kamar sedang perbaikan. Selesaikan keluhannya dulu, lalu Check-in.</div>}
        <div className="row">
          <button className="primary" disabled={!canIn} onClick={() => setMode(mode === 'checkin' ? null : 'checkin')}>Check-in (mulai sewa)</button>
          <button className="sm" onClick={() => setMode('ubah')}>Ubah</button>
          {b.phone && <a href={waLink(b.phone, msg)} target="_blank" rel="noreferrer"><button className="sm">WA konfirmasi</button></a>}
        </div>
        {mode === 'checkin' && <CheckIn d={d} b={b} onDone={() => { bump(); onClose(); }} />}
        {(b.dp_amount === 0 || money) ? <button className="sm ghost danger" onClick={() => setMode(mode === 'batal' ? null : 'batal')}>Batalkan booking</button>
          : <span className="small muted">Booking dengan DP hanya bisa dibatalkan pemilik/pengelola.</span>}
        {mode === 'batal' && <Cancel b={b} onDone={() => { bump(); onClose(); }} />}
      </>}
    </Sheet>
  );
}

function CheckIn({ d, b, onDone }) {
  const [start, setStart] = useState(b.check_in < today() ? today() : b.check_in);
  const [due, setDue] = useState(addDays(b.check_in < today() ? today() : b.check_in, 3));
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('tunai');
  const [end, setEnd] = useState('');
  const [occ, setOcc] = useState(''); // '' = penghuni baru dari data booking
  const [apply, setApply] = useState(b.dp_amount > 0);
  const [busy, setBusy] = useState(false);
  const free = d.occupants.filter((o) => !d.activeByOcc.get(o.id));
  const go = async () => {
    if (due < start) return toast('Batas bayar tidak boleh sebelum tanggal masuk.');
    const pay = parseRp(paid) || 0;
    if (paid.trim() && !(pay > 0)) return toast('Jumlah pembayaran tidak valid.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('booking_checkin', { p_booking: b.id, p: { start, billing_start: start, first_due: due, end: end || null, occupant_id: occ || null, dp_to_invoice: apply, ...(pay > 0 ? { paid_amount: pay, paid_method: method } : {}) } }),
      'Check-in selesai. Sewa dimulai.' + (b.dp_amount > 0 ? (apply ? ' DP dipakai untuk tagihan pertama.' : ' DP menjadi deposit.') : '') + (pay > 0 ? ` Pembayaran ${rp(pay)} tercatat.` : ` Tagihan pertama jatuh tempo ${tgl(due)}.`), errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Tanggal masuk" hint="Sewa dihitung mulai tanggal ini"><input type="date" value={start} onChange={(e) => { const v = e.target.value; if (due < v || due === addDays(start, 3)) setDue(addDays(v, 3)); setStart(v); }} /></Field>
      <div className="row">
        <Field label="Sewa bulan pertama sudah dibayar?" hint={`Kosongkan bila belum. Sewa ${rp(b.rent)}/bulan`}><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Rp" /></Field>
        {paid.trim() && <Field label="Cara bayar"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="tunai">Tunai</option><option value="transfer">Transfer</option><option value="ewallet">QRIS / e-wallet</option></select></Field>}
      </div>
      {!paid.trim() && <button type="button" className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setPaid(String(Math.max(0, Math.round(b.rent - (apply ? b.dp_amount : 0)))))}>Sudah dibayar penuh → isi {rp(Math.max(0, b.rent - (apply ? b.dp_amount : 0)))}</button>}
      {(parseRp(paid) || 0) + (apply ? Number(b.dp_amount) : 0) < Number(b.rent) && <FirstDue start={start} value={due} onChange={setDue} />}
      <Field label="Rencana selesai (opsional)" hint={b.months ? `kosongkan = ${b.months} bulan dari tanggal masuk` : undefined}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Field label="Data penghuni"><select value={occ} onChange={(e) => setOcc(e.target.value)}><option value="">Buat penghuni baru: {b.name}{b.phone ? ` · ${b.phone}` : ''}</option>{free.map((o) => <option key={o.id} value={o.id}>Pakai data lama: {o.name}</option>)}</select></Field>
      {b.dp_amount > 0 && <>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={apply} onChange={(e) => setApply(e.target.checked)} />Pakai DP {rp(b.dp_amount)} untuk membayar tagihan pertama</label>
        <span className="small muted">{apply ? 'DP melunasi tagihan pertama (sisa DP bila ada tetap jadi deposit).' : 'DP disimpan sebagai deposit/uang jaminan penghuni.'}</span>
      </>}
      <button className="cta" disabled={busy} onClick={go}>{busy ? 'Memproses…' : 'Check-in sekarang'}</button>
    </div>
  );
}

function Cancel({ b, onDone }) {
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(b.dp_amount > 0 ? String(Math.round(b.dp_amount)) : '');
  const [acc, setAcc] = useState(b.dp_account || 'kas');
  const [busy, setBusy] = useState(false);
  const r = b.dp_amount > 0 ? (refund.trim() ? parseRp(refund) : 0) : 0;
  const go = async () => {
    if (!reason.trim()) return toast('Tulis alasan pembatalan.');
    if (b.dp_amount > 0 && !(r >= 0 && r <= b.dp_amount)) return toast(`Pengembalian 0 sampai ${rp(b.dp_amount)}.`);
    setBusy(true);
    const ok = await run(() => supabase.rpc('booking_cancel', { p_booking: b.id, p_reason: reason.trim(), p_refund: r, p_account: acc }), 'Booking dibatalkan', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Alasan"><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="mis. tidak jadi kuliah di sini" /></Field>
      {b.dp_amount > 0 && <>
        <Field label="DP dikembalikan" hint={`dari DP ${rp(b.dp_amount)}; sisanya hangus jadi pendapatan lain`}><input inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value)} /></Field>
        {r > 0 && <div className="seg">{ACC.map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>Dari {l}</button>)}</div>}
        <span className="small muted">Dikembalikan {rp(r)} · hangus {rp(Math.max(0, b.dp_amount - r))}</span>
      </>}
      <button className="danger" disabled={busy} onClick={go}>{busy ? 'Memproses…' : 'Batalkan booking'}</button>
    </div>
  );
}
