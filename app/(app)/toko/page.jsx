'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Tile, Loading } from '@/components/ui';
import { rp, angka, today, tgl } from '@/lib/format';
import { isLow } from '@/lib/retail';

// Dashboard toko: penjualan hari ini + kondisi stok. Kas, kasbon & laporan menyusul (Langkah 2 bagian 3–5).
export default function Toko() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('name,stock,cost,min_stock,active').eq('kos_id', kosId),
      supabase.from('sales').select('total,cost_total,pay_method,status').eq('kos_id', kosId).eq('sale_date', today()),
    ]).then(([p, s]) => setD({ ps: (p.data || []).filter((x) => x.active), sales: (s.data || []).filter((x) => x.status === 'selesai') }));
  }, [kosId, ver]);
  if (!d) return <Loading />;
  const { ps, sales } = d;
  const low = ps.filter(isLow);
  const omzet = sales.reduce((a, s) => a + Number(s.total), 0);
  const laba = sales.reduce((a, s) => a + Number(s.total) - Number(s.cost_total), 0);
  return (
    <div className="stack">
      <div className="row between"><h2>{kos.name}</h2><span className="small muted">{tgl(today())}</span></div>
      <div className="grid">
        <Tile label="Omzet hari ini" value={rp(omzet)} sub={`${sales.length} transaksi`} />
        <Tile label="Laba kotor hari ini" value={rp(laba)} sub="omzet − modal barang" />
        <Tile label="Nilai stok" value={rp(ps.reduce((s, p) => s + Math.max(0, Number(p.stock)) * Number(p.cost), 0))} sub={`${angka(ps.length)} barang · harga modal`} />
        <Tile label="Stok menipis" value={angka(low.length)} tone={low.length ? 'bad' : ''} sub={low.slice(0, 3).map((p) => p.name).join(', ') || 'aman'} />
      </div>
      {ps.length === 0 ? (
        <section className="panel"><b>Mulai di sini</b><span className="small muted">Masukkan barang yang dijual beserta satuan, harga eceran/grosir, dan stoknya.</span><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></section>
      ) : <Link href="/kasir"><button className="cta" style={{ width: '100%' }}>Buka Kasir</button></Link>}
      <section className="panel">
        <h3>Sedang dibangun</h3>
        <p className="small muted" style={{ margin: 0 }}>Menyusul bertahap: belanja ke supplier · kas & bank, pelunasan kasbon, utang supplier · laporan laba bulanan.</p>
      </section>
    </div>
  );
}
