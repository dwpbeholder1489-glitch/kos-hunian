'use client';
// Foto untuk satu data (kamar, produk, layanan/menu, cover, galeri). Foto pertama = foto utama.
// Ganti di satu tempat saja (relink) atau lepas tanpa menghapus file; pengelolaan file ada di Pustaka media.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Sheet, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import MediaPicker from '@/components/media/MediaPicker';
import Lightbox from '@/components/media/Lightbox';

const ASPECT = { cover: '16 / 9', kamar: '4 / 3', produk: '1 / 1', layanan: '4 / 3', galeri: '1 / 1', fasilitas: '4 / 3', portofolio: '1 / 1', lainnya: '1 / 1' };

export default function EntityPhotos({ kosId, entity, entityId = null, category, title = 'Foto', max = 8, canEdit = true, hint }) {
  const [pics, setPics] = useState(null);
  const [err, setErr] = useState(null);
  const [picker, setPicker] = useState(null); // {replaceLink}
  const [cur, setCur] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('media_for', { p_kos: kosId, p_entity: entity, p_entity_id: entityId }).then(({ data, error }) => {
    if (error) return setErr(/media_for/.test(error.message) ? 'Fitur foto sedang dipasang. Coba lagi beberapa menit lagi.' : errMsg(error));
    setErr(null); setPics(data || []);
  });
  useEffect(() => { load(); }, [kosId, entity, entityId]);
  const rpc = async (fn, args, ok) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(errMsg(error)); return false; }
    if (ok) toast(ok);
    await load(); return true;
  };
  const picked = async (ids) => {
    const p = picker; setPicker(null);
    if (p?.replaceLink) { if (await rpc('media_relink', { p_link: p.replaceLink, p_media: ids[0] }, 'Foto diganti di sini saja')) setCur(null); return; }
    setBusy(true);
    for (const [n, id] of ids.entries()) {
      const { error } = await supabase.rpc('media_link', { p_media: id, p_entity: entity, p_entity_id: entityId, p_main: entity === 'kos_cover' || (n === 0 && !(pics || []).length) });
      if (error) { toast(errMsg(error)); break; }
    }
    setBusy(false); load();
  };
  if (err) return <div className="small muted">{err}</div>;
  const list = pics || [];
  const aspect = ASPECT[category] || '1 / 1';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between"><span className="label">{title}{list.length ? ` (${list.length})` : ''}</span>
        {canEdit && list.length < max && <button className="sm" disabled={busy || !pics} onClick={() => setPicker({})}>+ Foto</button>}</div>
      {list.length > 0 ? (
        <div className="thumbrow">{list.map((p, i) => (
          <button key={p.link_id} type="button" className="thumb" style={{ aspectRatio: aspect }} onClick={() => (canEdit ? setCur({ ...p, i }) : setView(i))} aria-label={`Foto ${i + 1}${i === 0 ? ' (utama)' : ''}`}>
            <img src={mediaUrl(p.thumb_path)} alt={p.caption || ''} loading="lazy" />
            {i === 0 && max > 1 && <span className="mediabadge">Utama</span>}
          </button>
        ))}</div>
      ) : pics && <span className="small muted">{hint || 'Belum ada foto.'}</span>}
      {picker && <MediaPicker kosId={kosId} category={category} multiple={!picker.replaceLink && entity !== 'kos_cover'} max={picker.replaceLink ? 1 : max - list.length}
        exclude={list.map((p) => p.media_id)} title={picker.replaceLink ? 'Ganti foto ini' : `Tambah ${title.toLowerCase()}`} onClose={() => setPicker(null)} onPick={picked} />}
      {cur && !picker && <Sheet title={`${title} ${cur.i + 1}`} onClose={() => setCur(null)}>
        <button type="button" className="mediaprev" onClick={() => setView(cur.i)} aria-label="Perbesar"><img src={mediaUrl(cur.path)} alt={cur.caption || ''} /></button>
        {cur.shared && <span className="small muted">Foto ini juga dipakai di tempat lain. Ganti/lepas di sini tidak mengubah tempat lain.</span>}
        <div className="row">
          {cur.i > 0 && <button className="sm primary" disabled={busy} onClick={async () => { if (await rpc('media_main', { p_link: cur.link_id }, 'Jadi foto utama')) setCur(null); }}>Jadikan utama</button>}
          <button className="sm" disabled={busy} onClick={() => setPicker({ replaceLink: cur.link_id })}>Ganti foto ini</button>
          <button className="sm ghost danger" disabled={busy} onClick={async () => { if (window.confirm('Lepas foto dari sini? File tetap ada di Pustaka media.') && await rpc('media_unlink', { p_link: cur.link_id }, 'Foto dilepas')) setCur(null); }}>Lepas</button>
        </div>
        <Link href="/media" className="small">Kelola semua foto di Pustaka media →</Link>
      </Sheet>}
      {view != null && <Lightbox items={list} start={view} urlOf={mediaUrl} onClose={() => setView(null)} />}
    </div>
  );
}
