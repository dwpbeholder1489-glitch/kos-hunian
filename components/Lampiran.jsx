'use client';
// Lampiran foto/file untuk satu data (catatan, pesanan, keluhan, penghuni, pengeluaran).
// Izin & batas diperiksa database; file lewat /api/lampiran (Supabase Storage privat, tautan sementara).
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { toast } from '@/components/ui';
import { compressImage } from '@/lib/image';

const mb = (n) => (Number(n) / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 });
const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

async function toBlob(dataUrl) { return (await fetch(dataUrl)).blob(); }

export default function Lampiran({ entity, id, title = 'Lampiran', hint }) {
  const { ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');
  const [del, setDel] = useState(null);
  const inp = useRef(null);

  const load = async () => {
    try {
      const r = await fetch(`/api/lampiran?entity=${entity}&id=${id}`, { headers: { authorization: 'Bearer ' + (await token()) } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Lampiran tidak bisa dimuat'); return; }
      setErr(null); setD(j);
    } catch { setErr('Lampiran tidak bisa dimuat. Periksa koneksi internet.'); }
  };
  useEffect(() => { if (id) load(); }, [entity, id, ver]);

  const pick = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `Mengunggah ${i + 1}/${files.length}…` : 'Mengunggah…');
      try {
        let blob = f; let name = f.name || 'lampiran';
        if (f.type === 'application/pdf' || /\.pdf$/i.test(name)) {
          if (f.size > 4 * 1048576) { toast(`${name}: PDF terlalu besar (maks 4 MB)`); continue; }
        } else if (f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(name)) {
          // foto dikecilkan dulu (hemat kuota & cepat di HP); HEIC iPhone ikut jadi JPG
          blob = await toBlob(await compressImage(f, 1600, 0.8));
          name = name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg';
        } else { toast(`${name}: jenis file tidak didukung (foto atau PDF saja)`); continue; }
        const fd = new FormData(); fd.append('entity', entity); fd.append('id', id); fd.append('file', blob, name);
        const r = await fetch('/api/lampiran', { method: 'POST', headers: { authorization: 'Bearer ' + (await token()) }, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(j.error || 'Gagal mengunggah'); if (j.limit) break; continue; }
      } catch (x) { toast(`${f.name}: ${x.message || 'gagal dibaca'}`); }
    }
    setBusy(''); await load();
  };

  const remove = async (a) => {
    setBusy('Menghapus…');
    const r = await fetch(`/api/lampiran?att=${a.id}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + (await token()) } });
    const j = await r.json().catch(() => ({}));
    setBusy(''); setDel(null);
    if (!r.ok) return toast(j.error || 'Gagal menghapus');
    toast('Lampiran dihapus'); load();
  };

  if (!id) return null;
  return (
    <section className="panel">
      <div className="row between"><span className="label">📎 {title}{d?.items?.length ? ` (${d.items.length})` : ''}</span>
        {d?.can_add && <button className="sm" disabled={!!busy} onClick={() => inp.current?.click()}>{busy || '+ Foto / file'}</button>}</div>
      <input ref={inp} type="file" accept="image/*,application/pdf" multiple hidden onChange={pick} />
      {err ? <span className="small muted">{err}</span> : !d ? <span className="small muted">Memuat…</span> : <>
        {d.items.length === 0 ? <span className="small muted">{hint || 'Belum ada lampiran.'}</span> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
            {d.items.map((a) => (
              <div key={a.id} style={{ position: 'relative', minWidth: 0 }}>
                <a href={a.url || '#'} target="_blank" rel="noreferrer" title={a.name}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--sunk)', border: '1px solid var(--line)', color: 'inherit', textDecoration: 'none' }}>
                  {a.mime.startsWith('image/') && a.url ? <img src={a.url} alt={a.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 28 }}>📄</span>}
                </a>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{a.name}</div>
                {d.can_add && <button className="sm ghost" aria-label={`Hapus ${a.name}`} onClick={() => setDel(a)}
                  style={{ position: 'absolute', top: 2, right: 2, padding: '0 7px', minHeight: 24, background: 'var(--surface)', borderRadius: 12 }}>✕</button>}
              </div>
            ))}
          </div>
        )}
        {del && <div className="notice" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small">Hapus <b>{del.name}</b>? File dihapus permanen; catatannya tetap ada di riwayat.</span>
          <button className="sm danger" disabled={!!busy} onClick={() => remove(del)}>Ya, hapus</button><button className="sm ghost" onClick={() => setDel(null)}>Batal</button></div>}
        <span className="small muted" style={{ fontSize: 11 }}>Foto (dikecilkan otomatis) atau PDF maks 4 MB, 10 per data.{d.limit_mb != null ? ` Terpakai ${mb(d.used)} MB dari ${d.limit_mb} MB.` : ''}{d.items.length ? ' Ketuk untuk membuka.' : ''}</span>
      </>}
    </section>
  );
}
