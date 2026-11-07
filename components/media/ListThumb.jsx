'use client';
// Foto kecil di daftar (Barang, Kasir, Kamar, Layanan/Menu, Pesanan). Satu panggilan per daftar (media_thumbs).
// Tidak ada foto → tidak menampilkan apa-apa (daftar tetap ringkas); gagal muat → disembunyikan.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mediaUrl } from '@/lib/media';

export function useThumbs(kosId, entity, ver) {
  const [map, setMap] = useState({});
  useEffect(() => {
    if (!kosId) return;
    let live = true;
    supabase.rpc('media_thumbs', { p_kos: kosId, p_entity: entity }).then(({ data, error }) => { if (live) setMap(error ? {} : data || {}); });
    return () => { live = false; };
  }, [kosId, entity, ver]);
  return map;
}

export default function ListThumb({ path, size = 44, radius = 8, style }) {
  const [bad, setBad] = useState(false);
  const url = mediaUrl(path);
  if (!url || bad) return null;
  return <img className="listthumb" src={url} alt="" loading="lazy" decoding="async" onError={() => setBad(true)}
    style={{ width: size, height: size, borderRadius: radius, ...style }} />;
}
