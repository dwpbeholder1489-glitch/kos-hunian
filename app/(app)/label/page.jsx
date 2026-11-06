'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, run } from '@/components/ui';
import { rp, errMsg } from '@/lib/format';
import { unitsOf } from '@/lib/retail';
import { code128Svg, code128Ok } from '@/lib/code128';

// Cetak label barcode sendiri untuk barang tanpa barcode pabrik (beras kiloan, gula, telur, dll.)
export default function Label() {
  const { kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState({}); // {key: jumlah label}
  const [q, setQ] = useState('');
  const [showPrice, setShowPrice] = useState(true);
  const load = () => Promise.all([
    supabase.from('products').select('id,name,sku,base_unit,active').eq('kos_id', kosId).eq('active', true).order('name'),
    supabase.from('product_units').select('*').eq('kos_id', kosId),
  ]).then(([p, u]) => (p.error || u.error ? setErr(errMsg(p.error || u.error)) : setD({ products: p.data, units: u.data })));
  useEffect(() => { load(); }, [kosId, ver]);

  // Satu baris per satuan: barcode pabrik bila ada; satuan terkecil tanpa barcode memakai kode barang
  const rows = useMemo(() => {
    if (!d) return [];
    return d.products.flatMap((p) => unitsOf(p, d.units).map((u, i) => ({
      key: p.id + '|' + u.name, name: p.name, unit: u.name, price: Number(u.price_retail) || 0,
      code: u.barcode || (i === 0 ? p.sku : null), factory: !!u.barcode, pid: p.id,
    })));
  }, [d]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  const w = q.trim().toLowerCase();
  const shown = rows.filter((r) => !w || r.name.toLowerCase().includes(w));
  const noCode = d.products.filter((p) => !p.sku && !d.units.some((u) => u.product_id === p.id && u.barcode));
  const labels = rows.flatMap((r) => Array.from({ length: pick[r.key] || 0 }, (_, i) => ({ ...r, i })));
  const setN = (k, n) => setPick({ ...pick, [k]: Math.max(0, Math.min(99, n)) });
  const auto = async () => { if (await run(() => supabase.rpc('product_auto_codes', { p_kos: kosId }), 'Kode otomatis dibuat', errMsg)) load(); };

  return (
    <div className="stack">
      <div className="noprint stack">
        <Link href="/barang" className="small">← Barang & stok</Link>
        <div className="row"><h2>Cetak label barcode</h2><PageHelp page="label" /></div>
        <p className="small muted" style={{ margin: 0 }}>Untuk barang tanpa barcode pabrik: label memakai <b>kode barang</b>. Tempel di rak atau kemasan ulang, lalu scan di Kasir seperti barang biasa.</p>
        {noCode.length > 0 && <div className="notice">{noCode.length} barang belum punya kode.<br /><button className="sm primary" style={{ marginTop: 6 }} onClick={auto}>Buat kode otomatis (B0001, B0002, …)</button></div>}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang" aria-label="Cari barang" />
        <section className="panel"><div className="list">{shown.map((r) => (
          <div className="li" key={r.key}>
            <div className="main"><b className="small">{r.name} · {r.unit}</b><span className="small muted">{r.code ? `${r.factory ? 'Barcode pabrik' : 'Kode'} ${r.code}` : 'belum ada kode'}{r.price ? ` · ${rp(r.price)}` : ''}</span></div>
            {r.code && code128Ok(r.code) ? <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
              <button className="sm" onClick={() => setN(r.key, (pick[r.key] || 0) - 1)} aria-label="Kurangi">−</button>
              <b style={{ minWidth: 22, textAlign: 'center' }}>{pick[r.key] || 0}</b>
              <button className="sm" onClick={() => setN(r.key, (pick[r.key] || 0) + 1)} aria-label="Tambah">+</button>
            </div> : <span className="small muted">—</span>}
          </div>
        ))}</div></section>
        <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Tampilkan harga eceran di label</label>
        {labels.length === 0 ? <Empty title="Pilih jumlah label" text="Tekan + di barang yang ingin dicetak labelnya." /> : <button className="cta" onClick={() => window.print()}>Cetak {labels.length} label</button>}
        {labels.length > 0 && <span className="small muted">Di iPhone: Cetak › pilih printer, atau cubit pratinjau untuk menyimpan PDF. Barcode pabrik juga bisa dicetak ulang bila labelnya rusak.</span>}
      </div>
      {labels.length > 0 && <div className="labels">{labels.map((l) => (
        <div className="lbl" key={l.key + l.i}>
          <b>{l.name}{l.unit ? ` · ${l.unit}` : ''}</b>
          {showPrice && l.price > 0 && <span className="pr">{rp(l.price)}</span>}
          <div dangerouslySetInnerHTML={{ __html: code128Svg(l.code, { height: 38 }) }} />
          <span className="cd">{l.code}</span>
        </div>
      ))}</div>}
    </div>
  );
}
