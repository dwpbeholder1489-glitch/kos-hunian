'use client';
// Layar dapur (Kuliner): pesanan aktif per tahap, tombol besar ke tahap berikutnya. Tanpa angka uang (aman untuk petugas dapur).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, toast } from '@/components/ui';
import { angka, errMsg } from '@/lib/format';
import { isKul } from '@/lib/jasa';

const menit = (ts) => Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
const umur = (ts) => { const m = menit(ts); return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`; };

export default function Dapur() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [, tick] = useState(0);
  const load = () => supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); const t = setInterval(() => { load(); tick((x) => x + 1); }, 20000); return () => clearInterval(t); }, [kosId, ver]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  if (!isKul(kos)) return <Empty title="Layar dapur khusus bisnis Kuliner" text="Untuk jasa lain, pakai menu Pesanan." />;
  // Antrean dapur: diterima & diproses (pesanan antar yang belum berangkat tetap tampil sampai siap)
  const queue = d.orders.filter((o) => ['diterima', 'proses'].includes(o.status)).sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  const ready = d.orders.filter((o) => o.status === 'siap');
  const cols = [{ id: 'baru', name: 'Baru masuk', list: queue.filter((o) => o.status === 'diterima') },
    ...d.stages.map((s) => ({ id: s.id, name: s.name, list: queue.filter((o) => o.stage_id === s.id) }))];
  const next = (o) => { if (o.status === 'diterima') return d.stages[0]?.name || 'Siap'; const i = d.stages.findIndex((s) => s.id === o.stage_id); return d.stages[i + 1]?.name || 'Siap'; };
  const move = async (o, to = 'next') => {
    setBusy(o.id);
    const { data, error } = await supabase.rpc('svc_order_move', { p_order: o.id, p_to: to, p_note: null });
    setBusy(null);
    if (error) return toast(errMsg(error));
    toast(`${o.number}: ${data.stage}`); load();
  };
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Dapur</h2><PageHelp page="dapur" /></div><button className="sm ghost" onClick={load}>Muat ulang</button></div>
      <span className="small muted">Pesanan terlama di atas. Layar memuat ulang sendiri tiap 20 detik.</span>
      {queue.length === 0 && ready.length === 0 && <Empty title="Belum ada pesanan untuk dimasak" text="Pesanan baru dari kasir atau halaman bisnis (setelah dikonfirmasi) muncul di sini." />}
      {cols.filter((c) => c.list.length).map((c) => (
        <section key={c.id} className="stack" style={{ gap: 8 }}>
          <span className="label">{c.name} ({c.list.length})</span>
          {c.list.map((o) => (
            <div key={o.id} className="panel stack" style={{ gap: 6, borderColor: menit(o.received_at) > 30 ? 'var(--bad)' : undefined }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}>
                <b style={{ fontSize: 18 }}>{o.dine === 'tempat' ? `Meja ${o.table_no || '—'}` : o.deliver ? '🛵 Antar' : '🥡 Bungkus'}</b>
                <span className="small" style={{ color: menit(o.received_at) > 30 ? 'var(--bad)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{umur(o.received_at)}</span>
              </div>
              <span className="small muted">{o.number} · {o.customer_name}</span>
              <div className="list">{(o.lines || []).map((l, i) => (
                <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 16 }}><b>{angka(l.qty)}×</b> {l.name}{l.note ? <span className="small" style={{ display: 'block', color: 'var(--gold)' }}>↳ {l.note}</span> : null}</span></div>
              ))}</div>
              {o.note && <span className="small" style={{ color: 'var(--gold)' }}>Catatan: {o.note}</span>}
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="cta" style={{ flex: 1 }} disabled={busy === o.id} onClick={() => move(o)}>→ {next(o)}</button>
                {o.status === 'proses' && <button className="sm ghost" disabled={busy === o.id} onClick={() => move(o, 'siap')}>Langsung siap</button>}
              </div>
            </div>
          ))}
        </section>
      ))}
      {ready.length > 0 && <>
        <span className="label">Siap disajikan / diambil ({ready.length})</span>
        <section className="panel"><div className="list">{ready.map((o) => (
          <div key={o.id} className="li"><span className="small"><b>{o.dine === 'tempat' ? `Meja ${o.table_no || '—'}` : o.deliver ? 'Antar' : 'Bungkus'}</b> · {o.number} · {o.customer_name}</span>
            <Link href="/pesanan" className="small">Serahkan di Pesanan →</Link></div>
        ))}</div></section>
        <span className="small muted">Penyerahan & pembayaran dicatat kasir di menu Pesanan (petugas dapur tidak melihat uang).</span>
      </>}
    </div>
  );
}
