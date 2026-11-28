'use client';
import { useRef, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import LokasiBar from '@/components/LokasiBar';
import { Field, toast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';
import { toBase } from '@/lib/units';
import ProductPicker from './ProductPicker';
import { BUY } from '../purchase-data';
import formStyles from '../../barang/product-form.module.css';
import styles from './purchase-form.module.css';

const STAGES = ['Detail Pembelian', 'Barang yang Dibeli', 'Pembayaran'];
const METHODS = { tunai: 'wallet', transfer: '/pembukuan', utang: 'credit' };
const MODES = [
  ['terima','Barang sudah diterima','Stok langsung bertambah','/grosir'],
  ['pesan','Pesan dulu (belum datang)','Stok bertambah saat barang diterima','calendar'],
];
const netPrice = (l) => parseRp(l.price) - parseRp(l.discount);
const subtotal = (l) => Math.round((qtyNum(l.qty) || 0) * Math.max(0, netPrice(l)) * 100) / 100;

export default function PurchaseForm({ kosId, kos, version, d, init, initialSearch, onClose, onSaved, onNewProduct }) {
  const draft = init?.resume;
  const [stage, setStage] = useState(draft ? 1 : 0);
  const [picker, setPicker] = useState(Boolean(draft));
  const heading = useRef(null);
  const saving = useRef(false);
  const newSupplierId = useRef(draft?.newSupplierId || null);
  const [date, setDate] = useState(draft?.date || today());
  const [supplier, setSupplier] = useState(draft?.supplier ?? init?.supplier ?? '');
  const [newSup, setNewSup] = useState(draft?.newSup || '');
  const [lines, setLines] = useState(() => (draft?.lines || init?.lines || []).map((l) => ({ expiry:'', lot:'', discount:'', ...l, key:l.key || uid(), price:String(l.price ?? '') })));
  const [method, setMethod] = useState(draft?.method || 'tunai');
  const [due, setDue] = useState(draft?.due || '');
  const [note, setNote] = useState(draft?.note || '');
  const [mode, setMode] = useState(draft?.mode || (init ? 'pesan' : 'terima'));
  const [expected, setExpected] = useState(draft?.expected || '');
  const [busy, setBusy] = useState(false);
  const [txId] = useState(() => draft?.txId || uid());
  const [pickerInitial,setPickerInitial] = useState(draft?.selection || {});
  const [pickerSearch,setPickerSearch] = useState(initialSearch || '');

  const prodById = new Map(d.products.map((p) => [p.id, p]));
  // Harga beli terakhir untuk barang + satuan (dari belanja yang tidak batal)
  const rank = new Map(d.purchases.filter((b) => b.status === 'selesai').map((b, i) => [b.id, i])); // 0 = paling baru
  const lastPrice = (pid, unit) => {
    let best = null;
    for (const l of d.lines) if (l.product_id === pid && l.unit === unit && rank.has(l.purchase_id) && (!best || rank.get(l.purchase_id) < rank.get(best.purchase_id))) best = l;
    return best ? Number(best.price) : null;
  };
  // Harga sepakat supplier terpilih (Barang › Harga dari supplier) didahulukan, lalu harga beli terakhir, lalu modal
  const agreed = (sid, pid, unit) => (d.supItems || []).find((x) => x.contact_id === sid && x.product_id === pid && x.unit === unit);
  const suggest = (p, u, sid = supplier) => { const a = sid ? agreed(sid, p.id, u.name) : null; return a?.price != null ? Number(a.price) : lastPrice(p.id, u.name) ?? Math.round(Number(p.cost) * Number(u.qty)); };
  const cheaper = (p, unitCost, sid) => (d.supItems || []).filter((x) => x.product_id === p.id && x.contact_id !== sid && x.price != null).map((x) => { const uu = d.units.find((y) => y.product_id === p.id && y.name === x.unit); return uu ? { ...x, uc: Number(x.price) / Number(uu.qty) } : null; })
    .filter((x) => x && x.uc < unitCost - 0.5).sort((a, b) => a.uc - b.uc)[0];
  const pickSupplier = (sid) => {
    setSupplier(sid);
    if (sid) setLines(lines.map((l) => { const p = prodById.get(l.product_id); const a = agreed(sid, l.product_id, l.unit); return a?.price != null && p ? { ...l, price: angka(a.price) } : l; }));
  };

  const priceFor = (p, unit) => {
    const u = unitsOf(p,d.units).find((x) => x.name === unit);
    const price = u ? suggest(p,u) : null;
    return price != null && Number.isFinite(price) ? angka(price) : '';
  };
  const defaults = (p, unit, qty = '1', quoted) => {
    const us = unitsOf(p,d.units);
    const pref = supplier && d.supItems.find((x) => x.contact_id === supplier && x.product_id === p.id);
    const u = us.find((x) => x.name === unit) || us.find((x) => x.name === pref?.unit) || [...us].sort((a,b) => b.qty - a.qty)[0];
    if (!u) return null;
    const useQuote = quoted != null && u.name === unit;
    return { product_id:p.id, unit:u.name, qty, price:useQuote ? angka(quoted) : priceFor(p,u.name) };
  };
  const closePicker = () => { setPicker(false); setPickerInitial({}); setPickerSearch(''); };
  const applyPicker = (picked) => {
    if (lines.length + picked.length > 100) return toast('Maksimal 100 baris per pembelian.');
    setLines((previous) => [...previous, ...picked.map((l) => ({ key:uid(), expiry:'', lot:'', discount:'', ...l }))]);
    closePicker();
  };
  const set = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((sum, l) => sum + subtotal(l), 0);
  const moneyValid = (value) => /\d/.test(String(value)) && !String(value).includes('-');
  const detailsError = () => !init?.request && (!date || date > today()) ? 'Pilih tanggal pembelian yang valid.'
    : init?.request && !supplier && !newSup.trim() ? 'Pilih supplier untuk permintaan ini.'
    : mode === 'pesan' && expected && expected < date ? 'Perkiraan datang tidak boleh sebelum tanggal pesan.' : '';
  const itemsError = () => {
    if (!lines.length) return 'Tambahkan barang yang dibeli.';
    if (lines.length > 100) return 'Maksimal 100 baris per pembelian.';
    for (const l of lines) {
      const p = prodById.get(l.product_id);
      if (!p || !unitsOf(p, d.units).some((u) => u.name === l.unit)) return 'Hapus atau perbarui barang dan satuan yang tidak tersedia.';
      const qty = qtyNum(l.qty);
      if (!(qty > 0) || !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(String(l.qty).trim()) || !moneyValid(l.price)) {
        return `Isi harga beli dan jumlah untuk ${p.name}.`;
      }
      if ((l.discount && !moneyValid(l.discount)) || netPrice(l) < 0) return `Diskon per satuan ${p.name} tidak boleh melebihi harga beli.`;
    }
    return '';
  };
  function openStage(next) {
    const error = next > stage && (detailsError() || (next === 2 && itemsError()));
    if (error) return toast(error);
    setStage(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  const save = async () => {
    if (saving.current) return;
    const error = detailsError() || itemsError()
      || (method === 'utang' && !supplier && !newSup.trim() ? 'Pilih supplier untuk belanja utang.' : '');
    if (error) return toast(error);
    saving.current = true;
    setBusy(true);
    try {
      let sid = supplier || null;
      const supplierName = newSup.trim();
      if (!sid && supplierName) {
        if (newSupplierId.current?.name === supplierName) sid = newSupplierId.current.id;
        else {
          const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'supplier', p_name: supplierName, p_phone: null });
          if (error) throw error;
          sid = data;
          newSupplierId.current = { name: supplierName, id: data };
        }
      }
      const args = {
        p_id: txId, p_kos: kosId, p_date: date, p_contact: sid,
        p_lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), price: netPrice(l), expiry: l.expiry || null, lot: l.lot || null })),
        p_method: method, p_due: method === 'utang' && due ? due : null, p_note: note,
      };
      const { data, error } = init?.request
        ? await supabase.rpc('preq_to_order', { p_request: init.request, p_id: txId, p_contact: sid, p_lines: args.p_lines, p_method: method, p_due: args.p_due, p_expected: expected || null, p_note: note || null })
        : mode === 'pesan'
        ? await supabase.rpc('purchase_order_create', { ...args, p_expected: expected || null })
        : await supabase.rpc('purchase_create', args);
      if (error) throw error;
      onSaved(data, init?.request ? today() : date, mode === 'pesan');
    } catch (e) { toast(errMsg(e)); }
    finally { saving.current = false; setBusy(false); }
  };

  if (picker) return <ProductPicker kosId={kosId} retail={kos.business_type === 'retail'} version={version} supplier={supplier} d={d}
    initial={pickerInitial} initialSearch={pickerSearch} defaults={defaults} priceFor={priceFor} onBack={closePicker} onApply={applyPicker}
    onNew={onNewProduct && ((selection) => onNewProduct({ request:init?.request, requestNo:init?.requestNo, resume:{
      date,supplier,newSup,lines,method,due,note,mode,expected,selection,txId,newSupplierId:newSupplierId.current,
    } }))} />;

  return <section className={`${formStyles.productForm} ${styles.purchase}`} data-no-field-help>
    <header className={formStyles.heading}>
      <button type="button" aria-label="Kembali ke Belanja" onClick={onClose} disabled={busy}><NavIcon name="prev" /></button>
      <div><h1>Catat Belanja (Pembelian)</h1><p>Catat pembelian atau restok barang dari supplier.</p></div>
      <PageHelp page="belanja" />
    </header>
    <nav className={formStyles.steps} aria-label="Tahapan pembelian">
      {STAGES.map((label, index) => <button type="button" key={label} aria-current={stage === index ? 'step' : undefined}
        onClick={() => openStage(index)} disabled={busy}><span aria-hidden="true">{index + 1}</span>{label}</button>)}
    </nav>
    <fieldset className={styles.stage} disabled={busy}>
      <legend ref={heading} tabIndex={-1}>{STAGES[stage]}</legend>
      {stage === 0 && <>
        <LokasiBar note="Pembelian diterima masuk ke stok lokasi kerja ini." />
        {init?.request ? <p className="notice">Dari permintaan <b>{init.requestNo}</b>. Pilih supplier dan tinjau barang sebelum membuat pesanan.</p> :
          <div className={styles.choices} aria-label="Status barang">{MODES.map(([key,label,desc,icon]) =>
            <button type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>
              <NavIcon name={icon} /><span><b>{label}</b><small>{desc}</small></span>
            </button>)}</div>}
        <section className={formStyles.card}>
          <div className={formStyles.fields}>
            {!init?.request && <Field label={mode === 'pesan' ? 'Tanggal pesan' : 'Tanggal pembelian'}>
              <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>}
            <Field label="Supplier"><select value={supplier} onChange={(e) => pickSupplier(e.target.value)}>
              <option value="">— tanpa / baru —</option>{d.suppliers.filter((s) => !s.archived_at || s.id === supplier).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></Field>
            {!supplier && <div className={formStyles.full}><Field label="Nama supplier baru (opsional)" hint="Supplier wajib untuk pembayaran utang dan pesanan dari permintaan.">
              <input value={newSup} onChange={(e) => setNewSup(e.target.value)} placeholder="mis. CV Sumber Rejeki" />
            </Field></div>}
            {mode === 'pesan' && <Field label="Perkiraan datang (opsional)"><input type="date" min={date} value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>}
          </div>
        </section>
      </>}
      {stage === 1 && <>
        <button type="button" className={styles.pick} onClick={() => setPicker(true)}><NavIcon name="/barang" /> Pilih Barang <NavIcon name="next" size={17} /></button>
      {lines.map((l) => {
        const p = prodById.get(l.product_id);
        if (!p) return <div className={formStyles.card} key={l.key}><p>Barang dari draf ini sudah tidak tersedia.</p><button onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Hapus barang</button></div>;
        const us = unitsOf(p, d.units);
        const u = us.find((x) => x.name === l.unit) || us[0];
        if (!u) return <div key={l.key} className={formStyles.card}><p>{p.name} belum memiliki satuan.</p><button onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Hapus barang</button></div>;
        const qn = qtyNum(l.qty) || 0, pr = parseRp(l.price), net = Math.max(0, netPrice(l));
        const base = toBase(qn, u.qty);
        const unitCost = u.qty > 0 ? net / Number(u.qty) : 0;
        const newCost = Number(p.stock) > 0 ? (Number(p.stock) * Number(p.cost) + base * unitCost) / (Number(p.stock) + base) : unitCost;
        return (
          <article className={formStyles.card} key={l.key}>
            <div className={styles.lineHead}><b className="small">{p.name}</b><button className="sm ghost" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Hapus</button></div>
            <div className={formStyles.fields}>
              <Field label="Jumlah"><input inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} /></Field>
              <Field label="Satuan"><select value={l.unit} onChange={(e) => { const nu = us.find((x) => x.name === e.target.value); const s = suggest(p, nu); set(l.key, { unit: e.target.value, price: s > 0 ? angka(s) : '', discount: '' }); }}>{!us.some((x) => x.name === l.unit) && <option value={l.unit}>Pilih satuan yang tersedia</option>}{us.map((x) => <option key={x.name} value={x.name}>{x.name}{Number(x.qty) !== 1 ? ` (${angka(x.qty)} ${p.base_unit})` : ''}</option>)}</select></Field>
              <Field label={`Harga beli per ${l.unit}`}><input inputMode="numeric" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} /></Field>
              <Field label={`Diskon per ${l.unit} (Rp)`}><input inputMode="numeric" value={l.discount} placeholder="0" onChange={(e) => set(l.key, { discount: e.target.value })} /></Field>
            </div>
            {(() => {
              const a = supplier ? agreed(supplier, p.id, l.unit) : null;
              const ch = pr > 0 ? cheaper(p, unitCost, supplier) : null;
              return <>
                {a?.moq != null && qn > 0 && qn < Number(a.moq) && <span className="small" style={{ color: 'var(--warn)' }}>Minimal pesan di supplier ini {angka(a.moq)} {l.unit}. Tetap bisa disimpan bila memang disepakati lain.</span>}
                {a?.price != null && pr === Number(a.price) && <span className="small" style={{ color: 'var(--good)' }}>Harga sepakat dengan supplier ini{a.lead_days != null ? ` · kirim ± ${a.lead_days} hari` : ''}</span>}
                {ch && <span className="small muted">Lebih murah di {d.suppliers.find((x) => x.id === ch.contact_id)?.name}: {rp(ch.price)}/{ch.unit} ({rp(ch.uc)}/{p.base_unit})</span>}
              </>;
            })()}
            {p.track_expiry && <div className={formStyles.fields}>
              <Field label={mode === 'pesan' ? 'Kedaluwarsa (bila sudah tahu)' : 'Tanggal kedaluwarsa'}><input type="date" value={l.expiry || ''} onChange={(e) => set(l.key, { expiry: e.target.value })} /></Field>
              <Field label="No. batch (opsional)"><input value={l.lot || ''} maxLength={40} onChange={(e) => set(l.key, { lot: e.target.value })} /></Field>
            </div>}
            {p.track_expiry && mode !== 'pesan' && !l.expiry && <span className="small" style={{ color: 'var(--warn)' }}>Tanggal kedaluwarsa belum diisi — boleh, tapi barang ini tidak masuk peringatan kedaluwarsa sampai tanggalnya diisi (Barang › Kedaluwarsa). Beda tanggal? Tambahkan barang yang sama sekali lagi.</span>}
            <div className={styles.total}><span>Subtotal</span><b>{rp(subtotal(l))}</b></div>
            {qn > 0 && mode === 'terima' && moneyValid(l.price) && netPrice(l) >= 0 && <span className="small muted">Stok +{angka(base)} {p.base_unit} · modal {rp(p.cost)} → <b>{rp(newCost)}</b>/{p.base_unit}</span>}
          </article>
        );
      })}
      </>}
      {stage === 2 && <>
        <section className={formStyles.card}>
          <div className={styles.methods} aria-label="Metode pembayaran">{Object.entries(BUY).map(([key,label]) =>
            <button key={key} aria-pressed={method === key} onClick={() => setMethod(key)}><NavIcon name={METHODS[key]} /><b>{label}</b></button>)}</div>
          {mode === 'pesan' && <p>Kas, bank, atau utang dicatat sesuai nilai barang yang diterima.</p>}
          {method === 'utang' && <Field label="Jatuh tempo (opsional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
          <Field label="Catatan (opsional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. no. nota supplier atau keterangan pembelian" /></Field>
        </section>
        <section className={formStyles.card}>
          <div className={styles.lineHead}><b>Ringkasan {mode === 'pesan' ? 'pesanan' : 'pembelian'}</b><span>{lines.length} baris</span></div>
          <ul className={styles.review}>{lines.map((l) => <li key={l.key}><span>{prodById.get(l.product_id)?.name} · {l.qty} {l.unit}</span><strong>{rp(subtotal(l))}</strong></li>)}</ul>
          {mode === 'pesan' && expected && <small>Perkiraan datang {tgl(expected)}</small>}
        </section>
      </>}
    </fieldset>
    <footer className={styles.footer}>
      {stage > 0 && <div className={styles.total}><span>Total setelah diskon</span><b>{rp(total)}</b></div>}
      <div className={styles.footerActions}>
        <button type="button" disabled={busy} onClick={() => stage === 0 ? onClose() : openStage(stage - 1)}>{stage === 0 ? 'Batal' : 'Kembali'}</button>
        <button type="button" className="primary" disabled={busy} onClick={() => stage < 2 ? openStage(stage + 1) : save()}>
          {busy ? 'Menyimpan…' : stage === 0 ? 'Lanjut ke Barang' : stage === 1 ? 'Lanjut ke Pembayaran' : mode === 'pesan' ? 'Simpan pesanan' : 'Simpan belanja'}
        </button>
      </div>
    </footer>
  </section>;
}
