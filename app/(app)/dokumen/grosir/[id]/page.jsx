'use client';
// Dokumen grosir untuk dicetak / disimpan PDF / dikirim WA: Penawaran / Pesanan, Surat jalan (?sj=), Faktur (?faktur=).
// Data dari so_document (izin sell/finance di server).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loading, Empty } from '@/components/ui';
import { rp, angka, tgl, waLink, errMsg } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';
import { logoUrl } from '@/lib/logo';

const PAY = { kasbon: 'Tempo (piutang)', tunai: 'Tunai', transfer: 'Transfer', campuran: 'Campuran' };

export default function DokumenGrosir() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState({});
  useEffect(() => {
    try { const s = new URLSearchParams(window.location.search); setQ({ sj: s.get('sj'), faktur: s.get('faktur') }); } catch {}
    supabase.rpc('so_document', { p_order: id }).then(({ data, error }) => (error ? (/tidak ditemukan/i.test(error.message) ? setD({ missing: true }) : setErr(errMsg(error))) : setD(data)));
  }, [id]);
  if (err) return <div className="notice bad">{/so_document/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (d.missing) return <Empty title="Dokumen tidak ditemukan" />;

  const { order: o, business: b, customer: c } = d;
  const dvId = q.sj || q.faktur;
  const dv = dvId ? d.deliveries.find((x) => x.id === dvId) : null;
  const kind = q.faktur && dv ? 'faktur' : q.sj && dv ? 'sj' : o.status === 'penawaran' ? 'penawaran' : 'pesanan';
  const lineById = new Map(d.lines.map((l) => [l.id, l]));
  const rows = dv ? dv.lines.map((x) => ({ ...lineById.get(x.line_id), qty: Number(x.qty) })).filter((r) => r.name) : d.lines.map((l) => ({ ...l, qty: Number(l.qty) }));
  const sum = rows.reduce((a, r) => a + r.qty * Number(r.price), 0);
  const inv = dv?.invoice;
  const title = { penawaran: 'PENAWARAN HARGA', pesanan: 'PESANAN PENJUALAN', sj: 'SURAT JALAN', faktur: 'FAKTUR' }[kind];
  const number = kind === 'faktur' ? inv?.number : kind === 'sj' ? dv.number : o.number;
  const date = kind === 'faktur' ? inv?.date : kind === 'sj' ? dv.ship_date : o.order_date;
  const total = kind === 'faktur' && inv ? Number(inv.total) : sum;
  const msg = `Halo ${c?.name || ''}, berikut ${title.toLowerCase()} ${number} dari ${b.name}:\n\n` +
    rows.map((r) => `• ${r.name} ${angka(r.qty)} ${r.unit}${kind === 'sj' ? '' : ` × ${rp(r.price)} = ${rp(r.qty * Number(r.price))}`}`).join('\n') +
    (kind === 'sj' ? '' : `\n\nTotal ${rp(total)}`) +
    (kind === 'faktur' && inv?.pay_method === 'kasbon' && inv?.due_date ? `\nJatuh tempo ${tgl(inv.due_date)}` : '') +
    (kind === 'penawaran' && o.valid_until ? `\nBerlaku sampai ${tgl(o.valid_until)}` : '') +
    (kind === 'faktur' && b.payment_info ? `\n\nPembayaran:\n${b.payment_info}` : '') + `\n\nTerima kasih.`;
  const otherDocs = d.deliveries.filter((x) => x.status !== 'gagal');

  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="row between noprint" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href="/grosir"><button className="ghost">← Pesanan grosir</button></Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {c?.phone && <a href={waLink(c.phone, msg)} target="_blank" rel="noreferrer"><button>Kirim WA</button></a>}
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>
      {otherDocs.length > 0 && <div className="row noprint" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Link href={`/dokumen/grosir/${o.id}`}><button className={'sm' + (!dv ? ' primary' : '')}>{o.status === 'penawaran' ? 'Penawaran' : 'Pesanan'}</button></Link>
        {otherDocs.map((x) => <span key={x.id} className="row" style={{ gap: 6 }}>
          <Link href={`/dokumen/grosir/${o.id}?sj=${x.id}`}><button className={'sm' + (q.sj === x.id ? ' primary' : '')}>SJ {x.number.slice(-3)}</button></Link>
          <Link href={`/dokumen/grosir/${o.id}?faktur=${x.id}`}><button className={'sm' + (q.faktur === x.id ? ' primary' : '')}>Faktur {x.number.slice(-3)}</button></Link></span>)}
      </div>}
      <p className="small muted noprint" style={{ margin: 0 }}>Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapat file PDF.</p>

      <section className="panel gdoc" style={{ gap: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
            {logoUrl(b.logo) && <img src={logoUrl(b.logo)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
            <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b>
              {b.address && <div className="small muted">{b.address}</div>}
              {b.phone && <div className="small muted">WA {b.phone}</div>}
              {b.npwp && <div className="small muted">NPWP {b.npwp}</div>}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.02em' }}>{title}</div>
            <div className="small">No. <b>{number}</b></div><div className="small muted">{tgl(date)}</div></div>
        </div>

        <div className="gdoc-two">
          <div><span className="label">{kind === 'sj' ? 'Dikirim ke' : 'Kepada'}</span><div><b>{c?.name}</b></div>
            {(kind === 'sj' ? o.ship_address : c?.address || o.ship_address) && <div className="small">{kind === 'sj' ? o.ship_address : c?.address || o.ship_address}</div>}
            {c?.phone && <div className="small muted">{c.phone}</div>}{c?.npwp && kind === 'faktur' && <div className="small muted">NPWP {c.npwp}</div>}</div>
          <dl className="kv small" style={{ alignContent: 'start' }}>
            {kind !== 'penawaran' && kind !== 'pesanan' && <><dt>Pesanan</dt><dd>{o.number}</dd></>}
            {o.customer_ref && <><dt>No. PO</dt><dd>{o.customer_ref}</dd></>}
            {kind === 'faktur' && dv && <><dt>Surat jalan</dt><dd>{dv.number}</dd></>}
            {kind === 'sj' && inv && <><dt>Faktur</dt><dd>{inv.number}</dd></>}
            {kind === 'sj' && dv.driver && <><dt>Sopir</dt><dd>{dv.driver}</dd></>}
            {kind === 'sj' && dv.vehicle && <><dt>Kendaraan</dt><dd>{dv.vehicle}</dd></>}
            {kind === 'penawaran' && o.valid_until && <><dt>Berlaku sampai</dt><dd>{tgl(o.valid_until)}</dd></>}
            {(kind === 'penawaran' || kind === 'pesanan') && o.terms_days != null && <><dt>Pembayaran</dt><dd>tempo {o.terms_days} hari</dd></>}
            {kind === 'faktur' && inv && <><dt>Pembayaran</dt><dd>{PAY[inv.pay_method] || inv.pay_method}</dd></>}
            {kind === 'faktur' && inv?.pay_method === 'kasbon' && inv?.due_date && <><dt>Jatuh tempo</dt><dd>{tgl(inv.due_date)}</dd></>}
          </dl>
        </div>

        {kind === 'faktur' && inv?.status === 'batal' && <div className="notice bad">Faktur ini sudah DIBATALKAN.</div>}
        <table className="gdoc-t">
          <thead><tr><th>No</th><th>Barang</th><th className="r">Jumlah</th>{kind !== 'sj' && <><th className="r">Harga</th><th className="r">Subtotal</th></>}{kind === 'sj' && <th className="r">Cek</th>}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id + i}><td>{i + 1}</td><td>{r.name}</td><td className="r">{angka(r.qty)} {r.unit}</td>
              {kind !== 'sj' ? <><td className="r">{angka(r.price)}</td><td className="r">{angka(r.qty * Number(r.price))}</td></> : <td className="r">☐</td>}</tr>
          ))}</tbody>
          {kind !== 'sj' && <tfoot>
            {kind === 'faktur' && Number(inv?.tax) > 0 && <tr><td colSpan={4} className="r">Termasuk PPN {angka(inv.tax_rate)}%</td><td className="r">{angka(inv.tax)}</td></tr>}
            <tr><td colSpan={4} className="r"><b>Total</b></td><td className="r"><b>{angka(total)}</b></td></tr>
          </tfoot>}
        </table>
        {kind !== 'sj' && <div className="small"><i>Terbilang: {terbilang(total)} rupiah</i></div>}
        {o.note && kind !== 'sj' && <div className="small">Catatan: {o.note}</div>}
        {kind === 'sj' && dv.note && <div className="small">Catatan: {dv.note}</div>}
        {kind === 'faktur' && b.payment_info && <div className="small" style={{ whiteSpace: 'pre-wrap' }}><b>Pembayaran ke:</b>{'\n'}{b.payment_info}</div>}
        {kind === 'penawaran' && <div className="small muted">Harga dapat berubah setelah masa berlaku. Stok mengikuti ketersediaan saat pesanan dikonfirmasi.</div>}

        <div className="gdoc-sign">
          {kind === 'sj' ? <>
            <div><span className="small">Pengirim</span><div className="gdoc-line">{dv.driver || ''}</div></div>
            <div><span className="small">Penerima</span><div className="gdoc-line">{dv.recipient || ''}</div></div>
          </> : <>
            <div><span className="small">{kind === 'faktur' ? 'Penerima' : 'Disetujui pelanggan'}</span><div className="gdoc-line" /></div>
            <div><span className="small">Hormat kami,</span><div className="gdoc-line">{b.name}</div></div>
          </>}
        </div>
        {b.footer && <div className="small muted" style={{ textAlign: 'center', whiteSpace: 'pre-wrap' }}>{b.footer}</div>}
      </section>
    </div>
  );
}
