'use client';
// Satu laporan investor: editor (draf/ditolak), tindakan (ajukan, finalkan, tolak, revisi, hapus), dokumen A4 + Cetak/PDF.
// Data: investor_report_get (final = snapshot beku; draf = data terkini). Izin & paket di server.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import InvestorDoc from '@/components/InvestorDoc';
import { Loading, Empty, Sheet, Field, toast } from '@/components/ui';
import { errMsg, tgl } from '@/lib/format';
import { SECTION_KEYS, TOGGLES, REPORT_STATUS as STATUS, periodIssue } from '@/lib/investorReport';

const TEXTS = [['ringkasan', 'Ringkasan eksekutif', 'Pesan utama untuk investor: kinerja periode ini, pencapaian, hal penting.'],
  ['mdna', 'Pembahasan & analisis manajemen', 'Mengapa angka naik/turun, keputusan yang diambil, tantangan.'],
  ['prospek', 'Prospek & rencana', 'Rencana 6–12 bulan ke depan, kebutuhan dana bila ada.'],
  ['catatan', 'Catatan tambahan', 'Catatan metodologi atau hal lain.']];
const EV = { dibuat: 'Dibuat', revisi: 'Diubah lagi', diajukan: 'Diajukan', ditolak: 'Ditolak', final: 'Difinalkan' };

export default function LaporanInvestorDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { kosId, ver } = useKos();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [opts, setOpts] = useState(null);
  const [edit, setEdit] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.rpc('investor_report_get', { p_kos: kosId, p_id: id });
    if (error) return setErr(error);
    setErr(null); setR(data);
  };
  useEffect(() => { if (kosId) { load(); supabase.rpc('investor_report_list', { p_kos: kosId }).then(({ data }) => setOpts(data)); } }, [kosId, id, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p className="notice bad">{/tidak ditemukan/i.test(err.message) ? 'Laporan tidak ditemukan.' : /investor_report/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p>;
  if (!r) return <Loading />;
  const editable = ['draf', 'ditolak', 'diajukan'].includes(r.status);
  const call = async (fn, args, ok, after) => {
    if (busy) return; setBusy(true);
    const { data, error } = await supabase.rpc(fn, { p_kos: kosId, p_id: r.id, ...args });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(ok); setSheet(null); setNote('');
    if (after) after(data); else load();
  };
  const openEdit = () => setEdit({ title: r.title, period_from: r.period_from, period_to: r.period_to, cmp_from: r.cmp_from || '', cmp_to: r.cmp_to || '',
    scenario_id: r.scenario_id || '', valuation_id: r.valuation_id || '', sections: { ...r.sections }, include: { ...r.include } });
  const save = () => call('investor_report_save', { p: edit }, 'Laporan disimpan', () => { setEdit(null); load(); });

  return <div className="stack">
    <div className="noprint stack">
      <div className="row between"><Link href="/laporan-investor" className="small">‹ Semua laporan investor</Link>
        <span className={`chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></div>
      {r.status === 'ditolak' && r.decision_note && <p className="notice bad">Ditolak: {r.decision_note}</p>}
      {r.status === 'final' ? <p className="notice">Laporan final — angka dibekukan pada {tgl(String(r.finalized_at).slice(0, 10))} dan tidak berubah walau transaksi lama dikoreksi. Untuk perubahan, buat revisi.</p>
        : <p className="notice">Pratinjau memakai angka terkini dari Pembukuan. Angka dibekukan saat pemilik memfinalkan.</p>}
      <div className="row">
        <button className="primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        {editable && <button onClick={openEdit}>Ubah isi</button>}
        {['draf', 'ditolak'].includes(r.status) && !r.boleh_final && <button onClick={() => setSheet('submit')}>Ajukan ke pemilik</button>}
        {r.boleh_final && ['draf', 'diajukan'].includes(r.status) && <button onClick={() => setSheet('final')}>Finalkan</button>}
        {r.boleh_final && r.status === 'diajukan' && <button onClick={() => setSheet('reject')}>Tolak</button>}
        {r.status === 'final' && <button onClick={() => call('investor_report_revise', {}, 'Revisi dibuat', (x) => router.push(`/laporan-investor/${x.id}`))}>Buat revisi</button>}
        {['draf', 'ditolak'].includes(r.status) && <button className="ghost" onClick={() => setSheet('delete')}>Hapus draf</button>}
      </div>
      <p className="small muted">Di HP: Cetak / Simpan PDF → pilih “Simpan sebagai PDF”. Ukuran kertas A4.</p>
      {r.log?.length > 0 && <details><summary className="small muted">Riwayat ({r.log.length})</summary>
        <ul className="small">{[...r.log].reverse().map((l, i) => <li key={i}>{EV[l.ev] || l.ev} · {l.by || 'Sistem'} · {tgl(String(l.at).slice(0, 10))}{l.catatan ? ` — ${l.catatan}` : ''}{l.revisi_dari ? ` (revisi dari ${l.revisi_dari})` : ''}</li>)}</ul></details>}
    </div>

    <InvestorDoc report={r} data={r.data} />

    {edit && <Sheet title="Ubah isi laporan" onClose={() => !busy && setEdit(null)}>
      <Field label="Judul"><input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
      <Field label="Periode dari"><input type="date" value={edit.period_from} onChange={(e) => setEdit({ ...edit, period_from: e.target.value })} /></Field>
      <Field label="Periode sampai"><input type="date" value={edit.period_to} onChange={(e) => setEdit({ ...edit, period_to: e.target.value })} /></Field>
      <Field label="Pembanding dari (opsional)"><input type="date" value={edit.cmp_from} onChange={(e) => setEdit({ ...edit, cmp_from: e.target.value })} /></Field>
      <Field label="Pembanding sampai"><input type="date" value={edit.cmp_to} onChange={(e) => setEdit({ ...edit, cmp_to: e.target.value })} /></Field>
      {TEXTS.map(([k, l, h]) => <Field key={k} label={l} hint={h}><textarea rows={4} maxLength={6000} value={edit.sections[k] || ''} onChange={(e) => setEdit({ ...edit, sections: { ...edit.sections, [k]: e.target.value } })} /></Field>)}
      <Field label="Skenario yang dilampirkan" hint="Dari Analisis › Skenario (versi tersimpan)"><select value={edit.scenario_id} onChange={(e) => setEdit({ ...edit, scenario_id: e.target.value })}>
        <option value="">— tidak ada</option>{(opts?.skenario || []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
      <Field label="Valuasi yang dilampirkan" hint="Dari Analisis › Investasi & Valuasi (versi tersimpan)"><select value={edit.valuation_id} onChange={(e) => setEdit({ ...edit, valuation_id: e.target.value })}>
        <option value="">— tidak ada</option>{(opts?.valuasi || []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
      <fieldset className="stack" style={{ gap: 6 }}><legend className="small"><b>Bagian yang disertakan</b></legend>
        {SECTION_KEYS.filter(([k]) => TOGGLES.includes(k)).map(([k, l]) => <label key={k} className="row" style={{ gap: 8 }}>
          <input type="checkbox" style={{ width: 18, height: 18, minHeight: 0 }} checked={edit.include[k] !== false} onChange={(e) => setEdit({ ...edit, include: { ...edit.include, [k]: e.target.checked } })} />{l}</label>)}
      </fieldset>
      {periodIssue(edit) && <p className="small" style={{ color: 'var(--bad)' }}>{periodIssue(edit)}</p>}
      {r.status === 'diajukan' && <p className="small muted">Laporan sedang diajukan — menyimpan perubahan mengembalikannya ke Draf.</p>}
      <button className="primary" disabled={busy || edit.title.trim().length < 3 || Boolean(periodIssue(edit))} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>}
    {sheet === 'submit' && <Sheet title="Ajukan ke pemilik" onClose={() => setSheet(null)}>
      <Field label="Catatan (opsional)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="primary" disabled={busy} onClick={() => call('investor_report_submit', { p_note: note }, 'Laporan diajukan')}>Ajukan</button></Sheet>}
    {sheet === 'final' && <Sheet title="Finalkan laporan" onClose={() => setSheet(null)}>
      <p>Semua angka akan <b>dibekukan</b> seperti saat ini dan laporan diarsip — tidak bisa diubah atau dihapus. Perubahan selanjutnya lewat revisi.</p>
      <Field label="Catatan (opsional)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="primary" disabled={busy} onClick={() => call('investor_report_decide', { p_decision: 'final', p_note: note }, 'Laporan difinalkan')}>{busy ? 'Membekukan…' : 'Finalkan'}</button></Sheet>}
    {sheet === 'reject' && <Sheet title="Tolak laporan" onClose={() => setSheet(null)}>
      <Field label="Alasan"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="primary" disabled={busy || note.trim().length < 3} onClick={() => call('investor_report_decide', { p_decision: 'tolak', p_note: note }, 'Laporan ditolak')}>Tolak</button></Sheet>}
    {sheet === 'delete' && <Sheet title="Hapus draf" onClose={() => setSheet(null)}>
      <p>Hapus draf {r.number}? Laporan final tidak terpengaruh.</p>
      <button className="primary" disabled={busy} onClick={() => call('investor_report_delete', {}, 'Draf dihapus', () => router.push('/laporan-investor'))}>Hapus</button></Sheet>}
  </div>;
}
