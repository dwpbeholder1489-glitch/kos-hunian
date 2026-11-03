'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Loading, Empty, PayChip, Sheet, run } from '@/components/ui';
import { rp, tgl, thisMonth, bulan, addMonthsYm, invTitle, METHOD, errMsg } from '@/lib/format';

export default function Pembayaran() {
  const d = useData();
  const { bump } = useKos();
  const [ym, setYm] = useState(thisMonth());
  const [proof, setProof] = useState(null);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const pending = d.payments.filter((p) => p.status === 'menunggu');
  const month = d.payments.filter((p) => p.paid_at.startsWith(ym) && p.status !== 'menunggu');
  const total = month.filter((p) => p.status === 'terverifikasi').reduce((s, p) => s + p.amount, 0);

  const setStatus = async (p, status, msg) => {
    if (status === 'dibatalkan' && !confirm('Batalkan pembayaran ini? Tagihannya akan kembali belum lunas.')) return;
    if (await run(() => supabase.from('payments').update({ status, verified_at: status === 'terverifikasi' ? new Date().toISOString() : null }).eq('id', p.id), msg, errMsg)) bump();
  };

  const openProof = async (p) => {
    setProof({ loading: true });
    const { data } = await supabase.from('payment_proofs').select('image').eq('payment_id', p.id).maybeSingle();
    setProof({ image: data?.image || null });
  };

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
      <div className="row"><h2>Pembayaran</h2><PageHelp page="pembayaran" /></div>
      <p className="small muted" style={{ margin: 0 }}>Catat pembayaran dari halaman Tagihan. Di sini Anda memeriksa dan memverifikasinya.</p>
      {pending.length > 0 && (
        <section className="panel"><h3>Menunggu verifikasi</h3>
          <div className="list">{pending.map((p) => <Row key={p.id} p={p} actions={<>
            {p.source === 'penghuni' && <button className="sm" onClick={() => openProof(p)}>Lihat bukti</button>}
            <button className="sm primary" onClick={() => setStatus(p, 'terverifikasi', 'Pembayaran diverifikasi')}>Uang sudah masuk</button>
            <button className="sm danger" onClick={() => setStatus(p, 'ditolak', 'Pembayaran ditolak')}>Tolak</button>
          </>} />)}</div>
        </section>
      )}
      <section className="panel">
        <div className="row between">
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
          <h3>{bulan(ym)}</h3>
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
        </div>
        <div className="row between"><span className="label">Total diterima</span><b>{rp(total)}</b></div>
        {month.length === 0 ? <Empty title="Belum ada pembayaran" text="Tidak ada pembayaran tercatat di bulan ini." /> : (
          <div className="list">{month.map((p) => <Row key={p.id} p={p} actions={p.status === 'terverifikasi' ? <button className="sm ghost" onClick={() => setStatus(p, 'dibatalkan', 'Pembayaran dibatalkan')}>Batalkan</button> : null} />)}</div>
        )}
      </section>
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
