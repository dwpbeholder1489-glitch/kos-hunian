'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Page';
import { supabase } from '@/lib/supabase';
import { angka } from '@/lib/format';

const PAGE_SIZE = 10;

export function useStockMinus(kosId, version) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!kosId) return;
    const controller = new AbortController();
    supabase.rpc('retail_negative_stock', { p_kos: kosId }).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!controller.signal.aborted) setResult({ kosId, version, rows: error ? null : data, failed: Boolean(error) });
      }, () => {
        if (!controller.signal.aborted) setResult({ kosId, version, rows: null, failed: true });
      });
    return () => controller.abort();
  }, [kosId, version]);

  return result && result.kosId === kosId && result.version === version ? result : { rows: null, failed: false };
}

export function stockLocationHref(row) {
  return `/barang?barang=${encodeURIComponent(row.product_id)}&lokasi=${encodeURIComponent(row.branch_id)}`;
}

export default function StockMinusList({ rows = [], failed = false, canOpen = true, preview = false }) {
  const [page, setPage] = useState(1);
  if (failed) return <div className="notice bad" role="status">Peringatan stok minus per lokasi gagal dimuat.</div>;
  if (!rows.length) return null;

  const currentPage = Math.min(page, Math.ceil(rows.length / PAGE_SIZE));
  const displayed = preview ? rows.slice(0, 3) : rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <section className="stack" style={{ gap: 6 }} aria-label="Stok minus per lokasi">
    <h3 style={{ margin: 0 }}>Stok minus per lokasi ({angka(rows.length)})</h3>
    <div className="list">
      {displayed.map((row) => {
        const key = `${row.branch_id}:${row.product_id}`;
        const label = <span className="main">
          <b>{row.product_name}{row.product_active === false && <span className="small muted"> · Diarsipkan</span>}</b>
          <span className="small muted">{row.branch_name}{row.branch_active === false ? ' (nonaktif)' : ''} · total semua lokasi {angka(row.total_stock)} {row.unit}</span>
        </span>;
        const balance = <span className="chip bad" style={{ whiteSpace: 'nowrap' }}>{angka(row.qty)} {row.unit}</span>;
        return canOpen
          ? <Link key={key} className="li" style={{ textDecoration: 'none', color: 'inherit' }} href={stockLocationHref(row)}
              aria-label={`Buka kartu stok ${row.product_name} di ${row.branch_name}, minus ${angka(Math.abs(row.qty))} ${row.unit}`}>{label}{balance}<span aria-hidden="true">›</span></Link>
          : <div key={key} className="li">{label}{balance}</div>;
      })}
    </div>
    {preview && canOpen && rows.length > 3 && <Link href="/barang#stok-minus" className="small">Lihat semua stok minus →</Link>}
    {!preview && <Pagination page={currentPage} size={PAGE_SIZE} total={rows.length} onPage={setPage} />}
  </section>;
}
