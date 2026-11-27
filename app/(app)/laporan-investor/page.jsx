'use client';
// Laporan investor (Tahap H Master Blueprint BI): daftar + buat baru. Paket Pro, area finance (server: investor_report_*).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader, DataTable } from '@/components/Page';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Empty, Sheet, Field, toast } from '@/components/ui';
import { errMsg, tgl, today } from '@/lib/format';
import { canArea } from '@/lib/business';
import { REPORT_STATUS as STATUS, periodIssue } from '@/lib/investorReport';


export default function LaporanInvestor() {
  const { kos, kosId, ver } = useKos();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(false);
  useEffect(() => {
    if (!kosId) return;
    supabase.rpc('investor_report_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(error) : setD(data)));
  }, [kosId, ver]);
  const head = <PageHeader title="Laporan Investor" help={<PageHelp page="laporan-investor" />}
    actions={d?.aktif ? <button className="primary" onClick={() => setForm(true)}>+ Laporan baru</button> : null} />;
  if (err) return <>{head}<p className="notice bad">{/investor_report/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p></>;
  if (!d || !kos) return <>{head}<Loading /></>;
  return <div className="stack">
    {head}
    {!d.aktif && <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} plan="pro" event="REPORT.INVESTOR.REQUESTED" title="Laporan investor tersedia di Paket Pro"
      text="Dokumen A4 bersampul dengan daftar isi, laporan keuangan, rasio, KPI, skenario, risiko, dan valuasi — disetujui pemilik lalu diarsip berversi." />}
    <p className="small muted">Keuangan menyusun & mengajukan; pemilik memfinalkan. Saat final, semua angka dibekukan dan laporan diarsip (tidak bisa diubah — buat revisi bila perlu).</p>
    <section className="panel">
      {!d.reports.length ? <Empty title="Belum ada laporan investor" text={d.aktif ? 'Ketuk + Laporan baru.' : ''} /> :
        <DataTable caption="Laporan investor" rows={d.reports} onRow={(r) => router.push(`/laporan-investor/${r.id}`)} rowLabel={(r) => `${r.number} ${r.title}`} columns={[
          { key: 'title', label: 'Laporan', main: true, render: (r) => <><b>{r.title}</b><small className="muted" style={{ display: 'block' }}>{r.number}{r.revision_of ? ' · revisi' : ''}</small></> },
          { key: 'period', label: 'Periode', render: (r) => `${tgl(r.period_from)} – ${tgl(r.period_to)}` },
          { key: 'status', label: 'Status', render: (r) => <span className={`chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span> },
          { key: 'at', label: 'Diperbarui', hide: 'tablet', render: (r) => tgl(String(r.finalized_at || r.updated_at).slice(0, 10)) },
        ]} card={(r) => <><div className="row between"><b>{r.title}</b><span className={`chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></div>
          <small className="muted">{r.number} · {tgl(r.period_from)} – {tgl(r.period_to)}</small></>} />}
    </section>
    {form && <NewReport kosId={kosId} onClose={() => setForm(false)} onSaved={(r) => router.push(`/laporan-investor/${r.id}`)} />}
  </div>;
}

function NewReport({ kosId, onClose, onSaved }) {
  const t = today(); const y = t.slice(0, 4); const m = +t.slice(5, 7);
  const q = Math.floor((m - 1) / 3); const qs = q === 0 ? [String(+y - 1), 9] : [y, (q - 1) * 3];
  const last = (yy, mm) => new Date(Date.UTC(+yy, mm + 3, 0)).toISOString().slice(0, 10);
  const [f, setF] = useState({ title: `Laporan Investor Triwulan ${q === 0 ? 4 : q} ${qs[0]}`, period_from: `${qs[0]}-${String(qs[1] + 1).padStart(2, '0')}-01`, period_to: last(qs[0], qs[1]) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return; setBusy(true);
    const { data, error } = await supabase.rpc('investor_report_save', { p_kos: kosId, p_id: null, p: f });
    setBusy(false);
    if (error) return toast(errMsg(error));
    onSaved(data);
  };
  return <Sheet title="Laporan investor baru" onClose={() => !busy && onClose()}>
    <Field label="Judul"><input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
    <Field label="Dari tanggal"><input type="date" value={f.period_from} onChange={(e) => setF({ ...f, period_from: e.target.value })} /></Field>
    <Field label="Sampai tanggal"><input type="date" value={f.period_to} onChange={(e) => setF({ ...f, period_to: e.target.value })} /></Field>
    <p className="small muted">Bawaan = triwulan terakhir yang sudah lewat. Maksimal sekitar 1 tahun (400 hari). Pembanding, isi teks, dan bagian bisa diatur setelah dibuat.</p>
    {periodIssue(f) && <p className="small" style={{ color: 'var(--bad)' }}>{periodIssue(f)}</p>}
    <button className="primary" disabled={busy || f.title.trim().length < 3 || Boolean(periodIssue(f))} onClick={save}>{busy ? 'Membuat…' : 'Buat draf'}</button>
  </Sheet>;
}
