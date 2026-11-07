import { SITE_URL } from '@/lib/plan';

// Mesin pencari: halaman publik boleh; area aplikasi, admin, API, dan portal pribadi tidak diindeks
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/p/', '/buka', '/mulai', '/konfirmasi', '/beranda'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
