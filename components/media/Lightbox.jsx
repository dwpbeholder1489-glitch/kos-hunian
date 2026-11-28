'use client';

import { useRef, useState } from 'react';
import SmartDetailSheet from '@/components/SmartDetailSheet';
import styles from './lightbox.module.css';

export default function Lightbox({ items, start = 0, onClose, urlOf }) {
  const [index, setIndex] = useState(start);
  const touchStart = useRef(null);
  const count = items.length;
  if (!count) return null;
  const item = items[index % count];
  const move = (direction) => setIndex((current) => (current + direction + count) % count);

  return <SmartDetailSheet title="Foto" subtitle={count > 1 ? `${index % count + 1} dari ${count}` : undefined} icon="photo" wide onClose={onClose} onKeyDown={(event) => {
    if (count > 1 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }
  }}>
    <figure className={styles.figure}
      onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(distance) > 50 && count > 1) move(distance < 0 ? 1 : -1);
      }}>
      <img src={urlOf(item.path)} alt={item.caption || `Foto ${index % count + 1}`} />
      {item.caption && <figcaption>{item.caption}</figcaption>}
    </figure>
    {count > 1 && <div className={styles.actions}>
      <button type="button" onClick={() => move(-1)}>‹ Sebelumnya</button>
      <button type="button" onClick={() => move(1)}>Berikutnya ›</button>
    </div>}
  </SmartDetailSheet>;
}
