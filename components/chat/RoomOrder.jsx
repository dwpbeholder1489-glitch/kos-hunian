'use client';
import { useEffect,useState,useRef } from 'react';
import { Sheet,Field,toast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { errMsg,rp } from '@/lib/format';
import { qtyNum,uid } from '@/lib/retail';
import styles from './chat.module.css';

export default function RoomOrder({ conv,kosId,onClose,onSaved }) {
  const jasa = conv.channel === 'jasa';
  const [catalog,setCatalog] = useState([]);
  const [query,setQuery] = useState('');
  const [lines,setLines] = useState([]);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const [ids] = useState(() => [uid(),uid()]);
  useEffect(() => {
    let live = true;
    const req = jasa ? supabase.from('svc_services').select('id,name,unit,price').eq('kos_id',kosId).eq('active',true)
      .ilike('name', '%' + query.replace(/[%_]/g,'') + '%').order('name').limit(20)
      : supabase.rpc('cx_products',{ p_kos:kosId,p_search:query });
    req.then(({data,error}) => {
      if (!live) return;
      if (error) toast(errMsg(error));
      setCatalog(data || []);
    });
    return () => { live = false; };
  },[kosId,jasa,query]);
  const options = catalog.flatMap((p) => (jasa ? [{ name:p.unit,price:p.price }] : p.units || []).map((u) => ({
    id:p.id,name:p.name,unit:u.name,price:conv.channel === 'grosir' && u.wholesale > 0 ? u.wholesale : u.price,
  })));
  const add = (line) => setLines((old) => old.some((r) => r.id === line.id && r.unit === line.unit)
    ? old.map((r) => r.id === line.id && r.unit === line.unit ? { ...r,qty:String((qtyNum(r.qty) || 0) + 1) } : r)
    : [...old,{ ...line,qty:'1' }]);
  async function save() {
    if (lock.current || !lines.length || lines.some((l) => !(qtyNum(l.qty) > 0))) return;
    lock.current = true; setBusy(true);
    try {
      const {error} = await supabase.rpc('cx_order_from_room',{
        p_conv:conv.id,p_order:ids[0],p_message:ids[1],
        p_lines:lines.map((l) => ({ ...(jasa ? {service_id:l.id} : {product_id:l.id,unit:l.unit}), qty:qtyNum(l.qty) })),
      });
      if (error) return toast(errMsg(error));
      onSaved();
    } finally { lock.current = false; setBusy(false); }
  }
  return <Sheet title="Buat pesanan" subtitle={conv.customer} icon="cart" onClose={onClose} wide>
    <Field label={jasa ? 'Cari layanan' : 'Cari produk'}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
    <div className={styles.orderOptions}>{options.map((l) => <button key={l.id+l.unit} onClick={() => add(l)} disabled={busy}>
      <span>{l.name}</span><small>{rp(l.price)} / {l.unit}</small>
    </button>)}</div>
    {lines.map((l,i) => <div key={l.id+l.unit} className={styles.orderLine}>
      <b>{l.name} · {l.unit}</b>
      <Field label="Jumlah"><input inputMode="decimal" value={l.qty} disabled={busy} onChange={(e) => setLines(lines.map((x,j) => j === i ? {...x,qty:e.target.value} : x))} /></Field>
      <button disabled={busy} onClick={() => setLines(lines.filter((_,j) => j !== i))}>Hapus</button>
    </div>)}
    <p>Harga akhir ditentukan oleh aturan harga pelanggan. Pesanan dikonfirmasi dan kartunya dikirim ke percakapan. Pembayaran dicatat terpisah.</p>
    <button className="primary" disabled={busy || !lines.length || lines.some((l) => !(qtyNum(l.qty) > 0))} onClick={save}>{busy ? 'Menyimpan…' : 'Konfirmasi & kirim pesanan'}</button>
  </Sheet>;
}
