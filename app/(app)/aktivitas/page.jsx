'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty } from '@/components/ui';
import { rp, tgl, errMsg, today } from '@/lib/format';

const AREA = [['', 'Semua'], ['sell', 'Penjualan & pesanan'], ['stock', 'Stok & belanja'], ['finance', 'Uang'], ['rent', 'Sewa & tagihan']];
const TONE = { SaleVoided: 'bad', PurchaseVoided: 'bad', ExpenseDeleted: 'bad', DebtPaymentVoided: 'bad', InvoiceVoided: 'bad', PaymentRejected: 'bad', PaymentVoided: 'bad', ServiceOrderCancelled: 'bad', BookingCancelled: 'bad',
  SaleCreated: 'good', InvoicePaid: 'good', PaymentReceived: 'good', ReceivableCollected: 'good', ServiceOrderCompleted: 'good', GoodsReceived: 'good', ApprovalRequested: 'gold' };
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const hari = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
// Tautan ke dokumen asal (hanya yang punya halaman detail)
const href = (e) => (e.agg === 'sale' ? `/struk/${e.agg_id}` : e.agg === 'svc_order' ? `/nota/${e.agg_id}` : e.agg === 'purchase' ? '/belanja' : e.agg === 'invoice' ? '/tagihan'
  : e.agg === 'approval' ? '/persetujuan' : e.agg === 'expense' ? null : e.agg === 'product' ? '/barang' : null);

// Riwayat aktivitas (Master Prompt Modul V2.0 Bab 8 & 49): peristiwa yang tercatat otomatis di database saat transaksi terjadi.
// Server hanya mengirim peristiwa di area yang boleh dibaca pengguna (activity_feed).
export default function Aktivitas() {
  const { kosId } = useKos();
  const [area, setArea] = useState('');
  const [dari, setDari] = useState('');
  const [rows, setRows] = useState(null);
  const [sejak, setSejak] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);
  const muat = async (before) => {
    const { data, error } = await supabase.rpc('activity_feed', { p_kos: kosId, p_from: dari || null, p_to: dari || null, p_group: area || null, p_before: before || null, p_limit: 50 });
    if (error) return setErr(errMsg(error));
    setSejak(data.sejak); setMore(data.rows.length === 50);
    setRows((r) => (before ? [...(r || []), ...data.rows] : data.rows));
  };
  useEffect(() => { setRows(null); setErr(null); muat(); }, [kosId, area, dari]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice bad">{/activity_feed/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;

  const byDay = [];
  (rows || []).forEach((e) => { const d = hari(e.at); const g = byDay[byDay.length - 1]; if (g && g.d === d) g.list.push(e); else byDay.push({ d, list: [e] }); });
  return (
    <div className="stack">
      <div className="row"><h2>Riwayat aktivitas</h2><PageHelp page="aktivitas" /></div>
      <p className="small muted" style={{ margin: 0 }}>Siapa melakukan apa dan kapan — dicatat otomatis oleh sistem saat transaksi terjadi, tidak bisa diubah. Anda hanya melihat aktivitas di bagian yang boleh Anda buka.</p>
      <div className="seg" style={{ overflowX: 'auto' }}>{AREA.map(([k, l]) => <button key={k} className={area === k ? 'on' : ''} onClick={() => setArea(k)}>{l}</button>)}</div>
      <div className="row" style={{ gap: 6 }}><label className="small" style={{ flex: 1 }}>Tanggal <input type="date" value={dari} max={today()} onChange={(e) => setDari(e.target.value)} /></label>
        {dari && <button className="sm ghost" onClick={() => setDari('')}>Semua tanggal</button>}</div>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="Belum ada aktivitas" text={sejak ? undefined : 'Riwayat mulai tercatat sejak fitur ini aktif. Transaksi berikutnya akan muncul di sini.'} /> : <>
        {byDay.map((g) => (
          <section className="panel" key={g.d}>
            <h3>{g.d === today() ? 'Hari ini' : tgl(g.d)}</h3>
            <div className="list">{g.list.map((e) => { const h = href(e); const body = (
              <div className="main"><span className="row" style={{ gap: 6 }}><span className={'chip ' + (TONE[e.type] || '')}>{e.label}</span><span className="small muted">{jam(e.at)}</span></span>
                <span className="small">{e.summary}</span><span className="small muted">{e.actor || 'karyawan'}</span></div>);
              return h ? <Link key={e.id} href={h} className="li click" style={{ color: 'inherit', textDecoration: 'none', alignItems: 'flex-start' }}>{body}{e.amount != null && <b className="small">{rp(e.amount)}</b>}</Link>
                : <div key={e.id} className="li" style={{ alignItems: 'flex-start' }}>{body}{e.amount != null && <b className="small">{rp(e.amount)}</b>}</div>; })}</div>
          </section>
        ))}
        {more && <button className="ghost" onClick={() => muat(rows[rows.length - 1].id)}>Muat lebih banyak</button>}
      </>}
      {sejak && <span className="small muted">Riwayat tercatat sejak {tgl(hari(sejak))}. Transaksi sebelum itu tetap ada di menunya masing-masing.</span>}
    </div>
  );
}
