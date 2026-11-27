'use client';
// Kalender event bulanan (Beranda Event & Jadwal & Tim). Data dari server (event_home.calendar): event yang
// berlangsung di bulan itu, termasuk acara beberapa hari. Ketuk tanggal = daftar event hari itu.
import Link from 'next/link';
import { EV_ST, addDays, bulanTahun, tglHari } from '@/lib/event';

const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

// Daftar tanggal (Senin pertama sebelum tgl 1 s.d. Minggu terakhir) untuk bulan m (YYYY-MM-01)
export function monthGrid(m) {
  const first = new Date(m + 'T12:00:00Z');
  const lead = (first.getUTCDay() + 6) % 7;            // Senin = 0
  const start = addDays(m, -lead);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  const days = [];
  for (let d = start; d <= last || days.length % 7; d = addDays(d, 1)) days.push(d);
  return days;
}
export const eventsOn = (events, day) => (events || []).filter((e) => e.start_date <= day && (e.end_date || e.start_date) >= day);

export default function EventCal({ month, today, events, sel, onSel, onMonth, link = true }) {
  const days = monthGrid(month);
  const ym = month.slice(0, 7);
  const list = sel ? eventsOn(events, sel) : [];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="ev-cal-h">
        <button type="button" aria-label="Bulan sebelumnya" onClick={() => onMonth(-1)}>‹</button>
        <b>{bulanTahun(month)}</b>
        <button type="button" aria-label="Bulan berikutnya" onClick={() => onMonth(1)}>›</button>
      </div>
      <div className="ev-cal" role="grid" aria-label={`Kalender ${bulanTahun(month)}`}>
        {HARI.map((h) => <span key={h} role="columnheader">{h}</span>)}
        {days.map((d) => {
          const n = eventsOn(events, d).length;
          const cls = [d.slice(0, 7) !== ym && 'out', d === today && 'today', d === sel && 'sel'].filter(Boolean).join(' ');
          return <button type="button" key={d} className={cls} onClick={() => onSel(d === sel ? null : d)}
            aria-label={`${tglHari(d)}${n ? `, ${n} event` : ''}`} aria-pressed={d === sel}>{Number(d.slice(8))}{n > 0 && <i aria-hidden="true" />}</button>;
        })}
      </div>
      {sel && <div className="ev-day">
        <span className="small muted">{tglHari(sel)}</span>
        {list.length === 0 ? <span className="small muted">Tidak ada event di tanggal ini.</span>
          : list.map((e) => { const s = EV_ST[e.event_status] || [e.event_status, 'void'];
            return link ? <Link key={e.id} href={`/proyek/${e.id}`}><b>{e.name}</b><span className={'chip ' + s[1]}>{s[0]}</span></Link>
              : <div key={e.id} className="row between"><b className="small">{e.name}</b><span className={'chip ' + s[1]}>{s[0]}</span></div>; })}
      </div>}
    </div>
  );
}
