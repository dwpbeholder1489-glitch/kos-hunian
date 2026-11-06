'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loading, toast } from '@/components/ui';
import { tgl, today, errMsg } from '@/lib/format';

const NOTE = { catatan: 'Catatan', telepon: 'Telepon', wa: 'WhatsApp', kunjungan: 'Kunjungan', layanan: 'Layanan/keluhan', tahap: 'Tahap' };
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const addDays = (n) => { const d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Catatan komunikasi + tindak lanjut; dipakai juga di halaman Pelanggan
export default function Timeline({ kosId, lead = null, contact = null }) {
  const [t, setT] = useState(null);
  const [kind, setKind] = useState('wa');
  const [body, setBody] = useState('');
  const [task, setTask] = useState('');
  const [due, setDue] = useState(addDays(1));
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('crm_timeline', { p_kos: kosId, p_lead: lead, p_contact: contact }).then(({ data, error }) => (error ? toast(errMsg(error)) : setT(data)));
  useEffect(() => { load(); }, [lead, contact]);
  const note = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('crm_note', { p_kos: kosId, p_lead: lead, p_contact: contact, p_kind: kind, p_body: body });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setBody(''); load();
  };
  const addTask = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('crm_task_add', { p_kos: kosId, p_lead: lead, p_contact: contact, p_title: task, p_due: due });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setTask(''); toast(`Tindak lanjut ${tgl(due)}`); load();
  };
  const done = async (k, v) => { const { error } = await supabase.rpc('crm_task_done', { p_task: k.id, p_done: v }); if (error) return toast(errMsg(error)); load(); };
  if (!t) return <Loading />;
  const openT = t.tasks.filter((k) => !k.done_at);
  return <>
    <span className="label">Tindak lanjut</span>
    {openT.length > 0 && <div className="list">{openT.map((k) => (
      <div className="li" key={k.id}><span className="small" style={{ color: k.due_date <= today() ? 'var(--bad)' : undefined }}>{tgl(k.due_date)} · {k.title}</span><button className="sm" onClick={() => done(k, true)}>Selesai</button></div>
    ))}</div>}
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="mis. Tanya jadi pesan atau tidak" aria-label="Tindak lanjut" />
      <input type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} style={{ maxWidth: 150 }} aria-label="Tanggal" />
    </div>
    <div className="row">{[['Besok', 1], ['3 hari', 3], ['1 minggu', 7]].map(([l, n]) => <button key={l} className="sm ghost" onClick={() => setDue(addDays(n))}>{l}</button>)}
      <button className="sm" disabled={busy || task.trim().length < 2} onClick={addTask}>+ Jadwalkan</button></div>
    <span className="label">Catatan & riwayat</span>
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 140 }} aria-label="Jenis catatan">{Object.entries(NOTE).filter(([k]) => k !== 'tahap').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Apa yang dibicarakan?" aria-label="Isi catatan" />
    </div>
    <button className="sm" disabled={busy || !body.trim()} onClick={note}>Simpan catatan</button>
    {t.activities.length === 0 ? <span className="small muted">Belum ada catatan.</span> : <div className="list">{t.activities.map((a, i) => (
      <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
        <div className="main"><span className="small">{a.body}</span><span className="small muted">{NOTE[a.kind]} · {when(a.at)}{a.by ? ` · ${a.by}` : ''}</span></div>
      </div>
    ))}</div>}
    {t.tasks.some((k) => k.done_at) && <details><summary className="small">Tindak lanjut selesai ({t.tasks.filter((k) => k.done_at).length})</summary>
      <div className="list">{t.tasks.filter((k) => k.done_at).map((k) => <div className="li" key={k.id}><span className="small muted">✓ {k.title} · {tgl(k.due_date)}{k.done_by ? ` · ${k.done_by}` : ''}</span><button className="sm ghost" onClick={() => done(k, false)}>Buka</button></div>)}</div>
    </details>}
  </>;
}
