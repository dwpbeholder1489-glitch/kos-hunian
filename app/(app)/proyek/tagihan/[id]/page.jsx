'use client';
// Dokumen tagihan termin proyek: cetak (PDF) & kirim WA, berisi cara bayar bisnis. Data dari prj_invoice_get (izin finance di server).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { rp, angka, tgl, waLink, errMsg } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';
import { logoUrl } from '@/lib/logo';
import { invChip } from '@/components/ProyekTagihan';

export default function DokumenTagihanProyek() {
  const { id } = useParams();
  const { ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('prj_invoice_get', { p_id: id }).then(({ data, error }) => (error ? (/tidak ditemukan/i.test(error.message) ? setD({ missing: true }) : setErr(errMsg(error))) : setD(data)));
  }, [id, ver]);
  if (err) return <div className="notice bad">{/prj_invoice_get|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (d.missing) return <Empty title="Tagihan tidak ditemukan" />;
  const b = d.business || {};
  const c = d.customer;
  const left = Math.max(Number(d.amount) - Number(d.paid), 0);
  const st = invChip(d);
  const msg = `Halo ${c?.name || ''}, berikut tagihan ${d.number} dari ${b.name} untuk ${d.project.name}:\n\n${d.description}: ${rp(d.amount)}` +
    (Number(d.paid) > 0 ? `\nSudah dibayar: ${rp(d.paid)}\nSisa: ${rp(left)}` : '') +
    (d.due_date ? `\nJatuh tempo: ${tgl(d.due_date)}` : '') +
    (b.payment_info ? `\n\nPembayaran ke:\n${b.payment_info}` : '') + `\n\nMohon cantumkan nomor ${d.number} saat membayar. Terima kasih.`;
  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="row between noprint" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href={`/proyek/${d.project.id}`}><button className="ghost">← Proyek</button></Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {c?.phone && d.status === 'terbit' && <a href={waLink(c.phone, msg)} target="_blank" rel="noreferrer"><button>Kirim WA</button></a>}
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>
      <div className="row noprint" style={{ gap: 8, flexWrap: 'wrap' }}><span className={'chip ' + st[1]}>{st[0]}</span>{d.status === 'batal' && d.void_reason && <span className="small muted">Alasan: {d.void_reason}</span>}</div>
      <p className="small muted noprint" style={{ margin: 0 }}>Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapat file PDF.</p>

      <section className="panel gdoc" style={{ gap: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
            {logoUrl(b.logo) && <img src={logoUrl(b.logo)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
            <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b>
              {b.address && <div className="small muted">{b.address}</div>}
              {b.phone && <div className="small muted">WA {b.phone}</div>}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none', maxWidth: '50%' }}><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.02em' }}>TAGIHAN</div>
            <div className="small">No. <b>{d.number}</b></div><div className="small muted">{tgl(d.issue_date)}</div></div>
        </div>
        {d.status === 'batal' && <div className="notice bad">Tagihan ini sudah DIBATALKAN.</div>}
        <div className="gdoc-two">
          <div><span className="label">Kepada</span><div><b>{c?.name || '—'}</b></div>{c?.address && <div className="small">{c.address}</div>}{c?.phone && <div className="small muted">{c.phone}</div>}</div>
          <dl className="kv small" style={{ alignContent: 'start' }}>
            <dt>Proyek</dt><dd>{d.project.name}</dd>
            <dt>No. proyek</dt><dd>{d.project.number}</dd>
            {d.due_date && <><dt>Jatuh tempo</dt><dd>{tgl(d.due_date)}</dd></>}
          </dl>
        </div>
        <table className="gdoc-t">
          <thead><tr><th>Uraian</th><th className="r">Jumlah</th></tr></thead>
          <tbody><tr><td style={{ overflowWrap: 'anywhere' }}>{d.description}{d.milestone && d.milestone !== d.description ? <div className="small muted">Termin: {d.milestone}</div> : null}</td><td className="r">{angka(d.amount)}</td></tr></tbody>
          <tfoot>
            {Number(d.paid) > 0 && <><tr><td className="r">Sudah dibayar</td><td className="r">−{angka(d.paid)}</td></tr><tr><td className="r"><b>Sisa</b></td><td className="r"><b>{angka(left)}</b></td></tr></>}
            {Number(d.paid) === 0 && <tr><td className="r"><b>Total</b></td><td className="r"><b>{angka(d.amount)}</b></td></tr>}
          </tfoot>
        </table>
        <div className="small"><i>Terbilang: {terbilang(Number(Number(d.paid) > 0 ? left : d.amount))} rupiah</i></div>
        {d.project.value != null && <div className="small muted">Nilai kontrak {rp(d.project.value)} · total ditagih {rp(d.summary.billed)} · total diterima {rp(Number(d.summary.received) - Number(d.summary.refunded))}</div>}
        {d.note && <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Catatan: {d.note}</div>}
        {b.payment_info && d.status === 'terbit' && left > 0 && <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><b>Pembayaran ke:</b>{'\n'}{b.payment_info}{'\n'}Mohon cantumkan nomor {d.number}.</div>}
        {d.payments.length > 0 && <div className="small"><b>Pembayaran diterima:</b> {d.payments.map((y) => `${tgl(y.pay_date)} ${rp(y.amount)}`).join(' · ')}</div>}
        <div className="gdoc-sign">
          <div><span className="small">Diterima klien</span><div className="gdoc-line" /></div>
          <div><span className="small">Hormat kami,</span><div className="gdoc-line">{b.name}</div></div>
        </div>
        {b.footer && <div className="small muted" style={{ textAlign: 'center', whiteSpace: 'pre-wrap' }}>{b.footer}</div>}
      </section>
    </div>
  );
}
