'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { download } from '@/lib/zip';
import { makeXlsx } from '@/lib/xlsx';

const when = (ts) => new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const slug = (s) => String(s || 'bisnis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bisnis';

// Unduh semua data sebagai Excel (bisa diolah) atau PDF (siap dibaca/dicetak), dan penutupan bisnis terkontrol (blueprint 10.1 & 21.5). Khusus pemilik.
export async function exportAll(kos, fmt) {
  const { data, error } = await supabase.rpc('business_export_sheets', { p_kos: kos.id });
  if (error) { toast(/business_export_sheets/.test(error.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(error)); return false; }
  const day = new Date().toISOString().slice(0, 10);
  const base = `PRASARA ${data.business} ${day}`.replace(/[\\/:*?"<>|]+/g, ' ');
  try {
    if (fmt === 'pdf') {
      const { makePdf } = await import('@/lib/pdfExport');
      download(await makePdf(data), `${base}.pdf`);
    } else {
      const info = { name: 'Info', cols: ['Keterangan', 'Isi'], types: ['t', 't'], rows: [['Bisnis', data.business], ['Diunduh', `${data.exported_at} WIB`], ['Sumber', 'PRASARA'], ...data.sheets.map((s) => [`Lembar: ${s.name}`, `${s.rows.length} baris`]), ['Catatan', 'Foto bukti transfer tidak termasuk.']] };
      download(makeXlsx([info, ...data.sheets]), `${base}.xlsx`);
    }
  } catch (e) { toast('Gagal membuat file: ' + (e?.message || e)); return false; }
  toast(`${fmt === 'pdf' ? 'PDF' : 'Excel'} diunduh: ${data.sheets.length} bagian`);
  return true;
}

export default function DataTutup() {
  const { kos, loadKos } = useKos();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const doExport = async (fmt) => { setBusy(fmt); await exportAll(kos, fmt); setBusy(false); loadKos(); };
  return (
    <section className="panel">
      <h3>Data & penutupan bisnis</h3>
      <span className="small muted">Unduh semua data bisnis ini kapan saja: <b>Excel</b> (satu lembar per jenis data, bisa difilter & dijumlah) atau <b>PDF</b> (siap dibaca, dicetak, atau dikirim).{kos.last_export_at ? ` Terakhir diunduh ${when(kos.last_export_at)}.` : ''}</span>
      <div className="row">
        <button className="sm" onClick={() => doExport('xlsx')} disabled={Boolean(busy)}>{busy === 'xlsx' ? 'Menyiapkan…' : 'Unduh Excel'}</button>
        <button className="sm" onClick={() => doExport('pdf')} disabled={Boolean(busy)}>{busy === 'pdf' ? 'Menyiapkan…' : 'Unduh PDF'}</button>
      </div>
      {!kos.closed_at && <>
        <span className="small muted">Bisnis berhenti beroperasi? Tutup bisnis: data tidak dihapus, bisnis menjadi arsip yang hanya bisa dilihat, dan bisa dibuka kembali.</span>
        <button className="sm ghost danger" onClick={() => setOpen(true)}>Tutup bisnis…</button>
      </>}
      {open && <CloseSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function CloseSheet({ onClose }) {
  const { kos, loadKos } = useKos();
  const [c, setC] = useState(null);
  const [ack, setAck] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const check = () => supabase.rpc('business_close_check', { p_kos: kos.id }).then(({ data, error }) => (error ? toast(errMsg(error)) : setC(data)));
  useEffect(() => { check(); }, []);
  const doExport = async (fmt) => { setBusy(true); await exportAll(kos, fmt); setBusy(false); check(); };
  const close = async () => {
    if (!window.confirm(`Tutup "${kos.name}" sekarang?\nSemua orang hanya bisa melihat datanya, tidak bisa mencatat. Otomatisasi dimatikan. Bisa dibuka kembali kapan saja.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('business_close', { p_kos: kos.id, p_confirm_name: name, p_reason: reason });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Bisnis ditutup. Data tetap tersimpan sebagai arsip.');
    onClose(); loadKos();
  };
  if (!c) return <Sheet title="Tutup bisnis" onClose={onClose}><Loading /></Sheet>;
  const blocked = c.blocking.length > 0;
  return (
    <Sheet title={`Tutup ${kos.name}`} onClose={onClose}>
      <span className="small muted">Pemeriksaan sebelum menutup. Data tidak dihapus: transaksi, laporan, dan pembukuan tetap bisa dilihat dan diunduh.</span>
      <span className="label">Harus diselesaikan dulu</span>
      {blocked ? <div className="list">{c.blocking.map((x) => (
        <div className="li" key={x.label}><span className="small">✕ {x.label}</span>{x.href ? <Link href={x.href} className="small" onClick={onClose}>Buka →</Link> : <span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><button className="sm" onClick={() => doExport('xlsx')} disabled={busy}>Excel</button><button className="sm" onClick={() => doExport('pdf')} disabled={busy}>PDF</button></span>}</div>
      ))}</div> : <span className="chip good" style={{ alignSelf: 'flex-start' }}>Semua beres</span>}
      {c.warnings.length > 0 && <>
        <span className="label">Perlu diketahui</span>
        <div className="list">{c.warnings.map((x) => <div className="li" key={x.label}><span className="small">! {x.label}</span>{x.href && <Link href={x.href} className="small" onClick={onClose}>Lihat →</Link>}</div>)}</div>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={ack} onChange={(e) => setAck(e.target.checked)} />Saya mengerti; sisa kasbon/utang/tagihan tetap tercatat dan tidak hilang.</label>
      </>}
      {!blocked && <>
        <Field label={`Ketik nama bisnis: ${kos.name}`}><input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" /></Field>
        <Field label="Alasan menutup"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. usaha berhenti, pindah ke tempat lain" /></Field>
        <button className="danger" onClick={close} disabled={busy || name.trim() !== kos.name.trim() || reason.trim().length < 5 || (c.warnings.length > 0 && !ack)}>{busy ? 'Menutup…' : 'Tutup bisnis'}</button>
      </>}
    </Sheet>
  );
}

// Bar di semua halaman saat bisnis ditutup
export function ClosedBar() {
  const { kos, loadKos } = useKos();
  const [busy, setBusy] = useState(false);
  if (!kos?.closed_at) return null;
  const owner = (kos.my_role || 'pemilik') === 'pemilik';
  const reopen = async () => {
    const reason = window.prompt(`Buka kembali "${kos.name}"? Tulis alasannya:`, 'Usaha berjalan lagi');
    if (reason == null) return;
    setBusy(true);
    const { error } = await supabase.rpc('business_reopen', { p_kos: kos.id, p_reason: reason });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Bisnis dibuka kembali'); loadKos();
  };
  return (
    <div className="wrap" style={{ paddingTop: 8 }}>
      <div className="notice bad" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="small" style={{ flex: 1, minWidth: 200 }}><b>Bisnis ini ditutup</b> sejak {when(kos.closed_at)}{kos.close_reason ? ` (${kos.close_reason})` : ''}. Arsip hanya-baca: data bisa dilihat dan diunduh, tidak bisa dicatat.</span>
        {owner && <button className="sm" onClick={reopen} disabled={busy}>Buka kembali</button>}
      </div>
    </div>
  );
}
