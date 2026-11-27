'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { waLink, errMsg } from '@/lib/format';
import { notaText } from '@/lib/nota';
import { PrintReceiptButton } from '@/components/PrinterManager';

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
  const text = notaText(kos, o);
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="row between noprint"><h2>Nota</h2><Link href="/pesanan" className="small">← Pesanan</Link></div>
      <pre className="struk">{text}</pre>
      <div className="row noprint">
        <PrintReceiptButton kosId={kos.id} renderText={(paper) => notaText(kos, o, paper)} />
        <a href={o.customer_phone ? waLink(o.customer_phone, '```\n' + text + '\n```') : `https://wa.me/?text=${encodeURIComponent('```\n' + text + '\n```')}`} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>
      </div>
    </div>
  );
}
