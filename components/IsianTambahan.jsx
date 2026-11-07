'use client';
// Isian tambahan (custom field) di menu bawaan: Penghuni, Barang/Bahan, Pesanan jasa, Kontak.
// Aturan & validasi di server (cf_set / cf_clean); di sini hanya tampilan & formulir.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { FieldInput, show, initialData, outData } from '@/lib/builder';

export const ENTITY = { occupant: 'Penghuni', product: 'Barang / bahan', svc_order: 'Pesanan jasa', contact: 'Pelanggan & supplier' };
export const ENTITY_FOR = { properti: ['occupant'], retail: ['product', 'contact'], jasa: ['svc_order', 'product', 'contact'] };
export const CF_TYPES = { text: 'Teks singkat', longtext: 'Teks panjang', number: 'Angka', currency: 'Uang (Rp)', date: 'Tanggal', select: 'Pilihan (satu)', multiselect: 'Pilihan (banyak)', boolean: 'Ya / tidak', phone: 'No. HP / WhatsApp' };

const cache = new Map(); // kosId → Promise<fields[]>
export function useCfFields(kosId, entity, ver) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!kosId) return;
    const k = kosId + ':' + ver;
    if (!cache.has(k)) cache.set(k, supabase.from('cf_fields').select('*').eq('kos_id', kosId).order('sort').then(({ data }) => data || []));
    cache.get(k).then((all) => setF(all.filter((x) => x.entity === entity && x.active)));
  }, [kosId, entity, ver]);
  return f;
}

// Panel tampil + ubah (nilai dibaca lewat cf_get sesuai hak akses); onSaved(extraBaru)
export default function IsianTambahan({ entity, id, extra, area, onSaved }) {
  const { kos, kosId, ver } = useKos();
  const fields = useCfFields(kosId, entity, ver);
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({});
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(null);
  // selalu baca dari server (nilai di daftar bisa sudah usang)
  useEffect(() => { if (id && fields?.length) supabase.rpc('cf_get', { p_kos: kosId, p_entity: entity, p_id: id }).then(({ data }) => setVal(data || extra || {})); }, [id, fields?.length, ver]);
  if (!fields || fields.length === 0 || !val) return null;
  const can = canArea(kos, area);
  const missing = fields.some((f) => f.required && f.type !== 'boolean' && (val[f.key] == null || val[f.key] === ''));
  const start = () => { setD(initialData(fields, val)); setEdit(true); };
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('cf_set', { p_kos: kosId, p_entity: entity, p_id: id, p_data: outData(fields, d) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Isian tambahan disimpan'); setVal(data || {}); setEdit(false); onSaved?.(data);
  };
  return (
    <section className="panel">
      <div className="row between"><span className="label">Isian tambahan</span>{can && !edit && <button className="sm ghost" onClick={start}>Ubah</button>}</div>
      {!edit ? <dl className="kv">{fields.map((f) => <span key={f.key} style={{ display: 'contents' }}><dt>{f.label}{f.required ? ' *' : ''}</dt><dd>{show(f, val[f.key])}</dd></span>)}</dl> : <>
        {fields.map((f) => f.type === 'boolean'
          ? <FieldInput key={f.key} f={f} value={d[f.key]} onChange={(v) => setD({ ...d, [f.key]: v })} />
          : <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.help}><FieldInput f={f} value={d[f.key]} onChange={(v) => setD({ ...d, [f.key]: v })} /></Field>)}
        <div className="row"><button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button><button className="sm ghost" onClick={() => setEdit(false)}>Batal</button></div>
      </>}
      {missing && !edit && <span className="small" style={{ color: 'var(--bad)' }}>Ada isian wajib yang belum diisi.</span>}
      {canArea(kos, 'settings') && <Link href="/konfigurasi?tab=isian" className="small">Atur isian tambahan</Link>}
    </section>
  );
}
