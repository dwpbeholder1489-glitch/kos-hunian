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
import { QuoteForm, qStatus } from '@/components/Penawaran';

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
  const [view, setView] = useState('proyek');   // proyek | penawaran
  const [qform, setQform] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'penawaran') setView('penawaran'); } catch {} }, []);
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
      <PageHeader title="Proyek" help={<PageHelp page="proyek" />} actions={view === 'penawaran'
        ? d.allowed && <button className="primary" onClick={() => setQform(true)}>+ Penawaran baru</button>
        : canNew && <button className="primary" onClick={() => setForm({})}>+ Proyek baru</button>} />
      {!d.allowed && <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} event="PROJECT.REQUESTED" title="Proyek tersedia mulai Paket Bisnis"
        text={d.projects.length ? 'Proyek yang sudah ada tetap bisa dibuka, tugasnya ditandai, dan proyeknya diselesaikan atau dibatalkan. Membuat & mengubah proyek butuh Paket Bisnis.'
          : 'Kelola setiap acara & pekerjaan klien sebagai proyek: klien, PIC, jadwal, milestone & rencana termin, tugas tiap anggota tim, lampiran, dan riwayat.'} />}
      {d.can_quote && <div className="seg">{[['proyek', 'Proyek'], ['penawaran', `Penawaran${d.quotes_open ? ` (${d.quotes_open} berjalan)` : ''}`]].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>}
      {view === 'penawaran' ? <QuoteTab kosId={kosId} ver={ver} onNew={() => setQform(true)} allowed={d.allowed} /> : <>

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
      </>}
      {qform && <QuoteForm kosId={kosId} init={{ kind: 'awal' }} onClose={() => setQform(false)} onDone={(id) => { setQform(false); if (id) router.push(`/proyek/penawaran/${id}`); }} />}
      {form && <ProjectForm kosId={kosId} init={form} fin={d.fin} onClose={() => setForm(null)} onDone={(id) => { setForm(null); if (id) router.push(`/proyek/${id}`); else load(); }} />}
    </div>
  );
}

// Tab Penawaran: semua penawaran & perubahan scope (pemilik, pengelola, keuangan)
function QuoteTab({ kosId, ver, onNew, allowed }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('buka');
  useEffect(() => { supabase.rpc('prj_quote_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data))); }, [kosId, ver]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  const groups = { buka: (x) => ['draf', 'terkirim'].includes(x.status), setuju: (x) => x.status === 'disetujui', tutup: (x) => ['ditolak', 'batal'].includes(x.status) };
  const rows = d.quotes.filter(groups[f]);
  const nilai = d.quotes.filter(groups.buka).reduce((a, x) => a + Number(x.total), 0);
  return <>
    {d.quotes.length === 0 ? <Empty title="Belum ada penawaran" text="Buat penawaran berisi rincian pekerjaan, harga, termin pembayaran, batas revisi, dan apa yang termasuk/tidak termasuk. Saat klien setuju, proyeknya dibuat otomatis.">
      {allowed && <button className="primary" onClick={onNew}>+ Buat penawaran pertama</button>}</Empty> : <>
      <div className="grid">
        <Tile label="Penawaran berjalan" value={d.quotes.filter(groups.buka).length} sub={`nilai ${rp(nilai)}`} />
        <Tile label="Disetujui" value={d.quotes.filter(groups.setuju).length} sub="sudah menjadi proyek / perubahan" />
        <Tile label="Lewat masa berlaku" value={d.quotes.filter((x) => x.expired).length} tone={d.quotes.some((x) => x.expired) ? 'bad' : ''} sub="belum diputuskan klien" />
      </div>
      <div className="seg">{[['buka', 'Berjalan'], ['setuju', 'Disetujui'], ['tutup', 'Ditolak / batal']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l} ({d.quotes.filter(groups[k]).length})</button>)}</div>
      {rows.length === 0 ? <Empty title="Tidak ada" art={false} /> :
        <DataTable rows={rows} caption="Daftar penawaran" onRow={(x) => router.push(`/proyek/penawaran/${x.id}`)} rowLabel={(x) => x.title}
          columns={[
            { key: 't', label: 'Penawaran', main: true, sort: (x) => x.title.toLowerCase(), render: (x) => <><b>{x.title}</b><div className="small muted">{x.number}{x.kind === 'perubahan' ? ' · perubahan scope' : ''}{x.client ? ` · ${x.client}` : ''}</div></> },
            { key: 'd', label: 'Tanggal', hide: 'tablet', sort: (x) => x.quote_date, render: (x) => <span className="small">{tglShort(x.quote_date)}{x.valid_until ? ` · s.d. ${tglShort(x.valid_until)}` : ''}</span> },
            { key: 'v', label: 'Nilai', align: 'right', sort: (x) => Number(x.total), render: (x) => rp(x.total) },
            { key: 's', label: 'Status', render: (x) => { const s = qStatus(x); return <span className={'chip ' + s[1]}>{s[0]}{x.revision ? ` · rev ${x.revision}` : ''}</span>; } },
          ]}
          card={(x) => { const s = qStatus(x); return <>
            <div className="dt-row"><b>{x.title}</b><span className={'chip ' + s[1]}>{s[0]}</span></div>
            <span className="small muted">{x.number}{x.revision ? ` · revisi ${x.revision}` : ''}{x.kind === 'perubahan' ? ' · perubahan scope' : ''}{x.client ? ` · ${x.client}` : ''}</span>
            <span className="small"><b>{rp(x.total)}</b>{x.valid_until ? ` · berlaku s.d. ${tglShort(x.valid_until)}` : ''}{x.project ? ` · ${x.project}` : ''}</span>
          </>; }} />}
    </>}
  </>;
}
