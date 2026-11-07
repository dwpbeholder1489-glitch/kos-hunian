'use client';
// Unggah/ganti/hapus logo bisnis (dikecilkan di HP menjadi JPG 512 px sebelum dikirim).
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { toast } from '@/components/ui';
import { compressImage } from '@/lib/image';
import { logoUrl } from '@/lib/logo';

const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

export default function LogoUpload({ onChanged }) {
  const { kos, kosId, loadKos } = useKos();
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState(kos?.profile?.logo_path || null);
  const inp = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const blob = await (await fetch(await compressImage(f, 512, 0.85))).blob();
      const fd = new FormData(); fd.append('kos', kosId); fd.append('file', blob, 'logo.jpg');
      const r = await fetch('/api/logo', { method: 'POST', headers: { authorization: 'Bearer ' + (await token()) }, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal mengunggah');
      setPath(j.path); toast('Logo disimpan'); loadKos?.(); onChanged?.();
    } catch (x) { toast(x.message || 'Gambar tidak bisa dibaca'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm('Hapus logo?')) return;
    setBusy(true);
    const r = await fetch(`/api/logo?kos=${kosId}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + (await token()) } });
    setBusy(false);
    if (!r.ok) return toast('Gagal menghapus');
    setPath(null); toast('Logo dihapus'); loadKos?.(); onChanged?.();
  };
  return (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', background: 'var(--sunk)', border: '1px solid var(--line)', flex: 'none', display: 'grid', placeItems: 'center' }}>
        {logoUrl(path) ? <img src={logoUrl(path)} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="small muted">Logo</span>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="sm" disabled={busy} onClick={() => inp.current?.click()}>{busy ? 'Menyimpan…' : path ? 'Ganti logo' : 'Unggah logo'}</button>
        {path && <button className="sm ghost danger" disabled={busy} onClick={remove}>Hapus</button>}
      </div>
      <input ref={inp} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}
