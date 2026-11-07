import { SITE_URL } from '@/lib/plan';

// Peta situs halaman publik (halaman aplikasi & data bisnis privat tidak dimasukkan)
export default function sitemap() {
  const now = new Date();
  return [
    ['/', 1, 'weekly'], ['/panduan', 0.7, 'weekly'], ['/tentang', 0.5, 'monthly'], ['/privasi', 0.3, 'yearly'], ['/syarat', 0.3, 'yearly'], ['/masuk', 0.4, 'yearly'],
  ].map(([p, priority, changeFrequency]) => ({ url: SITE_URL + p, lastModified: now, changeFrequency, priority }));
}
