// Nama & ikon saat aplikasi ditambahkan ke layar utama HP ("Tambahkan ke Layar Utama")
export default function manifest() {
  return {
    name: 'PRASARA',
    short_name: 'PRASARA',
    description: 'One Intelligence. Every Business. Kelola kos, toko & bisnis Anda dari HP.',
    start_url: '/buka',
    display: 'standalone',
    background_color: '#08110F',
    theme_color: '#08110F',
    lang: 'id',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
