'use client';
// Mesin Proyek (Tahap 1A Event, Media & Creative): label & formulir bersama untuk /proyek dan /proyek/[id].
// Server penentu akhir (prj_*): izin per proyek, nilai uang hanya untuk bagian keuangan, batas paket.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, run, toast } from '@/components/ui';
import { useKos } from '@/components/KosProvider';
import { angka, parseRp, rp, tgl, today, errMsg } from '@/lib/format';

export const KIND = { event: 'Event / acara', kreatif: 'Kreatif & media', produksi: 'Produksi', umum: 'Umum' };
export const STATUS = { penawaran: ['Penawaran', 'info'], berjalan: ['Berjalan', 'good'], ditunda: ['Ditunda', 'gold'], selesai: ['Selesai', 'void'], batal: ['Batal', 'bad'] };
export const TASK_ST = { todo: ['Belum mulai', 'void'], proses: ['Dikerjakan', 'info'], selesai: ['Selesai', 'good'], batal: ['Batal', 'bad'] };
export const PRIO = { tinggi: ['Penting', 'bad'], normal: ['Normal', 'void'], rendah: ['Rendah', 'void'] };

export const Chip = ({ map, v }) => { const s = map[v] || [v, 'void']; return <span className={'chip ' + s[1]}>{s[0]}</span>; };
export const Progress = ({ pct }) => (pct == null ? <span className="small muted">belum ada tugas</span>
  : <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><div className="progress" style={{ flex: 1, minWidth: 60 }}><i style={{ width: `${pct}%` }} /></div><span className="small" style={{ whiteSpace: 'nowrap' }}>{pct}%</span></div>);
// Jenis proyek bawaan menurut kategori bisnis
export const defaultKind = (kos) => ({ event: 'event', media: 'kreatif', konstruksi: 'umum' }[kos?.category_code] || 'umum');
export const jadwal = (p) => (p.start_date ? (p.end_date && p.end_date !== p.start_date ? `${tgl(p.start_date)} – ${tgl(p.end_date)}` : tgl(p.start_date)) : p.end_date ? `s.d. ${tgl(p.end_date)}` : 'Tanpa jadwal');

// Formulir proyek (baru / ubah). init = proyek (ubah) atau {} (baru). fin = boleh mengisi nilai kontrak.
export function ProjectForm({ kosId, init, fin, onClose, onDone }) {
  const edit = init?.id ? init : null;
  const { kos } = useKos();
  const [opt, setOpt] = useState(null);
  const [f, setF] = useState({
    name: edit?.name || '', kind: edit?.kind || init?.kind || defaultKind(kos), status: 'berjalan',
    contact_id: edit?.contact_id || '', newClient: false, client_name: '', client_phone: '',
    manager_user: edit ? edit.manager_user || '' : '', parent_id: edit?.parent_id || init?.parent_id || '',
    start_date: edit?.start_date || '', end_date: edit?.end_date || '', value: edit?.value != null ? angka(edit.value) : '',
    location: edit?.location || '', description: edit?.description || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    supabase.rpc('prj_form_options', { p_kos: kosId }).then(({ data, error }) => {
      if (error) { toast(errMsg(error)); return setOpt({ clients: [], team: [], parents: [] }); }
      setOpt(data);
      if (!edit && data.clients.length === 0) set('newClient', true);
    });
  }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama proyek.');
    if (f.start_date && f.end_date && f.end_date < f.start_date) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (f.newClient && f.client_name.trim().length === 0 && f.client_phone.trim()) return toast('Isi nama klien.');
    const p = {
      name: f.name.trim(), kind: f.kind, status: f.status, manager_user: f.manager_user || null, parent_id: f.parent_id || null,
      start_date: f.start_date || null, end_date: f.end_date || null, location: f.location, description: f.description,
      ...(f.newClient ? { client_name: f.client_name.trim(), client_phone: f.client_phone.trim() } : { contact_id: f.contact_id || null }),
      ...(fin ? { value: f.value === '' ? null : parseRp(f.value) } : {}),
    };
    setBusy(true);
    let newId = null;
    const ok = await run(async () => { const r = await supabase.rpc('prj_save', { p_kos: kosId, p_id: edit?.id || null, p_data: p }); newId = r.data; return r; }, edit ? 'Proyek diperbarui' : 'Proyek dibuat', errMsg);
    setBusy(false);
    if (ok) onDone(newId);
  };
  const parents = (opt?.parents || []).filter((x) => x.id !== edit?.id);
  return (
    <Sheet title={edit ? `Ubah · ${edit.number}` : 'Proyek baru'} onClose={onClose}>
      <Field label="Nama proyek"><input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="mis. Wedding Andi & Sari, Video profil PT Maju" /></Field>
      <Field label="Jenis"><div className="seg">{Object.entries(KIND).map(([k, l]) => <button type="button" key={k} className={f.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>{l}</button>)}</div></Field>
      {!edit && <Field label="Tahap" hint="Penawaran = belum deal dengan klien. Bisa diubah kapan saja."><div className="seg">{[['berjalan', 'Sudah deal / berjalan'], ['penawaran', 'Masih penawaran']].map(([k, l]) => <button type="button" key={k} className={f.status === k ? 'on' : ''} onClick={() => set('status', k)}>{l}</button>)}</div></Field>}
      <span className="label">Klien</span>
      {opt && opt.clients.length > 0 && <div className="seg">{[[false, 'Pilih pelanggan'], [true, 'Klien baru']].map(([k, l]) => <button type="button" key={String(k)} className={f.newClient === k ? 'on' : ''} onClick={() => set('newClient', k)}>{l}</button>)}</div>}
      {f.newClient ? <div className="row">
        <Field label="Nama klien (opsional)"><input value={f.client_name} maxLength={80} onChange={(e) => set('client_name', e.target.value)} placeholder="orang atau perusahaan" /></Field>
        <Field label="No. HP (opsional)"><input inputMode="tel" value={f.client_phone} maxLength={20} onChange={(e) => set('client_phone', e.target.value)} /></Field>
      </div> : <Field label="Pelanggan"><select value={f.contact_id} onChange={(e) => set('contact_id', e.target.value)}><option value="">— tanpa klien —</option>{(opt?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></Field>}
      {f.newClient && <span className="small muted">Klien baru otomatis masuk daftar Pelanggan.</span>}
      <div className="row">
        <Field label="Mulai"><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="Selesai"><input type="date" value={f.end_date} min={f.start_date || undefined} onChange={(e) => set('end_date', e.target.value)} /></Field>
      </div>
      <Field label="PIC (penanggung jawab proyek)" hint={edit ? 'PIC bisa mengubah proyek ini, mengatur tugas, milestone, dan anggota.' : 'Kosong = Anda sendiri. PIC bisa mengatur tugas, milestone, dan anggota proyek ini.'}>
        <select value={f.manager_user} onChange={(e) => set('manager_user', e.target.value)}><option value="">{edit ? '— belum ada —' : 'Saya sendiri'}</option>{(opt?.team || []).map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select>
      </Field>
      {fin && <Field label="Nilai kontrak (opsional)" hint="Hanya rencana — belum masuk Pembukuan. Tagihan & termin menyusul."><input inputMode="numeric" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="mis. 85.000.000" /></Field>}
      <Field label="Lokasi (opsional)"><input value={f.location} maxLength={200} onChange={(e) => set('location', e.target.value)} placeholder="mis. Gedung Serbaguna, Jl. Merdeka 1" /></Field>
      <Field label="Keterangan (opsional)"><textarea rows={3} value={f.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} placeholder="ringkasan kebutuhan klien, catatan penting" /></Field>
      {parents.length > 0 && <Field label="Bagian dari proyek lain? (opsional)" hint="mis. produksi panggung sebagai subproyek dari acara utama"><select value={f.parent_id} onChange={(e) => set('parent_id', e.target.value)}><option value="">— proyek mandiri —</option>{parents.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>}
      <button className="cta" disabled={busy || !opt} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

export function MilestoneForm({ project, init, fin, onClose, onDone }) {
  const [f, setF] = useState({ name: init?.name || '', due_date: init?.due_date || '', amount: init?.amount != null ? angka(init.amount) : '', note: init?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama milestone.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_milestone_save', { p_project: project.id, p_id: init?.id || null,
      p_data: { name: f.name.trim(), due_date: f.due_date || null, note: f.note, ...(fin ? { amount: f.amount === '' ? null : parseRp(f.amount) } : {}) } }), 'Milestone disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  const del = async () => { if (!window.confirm(`Hapus milestone "${init.name}"? Tugas di dalamnya tetap ada.`)) return; if (await run(() => supabase.rpc('prj_milestone_delete', { p_id: init.id }), 'Milestone dihapus', errMsg)) onDone(); };
  return (
    <Sheet title={init?.id ? 'Ubah milestone' : 'Milestone baru'} onClose={onClose}>
      <span className="small muted">Milestone = tahap besar proyek, mis. "DP & konsep disetujui", "Gladi bersih", "Hari H", "Pelunasan".</span>
      <Field label="Nama"><input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Target tanggal (opsional)"><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
      {fin && <Field label="Rencana nilai termin (opsional)" hint="Mis. DP 30%. Hanya rencana — penagihan termin menyusul di tahap berikutnya."><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="mis. 25.000.000" /></Field>}
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={500} onChange={(e) => set('note', e.target.value)} /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {init?.id && init.status !== 'selesai' && <button className="ghost danger" onClick={del}>Hapus milestone</button>}
    </Sheet>
  );
}

export function TaskForm({ project, init, team, onClose, onDone }) {
  const [f, setF] = useState({ title: init?.title || '', milestone_id: init?.milestone_id || '', assignee_user: init?.assignee_user || '', due_date: init?.due_date || '',
    priority: init?.priority || 'normal', note: init?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (more) => {
    if (f.title.trim().length < 2) return toast('Isi judul tugas.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_task_save', { p_project: project.id, p_id: init?.id || null,
      p_data: { ...f, title: f.title.trim(), milestone_id: f.milestone_id || null, assignee_user: f.assignee_user || null, due_date: f.due_date || null } }), 'Tugas disimpan', errMsg);
    setBusy(false);
    if (!ok) return;
    if (more) setF((x) => ({ ...x, title: '', note: '' })); else onDone();
  };
  const del = async () => { if (!window.confirm(`Hapus tugas "${init.title}"?`)) return; if (await run(() => supabase.rpc('prj_task_delete', { p_id: init.id }), 'Tugas dihapus', errMsg)) onDone(); };
  return (
    <Sheet title={init?.id ? 'Ubah tugas' : 'Tugas baru'} onClose={onDone}>
      <Field label="Tugas"><input value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="mis. Survei venue, Booking dekorasi, Kirim draft video" /></Field>
      <Field label="Penanggung jawab" hint="Orang ini melihat proyek ini dan bisa menandai tugasnya selesai dari HP-nya."><select value={f.assignee_user} onChange={(e) => set('assignee_user', e.target.value)}><option value="">— belum ditentukan —</option>{(team || []).map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select></Field>
      <div className="row">
        <Field label="Tenggat (opsional)"><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
        <Field label="Prioritas"><select value={f.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIO).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      {project.milestones.length > 0 && <Field label="Milestone (opsional)"><select value={f.milestone_id} onChange={(e) => set('milestone_id', e.target.value)}><option value="">— tanpa milestone —</option>{project.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
      <Field label="Catatan (opsional)"><textarea rows={2} value={f.note} maxLength={1000} onChange={(e) => set('note', e.target.value)} /></Field>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="cta" disabled={busy} onClick={() => save(false)}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        {!init?.id && <button disabled={busy} onClick={() => save(true)}>Simpan & tambah lagi</button>}
      </div>
      {init?.id && init.status !== 'selesai' && <button className="ghost danger" onClick={del}>Hapus tugas</button>}
      {init?.done_at && <span className="small muted">Selesai {tgl(init.done_at.slice(0, 10))}</span>}
    </Sheet>
  );
}

export const terlambat = (d) => d && d < today();
export { rp };
