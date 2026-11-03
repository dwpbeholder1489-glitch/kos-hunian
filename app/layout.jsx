import './globals.css';
import KosProvider from '@/components/KosProvider';
import { Toaster } from '@/components/ui';

export const metadata = {
  title: 'Kos Hunian — Manage Smarter. Live Better.',
  description: 'Aplikasi pengelolaan kos: kamar, penghuni, tagihan, pembayaran, dan laporan keuangan.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1D4A37' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Instrument+Serif&display=swap" />
      </head>
      <body>
        <KosProvider>{children}</KosProvider>
        <Toaster />
      </body>
    </html>
  );
}
