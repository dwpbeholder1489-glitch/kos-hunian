'use client';
import { printVerifiedPayment } from '@/lib/print-payment';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHelp from '@/components/PageHelp';
import { PageHeader, DataTable } from '@/components/Page';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Loading, Empty, PayChip, Sheet, run, toast } from '@/components/ui';
import { rp, tgl, thisMonth, bulan, addMonthsYm, invTitle, METHOD, errMsg } from '@/lib/format';

export default function Pembayaran() {
  const d = useData();
  const { kos, bump } = useKos();
  const params = useSearchParams();
  const monthParam = params.get('bulan');
  const [ym, setYm] = useState(() => /^\d{4}-\d{2}$/.test(monthParam || '') && monthParam <= thisMonth() ? monthParam : thisMonth());
  const view = params.get('tampilan');
  const receipts = view === 'kwitansi';
  const verification = view === 'verifikasi';
  const [proof, setProof] = useState(null);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const pending = d.payments.filter((p) => p.status === 'menunggu');
  const month = d.payments.filter((p) => p.paid_at.startsWith(ym) && p.status !== 'menunggu');
  const visible = receipts ? month.filter((p) => p.status === 'terverifikasi') : month;
  const receipt = (p) => <Link href={`/kwitansi/${p.id}`} className="small">Buka kuitansi</Link>;
  const total = month.filter((p) => p.status === 'terverifikasi').reduce((s, p) => s + p.amount, 0);

  const setStatus = async (p, status, msg) => {
    if (status === 'dibatalkan' && !confirm('Batalkan pembayaran ini? Tagihannya akan kembali belum lunas.')) return;
    const verifying = status === 'terverifikasi';
    let changed = false;
    const ok = await run(async () => {
      const update = supabase.from('payments').update({ status, verified_at: verifying ? new Date().toISOString() : null }).eq('id', p.id);
      if (!verifying) return update;
      const result = await update.eq('status', 'menunggu').select('id').maybeSingle();
      changed = Boolean(result.data);
      return result;
    }, msg, errMsg);
    if (ok) {
      if (changed) printVerifiedPayment(kos, d, p, (error) =>
        toast('Pembayaran terverifikasi. Cetak otomatis gagal: ' + errMsg(error) + ' Buka kwitansi untuk mencetak ulang.'));
      bump();
    }
  };

  const openProof = async (p) => {
    setProof({ loading: true });
    const { data } = await supabase.from('payment_proofs').select('image').eq('payment_id', p.id).maybeSingle();
    setProof({ image: data?.image || null });
  };

  const who = (p) => { const i = d.invById.get(p.invoice_id); return i ? `${d.occName(i.occupant_id)} · ${d.roomCode(i.room_id)}` : '—'; };
  const Row = ({ p, actions }) => {
    const i = d.invById.get(p.invoice_id);
    return (
      <div className="li">
        <div className="main"><b>{i ? `${d.occName(i.occupant_id)} · ${d.roomCode(i.room_id)}` : '—'}</b>
          <span className="small muted">{i ? invTitle(i) : ''} · {tgl(p.paid_at)} · {METHOD[p.method]}{p.ref ? ' · ' + p.ref : ''}</span>
          {p.source === 'penghuni' && <span className="small"><span className="chip info">Dikirim penghuni</span>{p.notes ? ` "${p.notes}"` : ''}</span>}
          {actions && <div className="row" style={{ marginTop: 6 }}>{actions}</div>}
        </div>
        <div style={{ textAlign: 'right' }}><div className="num">{rp(p.amount)}</div><PayChip status={p.status} /></div>
      </div>
    );
  };

  return (
    <div className="stack">
      <PageHeader title={verification ? "Verifikasi Pembayaran" : receipts ? "Kuitansi & Bukti Bayar" : "Pembayaran"} help={<PageHelp page="pembayaran" />} desc={<>Catat pembayaran dari halaman Tagihan. Di sini Anda memeriksa dan memverifikasinya.</>} />
      {(receipts || verification) && <button className="sm ghost" onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('tampilan');
        window.history.replaceState(window.history.state, '', url);
      }}>← Semua pembayaran</button>}
      {!receipts && (pending.length > 0 || verification) && (
        <section className="panel"><h3>Menunggu verifikasi</h3>
          <div className="list">{pending.length === 0 && <Empty title="Tidak ada pembayaran menunggu verifikasi" />}{pending.map((p) => <Row key={p.id} p={p} actions={<>
            {p.source === 'penghuni' && <button className="sm" onClick={() => openProof(p)}>Lihat bukti</button>}
            <button className="sm primary" onClick={() => setStatus(p, 'terverifikasi', 'Pembayaran diverifikasi')}>Uang sudah masuk</button>
            <button className="sm danger" onClick={() => setStatus(p, 'ditolak', 'Pembayaran ditolak')}>Tolak</button>
          </>} />)}</div>
        </section>
      )}
      {!verification && <section className="panel">
        <div className="row between">
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
          <h3>{bulan(ym)}</h3>
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
        </div>
        <div className="row between"><span className="label">Total diterima</span><b>{rp(total)}</b></div>
        {visible.length === 0 ? <Empty title={receipts ? "Belum ada kuitansi" : "Belum ada pembayaran"} text={receipts ? "Kuitansi tersedia untuk pembayaran terverifikasi." : "Tidak ada pembayaran tercatat di bulan ini."} /> : (
          <DataTable rows={visible} caption={`Pembayaran ${bulan(ym)}`}
            columns={[
              { key: 'date', label: 'Tanggal', sort: (p) => p.paid_at, render: (p) => tgl(p.paid_at) },
              { key: 'who', label: 'Penghuni · kamar', sort: (p) => who(p), render: (p) => <><b>{who(p)}</b>{p.source === 'penghuni' && <span className="chip info" style={{ marginLeft: 6 }}>Dikirim penghuni</span>}</> },
              { key: 'inv', label: 'Tagihan', hide: 'tablet', render: (p) => { const i = d.invById.get(p.invoice_id); return i ? invTitle(i) : '—'; } },
              { key: 'm', label: 'Cara', render: (p) => <>{METHOD[p.method]}{p.ref ? <span className="small muted"> · {p.ref}</span> : null}</> },
              { key: 'amt', label: 'Jumlah', align: 'right', sort: (p) => p.amount, render: (p) => rp(p.amount) },
              { key: 'st', label: 'Status', render: (p) => <PayChip status={p.status} /> },
              { key: 'act', label: <span className="vh">Tindakan</span>, render: (p) => (p.status === 'terverifikasi' ? <div className="row">{receipt(p)}{!receipts && <button className="sm ghost" onClick={() => setStatus(p, 'dibatalkan', 'Pembayaran dibatalkan')}>Batalkan</button>}</div> : null) },
            ]}
            card={(p) => { const i = d.invById.get(p.invoice_id); return <>
              <div className="dt-row"><b>{who(p)}</b><span className="num">{rp(p.amount)}</span></div>
              <div className="dt-row"><span className="small muted">{i ? invTitle(i) : ''} · {tgl(p.paid_at)} · {METHOD[p.method]}{p.ref ? ' · ' + p.ref : ''}</span><PayChip status={p.status} /></div>
              {p.source === 'penghuni' && <span className="small"><span className="chip info">Dikirim penghuni</span>{p.notes ? ` "${p.notes}"` : ''}</span>}
              {p.status === 'terverifikasi' && <div className="row">{receipt(p)}{!receipts && <button className="sm ghost" onClick={() => setStatus(p, 'dibatalkan', 'Pembayaran dibatalkan')}>Batalkan</button>}</div>}
            </>; }} />
        )}
      </section>}
      {proof && (
        <Sheet title="Bukti pembayaran" onClose={() => setProof(null)}>
          {proof.loading ? <p className="muted">Memuat…</p> : proof.image
            ? <img src={proof.image} alt="Bukti transfer dari penghuni" className="proofimg" />
            : <p className="muted">Penghuni tidak melampirkan foto bukti. Cek mutasi rekening Anda.</p>}
          <p className="small muted" style={{ margin: 0 }}>Cocokkan dengan mutasi rekening sebelum menekan "Uang sudah masuk".</p>
        </Sheet>
      )}
    </div>
  );
}
