'use client';
// Rundown event (Tahap B — Master Prompt Event §11, Blueprint §5.5/§5.8). Server: prj_rundown* (izin, validasi, versi, riwayat).
// Tampilan: Timeline (per hari, item berjalan disorot, tombol pelaksanaan), Agenda (tabel lengkap + cetak), Checklist persiapan
// (= Tugas proyek yang sudah ada). Kalender lintas event ada di Jadwal & Tim (agenda harian).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, run, toast, Empty } from '@/components/ui';
import { DataTable } from '@/components/Page';
import { tgl, tglShort, today, errMsg } from '@/lib/format';
import { RD_ST, RUNDOWN_TPL, tplFor, jamTambah, durasiTeks, tglHari } from '@/lib/event';
import { TASK_ST, Chip } from '@/components/Proyek';
import PageHelp from '@/components/PageHelp';

const waktu = (iso) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '');
const menit = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
// Item yang sedang berlangsung menurut jam (hari ini, di antara mulai & selesai) — hanya penanda, status tetap dari tombol
const sekarang = (r, now) => {
  if (!now || r.day !== now.slice(0, 10) || r.duration_min == null) return false;
  const n = menit(now.slice(11, 16)); const a = menit(r.start_time);
  return n >= a && n < a + r.duration_min;
};

export default function RundownPanel({ project, onChange }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('timeline');   // timeline | agenda | checklist
  const [day, setDay] = useState('');
  const [sheet, setSheet] = useState(null);       // {item} | 'tpl' | 'shift' | 'ver' | {verView}
  const load = () => supabase.rpc('prj_rundown', { p_project: project.id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => (d ? [...new Set(d.items.map((r) => r.day))] : []), [d]);
  if (err) return <section className="panel"><span className="small" style={{ color: 'var(--bad)' }}>{/prj_rundown|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</span></section>;
  if (!d) return <section className="panel"><span className="small muted">Memuat rundown…</span></section>;
  const done = () => { setSheet(null); load(); onChange?.(); };
  const items = d.items.filter((r) => !day || r.day === day);
  const setStatus = async (r, s) => { if (await run(() => supabase.rpc('prj_rundown_status', { p_id: r.id, p_status: s }), `${r.title}: ${RD_ST[s][0].toLowerCase()}`, errMsg)) load(); };
  const last = d.versions[0];
  const live = d.items.filter((r) => r.status === 'berjalan');
  return (
    <div className="stack" style={{ gap: 12 }}>
      <section className="panel" style={{ gap: 10 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="seg">{[['timeline', 'Timeline'], ['agenda', 'Agenda'], ['checklist', `Checklist (${(project.tasks || []).filter((t) => ['todo', 'proses'].includes(t.status)).length})`]]
            .map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {d.can_edit && <button className="sm primary" onClick={() => setSheet({ item: {} })}>+ Item</button>}
            {d.access === 'kelola' && d.items.length > 0 && <button className="sm" onClick={() => setSheet('shift')}>Geser jadwal</button>}
            {d.items.length > 0 && <Link href={`/proyek/rundown/${project.id}`}><button className="sm">Cetak</button></Link>}
            <PageHelp page="rundown" />
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="small muted">{d.items.length} item{last ? ` · versi ${last.version} (${tglShort(last.at.slice(0, 10))})` : ' · belum ada versi tersimpan'}</span>
          {d.changed && d.access === 'kelola' && <button className="sm ghost" onClick={() => setSheet('ver')}>{last ? 'Ada perubahan — simpan versi' : 'Simpan sebagai versi 1'}</button>}
          {d.versions.length > 0 && <button className="sm ghost" onClick={() => setSheet('hist')}>Riwayat versi ({d.versions.length})</button>}
        </div>
        {days.length > 1 && view !== 'checklist' && <div className="seg">{[['', 'Semua hari'], ...days.map((x) => [x, tglHari(x)])].map(([k, l]) => <button key={k || 'all'} type="button" className={day === k ? 'on' : ''} onClick={() => setDay(k)}>{l}</button>)}</div>}
        {live.length > 0 && <div className="notice">Sedang berjalan: {live.map((r) => `${r.start_time} ${r.title}`).join(' · ')}</div>}
        {!d.allowed && d.access === 'kelola' && <span className="small muted">Paket bisnis tidak mencakup Proyek & event: rundown tetap bisa dibaca, dijalankan (Mulai/Selesai), dan digeser; menambah & mengubah item butuh Paket Dasar.</span>}
      </section>

      {view === 'checklist' ? <Checklist project={project} onChange={onChange} />
        : d.items.length === 0 ? <Empty title="Rundown masih kosong" text="Susun urutan acara: jam, kegiatan, lokasi/stage, PIC, pengisi acara, technical cue, dan kebutuhan alat. Rundown menjadi jadwal kerja tim di hari-H — setiap item bisa ditandai Mulai & Selesai dari HP.">
          {d.can_edit && <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="primary" onClick={() => setSheet({ item: {} })}>+ Item pertama</button>
            <button onClick={() => setSheet('tpl')}>Pakai kerangka</button></div>}
        </Empty>
          : view === 'agenda' ? <AgendaTable items={items} onRow={d.can_edit ? (r) => setSheet({ item: r }) : null} />
            : <Timeline items={items} now={d.now} onEdit={d.can_edit ? (r) => setSheet({ item: r }) : null} onStatus={setStatus} />}

      {sheet?.item && <ItemForm d={d} init={sheet.item} onClose={() => setSheet(null)} onDone={done} onSaved={load} />}
      {sheet === 'tpl' && <TemplateSheet d={d} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'shift' && <ShiftSheet d={d} days={days} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'ver' && <VersionSheet d={d} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'hist' && <HistorySheet d={d} onClose={() => setSheet(null)} onDone={done} />}
    </div>
  );
}

function Timeline({ items, now, onEdit, onStatus }) {
  const byDay = items.reduce((a, r) => ((a[r.day] = a[r.day] || []).push(r), a), {});
  return Object.entries(byDay).map(([day, rows]) => (
    <section className="panel" key={day} style={{ gap: 0 }}>
      <span className="label" style={{ marginBottom: 6 }}>{tglHari(day)}{day === today() ? ' · hari ini' : ''}</span>
      <ol className="rd-tl">{rows.map((r) => {
        const st = RD_ST[r.status] || [r.status, 'void'];
        const on = r.status === 'berjalan' || (r.status !== 'selesai' && r.status !== 'dilewati' && sekarang(r, now));
        return (
          <li key={r.id} className={'rd-it' + (on ? ' now' : '') + (r.status === 'selesai' || r.status === 'dilewati' ? ' done' : '')}>
            <div className="rd-time"><b>{r.start_time}</b>{r.end_time && <span>{r.end_time}</span>}{r.duration_min != null && <small>{durasiTeks(r.duration_min)}</small>}</div>
            <div className="rd-body">
              <div className="row between" style={{ flexWrap: 'nowrap', gap: 8, alignItems: 'flex-start' }}>
                <b className="rd-title">{r.title}</b><span className={'chip ' + st[1]}>{st[0]}</span>
              </div>
              {(r.location || r.pic || r.performer) && <span className="small muted">{[r.location, r.pic && `PIC ${r.pic}`, r.performer && `Pengisi: ${r.performer}`].filter(Boolean).join(' · ')}</span>}
              {r.description && <span className="small rd-wrap">{r.description}</span>}
              {r.cue && <span className="small rd-wrap"><b>Cue:</b> {r.cue}</span>}
              {r.equipment && <span className="small rd-wrap"><b>Alat:</b> {r.equipment}</span>}
              {r.note && <span className="small muted rd-wrap">Catatan: {r.note}</span>}
              {(r.actual_start || r.actual_end) && <span className="small muted">Nyata: {waktu(r.actual_start) || '—'}{r.actual_end ? `–${waktu(r.actual_end)}` : ''}{r.status_by ? ` · ${r.status_by}` : ''}</span>}
              {r.clash?.length > 0 && <span className="small" style={{ color: 'var(--att-fg)' }}>⚠ PIC juga bertugas di {r.clash.map((c) => `${c.project} (${c.start_time} ${c.title})`).join(', ')}</span>}
              {r.out_of_range && <span className="small" style={{ color: 'var(--att-fg)' }}>⚠ Tanggal item di luar tanggal event</span>}
              {(r.can_status || onEdit) && <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {r.can_status && ['rencana', 'siap'].includes(r.status) && <button className="sm primary" onClick={() => onStatus(r, 'berjalan')}>Mulai</button>}
                {r.can_status && r.status === 'rencana' && <button className="sm" onClick={() => onStatus(r, 'siap')}>Siap</button>}
                {r.can_status && r.status === 'berjalan' && <button className="sm primary" onClick={() => onStatus(r, 'selesai')}>Selesai ✓</button>}
                {r.can_status && ['rencana', 'siap', 'berjalan'].includes(r.status) && <button className="sm ghost" onClick={() => onStatus(r, 'dilewati')}>Lewati</button>}
                {r.can_status && ['selesai', 'dilewati'].includes(r.status) && <button className="sm ghost" onClick={() => onStatus(r, 'rencana')}>Buka lagi</button>}
                {onEdit && <button className="sm ghost" onClick={() => onEdit(r)}>Ubah</button>}
              </div>}
            </div>
          </li>);
      })}</ol>
    </section>
  ));
}

function AgendaTable({ items, onRow }) {
  return <DataTable rows={items} caption="Agenda rundown" onRow={onRow || undefined} rowLabel={(r) => r.title} pageSize={200} initialSort={null}
    columns={[
      { key: 'w', label: 'Waktu', render: (r) => <span className="small"><b>{r.start_time}</b>{r.end_time ? `–${r.end_time}` : ''}<div className="muted">{tglShort(r.day)}</div></span> },
      { key: 't', label: 'Kegiatan', main: true, render: (r) => <><b>{r.title}</b>{r.description && <div className="small muted rd-wrap">{r.description}</div>}</> },
      { key: 'l', label: 'Lokasi', hide: 'tablet', render: (r) => <span className="small">{r.location || '—'}</span> },
      { key: 'p', label: 'PIC / pengisi', render: (r) => <span className="small">{r.pic || '—'}{r.performer ? <div className="muted">{r.performer}</div> : null}</span> },
      { key: 'c', label: 'Cue & alat', hide: 'tablet', render: (r) => <span className="small rd-wrap">{[r.cue, r.equipment].filter(Boolean).join(' · ') || '—'}</span> },
      { key: 'd', label: 'Durasi', align: 'right', hide: 'tablet', render: (r) => <span className="small">{durasiTeks(r.duration_min) || '—'}</span> },
      { key: 's', label: 'Status', render: (r) => { const s = RD_ST[r.status]; return <span className={'chip ' + s[1]}>{s[0]}</span>; } },
    ]}
    card={(r) => { const s = RD_ST[r.status]; return <>
      <div className="dt-row"><b>{r.start_time}{r.end_time ? `–${r.end_time}` : ''} · {r.title}</b><span className={'chip ' + s[1]}>{s[0]}</span></div>
      <span className="small muted">{[tglShort(r.day), r.location, r.pic && `PIC ${r.pic}`, r.performer].filter(Boolean).join(' · ')}</span>
      {(r.cue || r.equipment) && <span className="small rd-wrap">{[r.cue && `Cue: ${r.cue}`, r.equipment && `Alat: ${r.equipment}`].filter(Boolean).join(' · ')}</span>}
    </>; }} />;
}

// Checklist persiapan = tugas event (sumber yang sama dengan tab Tim & Tugas)
function Checklist({ project, onChange }) {
  const tasks = [...(project.tasks || [])].sort((a, b) => (a.status === 'selesai') - (b.status === 'selesai') || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const kelola = project.access === 'kelola';
  const toggle = async (t) => { if (await run(() => supabase.rpc('prj_task_status', { p_id: t.id, p_status: t.status === 'selesai' ? 'proses' : 'selesai' }), t.status === 'selesai' ? 'Dibuka lagi' : 'Selesai ✓', errMsg)) onChange?.(); };
  if (tasks.length === 0) return <Empty title="Checklist kosong" text="Checklist persiapan diambil dari Tugas event. Tambahkan tugas di tab Tim & Tugas (mis. konfirmasi vendor, cek sound, cetak ID card) — penanggung jawab mencentangnya dari HP." art={false} />;
  const doneN = tasks.filter((t) => t.status === 'selesai').length;
  return (
    <section className="panel" style={{ gap: 6 }}>
      <span className="small muted">{doneN} dari {tasks.filter((t) => t.status !== 'batal').length} selesai · sumber: Tugas event</span>
      <div className="ev-tasks">{tasks.filter((t) => t.status !== 'batal').map((t) => {
        const bisa = (kelola || t.assignee_user === project.me) && project.status !== 'batal';
        return <label className="ev-task" key={t.id}>
          <input type="checkbox" checked={t.status === 'selesai'} disabled={!bisa} onChange={() => toggle(t)} aria-label={`Selesai: ${t.title}`} />
          <span className="ev-task-b"><b className={t.status === 'selesai' ? 'done' : ''}>{t.title}</b><span>{t.assignee || 'belum ada penanggung jawab'}{t.due_date ? ` · ${tglShort(t.due_date)}` : ''}</span></span>
          {t.status !== 'selesai' && t.due_date && t.due_date < today() ? <span className="chip bad">Terlambat</span> : <Chip map={TASK_ST} v={t.status} />}
        </label>; })}</div>
    </section>
  );
}

function ItemForm({ d, init, onClose, onDone, onSaved }) {
  const p = d.project;
  const edit = init?.id ? init : null;
  const [f, setF] = useState({
    day: edit?.day || p.start_date || today(), start_time: edit?.start_time || p.start_time || '', end_time: edit?.end_time || '',
    duration_min: edit?.duration_min != null && !edit?.end_time ? String(edit.duration_min) : '', title: edit?.title || '', location: edit?.location || '',
    pic_user: edit?.pic_user || '', performer: edit?.performer || '', description: edit?.description || '', cue: edit?.cue || '', equipment: edit?.equipment || '', note: edit?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (more) => {
    if (!f.start_time) return toast('Isi jam mulai.');
    if (f.title.trim().length < 2) return toast('Isi nama kegiatan.');
    if (f.duration_min !== '' && !/^\d{1,4}$/.test(f.duration_min)) return toast('Durasi dalam menit (angka).');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_rundown_save', { p_project: p.id, p_id: edit?.id || null, p: { ...f, title: f.title.trim() } }), 'Rundown disimpan', errMsg);
    setBusy(false);
    if (!ok) return;
    // tambah lagi: item berikut mulai saat item ini selesai
    if (more) {
      const next = f.end_time || (f.duration_min !== '' ? jamTambah(f.start_time, Number(f.duration_min)) : f.start_time);
      setF((x) => ({ ...x, start_time: next, end_time: '', duration_min: '', title: '', description: '', cue: '', equipment: '', note: '', performer: '' }));
      onSaved?.();
    } else onDone();
  };
  const del = async () => { if (!window.confirm(`Hapus "${edit.title}" dari rundown?`)) return; if (await run(() => supabase.rpc('prj_rundown_delete', { p_id: edit.id }), 'Item dihapus', errMsg)) onDone(); };
  return (
    <Sheet title={edit ? 'Ubah item rundown' : 'Item rundown baru'} onClose={onClose}>
      <div className="row">
        <Field label="Tanggal"><input type="date" value={f.day} onChange={(e) => set('day', e.target.value)} /></Field>
        <Field label="Jam mulai"><input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Jam selesai (opsional)"><input type="time" value={f.end_time} onChange={(e) => { set('end_time', e.target.value); if (e.target.value) set('duration_min', ''); }} /></Field>
        <Field label="atau durasi (menit)"><input inputMode="numeric" value={f.duration_min} disabled={!!f.end_time} onChange={(e) => set('duration_min', e.target.value)} placeholder="mis. 45" /></Field>
      </div>
      {f.end_time && f.start_time && f.end_time < f.start_time && <span className="small muted">Selesai lewat tengah malam (hari berikutnya).</span>}
      <Field label="Kegiatan"><input value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="mis. Akad nikah, Registrasi peserta, Soundcheck" /></Field>
      <div className="row">
        <Field label="Lokasi / stage (opsional)"><input value={f.location} maxLength={120} onChange={(e) => set('location', e.target.value)} placeholder="mis. Ballroom, Stage utama" /></Field>
        <Field label="PIC (opsional)"><select value={f.pic_user} onChange={(e) => set('pic_user', e.target.value)}><option value="">— belum ditentukan —</option>{d.team.map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select></Field>
      </div>
      <Field label="Pengisi acara / pembicara (opsional)"><input value={f.performer} maxLength={200} onChange={(e) => set('performer', e.target.value)} placeholder="mis. MC Andi, Band Akustik, Narasumber" /></Field>
      <Field label="Deskripsi (opsional)"><textarea rows={2} value={f.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Technical cue (opsional)" hint="Instruksi untuk kru teknis: lampu, musik, layar, mikrofon."><input value={f.cue} maxLength={500} onChange={(e) => set('cue', e.target.value)} placeholder="mis. Lampu redup, putar musik masuk, mic wireless 2" /></Field>
      <Field label="Kebutuhan alat (opsional)"><input value={f.equipment} maxLength={500} onChange={(e) => set('equipment', e.target.value)} placeholder="mis. 2 mic, proyektor, kursi pelaminan" /></Field>
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={1000} onChange={(e) => set('note', e.target.value)} /></Field>
      <span className="small muted">PIC item bisa menandai Mulai/Selesai dari HP-nya. PIC otomatis bisa melihat event ini.</span>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="cta" disabled={busy} onClick={() => save(false)}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        {!edit && <button disabled={busy} onClick={() => save(true)}>Simpan & tambah berikutnya</button>}
      </div>
      {edit && <button className="ghost danger" onClick={del}>Hapus item</button>}
    </Sheet>
  );
}

function TemplateSheet({ d, onClose, onDone }) {
  const p = d.project;
  const [k, setK] = useState(tplFor(p.category || p.name));
  const [day, setDay] = useState(p.start_date || today());
  const [start, setStart] = useState(p.start_time || '09:00');
  const [busy, setBusy] = useState(false);
  const base = start ? menit(start) : null;
  const rows = base == null ? [] : RUNDOWN_TPL[k].items.map(([off, dur, title]) => ({ m: base + off, start_time: jamTambah(start, off), duration_min: dur, title }));
  const outside = rows.some((r) => r.m < 0 || r.m >= 1440);
  const add = async () => {
    if (outside) return toast('Sebagian kegiatan jatuh di hari lain. Ubah jam acara inti.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_rundown_bulk', { p_project: p.id, p_items: rows.map(({ start_time, duration_min, title }, i) => ({ day, start_time, duration_min, title, sort: i })) }), 'Kerangka ditambahkan — silakan sesuaikan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Pakai kerangka rundown" onClose={onClose}>
      <span className="small muted">Kerangka hanya titik awal — semua jam, kegiatan, dan PIC bisa diubah atau dihapus setelahnya.</span>
      <Field label="Jenis acara"><select value={k} onChange={(e) => setK(e.target.value)}>{Object.entries(RUNDOWN_TPL).map(([x, t]) => <option key={x} value={x}>{t.name}</option>)}</select></Field>
      <div className="row">
        <Field label="Tanggal"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Jam acara inti dimulai"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      <div className="list">{rows.map((r, i) => <div className="li" key={i}><div className="main"><b className="small">{r.start_time} · {r.title}</b><span className="small muted">{durasiTeks(r.duration_min)}</span></div></div>)}</div>
      {outside && <div className="notice bad">Sebagian kegiatan jatuh sebelum 00:00 atau sesudah 23:59. Geser jam acara inti.</div>}
      <button className="cta" disabled={busy || !start || !day} onClick={add}>{busy ? 'Menambahkan…' : `Tambahkan ${rows.length} kegiatan`}</button>
    </Sheet>
  );
}

function ShiftSheet({ d, days, onClose, onDone }) {
  const t0 = today();
  const nowTime = d.now?.slice(11, 16) || '00:00';
  const [day, setDay] = useState(days.includes(t0) ? t0 : days[0]);
  const [from, setFrom] = useState(day === t0 ? nowTime : d.items.find((r) => r.day === day)?.start_time || '00:00');
  const [min, setMin] = useState('15');
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const affected = d.items.filter((r) => r.day === day && r.start_time >= from && !['selesai', 'dilewati'].includes(r.status));
  const go = async () => {
    const m = Number(min);
    if (!(m > 0 && m <= 720)) return toast('Isi 1–720 menit.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_rundown_shift', { p_project: d.project.id, p_day: day, p_from: from, p_minutes: dir * m }), `${affected.length} item digeser`, errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Geser jadwal" onClose={onClose}>
      <span className="small muted">Acara molor atau maju? Geser semua kegiatan berikutnya sekaligus. Kegiatan yang sudah selesai/dilewati tidak ikut digeser. Tercatat di riwayat.</span>
      <div className="row">
        <Field label="Hari"><select value={day} onChange={(e) => setDay(e.target.value)}>{days.map((x) => <option key={x} value={x}>{tglHari(x)}</option>)}</select></Field>
        <Field label="Mulai dari jam"><input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Arah"><div className="seg">{[[1, 'Mundur (molor)'], [-1, 'Maju']].map(([k, l]) => <button key={k} type="button" className={dir === k ? 'on' : ''} onClick={() => setDir(k)}>{l}</button>)}</div></Field>
        <Field label="Menit"><input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
      </div>
      <span className="small">{affected.length === 0 ? 'Tidak ada kegiatan yang tergeser.' : `${affected.length} kegiatan: ${affected.slice(0, 4).map((r) => `${r.start_time} ${r.title}`).join(', ')}${affected.length > 4 ? ', …' : ''}`}</span>
      <button className="cta" disabled={busy || affected.length === 0} onClick={go}>{busy ? 'Menggeser…' : `Geser ${dir > 0 ? '+' : '−'}${min || 0} menit`}</button>
    </Sheet>
  );
}

function VersionSheet({ d, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); const ok = await run(() => supabase.rpc('prj_rundown_version_save', { p_project: d.project.id, p_note: note }), 'Versi rundown disimpan', errMsg); setBusy(false); if (ok) onDone(); };
  return (
    <Sheet title={`Simpan versi ${(d.versions[0]?.version || 0) + 1}`} onClose={onClose}>
      <span className="small muted">Simpan versi saat rundown dikirim ke klien atau disepakati tim. Versi lama tetap bisa dilihat & dipulihkan.</span>
      <Field label="Catatan versi (opsional)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="mis. Disetujui klien, Revisi jam resepsi" /></Field>
      <button className="cta" disabled={busy} onClick={go}>{busy ? 'Menyimpan…' : 'Simpan versi'}</button>
    </Sheet>
  );
}

function HistorySheet({ d, onClose, onDone }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const view = async (v) => { const { data, error } = await supabase.rpc('prj_rundown_version_get', { p_version: v.id }); if (error) return toast(errMsg(error)); setOpen(data); };
  const restore = async () => {
    const r = window.prompt(`Pulihkan rundown ke versi ${open.version}? Isi sekarang disimpan otomatis sebagai versi tersendiri. Tulis alasannya:`) || '';
    if (r.trim().length < 3) return;
    setBusy(true); const ok = await run(() => supabase.rpc('prj_rundown_restore', { p_version: open.id, p_reason: r }), `Dipulihkan dari versi ${open.version}`, errMsg); setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title={open ? `Versi ${open.version}` : 'Riwayat versi rundown'} onClose={onClose}>
      {!open ? <div className="list">{d.versions.map((v) => <button key={v.id} type="button" className="li" style={{ textAlign: 'left' }} onClick={() => view(v)}>
        <div className="main"><b className="small">Versi {v.version}{v.note ? ` · ${v.note}` : ''}</b><span className="small muted">{tgl(v.at.slice(0, 10))} {waktu(v.at)} · {v.by || '—'} · {v.count} item</span></div><span aria-hidden="true">›</span></button>)}</div>
        : <>
          <span className="small muted">{tgl(open.at.slice(0, 10))} {waktu(open.at)} · {open.by || '—'}{open.note ? ` · ${open.note}` : ''}</span>
          <div className="list">{open.items.map((r, i) => <div className="li" key={i}><div className="main"><b className="small">{tglShort(r.day)} {r.start_time}{r.end_time ? `–${r.end_time}` : ''} · {r.title}</b>
            <span className="small muted">{[r.location, r.pic && `PIC ${r.pic}`, r.performer].filter(Boolean).join(' · ') || '—'}</span></div></div>)}</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="ghost" onClick={() => setOpen(null)}>← Daftar versi</button>
            {d.can_edit && <button className="primary" disabled={busy} onClick={restore}>Pulihkan versi ini</button>}
          </div>
        </>}
    </Sheet>
  );
}
