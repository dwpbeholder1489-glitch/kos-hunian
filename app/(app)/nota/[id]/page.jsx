'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { waLink, errMsg, rp, angka } from '@/lib/format';
import { waktu, hari, stageLabel, sisa } from '@/lib/jasa';

const W = 32;
const lr = (l, r) => { l = String(l); r = String(r); return l.length + r.length + 1 > W ? l + '\n' + ' '.repeat(Math.max(0, W - r.length)) + r : l + ' '.repeat(W - l.length - r.length) + r; };
const center = (t) => ' '.repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t;

// Nota/tiket pesanan jasa: untuk dicetak (printer struk 58mm) atau dikirim ke WhatsApp pelanggan
export default function Nota() {
  const { id } = useParams();
  const { kos, kosId } = useKos();
  const [o, setO] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!kosId) return;
    supabase.rpc('svc_board', { p_kos: kosId }).then(async ({ data, error }) => {
      if (error) return setErr(errMsg(error));
      let x = data.orders.find((y) => y.id === id);
      if (!x) { // pesanan lama (lebih dari 30 hari) dibaca langsung
        const { data: r } = await supabase.from('svc_orders').select('*, svc_order_lines(*)').eq('id', id).maybeSingle();
        const { data: pays } = await supabase.from('svc_payments').select('kind,amount,status').eq('order_id', id);
        if (r) x = { ...r, lines: r.svc_order_lines, paid: (pays || []).filter((p) => p.status === 'selesai').reduce((a, p) => a + (p.kind === 'bayar' ? 1 : -1) * Number(p.amount), 0) };
      }
      setO(x || { missing: true });
    });
  }, [id, kosId]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!o) return <Loading />;
  if (o.missing) return <Empty title="Nota tidak ditemukan" />;
  const text = [
    center(kos.name.slice(0, W)), kos.address ? center(kos.address.slice(0, W)) : null, kos.contact_phone ? center('WA ' + kos.contact_phone) : null, '-'.repeat(W),
    lr('No', o.number), lr('Terima', waktu(o.received_at)), lr('Janji', hari(o.due_at)), lr('Pelanggan', o.customer_name.slice(0, 20)), '-'.repeat(W),
    ...(o.lines || []).flatMap((l) => [l.name, lr(`  ${angka(l.charge_qty)} ${l.unit} x ${rp(l.price)}`, rp(l.line_total)), l.note ? `  (${l.note})` : null]),
    '-'.repeat(W),
    Number(o.discount) > 0 ? lr('Diskon', '-' + rp(o.discount)) : null,
    Number(o.delivery_fee) > 0 ? lr('Antar-jemput', rp(o.delivery_fee)) : null,
    lr('TOTAL', rp(o.total)), lr('Dibayar', rp(o.paid || 0)), lr(sisa(o) > 0 ? 'SISA' : 'Status', sisa(o) > 0 ? rp(sisa(o)) : 'LUNAS'),
    '-'.repeat(W), `Status: ${stageLabel(o)}`, o.deliver ? `Diantar: ${o.address || '-'}` : 'Diambil di tempat', kos.receipt_footer ? '' : null, kos.receipt_footer || null,
    center('Simpan nota ini untuk pengambilan'),
  ].filter((x) => x != null).join('\n');
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="row between noprint"><h2>Nota</h2><Link href="/pesanan" className="small">← Pesanan</Link></div>
      <pre className="struk">{text}</pre>
      <div className="row noprint">
        <button className="primary" onClick={() => window.print()}>Cetak</button>
        <a href={o.customer_phone ? waLink(o.customer_phone, '```\n' + text + '\n```') : `https://wa.me/?text=${encodeURIComponent('```\n' + text + '\n```')}`} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>
      </div>
    </div>
  );
}
