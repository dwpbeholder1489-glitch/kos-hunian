'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import { HELP_CATS, searchHelp } from '@/lib/help';
import { BUSINESS } from '@/lib/plan';

export default function Bantuan() {
  const { kos } = useKos();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const hasil = useMemo(() => searchHelp(q), [q]);
  const wa = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(`Halo tim Kos Hunian, saya pemilik ${kos?.name || 'kos'}. Saya butuh bantuan: `)}`;

  const Item = ({ h }) => (
    <div className="li" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <button className="ghost" style={{ textAlign: 'left', padding: '4px 0', minHeight: 40, color: 'var(--fg)', display: 'flex', justifyContent: 'space-between', gap: 8 }}
        aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}>
        <span>{h.q}</span><span className="muted">{open === h.id ? '−' : '+'}</span>
      </button>
      {open === h.id && (
        <div className="stack" style={{ gap: 8, paddingBottom: 6 }}>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{h.a.map((s) => <li key={s}>{s}</li>)}</ol>
          {h.tip && <div className="notice">{h.tip}</div>}
          <div className="row">
            <Link href={h.href}><button className="sm primary">Buka menunya</button></Link>
            <Link href={`/panduan#langkah-${h.step}`} className="small">Lihat dengan gambar →</Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="stack">
      <h2>Pusat bantuan</h2>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik pertanyaan, mis. penghuni lama, kwitansi, prive" aria-label="Cari bantuan" />
      {q.trim() ? (
        <section className="panel">
          <span className="label">{hasil.length ? `${hasil.length} jawaban` : 'Belum ada jawaban untuk kata itu'}</span>
          <div className="list">{hasil.map((h) => <Item key={h.id} h={h} />)}</div>
        </section>
      ) : HELP_CATS.map(([cat, name]) => (
        <section className="panel" key={cat}>
          <h3>{name}</h3>
          <div className="list">{hasil.filter((h) => h.cat === cat).map((h) => <Item key={h.id} h={h} />)}</div>
        </section>
      ))}
      <section className="panel" style={{ textAlign: 'center', alignItems: 'center' }}>
        <b>Belum terjawab?</b>
        <span className="small muted">Kirim pertanyaan lewat WhatsApp. Kami balas paling lambat 1×24 jam pada hari kerja.</span>
        <a href={wa} target="_blank" rel="noreferrer"><button className="primary">Tanya via WhatsApp</button></a>
        <Link href="/panduan" className="small">Baca panduan lengkap bergambar →</Link>
      </section>
    </div>
  );
}
