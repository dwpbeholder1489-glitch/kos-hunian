'use client';
// Unggah foto sederhana: Kamera / Galeri → pratinjau → (opsional) rasio, putar, posisi → Simpan. Banyak foto sekaligus,
// progres per foto, coba ulang bila gagal. Foto dikecilkan di HP (maks 1600 px + thumbnail 480 px) sebelum dikirim.
import { useEffect, useRef, useState } from 'react';
import { Sheet, toast } from '@/components/ui';
import { RATIOS, loadImage, renderImage, uploadMedia } from '@/lib/media';

const DEFAULT_RATIO = { cover: '16:9', kamar: '4:3', produk: '1:1', layanan: '4:3', fasilitas: '4:3', portofolio: 'asli', galeri: 'asli', lainnya: 'asli' };

function Item({ it, onChange, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true; let u;
    renderImage(it.img, it.opts, 560, 0.7).then(({ blob }) => { if (alive && blob) { u = URL.createObjectURL(blob); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [it.img, it.opts]);
  const ratio = RATIOS.find((r) => r[0] === it.opts.key)?.[2];
  const imgRatio = it.opts.rotate % 180 ? it.img.naturalHeight / it.img.naturalWidth : it.img.naturalWidth / it.img.naturalHeight;
  const axis = ratio ? (imgRatio > ratio ? 'x' : imgRatio < ratio ? 'y' : null) : null;
  const set = (o) => onChange({ ...it, opts: { ...it.opts, ...o } });
  return (
    <div className="unitbox" style={{ gap: 8 }}>
      <div className="mediaprev">{url ? <img src={url} alt="Pratinjau" /> : <span className="small muted">Memproses…</span>}
        {it.status === 'ok' && <span className="mediabadge good">✓ Tersimpan</span>}
        {it.status === 'up' && <span className="mediabadge">Mengunggah…</span>}
      </div>
      {it.status !== 'ok' && <>
        <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{RATIOS.map(([k, l, r]) => <button key={k} type="button" className={it.opts.key === k ? 'on' : ''} onClick={() => set({ key: k, ratio: r, fx: 0.5, fy: 0.5 })}>{l}</button>)}</div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button type="button" className="sm" onClick={() => set({ rotate: (it.opts.rotate + 90) % 360 })} aria-label="Putar 90 derajat">↻ Putar</button>
          {axis && <label className="small" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>{axis === 'x' ? 'Geser ↔' : 'Geser ↕'}
            <input type="range" min="0" max="100" value={Math.round((axis === 'x' ? it.opts.fx : it.opts.fy) * 100)} onChange={(e) => set(axis === 'x' ? { fx: e.target.value / 100 } : { fy: e.target.value / 100 })} style={{ flex: 1, minHeight: 32 }} /></label>}
          {!axis && <span style={{ flex: 1 }} />}
          <button type="button" className="sm ghost danger" onClick={onRemove}>Buang</button>
        </div>
        {it.status === 'err' && <div className="notice bad small">{it.error}</div>}
      </>}
    </div>
  );
}

export default function MediaUploader({ kosId, category = 'lainnya', multiple = true, max = 10, replaceId, title, onClose, onDone }) {
  const cam = useRef(null); const gal = useRef(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, multiple ? max - items.length : 1);
    e.target.value = '';
    const key = DEFAULT_RATIO[category] || 'asli';
    const next = [];
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) { toast(`${f.name}: bukan foto`); continue; }
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name}: terlalu besar (maks 25 MB)`); continue; }
      try { const img = await loadImage(f); next.push({ id: Math.random().toString(36).slice(2), file: f, img, opts: { key, ratio: RATIOS.find((r) => r[0] === key)[2], rotate: 0, fx: 0.5, fy: 0.5 }, status: 'new' }); }
      catch (er) { toast(er.message); }
    }
    setItems((x) => (multiple ? [...x, ...next] : next.slice(0, 1)));
  };
  const save = async () => {
    setBusy(true);
    const done = [];
    let list = items;
    for (const it of list) {
      if (it.status === 'ok') { done.push(it.result); continue; }
      list = list.map((x) => (x.id === it.id ? { ...x, status: 'up', error: null } : x)); setItems(list);
      try {
        const res = await uploadMedia({ kosId, category, file: it.file, img: it.img, opts: it.opts, replaceId });
        list = list.map((x) => (x.id === it.id ? { ...x, status: 'ok', result: res } : x)); done.push(res);
      } catch (er) {
        list = list.map((x) => (x.id === it.id ? { ...x, status: 'err', error: er.message + (er.retry ? ' — tekan Simpan untuk mencoba lagi.' : '') } : x));
        if (er.limit) { setItems(list); setBusy(false); return; }
      }
      setItems(list);
    }
    setBusy(false);
    if (list.every((x) => x.status === 'ok')) { toast(done.length > 1 ? `${done.length} foto tersimpan` : 'Foto tersimpan'); onDone?.(done); }
  };
  const left = items.filter((x) => x.status !== 'ok').length;
  return (
    <Sheet title={title || (replaceId ? 'Ganti gambar' : 'Tambah foto')} onClose={() => !busy && onClose()}>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" multiple={multiple && !replaceId} hidden onChange={pick} />
      {(multiple || items.length === 0) && items.length < max && <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button type="button" className="primary" style={{ flex: 1 }} onClick={() => cam.current?.click()} disabled={busy}>📷 Kamera</button>
        <button type="button" style={{ flex: 1 }} onClick={() => gal.current?.click()} disabled={busy}>🖼 Galeri</button>
      </div>}
      {items.length === 0 && <span className="small muted">Pilih foto dari kamera atau galeri HP. Foto otomatis dikecilkan agar cepat dibuka pelanggan. Format JPG, PNG, WebP (foto iPhone otomatis dikonversi).</span>}
      {items.map((it) => <Item key={it.id} it={it} onChange={(n) => setItems((x) => x.map((y) => (y.id === it.id ? n : y)))} onRemove={() => setItems((x) => x.filter((y) => y.id !== it.id))} />)}
      {items.length > 0 && <button className="cta" disabled={busy || left === 0} onClick={save}>{busy ? 'Menyimpan…' : replaceId ? 'Simpan & ganti' : `Simpan ${left} foto`}</button>}
      {replaceId && <span className="small muted">Gambar baru menggantikan gambar ini di <b>semua</b> tempat yang memakainya.</span>}
    </Sheet>
  );
}
