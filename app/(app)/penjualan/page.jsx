'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run } from '@/components/ui';
import { rp, angka, tgl, today, errMsg } from '@/lib/format';
import { PAY, jam } from '@/lib/retail';

const shift = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Riwayat penjualan per hari: omzet, laba kotor, kasbon; ketuk untuk detail, struk, atau batalkan
export default function Penjualan() {
  const { kosId, ver } = useKos();
  const [day, setDay] = useState(today());
  const [rows, setRows] = useState(null);
  const [contacts, setContacts] = useState(new Map());
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = async () => {
    const [s, c] = await Promise.all([
      supabase.from('sales').select('*').eq('kos_id', kosId).eq('sale_date', day).order('sold_at', { ascending: false }),
      supabase.from('contacts').select('id,name').eq('kos_id', kosId),
    ]);
    if (s.error) return setErr(errMsg(s.error));
    setContacts(new Map((c.data || []).map((x) => [x.id, x.name])));
    setRows(s.data);
  };
  useEffect(() => { setRows(null); load(); }, [kosId, ver, day]);
  if (err) return <div className="notice bad">{err.includes('sales') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;

  const ok = (rows || []).filter((s) => s.status === 'selesai');
  const omzet = ok.reduce((a, s) => a + Number(s.total), 0);
  const laba = ok.reduce((a, s) => a + Number(s.total) - Number(s.cost_total), 0);
  const kasbon = ok.filter((s) => s.pay_method === 'kasbon').reduce((a, s) => a + Number(s.total), 0);
  const noCost = ok.some((s) => Number(s.cost_total) === 0 && Number(s.total) > 0);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Penjualan</h2><PageHelp page="penjualan" /></div><Link href="/kasir"><button className="primary">+ Transaksi</button></Link></div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button className="sm" onClick={() => setDay(shift(day, -1))} aria-label="Hari sebelumnya">‹</button>
        <b style={{ flex: 1, textAlign: 'center' }}>{day === today() ? 'Hari ini, ' : ''}{tgl(day)}</b>
        <button className="sm" onClick={() => setDay(shift(day, 1))} disabled={day >= today()} aria-label="Hari berikutnya">›</button>
      </div>
      {!rows ? <Loading /> : <>
        <div className="grid">
          <Tile label="Omzet" value={rp(omzet)} sub={`${ok.length} transaksi`} />
          <Tile label="Laba kotor" value={rp(laba)} sub={noCost ? 'ada barang tanpa harga modal' : 'omzet − modal barang'} />
          <Tile label="Kasbon" value={rp(kasbon)} sub="belum diterima" />
        </div>
        {rows.length === 0 ? <Empty title="Belum ada penjualan" text="Transaksi dari menu Kasir muncul di sini." /> : (
          <section className="panel"><div className="list">{rows.map((s) => (
            <button className="li click" key={s.id} onClick={() => setOpen(s)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
              <div className="main"><b>{s.number}{s.status === 'batal' && <span className="chip void" style={{ marginLeft: 6 }}>Batal</span>}</b>
                <span className="small muted">{jam(s.sold_at)} · {PAY[s.pay_method]}{s.contact_id ? ` · ${contacts.get(s.contact_id) || ''}` : ''}</span></div>
              <b style={{ textDecoration: s.status === 'batal' ? 'line-through' : 'none' }}>{rp(s.total)}</b>
            </button>
          ))}</div></section>
        )}
      </>}
      {open && <Detail s={open} contact={contacts.get(open.contact_id)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Detail({ s, contact, onClose, onChanged }) {
  const [lines, setLines] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { supabase.from('sale_lines').select('*').eq('sale_id', s.id).then(({ data }) => setLines(data || [])); }, [s.id]);
  const doVoid = async () => {
    if (await run(() => supabase.rpc('sale_void', { p_sale: s.id, p_reason: reason }), 'Transaksi dibatalkan, stok dikembalikan', errMsg)) onChanged();
  };
  return (
    <Sheet title={s.number} onClose={onClose}>
      <span className="small muted">{tgl(s.sale_date)} {jam(s.sold_at)} · {PAY[s.pay_method]}{contact ? ` · ${contact}` : ''}{s.tier === 'grosir' ? ' · harga grosir' : ''}</span>
      {s.status === 'batal' && <div className="notice bad">Dibatalkan: {s.void_reason}</div>}
      {!lines ? <Loading /> : <div className="list">{lines.map((l) => (
        <div className="li" key={l.id}><div className="main"><b className="small">{l.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}</span></div><b className="small">{rp(l.line_total)}</b></div>
      ))}</div>}
      {Number(s.discount) > 0 && <div className="row between"><span>Diskon</span><span>−{rp(s.discount)}</span></div>}
      <div className="row between"><b>Total</b><b>{rp(s.total)}</b></div>
      <div className="row between small muted"><span>Laba kotor</span><span>{rp(Number(s.total) - Number(s.cost_total))}</span></div>
      <Link href={`/struk/${s.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      {s.status === 'selesai' && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>Batalkan transaksi</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang dikembalikan" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>Ya, batalkan & kembalikan stok</button>
      </>)}
    </Sheet>
  );
}
