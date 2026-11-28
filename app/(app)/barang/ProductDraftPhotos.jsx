'use client';

import { useRef, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import MediaPicker from '@/components/media/MediaPicker';
import MediaUploader from '@/components/media/MediaUploader';
import styles from './product-form.module.css';

const maxPhotos = 5;

export default function ProductDraftPhotos({ kosId, ids, setIds, disabled }) {
  const [picker, setPicker] = useState(null);
  const camera = useRef(null);
  const gallery = useRef(null);
  const available = maxPhotos - ids.length;
  const unable = disabled || available === 0;
  function pickFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) setPicker({ files });
  }
  function addPhotos(picked) {
    setIds((current) => [...new Set([...current, ...picked])].slice(0, maxPhotos));
    setPicker(null);
  }

  return <section className={styles.card} aria-labelledby="product-photo-title">
    <div className={styles.photoHeading}>
      <h2 id="product-photo-title">Foto Produk</h2><span>Opsional</span>
    </div>
    <p>Tambahkan hingga {maxPhotos} foto. Foto pertama menjadi foto utama di katalog.</p>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pickFiles} />
    <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
    <div className={styles.photoGrid}>
      <button type="button" className={styles.uploadArea} disabled={unable} onClick={() => setPicker({})}>
        <NavIcon name="upload" size={34} /><b>Unggah Foto</b><small>JPG, PNG, WebP</small>
      </button>
      <div className={styles.photoActions}>
        <button type="button" disabled={unable} onClick={() => camera.current?.click()}><NavIcon name="photo" /><b>Ambil Foto</b><NavIcon name="next" size={16} /></button>
        <button type="button" disabled={unable} onClick={() => gallery.current?.click()}><NavIcon name="photo" /><b>Pilih dari Galeri</b><NavIcon name="next" size={16} /></button>
      </div>
    </div>
    {ids.length > 0 && <ol className={styles.selectedPhotos}>
      {ids.map((id, index) => <li key={id}>
        <span>Foto {index + 1}{index === 0 ? ' · Utama' : ''}</span>
        <button type="button" aria-label={`Lepas foto ${index + 1}`} disabled={disabled}
          onClick={() => setIds((current) => current.filter((entry) => entry !== id))}>Lepas</button>
      </li>)}
    </ol>}
    {picker?.files && <MediaUploader kosId={kosId} category="produk" title="Unggah foto produk" max={available}
      initialFiles={picker.files} onClose={() => setPicker(null)} onDone={(photos) => addPhotos(photos.map(({ id }) => id))} />}
    {picker && !picker.files && <MediaPicker kosId={kosId} category="produk" title="Unggah foto produk" max={available}
      exclude={ids} onClose={() => setPicker(null)} onPick={addPhotos} />}
  </section>;
}
