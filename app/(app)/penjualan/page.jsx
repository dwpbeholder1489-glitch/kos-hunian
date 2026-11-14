'use client';
import { withApproval, requestApproval } from '@/lib/approval';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, tgl, today, errMsg } from '@/lib/format';
import { PAY, jam, qtyNum, uid, payLabel } from '@/lib/retail';

const REFUND = { tunai: 'Uang tunai dari laci', transfer: 'Transfer balik', kasbon: 'Potong kasbon' };
import { canArea } from '@/lib/business';

const shift = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Riwayat penjualan per hari: omzet, laba kotor, kasbon; ketuk untuk detail, struk, atau batalkan
export default function Penjualan() {
  const { kosId, ver, kos } = useKos();
  const fin = canArea(kos, 'finance');
  const [day, setDay] = useState(today());
  const [rows, setRows] = useState(null);
  const [contacts, setContacts] = useState(new Map());
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = async () => {
    // kasir hanya menerima penjualannya sendiri, tanpa harga modal (diatur database)
    const { data, error } = await supabase.rpc('sales_day', { p_kos: kosId, p_date: day });
    if (error) return setErr(errMsg(error));
    setContacts(new Map(data.filter((x) => x.contact_id).map((x) => [x.contact_id, x.contact_name])));
    setRows(data);
  };
  useEffect(() => { setRows(null); load(); }, [kosId, ver, day]);
  if (err) return <div className="notice bad">{err.includes('sales_day') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;

  const ok = (rows || []).filter((s) => s.status === 'selesai');
  const omzet = ok.reduce((a, s) => a + Number(s.total), 0);
  const laba = ok.reduce((a, s) => a + Number(s.total) - Number(s.cost_total), 0);
  const kasbon = ok.reduce((a, s) => a + Number(s.amt_kasbon ?? (s.pay_method === 'kasbon' ? s.total : 0)), 0);   // termasuk bagian kasbon dari bayar campuran
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
          {fin ? <Tile label="Laba kotor" value={rp(laba)} sub={noCost ? 'ada barang tanpa harga modal' : 'omzet − modal barang'} /> : <span className="small muted">Hanya penjualan Anda sendiri.</span>}
          <Tile label="Kasbon" value={rp(kasbon)} sub="belum diterima" />
        </div>
        {rows.length === 0 ? <Empty title="Belum ada penjualan" text="Transaksi dari menu Kasir muncul di sini." /> : (
          <section className="panel"><div className="list">{rows.map((s) => (
            <button className="li click" key={s.id} onClick={() => setOpen(s)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
              <div className="main"><b>{s.number}{s.status === 'batal' && <span className="chip void" style={{ marginLeft: 6 }}>Batal</span>}</b>
                <span className="small muted">{jam(s.sold_at)} · {payLabel(s)}{s.contact_id ? ` · ${contacts.get(s.contact_id) || ''}` : ''}{fin && s.cashier ? ` · ${s.cashier.split('@')[0]}` : ''}</span></div>
              <b style={{ textDecoration: s.status === 'batal' ? 'line-through' : 'none' }}>{rp(s.total)}</b>
            </button>
          ))}</div></section>
        )}
      </>}
      {open && <Detail fin={fin} onReturned={load} s={open} contact={contacts.get(open.contact_id)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Detail({ s, contact, onClose, onChanged, onReturned, fin }) {
  const [lines, setLines] = useState(null);
  const [rets, setRets] = useState([]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState(null); // {qty: {line_id: '1'}, refund, reason}
  const [busy, setBusy] = useState(false);
  const loadDetail = () => supabase.rpc('sale_detail', { p_sale: s.id }).then(({ data }) => { setLines(data?.lines || []); setRets(data?.returns || []); });
  useEffect(() => { loadDetail(); }, [s.id]);
  const left = (l) => Number(l.qty) - Number(l.returned || 0);
  const retTotal = ret && lines ? lines.reduce((a, l) => a + (qtyNum(ret.qty[l.id] || '') || 0) * Number(l.price) * (Number(s.subtotal) > 0 ? Number(s.total) / Number(s.subtotal) : 1), 0) : 0;
  const doReturn = async () => {
    const items = lines.map((l) => ({ line_id: l.id, qty: qtyNum(ret.qty[l.id] || '') || 0 })).filter((x) => x.qty > 0);
    if (!items.length) return toast('Isi jumlah barang yang dikembalikan.');
    setBusy(true);
    const req = { kos: s.kos_id, action: 'retur_penjualan', payload: { sale_id: s.id, lines: items, refund: ret.refund }, reason: ret.reason };
    const res = !fin ? ((await requestApproval(req)) ? 'diminta' : false)
      : await withApproval(() => supabase.rpc('sale_return_create', { p_id: ret.id, p_sale: s.id, p_lines: items, p_refund: ret.refund, p_reason: ret.reason }), 'Retur tercatat, stok bertambah', req);
    setBusy(false);
    if (res) { setRet(null); loadDetail(); onReturned?.(); }
  };
  const doVoid = async () => {
    const req = { kos: s.kos_id, action: 'batal_penjualan', payload: { sale_id: s.id }, reason };
    const res = !fin ? ((await requestApproval(req)) ? 'diminta' : false)
      : await withApproval(() => supabase.rpc('sale_void', { p_sale: s.id, p_reason: reason }), 'Transaksi dibatalkan, stok dikembalikan', req);
    if (res) onChanged();
  };
  return (
    <Sheet title={s.number} onClose={onClose}>
      <span className="small muted">{tgl(s.sale_date)} {jam(s.sold_at)} · {payLabel(s)}{contact ? ` · ${contact}` : ''}{s.tier === 'grosir' ? ' · harga grosir' : ''}</span>
      {s.status === 'batal' && <div className="notice bad">Dibatalkan: {s.void_reason}</div>}
      {!lines ? <Loading /> : <div className="list">{lines.map((l) => (
        <div className="li" key={l.id} style={{ flexWrap: 'wrap' }}>
          <div className="main"><b className="small">{l.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.returned) > 0 ? ` · diretur ${angka(l.returned)}` : ''}</span></div><b className="small">{rp(l.line_total)}</b>
          {ret && left(l) > 0 && <Field label={`Kembali (maks ${angka(left(l))} ${l.unit})`}><input inputMode="decimal" value={ret.qty[l.id] || ''} onChange={(e) => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} placeholder="0" /></Field>}
        </div>
      ))}</div>}
      {rets.length > 0 && <div className="notice">{rets.map((r) => <div key={r.number} className="small">{r.number} · {tgl(r.date)} · {r.items?.map((i) => `${angka(i.qty)} ${i.unit} ${i.name}`).join(', ')} · {REFUND[r.refund_method]} {rp(r.total)} — {r.reason}</div>)}</div>}
      {(s.promos || []).map((x) => <div className="row between" key={x.id} style={{ flexWrap: 'nowrap', gap: 8 }}><span style={{ minWidth: 0 }}>Promo · {x.name}</span><span style={{ whiteSpace: 'nowrap' }}>−{rp(x.amount)}</span></div>)}
      {Number(s.discount) - Number(s.promo_discount || 0) > 0 && <div className="row between"><span>Diskon</span><span>−{rp(Number(s.discount) - Number(s.promo_discount || 0))}</span></div>}
      <div className="row between"><b>Total</b><b>{rp(s.total)}</b></div>
      {fin && <div className="row between small muted"><span>Laba kotor</span><span>{rp(Number(s.total) - Number(s.cost_total))}</span></div>}
      {s.cashier && <span className="small muted">Kasir: {s.cashier}</span>}
      <Link href={`/struk/${s.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      {s.status === 'selesai' && !voiding && lines && lines.some((l) => left(l) > 0) && (!ret ? <button onClick={() => setRet({ id: uid(), qty: {}, refund: s.pay_method === 'kasbon' ? 'kasbon' : s.pay_method, reason: '' })}>{fin ? 'Retur barang (dikembalikan pelanggan)' : 'Minta retur barang'}</button> : <>
        <span className="small muted">Isi jumlah yang dikembalikan di setiap barang di atas. Stok bertambah lagi.</span>
        <div className="seg">{Object.entries(REFUND).filter(([k]) => k !== 'kasbon' || Number(s.amt_kasbon ?? (s.pay_method === 'kasbon' ? 1 : 0)) > 0).map(([k, l]) => <button key={k} className={ret.refund === k ? 'on' : ''} onClick={() => setRet({ ...ret, refund: k })}>{l}</button>)}</div>
        <Field label="Alasan retur"><input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="mis. kemasan rusak, salah ambil" /></Field>
        <div className="row between"><b>{ret.refund === 'kasbon' ? 'Kasbon berkurang' : 'Uang dikembalikan'}</b><b>{rp(Math.round(retTotal))}</b></div>
        <div className="row"><button className="primary" onClick={doReturn} disabled={busy || !ret.reason.trim() || retTotal <= 0}>{fin ? 'Simpan retur' : 'Kirim permintaan retur'}</button><button className="ghost" onClick={() => setRet(null)}>Batal</button></div>
      </>)}
      {s.status === 'selesai' && !ret && rets.length === 0 && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>{fin ? 'Batalkan transaksi' : 'Minta pembatalan'}</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang dikembalikan" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>{fin ? 'Ya, batalkan & kembalikan stok' : 'Kirim permintaan ke pemilik'}</button>
      </>)}
    </Sheet>
  );
}
