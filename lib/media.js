// Media Library (foto publik bisnis). File di bucket publik "media"; database menyimpan path.
import { supabase } from '@/lib/supabase';

export const mediaUrl = (path) => (path && process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}` : null);

export const CATEGORIES = { cover: 'Cover', galeri: 'Galeri', kamar: 'Kamar', produk: 'Produk', layanan: 'Layanan/menu', fasilitas: 'Fasilitas', portofolio: 'Portofolio', lainnya: 'Lainnya' };
export const RATIOS = [['asli', 'Asli', null], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:4', '3:4', 3 / 4], ['16:9', '16:9', 16 / 9]];
export const ENTITY_LABEL = { kos_cover: 'Cover bisnis', kos_gallery: 'Galeri bisnis', room: 'Kamar', product: 'Produk', service: 'Layanan/menu' };

// Muat file foto dari HP (JPEG/PNG/WebP/HEIC yang dikonversi iOS) jadi <img>
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca. Pakai JPG, PNG, atau WebP.'));
    img.src = URL.createObjectURL(file);
  });
}

// Potong (rasio + posisi fokus 0..1) & putar (0/90/180/270), lalu kecilkan ke maks `max` px → Blob JPEG
export function renderImage(img, { ratio = null, rotate = 0, fx = 0.5, fy = 0.5 } = {}, max = 1600, quality = 0.82) {
  const rot = ((rotate % 360) + 360) % 360;
  const W0 = rot % 180 ? img.naturalHeight : img.naturalWidth; const H0 = rot % 180 ? img.naturalWidth : img.naturalHeight;
  // area potong pada gambar yang sudah diputar
  let cw = W0, ch = H0;
  if (ratio) { if (W0 / H0 > ratio) cw = Math.round(H0 * ratio); else ch = Math.round(W0 / ratio); }
  const cx = Math.round((W0 - cw) * fx); const cy = Math.round((H0 - ch) * fy);
  const s = Math.min(1, max / Math.max(cw, ch));
  const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(cw * s)); out.height = Math.max(1, Math.round(ch * s));
  const g = out.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
  g.scale(s, s); g.translate(-cx, -cy);
  // putar seluruh gambar ke ruang W0×H0
  g.translate(W0 / 2, H0 / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return new Promise((resolve) => out.toBlob((b) => resolve({ blob: b, w: out.width, h: out.height }), 'image/jpeg', quality));
}

async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }

// Unggah satu foto (full + thumbnail) → { id, path, thumb_path } ; opts: {ratio, rotate, fx, fy}
export async function uploadMedia({ kosId, category, file, img, opts, replaceId }) {
  const im = img || (await loadImage(file));
  const full = await renderImage(im, opts, 1600, 0.82);
  const thumb = await renderImage(im, opts, 480, 0.74);
  if (!full.blob || !thumb.blob) throw new Error('Foto gagal diproses di HP ini');
  const fd = new FormData();
  fd.append('action', replaceId ? 'replace' : 'upload');
  if (replaceId) fd.append('id', replaceId); else { fd.append('kos', kosId); fd.append('category', category); fd.append('name', file?.name || 'foto.jpg'); }
  fd.append('w', String(full.w)); fd.append('h', String(full.h));
  fd.append('full', full.blob, 'full.jpg'); fd.append('thumb', thumb.blob, 'thumb.jpg');
  const r = await fetch('/api/media', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) { const e = new Error(d.error || 'Gagal mengunggah'); e.retry = Boolean(d.retry) || r.status >= 500; e.limit = d.limit; throw e; }
  return d;
}

export async function deleteMedia(id, force) {
  const r = await fetch(`/api/media?id=${encodeURIComponent(id)}${force ? '&force=1' : ''}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) { const e = new Error(d.error || 'Gagal menghapus'); e.inUse = d.inUse; throw e; }
  return true;
}
