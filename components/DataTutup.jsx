'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { makeZip, toCsv, download } from '@/lib/zip';

const when = (ts) => new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const slug = (s) => String(s || 'bisnis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bisnis';

// Unduh semua data (.zip berisi CSV per tabel + data.json) dan penutupan bisnis terkontrol (blueprint 10.1 & 21.5). Khusus pemilik.
export async function exportAll(kos) {
  const { data, error } = await supabase.rpc('business_export', { p_kos: kos.id });
  if (error) { toast(errMsg(error)); return false; }
  const tables = data.tables || {};
  const day = new Date().toISOString().slice(0, 10);
  const files = Object.entries(tables).map(([name, rows]) => ({ name: `${name}.csv`, text: toCsv(rows) }));
  files.push({ name: 'data.json', text: JSON.stringify(data, null, 1) });
  files.push({ name: 'BACA-SAYA.txt', text: `Ekspor seluruh data "${data.business}" dari PRASARA\nWaktu ekspor: ${when(data.exported_at)}\n\nSetiap file .csv = satu tabel (pemisah titik koma, bisa dibuka di Excel, Numbers, atau Google Sheets).\ndata.json = data yang sama dalam satu file, untuk arsip atau dipindahkan ke sistem lain.\nTidak termasuk: foto bukti transfer (file gambar), kata sandi, dan token rahasia.\n` });
  download(makeZip(files), `prasara-${slug(data.business)}-${day}.zip`);
  toast(`Data diunduh: ${Object.keys(tables).length} tabel`);
  return true;
}

export default function DataTutup() {
  const { kos, loadKos } = useKos();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const doExport = async () => { setBusy(true); await exportAll(kos); setBusy(false); loadKos(); };
  return (
    <section className="panel">
      <h3>Data & penutupan bisnis</h3>
      <span className="small muted">Unduh semua data bisnis ini kapan saja: satu file .zip berisi tabel-tabel CSV (bisa dibuka di Excel/Numbers/Google Sheets) dan data.json untuk arsip.{kos.last_export_at ? ` Terakhir diunduh ${when(kos.last_export_at)}.` : ''}</span>
      <button className="sm" onClick={doExport} disabled={busy}>{busy ? 'Menyiapkan…' : 'Unduh semua data (.zip)'}</button>
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
  const doExport = async () => { setBusy(true); await exportAll(kos); setBusy(false); check(); };
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
        <div className="li" key={x.label}><span className="small">✕ {x.label}</span>{x.href ? <Link href={x.href} className="small" onClick={onClose}>Buka →</Link> : <button className="sm" onClick={doExport} disabled={busy}>Unduh</button>}</div>
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
