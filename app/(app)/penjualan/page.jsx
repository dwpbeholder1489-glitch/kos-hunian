'use client';
import { withApproval, requestApproval } from '@/lib/approval';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader, DataTable } from '@/components/Page';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, tgl, today, errMsg } from '@/lib/format';
import { PAY, jam, qtyNum, uid, payLabel, splitSerials, unitPrice } from '@/lib/retail';
import { canArea } from '@/lib/business';
import { CreditNotes } from '@/components/KatalogLanjut';

const REFUND = { tunai: 'Uang tunai dari laci', transfer: 'Transfer balik', kasbon: 'Potong kasbon', nota: 'Nota kredit (saldo belanja)' };

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
  const [tab, setTab] = useState('jual');
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'nota') setTab('nota'); } catch {} }, []);
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
      <PageHeader title="Penjualan" help={<PageHelp page="penjualan" />} desc="Riwayat transaksi per hari — ketuk transaksi untuk detail, struk, retur, atau pembatalan." actions={<Link href="/kasir"><button className="primary">+ Transaksi</button></Link>} />
      <div className="seg">{[['jual', 'Penjualan'], ['nota', 'Nota kredit']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}>{l}</button>)}</div>
      {tab === 'nota' ? <CreditNotes kos={kos} kosId={kosId} ver={ver} finance={fin} settings={canArea(kos, 'settings')} /> : <>
      <div className="daynav">
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
          <DataTable rows={rows} caption={`Penjualan ${tgl(day)}`} onRow={setOpen} rowLabel={(s) => `${s.number}, ${rp(s.total)}`} rowClass={(s) => (s.status === 'batal' ? 'void' : undefined)}
            initialSort={{ key: 'jam', dir: -1 }}
            columns={[
              { key: 'number', label: 'No. transaksi', sort: (s) => s.number, render: (s) => <b>{s.number}</b> },
              { key: 'jam', label: 'Waktu', sort: (s) => s.sold_at, render: (s) => jam(s.sold_at) },
              { key: 'bayar', label: 'Pembayaran', render: (s) => payLabel(s) },
              { key: 'pelanggan', label: 'Pelanggan', hide: 'tablet', sort: (s) => contacts.get(s.contact_id) || '', render: (s) => (s.contact_id ? contacts.get(s.contact_id) || '—' : '—') },
              ...(fin ? [{ key: 'kasir', label: 'Kasir', hide: 'tablet', render: (s) => (s.cashier ? s.cashier.split('@')[0] : '—') }] : []),
              { key: 'status', label: 'Status', render: (s) => (s.status === 'batal' ? <span className="chip void">Batal</span> : <span className="chip good">Selesai</span>) },
              { key: 'total', label: 'Total', align: 'right', sort: (s) => Number(s.total), render: (s) => <b style={{ textDecoration: s.status === 'batal' ? 'line-through' : 'none' }}>{rp(s.total)}</b> },
            ]}
            card={(s) => <>
              <div className="dt-row"><b>{s.number}{s.status === 'batal' && <span className="chip void" style={{ marginLeft: 6 }}>Batal</span>}</b><b style={{ textDecoration: s.status === 'batal' ? 'line-through' : 'none' }}>{rp(s.total)}</b></div>
              <span className="small muted">{jam(s.sold_at)} · {payLabel(s)}{s.contact_id ? ` · ${contacts.get(s.contact_id) || ''}` : ''}{fin && s.cashier ? ` · ${s.cashier.split('@')[0]}` : ''}</span>
            </>} />
        )}
      </>}
      </>}
      {open && <Detail fin={fin} onReturned={load} s={open} contact={contacts.get(open.contact_id)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Detail({ s, contact, onClose, onChanged, onReturned, fin }) {
  const { kosId } = useKos();
  const [lines, setLines] = useState(null);
  const [info, setInfo] = useState({});   // sale: exchange_return, credit_notes
  const [serEdit, setSerEdit] = useState(null);   // {line, text}
  const [tukar, setTukar] = useState(null);       // {cat, q, items:[{product_id,name,unit,qty,price}]}
  const [rets, setRets] = useState([]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState(null); // {qty: {line_id: '1'}, refund, reason}
  const [busy, setBusy] = useState(false);
  const loadDetail = () => supabase.rpc('sale_detail', { p_sale: s.id }).then(({ data }) => { setLines(data?.lines || []); setRets(data?.returns || []); setInfo(data?.sale || {}); });
  useEffect(() => { loadDetail(); }, [s.id]);
  const left = (l) => Number(l.qty) - Number(l.returned || 0);
  const retTotal = ret && lines ? lines.reduce((a, l) => a + (qtyNum(ret.qty[l.id] || '') || 0) * Number(l.price) * (Number(s.subtotal) > 0 ? Number(s.total) / Number(s.subtotal) : 1), 0) : 0;
  const retItems = () => lines.map((l) => ({ line_id: l.id, qty: qtyNum(ret.qty[l.id] || '') || 0, ...(ret.rusak?.[l.id] ? { rusak: true } : {}), ...(ret.ser?.[l.id]?.length ? { serials: ret.ser[l.id] } : {}) })).filter((x) => x.qty > 0);
  const doReturn = async () => {
    const items = retItems();
    if (!items.length) return toast('Isi jumlah barang yang dikembalikan.');
    if (tukar) return doExchange(items);
    setBusy(true);
    const req = { kos: s.kos_id, action: 'retur_penjualan', payload: { sale_id: s.id, lines: items, refund: ret.refund }, reason: ret.reason };
    const res = !fin ? ((await requestApproval(req)) ? 'diminta' : false)
      : await withApproval(() => supabase.rpc('sale_return_create', { p_id: ret.id, p_sale: s.id, p_lines: items, p_refund: ret.refund, p_reason: ret.reason }), 'Retur tercatat, stok bertambah', req);
    setBusy(false);
    if (res) { setRet(null); loadDetail(); onReturned?.(); }
  };
  // Tukar barang: retur + penjualan baru dalam satu transaksi; selisih lewat cara bayar yang sama
  const newTotal = tukar ? tukar.items.reduce((a, x) => a + (qtyNum(x.qty) || 0) * x.price, 0) : 0;
  const openTukar = async () => {
    const { data, error } = await supabase.rpc('kasir_catalog', { p_kos: s.kos_id });
    if (error) return toast(errMsg(error));
    setTukar({ cat: data, q: '', items: [] });
    setRet({ id: uid(), qty: {}, refund: ['tunai', 'transfer', 'kasbon'].includes(s.pay_method) ? s.pay_method : 'tunai', reason: 'Tukar barang' });
  };
  const doExchange = async (items) => {
    if (!tukar.items.length) return toast('Pilih barang pengganti.');
    if (tukar.items.some((x) => !(qtyNum(x.qty) > 0))) return toast('Isi jumlah barang pengganti.');
    setBusy(true);
    let res = null;
    const ok = await run(async () => { const r = await supabase.rpc('sale_exchange', {
      p_return: { id: ret.id, sale_id: s.id, lines: items, refund: ret.refund, reason: ret.reason || 'Tukar barang' },
      p_sale: { id: tukar.sid || (tukar.sid = uid()), tier: s.tier, lines: tukar.items.map((x) => ({ product_id: x.product_id, unit: x.unit, qty: qtyNum(x.qty) })), method: ret.refund, contact: s.contact_id || '' } }); res = r.data; return r; }, null, errMsg);
    setBusy(false);
    if (ok) {
      const diff = Number(res.sale.total) - Number(res.return.total);
      toast(`Tukar tercatat: ${res.return.number} → ${res.sale.number}. ${diff > 0 ? `Pelanggan membayar selisih ${rp(diff)}` : diff < 0 ? `Kembalikan ${rp(-diff)} ke pelanggan` : 'Tanpa selisih'}${ret.refund === 'kasbon' ? ' (lewat kasbon)' : ''}.`);
      setRet(null); setTukar(null); loadDetail(); onReturned?.();
    }
  };
  const saveSerials = async () => {
    const list = splitSerials(serEdit.text);
    setBusy(true);
    const ok = await run(() => supabase.rpc('sale_serials_set', { p_sale: s.id, p_line: serEdit.line.id, p_serials: list }), 'Nomor seri tersimpan', errMsg);
    setBusy(false);
    if (ok) { setSerEdit(null); loadDetail(); }
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
          <div className="main"><b className="small">{l.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.returned) > 0 ? ` · diretur ${angka(l.returned)}` : ''}</span>
            {l.parts?.length > 0 && <span className="small muted">Isi paket: {l.parts.map((x) => `${angka(x.qty)} ${x.unit} ${x.name}`).join(' + ')}</span>}
            {(l.serials?.length > 0 || l.track_serial) && <span className="small">No. seri: {l.serials?.length ? l.serials.join(', ') : <span className="muted">belum diisi</span>}{s.status === 'selesai' && !ret && <button className="sm ghost" style={{ minHeight: 0, padding: '0 6px' }} onClick={() => setSerEdit({ line: l, text: (l.serials || []).join(', ') })}>{l.serials?.length ? 'Ubah' : 'Isi'}</button>}</span>}
          </div><b className="small">{rp(l.line_total)}</b>
          {ret && left(l) > 0 && <Field label={`Kembali (maks ${angka(left(l))} ${l.unit})`}><input inputMode="decimal" value={ret.qty[l.id] || ''} onChange={(e) => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} placeholder="0" /></Field>}
          {ret && left(l) > 0 && qtyNum(ret.qty[l.id] || '') > 0 && l.serials?.length > 0 && <div className="row small" style={{ width: '100%', flexWrap: 'wrap', gap: 6 }}><span className="muted">Nomor seri yang kembali:</span>{l.serials.map((sn) => {
            const on = (ret.ser?.[l.id] || []).includes(sn);
            return <label key={sn} className="chip" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={on} onChange={(e) => { const cur = ret.ser?.[l.id] || []; setRet({ ...ret, ser: { ...(ret.ser || {}), [l.id]: e.target.checked ? [...cur, sn] : cur.filter((x) => x !== sn) } }); }} />{sn}</label>;
          })}</div>}
          {ret && left(l) > 0 && qtyNum(ret.qty[l.id] || '') > 0 && <label className="row small" style={{ width: '100%' }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={!!ret.rusak?.[l.id]} onChange={(e) => setRet({ ...ret, rusak: { ...(ret.rusak || {}), [l.id]: e.target.checked } })} />Barang rusak — pisahkan, jangan dijual lagi</label>}
        </div>
      ))}</div>}
      {info.exchange_return && <div className="notice small">Penjualan pengganti dari tukar barang {info.exchange_return}.</div>}
      {info.credit_notes?.length > 0 && <span className="small muted">Dibayar dengan nota kredit: {info.credit_notes.map((n) => `${n.number} ${rp(n.amount)}`).join(', ')}</span>}
      {rets.length > 0 && <div className="notice">{rets.map((r) => <div key={r.number} className="small">{r.number} · {tgl(r.date)} · {r.items?.map((i) => `${angka(i.qty)} ${i.unit} ${i.name}`).join(', ')} · {REFUND[r.refund_method] || r.refund_method} {rp(r.total)} — {r.reason}{r.credit_note ? <> · nota <b>{r.credit_note}</b> <a href={`https://wa.me/?text=${encodeURIComponent(`Nota kredit ${r.credit_note} senilai ${rp(r.total)} bisa dipakai belanja di toko kami. Tunjukkan nomor ini ke kasir.`)}`} target="_blank" rel="noreferrer">kirim WA</a></> : ''}{r.exchange_sale ? ` · ditukar → ${r.exchange_sale}` : ''}</div>)}</div>}
      {(s.promos || []).map((x) => <div className="row between" key={x.id} style={{ flexWrap: 'nowrap', gap: 8 }}><span style={{ minWidth: 0 }}>Promo · {x.name}</span><span style={{ whiteSpace: 'nowrap' }}>−{rp(x.amount)}</span></div>)}
      {Number(s.discount) - Number(s.promo_discount || 0) > 0 && <div className="row between"><span>Diskon</span><span>−{rp(Number(s.discount) - Number(s.promo_discount || 0))}</span></div>}
      <div className="row between"><b>Total</b><b>{rp(s.total)}</b></div>
      {fin && <div className="row between small muted"><span>Laba kotor</span><span>{rp(Number(s.total) - Number(s.cost_total))}</span></div>}
      {s.cashier && <span className="small muted">Kasir: {s.cashier}</span>}
      <Link href={`/struk/${s.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      {s.status === 'selesai' && !voiding && lines && lines.some((l) => left(l) > 0) && (!ret ? <div className="row" style={{ flexWrap: 'wrap' }}>
        <button onClick={() => setRet({ id: uid(), qty: {}, refund: ['tunai', 'transfer', 'kasbon', 'nota'].includes(s.pay_method) ? s.pay_method : 'tunai', reason: '' })}>{fin ? 'Retur barang (dikembalikan pelanggan)' : 'Minta retur barang'}</button>
        {fin && <button onClick={openTukar}>Tukar barang</button>}
      </div> : <>
        <span className="small muted">{tukar ? 'Tukar barang: isi jumlah barang lama yang dikembalikan di atas, lalu pilih barang penggantinya di bawah. Retur & penjualan baru tersimpan bersamaan; selisih dibayar/dikembalikan lewat cara bayar yang sama.' : 'Isi jumlah yang dikembalikan di setiap barang di atas. Stok bertambah lagi; barang yang dicentang rusak masuk daftar '}{!tukar && <><b>ditahan</b> (Barang › Kesehatan stok) dan tidak dihitung bisa dijual.{ret.refund === 'nota' ? ' Nota kredit: nilai retur disimpan sebagai saldo belanja pelanggan (nomor NK-…), dipakai di Kasir.' : ''}</>}</span>
        {tukar && <TukarPick tukar={tukar} setTukar={setTukar} tier={s.tier} />}
        <div className="seg">{Object.entries(REFUND).filter(([k]) => (k !== 'kasbon' || Number(s.amt_kasbon ?? (s.pay_method === 'kasbon' ? 1 : 0)) > 0) && (!tukar || k !== 'nota')).map(([k, l]) => <button key={k} className={ret.refund === k ? 'on' : ''} onClick={() => setRet({ ...ret, refund: k })}>{l}</button>)}</div>
        <Field label="Alasan retur"><input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="mis. kemasan rusak, salah ambil" /></Field>
        {!tukar && <div className="row between"><b>{ret.refund === 'kasbon' ? 'Kasbon berkurang' : ret.refund === 'nota' ? 'Nota kredit terbit' : 'Uang dikembalikan'}</b><b>{rp(Math.round(retTotal))}</b></div>}
        {tukar && <div className="unitbox" style={{ gap: 4 }}>
          <div className="row between small"><span>Barang lama dikembalikan</span><span>−{rp(Math.round(retTotal))}</span></div>
          <div className="row between small"><span>Barang pengganti (perkiraan)</span><span>{rp(newTotal)}</span></div>
          <div className="row between"><b>{newTotal - retTotal >= 0 ? 'Pelanggan membayar' : 'Dikembalikan ke pelanggan'}</b><b>{rp(Math.abs(Math.round(newTotal - retTotal)))}</b></div>
          <span className="small muted">Harga final dihitung sistem saat disimpan (promo, harga pelanggan, harga beli banyak).</span>
        </div>}
        <div className="row"><button className="primary" onClick={doReturn} disabled={busy || !ret.reason.trim() || retTotal <= 0}>{tukar ? 'Simpan tukar barang' : fin ? 'Simpan retur' : 'Kirim permintaan retur'}</button><button className="ghost" onClick={() => { setRet(null); setTukar(null); }}>Batal</button></div>
      </>)}
      {serEdit && <Sheet title={`Nomor seri · ${serEdit.line.name}`} onClose={() => setSerEdit(null)}>
        <Field label={`Nomor seri / IMEI (maks. ${angka(Number(serEdit.line.qty) * Number(serEdit.line.unit_qty) - Number(serEdit.line.returned || 0) * Number(serEdit.line.unit_qty))})`}><textarea rows={3} value={serEdit.text} onChange={(e) => setSerEdit({ ...serEdit, text: e.target.value })} placeholder="pisahkan dengan koma atau baris baru" /></Field>
        <span className="small muted">Garansi dihitung dari tanggal penjualan ({tgl(s.sale_date)}). Nomor yang belum terdaftar ikut dicatat.</span>
        <button className="cta" disabled={busy} onClick={saveSerials}>Simpan</button>
      </Sheet>}
      {s.status === 'selesai' && !ret && rets.length === 0 && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>{fin ? 'Batalkan transaksi' : 'Minta pembatalan'}</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang dikembalikan" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>{fin ? 'Ya, batalkan & kembalikan stok' : 'Kirim permintaan ke pemilik'}</button>
      </>)}
    </Sheet>
  );
}

// Pilih barang pengganti untuk tukar barang (katalog kasir, tanpa harga modal)
function TukarPick({ tukar, setTukar, tier }) {
  const { cat } = tukar;
  const w = tukar.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = w.length ? cat.products.filter((p) => w.every((x) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(x))).slice(0, 6) : [];
  const unitsOf = (id) => cat.units.filter((u) => u.product_id === id).sort((a, b) => a.sort - b.sort);
  const priceOf = (id, unit) => { const u = cat.units.find((x) => x.product_id === id && x.name === unit); return u ? unitPrice(u, tier) : 0; };
  const set = (i, patch) => setTukar({ ...tukar, items: tukar.items.map((x, j) => (j === i ? { ...x, ...patch, price: priceOf(x.product_id, patch.unit || x.unit) } : x)) });
  return (
    <div className="unitbox" style={{ gap: 6 }}>
      <b className="small">Barang pengganti</b>
      {tukar.items.map((x, i) => (
        <div key={x.product_id + i} className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
          <span className="small" style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{x.name}</span>
          <Field label="Jumlah"><input inputMode="decimal" style={{ maxWidth: 80 }} value={x.qty} onChange={(e) => set(i, { qty: e.target.value })} /></Field>
          <Field label="Satuan"><select value={x.unit} onChange={(e) => set(i, { unit: e.target.value })}>{unitsOf(x.product_id).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>
          <button className="sm ghost" aria-label={`Hapus ${x.name}`} onClick={() => setTukar({ ...tukar, items: tukar.items.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <input type="search" value={tukar.q} onChange={(e) => setTukar({ ...tukar, q: e.target.value })} placeholder="+ Cari barang pengganti" aria-label="Cari barang pengganti" />
      {found.length > 0 && <div className="list">{found.map((p) => { const u = unitsOf(p.id)[0]; return (
        <button key={p.id} className="li" style={{ textAlign: 'left' }} onClick={() => setTukar({ ...tukar, q: '', items: [...tukar.items, { product_id: p.id, name: p.name, unit: u?.name || p.base_unit, qty: '1', price: u ? unitPrice(u, tier) : 0 }] })}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span><span className="small muted">{u ? rp(unitPrice(u, tier)) : ''} · stok {angka(p.stock)}</span>
        </button>); })}</div>}
    </div>
  );
}
