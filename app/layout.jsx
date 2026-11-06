import './globals.css';
import KosProvider from '@/components/KosProvider';
import { Toaster } from '@/components/ui';

import { SITE_URL as SITE } from '@/lib/plan';
const TITLE = 'PRASARA — Kos tetap berjalan. Anda tetap tenang.';
const DESC = 'Kelola kamar, penghuni, tagihan, pembayaran, dan keuntungan kos dalam satu dashboard. Coba gratis 30 hari.';
const IMAGE = { url: '/og.jpg', width: 1200, height: 630, alt: 'PRASARA — aplikasi pengelolaan kos' };

// Judul, deskripsi & gambar pratinjau saat link dibagikan (WhatsApp, Facebook, Telegram, X)
export const metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  applicationName: 'PRASARA',
  openGraph: { title: TITLE, description: DESC, url: '/', siteName: 'PRASARA', locale: 'id_ID', type: 'website', images: [IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [IMAGE.url] },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1D4A37' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Instrument+Serif&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <KosProvider>{children}</KosProvider>
        <Toaster />
      </body>
    </html>
  );
}
