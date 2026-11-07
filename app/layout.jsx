import './globals.css';
import KosProvider from '@/components/KosProvider';
import { Toaster } from '@/components/ui';

import { SITE_URL as SITE } from '@/lib/plan';
import { themeScript } from '@/lib/theme';
const TITLE = 'PRASARA — Kelola Bisnis Lebih Terarah. Kembangkan dengan Lebih Cerdas.';
const DESC = 'Adaptive Business System untuk mengelola bisnis dari HP: kos & properti sewa, toko retail & grosir, laundry & jasa, kuliner, dan usaha lain. Coba gratis 30 hari.';
const IMAGE = { url: '/og.jpg?v=3', width: 1200, height: 630, alt: 'PRASARA — aplikasi pengelolaan bisnis' };

// Judul, deskripsi & gambar pratinjau saat link dibagikan (WhatsApp, Facebook, Telegram, X)
export const metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  applicationName: 'PRASARA',
  appleWebApp: { capable: true, title: 'PRASARA', statusBarStyle: 'default' },
  openGraph: { title: TITLE, description: DESC, url: '/', siteName: 'PRASARA', locale: 'id_ID', type: 'website', images: [IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [IMAGE.url] },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#08110F' };

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <KosProvider>{children}</KosProvider>
        <Toaster />
      </body>
    </html>
  );
}
