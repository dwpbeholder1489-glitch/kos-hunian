'use client';
// Proyek (Tahap 1A Event, Media & Creative). Server: prj_list, prj_save. Detail di /proyek/[id].
// Siapa melihat apa ditentukan server: pemilik/pengelola & bagian proses (ops) = semua proyek; karyawan lain = proyek tempat
// ia anggota/PIC/penanggung jawab tugas. Nilai kontrak hanya untuk bagian keuangan.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { PageHeader, DataTable, FilterToolbar } from '@/components/Page';
import { useBaru } from '@/lib/useBaru';
import { Loading, Empty, Tile, run } from '@/components/ui';
import { canArea } from '@/lib/business';
import { rp, tglShort, today, errMsg } from '@/lib/format';
import { KIND, STATUS, PRIO, Chip, Progress, ProjectForm, jadwal } from '@/components/Proyek';

const TABS = [['aktif', 'Berjalan'], ['selesai', 'Selesai'], ['batal', 'Batal']];
const tabOf = (s) => (s === 'selesai' ? 'selesai' : s === 'batal' ? 'batal' : 'aktif');

export default function Proyek() {
  const { kosId, kos, ver } = useKos();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('aktif');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const load = () => supabase.rpc('prj_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useBaru(() => setForm({}));
  const rows = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return d.projects.filter((p) => tabOf(p.status) === tab && (!kind || p.kind === kind)
      && (!s || [p.number, p.name, p.client, p.location, p.manager].some((x) => (x || '').toLowerCase().includes(s))));
  }, [d, tab, q, kind]);
  if (err) return <div className="notice bad">{/prj_list|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const canNew = d.can_create && d.allowed;
  const aktif = d.projects.filter((p) => tabOf(p.status) === 'aktif');
  const telat = aktif.reduce((n, p) => n + (p.tasks_late || 0), 0);
  const t0 = today();
  const t7 = new Date(Date.parse(t0 + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10);
  const minggu = aktif.filter((p) => p.start_date && p.start_date >= t0 && p.start_date <= t7).length;
  const nilai = d.fin ? aktif.filter((p) => p.status !== 'penawaran').reduce((n, p) => n + Number(p.value || 0), 0) : null;
  const toggle = async (t) => { if (await run(() => supabase.rpc('prj_task_status', { p_id: t.id, p_status: t.status === 'proses' ? 'selesai' : 'proses' }), t.status === 'proses' ? 'Tugas selesai' : 'Tugas mulai dikerjakan', errMsg)) load(); };
  return (
    <div className="stack">
      <PageHeader title="Proyek" help={<PageHelp page="proyek" />} actions={canNew && <button className="primary" onClick={() => setForm({})}>+ Proyek baru</button>} />
      {!d.allowed && <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} event="PROJECT.REQUESTED" title="Proyek tersedia mulai Paket Bisnis"
        text={d.projects.length ? 'Proyek yang sudah ada tetap bisa dibuka, tugasnya ditandai, dan proyeknya diselesaikan atau dibatalkan. Membuat & mengubah proyek butuh Paket Bisnis.'
          : 'Kelola setiap acara & pekerjaan klien sebagai proyek: klien, PIC, jadwal, milestone & rencana termin, tugas tiap anggota tim, lampiran, dan riwayat.'} />}

      {d.mine.length > 0 && <section className="panel" style={{ gap: 6 }}>
        <span className="label">Tugas saya ({d.mine.length})</span>
        <div className="list">{d.mine.slice(0, 8).map((t) => (
          <div className="li" key={t.id}>
            <div className="main"><b className="small">{t.title}</b>
              <span className="small muted"><Link href={`/proyek/${t.project_id}`}>{t.project}</Link>{t.due_date ? ` · tenggat ${tglShort(t.due_date)}` : ''}{t.late ? ' · ' : ''}{t.late && <span style={{ color: 'var(--bad)', fontWeight: 700 }}>terlambat</span>}</span></div>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>{t.priority === 'tinggi' && <Chip map={PRIO} v="tinggi" />}<button className="sm" onClick={() => toggle(t)}>{t.status === 'proses' ? 'Selesai ✓' : 'Mulai'}</button></div>
          </div>))}</div>
        {d.mine.length > 8 && <span className="small muted">… dan {d.mine.length - 8} tugas lain di halaman proyeknya.</span>}
      </section>}

      {d.projects.length > 0 && <div className="grid">
        <Tile label="Proyek berjalan" value={aktif.filter((p) => p.status === 'berjalan').length} sub={`${aktif.filter((p) => p.status === 'penawaran').length} masih penawaran`} />
        <Tile label="Mulai 7 hari ke depan" value={minggu} sub="sesuai tanggal mulai" />
        <Tile label="Tugas terlambat" value={telat} tone={telat ? 'bad' : ''} sub="lewat tenggat, belum selesai" />
        {nilai != null && <Tile label="Nilai kontrak berjalan" value={rp(nilai)} sub="rencana, belum masuk Pembukuan" />}
      </div>}

      {d.projects.length === 0 ? (
        <Empty title="Belum ada proyek" text={d.can_create ? 'Buat proyek untuk setiap acara atau pekerjaan klien. Semua jadwal, tahap, tugas tiap orang, dan dokumennya ada di satu tempat — tidak tercecer di chat.' : 'Belum ada proyek yang melibatkan Anda. Proyek akan muncul di sini saat Anda ditambahkan sebagai anggota atau diberi tugas.'}>
          {canNew && <button className="primary" onClick={() => setForm({})}>+ Buat proyek pertama</button>}
        </Empty>
      ) : <>
        <div className="seg">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({d.projects.filter((p) => tabOf(p.status) === k).length})</button>)}</div>
        <FilterToolbar q={q} onQ={setQ} placeholder="Cari nomor, nama, klien, lokasi…" active={kind ? 1 : 0}
          filters={<select aria-label="Jenis proyek" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Semua jenis</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} />
        {rows.length === 0 ? <Empty title="Tidak ada proyek" text="Coba ubah pencarian atau filter." art={false} /> :
          <DataTable rows={rows} caption="Daftar proyek" onRow={(p) => router.push(`/proyek/${p.id}`)} rowLabel={(p) => p.name}
            columns={[
              { key: 'name', label: 'Proyek', sort: (p) => p.name.toLowerCase(), main: true, render: (p) => <><b>{p.name}</b><div className="small muted">{p.number} · {KIND[p.kind]}{p.client ? ` · ${p.client}` : ''}</div></> },
              { key: 'date', label: 'Jadwal', sort: (p) => p.start_date || p.end_date || '9999', render: (p) => <span className="small">{jadwal(p)}</span> },
              { key: 'pic', label: 'PIC', hide: 'tablet', render: (p) => <span className="small">{p.manager || '—'}</span> },
              { key: 'prog', label: 'Progres', sort: (p) => p.progress ?? -1, render: (p) => <><Progress pct={p.progress} />{p.tasks_late > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{p.tasks_late} tugas terlambat</div>}</> },
              ...(d.fin ? [{ key: 'val', label: 'Nilai', align: 'right', hide: 'tablet', sort: (p) => Number(p.value || 0), render: (p) => (p.value != null ? rp(p.value) : <span className="muted">—</span>) }] : []),
              { key: 'st', label: 'Status', render: (p) => <Chip map={STATUS} v={p.status} /> },
            ]}
            card={(p) => <>
              <div className="dt-row"><b>{p.name}</b><Chip map={STATUS} v={p.status} /></div>
              <span className="small muted">{p.number} · {KIND[p.kind]}{p.client ? ` · ${p.client}` : ''}</span>
              <span className="small">{jadwal(p)}{p.manager ? ` · PIC ${p.manager}` : ''}</span>
              <Progress pct={p.progress} />
              {(() => {
                const bits = [
                  p.tasks_late > 0 && <span key="l" style={{ color: 'var(--bad)', fontWeight: 700 }}>{p.tasks_late} tugas terlambat</span>,
                  p.next_milestone && <span key="m">berikutnya: {p.next_milestone.name}{p.next_milestone.due_date ? ` (${tglShort(p.next_milestone.due_date)})` : ''}</span>,
                  d.fin && p.value != null && <span key="v">{rp(p.value)}</span>,
                ].filter(Boolean);
                return bits.length > 0 && <span className="small">{bits.flatMap((b, i) => (i ? [' · ', b] : [b]))}</span>;
              })()}
            </>} />}
      </>}
      <span className="small muted">Nilai kontrak & rencana termin di sini belum menjadi tagihan atau pendapatan di Pembukuan. Penagihan termin menyusul di tahap berikutnya.</span>
      {form && <ProjectForm kosId={kosId} init={form} fin={d.fin} onClose={() => setForm(null)} onDone={(id) => { setForm(null); if (id) router.push(`/proyek/${id}`); else load(); }} />}
    </div>
  );
}
