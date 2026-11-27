'use client';
// Komponen halaman bersama (Unified Design System §9–11): PageHeader, FilterToolbar, DataTable responsif, Pagination.
// Hanya mengubah CARA MENAMPILKAN — data, izin, dan aksi tetap dari halaman pemanggil.
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sheet } from '@/components/ui';
import { subOf } from '@/lib/menu';

export function useMedia(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f));
  }, [q]);
  return m;
}

// Kepala halaman standar: judul, tombol panduan, deskripsi singkat, aksi utama & sekunder.
// Deskripsi bawaan diambil dari daftar menu (lib/menu.js SUB) bila tidak diisi; desc={false} = tanpa deskripsi.
export function PageHeader({ title, help, desc, actions }) {
  const path = usePathname();
  const d = desc === false ? null : desc || subOf(path);
  return (
    <header className="pg-h">
      <div className="pg-ht">
        <div className="pg-tt"><h2>{title}</h2>{help}</div>
        {d && <p className="pg-desc">{d}</p>}
      </div>
      {actions && <div className="pg-act">{actions}</div>}
    </header>
  );
}

// Baris pencarian + filter. Laptop/tablet: satu baris. HP: kotak cari + tombol "Filter" (lembar bawah) bila ada filter.
export function FilterToolbar({ q, onQ, placeholder = 'Cari…', filters, active = 0, right }) {
  const wide = useMedia('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const search = onQ && (
    <label className="ftb-search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
  return (
    <div className="ftb" role="search">
      {search}
      {filters && (wide ? <div className="ftb-f">{filters}</div> : (
        <button type="button" className="ftb-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filter{active > 0 && <span className="ftb-n">{active}</span>}
        </button>
      ))}
      {right && <div className="ftb-r">{right}</div>}
      {open && <Sheet title="Filter" onClose={() => setOpen(false)}><div className="stack" style={{ gap: 12 }}>{filters}</div><button className="primary" onClick={() => setOpen(false)}>Tampilkan hasil</button></Sheet>}
    </div>
  );
}

export function Pagination({ page, size, total, onPage, onSize, sizes = [10, 25, 50, 100] }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages === 1 && total <= 25) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav className="pager" aria-label="Halaman data">
      <span className="pager-info">{from}–{to} dari {total.toLocaleString('id-ID')}</span>
      {onSize && <label className="pager-size">Per halaman<select value={size} onChange={(e) => onSize(Number(e.target.value))}>{sizes.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>}
      <div className="pager-nav">
        <button type="button" className="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">‹</button>
        <span className="pager-n" aria-live="polite">{page} / {pages}</span>
        <button type="button" className="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">›</button>
      </div>
    </nav>
  );
}

// Tabel responsif: ≥1024 tabel lengkap; 768–1023 kolom `hide="tablet"` disembunyikan; <768 kartu.
// columns: [{ key, label, render(row), sort(row) → nilai, align: 'right', hide: 'tablet', main: true (judul kartu), card: false }]
// card(row) opsional = isi kartu HP buatan halaman (bila tidak ada: kolom `main` jadi judul, sisanya label: nilai).
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRow, rowLabel, card, caption, pageSize = 25, initialSort, rowClass, layout }) {
  const desk = useMedia('(min-width: 1024px)');
  const wide = useMedia('(min-width: 768px)');
  const [sort, setSort] = useState(initialSort || null); // { key, dir: 1|-1 }
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  useEffect(() => { setPage(1); }, [rows.length, size]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    return [...rows].sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (x == null ? -1 : y == null ? 1 : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id')) * sort.dir;
    });
  }, [rows, sort, columns]);
  const pg = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const view = sorted.slice((pg - 1) * size, pg * size);
  const cols = columns.filter((c) => !(c.hide === 'tablet' && !desk));
  const toggle = (c) => c.sort && setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 });
  const key = (e, r) => { if (onRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRow(r); } };

  return (
    <div className="dt-wrap">
      {wide && layout !== 'grid' ? (
        <div className="dt-scroll">
          <table className={'dt' + (onRow ? ' dt-click' : '')}>
            {caption && <caption className="vh">{caption}</caption>}
            <thead><tr>{cols.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'n' : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sort ? <button type="button" className="dt-sort" onClick={() => toggle(c)}>{c.label}<span aria-hidden="true">{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</span></button> : c.label}
              </th>
            ))}</tr></thead>
            <tbody>{view.map((r) => (
              <tr key={rowKey(r)} className={rowClass?.(r)} onClick={onRow ? () => onRow(r) : undefined} onKeyDown={(e) => key(e, r)} tabIndex={onRow ? 0 : undefined} aria-label={onRow && rowLabel ? rowLabel(r) : undefined}>
                {cols.map((c) => <td key={c.key} className={c.align === 'right' ? 'n' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <ul className="dt-cards" aria-label={caption}>{view.map((r) => {
          const body = card ? card(r) : <>
            {columns.filter((c) => c.main).map((c) => <b key={c.key} className="dt-ct">{c.render ? c.render(r) : r[c.key]}</b>)}
            <dl className="dt-kv">{columns.filter((c) => !c.main && c.card !== false).map((c) => <div key={c.key}><dt>{c.label}</dt><dd>{c.render ? c.render(r) : r[c.key]}</dd></div>)}</dl>
          </>;
          return <li key={rowKey(r)} className={rowClass?.(r)}>{onRow ? <button type="button" className="dt-card" onClick={() => onRow(r)} aria-label={rowLabel?.(r)}>{body}</button> : <div className="dt-card">{body}</div>}</li>;
        })}</ul>
      )}
      <Pagination page={pg} size={size} total={rows.length} onPage={setPage} onSize={setSize} />
    </div>
  );
}
