'use client';
// Pusat Pengalaman › Kinerja (Adaptive Experience Fase 7, §28). Angka dari exp_performance (server):
// menu yang dibuka, aksi cepat yang diketuk, fitur aktif yang jarang dipakai, dan hasil rekomendasi.
// Hanya jumlah & banyaknya orang — tidak ada rincian per karyawan dan tidak ada isi transaksi.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loading } from '@/components/ui';
import { errMsg, tgl } from '@/lib/format';
import { RECO_STATUS } from '@/lib/dna';
import { quickCatalog, quickFor } from '@/lib/quick';
import { tabsFor } from '@/lib/business';

const PERIODS = [[7, '7 hari'], [30, '30 hari'], [90, '90 hari']];
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
const pct = (a, b) => (Number(b) > 0 ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '—');
const MIN_DAYS = 14; // daftar "jarang dipakai" baru adil setelah cukup data

export default function KinerjaPengalaman({ kos, kosId, onTab }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setD(null); setErr(null);
    supabase.rpc('exp_performance', { p_kos: kosId, p_days: days }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, days]);

  const seg = (
    <div className="seg" role="tablist" aria-label="Periode">
      {PERIODS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={days === k} className={days === k ? 'on' : ''} onClick={() => setDays(k)}>{l}</button>)}
    </div>
  );
  if (err) return <div className="stack">{seg}<div className="notice bad">{err}</div></div>;
  if (!d) return <div className="stack">{seg}<Loading /></div>;

  const tabs = tabsFor(kos);
  const menuLabel = (p) => tabs.find(([h]) => h.split('?')[0] === p)?.[1] || p;
  const cat = quickCatalog(kos);
  const aksiLabel = (id) => cat.find((a) => a.id === id)?.label || id;
  const used = new Map((d.aksi || []).map((a) => [a.id, a]));
  const shownQuick = quickFor(kos);
  const neverQuick = shownQuick.filter((a) => !used.has(a.id));
  const since = d.since ? Math.floor((Date.now() - new Date(d.since + 'T00:00:00+07:00').getTime()) / 86400000) + 1 : 0;
  const enough = since >= MIN_DAYS;
  const idle = (d.modules || []).filter((m) => m.idle);
  const r = d.recos || {};
  const wf = d.workflow_recos || {};

  return (
    <div className="stack">
      {seg}
      <div className="notice small">
        {d.since ? <>Data mulai dicatat <b>{tgl(d.since)}</b>{since < days ? ` (baru ${since} hari — angka periode ini belum penuh)` : ''}.</> : <>Belum ada data. Pemakaian mulai dicatat sejak fitur ini aktif.</>}
        {' '}Yang dicatat hanya <b>jumlah</b> menu dibuka & aksi cepat diketuk — tanpa isi transaksi, dan tidak ditampilkan per karyawan.
      </div>

      <section className="panel">
        <h3>Ringkasan {days} hari</h3>
        <div className="bec-kpi">
          <div><span className="label">Orang memakai</span><b>{angka(d.people.aktif)} / {angka(d.people.anggota)}</b></div>
          <div><span className="label">Hari dipakai</span><b>{angka(d.total.hari)}</b></div>
          <div><span className="label">Menu dibuka</span><b>{angka(d.total.menu)}</b></div>
          <div><span className="label">Aksi cepat</span><b>{angka(d.total.aksi)}</b></div>
        </div>
      </section>

      <section className="panel">
        <h3>Menu paling sering dibuka</h3>
        {(d.menus || []).length === 0 ? <span className="small muted">Belum ada data di periode ini.</span> : (
          <div className="list">{d.menus.map((m) => (
            <div className="li" key={m.path}>
              <span className="small" style={{ overflowWrap: 'anywhere' }}>{menuLabel(m.path)}<span className="muted"> · {m.users} orang · {m.days} hari</span></span>
              <b className="small">{angka(m.n)}×</b>
            </div>
          ))}</div>
        )}
      </section>

      <section className="panel">
        <h3>Aksi cepat (tombol +)</h3>
        {(d.aksi || []).length === 0 ? <span className="small muted">Belum ada aksi cepat yang diketuk di periode ini.</span> : (
          <div className="list">{d.aksi.slice(0, 12).map((a) => (
            <div className="li" key={a.id}><span className="small" style={{ overflowWrap: 'anywhere' }}>{aksiLabel(a.id)}<span className="muted"> · {a.users} orang</span></span><b className="small">{angka(a.n)}×</b></div>
          ))}</div>
        )}
        {enough && neverQuick.length > 0 && <>
          <span className="small"><b>Belum pernah diketuk:</b> {neverQuick.map((a) => a.label).join(', ')}.</span>
          <span className="small muted">Bila memang tidak dipakai, sembunyikan agar tombol (+) lebih ringkas.</span>
          {onTab && <div className="row"><button className="sm" onClick={() => onTab('aksi')}>Atur aksi cepat</button></div>}
        </>}
        <span className="small muted">Urutan tombol (+) yang belum Anda atur mengikuti aksi yang paling sering Anda pakai, dari semua perangkat Anda.</span>
      </section>

      <section className="panel">
        <h3>Fitur aktif yang jarang dipakai</h3>
        {!enough ? <span className="small muted">Daftar ini muncul setelah minimal {MIN_DAYS} hari data, agar tidak menyesatkan.</span>
          : idle.length === 0 ? <span className="small muted">Semua fitur aktif dibuka setidaknya sekali dalam {days} hari.</span> : <>
            <div className="list">{idle.map((m) => (
              <div className="li" key={m.code}><span className="small" style={{ overflowWrap: 'anywhere' }}>{m.name}</span>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{m.last ? `terakhir ${tgl(m.last)}` : 'belum pernah dibuka'}</span></div>
            ))}</div>
            <span className="small muted">Bukan berarti harus dimatikan — sebagian fitur memang jarang dibuka (mis. dipakai akhir bulan). Menonaktifkan tidak menghapus data.</span>
            {onTab && <div className="row"><button className="sm" onClick={() => onTab('fitur')}>Buka Fitur saya</button></div>}
          </>}
      </section>

      <section className="panel">
        <h3>Hasil rekomendasi</h3>
        <div className="bec-kpi">
          <div><span className="label">Diputuskan</span><b>{angka(r.decided)}</b></div>
          <div><span className="label">Diterima</span><b>{angka(r.taken)} <small className="muted">{pct(r.taken, r.decided)}</small></b></div>
          <div><span className="label">Lalu dipakai</span><b>{angka(r.adopted)} <small className="muted">{pct(r.adopted, r.taken)}</small></b></div>
          <div><span className="label">Saran alur diterima</span><b>{angka(wf.diterima)} / {angka((wf.diterima || 0) + (wf.ditolak || 0) + (wf.ditunda || 0))}</b></div>
        </div>
        {(r.items || []).length > 0 && <div className="list">{r.items.map((it, i) => (
          <div className="li" key={i}>
            <span className="small" style={{ overflowWrap: 'anywhere' }}>{it.name}<span className="muted"> · {tgl(String(it.at).slice(0, 10))}</span>
              {['accepted', 'activated'].includes(it.status) && <span className="muted"> · {it.adopted ? 'sudah dipakai' : 'belum dibuka'}</span>}</span>
            <span className={'chip ' + (RECO_STATUS[it.status]?.[1] || 'void')}>{RECO_STATUS[it.status]?.[0] || it.status}</span>
          </div>
        ))}</div>}
        <span className="small muted">"Lalu dipakai" = menu fitur itu dibuka setelah saran diterima. Saran yang ditandai otomatis oleh sistem (fitur sudah aktif) tidak dihitung.</span>
      </section>

      <section className="panel">
        <h3>Perubahan tampilan</h3>
        <div className="list">
          <div className="li"><span className="small">Profil & tampilan diubah</span><b className="small">{angka(d.config?.ubah)}×</b></div>
          <div className="li"><span className="small">Kembali ke rekomendasi PRASARA</span><b className="small">{angka(d.config?.reset)}×</b></div>
          <div className="li"><span className="small">Dipulihkan dari riwayat</span><b className="small">{angka(d.config?.pulihkan)}×</b></div>
        </div>
        {Number(d.config?.reset || 0) + Number(d.config?.pulihkan || 0) >= 2 && <span className="small muted">Tampilan beberapa kali dikembalikan — mungkin ada menu yang terasa kurang pas. Ceritakan lewat Bantuan agar kami perbaiki.</span>}
      </section>
    </div>
  );
}
