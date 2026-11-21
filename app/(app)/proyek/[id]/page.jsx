'use client';
// Detail proyek: ringkasan, status, milestone, tugas, anggota, subproyek, lampiran, riwayat. Server: prj_get + prj_*.
// access 'kelola' (pemilik/pengelola/PIC) = semua tombol; 'lihat' = baca + menandai tugas miliknya sendiri.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Lampiran from '@/components/Lampiran';
import { PageHeader } from '@/components/Page';
import { Loading, Empty, Field, Sheet, run, toast } from '@/components/ui';
import { rp, tgl, tglShort, today, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { KIND, STATUS, TASK_ST, PRIO, Chip, Progress, ProjectForm, MilestoneForm, TaskForm, jadwal } from '@/components/Proyek';
import { QuoteForm, qStatus } from '@/components/Penawaran';

const waktu = (iso) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// Tombol pindah status yang masuk akal dari status sekarang (server tetap menerima perpindahan lain)
const NEXT = { penawaran: ['berjalan', 'batal'], berjalan: ['selesai', 'ditunda', 'batal'], ditunda: ['berjalan', 'batal'], selesai: ['berjalan'], batal: ['berjalan'] };
const NEXT_LABEL = { berjalan: 'Jalankan / buka lagi', selesai: 'Tandai selesai', ditunda: 'Tunda', batal: 'Batalkan', penawaran: 'Kembali ke penawaran' };

export default function ProyekDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { kosId, kos, ver } = useKos();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);    // 'edit' | 'sub' | {ms} | {task}
  const [stat, setStat] = useState(null);    // status tujuan
  const [taskTab, setTaskTab] = useState('buka');
  const [member, setMember] = useState(false);
  const [qform, setQform] = useState(null);   // 'awal' | 'perubahan'
  const load = () => supabase.rpc('prj_get', { p_project: id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setP(data))));
  useEffect(() => { load(); }, [id, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="stack"><div className="notice bad">{/prj_get|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div><Link href="/proyek">← Kembali ke daftar proyek</Link></div>;
  if (!p) return <Loading />;
  const kelola = p.access === 'kelola';
  const closed = ['selesai', 'batal'].includes(p.status);
  const canEdit = kelola && p.allowed && !closed;
  const tasks = p.tasks.filter((t) => (taskTab === 'buka' ? ['todo', 'proses'].includes(t.status) : taskTab === 'saya' ? t.assignee_user === p.me : ['selesai', 'batal'].includes(t.status)));
  const msName = Object.fromEntries(p.milestones.map((m) => [m.id, m.name]));
  const setTask = async (t, s) => { if (await run(() => supabase.rpc('prj_task_status', { p_id: t.id, p_status: s }), s === 'selesai' ? 'Tugas selesai' : 'Status tugas diubah', errMsg)) load(); };
  const msDone = async (m) => { if (await run(() => supabase.rpc('prj_milestone_done', { p_id: m.id, p_done: m.status !== 'selesai' }), m.status !== 'selesai' ? 'Milestone selesai' : 'Milestone dibuka lagi', errMsg)) load(); };
  const myTask = (t) => t.assignee_user === p.me;
  return (
    <div className="stack">
      <Link href="/proyek" className="small">← Semua proyek</Link>
      <PageHeader title={p.name} desc={`${p.number} · ${KIND[p.kind]}${p.client ? ` · ${p.client}` : ''}`} help={<PageHelp page="proyek" />}
        actions={canEdit && <button onClick={() => setForm('edit')}>Ubah</button>} />
      {!p.allowed && kelola && <div className="notice">Paket bisnis ini belum mencakup Proyek (mulai Paket Bisnis). Anda masih bisa membuka data, menandai tugas, dan menyelesaikan atau membatalkan proyek.</div>}

      <section className="panel" style={{ gap: 10 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Chip map={STATUS} v={p.status} />
          {kelola && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{(NEXT[p.status] || []).filter((s) => p.allowed || ['selesai', 'batal'].includes(s)).map((s) => (
            <button key={s} className={'sm' + (s === 'batal' ? ' ghost danger' : s === 'selesai' ? ' primary' : '')} onClick={() => setStat(s)}>{NEXT_LABEL[s]}</button>))}</div>}
        </div>
        {p.status_note && <span className="small muted">Catatan status: {p.status_note}</span>}
        <Progress pct={p.progress} />
        <dl className="kv">
          <dt>Jadwal</dt><dd>{jadwal(p)}</dd>
          <dt>PIC</dt><dd>{p.manager || '—'}</dd>
          {p.client && <><dt>Klien</dt><dd>{p.client}</dd></>}
          {p.location && <><dt>Lokasi</dt><dd>{p.location}</dd></>}
          <dt>Tugas</dt><dd>{p.tasks_done}/{p.tasks_total} selesai{p.tasks_late > 0 ? ` · ${p.tasks_late} terlambat` : ''}</dd>
          {p.revision_limit != null && <><dt>Batas revisi</dt><dd>{p.revision_limit} kali</dd></>}
          {p.fin && <><dt>Nilai kontrak</dt><dd>{p.value != null ? rp(p.value) : '—'}</dd></>}
          {p.fin && p.milestone_total != null && <><dt>Total rencana termin</dt><dd>{rp(p.milestone_total)}{p.value != null && Number(p.milestone_total) !== Number(p.value) ? <span className="small" style={{ color: 'var(--att-fg)', display: 'block' }}>{Number(p.milestone_total) < Number(p.value) ? `kurang ${rp(p.value - p.milestone_total)} dari nilai kontrak` : `lebih ${rp(p.milestone_total - p.value)} dari nilai kontrak`}</span> : null}</dd></>}
          {p.parent && <><dt>Bagian dari</dt><dd><Link href={`/proyek/${p.parent_id}`}>{p.parent}</Link></dd></>}
        </dl>
        {p.description && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.description}</p>}
      </section>

      {p.can_quote && <section className="panel" style={{ gap: 6 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}><span className="label">Penawaran & perubahan scope ({(p.quotes || []).length})</span>
          {p.allowed && p.status !== 'batal' && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {!p.quote_id && ['penawaran', 'berjalan', 'ditunda'].includes(p.status) && !(p.quotes || []).some((x) => x.kind === 'awal' && ['draf', 'terkirim'].includes(x.status)) && <button className="sm primary" onClick={() => setQform('awal')}>+ Buat penawaran</button>}
            {(p.quote_id || p.status !== 'penawaran') && <button className="sm" onClick={() => setQform('perubahan')}>+ Perubahan scope</button>}
          </div>}</div>
        {(p.quotes || []).length === 0 ? <span className="small muted">{p.status === 'penawaran' ? 'Buat penawaran untuk klien. Saat disetujui, proyek berjalan dengan nilai kontrak, batas revisi, dan termin dari penawaran.' : 'Klien minta tambahan pekerjaan di luar kesepakatan? Ajukan Perubahan scope agar biaya & jadwalnya disetujui dulu.'}</span>
          : <div className="list">{p.quotes.map((x) => { const st = qStatus(x); return (
            <Link className="li" key={x.id} href={`/proyek/penawaran/${x.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="main"><b className="small">{x.kind === 'perubahan' ? 'Perubahan · ' : ''}{x.title}</b><span className="small muted">{x.number}{x.revision ? ` · revisi ${x.revision}` : ''} · {rp(x.total)}</span></div>
              <span className={'chip ' + st[1]}>{st[0]}</span></Link>); })}</div>}
      </section>}

      <section className="panel" style={{ gap: 6 }}>
        <div className="row between"><span className="label">Milestone ({p.milestones.length})</span>{canEdit && <button className="sm" onClick={() => setForm({ ms: {} })}>+ Milestone</button>}</div>
        {p.milestones.length === 0 ? <span className="small muted">Belum ada. Contoh: DP & konsep disetujui → Gladi bersih → Hari H → Pelunasan.</span>
          : <div className="list">{p.milestones.map((m) => (
            <div className="li" key={m.id}>
              <label className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, flex: 1 }}>
                {kelola && <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={m.status === 'selesai'} onChange={() => msDone(m)} aria-label={`Tandai ${m.name} selesai`} />}
                <div className="main"><b className="small" style={m.status === 'selesai' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null}>{m.name}</b>
                  <span className="small muted">{m.due_date ? `target ${tgl(m.due_date)}` : 'tanpa target'}{m.tasks_total ? ` · tugas ${m.tasks_done}/${m.tasks_total}` : ''}{p.fin && m.amount != null ? ` · termin ${rp(m.amount)}` : ''}
                    {m.status !== 'selesai' && m.due_date && m.due_date < today() ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}> · lewat target</span> : null}</span></div>
              </label>
              {canEdit && <button className="sm ghost" onClick={() => setForm({ ms: m })}>Ubah</button>}
            </div>))}</div>}
      </section>

      <section className="panel" style={{ gap: 6 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}><span className="label">Tugas</span>{canEdit && <button className="sm primary" onClick={() => setForm({ task: {} })}>+ Tugas</button>}</div>
        <div className="seg">{[['buka', `Belum selesai (${p.tasks.filter((t) => ['todo', 'proses'].includes(t.status)).length})`], ['saya', `Tugas saya (${p.tasks.filter(myTask).length})`], ['tutup', 'Selesai / batal']].map(([k, l]) => <button key={k} className={taskTab === k ? 'on' : ''} onClick={() => setTaskTab(k)}>{l}</button>)}</div>
        {tasks.length === 0 ? <span className="small muted">{p.tasks.length === 0 ? (kelola ? 'Belum ada tugas. Pecah pekerjaan jadi tugas kecil dan beri penanggung jawab — mereka melihatnya di menu Proyek di HP masing-masing.' : 'Belum ada tugas.') : 'Tidak ada tugas di sini.'}</span>
          : <div className="list">{tasks.map((t) => {
            const late = ['todo', 'proses'].includes(t.status) && t.due_date && t.due_date < today();
            const bisa = kelola || myTask(t);
            return (
              <div className="li" key={t.id} style={{ flexWrap: 'wrap' }}>
                <div className="main" style={{ flex: '1 1 200px' }}>
                  <b className="small" style={t.status === 'selesai' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null}>{t.title}</b>
                  <span className="small muted">{t.assignee || 'belum ada penanggung jawab'}{t.due_date ? ` · tenggat ${tglShort(t.due_date)}` : ''}{t.milestone_id && msName[t.milestone_id] ? ` · ${msName[t.milestone_id]}` : ''}
                    {late && <span style={{ color: 'var(--bad)', fontWeight: 700 }}> · terlambat</span>}</span>
                  {t.note && <span className="small" style={{ overflowWrap: 'anywhere' }}>{t.note}</span>}
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  {t.priority === 'tinggi' && <Chip map={PRIO} v="tinggi" />}
                  <Chip map={TASK_ST} v={t.status} />
                  {bisa && p.status !== 'batal' && t.status === 'todo' && <button className="sm" onClick={() => setTask(t, 'proses')}>Mulai</button>}
                  {bisa && p.status !== 'batal' && ['todo', 'proses'].includes(t.status) && <button className="sm primary" onClick={() => setTask(t, 'selesai')}>Selesai ✓</button>}
                  {bisa && p.status !== 'batal' && t.status === 'selesai' && <button className="sm ghost" onClick={() => setTask(t, 'proses')}>Buka lagi</button>}
                  {canEdit && <button className="sm ghost" onClick={() => setForm({ task: t })}>Ubah</button>}
                </div>
              </div>);
          })}</div>}
      </section>

      <section className="panel" style={{ gap: 6 }}>
        <div className="row between"><span className="label">Anggota proyek ({p.members.length})</span>{canEdit && <button className="sm" onClick={() => setMember(true)}>+ Anggota</button>}</div>
        <span className="small muted">Anggota bisa melihat proyek ini walau perannya bukan bagian proses. Penanggung jawab tugas otomatis bisa melihatnya.</span>
        {p.members.length > 0 && <div className="list">{p.members.map((m) => (
          <div className="li" key={m.user_id}><div className="main"><b className="small">{m.name}</b>{m.role_label && <span className="small muted">{m.role_label}</span>}</div>
            {canEdit && <button className="sm ghost" onClick={async () => { if (window.confirm(`Keluarkan ${m.name} dari proyek ini?`) && await run(() => supabase.rpc('prj_member_set', { p_project: p.id, p_user: m.user_id, p_on: false, p_role: null }), 'Anggota dikeluarkan', errMsg)) load(); }}>Keluarkan</button>}</div>))}</div>}
      </section>

      {(p.children.length > 0 || (canEdit && !p.parent_id)) && <section className="panel" style={{ gap: 6 }}>
        <div className="row between"><span className="label">Subproyek ({p.children.length})</span>{canEdit && !p.parent_id && <button className="sm" onClick={() => setForm('sub')}>+ Subproyek</button>}</div>
        {p.children.length === 0 ? <span className="small muted">Pekerjaan besar bisa dipecah, mis. produksi panggung atau dokumentasi sebagai subproyek dengan PIC & tugas sendiri.</span>
          : <div className="list">{p.children.map((c) => <Link className="li" key={c.id} href={`/proyek/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><div className="main"><b className="small">{c.name}</b><span className="small muted">{c.number}</span></div><Chip map={STATUS} v={c.status} /></Link>)}</div>}
      </section>}

      {canArea(kos, 'ops,settings') && <Lampiran entity="project" id={p.id} title="Dokumen proyek" hint="Mis. kontrak, brief, denah, foto lokasi (foto/PDF, maks. 4 MB). File desain/video besar simpan di Google Drive/Dropbox dan tempel tautannya di keterangan." />}

      <section className="panel" style={{ gap: 6 }}>
        <span className="label">Riwayat</span>
        {p.history.length === 0 ? <span className="small muted">Belum ada.</span>
          : <div className="list">{p.history.slice(0, 30).map((h, i) => <div className="li" key={i}><div className="main"><span className="small">{h.summary.replace(`${p.number} · `, '')}</span><span className="small muted">{waktu(h.at)} · {h.actor}</span></div></div>)}</div>}
      </section>

      {form === 'edit' && <ProjectForm kosId={kosId} init={p} fin={p.fin} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {form === 'sub' && <ProjectForm kosId={kosId} init={{ parent_id: p.id, kind: p.kind }} fin={p.fin} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {form?.ms && <MilestoneForm project={p} init={form.ms} fin={p.fin} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {form?.task && <TaskForm project={p} init={form.task} team={p.team} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {qform && <QuoteForm kosId={kosId} init={{ kind: qform, project: p }} onClose={() => setQform(null)} onDone={(qid) => { setQform(null); if (qid) router.push(`/proyek/penawaran/${qid}`); else load(); }} />}
      {stat && <StatusSheet p={p} to={stat} onClose={() => setStat(null)} onDone={() => { setStat(null); load(); }} />}
      {member && <MemberSheet p={p} onClose={() => setMember(false)} onDone={() => { setMember(false); load(); }} />}
    </div>
  );
}

function StatusSheet({ p, to, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const reopen = ['selesai', 'batal'].includes(p.status);
  const wajib = to === 'batal' || reopen;
  const open = p.tasks.filter((t) => ['todo', 'proses'].includes(t.status)).length;
  const go = async () => {
    if (wajib && note.trim().length < 3) return toast(to === 'batal' ? 'Tuliskan alasan pembatalan.' : 'Tuliskan alasan membuka lagi.');
    setBusy(true);
    let res = null;
    const ok = await run(async () => { const r = await supabase.rpc('prj_status', { p_project: p.id, p_status: to, p_note: note }); res = r.data; return r; }, 'Status proyek diubah', errMsg);
    setBusy(false);
    if (ok) { if (to === 'selesai' && res?.open_tasks > 0) toast(`Proyek selesai. Catatan: ${res.open_tasks} tugas masih belum selesai.`); onDone(); }
  };
  return (
    <Sheet title={NEXT_LABEL[to]} onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>{STATUS[p.status][0]} → <b>{STATUS[to][0]}</b></p>
      {to === 'selesai' && open > 0 && <div className="notice">Masih ada {open} tugas belum selesai. Proyek tetap bisa ditandai selesai; tugas itu dibiarkan seperti adanya.</div>}
      {to === 'batal' && <span className="small muted">Proyek batal tidak bisa ditambah tugas. Data & riwayatnya tetap tersimpan, dan bisa dibuka lagi bila klien kembali.</span>}
      <Field label={wajib ? 'Alasan (wajib)' : 'Catatan (opsional)'}><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={to === 'batal' ? 'mis. klien memilih vendor lain' : reopen ? 'mis. klien minta tambahan acara' : ''} /></Field>
      <button className={to === 'batal' ? 'cta danger' : 'cta'} disabled={busy} onClick={go}>{busy ? 'Menyimpan…' : NEXT_LABEL[to]}</button>
    </Sheet>
  );
}

function MemberSheet({ p, onClose, onDone }) {
  const ada = new Set(p.members.map((m) => m.user_id));
  const pilihan = (p.team || []).filter((t) => !ada.has(t.user_id));
  const [user, setUser] = useState(pilihan[0]?.user_id || '');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!user) return toast('Pilih anggota tim.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_member_set', { p_project: p.id, p_user: user, p_on: true, p_role: role }), 'Anggota ditambahkan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Tambah anggota proyek" onClose={onClose}>
      {pilihan.length === 0 ? <Empty title="Semua anggota tim sudah masuk" text="Undang karyawan baru dari menu Karyawan, lalu tambahkan di sini." art={false}><Link href="/karyawan" className="small">Buka Karyawan →</Link></Empty> : <>
        <Field label="Anggota tim"><select value={user} onChange={(e) => setUser(e.target.value)}>{pilihan.map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select></Field>
        <Field label="Peran di proyek (opsional)"><input value={role} maxLength={40} onChange={(e) => setRole(e.target.value)} placeholder="mis. Koordinator lapangan, Editor" /></Field>
        <button className="cta" disabled={busy} onClick={go}>{busy ? 'Menyimpan…' : 'Tambahkan'}</button>
      </>}
    </Sheet>
  );
}
