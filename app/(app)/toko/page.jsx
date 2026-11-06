'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Tile, Loading } from '@/components/ui';
import { rp, angka } from '@/lib/format';
import { isLow } from '@/lib/retail';

// Dashboard toko. Bagian kasir, belanja, kas & laporan menyusul (Langkah 2 bagian 2–5).
export default function Toko() {
  const { kos, kosId, ver } = useKos();
  const [ps, setPs] = useState(null);
  useEffect(() => { supabase.from('products').select('name,stock,cost,min_stock,active').eq('kos_id', kosId).then(({ data }) => setPs((data || []).filter((p) => p.active))); }, [kosId, ver]);
  if (!ps) return <Loading />;
  const low = ps.filter(isLow);
  return (
    <div className="stack">
      <h2>{kos.name}</h2>
      <div className="grid">
        <Tile label="Barang" value={angka(ps.length)} sub="aktif" />
        <Tile label="Nilai stok" value={rp(ps.reduce((s, p) => s + Math.max(0, Number(p.stock)) * Number(p.cost), 0))} sub="harga modal" />
        <Tile label="Stok menipis" value={angka(low.length)} tone={low.length ? 'bad' : ''} sub={low.slice(0, 3).map((p) => p.name).join(', ') || 'aman'} />
      </div>
      {ps.length === 0 && <section className="panel"><b>Mulai di sini</b><span className="small muted">Masukkan barang yang dijual beserta satuan, harga eceran/grosir, dan stoknya.</span><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></section>}
      <section className="panel">
        <h3>Sedang dibangun</h3>
        <p className="small muted" style={{ margin: 0 }}>Menyusul bertahap: kasir (tunai, transfer, kasbon) dan struk · belanja ke supplier · kas & bank, kasbon pelanggan, utang supplier · laporan laba.</p>
      </section>
    </div>
  );
}
