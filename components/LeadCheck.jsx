'use client';
// Permintaan dari Halaman bisnis: hasil cek otomatis (server: lead_check) + Konfirmasi satu ketukan (lead_confirm).
// Kos → booking kamar · Jasa → pesanan · Toko → keranjang Kasir terisi (prospek Jadi setelah dibayar).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Field, toast } from '@/components/ui';
import { rp, tgl, angka, parseRp, errMsg, waLink, today } from '@/lib/format';

const ICON = { ok: '✓', warn: '!', bad: '✕' };
const COLOR = { ok: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };
const VERDICT = { cocok: ['good', 'Cocok semua — tinggal konfirmasi'], perlu_cek: ['gold', 'Perlu dicek sebentar (lihat tanda !)'], tidak_bisa: ['bad', 'Belum bisa dikonfirmasi otomatis'], selesai: ['good', 'Sudah dikonfirmasi'] };

export default function LeadCheck({ lead, kos, onChanged }) {
  const router = useRouter();
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const load = () => supabase.rpc('lead_check', { p_lead: lead.id }).then(({ data, error }) => {
    if (error) return setErr(errMsg(error));
    setC(data);
    const p = data.proposal || {};
    if (data.kind === 'booking') setF({ room_id: p.room_id || '', check_in: p.check_in || today(), rent: p.rent != null ? angka(p.rent) : '', months: String(p.months || 1), dp: '', dp_account: 'bank', other: false });
    if (data.kind === 'svc_order') setF({ pickup: false, deliver: false, address: '', fee: '', note: p.date ? `Jemput/antar ${tgl(p.date)}` : '' });
  });
  useEffect(() => { load(); }, [lead.id, lead.stage]);
  if (err) return <span className="small muted">{/lead_check/.test(err) ? 'Cek otomatis belum tersedia (database sedang diperbarui).' : err}</span>;
  if (!c) return <span className="small muted">Mengecek permintaan…</span>;
  const set = (k, v) => setF({ ...f, [k]: v });
  const p = c.proposal || {};
  const [tone, title] = VERDICT[c.verdict] || VERDICT.perlu_cek;
  const wa = (text) => lead.phone && <a href={waLink(lead.phone, text)} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>Kabari {lead.name} via WhatsApp</button></a>;

  const confirm = async () => {
    let payload = {};
    if (c.kind === 'booking') {
      const rent = parseRp(f.rent); const dp = parseRp(f.dp) || 0;
      if (!f.room_id) return toast('Pilih kamar.');
      if (!(rent >= 0) || f.rent === '') return toast('Isi harga sewa yang disepakati.');
      payload = { room_id: f.room_id, check_in: f.check_in, rent, months: Number(f.months) || null, other_room: f.other, dp_amount: dp, dp_account: dp > 0 ? f.dp_account : null };
    }
    if (c.kind === 'svc_order') payload = { pickup: f.pickup, deliver: f.deliver, address: f.address, delivery_fee: parseRp(f.fee) || 0, note: f.note };
    setBusy(true);
    const { data, error } = await supabase.rpc('lead_confirm', { p_lead: lead.id, p: payload });
    setBusy(false);
    if (error) return toast(errMsg(error));
    if (data.kind === 'kasir') {
      try { localStorage.setItem('prasara.cart.' + kos.id, JSON.stringify({ tier: 'ecer', lead: { id: lead.id, number: lead.number, name: lead.name, phone: lead.phone },
        cart: (p.cart || []).map((x) => ({ key: x.product_id + '|' + x.unit, product_id: x.product_id, name: x.name, unit: x.unit, unit_qty: Number(x.unit_qty), qty: Number(x.qty), price: Number(x.price), auto: true })) })); } catch {}
      toast('Keranjang Kasir sudah terisi'); onChanged?.(); router.push('/kasir'); return;
    }
    toast(`Dikonfirmasi: ${data.number}`); setRes(data); onChanged?.(); load();
  };

  const room = (p.rooms || []).find((r) => r.id === f.room_id);
  const done = c.done || (res && { kind: res.kind, number: res.number });
  return (
    <section className="panel" style={{ gap: 8 }}>
      <div className="row between"><span className="label">Cek otomatis</span><span className={'chip ' + tone}>{title}</span></div>
      <div className="stack" style={{ gap: 4 }}>{(c.checks || []).map((x, i) => (
        <div key={i} className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <b style={{ color: COLOR[x.level], width: 14, flex: 'none', textAlign: 'center' }} aria-label={x.level}>{ICON[x.level]}</b><span>{x.text}</span></div>
      ))}</div>

      {done ? <>
        <div className="notice small">✓ {done.kind === 'booking' ? 'Booking' : done.kind === 'svc_order' ? 'Pesanan' : 'Penjualan'} <b>{done.number}</b> sudah dibuat dari permintaan ini.{' '}
          {done.kind === 'booking' ? <Link href="/booking">Buka Booking kamar →</Link> : done.kind === 'svc_order' ? <Link href="/pesanan">Buka Pesanan →</Link> : <Link href="/penjualan">Buka Penjualan →</Link>}</div>
        {res && done.kind === 'booking' && wa(`Halo ${lead.name}, permintaan ${lead.number} di ${kos.name} sudah kami konfirmasi: kamar ${room?.code || ''} mulai ${tgl(f.check_in)}, sewa ${rp(parseRp(f.rent))}/bulan. Booking: ${done.number}. Terima kasih!`)}
        {res && done.kind === 'svc_order' && wa(`Halo ${lead.name}, permintaan ${lead.number} di ${kos.name} sudah kami terima sebagai pesanan ${done.number}${res.total ? ` (perkiraan ${rp(res.total)}, final setelah ditimbang/dihitung)` : ''}.${f.pickup ? ' Kami akan menjemput sesuai jadwal.' : ''} Terima kasih!`)}
      </> : c.verdict !== 'tidak_bisa' && c.kind && <>
        {c.kind === 'booking' && <>
          <Field label="Kamar"><select value={f.room_id} onChange={(e) => { const r = p.rooms.find((x) => x.id === e.target.value); setF({ ...f, room_id: e.target.value, rent: r?.rent != null ? angka(r.rent) : f.rent, months: String(r?.months || f.months) }); }}>
            {(p.rooms || []).map((r) => <option key={r.id} value={r.id} disabled={!r.ok}>{r.code}{r.rent != null ? ` · ${rp(r.rent)}` : ''}{r.ok ? '' : ' · tidak bisa'}</option>)}</select></Field>
          <div className="row">
            <Field label="Tanggal masuk"><input type="date" value={f.check_in} min={today()} onChange={(e) => set('check_in', e.target.value)} /></Field>
            <Field label="Sewa/bulan"><input inputMode="numeric" value={f.rent} onChange={(e) => set('rent', e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Lama (bulan)"><input inputMode="numeric" value={f.months} onChange={(e) => set('months', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="DP sudah diterima? (opsional)" hint="Kosongkan bila belum"><input inputMode="numeric" value={f.dp} onChange={(e) => set('dp', e.target.value)} placeholder="Rp" /></Field>
          </div>
          {parseRp(f.dp) > 0 && <div className="seg">{[['bank', 'DP masuk ke bank'], ['kas', 'DP masuk ke kas']].map(([k, l]) => <button key={k} className={f.dp_account === k ? 'on' : ''} onClick={() => set('dp_account', k)}>{l}</button>)}</div>}
          {parseRp(f.dp) > 0 && f.dp_account === 'bank' && <span className="small" style={{ color: 'var(--warn)' }}>Isi DP hanya bila uangnya sudah benar-benar masuk ke rekening (cek mutasi).</span>}
        </>}
        {c.kind === 'svc_order' && <>
          <div className="list">{(p.lines || []).map((x) => <div className="li" key={x.service_id}><span className="small">{x.name} · {angka(x.qty)} {x.unit}{Number(x.charge_qty) > Number(x.qty) ? ` (ditagih ${angka(x.charge_qty)})` : ''}</span><b className="small">{rp(x.line_total)}</b></div>)}</div>
          <div className="row">
            <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.pickup} onChange={(e) => set('pickup', e.target.checked)} />Dijemput</label>
            <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.deliver} onChange={(e) => set('deliver', e.target.checked)} />Diantar</label>
          </div>
          {(f.pickup || f.deliver) && <div className="row"><Field label="Alamat"><input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field><Field label="Ongkos (Rp)"><input inputMode="numeric" value={f.fee} onChange={(e) => set('fee', e.target.value)} /></Field></div>}
          <Field label="Catatan pesanan"><input value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
          <span className="small muted">Berat/jumlah bisa diubah saat barang diterima (Pesanan › Ubah).</span>
        </>}
        {c.kind === 'kasir' && <>
          <div className="list">{(p.cart || []).map((x) => <div className="li" key={x.product_id + x.unit}><span className="small">{x.name} · {angka(x.qty)} {x.unit}</span><b className="small">{rp(Number(x.qty) * Number(x.price))}</b></div>)}</div>
          <div className="row between"><span className="small">Total (harga eceran sekarang)</span><b>{rp(p.total)}</b></div>
          <span className="small muted">Konfirmasi mengisi keranjang Kasir. Bayar di Kasir seperti biasa (tunai/transfer/kasbon); prospek otomatis Jadi.</span>
        </>}
        <button className="cta" disabled={busy} onClick={confirm}>{busy ? 'Memproses…' : c.kind === 'booking' ? 'Konfirmasi → buat booking' : c.kind === 'svc_order' ? 'Konfirmasi → buat pesanan' : 'Konfirmasi → proses di Kasir'}</button>
        {c.verdict === 'perlu_cek' && <span className="small muted">Tanda ! bukan larangan — periksa dulu, lalu konfirmasi bila sudah sesuai.</span>}
      </>}
      {!done && c.verdict === 'tidak_bisa' && lead.phone && <span className="small muted">Hubungi {lead.name} lewat WhatsApp untuk menawarkan pilihan lain, atau ubah tahap prospek.</span>}
    </section>
  );
}
