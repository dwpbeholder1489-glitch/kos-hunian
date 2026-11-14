'use client';
// Cara bayar di halaman bisnis publik (rekening, metode, QRIS) — hanya tampil bila pemilik menyalakan
// "Tampilkan rekening/QRIS di halaman bisnis" dan isinya ada (dicek di server: public_pay_info).
import { useEffect, useState } from 'react';
import Linkify from '@/components/Linkify';

export function usePublicPay(slug) {
  const [pay, setPay] = useState(null);
  useEffect(() => {
    if (!slug) return;
    fetch('/api/publik/kirim?pay=' + encodeURIComponent(slug)).then((r) => r.json()).then((d) => setPay(d?.pay || null)).catch(() => {});
  }, [slug]);
  return pay;
}

export function PayBox({ pay, title = 'Cara bayar', note }) {
  if (!pay || !(pay.payment_info || pay.qris)) return null;
  const methods = Array.isArray(pay.methods) ? pay.methods.filter(Boolean) : [];
  return (
    <div className="unitbox" style={{ gap: 6 }}>
      <b className="small">{title}</b>
      {methods.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{methods.map((m) => <span key={m} className="chip">{m}</span>)}</div>}
      {pay.payment_info && <span className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><Linkify text={pay.payment_info} /></span>}
      {pay.qris && <img src={pay.qris} alt="QRIS" className="qris" />}
      {pay.rules && <span className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{pay.rules}</span>}
      <span className="small muted">{note || 'Pastikan nama penerima sesuai sebelum membayar. Simpan bukti transfer dan kirimkan lewat WhatsApp bila diminta.'}</span>
    </div>
  );
}

export default function PublicPay({ slug, title, note, panel }) {
  const pay = usePublicPay(slug);
  if (!pay || !(pay.payment_info || pay.qris)) return null;
  const box = <PayBox pay={pay} title={title} note={note} />;
  return panel ? <section className="panel">{box}</section> : box;
}
