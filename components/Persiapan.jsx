'use client';
// Checklist persiapan setelah bisnis aktif. Status tiap butir dihitung server dari data nyata (setup_checklist);
// butir bisa dilewati sementara, dan seluruh kartu bisa disembunyikan (tersimpan di server, berlaku di semua perangkat).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function Persiapan({ kos, always = false }) {
  const [d, setD] = useState(null);
  const load = () => supabase.rpc('setup_checklist', { p_kos: kos.id }).then(({ data, error }) => setD(error ? null : data));
  useEffect(() => { setD(null); load(); }, [kos.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || !d.active || !Array.isArray(d.items)) return null;
  const todo = d.items.filter((x) => !x.done && !x.skipped && !x.optional);
  if (!always && (d.hidden || todo.length === 0)) return null;
  const doneN = d.items.filter((x) => x.done).length;
  const skip = async (code, on) => { await supabase.rpc('setup_checklist_skip', { p_kos: kos.id, p_code: code, p_skip: on }); load(); };
  return (
    <section className="panel prep" aria-label="Persiapan bisnis">
      <div className="row between"><h3 style={{ margin: 0 }}>Persiapan bisnis</h3><span className="chip">{doneN} dari {d.items.length} selesai</span></div>
      <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round((100 * doneN) / d.items.length)}%` }} /></div>
      <div className="list">
        {d.items.map((x) => (
          <div className="li" key={x.code}>
            <span className={'dot' + (x.done ? ' ok' : '')} aria-hidden="true">{x.done ? '✓' : ''}</span>
            <div className="main">
              <b className="small" style={x.done ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>{x.label}{x.optional && <span className="tag3">Opsional</span>}</b>
              {!x.done && <span className="small muted">{x.skipped ? 'Dilewati sementara' : x.hint}</span>}
            </div>
            {!x.done && (x.skipped
              ? <button className="sm ghost" onClick={() => skip(x.code, false)}>Buka lagi</button>
              : <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Link href={x.href} className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Kerjakan →</Link><button className="sm ghost" onClick={() => skip(x.code, true)} aria-label={`Lewati dulu: ${x.label}`}>Nanti</button></span>)}
          </div>
        ))}
      </div>
      {!always && <button className="sm ghost" onClick={() => skip('semua', true)}>Sembunyikan daftar ini</button>}
      {always && d.hidden && <button className="sm" onClick={() => skip('semua', false)}>Tampilkan lagi di Beranda</button>}
      <span className="small muted">Tidak ada yang mengunci aplikasi: semua bisa dikerjakan kapan saja. Daftar ini juga ada di Pusat Konfirmasi.</span>
    </section>
  );
}
