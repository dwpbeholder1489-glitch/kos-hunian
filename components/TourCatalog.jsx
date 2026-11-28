'use client';
// Katalog tur panduan: ulangi onboarding & buka tur "? Panduan" tiap modul yang BOLEH dibuka peran ini.
// Dipakai di Panduan & Bantuan dan Learning Center › Memulai. Tidak menyentuh data bisnis.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import { useInteractiveGuide } from '@/components/InteractiveGuide';
import { pathAllowed, tabsFor } from '@/lib/business';
import { helpFor } from '@/lib/learning';
import { actionLabel, TOUR_LABEL, tourKey, tourSummary } from '@/lib/tour';

export function tourModules(kos) {
  if (!kos) return [];
  const seen = new Set();
  return tabsFor(kos).filter(([href]) => href !== '/bantuan' && href !== '/bisnis' && pathAllowed(kos, href) && tourKey(href) && !seen.has(href) && seen.add(href))
    .map(([href, name]) => ({ href, name, key: tourKey(href), first: helpFor(href, name).steps[0] }));
}

export default function TourCatalog({ kos, compact = false }) {
  const guide = useInteractiveGuide();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const modules = useMemo(() => tourModules(kos), [kos]);
  if (!guide || guide.customer) return null;
  const record = guide.record || {};
  const sum = tourSummary(record, ['onboarding', ...modules.map((m) => m.key)]);
  const list = modules.filter((m) => filter === 'all' || record[m.key]?.status !== 'completed');
  const ob = record.onboarding?.status;

  async function resetAll() {
    if (!window.confirm('Atur ulang progres semua panduan untuk bisnis & peran ini? Data bisnis tidak berubah.')) return;
    setBusy(true);
    const ok = await guide.reset(null);
    setBusy(false);
    setMsg(ok ? 'Progres panduan diatur ulang.' : 'Progres di perangkat ini diatur ulang. Server belum tersambung — coba lagi nanti.');
  }

  return <section className="panel" aria-labelledby="tour-cat-h" data-guide-tours>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
      <h3 id="tour-cat-h" style={{ margin: 0 }}>Tur panduan interaktif</h3>
      <span className="small muted">{sum.done} dari {sum.total} selesai</span>
    </div>
    <progress value={sum.done} max={Math.max(1, sum.total)} style={{ width: '100%', height: 6 }} aria-label={`${sum.done} dari ${sum.total} tur selesai`} />
    <p className="small muted" style={{ margin: 0 }}>Sorotan langkah demi langkah langsung di layar aplikasi, sesuai jenis bisnis, perangkat, dan peran Anda. Bisa dijeda, dilewati, dan diulang — tidak mengubah data bisnis.</p>
    {guide.syncError && <p className="small muted" role="status" style={{ margin: 0 }}>Progres tersimpan di perangkat ini; sinkron ke akun akan dicoba lagi saat tersambung.</p>}

    <div className="li" style={{ alignItems: 'center', gap: 10 }}>
      <NavIcon name="play" size={20} />
      <div style={{ flex: 1, minWidth: 0 }}><b>Panduan awal PRASARA</b><div className="small muted">Bisnis aktif, menu, tombol (+), pencarian, notifikasi, dan ? Panduan. {ob ? `· ${TOUR_LABEL[ob]}` : ''}</div></div>
      <button type="button" className="sm primary" onClick={() => guide.start('onboarding')}>{actionLabel(ob)}</button>
      {(ob === 'paused' || ob === 'active') && <button type="button" className="sm ghost" onClick={() => guide.start('onboarding', { restart: true })}>Dari awal</button>}
    </div>

    {!compact && <div className="seg" role="group" aria-label="Saring tur">
      <button type="button" className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Semua modul</button>
      <button type="button" className={filter === 'todo' ? 'on' : ''} aria-pressed={filter === 'todo'} onClick={() => setFilter('todo')}>Belum selesai</button>
    </div>}
    <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {(compact ? list.slice(0, 6) : list).map((m) => {
        const st = record[m.key]?.status;
        return <li key={m.href} className="li" style={{ alignItems: 'center', gap: 10 }}>
          <NavIcon name={m.href} size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{m.name}</b>
            <div className="small muted" style={{ overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{st ? TOUR_LABEL[st] + (st === 'paused' || st === 'active' ? ` · langkah ${(record[m.key].index || 0) + 1}` : '') : m.first}</div>
          </div>
          <Link className="nt-btn sm" href={`${m.href}?tur=1`} aria-label={`${actionLabel(st)} panduan ${m.name}`}>{actionLabel(st)}</Link>
        </li>;
      })}
      {!list.length && <li className="small muted">Semua tur modul sudah selesai. Pilih "Semua modul" untuk mengulang.</li>}
    </ul>
    {compact && list.length > 6 && <Link href="/bantuan#tur" className="small">Lihat semua {list.length} tur modul →</Link>}
    {!compact && <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      <button type="button" className="ghost sm" onClick={resetAll} disabled={busy}>Atur ulang progres panduan</button>
      {msg && <span className="small muted" role="status">{msg}</span>}
    </div>}
  </section>;
}
