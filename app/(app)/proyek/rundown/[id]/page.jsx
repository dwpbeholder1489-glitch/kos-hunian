'use client';
// Dokumen rundown event: cetak / simpan PDF & bagikan ke tim lewat WA. Data dari prj_rundown (izin di server).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { logoUrl } from '@/lib/logo';
import { tglHari, durasiTeks } from '@/lib/event';

export default function DokumenRundown() {
  const { id } = useParams();
  const { ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [cols, setCols] = useState({ cue: true, alat: true });
  useEffect(() => {
    supabase.rpc('prj_rundown', { p_project: id }).then(({ data, error }) => (error ? (/tidak ditemukan/i.test(error.message) ? setD({ missing: true }) : setErr(errMsg(error))) : setD(data)));
  }, [id, ver]);
  if (err) return <div className="notice bad">{/prj_rundown|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (d.missing) return <Empty title="Rundown tidak ditemukan" />;
  const b = d.business || {};
  const p = d.project;
  const last = d.versions[0];
  const byDay = d.items.reduce((a, r) => ((a[r.day] = a[r.day] || []).push(r), a), {});
  const wa = `Rundown ${p.name}${last ? ` (versi ${last.version})` : ''}\n` + Object.entries(byDay).map(([day, rows]) => `\n${tglHari(day)}\n` +
    rows.map((r) => `${r.start_time}${r.end_time ? `–${r.end_time}` : ''}  ${r.title}${r.location ? ` @${r.location}` : ''}${r.pic ? ` (PIC ${r.pic})` : ''}`).join('\n')).join('\n');
  return (
    <div className="stack" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="row between noprint" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href={`/proyek/${p.id}?tab=rundown`}><button className="ghost">← Event</button></Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <a href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noreferrer"><button>Bagikan WA</button></a>
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>
      <div className="row noprint" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={cols.cue} onChange={(e) => setCols((c) => ({ ...c, cue: e.target.checked }))} />Kolom technical cue</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={cols.alat} onChange={(e) => setCols((c) => ({ ...c, alat: e.target.checked }))} />Kolom kebutuhan alat</label>
      </div>
      <p className="small muted noprint" style={{ margin: 0 }}>Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapat file PDF. Untuk kertas lebar, pilih orientasi Lanskap.</p>
      {d.changed && last && <div className="notice noprint">Ada perubahan sejak versi {last.version} yang belum disimpan sebagai versi. Dokumen ini menampilkan isi terbaru.</div>}

      <section className="panel gdoc" style={{ gap: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
            {logoUrl(b.logo) && <img src={logoUrl(b.logo)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
            <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b>
              {b.address && <div className="small muted">{b.address}</div>}
              {b.phone && <div className="small muted">WA {b.phone}</div>}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none', maxWidth: '50%' }}><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.02em' }}>RUNDOWN ACARA</div>
            <div className="small">{p.number}{last ? ` · versi ${last.version}` : ''}</div>
            {last && <div className="small muted">{tgl(last.at.slice(0, 10))}</div>}</div>
        </div>
        <dl className="kv small">
          <dt>Acara</dt><dd>{p.name}</dd>
          {p.client && <><dt>Klien</dt><dd>{p.client}</dd></>}
          <dt>Tanggal</dt><dd>{p.start_date ? tglHari(p.start_date) + (p.end_date && p.end_date !== p.start_date ? ` – ${tglHari(p.end_date)}` : '') : '—'}</dd>
          {p.location && <><dt>Lokasi</dt><dd>{p.location}</dd></>}
        </dl>
        {d.items.length === 0 ? <span className="small muted">Rundown masih kosong.</span> : Object.entries(byDay).map(([day, rows]) => (
          <div key={day} className="stack" style={{ gap: 6 }}>
            {Object.keys(byDay).length > 1 && <b className="small">{tglHari(day)}</b>}
            <div className="rd-scroll"><table className="gdoc-t rd-print">
              <thead><tr><th>Waktu</th><th>Kegiatan</th><th>Lokasi</th><th>PIC / pengisi</th>{cols.cue && <th>Technical cue</th>}{cols.alat && <th>Alat</th>}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}><b>{r.start_time}</b>{r.end_time ? `–${r.end_time}` : ''}{r.duration_min != null && <div className="small muted">{durasiTeks(r.duration_min)}</div>}</td>
                <td><b>{r.title}</b>{r.description && <div className="small">{r.description}</div>}{r.note && <div className="small muted">{r.note}</div>}</td>
                <td>{r.location || ''}</td>
                <td>{r.pic || ''}{r.performer && <div className="small muted">{r.performer}</div>}</td>
                {cols.cue && <td className="small">{r.cue || ''}</td>}
                {cols.alat && <td className="small">{r.equipment || ''}</td>}
              </tr>)}</tbody>
            </table></div>
          </div>))}
      </section>
    </div>
  );
}
