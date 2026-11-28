'use client';
import { PrintReceiptButton } from '@/components/PrinterManager';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import { useParams } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Loading, Empty, toast } from '@/components/ui';
import Locked from '@/components/Locked';
import { hasFeature } from '@/lib/plan';
import { rp, tgl, invTitle, METHOD, waLink, errMsg } from '@/lib/format';

import { kwitansiText, receiptNumber, terbilang } from '@/lib/kwitansi';

export default function Kwitansi() {
  const { id } = useParams();
  const { kos } = useKos();
  const d = useData({ fullRoomHistory: true });
  if (!hasFeature(kos, 'kwitansi')) return <Locked need="dasar" title="Kwitansi PDF" text="Cetak dan kirim kwitansi resmi ke penghuni mulai Paket Dasar." />;
  if (!d.ready) return <Loading />;
  const p = d.payments.find((x) => x.id === id);
  const inv = p && d.invById.get(p.invoice_id);
  if (!p || !inv) return <Empty title="Kwitansi tidak ditemukan" />;
  if (p.status !== 'terverifikasi') return <Empty title="Pembayaran belum terverifikasi" text="Kwitansi hanya untuk pembayaran yang sudah diterima." />;

  const occ = d.occById.get(inv.occupant_id);
  const no = receiptNumber(p);
  const words = terbilang(p.amount);
  const msg = `Halo ${occ?.name || ''}, terima kasih. Pembayaran Anda sudah kami terima:\n\nNo. ${no}\n${invTitle(inv)} · Kamar ${d.roomCode(inv.room_id)}\nJumlah: ${rp(p.amount)}\nTanggal: ${tgl(p.paid_at)}\nSisa tagihan ini: ${rp(inv.outstanding)}\n\n— ${kos.name}`;

  return (
    <div className="stack">
      <div className="row between noprint">
        <Link href="/tagihan"><button className="ghost">← Tagihan</button></Link>
        <div className="row">
          {occ?.phone && <a href={waLink(occ.phone, msg)} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>}
          <PrintReceiptButton kosId={kos.id} renderText={() => kwitansiText(kos, p, inv, occ?.name || '—', d.roomCode(inv.room_id))}>Cetak via printer default</PrintReceiptButton>
          <ReceiptFile key={p.id} kos={kos} p={p} inv={inv} occ={occ} room={d.roomCode(inv.room_id)} />
          <button onClick={() => window.print()}>Cetak kuitansi</button>
        </div>
      </div>
      <p className="small muted noprint" style={{ margin: 0 }}>Jika perangkat tidak mendukung berbagi file, unduh PDF lalu lampirkan ke pesan WhatsApp.</p>

      <section className="panel" style={{ gap: 16 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="brand"><LogoMark size={30} /><div><b style={{ fontSize: 18 }}>{kos.name}</b>{kos.address && <div className="small muted">{kos.address}</div>}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>Kwitansi</div><div className="small muted">No. {no}</div></div>
        </div>
        <dl className="kv" style={{ fontSize: 15 }}>
          <dt>Telah terima dari</dt><dd>{occ?.name || '—'}</dd>
          <dt>Kamar</dt><dd>{d.roomCode(inv.room_id)}</dd>
          <dt>Untuk pembayaran</dt><dd>{invTitle(inv)}</dd>
          <dt>Tanggal bayar</dt><dd>{tgl(p.paid_at)}</dd>
          <dt>Metode</dt><dd>{METHOD[p.method]}{p.ref ? ` · ${p.ref}` : ''}</dd>
        </dl>
        <div style={{ background: 'var(--sunk)', borderRadius: 10, padding: '12px 14px' }}>
          <div className="label">Jumlah</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{rp(p.amount)}</div>
          <div className="small muted" style={{ fontStyle: 'italic', textTransform: 'capitalize' }}>{words} rupiah</div>
        </div>
        <dl className="kv">
          <dt>Total tagihan</dt><dd>{rp(inv.amount)}</dd>
          <dt>Sisa tagihan</dt><dd>{inv.outstanding > 0 ? rp(inv.outstanding) : 'Lunas'}</dd>
        </dl>
        <div className="row between" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <span className="small muted">Dibuat dengan PRASARA</span>
          <div style={{ textAlign: 'center', minWidth: 160 }}>
            <div className="small muted">{tgl(p.paid_at)}</div>
            <div style={{ height: 56 }} />
            <div style={{ borderTop: '1px solid var(--fg)', paddingTop: 4, fontWeight: 700 }}>Pengelola {kos.name}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReceiptFile({ kos,p,inv,occ,room }) {
  const [ready,setReady] = useState(null);
  const [error,setError] = useState(null);
  useEffect(() => {
    let active = true;
    import('@/lib/pdfExport').then(({ makePdf }) => makePdf({
      title: 'Kuitansi Pembayaran', business: kos.name, type: 'properti', subtitle: receiptNumber(p),
      exported_at: new Date().toLocaleString('id-ID',{ timeZone:'Asia/Jakarta' }),
      note: 'Bukti penerimaan pembayaran yang terverifikasi di PRASARA.',
      sheets: [{ name:'Rincian pembayaran', cols:['Keterangan','Isi'], types:['s','s'], rows:[
        ['Penghuni',occ?.name || '—'],['Kamar',room],['Tagihan',invTitle(inv)],['Tanggal bayar',tgl(p.paid_at)],
        ['Metode',METHOD[p.method]],['Referensi',p.ref],['Jumlah diterima',rp(p.amount)],['Sisa tagihan',rp(inv.outstanding)],
      ] }],
    })).then((blob) => {
      if (active) setReady(new File([blob], `Kuitansi-${receiptNumber(p)}.pdf`, { type:'application/pdf' }));
    }).catch((err) => { if (active) setError(errMsg(err)); });
    return () => { active = false; };
  }, [kos,p,inv,occ,room]);
  const shareable = ready && typeof navigator !== 'undefined' && navigator.canShare?.({ files:[ready] });
  function download() {
    const href = URL.createObjectURL(ready);
    const a = document.createElement('a');
    a.href = href; a.download = ready.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href),30000);
  }
  return <>
    <button disabled={!ready} onClick={download}>Unduh kuitansi PDF</button>
    {shareable && <button onClick={() => navigator.share({ title:receiptNumber(p), files:[ready] }).catch((err) => {
      if (err.name !== 'AbortError') toast(errMsg(err));
    })}>Bagikan PDF</button>}
    {error && <small role="alert">{error}</small>}
  </>;
}
