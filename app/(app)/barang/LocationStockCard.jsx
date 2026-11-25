'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sheet } from '@/components/ui';
import { angka, errMsg, tgl } from '@/lib/format';
import { MOVE } from '@/lib/retail';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
const jakartaDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });

export default function LocationStockCard({ kosId, version }) {
  const params = useSearchParams();
  const router = useRouter();
  const productId = params.get('barang');
  const branchId = params.get('lokasi');
  if (!UUID.test(productId || '') || !UUID.test(branchId || '')) return null;

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete('barang');
    next.delete('lokasi');
    router.replace(next.size ? `/barang?${next.toString()}` : '/barang', { scroll: false });
  }

  return <LocationStockDetail key={`${kosId}:${productId}:${branchId}`} kosId={kosId} version={version}
    productId={productId} branchId={branchId} onClose={close} />;
}

function LocationStockDetail({ kosId, version, productId, branchId, onClose }) {
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      supabase.from('products').select('name,base_unit,stock').eq('kos_id', kosId).eq('id', productId).abortSignal(controller.signal).maybeSingle(),
      supabase.from('branches').select('name').eq('kos_id', kosId).eq('id', branchId).abortSignal(controller.signal).maybeSingle(),
      supabase.from('stock_levels').select('qty').eq('kos_id', kosId).eq('product_id', productId).eq('branch_id', branchId).abortSignal(controller.signal).maybeSingle(),
    ]).then(([product, branch, level]) => {
      if (controller.signal.aborted) return;
      if (product.error || branch.error || level.error) {
        setDetail({ error: errMsg(product.error || branch.error || level.error) });
      } else if (!product.data || !branch.data) {
        setDetail({ error: 'Barang atau lokasi tidak tersedia di bisnis aktif.' });
      } else {
        setDetail({ product: product.data, branch: branch.data, qty: level.data?.qty ?? 0 });
      }
    }, (error) => { if (!controller.signal.aborted) setDetail({ error: errMsg(error) }); });
    return () => controller.abort();
  }, [kosId, version, productId, branchId]);

  useEffect(() => {
    const controller = new AbortController();
    const start = page * PAGE_SIZE;
    supabase.from('stock_moves').select('id,kind,delta,note,created_at').eq('kos_id', kosId)
      .eq('product_id', productId).eq('branch_id', branchId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(start, start + PAGE_SIZE).abortSignal(controller.signal).then(({ data, error }) => {
        if (!controller.signal.aborted) setHistory({ page, error, rows: error ? [] : data || [] });
      }, (error) => { if (!controller.signal.aborted) setHistory({ page, error, rows: [] }); });
    return () => controller.abort();
  }, [kosId, version, productId, branchId, page]);

  const title = detail?.product ? `Kartu stok · ${detail.product.name}` : 'Kartu stok';
  const current = history?.page === page ? history : null;

  return <Sheet title={title} onClose={onClose}>
    {!detail ? <p role="status">Memuat kartu stok…</p> : detail.error
      ? <div className="notice bad" role="alert">{detail.error}</div>
      : <>
        <div className="unitbox">
          <b>{detail.branch.name}</b>
          <span>Stok lokasi <strong style={{ color: Number(detail.qty) < 0 ? 'var(--bad)' : undefined }}>{angka(detail.qty)} {detail.product.base_unit}</strong></span>
          <span className="small muted">Total semua lokasi {angka(detail.product.stock)} {detail.product.base_unit}</span>
        </div>
        <h3 style={{ margin: 0 }}>Mutasi di {detail.branch.name}</h3>
        {!current ? <p role="status">Memuat mutasi…</p>
          : current.error ? <div className="notice bad" role="alert">Mutasi gagal dimuat. {errMsg(current.error)}</div>
          : !current.rows.length ? <span className="small muted">Belum ada mutasi untuk lokasi ini.</span>
          : <div className="list">
            {current.rows.slice(0, PAGE_SIZE).map((move) => <div key={move.id} className="li">
              <span className="main">
                <b>{MOVE[move.kind] || move.kind}</b>
                <span className="small muted">{tgl(jakartaDay.format(new Date(move.created_at)))}{move.note ? ` · ${move.note}` : ''}</span>
              </span>
              <b style={{ whiteSpace: 'nowrap', color: Number(move.delta) < 0 ? 'var(--bad)' : undefined }}>
                {Number(move.delta) > 0 ? '+' : ''}{angka(move.delta)} {detail.product.base_unit}
              </b>
            </div>)}
          </div>}
        {(page > 0 || current?.rows.length > PAGE_SIZE) && <div className="row">
          <button type="button" className="sm" disabled={!current || page === 0} onClick={() => setPage((value) => value - 1)}>Lebih baru</button>
          <button type="button" className="sm" disabled={!current || current.rows.length <= PAGE_SIZE} onClick={() => setPage((value) => value + 1)}>Lebih lama</button>
        </div>}
      </>}
  </Sheet>;
}
