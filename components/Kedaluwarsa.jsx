'use client';
// Barang › Kedaluwarsa: batch yang akan/sudah kedaluwarsa (server: expiry_list), ubah tanggal (batch_set),
// pisahkan sebagian (batch_split), buang (batch_writeoff). Stok keluar otomatis dari yang paling cepat kedaluwarsa (FEFO).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withApproval } from '@/lib/approval';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, tgl, errMsg } from '@/lib/format';
import { qtyNum } from '@/lib/retail';
import PageHelp from '@/components/PageHelp';

const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };
export const expChip = (b) => b.expiry == null ? ['Tanggal belum diisi', 'void'] : b.days < 0 ? [`Lewat ${-b.days} hari`, 'bad'] : b.days === 0 ? ['Kedaluwarsa hari ini', 'bad'] : b.days <= 30 ? [`${b.days} hari lagi`, 'gold'] : [`${b.days} hari lagi`, 'good'];

export default function Kedaluwarsa({ kosId, ver, tracked, multi, onChanged }) {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => supabase.rpc('expiry_list', { p_kos: kosId, p_days: days }).then(({ data, error }) => (error ? toast(errMsg(error)) : setRows(data || [])));
  useEffect(() => { setRows(null); load(); }, [kosId, ver, days]);
  if (!tracked) return <Empty title="Belum ada barang yang dicatat kedaluwarsanya" text="Buka barang › Ubah › centang Catat tanggal kedaluwarsa (mis. susu, roti, obat, makanan). Tanggalnya diisi saat belanja/terima barang; stok keluar otomatis dari yang paling cepat kedaluwarsa." />;
  if (!rows) return <Loading />;
  const expired = rows.filter((b) => b.expiry != null && b.days < 0);
  const soon = rows.filter((b) => b.expiry != null && b.days >= 0 && b.days <= 30);
  const nodate = rows.filter((b) => b.expiry == null);
  return (
    <div className="stack">
      <div className="row between"><b>Kedaluwarsa</b><PageHelp page="kedaluwarsa" /></div>
      <div className="grid">
        <Tile label="Sudah kedaluwarsa" value={angka(expired.length)} tone={expired.length ? 'bad' : ''} sub={expired.length ? `modal ${rp(expired.reduce((a, b) => a + Number(b.value), 0))}` : 'tidak ada'} />
        <Tile label="≤ 30 hari lagi" value={angka(soon.length)} tone={soon.length ? 'gold' : ''} sub={soon.length ? `modal ${rp(soon.reduce((a, b) => a + Number(b.value), 0))}` : 'tidak ada'} />
        <Tile label="Tanggal belum diisi" value={angka(nodate.length)} sub={nodate.length ? 'ketuk untuk mengisi' : 'lengkap'} />
      </div>
      <div className="seg">{[[30, '≤ 30 hari'], [60, '≤ 60 hari'], [null, 'Semua batch']].map(([v, l]) => <button key={l} className={days === v ? 'on' : ''} onClick={() => setDays(v)}>{l}</button>)}</div>
      {rows.length === 0 ? <Empty title="Aman" text="Tidak ada stok yang kedaluwarsa dalam rentang ini." /> :
        <section className="panel"><div className="list">{rows.map((b) => {
          const [t, c] = expChip(b);
          return (
            <button key={b.id} className="li click" style={LI} onClick={() => setOpen(b)}>
              <div className="main"><b>{b.name}</b><span className="small muted">{b.expiry ? `Exp ${tgl(b.expiry)}` : 'Tanpa tanggal'}{b.lot ? ` · batch ${b.lot}` : ''}{multi && b.branch ? ` · ${b.branch}` : ''}</span></div>
              <div style={{ textAlign: 'right' }}><span className={'chip ' + c}>{t}</span><div className="small">{angka(b.qty)} {b.unit}</div></div>
            </button>
          );
        })}</div></section>}
      <span className="small muted">Penjualan & pemakaian otomatis mengambil stok yang paling cepat kedaluwarsa lebih dulu. Barang yang sudah lewat tetap bisa terjual di Kasir — singkirkan dari rak lalu tekan <b>Buang</b>.</span>
      {open && <BatchSheet kosId={kosId} b={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); onChanged?.(); }} />}
    </div>
  );
}

function BatchSheet({ kosId, b, onClose, onDone }) {
  const [mode, setMode] = useState(b.expiry == null ? 'tanggal' : null);
  const [exp, setExp] = useState(b.expiry || '');
  const [lot, setLot] = useState(b.lot || '');
  const [qty, setQty] = useState(angka(b.qty));
  const [reason, setReason] = useState(b.days != null && b.days < 0 ? 'kedaluwarsa' : 'rusak');
  const [busy, setBusy] = useState(false);
  const [t, c] = expChip(b);
  const go = async (fn, args, ok, appr) => {
    setBusy(true);
    const done = appr ? await withApproval(() => supabase.rpc(fn, args), ok, appr) : await run(() => supabase.rpc(fn, args), ok, errMsg);
    setBusy(false);
    if (done) onDone();
  };
  return (
    <Sheet title={b.name} onClose={onClose}>
      <span className={'chip ' + c} style={{ alignSelf: 'flex-start' }}>{t}</span>
      <dl className="kv">
        <dt>Kedaluwarsa</dt><dd>{b.expiry ? tgl(b.expiry) : 'belum diisi'}</dd>
        {b.lot && <><dt>No. batch</dt><dd>{b.lot}</dd></>}
        <dt>Sisa</dt><dd>{angka(b.qty)} {b.unit}</dd>
        <dt>Nilai modal</dt><dd>{rp(b.value)}</dd>
        {b.branch && <><dt>Lokasi</dt><dd>{b.branch}</dd></>}
        <dt>Masuk</dt><dd>{tgl(String(b.received_at).slice(0, 10))}</dd>
      </dl>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className={mode === 'tanggal' ? 'primary' : ''} onClick={() => setMode('tanggal')}>Ubah tanggal</button>
        <button className={mode === 'pisah' ? 'primary' : ''} onClick={() => setMode('pisah')}>Pisahkan sebagian</button>
        <button className={mode === 'buang' ? 'danger' : 'ghost danger'} onClick={() => setMode('buang')}>Buang</button>
      </div>
      {mode === 'tanggal' && <div className="unitbox">
        <div className="row"><Field label="Tanggal kedaluwarsa"><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field><Field label="No. batch (opsional)"><input value={lot} maxLength={40} onChange={(e) => setLot(e.target.value)} /></Field></div>
        <button className="primary" disabled={busy} onClick={() => go('batch_set', { p_batch: b.id, p_expiry: exp || null, p_lot: lot }, 'Tanggal disimpan')}>Simpan</button>
      </div>}
      {mode === 'pisah' && <div className="unitbox">
        <span className="small muted">Untuk stok yang ternyata berisi dua tanggal: pisahkan sebagian ke tanggal lain.</span>
        <div className="row"><Field label={`Jumlah (${b.unit})`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field><Field label="Tanggal kedaluwarsa"><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field></div>
        <Field label="No. batch (opsional)"><input value={lot} maxLength={40} onChange={(e) => setLot(e.target.value)} /></Field>
        <button className="primary" disabled={busy} onClick={() => go('batch_split', { p_batch: b.id, p_qty: qtyNum(qty), p_expiry: exp || null, p_lot: lot }, 'Batch dipisahkan')}>Pisahkan</button>
      </div>}
      {mode === 'buang' && <div className="unitbox">
        <div className="seg">{[['kedaluwarsa', 'Kedaluwarsa'], ['rusak', 'Rusak']].map(([k, l]) => <button key={k} className={reason === k ? 'on' : ''} onClick={() => setReason(k)}>{l}</button>)}</div>
        <Field label={`Jumlah dibuang (${b.unit})`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <span className="small muted">Stok berkurang dan nilai modalnya tercatat sebagai kerugian {reason}. Bisa perlu persetujuan pemilik sesuai pengaturan.</span>
        <button className="danger" disabled={busy} onClick={() => go('batch_writeoff', { p_batch: b.id, p_qty: qtyNum(qty), p_reason: reason, p_note: null }, 'Stok dibuang & tercatat',
          { kos: kosId, action: 'penyesuaian_stok', payload: { product_id: b.product_id, reason, qty: qtyNum(qty), note: `Batch ${b.lot || ''}${b.expiry ? ' exp ' + b.expiry : ''}`.trim() } })}>Buang {qty} {b.unit}</button>
      </div>}
    </Sheet>
  );
}
