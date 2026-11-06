'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { waLink, errMsg } from '@/lib/format';
import { strukText } from '@/lib/struk';

export default function Struk() {
  const { id } = useParams();
  const { kos } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      const s = await supabase.from('sales').select('*').eq('id', id).maybeSingle();
      if (s.error) return setErr(errMsg(s.error));
      if (!s.data) return setD({ missing: true });
      const [l, c] = await Promise.all([
        supabase.from('sale_lines').select('*').eq('sale_id', id),
        s.data.contact_id ? supabase.from('contacts').select('*').eq('id', s.data.contact_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setD({ s: s.data, lines: l.data || [], contact: c.data });
    })();
  }, [id]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  if (d.missing) return <Empty title="Struk tidak ditemukan" />;
  const text = strukText(kos, d.s, d.lines, d.contact);
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="row between noprint"><h2>Struk</h2><Link href="/penjualan" className="small">← Penjualan</Link></div>
      <pre className="struk">{text}</pre>
      <div className="row noprint">
        <button className="primary" onClick={() => window.print()}>Cetak</button>
        <a href={d.contact?.phone ? waLink(d.contact.phone, '```\n' + text + '\n```') : `https://wa.me/?text=${encodeURIComponent('```\n' + text + '\n```')}`} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>
        <Link href="/kasir"><button className="ghost">Transaksi baru</button></Link>
      </div>
    </div>
  );
}
