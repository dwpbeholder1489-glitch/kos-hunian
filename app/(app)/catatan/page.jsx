'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { uid } from '@/lib/retail';
import { canArea, roleOf } from '@/lib/business';
import { withApproval } from '@/lib/approval';
import { useBuilder, fieldsOf, statusesOf, statusById, show, initialData, outData, FieldInput, nextSteps, waktu, umur } from '@/lib/builder';

// Catatan bisnis kustom: formulir & alur status sesuai Business Builder
export default function Catatan() {
  const { kos, kosId, ver, bump } = useKos();
  const { cfg, err } = useBuilder(kosId, ver);
  const [obj, setObj] = useState(null);
  const [rows, setRows] = useState(null);
  const [refs, setRefs] = useState(new Map()); // id → judul (semua jenis data yang dirujuk)
  const [q, setQ] = useState('');
  const [st, setSt] = useState('aktif');
  const [flt, setFlt] = useState({});
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState(null); // { rec? }
  const [open, setOpen] = useState(null);
  const objects = cfg ? cfg.objects.filter((o) => o.active) : [];
  useEffect(() => {
    if (!cfg || obj) return;
    let want = null; try { want = new URLSearchParams(window.location.search).get('jenis'); } catch {}
    setObj((objects.find((o) => o.key === want) || objects.find((o) => o.workflow) || objects[0])?.id || null);
    try { const id = new URLSearchParams(window.location.search).get('buka'); if (id) setOpen(id); } catch {}
  }, [cfg]);
  const loadRows = () => obj && supabase.rpc('bb_list', { p_kos: kosId, p_object: obj, p_archived: archived }).then(({ data, error }) => (error ? toast(errMsg(error)) : setRows(data || [])));
  const loadRefs = async () => {
    if (!cfg) return;
    const ids = [...new Set(cfg.fields.filter((f) => f.active && f.type === 'reference').map((f) => f.ref_object))];
    const m = new Map();
    for (const oid of ids) { const { data } = await supabase.rpc('bb_ref_options', { p_kos: kosId, p_object: oid }); (data || []).forEach((x) => m.set(x.id, x.title)); }
    setRefs(m);
  };
  useEffect(() => { setRows(null); setSt('aktif'); setFlt({}); loadRows(); }, [obj, ver, archived]);
  useEffect(() => { loadRefs(); }, [cfg, ver]);
  if (err) return <div className="notice bad">{/bb_/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!cfg) return <Loading />;
  if (cfg.ws?.status !== 'aktif') return (
    <div className="stack"><h2>Catatan</h2>
      <div className="notice">Bisnis ini masih <b>draf</b>. {canArea(kos, 'settings') ? <>Selesaikan <Link href="/builder">Business Builder</Link> lalu tekan <b>Validasi & aktifkan</b>.</> : 'Minta pemilik menyelesaikan Business Builder.'}</div></div>);
  const o = cfg.objects.find((x) => x.id === obj);
  if (!o) return <Empty title="Belum ada jenis data" text="Tambahkan di Business Builder." />;
  const fields = fieldsOf(cfg, o.id);
  const sts = statusesOf(cfg, o.id);
  const listF = fields.filter((f) => f.in_list && f.key !== o.title_field).slice(0, 3);
  const filterF = fields.filter((f) => f.filterable && ['select', 'boolean', 'text'].includes(f.type));
  const term = q.trim().toLowerCase();
  const searchF = fields.filter((f) => f.searchable);
  const shown = (rows || []).filter((r) => {
    const s = statusById(cfg, r.status_id);
    if (o.workflow && !archived) { if (st === 'aktif' ? s?.is_final : st !== 'semua' && r.status_id !== st) return false; }
    for (const [k, v] of Object.entries(flt)) if (v !== '' && String(r.data[k] ?? (fields.find((f) => f.key === k)?.type === 'boolean' ? false : '')) !== v) return false;
    if (!term) return true;
    return [r.number, r.title, ...searchF.map((f) => String(r.data[f.key] ?? ''))].some((x) => (x || '').toLowerCase().includes(term));
  });
  const cnt = (id) => (rows || []).filter((r) => r.status_id === id).length;

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>{o.icon} {o.name}</h2><PageHelp page="catatan" /></div>{!archived && <button className="primary" onClick={() => setForm({})}>+ {o.name}</button>}</div>
      {objects.length > 1 && <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{objects.map((x) => <button key={x.id} className={x.id === obj ? 'on' : ''} onClick={() => setObj(x.id)} style={{ whiteSpace: 'nowrap' }}>{x.icon} {x.name}</button>)}</div>}
      {o.workflow && !archived && rows && <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        {[['aktif', `Belum selesai (${rows.filter((r) => !statusById(cfg, r.status_id)?.is_final).length})`], ...sts.map((s) => [s.id, `${s.label} (${cnt(s.id)})`]), ['semua', 'Semua']].map(([k, l]) => <button key={k} className={st === k ? 'on' : ''} onClick={() => setSt(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}
      </div>}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari ${[...new Set(['nomor', 'judul', ...searchF.map((f) => f.label.toLowerCase())])].join(', ')}`} aria-label="Cari catatan" />
      {filterF.length > 0 && <div className="row">{filterF.map((f) => (
        <select key={f.key} value={flt[f.key] ?? ''} onChange={(e) => setFlt({ ...flt, [f.key]: e.target.value })} aria-label={`Saring ${f.label}`} style={{ width: 'auto', flex: '1 1 130px' }}>
          <option value="">{f.label}: semua</option>
          {f.type === 'boolean' ? <><option value="true">Ya</option><option value="false">Tidak</option></> : f.type === 'select' ? f.choices.map((c) => <option key={c} value={c}>{c}</option>)
            : [...new Set((rows || []).map((r) => r.data[f.key]).filter(Boolean))].sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>))}</div>}
      {!rows ? <Loading /> : shown.length === 0 ? <Empty title={archived ? 'Tidak ada arsip' : `Belum ada ${o.name.toLowerCase()}`} text={archived ? '' : `Tekan + ${o.name} untuk mencatat.`} /> : (
        <section className="panel"><div className="list">{shown.map((r) => {
          const s = statusById(cfg, r.status_id);
          const late = s?.sla_hours && !s.is_final && Date.now() - new Date(r.status_since).getTime() > s.sla_hours * 36e5;
          return (
            <button key={r.id} className="li click" onClick={() => setOpen(r.id)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{r.title || r.number}</b>
                <span className="small muted">{r.number}{listF.map((f) => r.data[f.key] != null && r.data[f.key] !== '' ? ` · ${f.type === 'boolean' ? (r.data[f.key] ? f.label : '') : show(f, r.data[f.key], refs)}` : '').join('')}</span>
                <span className="small muted">{waktu(r.created_at)}{r.assigned_to ? ` · ${r.assigned_to}` : ''}</span></div>
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                {s && <span className={'chip ' + s.tone}>{s.label}</span>}
                {late && <span className="chip bad">Lewat {s.sla_hours} jam</span>}
              </div>
            </button>
          );
        })}</div></section>
      )}
      <button className="sm ghost" onClick={() => setArchived(!archived)}>{archived ? '← Kembali ke catatan aktif' : 'Lihat arsip'}</button>
      {form && <RecordForm kosId={kosId} cfg={cfg} o={o} rec={form.rec} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); loadRows(); loadRefs(); bump(); if (!form.rec) setOpen(id); }} />}
      {open && <RecordDetail kos={kos} cfg={cfg} id={open} refs={refs} onClose={() => setOpen(null)} onEdit={(rec) => { setOpen(null); setForm({ rec }); }} onChanged={() => { loadRows(); bump(); }} />}
    </div>
  );
}

function RecordForm({ kosId, cfg, o, rec, onClose, onSaved }) {
  const fields = fieldsOf(cfg, o.id);
  const [d, setD] = useState(() => initialData(fields, rec?.data));
  const [who, setWho] = useState(rec?.assigned_to || '');
  const [people, setPeople] = useState([]);
  const [opts, setOpts] = useState({});
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => rec?.id || uid());
  useEffect(() => {
    supabase.rpc('bb_people', { p_kos: kosId }).then(({ data }) => setPeople(data || []));
    fields.filter((f) => f.type === 'reference').forEach((f) => supabase.rpc('bb_ref_options', { p_kos: kosId, p_object: f.ref_object }).then(({ data }) => setOpts((x) => ({ ...x, [f.key]: data || [] }))));
  }, []);
  const save = async () => {
    for (const f of fields) if (f.required && f.type !== 'boolean' && (d[f.key] === '' || d[f.key] == null || (Array.isArray(d[f.key]) && !d[f.key].length))) return toast(`"${f.label}" wajib diisi`);
    setBusy(true);
    const { data, error } = await supabase.rpc('bb_record_save', { p_id: id, p_kos: kosId, p_object: o.id, p_data: outData(fields, d), p_assigned: who });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(rec ? 'Perubahan disimpan' : `${o.name} ${data.number} dicatat`); onSaved(id);
  };
  const refName = (f) => cfg.objects.find((x) => x.id === f.ref_object)?.name || 'data';
  return (
    <Sheet title={rec ? `Ubah ${rec.number}` : `${o.name} baru`} onClose={onClose}>
      {fields.map((f) => f.type === 'boolean'
        ? <div key={f.key}><FieldInput f={f} value={d[f.key]} onChange={(v) => setD({ ...d, [f.key]: v })} />{f.help && <span className="small muted">{f.help}</span>}</div>
        : <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.help || (f.type === 'reference' && !(opts[f.key] || []).length ? `Belum ada ${refName(f)} — catat dulu di menu Catatan › ${refName(f)}` : undefined)}>
            <FieldInput f={f} value={d[f.key]} onChange={(v) => setD({ ...d, [f.key]: v })} refOpts={opts[f.key]} />
          </Field>)}
      <Field label="Penanggung jawab (opsional)" hint="Muncul di Dashboard › Tugas saya untuk orang itu"><select value={who} onChange={(e) => setWho(e.target.value)}><option value="">— tidak ada —</option>{people.map((p) => <option key={p.email} value={p.email}>{p.email}</option>)}{who && !people.some((p) => p.email === who) && <option value={who}>{who}</option>}</select></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function RecordDetail({ kos, cfg, id, refs, onClose, onEdit, onChanged }) {
  const [x, setX] = useState(null);
  const [busy, setBusy] = useState(false);
  const role = roleOf(kos);
  const load = () => supabase.rpc('bb_record_get', { p_record: id }).then(({ data, error }) => (error ? (toast(errMsg(error)), onClose()) : setX(data)));
  useEffect(() => { load(); }, [id]);
  const rec = x?.record;
  const o = rec && cfg.objects.find((y) => y.id === rec.object_id);
  const steps = useMemo(() => (rec && !rec.archived_at ? nextSteps(cfg, rec, role) : []), [x]);
  if (!x || !o) return <Sheet title="Memuat…" onClose={onClose}><Loading /></Sheet>;
  const fields = fieldsOf(cfg, o.id);
  const s = statusById(cfg, rec.status_id);
  const move = async (t) => {
    let note = '';
    if (t.require_note) { note = prompt(`Catatan untuk "${t.to.label}" (wajib):`) || ''; if (note.trim().length < 3) return toast('Catatan wajib diisi (minimal 3 huruf).'); }
    setBusy(true);
    const r = await withApproval(() => supabase.rpc('bb_record_move', { p_record: rec.id, p_to: t.to_status, p_note: note || null }), `Status: ${t.to.label}`,
      { kos: kos.id, action: 'bb_pindah_status', payload: { record_id: rec.id, to_status: t.to_status, note }, reason: note });
    setBusy(false);
    if (r === 'ok') { load(); onChanged(); }
  };
  const archive = async () => {
    const why = prompt('Arsipkan catatan ini? Data tetap tersimpan (bisa dilihat di Arsip). Alasan:');
    if (!why) return;
    if (await run(() => supabase.rpc('bb_record_archive', { p_record: rec.id, p_reason: why }), 'Diarsipkan', errMsg)) { onChanged(); onClose(); }
  };
  return (
    <Sheet title={`${rec.number} · ${rec.title}`} onClose={onClose}>
      <div className="row">{s && <span className={'chip ' + s.tone}>{s.label}</span>}{s && !s.is_final && <span className="small muted">sejak {umur(rec.status_since)}{s.sla_hours ? ` · batas ${s.sla_hours} jam` : ''}</span>}{rec.archived_at && <span className="chip void">Diarsipkan</span>}</div>
      <dl className="kv">
        {fields.map((f) => <span key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd style={{ whiteSpace: 'pre-line' }}>{f.hidden_roles?.includes(role) ? 'disembunyikan' : show(f, rec.data[f.key], refs)}</dd></span>)}
        <dt>Penanggung jawab</dt><dd>{rec.assigned_to || '—'}</dd>
        <dt>Dicatat</dt><dd>{waktu(rec.created_at)} · {rec.created_by}</dd>
        {rec.archived_at && <><dt>Arsip</dt><dd>{rec.archive_reason}</dd></>}
      </dl>
      {steps.length > 0 && <div className="row">{steps.map((t) => <button key={t.id} className={t.to.is_final && t.to.tone === 'void' ? 'sm ghost danger' : 'primary'} disabled={busy} onClick={() => move(t)}>→ {t.to.label}{t.require_approval && role !== 'pemilik' ? ' (perlu persetujuan)' : ''}</button>)}</div>}
      {o.workflow && !rec.archived_at && steps.length === 0 && !s?.is_final && <span className="small muted">Tidak ada langkah yang boleh Anda lakukan dari status ini.</span>}
      {!rec.archived_at && <div className="row">
        <button className="sm" onClick={() => onEdit(rec)}>Ubah isi</button>
        {canArea(kos, 'settings') && <button className="sm ghost danger" onClick={archive}>Arsipkan</button>}
      </div>}
      {x.refs.length > 0 && <section className="panel"><span className="label">Dipakai di</span>
        <div className="list">{x.refs.map((y) => <div className="li" key={y.id}><span className="small">{y.object} · {y.title}</span><span className="small muted">{y.number}{statusById(cfg, y.status_id) ? ` · ${statusById(cfg, y.status_id).label}` : ''}</span></div>)}</div></section>}
      <section className="panel"><span className="label">Riwayat</span>
        <div className="list">{x.events.map((e, i) => <div className="li" key={i}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{waktu(e.at)}<br />{e.actor}</span></div>)}</div></section>
    </Sheet>
  );
}
