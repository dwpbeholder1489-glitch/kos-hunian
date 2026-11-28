'use client';
// Kontrol tracking pesanan toko/grosir untuk penjual (so_track_set): tandai "Disiapkan" dan isi kurir, No. resi,
// estimasi tiba per surat jalan. Yang diisi di sini PERSIS yang dilihat pelanggan di layar Tracking Pesanan.
// Estimasi boleh dikosongkan → pelanggan melihat "Belum ditentukan toko" (tidak ditebak sistem).
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { etaText } from '@/lib/tracking';

// datetime-local (WIB) ↔ ISO
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v + ':00+07:00').toISOString() : null);

export default function TrackingControls({ track, onChanged }) {
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!track || track.type !== 'so_order') return null;
  const save = async (p, msg) => {
    setBusy(true);
    const { error } = await supabase.rpc('so_track_set', { p_order: track.id, p });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(msg); setEdit(null); onChanged?.();
  };
  const canPrep = ['dikonfirmasi', 'sebagian'].includes(track.status);
  const deliveries = (track.deliveries || []).filter((d) => d.status !== 'gagal');
  return <div className="unitbox small" style={{ gap: 8 }}>
    <b>Tracking untuk pelanggan</b>
    {track.status === 'penawaran' && <span className="muted">Konfirmasi pesanan dulu; tahap berikutnya muncul setelah itu.</span>}
    {canPrep && <label className="row small" style={{ gap: 8, flexWrap: 'nowrap', fontWeight: 700 }}>
      <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={Boolean(track.prepared_at)} disabled={busy}
        onChange={(e) => save({ prepared: e.target.checked }, e.target.checked ? 'Ditandai disiapkan' : 'Tanda disiapkan dihapus')} />
      Barang sedang disiapkan / dikemas
    </label>}
    {deliveries.length === 0 && track.status !== 'penawaran' && track.status !== 'batal' && <span className="muted">Tahap "Dikirim" muncul saat surat jalan dibuat.</span>}
    {deliveries.map((d) => (edit?.id === d.id ? <form key={d.id} className="stack" style={{ gap: 6 }} onSubmit={(e) => {
      e.preventDefault();
      save({ delivery_id: d.id, courier: edit.courier, tracking_no: edit.tracking_no, eta_from: fromLocal(edit.eta_from), eta_to: fromLocal(edit.eta_to) }, 'Info pengiriman disimpan');
    }}>
      <b>{d.number}</b>
      <label className="f">Kurir / jasa kirim<input value={edit.courier} maxLength={60} placeholder="mis. Kurir toko, JNE" onChange={(e) => setEdit({ ...edit, courier: e.target.value })} /></label>
      <label className="f">No. resi (opsional)<input value={edit.tracking_no} maxLength={60} onChange={(e) => setEdit({ ...edit, tracking_no: e.target.value })} /></label>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <label className="f" style={{ flex: '1 1 140px' }}>Estimasi tiba dari<input type="datetime-local" value={edit.eta_from} onChange={(e) => setEdit({ ...edit, eta_from: e.target.value })} /></label>
        <label className="f" style={{ flex: '1 1 140px' }}>sampai (opsional)<input type="datetime-local" value={edit.eta_to} onChange={(e) => setEdit({ ...edit, eta_to: e.target.value })} /></label>
      </div>
      <div className="row" style={{ gap: 6 }}><button className="sm primary" disabled={busy}>Simpan</button><button type="button" className="sm ghost" onClick={() => setEdit(null)}>Batal</button></div>
    </form> : <div key={d.id} className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 0 }}>{d.number} · {d.status === 'diterima' ? 'diterima' : 'dikirim'}<br />
        <span className="muted">{[d.courier || d.driver, d.tracking_no && `resi ${d.tracking_no}`, d.status === 'dikirim' && (etaText(d.eta_from, d.eta_to) ? `tiba ${etaText(d.eta_from, d.eta_to)}` : 'estimasi belum diisi')].filter(Boolean).join(' · ')}</span></span>
      {d.status === 'dikirim' && <button type="button" className="sm" onClick={() => setEdit({ id: d.id, courier: d.courier || '', tracking_no: d.tracking_no || '', eta_from: toLocal(d.eta_from), eta_to: toLocal(d.eta_to) })}>Ubah</button>}
    </div>))}
  </div>;
}
