export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 630;
export const BANNER_UPLOAD_LIMIT = 3_000_000;

export const BANNER_MODES = [
  { id: 'auto', title: 'Banner Otomatis', description: 'Disusun PRASARA sesuai kategori bisnis dan halaman.', icon: '/pengalaman' },
  { id: 'photo', title: 'Banner dari Foto Bisnis', description: 'Utamakan foto cover atau galeri usaha Anda.', icon: '/media' },
  { id: 'custom', title: 'Banner Custom', description: 'Unggah desain sendiri. PRASARA menyesuaikannya ke 1200 × 630 piksel.', icon: 'upload' },
];

export const BANNER_CATEGORIES = {
  retail: { label: 'Retail & Sembako', color: '#16A34A', icon: 'cart' },
  kuliner: { label: 'F&B / Kuliner', color: '#A44326', icon: '/dapur' },
  properti: { label: 'Properti & Kos', color: '#A25D23', icon: '/beranda' },
  jasa: { label: 'Jasa & Servis', color: '#24569C', icon: '/perbaikan' },
  lainnya: { label: 'Lainnya', color: '#635298', icon: '/konfigurasi' },
};

export const BANNER_PAGES = {
  beranda: { label: 'Beranda Bisnis', description: 'Informasi dan kontak bisnis', icon: '/beranda' },
  katalog: { label: 'Katalog', description: 'Lihat pilihan yang tersedia', icon: '/barang' },
  produk: { label: 'Detail Produk', description: 'Lihat detail produk', icon: '/mutasi' },
  booking: { label: 'Booking & Reservasi', description: 'Ajukan booking atau reservasi', icon: '/booking' },
  faktur: { label: 'Faktur Penjualan', description: 'Buka portal untuk melihat faktur Anda', icon: '/tagihan' },
  bayar: { label: 'Pembayaran', description: 'Lihat cara pembayaran yang tersedia', icon: '/pembayaran' },
  lacak: { label: 'Pelacakan Pesanan', description: 'Periksa status pesanan dan pengiriman', icon: '/antar' },
  portal: { label: 'Portal Pelanggan', description: 'Buka portal untuk melihat informasi Anda', icon: '/kontak' },
};

const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const hex = /^#[0-9a-f]{6}$/i;
export const isBannerId = (id) => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export const isBannerContext = (context) => Object.hasOwn(BANNER_PAGES, context);
export const bannerCategory = (data) => {
  if (Object.hasOwn(BANNER_CATEGORIES, data.category)) return data.category;
  if ([data.businessCategory, data.template].includes('kuliner')) return 'kuliner';
  if (['otomotif', 'kesehatan', 'laundry', 'profesional'].includes(data.businessCategory) ||
      ['bengkel', 'salon'].includes(data.template)) return 'jasa';
  return Object.hasOwn(BANNER_CATEGORIES, data.businessType) ? data.businessType : 'lainnya';
};

export function sanitizeBanner(settings) {
  if (!settings || typeof settings.enabled !== 'boolean' || !BANNER_MODES.some(({ id }) => id === settings.mode)) {
    throw new Error('Pengaturan banner tidak valid.');
  }
  return {
    enabled: settings.enabled, mode: settings.mode,
    category: Object.hasOwn(BANNER_CATEGORIES, settings.category) ? settings.category : null,
    color: hex.test(settings.color) ? settings.color.toUpperCase() : null,
    title: clean(settings.title, 80), description: clean(settings.description, 150),
  };
}

export function bannerContent(data, context) {
  const category = bannerCategory(data);
  const page = BANNER_PAGES[context];
  const property = data.businessType === 'properti';
  const label = context === 'katalog' && [data.businessCategory, data.template, category].includes('kuliner') ? 'Menu'
    : context === 'portal' && property ? 'Portal Penghuni'
    : context === 'faktur' && property ? 'Tagihan Penghuni' : page.label;
  const business = clean(data.name, 64);
  const title = clean(data.itemTitle, 80) || clean(data.title, 80) || (context === 'beranda' ? business : label);
  const description = clean(data.itemDescription, 150) || clean(data.description, 150) ||
    (context === 'beranda' ? clean(data.tagline, 150) : '') ||
    (context === 'faktur' && property ? 'Buka portal untuk melihat tagihan Anda' : page.description);
  return {
    business, title, description, label, category,
    color: hex.test(data.color) ? data.color : BANNER_CATEGORIES[category].color,
    shareTitle: title === business ? business : data.itemTitle ? `${title} — ${business}` : `${business} — ${title}`,
  };
}
