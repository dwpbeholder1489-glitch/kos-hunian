import Link from 'next/link';
import { LogoMark } from '@/components/Logo';
import LandingNav from '@/components/LandingNav';
import Icon from '@/components/landing/Icon';
import { KasirMock } from '@/components/landing/HeroMulti';
import DashMock from '@/components/landing/DashMock';
import CapsFilter from '@/components/landing/CapsFilter';
import Showcase from '@/components/landing/Showcase';
import { PLANS, PLAN_ORDER, FEATURES, FEATURE_GROUPS, BUSINESS, featureCell, savePct } from '@/lib/plan';
import { TESTIMONIALS } from '@/lib/testimonials';
import HitungKunjungan from '@/components/HitungKunjungan';

const TITLE = 'PRASARA — Kelola Bisnis Lebih Terarah. Kembangkan dengan Lebih Cerdas.';
const DESC = 'Adaptive Business System: satu platform untuk operasional, pelanggan, transaksi, keuangan, stok, dan layanan — kos & properti, toko retail & grosir, laundry & jasa, kuliner, dan usaha lain. Sistem menyesuaikan jenis bisnis; pemilik yang menyetujui. Coba gratis 30 hari.';
export const metadata = {
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, type: 'website', locale: 'id_ID', siteName: 'PRASARA', url: '/', images: [{ url: '/og.jpg?v=3', width: 1200, height: 630, alt: 'PRASARA — aplikasi pengelolaan bisnis' }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/og.jpg?v=3'] },
};

export const revalidate = 300;

// Paket & harga dari database (diatur di Management Center); cadangan: daftar bawaan
async function getPlans() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const r = await fetch(`${url}/rest/v1/rpc/plans_public`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}', next: { revalidate: 300 } });
    if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d; }
  } catch {}
  return PLAN_ORDER.map((k) => ({ key: k, name: PLANS[k].name, tagline: PLANS[k].tagline, price: PLANS[k].price, list_price: PLANS[k].list_price, terms: PLANS[k].terms || [], is_free: k === 'gratis', active: true, trial: k === 'dasar', trial_days: BUSINESS.trialDays }));
}

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin tanya tentang aplikasi PRASARA.')}`;
const START = '/masuk?daftar=1';

// Masalah umum → apa yang dilakukan PRASARA (tanpa klaim hasil finansial)
const PROBLEMS = [
  ['file', 'Pencatatan masih tersebar'], ['receipt', 'Transaksi sulit dipantau'], ['users', 'Data pelanggan tidak teratur'], ['box', 'Inventaris sulit dikontrol'],
  ['chart', 'Laporan butuh waktu lama'], ['notebook', 'Operasional serba manual'], ['compass', 'Sulit membaca kondisi bisnis'],
];
const SOLVES = [
  ['layers', 'Operasional lebih terstruktur'], ['receipt', 'Transaksi tercatat rapi & tertelusur'], ['users', 'Pelanggan terkelola dengan baik'], ['box', 'Stok lebih terkontrol'],
  ['chart', 'Laporan tersusun otomatis'], ['flow', 'Proses bisnis lebih efisien'], ['trend', 'Perkembangan bisnis lebih jelas'],
];

// Kemampuan inti (status jujur: ready = tersedia, part = sebagian, soon = segera hadir)
const CAPS = [
  ['layers', 'Manajemen bisnis', 'ready', 'Beberapa bisnis dalam satu akun, profil & badan usaha, cabang/gudang, modul yang bisa diaktifkan atau dimatikan.', 'Pemilik kos dan toko memantau keduanya dari satu ringkasan.'],
  ['receipt', 'Transaksi', 'ready', 'Kasir eceran & grosir, pesanan jasa & kuliner, tagihan sewa, pembayaran sebagian, retur, dan pembatalan dengan alasan.', 'Kasir toko menjual per pcs atau per dus dengan harga masing-masing.'],
  ['users', 'Pelanggan', 'ready', 'Kontak pelanggan, penghuni & supplier, prospek dari halaman bisnis, tindak lanjut, kasbon.', 'Calon penghuni mendaftar online; pemilik tinggal mengonfirmasi.'],
  ['box', 'Inventaris', 'ready', 'Stok multi-satuan, barcode, per lokasi, belanja & terima barang, stok opname, bahan operasional.', 'Laundry mencatat pemakaian deterjen agar biaya bahan ikut terhitung.'],
  ['wallet', 'Keuangan', 'ready', 'Kas & bank, biaya, deposit, utang-piutang, jurnal otomatis, laba rugi, dan neraca per badan usaha.', 'Uang jaminan penghuni dicatat terpisah dari pendapatan.'],
  ['calendar', 'Booking & reservasi', 'ready', 'Booking kamar dengan uang tanda jadi, reservasi meja dengan cek bentrok, jadwal jemput-antar.', 'Kamar yang dibooking terkunci sampai penghuni check-in.'],
  ['flow', 'Layanan', 'ready', 'Pesanan per kg/item, tahap proses yang bisa diatur, keluhan & pengerjaan ulang, antar-jemput, layar dapur.', 'Petugas proses melihat tahap cucian tanpa melihat uang.'],
  ['shield', 'Karyawan & operasional', 'part', 'Peran & hak akses per karyawan, persetujuan untuk aksi penting, shift kasir, riwayat perubahan. Absensi & penggajian: dalam rencana.', 'Kasir tidak melihat harga modal dan laba.'],
  ['chart', 'Laporan & analitik', 'ready', 'Laporan per jenis bisnis dengan grafik, tren 6 bulan, barang terlaris, ketepatan waktu, ekspor Excel/PDF.', 'Melihat bulan mana biaya operasional paling besar.'],
];

// Sistem adaptif: alur nyata (/mulai → setup_items → Pusat Konfirmasi → setup_activate)
const FLOW = ['Identifikasi bisnis', 'Analisis kebutuhan', 'Rekomendasi modul', 'Persetujuan pemilik', 'Aktivasi konfigurasi', 'Dashboard bisnis'];
const ADAPT = [
  ['compass', 'Mengenali jenis bisnis', 'Anda memilih kategori & subkategori (15 kategori) dan menjawab beberapa pertanyaan singkat.'],
  ['layers', 'Merekomendasikan modul', 'Dari template per jenis usaha, PRASARA menyusun draf modul, menu, dan informasi yang perlu dilengkapi.'],
  ['check', 'Anda yang memutuskan', 'Setiap rekomendasi bisa disetujui, diubah, atau ditolak di Pusat Konfirmasi. Harga dan kapasitas tidak diisi otomatis.'],
  ['chart', 'Ikut berkembang', 'Modul bisa ditambah atau dimatikan kapan saja di Pusat konfigurasi; saran fitur muncul dari data bisnis Anda sendiri.'],
  ['shield', 'Perubahan penting butuh persetujuan', 'Aktivasi dan perubahan konfigurasi diperiksa di server, bukan hanya di tampilan. Admin platform tidak mengubah konfigurasi bisnis Anda.'],
  ['notebook', 'Tercatat di riwayat', 'Setiap perubahan konfigurasi tersimpan: siapa, kapan, dan alasannya.'],
];

// Cara kerja (4 tahap, sesuai alur pendaftaran yang berjalan)
const HOW4 = [
  ['Daftarkan bisnis Anda', 'Buat akun dengan email, lalu isi nama bisnis, kategori, dan lokasi. Boleh lebih dari satu bisnis sekaligus.'],
  ['Kenali kebutuhan bisnis', 'PRASARA membaca kategori, subkategori, dan jawaban Anda untuk menyiapkan draf konfigurasi.'],
  ['Pilih konfigurasi', 'Tinjau modul yang direkomendasikan di Pusat Konfirmasi — setujui, ubah, atau tolak satu per satu.'],
  ['Mulai kelola bisnis', 'Setelah Anda aktifkan, menu dan dashboard disiapkan sesuai konfigurasi yang disetujui.'],
];


// Solusi per kategori: status jujur
const CATS = [
  ['🏠', 'Properti & Sewa', 'Kos, kontrakan, homestay: kamar, penghuni, tagihan bulanan otomatis, booking, deposit, keluhan & perbaikan, meteran listrik/air, verifikasi pembayaran, laba rugi.', 'ready'],
  ['🛒', 'Retail & Grosir', 'Toko sembako, minimarket, grosir: kasir eceran & grosir, stok multi-satuan, barcode, belanja ke supplier, kasbon, laporan laba.', 'ready'],
  ['🧩', 'Bisnis lain (Business Builder)', 'Bengkel, salon, katering, dan usaha lain: susun sendiri data, formulir, alur status, peran, dan laporan. Uang masuk per status langsung ke kas & pembukuan.', 'ready'],
  ['🧺', 'Jasa & Laundry', 'Laundry kiloan & satuan (dan jasa lain): pesanan, tahap cuci–kering–setrika–QC, nota, DP, antar-jemput, keluhan, bahan, laporan.', 'ready'],
  ['🍳', 'Kuliner', 'Warung, kafe, katering: menu, pesanan makan di tempat/bungkus, layar dapur, QR per meja, reservasi meja, bayar per meja.', 'ready'],
  ['🏭', 'Produksi', 'Modul khusus (BOM, kontrol mutu) dalam rencana. Sementara bisa disusun lewat Business Builder.', 'plan'],
  ['🚚', 'Distribusi', 'Modul khusus (armada, rute) dalam rencana. Sementara bisa disusun lewat Business Builder.', 'plan'],
];


// Fitur utama yang sudah tersedia
const GROUPS = [
  ['home', 'Properti & Sewa', [
    ['Kamar & penghuni', 'Status, harga, dan riwayat sewa setiap kamar terlihat sekilas.'],
    ['Tagihan otomatis', 'Tagihan sewa terbit sendiri tiap bulan; boleh dibayar sebagian.'],
    ['Verifikasi pembayaran', 'Tunai, transfer, atau QRIS diperiksa dulu sebelum dihitung lunas.'],
    ['Pengingat WhatsApp', 'Pesan pengingat berisi rincian tagihan siap kirim dengan satu ketukan.'],
    ['Booking, deposit, keluhan & meteran', 'Booking kamar dengan DP, uang jaminan tercatat terpisah dari pendapatan, keluhan kamar sampai selesai, listrik/air per meteran jadi tagihan otomatis.'],
    ['Portal penghuni', 'Penghuni cek tagihan dan kirim bukti transfer lewat link pribadi.', 'Pro'],
    ['Laba rugi & kwitansi', 'Untung bersih per bulan, kwitansi PDF, ekspor Excel.', 'Dasar'],
  ]],
  ['receipt', 'Retail & Grosir', [
    ['Kasir eceran & grosir', 'Satu barang bisa punya beberapa satuan (pcs, dus, kg) dengan harga masing-masing. Struk cetak atau WhatsApp.'],
    ['Barcode & label', 'Scan dengan kamera HP atau scanner Bluetooth. Barang tanpa barcode: tombol cepat atau cetak label sendiri.'],
    ['Stok & belanja', 'Pesan ke supplier, terima barang sebagian atau penuh; harga modal rata-rata dihitung otomatis.'],
    ['Kas, kasbon & utang', 'Saldo kas dan bank, kasbon pelanggan, utang ke supplier, pengingat jatuh tempo.'],
    ['Retur & shift kasir', 'Barang kembali menambah stok; tutup shift menunjukkan uang laci pas, lebih, atau kurang.'],
    ['Laporan laba', 'Penjualan bersih, laba kotor, barang terlaris dan yang tidak laku.'],
  ]],
  ['layers', 'Jasa & Laundry', [
    ['Pesanan kiloan & satuan', 'Harga per kg/pcs dengan minimal otomatis, diskon, ongkos antar-jemput, DP atau lunas.'],
    ['Tahap proses', 'Cuci, kering, setrika, cek kualitas, kemas — urutan bisa diatur. Petugas proses tidak melihat uang.'],
    ['Nota & WhatsApp', 'Nota cetak atau kirim WA; pesan diterima, sudah siap, dan tagih siap kirim (manual).'],
    ['Keluhan & cuci ulang', 'Catat keluhan, cuci ulang tanpa biaya, ganti rugi; batal pesanan dengan alasan & persetujuan.'],
    ['Bahan & laporan', 'Stok deterjen/pewangi, pendapatan per layanan, ketepatan waktu, laba perkiraan.'],
  ]],
  ['receipt', 'Kuliner', [
    ['Menu & pesanan dapur', 'Pesanan makan di tempat atau bungkus, layar dapur untuk koki, nomor meja.'],
    ['QR per meja', 'Tamu memindai QR di meja dan memesan sendiri; pesanan masuk sebagai permintaan untuk dikonfirmasi.'],
    ['Reservasi & bayar per meja', 'Reservasi meja dengan cek bentrok, tagihan meja bisa dibayar terpisah (split bill).'],
  ]],
  ['users', 'Untuk semua bisnis', [
    ['Karyawan & peran', 'Pengelola, kasir, staf gudang, penjaga, petugas proses — masing-masing hanya melihat menunya.'],
    ['Ringkasan semua bisnis', 'Angka penting setiap bisnis dalam satu layar.'],
    ['Pengingat & email pagi', 'Lonceng pengingat, email ringkasan, dan daftar yang perlu ditindaklanjuti.', 'Dasar'],
    ['Bantuan', 'Panduan bergambar, tombol "? Panduan" di setiap menu, dan tiket bantuan.'],
    ['Halaman bisnis, QR & foto', 'Halaman publik dengan foto, tautan & QR siap bagikan atau cetak; pendaftaran penghuni dan pesanan online.'],
    ['Tampilan terang & gelap', 'Nyaman dipakai siang maupun malam; mengikuti pengaturan HP.'],
  ]],
];

const TRUST = [
  ['database', 'Data tiap bisnis terpisah', 'Pemisahan data dijaga langsung di tingkat database. Pengguna lain tidak dapat melihat data Anda.'],
  ['shield', 'Hak akses diperiksa server', 'Peran karyawan diperiksa di database, bukan hanya disembunyikan dari menu.'],
  ['globe', 'Lewat browser, terenkripsi', 'Tidak perlu memasang aplikasi. Koneksi selalu HTTPS.'],
  ['lock', 'Data tetap milik Anda', 'Berhenti berlangganan tidak menghapus data. Laporan bisa diekspor.'],
  ['eye', 'Akses dukungan dengan izin', 'Tim PRASARA hanya melihat ringkasan diagnostik bila Anda mengizinkan dari Pusat bantuan; setiap akses tercatat.'],
  ['headset', 'Bantuan nyata', 'Panduan bergambar, tombol "? Panduan" di setiap menu, tiket bantuan, dan WhatsApp.'],
];

const FAQ = [
  ['Apa itu PRASARA?', 'PRASARA adalah sistem pengelolaan bisnis yang menyesuaikan diri dengan jenis usaha Anda. Satu akun bisa dipakai untuk beberapa bisnis — misalnya kos dan toko — dengan menu, data, dan laporan masing-masing. Dibuka lewat browser di HP atau laptop.'],
  ['Bisnis apa saja yang dapat menggunakan PRASARA?', 'Saat ini Properti & Sewa (kos, kontrakan, homestay), Retail & Grosir (toko sembako, minimarket, grosir), Jasa & Laundry (laundry kiloan/satuan, juga jasa lain seperti jahit atau servis), Kuliner (warung, kafe, katering: menu, dapur, QR meja, reservasi), dan usaha lain lewat Business Builder (susun sendiri data, alur, dan laporan). Modul khusus produksi dan distribusi masih dalam rencana — kami tidak menjanjikan tanggal sebelum fiturnya siap.'],
  ['Apakah PRASARA hanya untuk bisnis besar?', 'Tidak. PRASARA dirancang untuk usaha kecil dan menengah yang dikelola dari HP — ada paket Gratis untuk mulai. Saat bisnis tumbuh, Anda bisa menambah karyawan, cabang/gudang, modul, atau naik paket tanpa pindah aplikasi.'],
  ['Apakah setiap bisnis menggunakan fitur yang sama?', 'Tidak. Kos melihat kamar, penghuni, dan tagihan; toko melihat kasir, stok, dan belanja; laundry melihat pesanan dan tahap proses; kuliner melihat menu, dapur, dan meja. Menu yang tidak relevan tidak ditampilkan, dan karyawan hanya melihat menu sesuai perannya.'],
  ['Apakah saya dapat memilih modul sendiri?', 'Bisa. Saat mendaftar, setiap modul yang disarankan Anda setujui atau tolak di Pusat Konfirmasi. Setelah aktif, modul bisa dinyalakan atau dimatikan kapan saja di Pusat konfigurasi, dan setiap perubahan tercatat di riwayat.'],
  ['Bagaimana sistem rekomendasi bekerja?', 'Saat ini rekomendasi disusun dari template per jenis usaha (aturan tetap) ditambah jawaban Anda saat mendaftar — misalnya jumlah kamar atau layanan yang ditawarkan. Setelah berjalan, PRASARA juga memberi saran fitur berdasarkan data bisnis Anda sendiri. Semua saran hanya berlaku bila Anda menyetujuinya.'],
  ['Apakah tersedia demo?', `Ya. Contoh tampilan di halaman ini memakai DATA CONTOH dan tidak tersambung ke data siapa pun. Anda juga bisa langsung mencoba dengan data sendiri: setiap bisnis baru mendapat masa coba ${BUSINESS.trialDays} hari Paket Dasar tanpa kartu kredit.`],
  ['Bagaimana proses pendaftaran?', 'Daftar dengan email, pilih satu atau lebih jenis bisnis, lalu isi info singkatnya. PRASARA menyiapkan draf konfigurasi; Anda meninjau dan mengaktifkannya di Pusat Konfirmasi. Sebelum diaktifkan, bisnis masih berstatus draf dan halaman publiknya belum tampil.'],
  ['Apakah data bisnis aman?', 'Data setiap bisnis dipisahkan di tingkat database, hak akses karyawan diperiksa di server, dan koneksi selalu terenkripsi (HTTPS). Tim PRASARA hanya bisa melihat ringkasan diagnostik bila Anda memberi izin dari Pusat bantuan, dan setiap aksesnya tercatat.'],
  ['Bagaimana cara mengubah paket?', 'Buka menu Langganan di aplikasi. Naik paket berlaku sejak pembayaran disetujui, dan sisa hari paket lama dihitung ulang lalu ditambahkan. Turun paket berlaku setelah masa paket sekarang berakhir. Pembayaran lewat QRIS atau transfer bank, diperiksa biasanya dalam 1×24 jam pada hari kerja.'],
  ['Apakah bisnis dapat berkembang tanpa berpindah platform?', 'Bisa. Tambah bisnis baru, cabang atau gudang, karyawan dengan peran berbeda, modul baru, atau naik paket — semua di akun yang sama, dan data lama tetap utuh.'],
  ['Bagaimana jika bisnis saya belum tersedia dalam kategori?', 'Pilih Business Builder: susun sendiri jenis data, formulir, alur status, peran, dan laporan, atau mulai dari template (bengkel, salon, kursus, rental, dan lainnya). Bila masih ragu, ceritakan usaha Anda lewat WhatsApp.'],
  ['Apakah harus memasang aplikasi?', 'Tidak. PRASARA dibuka lewat browser. Agar terasa seperti aplikasi, tambahkan ke layar utama: di Safari ketuk Bagikan › Tambah ke Layar Utama, di Chrome ketuk ⋮ › Tambahkan ke layar utama.'],
  ['Harganya per apa?', 'Per bisnis, per bulan. Jika punya kos dan toko, masing-masing memilih paketnya sendiri.'],
  ['Apa yang terjadi jika berhenti berlangganan?', 'Data tidak dihapus. Bisnis kembali ke paket Gratis dengan batasannya; begitu berlangganan lagi, semuanya terbuka kembali.'],
];

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'PRASARA', applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web', description: DESC, inLanguage: 'id',
  offers: PLAN_ORDER.map((k) => ({ '@type': 'Offer', name: PLANS[k].name, price: PLANS[k].price, priceCurrency: 'IDR' })), // bawaan; harga terkini di halaman
};

function Badge({ t }) {
  if (!t) return null;
  return <span className={'ln-badge ' + (t === 'Segera hadir' ? 'soon' : t === 'Pro' ? 'pro' : 'std')}>{t}</span>;
}
function Cell({ v }) {
  if (v === true) return <Icon name="check" size={18} className="ln-yes" />;
  if (v === false) return <Icon name="minus" size={18} className="ln-no" />;
  return <span className="ln-small">{v}</span>;
}

export default async function Landing() {
  const plans = await getPlans();
  const free = plans.find((x) => x.is_free);
  const best = (plans.find((x) => x.key === 'bisnis') || plans.filter((x) => !x.is_free)[0])?.key;
  const trialDays = plans.find((x) => x.trial_days != null)?.trial_days ?? BUSINESS.trialDays;
  const trialPlan = plans.find((x) => x.trial);
  const cardRows = (pl) => FEATURES.filter((f) => !f.soon).map((f) => [f, featureCell(f, pl)])
    .filter(([f, v]) => v && (pl.is_free || typeof v === 'string' || !(free && featureCell(f, free) === true))).slice(0, 8);
  return (
    <div className="ln">
      <HitungKunjungan path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingNav theme />

      <main>
        {/* 1. HERO */}
        <section className="ln-hero" id="beranda">
          <div className="ln-wrap ln-hero-grid">
            <div className="ln-hero-text ln-rise">
              <span className="ln-eyebrow">Adaptive Business System</span>
              <h1>Kelola bisnis dengan <span>lebih terstruktur.</span></h1>
              <p className="ln-lead">PRASARA membantu Anda mengelola transaksi, inventaris, keuangan, pelanggan, dan operasional bisnis dalam satu sistem yang menyesuaikan kebutuhan usaha Anda.</p>
              <div className="ln-cta-row">
                <Link href={START} className="ln-btn ln-btn-primary ln-btn-lg">Mulai Sekarang <Icon name="arrow" size={18} /></Link>
                <a href="#demo" className="ln-btn ln-btn-outline ln-btn-lg">▶&nbsp; Lihat Demo</a>
              </div>
              <ul className="ln-hero-checks">{['Sistem adaptif', 'Modular & fleksibel', 'Terintegrasi', 'Siap berkembang'].map((t) => <li key={t}><Icon name="check" size={16} />{t}</li>)}</ul>
              <p className="ln-support">Coba gratis {trialDays} hari{trialPlan ? ` Paket ${trialPlan.name}` : ''}, tanpa kartu kredit.</p>
            </div>
            <div className="ln-rise ln-rise-2"><DashMock /></div>
          </div>
        </section>

        {/* 2. MASALAH & SOLUSI */}
        <section className="ln-sec ln-force-light ln-sec-tight" id="masalah" aria-labelledby="h-masalah">
          <div className="ln-wrap ln-strip">
            <h2 id="h-masalah">Sering Mengalami Tantangan Ini dalam Bisnis?</h2>
            <ul className="ln-tiles">{PROBLEMS.map(([ic, t]) => <li key={t}><Icon name={ic} size={26} /><span>{t}</span></li>)}</ul>
          </div>
        </section>
        <section className="ln-sec ln-force-dark ln-sec-tight" aria-labelledby="h-solusi-band">
          <div className="ln-wrap ln-strip">
            <h2 id="h-solusi-band">PRASARA Membantu Anda <span>Mengatasinya</span></h2>
            <ul className="ln-tiles dark">{SOLVES.map(([ic, t]) => <li key={t}><Icon name={ic} size={26} /><span>{t}</span></li>)}</ul>
          </div>
        </section>

        {/* 3. PRODUK — KEMAMPUAN INTI */}
        <section className="ln-sec ln-force-light" id="produk" aria-labelledby="h-produk">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Produk</span><h2 id="h-produk">Fitur Utama PRASARA</h2>
              <p>Modul yang dapat disesuaikan dengan kebutuhan dan karakteristik bisnis Anda. Status ditulis apa adanya: <b>Tersedia</b>, <b>Sebagian tersedia</b>, atau <b>Segera hadir</b>.</p></div>
            <CapsFilter caps={CAPS} />
            <p className="ln-small" style={{ marginTop: 18 }}><a href="#fitur" className="ln-textlink">Lihat rincian fitur per jenis bisnis <Icon name="arrow" size={16} /></a></p>
          </div>
        </section>

        {/* 4. DEMO */}
        <section className="ln-sec" id="demo" aria-labelledby="h-demo">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Demo</span><h2 id="h-demo">Lihat Bagaimana PRASARA Bekerja untuk Bisnis Anda.</h2>
              <p>Semua tampilan di bawah memakai <b>DATA CONTOH</b> — tidak tersambung ke data bisnis siapa pun.</p></div>
            <div className="ln-demo">
              <div><h3 style={{ marginBottom: 14 }}>Properti & Sewa</h3><Showcase /></div>
              <div className="ln-demo-side">
                <h3>Retail & Grosir — Kasir</h3>
                <KasirMock />
                <p className="ln-p" style={{ fontSize: 15 }}>Tombol barang cepat untuk barang tanpa barcode, scan kamera untuk barang berbarcode, lalu bayar tunai, transfer, atau kasbon.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. SISTEM ADAPTIF */}
        <section className="ln-sec ln-sec-alt" id="adaptif" aria-labelledby="h-adaptif">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Adaptive Business System</span><h2 id="h-adaptif">Bisnis Berbeda, Kebutuhan Berbeda. Sistem yang Sama-sama Bisa Menyesuaikan.</h2>
              <p>PRASARA tidak memaksa semua bisnis memakai fitur dan pengaturan yang sama. Sistem menyiapkan rekomendasi — keputusan tetap di tangan pemilik.</p></div>
            <ol className="ln-flow" aria-label="Alur penyesuaian sistem">
              {FLOW.map((t, i) => <li key={t}><span className="ln-flow-n">{String(i + 1).padStart(2, '0')}</span><span>{t}</span></li>)}
            </ol>
            <div className="ln-vals" style={{ marginTop: 36 }}>
              {ADAPT.map(([ic, t, d]) => <div key={t} className="ln-val"><span className="ln-ico-wrap"><Icon name={ic} size={22} /></span><h3>{t}</h3><p>{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* 7. CARA KERJA */}
        <section className="ln-sec ln-sec-alt" id="cara" aria-labelledby="h-cara">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Cara kerja</span><h2 id="h-cara">Empat tahap dari daftar sampai dipakai.</h2></div>
            <ol className="ln-steps ln-steps4">
              {HOW4.map(([t, d], i) => (
                <li key={t}><span className="ln-step-n">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ol>
            <div className="ln-cta-row" style={{ marginTop: 28 }}><Link href={START} className="ln-btn ln-btn-primary">Daftarkan bisnis <Icon name="arrow" size={18} /></Link></div>
          </div>
        </section>

        {/* 8. SOLUSI PER INDUSTRI */}
        <section className="ln-sec" id="solusi" aria-labelledby="h-solusi">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Solusi bisnis</span><h2 id="h-solusi">Kos, toko, laundry, kuliner — dan usaha lain.</h2>
              <p>Empat jenis bisnis sudah bisa dipakai penuh, ditambah Business Builder untuk usaha lain. Modul khusus jenis lain baru dibuka setelah siap.</p></div>
            <div className="ln-cats">
              {CATS.map(([ic, t, d, st]) => (
                <div key={t} className={'ln-cat ' + st}>
                  <span className="ic" aria-hidden="true">{ic}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                  <span className="st">{st === 'ready' ? 'Tersedia' : 'Dalam rencana'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9. RINCIAN FITUR */}
        <section className="ln-sec ln-sec-alt" id="fitur" aria-labelledby="h-fitur">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Fitur utama</span><h2 id="h-fitur">Rincian fitur yang sudah bisa dipakai hari ini.</h2><p>Ketuk jenis bisnis untuk melihat fiturnya.</p></div>
            <div className="ln-groups">
              {GROUPS.map(([ic, g, items]) => (
                <details key={g} className="ln-group">
                  <summary className="ln-group-h"><span className="ln-ico-wrap"><Icon name={ic} size={22} /></span><h3>{g}</h3><span className="ln-small">{items.length} fitur</span><Icon name="plus" size={18} className="ln-group-tg" /></summary>
                  <ul>{items.map(([t, d, b]) => (
                    <li key={t}><div className="ln-feat-t">{t} <Badge t={b} /></div><p>{d}</p></li>
                  ))}</ul>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 10. BUSINESS BUILDER */}
        <section className="ln-sec" id="builder" aria-labelledby="h-builder">
          <div className="ln-wrap">
            <div className="ln-builder">
              <div>
                <span className="ln-kicker">Business Builder</span>
                <h2 id="h-builder" style={{ marginTop: 8 }}>Usaha Anda tidak ada di daftar?</h2>
                <p className="ln-p" style={{ marginTop: 12 }}>Bangun sendiri dari aplikasi: jenis data (mis. Pelanggan, Kendaraan, Servis), formulir dengan field pilihan Anda, status & alur kerja dengan aturan per peran dan persetujuan, serta laporan. Mulai dari template <b>Bengkel motor</b> atau <b>Salon</b>, atau dari nol.</p>
              </div>
              <div>
                <h3>Alurnya</h3>
                <ol style={{ marginTop: 10 }}>
                  <li>Tambah bisnis › Bisnis lain › pilih template atau bangun sendiri.</li>
                  <li>Atur jenis data & field (teks, angka, uang, tanggal, pilihan, ya/tidak, rujukan).</li>
                  <li>Atur status, langkah yang boleh per peran, catatan wajib, persetujuan, batas waktu.</li>
                  <li>Buat laporan (jumlah, total, rata-rata per status/bulan/field).</li>
                  <li>Validasi otomatis, lalu aktifkan.</li>
                </ol>
                <a href={WA} target="_blank" rel="noreferrer" className="ln-btn ln-btn-outline" style={{ marginTop: 16 }}><Icon name="message" size={18} />Ceritakan usaha Anda</a>
              </div>
            </div>
          </div>
        </section>

        {/* 11. KEAMANAN */}
        <section className="ln-sec ln-sec-dark" aria-labelledby="h-trust">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Keamanan & privasi</span><h2 id="h-trust">Data bisnis Anda, tetap milik Anda.</h2></div>
            <div className="ln-trust">
              {TRUST.map(([ic, t, d]) => <div key={t}><Icon name={ic} size={22} /><h3>{t}</h3><p>{d}</p></div>)}
            </div>
            <p style={{ marginTop: 28 }}><Link href="/privasi" className="ln-textlink" style={{ color: '#E6CB8F' }}>Baca Kebijakan Privasi <Icon name="arrow" size={16} /></Link></p>
          </div>
        </section>

        {/* 12. HARGA */}
        <section className="ln-sec" id="harga" aria-labelledby="h-harga">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Harga</span><h2 id="h-harga">Harga sederhana, per bisnis.</h2>
              <p>Setiap bisnis baru mendapat <b>masa coba {trialDays} hari{trialPlan ? ` Paket ${trialPlan.name}` : ''}</b>. Setelah itu otomatis menjadi paket Gratis kecuali Anda memilih berlangganan — tanpa tagihan kejutan, dan data tidak pernah dihapus.</p></div>
            <div className="ln-prices">
              {plans.map((pl) => (
                <div key={pl.key} className={'ln-price' + (pl.key === best ? ' best' : '')}>
                  {pl.key === best && <span className="ln-best">Paling sesuai untuk bisnis aktif</span>}
                  <h3>{pl.name}</h3>
                  <p className="ln-tag">{pl.tagline}</p>
                  {Number(pl.list_price) > Number(pl.price) && <p className="ln-was"><s>{rp(Number(pl.list_price))}</s><b>Hemat {savePct(pl.price, pl.list_price)}%</b></p>}
                  <div className="ln-amount">{rp(Number(pl.price))}<span>{Number(pl.price) ? ' /bulan' : ' selamanya'}</span><span className="per">{Number(pl.price) ? (Number(pl.list_price) > Number(pl.price) ? 'per bisnis · harga peluncuran' : 'per bisnis') : 'tanpa batas waktu'}</span></div>
                  {(pl.terms || []).map((t) => (
                    <p key={t.months} className="ln-term"><b>{pl.name} {Number(t.months) === 12 ? 'Tahunan' : `${t.months} bulan`}: {rp(Number(t.price))}</b>{Number(t.list_price) > Number(t.price) && <> <s>{rp(Number(t.list_price))}</s> · hemat {savePct(t.price, t.list_price)}%</>}<br />Dibayar sekali untuk {t.months} bulan.</p>
                  ))}
                  {!pl.is_free && free && <p className="ln-small" style={{ margin: '-4px 0 6px' }}>Semua fitur {free.name}, ditambah:</p>}
                  <ul>{cardRows(pl).map(([f, v]) => (
                    <li key={f.label}><Icon name="check" size={17} /><span>{f.label}{typeof v === 'string' ? ` — ${v}` : ''}</span></li>
                  ))}</ul>
                  <Link href={START} className={'ln-btn ' + (pl.key === best ? 'ln-btn-primary' : 'ln-btn-outline')}>{pl.is_free ? 'Mulai gratis' : pl.trial ? `Coba ${pl.name} ${trialDays} hari` : `Mulai dengan ${pl.name}`}</Link>
                </div>
              ))}
            </div>
            <details className="ln-compare">
              <summary>Bandingkan semua fitur</summary>
              <div className="ln-table-wrap"><table>
                <thead><tr><th>Fitur</th>{plans.map((pl) => <th key={pl.key}>{pl.name}</th>)}</tr></thead>
                <tbody>{FEATURE_GROUPS.map(([g, name]) => [
                  <tr key={g} className="ln-groupsep"><td colSpan={plans.length + 1}>{name}</td></tr>,
                  ...FEATURES.filter((f) => f.group === g).map((f) => (
                    <tr key={f.label}><td>{f.label}{f.soon && <> <Badge t="Segera hadir" /></>}</td>{plans.map((pl) => <td key={pl.key}><Cell v={f.soon ? (f[pl.key] ? 'Segera' : false) : featureCell(f, pl)} /></td>)}</tr>
                  )),
                ])}</tbody>
              </table></div>
            </details>
            <ul className="ln-plan-notes">
              <li>Harga per bisnis per bulan, diambil langsung dari sistem langganan PRASARA. Harga masih dapat berubah selama tahap pengembangan; pelanggan aktif diberi tahu lebih dulu.</li>
              <li>Batas paket (kamar terisi, akun karyawan, ruang foto & lampiran) tertulis di tabel perbandingan. Modul bisa diaktifkan atau dimatikan sesuai kebutuhan di setiap paket.</li>
              <li>Naik paket berlaku sejak pembayaran disetujui (sisa hari paket lama dihitung ulang). Turun paket berlaku setelah masa paket sekarang berakhir.</li>
              <li>Langganan PRASARA terpisah dari biaya pihak ketiga yang Anda pakai sendiri (internet, pulsa/WhatsApp, printer, biaya transfer).</li>
              <li>Fitur bertanda "Segera hadir" belum tersedia dan tidak ditagihkan.</li>
            </ul>
          </div>
        </section>

        {/* TESTIMONI — tampil otomatis bila lib/testimonials.js sudah berisi testimoni asli */}
        {TESTIMONIALS.length > 0 && (
          <section className="ln-sec ln-sec-alt" aria-labelledby="h-testi">
            <div className="ln-wrap">
              <div className="ln-head"><span className="ln-kicker">Kata pengguna</span><h2 id="h-testi">Dipakai pemilik usaha sungguhan.</h2></div>
              <div className="ln-testi">{TESTIMONIALS.map((t) => (
                <figure key={t.name}><blockquote>“{t.quote}”</blockquote><figcaption><b>{t.name}</b><span>{t.role}</span></figcaption></figure>
              ))}</div>
            </div>
          </section>
        )}

        {/* 13. FAQ */}
        <section className="ln-sec ln-sec-alt" id="faq" aria-labelledby="h-faq">
          <div className="ln-wrap ln-faq-wrap">
            <div className="ln-head"><span className="ln-kicker">FAQ</span><h2 id="h-faq">Pertanyaan yang sering diajukan</h2></div>
            <div className="ln-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" size={18} /></summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        {/* 14. CTA */}
        <section className="ln-sec">
          <div className="ln-wrap">
            <div className="ln-final">
              <h2>Kelola bisnis lebih terarah, mulai hari ini.</h2>
              <p>Daftar dalam beberapa menit, tinjau konfigurasi yang disarankan, lalu mulai dari HP.</p>
              <div className="ln-cta-row center">
                <Link href={START} className="ln-btn ln-btn-accent ln-btn-lg">Mulai Sekarang <Icon name="arrow" size={18} /></Link>
                <a href={WA} target="_blank" rel="noreferrer" className="ln-btn ln-btn-onDark ln-btn-lg"><Icon name="message" size={18} />Hubungi Kami</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="ln-foot">
        <div className="ln-wrap ln-foot-grid">
          <div className="ln-foot-brand">
            <div className="ln-logo"><LogoMark size={34} /><span className="ln-logo-t"><b>PRASARA</b><small>Adaptive Business System</small></span></div>
            <p>Adaptive Business System untuk mengelola operasional, pelanggan, transaksi, keuangan, dan layanan dalam satu tempat.</p>
            <p className="ln-small" style={{ marginTop: 8 }}>One Intelligence. Every Business.</p>
          </div>
          <nav aria-label="Produk"><b>Produk</b><a href="#produk">Kemampuan inti</a><a href="#demo">Demo</a><a href="#adaptif">Sistem adaptif</a><a href="#harga">Harga</a></nav>
          <nav aria-label="Solusi bisnis"><b>Solusi bisnis</b><a href="#solusi">Kos & properti</a><a href="#solusi">Toko retail & grosir</a><a href="#solusi">Laundry & jasa</a><a href="#solusi">Kuliner</a><a href="#builder">Business Builder</a></nav>
          <nav aria-label="Bantuan"><b>Bantuan</b><Link href="/panduan">Pusat bantuan & panduan</Link><Link href="/p/contoh">Contoh portal penghuni</Link><a href={WA} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a><Link href="/masuk">Masuk</Link></nav>
          <nav aria-label="Perusahaan"><b>Perusahaan</b><Link href="/tentang">Tentang Kami</Link><Link href="/privasi">Kebijakan Privasi</Link><Link href="/syarat">Syarat & Ketentuan</Link></nav>
        </div>
        <div className="ln-wrap ln-copy">© {new Date().getFullYear()} PRASARA. Hak cipta dilindungi.</div>
      </footer>
    </div>
  );
}
