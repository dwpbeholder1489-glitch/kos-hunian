import { SITE_URL } from '@/lib/plan';

// Mesin pencari: halaman publik boleh; area aplikasi, admin, API, dan portal pribadi tidak diindeks
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/api/link-banner/image'], disallow: ['/api/', '/admin', '/p/', '/c/', '/k/', '/buka', '/mulai', '/konfirmasi', '/beranda'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
