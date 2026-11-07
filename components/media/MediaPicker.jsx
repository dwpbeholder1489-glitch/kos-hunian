'use client';
// Pilih foto: unggah baru (kamera/galeri) atau ambil dari Pustaka media (tanpa upload ulang).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { mediaUrl, CATEGORIES } from '@/lib/media';
import MediaUploader from '@/components/media/MediaUploader';

export default function MediaPicker({ kosId, category, multiple = true, max = 8, exclude = [], title, onClose, onPick }) {
  const [mode, setMode] = useState(null); // null | upload | library
  const [lib, setLib] = useState(null);
  const [sel, setSel] = useState([]);
  const [cat, setCat] = useState('semua');
  useEffect(() => {
    if (mode !== 'library' || lib) return;
    supabase.rpc('media_list', { p_kos: kosId }).then(({ data, error }) => (error ? toast(errMsg(error)) : setLib(data.items || [])));
  }, [mode]);
  if (mode === 'upload') return <MediaUploader kosId={kosId} category={category} multiple={multiple} max={max} title={title} onClose={onClose} onDone={(res) => onPick(res.map((r) => r.id))} />;
  if (mode === 'library') {
    const items = (lib || []).filter((m) => !exclude.includes(m.id) && (cat === 'semua' || m.category === cat));
    const cats = [...new Set((lib || []).map((m) => m.category))];
    return (
      <Sheet title="Pilih dari pustaka" onClose={onClose}>
        {!lib ? <Loading /> : lib.length === 0 ? <div className="notice">Pustaka masih kosong. <button className="sm primary" onClick={() => setMode('upload')}>Unggah foto</button></div> : <>
          {cats.length > 1 && <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}><button className={cat === 'semua' ? 'on' : ''} onClick={() => setCat('semua')}>Semua</button>{cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)} style={{ whiteSpace: 'nowrap' }}>{CATEGORIES[c]}</button>)}</div>}
          <div className="mediagrid">{items.map((m) => {
            const on = sel.includes(m.id);
            return (
              <button key={m.id} type="button" className={'mediacell' + (on ? ' on' : '')} aria-pressed={on} aria-label={m.caption || m.name || 'Foto'}
                onClick={() => setSel(on ? sel.filter((x) => x !== m.id) : multiple ? (sel.length < max ? [...sel, m.id] : sel) : [m.id])}>
                <img src={mediaUrl(m.thumb_path)} alt="" loading="lazy" />
                {on && <span className="mediacheck">✓</span>}
              </button>
            );
          })}</div>
          {items.length === 0 && <span className="small muted">Tidak ada foto lain di kategori ini.</span>}
          <button className="cta" disabled={!sel.length} onClick={() => onPick(sel)}>Pakai {sel.length || ''} foto</button>
          <span className="small muted">Foto yang sama bisa dipakai di beberapa tempat tanpa diunggah ulang.</span>
        </>}
      </Sheet>
    );
  }
  return (
    <Sheet title={title || 'Tambah foto'} onClose={onClose}>
      <button className="cta" onClick={() => setMode('upload')}>📷 Unggah foto baru</button>
      <button onClick={() => setMode('library')}>🗂 Pilih dari pustaka media</button>
    </Sheet>
  );
}
