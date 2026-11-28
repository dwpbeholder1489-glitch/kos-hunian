import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, Loading, run, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import styles from './inventaris.module.css';

export function InventoryTemplates({ kosId, rows, onClose, onApplied }) {
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState('');
  const [rooms, setRooms] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.from('room_inventory_templates').select('id,name,items').eq('kos_id', kosId).order('name');
  useEffect(() => {
    let active = true;
    load().then((res) => { if (active) setResult(res); });
    return () => { active = false; };
  }, [kosId]);
  const template = result?.data?.find((item) => item.id === selected);
  const save = async () => {
    const items = rows.find(({ r }) => r.id === source)?.its || [];
    if (!name.trim() || !items.length) return;
    if (items.length > 100) return toast('Template dapat memuat sampai 100 jenis barang.');
    setBusy(true);
    const ok = await run(() => supabase.from('room_inventory_templates').insert({
      kos_id: kosId, name: name.trim(), items: items.map(({ name, qty }) => ({ name, qty })),
    }), 'Template disimpan', errMsg);
    if (ok) {
      setName(''); setSource('');
      setResult(await load());
    }
    setBusy(false);
  };
  const apply = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('room_inventory_apply', { p_kos: kosId, p_template: selected, p_rooms: rooms });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data ? `${data} baris perlengkapan ditambahkan.` : 'Semua perlengkapan template sudah tercatat.');
    setRooms([]);
    onApplied();
  };
  return <Sheet title="Template Inventaris" icon="/barang" wide onClose={onClose}>
    <details className={styles.row}>
      <summary><b>Buat template dari kamar</b></summary>
      <p className="small muted">Simpan nama dan jumlah perlengkapan agar bisa dipakai lagi.</p>
      <Field label="Nama template"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Misalnya Kamar Standar" /></Field>
      <Field label="Kamar sumber"><select value={source} onChange={(e) => setSource(e.target.value)}><option value="">Pilih kamar</option>
        {rows.filter((x) => x.its.length).map(({ r }) => <option value={r.id} key={r.id}>{r.code}</option>)}</select></Field>
      <button disabled={busy || !name.trim() || !source} onClick={save}>Simpan template</button>
    </details>
    {!result ? <Loading rows={2} /> : result.error ? <p className="notice bad" role="alert">{errMsg(result.error)}</p> :
      <Field label="Terapkan template"><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Pilih template tersimpan</option>
        {result.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
    {template && <>
      <div className={styles.row}><b>Isi template</b><ul>{template.items.map((item, i) => <li key={i}>{item.name} × {item.qty}</li>)}</ul></div>
      <p className="small muted">Barang dengan nama sama di kamar tujuan akan dilewati. Kondisi dan tautan aset tetap tetap mengikuti data tiap kamar.</p>
      <div className={styles.destinations} role="group" aria-label="Kamar tujuan">
        {rows.map(({ r }) => <label key={r.id} className={styles.checkbox}><input type="checkbox" checked={rooms.includes(r.id)}
          onChange={(e) => setRooms(e.target.checked ? [...rooms, r.id] : rooms.filter((id) => id !== r.id))} />{r.code}</label>)}
      </div>
      <button className="cta" disabled={busy || !rooms.length || rooms.length > 200} onClick={apply}>Terapkan ke {rooms.length} kamar</button>
    </>}
  </Sheet>;
}
