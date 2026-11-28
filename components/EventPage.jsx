'use client';
// Kerangka halaman bisnis Event bergaya Toko & Ritel: hero hijau + ilustrasi 3D Event, tombol aksi, kartu metrik berwarna.
// Ilustrasi: public/event/{maskot,kegiatan,booking,jadwal,vendor}.webp (sumber gambar: scripts/event-art/gen.py).
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import styles from './EventPage.module.css';

export const evStyles = styles;

export function EventHero({ title, desc, art, help, children }) {
  return (
    <section className={styles.hero}>
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
        {help}
        {children && <div className={styles.heroExtra}>{children}</div>}
      </div>
      {art && <span className={styles.heroArt}><img src={`/event/${art}.webp`} alt="" /></span>}
    </section>
  );
}

// items: [{ key, label, icon, href | onClick, primary, note }] — item falsy dilewati
export function EventActions({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={styles.actions} style={{ '--n': Math.min(list.length, 4) }}>
      {list.map((a) => {
        const inner = <><NavIcon name={a.icon} />{a.label}{a.note && <small>{a.note}</small>}</>;
        return a.href ? <Link key={a.key} href={a.href} className={a.primary ? styles.primary : undefined}>{inner}</Link>
          : <button key={a.key} type="button" className={a.primary ? styles.primary : undefined} onClick={a.onClick}>{inner}</button>;
      })}
    </div>
  );
}

// items: [{ key, tone: green|blue|gold|red, icon, label, value, caption, trend: {dir, txt} , href }]
export function EventMetrics({ items, label = 'Ringkasan' }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <section className={styles.metrics} aria-label={label}>
      {list.map((m) => {
        const body = <>
          <span className={styles.metricIcon}>{typeof m.icon === 'string' ? <NavIcon name={m.icon} /> : m.icon}</span>
          <div>
            <span>{m.label}</span><strong>{m.value}</strong>
            {m.trend ? <small data-trend={m.trend.dir > 0 ? 'up' : m.trend.dir < 0 ? 'down' : undefined}>
              {m.trend.dir !== 0 && <span aria-hidden="true">{m.trend.dir > 0 ? '▲ ' : '▼ '}</span>}{m.trend.txt}{m.caption ? ` ${m.caption}` : ''}
            </small> : m.caption && <small>{m.caption}</small>}
          </div>
        </>;
        return m.href ? <Link key={m.key} href={m.href} className={styles.metric} data-tone={m.tone}>{body}</Link>
          : <article key={m.key} className={styles.metric} data-tone={m.tone}>{body}</article>;
      })}
    </section>
  );
}
