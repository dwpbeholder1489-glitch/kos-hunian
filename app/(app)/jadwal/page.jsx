'use client';
// Jadwal & Tim (workspace Event): kalender event bulanan, semua tugas persiapan yang masih terbuka, dan beban kerja
// per orang. Server: event_schedule (izin sama dengan daftar event; nilai uang tidak dikirim ke non-keuangan).
// Rundown per jam menyusul di Tahap B — di sini hanya tanggal & jam acara yang sudah ada.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import EventCal, { eventsOn } from '@/components/EventCal';
import { Loading, Empty, run } from '@/components/ui';
import { canArea } from '@/lib/business';
import { tglShort, errMsg } from '@/lib/format';
import { EV_ST, tglHari, addMonths, addDays } from '@/lib/event';
import { PRIO, Chip } from '@/components/Proyek';

export default function Jadwal() {
  const { kosId, kos, ver, user } = useKos();
  const [month, setMonth] = useState(null);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const [who, setWho] = useState('');          // '' = semua, 'me', 'none', atau user_id
  const [when, setWhen] = useState('semua');   // semua | telat | minggu
  const load = () => supabase.rpc('event_schedule', { p_kos: kosId, p_month: month }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => {
    if (!d) return [];
    const w7 = addDays(d.today, 7);
    return d.tasks.filter((t) => (!who || (who === 'me' ? t.assignee_user === user?.id : who === 'none' ? !t.assignee_user : t.assignee_user === who))
      && (when === 'semua' || (when === 'telat' ? t.late : t.due_date && t.due_date >= d.today && t.due_date <= w7)));
  }, [d, who, when, user]);
  if (err) return <div className="notice bad">{/event_schedule|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const go = (n) => { setSel(null); setMonth(addMonths(d.month, n)); };
  const toggle = async (t) => { if (await run(() => supabase.rpc('prj_task_status', { p_id: t.id, p_status: 'selesai' }), 'Tugas selesai', errMsg)) load(); };
  const shown = sel ? eventsOn(d.events, sel) : d.events;
  const besok = addDays(d.today, 1);
  return (
    <div className="stack">
      <PageHeader title="Jadwal & Tim" help={<PageHelp page="jadwal" />} desc="Kalender event, tugas persiapan setiap anggota tim, dan siapa mengerjakan apa." />
      <div className="ev-row3">
        <section className="ev-card" aria-label="Kalender">
          <EventCal month={d.month} today={d.today} events={d.events} sel={sel} onSel={setSel} onMonth={go} link={false} />
        </section>
        <section className="ev-card" aria-labelledby="jd-ev">
          <div className="ev-card-h"><h2 id="jd-ev">{sel ? tglHari(sel) : 'Event bulan ini'}</h2>{sel && <button className="sm ghost" onClick={() => setSel(null)}>Semua</button>}</div>
          {shown.length === 0 ? <span className="small muted">{sel ? 'Tidak ada event di tanggal ini.' : 'Belum ada event di bulan ini.'}</span>
            : <div className="ev-up">{shown.map((p) => { const s = EV_ST[p.event_status] || [p.event_status, 'void'];
              return <Link key={p.id} href={`/proyek/${p.id}`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span className="ev-up-b"><b>{p.name}</b>
                  <span>{tglHari(p.start_date)}{p.end_date && p.end_date !== p.start_date ? ` – ${tglShort(p.end_date)}` : ''}{p.start_time ? ` · ${p.start_time}${p.end_time ? `–${p.end_time}` : ''}` : ''}{p.location ? ` • ${p.location}` : ''}</span>
                  <span>{[p.manager && `PIC ${p.manager}`, p.tasks_open ? `${p.tasks_open} tugas terbuka` : null, p.tasks_late ? `${p.tasks_late} terlambat` : null].filter(Boolean).join(' · ') || 'Belum ada tugas'}</span>
                </span>
                <span className="ev-up-r"><span className={'chip ' + s[1]}>{s[0]}</span></span>
              </Link>; })}</div>}
        </section>
      </div>

      {d.team.length > 0 && <section className="ev-card" aria-labelledby="jd-tim">
        <div className="ev-card-h"><h2 id="jd-tim">Beban kerja tim</h2>{canArea(kos, 'team') && <Link href="/karyawan">Kelola karyawan →</Link>}</div>
        <div className="grid">{d.team.map((m) => <button key={m.user_id || 'none'} type="button" className={'tile' + (who === (m.user_id || 'none') ? ' on' : '')} style={{ textAlign: 'left' }}
          onClick={() => setWho(who === (m.user_id || 'none') ? '' : (m.user_id || 'none'))} aria-pressed={who === (m.user_id || 'none')}>
          <span className="label">{m.name}</span><b>{m.open} tugas</b>
          <span className="small" style={{ color: m.late ? 'var(--bad)' : undefined }}>{m.late ? `${m.late} terlambat` : 'tidak ada yang terlambat'}{m.today ? ` · ${m.today} hari ini` : ''}</span>
        </button>)}</div>
      </section>}

      <section className="ev-card" aria-labelledby="jd-task">
        <div className="ev-card-h"><h2 id="jd-task">Tugas persiapan ({d.tasks_total})</h2></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="seg">{[['semua', 'Semua'], ['telat', 'Terlambat'], ['minggu', '7 hari ke depan']].map(([k, l]) => <button key={k} className={when === k ? 'on' : ''} onClick={() => setWhen(k)}>{l}</button>)}</div>
          <select aria-label="Penanggung jawab" value={who} onChange={(e) => setWho(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">Semua orang</option><option value="me">Tugas saya</option><option value="none">Belum ditentukan</option>
            {d.team.filter((m) => m.user_id).map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
        </div>
        {d.tasks_total === 0 ? <Empty title="Tidak ada tugas terbuka" text="Tambahkan tugas persiapan di halaman setiap event: siapa mengerjakan apa dan kapan tenggatnya. Anggota tim melihat & mencentang tugasnya dari HP." art={false} />
          : tasks.length === 0 ? <span className="small muted">Tidak ada tugas untuk pilihan ini.</span>
            : <div className="ev-tasks">{tasks.map((t) => {
              const due = t.due_date && (t.late ? ['Terlambat', 'bad'] : t.due_date === d.today ? ['Hari ini', 'bad'] : t.due_date === besok ? ['Besok', 'gold'] : [tglShort(t.due_date), 'void']);
              return <div className="ev-task" key={t.id}>
                <input type="checkbox" checked={false} disabled={!t.can_toggle} onChange={() => toggle(t)} aria-label={`Tandai selesai: ${t.title}`} title={t.can_toggle ? 'Tandai selesai' : 'Hanya penanggung jawab tugas atau PIC event'} />
                <Link href={`/proyek/${t.project_id}`} className="ev-task-b" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <b>{t.title}</b><span>{t.project}{t.event_date ? ` (${tglShort(t.event_date)})` : ''} · {t.assignee || 'belum ditentukan'}{t.status === 'proses' ? ' · sedang dikerjakan' : ''}</span>
                </Link>
                {t.priority === 'tinggi' && <Chip map={PRIO} v="tinggi" />}
                {due ? <span className={'chip ' + due[1]}>{due[0]}</span> : <span className="chip void">Tanpa tenggat</span>}
              </div>; })}</div>}
        {d.tasks_total > d.tasks.length && <span className="small muted">Menampilkan {d.tasks.length} tugas terdekat dari {d.tasks_total}.</span>}
      </section>
    </div>
  );
}
