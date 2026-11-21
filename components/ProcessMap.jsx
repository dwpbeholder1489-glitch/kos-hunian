'use client';
// Peta proses bisnis (Business Process Recognition): langkah & statusnya dihitung server (process_map) dari data nyata 90 hari.
import Link from 'next/link';
import { STEP_STATE } from '@/lib/workflow';

export default function ProcessMap({ data, compact = false }) {
  if (!data?.length) return <span className="small muted">Belum ada alur yang dikenali untuk jenis bisnis ini.</span>;
  return (
    <div className="stack">
      {data.map((p) => (
        <section key={p.code} className={compact ? 'pmap compact' : 'panel pmap'}>
          <div className="pmap-h">
            <span className="t"><b>{p.name}</b>{!compact && p.description && <small className="muted">{p.description}</small>}</span>
            <span className="small"><b>{p.done}</b> dari {p.total} langkah berjalan</span>
          </div>
          <div className="pmap-bar" aria-hidden="true"><i style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} /></div>
          {compact ? <ol className="pmap-mini">
            {p.steps.map((s) => <li key={s.key} className={s.state} title={(STEP_STATE[s.state] || [s.state])[0]}>{s.name}</li>)}
          </ol> : <ol className="pmap-steps">
            {p.steps.map((s) => {
              const st = STEP_STATE[s.state] || [s.state, 'void'];
              return (
                <li key={s.key} className={'pmap-step ' + s.state}>
                  <Link href={s.path || '#'} className="pmap-link">
                    <span className="nm">{s.name}{s.optional ? <small className="muted"> (opsional)</small> : null}</span>
                    <span className="meta"><span className={'chip ' + st[1]}>{st[0]}</span>{s.count > 0 && <small className="muted">{s.count} · 90 hari</small>}</span>
                  </Link>
                </li>
              );
            })}
          </ol>}
        </section>
      ))}
    </div>
  );
}
