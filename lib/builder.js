'use client';
// Business Builder: tipe field, tampilan nilai, input formulir, dan pemuat konfigurasi (dipakai /builder, /catatan, /kerja, /laporan-kustom)
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { rp, angka, tgl, errMsg } from '@/lib/format';

export const FTYPES = {
  text: 'Teks singkat', longtext: 'Teks panjang', number: 'Angka', currency: 'Uang (Rp)', date: 'Tanggal', datetime: 'Tanggal & jam',
  select: 'Pilihan (satu)', multiselect: 'Pilihan (banyak)', boolean: 'Ya / tidak', phone: 'No. HP / WhatsApp', reference: 'Rujukan ke data lain',
};
export const TONES = { info: 'Biru', gold: 'Emas', good: 'Hijau', bad: 'Merah', void: 'Abu-abu' };
export const BROLES = [['pengelola', 'Pengelola'], ['operator', 'Petugas proses']];
export const ICONS = ['📋', '🔧', '🏍️', '🚗', '👤', '💇', '🍱', '📦', '🧾', '🛠️', '🎓', '🏥', '🌾', '🐟', '🎉', '📅'];
export const fieldsOf = (cfg, objectId) => cfg.fields.filter((f) => f.object_id === objectId && f.active).sort((a, b) => a.sort - b.sort);
export const statusesOf = (cfg, objectId) => cfg.statuses.filter((s) => s.object_id === objectId && s.active).sort((a, b) => a.sort - b.sort);
export const statusById = (cfg, id) => cfg.statuses.find((s) => s.id === id);

const tz = { timeZone: 'Asia/Jakarta' };
export const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const umur = (ts) => { const h = Math.floor((Date.now() - new Date(ts).getTime()) / 36e5); return h < 1 ? 'baru saja' : h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`; };

// Tampilan nilai sesuai tipe (refs: Map id → judul untuk field rujukan)
export function show(f, v, refs) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  switch (f.type) {
    case 'currency': return rp(Number(v));
    case 'number': return angka(Number(v));
    case 'date': return tgl(v);
    case 'datetime': return waktu(v);
    case 'boolean': return v === true ? 'Ya' : 'Tidak';
    case 'multiselect': return (Array.isArray(v) ? v : []).join(', ');
    case 'reference': return refs?.get(v) || 'data terhapus/diarsipkan';
    default: return String(v);
  }
}

// Nilai awal formulir (default field; datetime-local dalam WIB)
export const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : '');
export const fromLocal = (v) => (v ? new Date(v + ':00+07:00').toISOString() : null);
export function initialData(fields, data) {
  const out = {};
  for (const f of fields) {
    const v = data?.[f.key];
    if (v !== undefined) out[f.key] = f.type === 'datetime' ? toLocal(v) : f.type === 'number' || f.type === 'currency' ? String(v) : v;
    else if (f.default_value != null) out[f.key] = f.type === 'boolean' ? f.default_value === 'true' : f.type === 'multiselect' ? f.default_value.split(',').map((x) => x.trim()).filter(Boolean) : f.default_value;
    else out[f.key] = f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : '';
  }
  return out;
}
// "1.250.000" / "1.234,5" = ribuan bertitik (gaya Indonesia); "12,5" atau "12.5" = desimal
export const numText = (t) => { let x = String(t).trim().replace(/\s|rp/gi, ''); if (x === '') return null; if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, ''); return x.replace(',', '.'); };
// Siapkan untuk server (server tetap memvalidasi ulang semuanya)
export function outData(fields, form) {
  const out = {};
  for (const f of fields) {
    let v = form[f.key];
    if (f.type === 'datetime') v = fromLocal(v);
    if ((f.type === 'number' || f.type === 'currency') && typeof v === 'string') v = numText(v);
    out[f.key] = v;
  }
  return out;
}

// Satu input sesuai tipe field
export function FieldInput({ f, value, onChange, refOpts, disabled }) {
  const id = 'f_' + f.key;
  const common = { id, disabled, 'aria-label': f.label };
  switch (f.type) {
    case 'longtext': return <textarea {...common} rows={3} maxLength={3000} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number': return <input {...common} inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'currency': return <input {...common} inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder="Rp" />;
    case 'date': return <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime': return <input {...common} type="datetime-local" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone': return <input {...common} inputMode="tel" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean': return <label className="row small" style={{ flexWrap: 'nowrap' }}><input {...common} type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={value === true} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
    case 'select': return <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">— pilih —</option>{f.choices.map((c) => <option key={c} value={c}>{c}</option>)}</select>;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      return <div className="row" style={{ gap: 6 }}>{f.choices.map((c) => <button type="button" key={c} disabled={disabled} className={'sm ' + (arr.includes(c) ? 'primary' : 'ghost')} onClick={() => onChange(arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c])}>{c}</button>)}</div>;
    }
    case 'reference': return <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">— pilih —</option>{(refOpts || []).map((o) => <option key={o.id} value={o.id}>{o.title} · {o.number}</option>)}</select>;
    default: return <input {...common} maxLength={300} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// Konfigurasi bisnis kustom (dibaca langsung; isinya bukan data rahasia)
export function useBuilder(kosId, ver) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const load = async () => {
    const q = (t, o = 'sort') => supabase.from(t).select('*').eq('kos_id', kosId).order(o);
    const [w, o, f, s, t, r] = await Promise.all([supabase.from('bb_workspace').select('*').eq('kos_id', kosId).maybeSingle(), q('bb_objects'), q('bb_fields'), q('bb_statuses'), supabase.from('bb_transitions').select('*').eq('kos_id', kosId), q('bb_reports')]);
    const e = [w, o, f, s, t, r].find((x) => x.error);
    if (e) return setErr(errMsg(e.error));
    setCfg({ ws: w.data, objects: o.data || [], fields: f.data || [], statuses: s.data || [], rules: t.data || [], reports: r.data || [] });
  };
  useEffect(() => { if (kosId) load(); }, [kosId, ver]);
  return { cfg, err, reload: load };
}

// Langkah status yang boleh dilakukan peran ini dari status sekarang (server tetap pemutus akhir)
export function nextSteps(cfg, rec, role) {
  const cur = statusById(cfg, rec.status_id);
  return cfg.rules.filter((t) => t.object_id === rec.object_id && t.to_status !== rec.status_id
    && (t.from_status === rec.status_id || (t.from_status == null && !cur?.is_final))
    && (role === 'pemilik' || !t.roles?.length || t.roles.includes(role)))
    .map((t) => ({ ...t, to: statusById(cfg, t.to_status) })).filter((t) => t.to?.active)
    .filter((t, i, a) => a.findIndex((x) => x.to_status === t.to_status) === i);
}
