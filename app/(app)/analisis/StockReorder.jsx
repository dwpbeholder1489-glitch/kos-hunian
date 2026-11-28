'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NavIcon from '@/components/NavIcon';
import { SheetEmpty, SheetStats } from '@/components/SmartDetailSheet';
import { Loading, Sheet, toast } from '@/components/ui';
import { angka, errMsg, tgl } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { purchasePath, storePurchasePrefill } from '../belanja/purchase-data';
import styles from './analisis.module.css';

const PAGE_SIZE = 8;

function explanation(item) {
  if (item.reason === 'history') return 'Riwayat penjualan 14 hari belum memadai.';
  if (item.reason === 'lead') return 'Waktu kirim pemasok belum tercatat.';
  if (item.reason === 'eta') return 'Stok berisiko habis. Cek jadwal pesanan yang terlambat atau belum punya tanggal.';
  if (item.days_left === 0) return `Stok tersedia habis, pemasok butuh ${angka(item.lead)} hari.`;
  return `Stok cukup ${angka(item.days_left)} hari, pemasok butuh ${angka(item.lead)} hari.`;
}

export default function StockReorder({ kosId, version }) {
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('order');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setDetail(null);
    supabase.rpc('analysis_stock_reorder', { p_kos: kosId }).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!controller.signal.aborted) setResult(error ? { error: errMsg(error) } : data);
      }, (error) => { if (!controller.signal.aborted) setResult({ error: errMsg(error) }); });
    return () => controller.abort();
  }, [kosId, retry, version]);

  const items = result?.items || [];
  const ordering = items.filter((item) => item.reason === 'order');
  const checking = items.filter((item) => item.reason !== 'order');
  const visible = tab === 'order' ? ordering : checking;

  function makeDraft(item) {
    try {
      const draft = storePurchasePrefill(kosId, {
        supplier: item.supplier_id || '',
        lines: [{ product_id: item.id, unit: item.unit, qty: '', price: item.price == null ? '' : angka(Math.round(Number(item.price))) }],
      });
      router.push(purchasePath({ month: result.as_of.slice(0, 7), draft }));
    } catch {
      toast('Draf belum bisa dibuka. Penyimpanan sesi browser tidak tersedia.');
    }
  }

  return <section className={styles.card} aria-labelledby="saran-belanja-stok">
    <div className={styles.cardH}>
      <h2 className={styles.cardT} id="saran-belanja-stok"><span className={styles.tIco}><NavIcon name="/grosir" size={20} /></span>Saran Belanja Stok</h2>
    </div>
    {result?.from && <p className={styles.note}>Lokasi kerja {result.location || 'utama'} · Penjualan {tgl(result.from)} – {tgl(result.to)}</p>}
    {!result ? <Loading rows={2} /> : result.error ? <div className="stack">
      <p className="notice bad" role="alert">{result.error}</p>
      <button onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>
    </div> : <>
      <div className="seg" aria-label="Status saran belanja" role="group">
        {[['order', 'Perlu Dipesan', ordering.length], ['check', 'Perlu Dicek', checking.length]].map(([key, label, count]) =>
          <button type="button" key={key} aria-pressed={tab === key} className={tab === key ? 'on' : ''}
            onClick={() => { setTab(key); setLimit(PAGE_SIZE); }}>{label} ({angka(count)})</button>)}
      </div>
      {visible.length ? <div className="list">{visible.slice(0, limit).map((item) => (
        <button type="button" key={item.id} className="li" aria-haspopup="dialog" onClick={() => setDetail(item)}>
          <span className="main" style={{ textAlign: 'left' }}><b>{item.name}</b><small className="muted">{explanation(item)}</small></span>
          <NavIcon name="next" size={16} />
        </button>
      ))}</div> : <p className={styles.note} role="status">
        {tab === 'order' ? 'Belum ada barang yang perlu dipesan hari ini.' : 'Belum ada barang yang perlu dicek.'}
      </p>}
      {visible.length > limit && <button onClick={() => setLimit((value) => value + PAGE_SIZE)}>Tampilkan lebih banyak</button>}
    </>}
    {detail && <Sheet title={detail.name} icon="/grosir" subtitle="Dasar saran belanja" onClose={() => setDetail(null)}>
      <SheetStats items={[
        ['Stok tersedia', `${angka(detail.available)} ${detail.base_unit}`],
        ['Rata-rata per hari', `${angka(detail.per_day)} ${detail.base_unit}`],
        ['Cakupan stok saat ini', detail.days_left == null ? '—' : `${angka(detail.days_left)} hari`],
      ]} />
      <p><strong>{detail.reason === 'order' ? 'Perlu Dipesan' : 'Perlu Dicek'}</strong> · {explanation(detail)}</p>
      <p className="small muted">Stok fisik {angka(detail.stock)} − dipesan pelanggan {angka(detail.reserved)} − ditahan {angka(detail.held)} {detail.base_unit}.</p>
      <p className="small muted">{angka(detail.sold)} {detail.base_unit} terjual selama 14 hari kalender penuh ({angka(detail.selling_days)} hari dengan penjualan). Rata-rata = jumlah terjual ÷ 14. Cakupan = stok tersedia ÷ rata-rata per hari.</p>
      {!detail.history_ready && <p className="small muted">Untuk memberi rekomendasi, barang perlu tercatat sejak awal periode dan terjual pada sedikitnya dua hari berbeda.</p>}
      <p className="small muted">{detail.supplier ? `${detail.supplier} · ` : ''}{detail.lead == null ? 'Waktu kirim belum diisi.' :
        `Waktu kirim ${angka(detail.lead)} hari dari pengaturan ${detail.lead_source}. Pesanan baru diperkirakan tiba ${tgl(detail.lead_date)}.`}</p>
      {detail.balance_on_arrival != null && <p className="small muted">Perkiraan saldo pada hari pesanan baru tiba, setelah pesanan berjalan yang terjadwal, adalah <b>{angka(detail.balance_on_arrival)} {detail.base_unit}</b>.</p>}
      <h3>Pesanan pemasok berjalan</h3>
      {detail.orders.length ? <>
        <p className="small muted">Proyeksi menambahkan sisa pesanan pada tanggal tibanya. Jadwal kosong atau lewat tanggal perlu dikonfirmasi.</p>
        <div className="list">{detail.orders.map((po) => <Link className="li" key={po.id} href={`/belanja?pesanan=${po.id}`}>
          <span className="main"><b>{po.number}</b><small className="muted">{angka(po.qty)} {detail.base_unit} · {po.date ? tgl(po.date) : 'Tanpa jadwal'}{po.date && po.date < result.as_of ? ' · Lewat jadwal' : ''}</small></span>
          <NavIcon name="next" size={16} />
        </Link>)}</div>
      </> : <SheetEmpty icon="/grosir" title="Belum ada pesanan berjalan" text="Proyeksi memakai stok yang tersedia saat ini." />}
      <button className="primary" onClick={() => makeDraft(detail)}>Buat draf pesanan pembelian</button>
      <p className="small muted">Jumlah dan harga dapat diperiksa di formulir sebelum pesanan disimpan.</p>
    </Sheet>}
  </section>;
}
