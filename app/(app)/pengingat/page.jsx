'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, run } from '@/components/ui';
import { rp, angka, tgl, today, errMsg, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';
import { alertCount } from '@/components/RetailBell';

const due = (d) => { const n = Math.round((Date.parse(d) - Date.parse(today())) / 864e5); return n < 0 ? `lewat ${-n} hari` : n === 0 ? 'hari ini' : `${n} hari lagi`; };

// Pengingat toko: hal yang perlu ditindaklanjuti hari ini
export default function Pengingat() {
  const { kosId, kos, user, ver, loadKos } = useKos();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { supabase.rpc('retail_alerts', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setA(data))); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/retail_alerts/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!a) return <Loading />;
  const isOwner = kos.owner_id === user?.id;
  const Sec = ({ title, list, children }) => list.length > 0 && <section className="panel"><h3>{title} ({list.length})</h3><div className="list">{children}</div></section>;

  return (
    <div className="stack">
      <div className="row"><h2>Pengingat toko</h2><PageHelp page="pengingat" /></div>
      {alertCount(a) === 0 && <Empty title="Semua aman" text="Tidak ada stok menipis, pesanan terlambat, atau kasbon/utang jatuh tempo." />}
      <Sec title="🔴 Stok habis" list={a.habis}>{a.habis.map((p) => <div className="li" key={p.id}><span>{p.name}</span><span className="chip bad">{angka(p.stock)} {p.unit}</span></div>)}</Sec>
      <Sec title="🟡 Stok menipis" list={a.menipis}>{a.menipis.map((p) => <div className="li" key={p.id}><span>{p.name}</span><span className="small">{angka(p.stock)} / min {angka(p.min)} {p.unit}</span></div>)}</Sec>
      {(a.habis.length > 0 || a.menipis.length > 0) && canArea(kos, 'stock') && <Link href="/belanja"><button className="primary" style={{ width: '100%' }}>Pesan / belanja barang</button></Link>}
      <Sec title="📦 Pesanan belum datang (lewat perkiraan)" list={a.pesanan}>{a.pesanan.map((b) => <div className="li" key={b.id}><span>{b.number} · {b.supplier || 'tanpa supplier'}</span><span className="small">perkiraan {tgl(b.expected)}</span></div>)}</Sec>
      <Sec title="💰 Kasbon pelanggan jatuh tempo" list={a.kasbon}>{a.kasbon.map((c) => (
        <div className="li" key={c.id}>
          <div className="main"><b className="small">{c.name}</b><span className="small muted">{rp(c.sisa)} · {due(c.due)}</span></div>
          {c.phone && <a href={waLink(c.phone, `Halo ${c.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(c.sisa)}, janji bayar ${tgl(c.due)}. Terima kasih.`)} target="_blank" rel="noreferrer"><button className="sm">Ingatkan WA</button></a>}
        </div>
      ))}</Sec>
      <Sec title="🧾 Utang ke supplier jatuh tempo" list={a.utang}>{a.utang.map((c) => <div className="li" key={c.id}><span className="small"><b>{c.name}</b> · {rp(c.sisa)}</span><span className="small">{due(c.due)}</span></div>)}</Sec>
      {(a.kasbon.length > 0 || a.utang.length > 0) && <Link href="/kas"><button style={{ width: '100%' }}>Buka Kas & kasbon</button></Link>}
      {isOwner && kos.daily_digest !== undefined && (
        <section className="panel">
          <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={kos.daily_digest !== false}
            onChange={async (e) => { const v = e.target.checked; if (await run(() => supabase.from('kos').update({ daily_digest: v }).eq('id', kos.id), v ? 'Email pagi dinyalakan' : 'Email pagi dimatikan', errMsg)) loadKos(); }} />
            Kirim pengingat ini ke {user?.email} setiap pagi pukul 07.00 (Paket Dasar ke atas, hanya bila ada yang perlu ditindaklanjuti)</label>
        </section>
      )}
      <span className="small muted">Stok menipis memakai "peringatan stok minimum" di setiap barang. Kasbon & utang muncul 3 hari sebelum janji bayar / jatuh tempo.</span>
    </div>
  );
}
