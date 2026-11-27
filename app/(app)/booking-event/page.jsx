'use client';
// Booking & Pesanan (workspace Event): alur pemesanan event sebelum & sesudah konfirmasi.
// TIDAK ada tabel booking terpisah — booking = event (Mesin Proyek) dengan status event otomatis dari data
// (Draft → Penawaran → Menunggu Konfirmasi → Terkonfirmasi) yang bisa diubah pemilik (prj_stage_set).
// Konfirmasi = prj_status 'berjalan' (tercatat confirmed_at). Formulir booking publik menyusul di Tahap D.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader, DataTable, FilterToolbar } from '@/components/Page';
import { useBaru } from '@/lib/useBaru';
import { Loading, Empty, Tile, run } from '@/components/ui';
import { rp, tglShort, errMsg } from '@/lib/format';
import { EV_ST } from '@/lib/event';
import { ProjectForm, jadwal } from '@/components/Proyek';

const GROUPS = [
  ['baru', 'Belum dikonfirmasi', (p) => ['draft', 'penawaran', 'menunggu'].includes(p.event_status)],
  ['ok', 'Terkonfirmasi', (p) => ['terkonfirmasi', 'persiapan', 'berlangsung'].includes(p.event_status)],
  ['tutup', 'Selesai / batal', (p) => ['selesai', 'dibatalkan'].includes(p.event_status)],
];
const EvChip = ({ s }) => { const x = EV_ST[s] || [s, 'void']; return <span className={'chip ' + x[1]}>{x[0]}</span>; };

export default function BookingEvent() {
  const { kosId, ver } = useKos();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [g, setG] = useState('baru');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const load = () => supabase.rpc('prj_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useBaru(() => setForm({ kind: 'event', status: 'penawaran' }));
  const rows = useMemo(() => {
    if (!d) return [];
    const f = GROUPS.find(([k]) => k === g)[2]; const s = q.trim().toLowerCase();
    return d.projects.filter((p) => f(p) && (!s || [p.number, p.name, p.client, p.location, p.category].some((x) => (x || '').toLowerCase().includes(s))));
  }, [d, g, q]);
  if (err) return <div className="notice bad">{/prj_list|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const canNew = d.can_create && d.allowed;
  const cnt = (k) => d.projects.filter(GROUPS.find(([x]) => x === k)[2]).length;
  const wait = d.projects.filter((p) => p.event_status === 'menunggu');
  const pipe = d.fin ? d.projects.filter(GROUPS[0][2]).reduce((a, p) => a + Number(p.value || 0), 0) : null;
  const confirm = async (p) => {
    if (!window.confirm(`Konfirmasi event "${p.name}"? Event masuk tahap Terkonfirmasi dan dihitung sebagai booking masuk.`)) return;
    if (await run(() => supabase.rpc('prj_status', { p_project: p.id, p_status: 'berjalan', p_note: null }), 'Event dikonfirmasi', errMsg)) load();
  };
  return (
    <div className="stack">
      <PageHeader title="Booking & Pesanan" help={<PageHelp page="booking-event" />} desc="Permintaan & pesanan event dari calon klien: dari draft, penawaran, sampai dikonfirmasi."
        actions={canNew && <button className="primary" onClick={() => setForm({ kind: 'event', status: 'penawaran' })}>+ Booking baru</button>} />
      <div className="grid">
        <Tile label="Belum dikonfirmasi" value={cnt('baru')} sub={pipe != null ? `nilai ${rp(pipe)}` : 'draft & penawaran'} />
        <Tile label="Menunggu jawaban klien" value={wait.length} sub="penawaran sudah dikirim" />
        <Tile label="Terkonfirmasi" value={cnt('ok')} sub="event yang akan/sedang berjalan" />
      </div>
      {d.projects.length === 0 ? <Empty title="Belum ada booking" text="Catat setiap permintaan event dari calon klien sebagai booking: tanggal, lokasi, jumlah peserta, dan perkiraan nilai. Setelah klien setuju, konfirmasi — event otomatis masuk kalender & jadwal tim.">
        {canNew && <button className="primary" onClick={() => setForm({ kind: 'event', status: 'penawaran' })}>+ Catat booking pertama</button>}</Empty> : <>
        <div className="seg">{GROUPS.map(([k, l]) => <button key={k} className={g === k ? 'on' : ''} onClick={() => setG(k)}>{l} ({cnt(k)})</button>)}</div>
        <FilterToolbar q={q} onQ={setQ} placeholder="Cari nama event, klien, lokasi, kategori…" />
        {rows.length === 0 ? <Empty title="Tidak ada" text={q ? 'Coba ubah pencarian.' : 'Tidak ada booking di kelompok ini.'} art={false} /> :
          <DataTable rows={rows} caption="Daftar booking event" onRow={(p) => router.push(`/proyek/${p.id}`)} rowLabel={(p) => p.name}
            columns={[
              { key: 'n', label: 'Event', main: true, sort: (p) => p.name.toLowerCase(), render: (p) => <><b>{p.name}</b><div className="small muted">{p.number}{p.category ? ` · ${p.category}` : ''}{p.client ? ` · ${p.client}` : ''}</div></> },
              { key: 'd', label: 'Tanggal acara', sort: (p) => p.start_date || '9999', render: (p) => <span className="small">{jadwal(p)}{p.location ? <div className="muted">{p.location}</div> : null}</span> },
              { key: 'g', label: 'Peserta', align: 'right', hide: 'tablet', sort: (p) => p.guests || 0, render: (p) => (p.guests ? p.guests.toLocaleString('id-ID') : <span className="muted">—</span>) },
              ...(d.fin ? [{ key: 'v', label: 'Nilai', align: 'right', sort: (p) => Number(p.value || 0), render: (p) => (p.value != null ? rp(p.value) : <span className="muted">—</span>) }] : []),
              { key: 's', label: 'Status', render: (p) => <EvChip s={p.event_status} /> },
              ...(canNew ? [{ key: 'a', label: '', render: (p) => (p.status === 'penawaran' ? <button className="sm" onClick={(e) => { e.stopPropagation(); confirm(p); }}>Konfirmasi</button> : null) }] : []),
            ]}
            card={(p) => <>
              <div className="dt-row"><b>{p.name}</b><EvChip s={p.event_status} /></div>
              <span className="small muted">{p.number}{p.category ? ` · ${p.category}` : ''}{p.client ? ` · ${p.client}` : ''}</span>
              <span className="small">{jadwal(p)}{p.location ? ` • ${p.location}` : ''}</span>
              {(p.guests || (d.fin && p.value != null)) && <span className="small">{[p.guests ? `${p.guests.toLocaleString('id-ID')} peserta` : null, d.fin && p.value != null ? rp(p.value) : null].filter(Boolean).join(' · ')}</span>}
              {canNew && p.status === 'penawaran' && <div className="row" style={{ gap: 6 }}>
                <button className="sm primary" onClick={(e) => { e.stopPropagation(); confirm(p); }}>Konfirmasi event</button>
                {d.lanjut && <Link href="/proyek?tab=penawaran" onClick={(e) => e.stopPropagation()}><button className="sm">Penawaran</button></Link>}
              </div>}
            </>} />}
      </>}
      <span className="small muted">Status booking otomatis: Draft (baru dicatat) → Penawaran (draf penawaran dibuat) → Menunggu Konfirmasi (penawaran dikirim) → Terkonfirmasi. Penawaran yang disetujui klien otomatis mengonfirmasi event. Status bisa diubah manual di halaman event.</span>
      {form && <ProjectForm kosId={kosId} init={form} fin={d.fin} onClose={() => setForm(null)} onDone={(id) => { setForm(null); if (id) router.push(`/proyek/${id}`); else load(); }} />}
    </div>
  );
}
