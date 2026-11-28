'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SheetStats } from '@/components/SmartDetailSheet';
import { Loading, Sheet } from '@/components/ui';
import { angka, errMsg, rp, tgl } from '@/lib/format';
import { PRIORITIES, suggestedQuantity } from '@/lib/stockSuggestion.mjs';
import { supabase } from '@/lib/supabase';
import styles from './workbench.module.css';

const SOURCE = {
  supplier: 'pengaturan pemasok',
  catalog: 'pengaturan barang',
  receipts: 'rata-rata penerimaan terdokumentasi, dibulatkan ke atas',
};
const PRICE = { supplier: 'harga sepakat pemasok', purchase: 'pembelian terakhir yang memakai satuan ini', cost: 'harga modal katalog × isi satuan' };

export function StockReason({ item }) {
  if (item.reason === 'customer') return `Stok belum cukup untuk ${angka(item.reserved)} ${item.base_unit} pesanan pelanggan.`;
  if (item.reason === 'minimum') return `Saldo hari ini ${angka(item.todayBalance)} ${item.base_unit}, di bawah minimum ${angka(item.minimum)}.`;
  if (item.reason === 'lead') return 'Waktu kirim pemasok belum memiliki dasar yang cukup.';
  if (item.reason === 'capacity') return 'Kemasan atau minimum pemasok melebihi ruang hingga batas stok maksimum.';
  if (item.reason === 'history') return 'Penjualan masih jarang dan belum ada stok minimum atau pesanan pelanggan sebagai dasar.';
  if (item.reason === 'eta') return 'Cek pesanan atau mutasi yang belum memiliki tanggal tiba yang pasti.';
  if (item.reason === 'expedite') return 'Stok bisa kurang sebelum barang tiba. Cek apakah pesanan berjalan bisa dipercepat.';
  if (item.reason === 'soon') return 'Stok bisa turun di bawah kebutuhan dalam 7 hari setelah waktu kirim.';
  if (item.reason === 'coverage') {
    return item.minimum > 0 && item.onArrival >= 0
      ? `Stok diperkirakan turun di bawah minimum sebelum atau saat pemasok tiba.`
      : `Stok saat ini cukup ${angka(item.daysLeft)} hari, pemasok butuh ${angka(item.lead)} hari.`;
  }
  return 'Stok dan kedatangan terjadwal mencukupi dalam periode proyeksi.';
}

export default function SuggestionDetail({ kosId, data, item, unit, onClose }) {
  const [sources, setSources] = useState(null);
  const [load, setLoad] = useState(0);
  const [window, setWindow] = useState('selected');
  const [limit, setLimit] = useState(30);
  const units = (value) => `${angka(value)} ${item.base_unit}`;

  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    setSources(null);
    supabase.rpc('stock_suggestion_data', { p_kos: kosId, p_days: data.days, p_product: item.id }).abortSignal(controller.signal)
      .then(({ data: response, error }) => {
        if (!controller.signal.aborted) setSources(error ? { error: errMsg(error) } : response.sales_sources);
      }, (error) => { if (!controller.signal.aborted) setSources({ error: errMsg(error) }); });
    return () => controller.abort();
  }, [kosId, data.days, item.id, load]);

  const sales = Array.isArray(sources) ? sources.filter((sale) => window === 'season' ? sale.seasonal
    : !sale.seasonal && (window === 'recent' || sale.sale_date >= data.from)) : [];

  return <Sheet title={item.name} subtitle={`${PRIORITIES[item.priority]} · Data ${item.confidence.toLowerCase()} · ${data.location || 'Lokasi utama'}`}
    icon="/barang" onClose={onClose}>
    <p><StockReason item={item} /></p>
    <SheetStats items={[
      ['Stok tersedia', units(item.available)],
      [`Terjual (${data.days} hari)`, units(item.sold)],
      ['Cakupan stok saat ini', item.daysLeft == null ? '—' : `${angka(item.daysLeft)} hari`],
    ]} />
    <section className={styles.source}>
      <h3>Stok dan pesanan pelanggan</h3>
      <p>{units(item.stock)} fisik − {units(item.held)} ditahan − {units(item.reserved)} dipesan pelanggan. Stok minimum {units(item.minimum)}.</p>
      <Link href={`/barang?stok=${item.id}`}>Lihat stok dan mutasi barang</Link>
      {item.customer_orders.map((order) => <Link key={order.id} href={`/grosir?pesanan=${order.id}`}>{order.number} · {units(order.qty)} tersisa</Link>)}
    </section>
    <section className={styles.source}>
      <h3>Penjualan dan pola musiman</h3>
      <p>Periode {tgl(data.from)} – {tgl(data.to)}: {units(item.sold)} dari {angka(item.selling_days)} hari yang memiliki penjualan. Dalam 90 hari terakhir terjual {units(item.sold_90)}. Periode sebanding tahun lalu {tgl(data.season_from)} – {tgl(data.season_to)}: {units(item.sold_season)}.</p>
      {item.demand && <p>Dasar laju terbaru: {units(item.demand.amount)} ÷ {angka(item.demand.days)} hari{item.demand.source === 'limited'
        ? ' (sampel penjualan terbatas)' : item.demand.source === 'purchase' ? ' (perkiraan dari jarak antar pembelian yang sudah diterima)' : ''}.</p>}
      <p>Proyeksi memakai {units(item.rate)}/hari{item.seasonal ? ', mengikuti laju yang lebih tinggi pada periode sebanding tahun lalu' : ''}. Perbandingan musiman dipakai bila ada penjualan pada sedikitnya dua hari berbeda tahun lalu.</p>
      {!load && <button className="sm" onClick={() => setLoad(1)}>Lihat transaksi sumber</button>}
      {load > 0 && (!sources ? <Loading rows={2} /> : sources.error ? <><p className="notice bad">{sources.error}</p><button onClick={() => setLoad(load + 1)}>Coba lagi</button></> : <>
        <label className="f">Rentang transaksi<select value={window} onChange={(event) => { setWindow(event.target.value); setLimit(30); }}>
          <option value="selected">Periode pilihan</option><option value="recent">90 hari terakhir</option><option value="season">Periode tahun lalu</option>
        </select></label>
        {sales.slice(0, limit).map((sale) => <Link key={sale.id} href={`/struk/${sale.id}`}>{sale.number} · {tgl(sale.sale_date)} · {units(sale.qty)}</Link>)}
        {!sales.length && <p>Belum ada penjualan pada rentang ini.</p>}
        {sales.length > limit && <button onClick={() => setLimit(limit + 30)}>Tampilkan transaksi berikutnya</button>}
      </>)}
    </section>
    <section className={styles.source}>
      <h3>Pemasok dan barang dalam perjalanan</h3>
      <p>{item.supplier || 'Pemasok belum ditentukan'} · {item.lead == null ? 'waktu kirim belum diketahui' : `${angka(item.lead)} hari dari ${SOURCE[item.lead_source]}`}</p>
      {['supplier','catalog'].includes(item.lead_source) && <Link href={item.lead_source === 'supplier' ? `/barang?pasokan=${item.id}` : `/barang?produk=${item.id}`}>Lihat pengaturan sumber waktu kirim</Link>}
      {item.demand?.source === 'purchase' && <p>Ritme pembelian dipakai karena penjualan jarang dan stok tersedia tersisa paling banyak seperempat dari penerimaan terakhir.</p>}
      {item.replenishments?.map((purchase) => <Link key={purchase.id} href={`/belanja?pesanan=${purchase.id}`}>{purchase.number} · {tgl(purchase.date)} · {units(purchase.qty)} diterima</Link>)}
      {item.lead_samples.map((sample) => <Link key={sample.id} href={`/belanja?pesanan=${sample.id}`}>{sample.number} · {tgl(sample.ordered)} – {tgl(sample.received)} · {angka(sample.days)} hari</Link>)}
      {item.inbound.map((order) => <Link key={order.id} href={order.type === 'purchase' ? `/belanja?pesanan=${order.id}` : `/mutasi?mutasi=${order.id}`}>
        {order.number} · {units(order.qty)} · {order.date ? tgl(order.date) + (order.date < data.today ? ' (lewat jadwal)' : '') : 'tanggal belum pasti'}
      </Link>)}
      {item.uncertain > 0 && <p>{units(item.uncertain)} dalam perjalanan perlu konfirmasi. Angka ini belum ditambahkan ke proyeksi.</p>}
      {!item.inbound.length && <p>Tidak ada pesanan atau mutasi yang sedang menuju lokasi ini.</p>}
    </section>
    <section className={styles.source}>
      <h3>Dasar jumlah dan estimasi modal</h3>
      <p>Saldo perkiraan {item.lead == null ? 'hari ini' : 'pada hari pemasok bisa tiba'}: {units(item.onArrival)}. Kekurangan hingga 7 hari setelahnya: {units(item.projectedShortage)} untuk menjaga stok minimum, setelah kedatangan yang terjadwal.</p>
      {unit && <p>Saran {angka(suggestedQuantity(item, unit))} {unit.name} (isi {units(unit.factor)}){unit.moq != null ? `, minimum pemasok ${angka(unit.moq)} ${unit.name}` : ''}. {unit.price == null ? 'Harga beli belum tercatat.' : `Estimasi per ${unit.name} ${rp(unit.price)} dari ${PRICE[unit.price_source]}.`}</p>}
      {unit?.price_source === 'purchase' && unit.purchase_id && <Link href={`/belanja?pesanan=${unit.purchase_id}`}>Buka pembelian sumber {unit.purchase_number}</Link>}
      {unit?.price_source === 'supplier' && <Link href={`/barang?pasokan=${item.id}`}>Lihat harga pemasok di katalog</Link>}
      {unit?.price_source === 'cost' && <Link href={`/barang?produk=${item.id}`}>Lihat harga modal katalog</Link>}
      {item.capacity != null && <p>Batas stok katalog {units(item.max_stock)}. Sisa kapasitas dari puncak saldo proyeksi {units(item.capacity)}.</p>}
      <p>Data kuat memakai riwayat periode yang memadai, waktu kirim, dan jadwal tiba yang pasti. Data cukup juga bisa berasal dari stok minimum, pesanan pelanggan, atau ritme pembelian. Data terbatas perlu diperiksa sebelum memesan.</p>
    </section>
  </Sheet>;
}
