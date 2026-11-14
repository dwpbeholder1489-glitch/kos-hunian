import Link from 'next/link';
import './landing.css';
import { LogoMark } from '@/components/Logo';
import Icon from '@/components/landing/Icon';
import HitungKunjungan from '@/components/HitungKunjungan';
import Engine from '@/components/cine/Engine';
import Nav from '@/components/cine/Nav';
import Dash from '@/components/cine/Dash';
import Problems from '@/components/cine/Problems';
import Calc from '@/components/cine/Calc';
import Explorer from '@/components/cine/Explorer';
import Demo from '@/components/cine/Demo';
import Eco from '@/components/cine/Eco';
import Insight from '@/components/cine/Insight';
import Pricing from '@/components/cine/Pricing';
import Acc from '@/components/cine/Acc';
import { PLANS, PLAN_ORDER, FEATURES, FEATURE_GROUPS, BUSINESS, featureCell } from '@/lib/plan';
import { TESTIMONIALS } from '@/lib/testimonials';

// Landing publik: Cinematic Scroll Experience. Gaya di app/landing.css (kelas cx-), gerak di components/cine/Engine.jsx.
// Semua dashboard di halaman ini ILUSTRASI dengan DATA CONTOH. Harga & isi paket dari database (plans_public).
const TITLE = 'PRASARA — Bisnis Lebih Teratur. Keputusan Lebih Terarah.';
const DESC = 'Kelola transaksi, operasional, keuangan, pelanggan, dan perkembangan bisnis dalam satu sistem yang menyesuaikan kebutuhan usaha Anda — toko, grosir, laundry, kos, kuliner, dan usaha lain. Coba gratis 14 hari, tanpa kartu kredit.';
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

const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin tanya tentang aplikasi PRASARA.')}`;
const START = '/masuk?daftar=1';

const DOTS = [['beranda', 'Beranda'], ['masalah', 'Masalah'], ['biaya', 'Biaya tersembunyi'], ['bisnis', 'Jenis bisnis'], ['ubah', 'Sebelum & sesudah'], ['demo', 'Demonstrasi'], ['modul', 'Modul'], ['analisis', 'Analisis'], ['alur', 'Alur kerja'], ['aman', 'Keamanan'], ['harga', 'Harga'], ['langganan', 'Langganan'], ['faq', 'FAQ'], ['mulai', 'Mulai']];

const HERO_DASH = { title: 'Command Center', sub: 'Ringkasan hari ini', on: 0, kpis: [['Pendapatan', 'Rp24,8 jt', '+12%'], ['Transaksi', '318', '+8%'], ['Laba', 'Rp7,4 jt', '+5%']], chartTitle: 'Pendapatan 8 bulan', line: [9, 11, 10, 13, 12, 15, 17, 20], listTitle: 'Perlu perhatian', list: ['3 tagihan jatuh tempo', '2 barang hampir habis', '1 pesanan terlambat'] };
const PANELS = [['flow', 'Operasional'], ['wallet', 'Keuangan'], ['users', 'Pelanggan'], ['chart', 'Analisis Bisnis']];

// Sebelum → sesudah: posisi awal tiap benda (px dari tengah) sebelum bergerak ke pusat
const BEFORE = [['eye', 'Pengecekan manual', 0, -185, 3], ['notebook', 'Buku catatan', -190, -95, -9], ['sheet', 'Spreadsheet', 190, -60, 7], ['message', 'WhatsApp', -180, 70, 6], ['file', 'File terpisah', 170, 150, -8]];
const AFTER = ['Dashboard terpusat', 'Data transaksi terstruktur', 'Laporan keuangan', 'Pemantauan operasional', 'Informasi mudah diakses'];
const AFTER_DASH = { title: 'Semua dalam satu sistem', sub: 'PRASARA', on: 0, kpis: [['Transaksi', 'Tercatat'], ['Stok', 'Terpantau'], ['Laporan', 'Otomatis']], chartTitle: 'Perkembangan bisnis', line: [5, 6, 6, 8, 9, 11, 12, 14], listTitle: 'Tersambung', list: ['Kasir → stok', 'Stok → pembukuan', 'Pembukuan → laporan'] };

const FLOW = [['receipt', 'Transaksi masuk', 'Penjualan, pesanan, atau pembayaran dicatat sekali.'], ['database', 'Data tercatat', 'Stok, kas, dan piutang ikut berubah saat itu juga.'], ['file', 'Tagihan terbentuk', 'Tagihan berkala terbit sendiri sesuai jadwalnya.'], ['clock', 'Aktivitas diperbarui', 'Riwayat mencatat siapa melakukan apa dan kapan.'], ['chart', 'Laporan diperbarui', 'Laba rugi dan ringkasan memakai angka terbaru.']];

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
// Kelas cx-js dipasang sebelum halaman tergambar (agar tidak berkedip); dicabut lagi bila mesin gerak tidak pernah hidup.
const BOOT = "document.documentElement.classList.add('cx-js');setTimeout(function(){if(!window.__cx)document.documentElement.classList.remove('cx-js')},4000)";

function Cell({ v }) {
  if (v === true) return <Icon name="check" size={18} className="y" />;
  if (v === false) return <Icon name="minus" size={18} className="n" />;
  return <span>{v}</span>;
}

export default async function Landing() {
  const plans = await getPlans();
  const free = plans.find((x) => x.is_free);
  const best = (plans.find((x) => x.key === 'bisnis') || plans.filter((x) => !x.is_free)[0])?.key;
  const trialDays = plans.find((x) => x.trial_days != null)?.trial_days ?? BUSINESS.trialDays;
  const trialPlan = plans.find((x) => x.trial);
  const cardRows = (pl) => FEATURES.filter((f) => !f.soon).map((f) => [f, featureCell(f, pl)])
    .filter(([f, v]) => v && (pl.is_free || typeof v === 'string' || !(free && featureCell(f, free) === true))).slice(0, 8)
    .map(([f, v]) => f.label + (typeof v === 'string' ? ` — ${v}` : ''));
  const cards = plans.map((pl) => ({ key: pl.key, name: pl.name, tagline: pl.tagline, price: pl.price, list_price: pl.list_price, terms: pl.terms || [], is_free: !!pl.is_free, trial: !!pl.trial, rows: cardRows(pl) }));
  const CTA = `Mulai Gratis ${trialDays} Hari`;
  const SUBS = [
    ['Pendaftaran', `Daftar dengan email, lalu isi data singkat bisnis Anda. Setiap bisnis baru mendapat masa coba ${trialDays} hari${trialPlan ? ` Paket ${trialPlan.name}` : ''} tanpa kartu kredit. Bisnis berstatus draf sampai Anda meninjau dan mengaktifkannya di Pusat Konfirmasi.`],
    ['Pembayaran', 'Pilih paket di menu Langganan, lalu bayar lewat halaman pembayaran yang disediakan atau lewat QRIS/transfer bank. Paket baru aktif setelah pembayaran terverifikasi; pembayaran manual biasanya diperiksa dalam 1×24 jam pada hari kerja. Tagihan menampilkan batas waktu bayarnya.'],
    ['Masa berlaku', 'Paket bulanan berlaku per bulan sejak aktif; Pro Tahunan dibayar sekali untuk 12 bulan. Tanggal berakhir selalu terlihat di menu Langganan.'],
    ['Perpanjangan', 'Tidak ada pendebetan otomatis dari rekening atau kartu Anda. Perpanjang dari menu Langganan; masa baru ditambahkan setelah masa aktif sekarang berakhir, jadi tidak ada hari yang hangus.'],
    ['Perubahan paket', 'Naik paket berlaku sejak pembayaran disetujui, dan sisa hari paket lama dihitung ulang. Turun paket berlaku setelah masa paket sekarang berakhir.'],
    ['Pembatalan', 'Ketuk "Berhenti memperpanjang" di menu Langganan kapan saja, tanpa perlu menghubungi kami. Paket tetap aktif sampai tanggal berakhirnya, lalu bisnis kembali ke paket Gratis. Data tidak dihapus.'],
    ['Riwayat pembayaran', 'Setiap tagihan dan statusnya (menunggu, lunas, dibatalkan) tersimpan di Riwayat tagihan pada menu Langganan.'],
  ];
  return (
    <div className="cx">
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      <HitungKunjungan path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Engine dots={DOTS} />
      <Nav cta="Mulai Gratis" />

      <main>
        {/* 01 HERO */}
        <section className="cx-hero" id="beranda" data-sp="exit">
          <div className="cx-wrap cx-hero-grid">
            <div className="cx-hero-text">
              <span className="cx-kick cx-enter" style={{ '--i': 1 }}>Adaptive Business System</span>
              <h1><span className="cx-enter" style={{ '--i': 2, display: 'block' }}>Bisnis Anda Bisa Lebih Teratur.</span><em className="cx-enter" style={{ '--i': 3 }}>Keputusan Anda Bisa Lebih Terarah.</em></h1>
              <p className="cx-lead cx-enter" style={{ '--i': 4 }}>Kelola transaksi, operasional, keuangan, pelanggan, dan perkembangan bisnis dalam satu sistem yang menyesuaikan kebutuhan usaha Anda.</p>
              <div className="cx-cta cx-enter" style={{ '--i': 5 }}>
                <Link href={START} className="cx-btn pri">{CTA} <Icon name="arrow" size={18} /></Link>
                <a href="#demo" className="cx-btn dark">Lihat Demonstrasi</a>
              </div>
              <ul className="cx-facts cx-enter" style={{ '--i': 6 }}>
                <li><Icon name="shield" size={17} />Data tiap bisnis terpisah</li>
                <li><Icon name="phone" size={17} />Dipakai dari HP, tanpa pasang aplikasi</li>
                <li><Icon name="check" size={17} />Tanpa kartu kredit</li>
              </ul>
            </div>
            <div className="cx-stage">
              <div className="cx-ring" aria-hidden="true" />
              <div className="cx-dash-in"><div className="cx-dash-3d"><Dash d={HERO_DASH} /></div></div>
              <ul className="cx-panels" aria-label="Bagian sistem">
                {PANELS.map(([ic, t], i) => <li key={t} className="cx-panel" style={{ '--i': i }}><Icon name={ic} size={18} />{t}</li>)}
              </ul>
            </div>
          </div>
          <div className="cx-hint" aria-hidden="true"><i /><span>Gulir untuk menjelajah</span></div>
        </section>

        {/* 02 MASALAH */}
        <section className="cx-sec" id="masalah" aria-labelledby="h-masalah">
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Kenali masalahnya</span><h2 id="h-masalah" data-rv="" style={{ '--i': 1 }}>Bisnis Bertumbuh, Tetapi Cara Mengelolanya Masih Sama?</h2></div>
            <Problems />
          </div>
        </section>

        {/* 03 BIAYA TERSEMBUNYI */}
        <section className="cx-sec" id="biaya" aria-labelledby="h-biaya" style={{ paddingTop: 0 }}>
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Biaya yang tidak terlihat</span><h2 id="h-biaya" data-rv="" style={{ '--i': 1 }}>Masalah Kecil yang Dibiarkan Bisa Menjadi Beban Besar.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Geser angkanya sesuai keadaan Anda. Hasilnya perkiraan waktu yang terpakai untuk pekerjaan manual — bukan janji penghematan.</p></div>
            <Calc />
          </div>
        </section>

        {/* 04 JELAJAH BISNIS */}
        <section className="cx-sec" id="bisnis" aria-labelledby="h-bisnis" style={{ background: '#fff' }}>
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Jenis bisnis</span><h2 id="h-bisnis" data-rv="" style={{ '--i': 1 }}>Satu Platform. Berbagai Jenis Bisnis.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Pilih jenis usaha untuk melihat kebutuhan, modul, dan alur kerjanya. Ketersediaan ditulis apa adanya.</p></div>
            <Explorer />
          </div>
        </section>

        {/* 05 SEBELUM → SESUDAH */}
        <section className="cx-ba" id="ubah" data-sp="pin" aria-labelledby="h-ubah">
          <div className="cx-ba-pin">
            <div className="cx-wrap cx-ba-head">
              <h2 id="h-ubah">Berubah dari Pengelolaan Terpisah Menjadi Sistem yang Terintegrasi.</h2>
              <div className="cx-ba-state" aria-hidden="true"><span className="s1">Sebelum</span><span className="s2">Sesudah</span></div>
            </div>
            <div className="cx-ba-field">
              <svg className="cx-ba-lines" viewBox="-300 -220 600 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                {BEFORE.map(([, t, x, y]) => <path key={t} pathLength="1" d={`M${x} ${y} Q ${x * 0.3} ${y * 0.9} 0 0`} />)}
              </svg>
              <ul aria-label="Sebelum: pengelolaan terpisah">
                {BEFORE.map(([ic, t, x, y, r]) => <li key={t} className="cx-ba-item" style={{ '--x': x + 'px', '--y': y + 'px', '--r': r + 'deg' }}><Icon name={ic} size={18} />{t}</li>)}
              </ul>
              <div className="cx-ba-core"><Dash d={AFTER_DASH} /></div>
            </div>
            <ul className="cx-ba-after" aria-label="Sesudah: sistem terintegrasi">
              {AFTER.map((t) => <li key={t}><Icon name="check" size={15} />{t}</li>)}
            </ul>
          </div>
        </section>

        {/* 06 DEMONSTRASI */}
        <section className="cx-sec" id="demo" aria-labelledby="h-demo">
          <div className="cx-wrap" style={{ paddingInline: 12 }}>
            <div className="cx-demo">
              <div className="cx-wrap">
                <span className="cx-kick" data-rv="">Demonstrasi</span><h2 id="h-demo" data-rv="" style={{ '--i': 1 }}>Lihat Bagaimana PRASARA Bekerja.</h2>
                <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Ketuk tiap bagian. Tidak perlu masuk; semua layar di bawah adalah ilustrasi dengan data contoh.</p>
                <Demo />
              </div>
            </div>
          </div>
        </section>

        {/* 07 MODUL */}
        <section className="cx-sec" id="modul" aria-labelledby="h-modul" style={{ paddingTop: 0 }}>
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Modular</span><h2 id="h-modul" data-rv="" style={{ '--i': 1 }}>Gunakan yang Dibutuhkan. Kembangkan Saat Bisnis Bertumbuh.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Tujuh bagian yang saling terhubung. Ketuk salah satu untuk melihat hubungannya.</p></div>
            <Eco />
          </div>
        </section>

        {/* 08 ANALISIS */}
        <section className="cx-sec" id="analisis" aria-labelledby="h-analisis" style={{ background: 'var(--mint)' }}>
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Analisis bisnis</span><h2 id="h-analisis" data-rv="" style={{ '--i': 1 }}>Jangan Hanya Mencatat Bisnis. Pahami Kondisinya.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Pendapatan, pengeluaran, laba, produk terlaris, dan ketepatan waktu — dari transaksi yang sama, tanpa rekap ulang.</p></div>
            <Insight />
          </div>
        </section>

        {/* 09 ALUR OTOMATIS */}
        <section className="cx-sec" id="alur" aria-labelledby="h-alur">
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Alur kerja</span><h2 id="h-alur" data-rv="" style={{ '--i': 1 }}>Kurangi Pekerjaan Berulang. Beri Ruang untuk Mengembangkan Bisnis.</h2></div>
            <ol className="cx-flow" data-sp="view">
              {FLOW.map(([ic, t, d], i) => <li key={t} className="cx-flow-step" style={{ '--i': i }}><span className="cx-flow-dot"><Icon name={ic} size={20} /></span><div><h3>{t}</h3><p>{d}</p></div></li>)}
            </ol>
            <p className="cx-note" style={{ marginTop: 22 }}>Yang sudah berjalan: jurnal otomatis dari transaksi, tagihan sewa berkala, pengingat, dan resep otomatisasi (Paket Bisnis/Pro). Pesan WhatsApp otomatis: segera hadir — saat ini pesan disiapkan dan Anda yang mengirim.</p>
          </div>
        </section>

        {/* 11 KEAMANAN */}
        <section className="cx-sec" id="aman" aria-labelledby="h-aman" style={{ background: '#fff' }}>
          <div className="cx-wrap cx-two">
            <div className="cx-head"><span className="cx-kick" data-rv="">Keamanan & kepercayaan</span><h2 id="h-aman" data-rv="" style={{ '--i': 1 }}>Bisnis Anda Membutuhkan Sistem yang Dapat Dipercaya.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Hanya yang benar-benar diterapkan. <Link href="/privasi" style={{ color: 'var(--green)', fontWeight: 700 }}>Baca Kebijakan Privasi</Link></p></div>
            <ul className="cx-trust" style={{ gridTemplateColumns: '1fr' }}>
              {TRUST.map(([ic, t, d], i) => <li key={t} data-rv="" style={{ '--i': Math.min(i, 3) }}><Icon name={ic} size={24} /><div><h3>{t}</h3><p>{d}</p></div></li>)}
            </ul>
          </div>
        </section>

        {/* 12 HARGA */}
        <section className="cx-sec" id="harga" aria-labelledby="h-harga">
          <div className="cx-wrap">
            <div className="cx-head"><span className="cx-kick" data-rv="">Harga</span><h2 id="h-harga" data-rv="" style={{ '--i': 1 }}>Harga Sederhana, per Bisnis.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Setiap bisnis baru mendapat <b>masa coba {trialDays} hari{trialPlan ? ` Paket ${trialPlan.name}` : ''}</b>. Setelah itu otomatis menjadi paket Gratis kecuali Anda memilih berlangganan — tanpa tagihan kejutan, dan data tidak dihapus.</p></div>
            <Pricing plans={cards} best={best} trialDays={trialDays} freeName={free?.name || ''} start={START} />
            <details className="cx-compare">
              <summary>Bandingkan semua fitur</summary>
              <div className="cx-table"><table>
                <thead><tr><th>Fitur</th>{plans.map((pl) => <th key={pl.key}>{pl.name}</th>)}</tr></thead>
                <tbody>{FEATURE_GROUPS.map(([g, name]) => [
                  <tr key={g} className="g"><td colSpan={plans.length + 1}>{name}</td></tr>,
                  ...FEATURES.filter((f) => f.group === g).map((f) => (
                    <tr key={f.label}><td>{f.label}{f.soon && <> <span className="cx-soon">Segera hadir</span></>}</td>{plans.map((pl) => <td key={pl.key}><Cell v={f.soon ? (f[pl.key] ? 'Segera' : false) : featureCell(f, pl)} /></td>)}</tr>
                  )),
                ])}</tbody>
              </table></div>
            </details>
            <ul className="cx-notes">
              <li>Harga per bisnis, diambil langsung dari sistem langganan PRASARA. Harga masih dapat berubah selama tahap pengembangan; pelanggan aktif diberi tahu lebih dulu.</li>
              <li>Batas paket (kamar terisi, akun karyawan, ruang foto & lampiran, dan lainnya) tertulis di tabel perbandingan.</li>
              <li>Langganan PRASARA terpisah dari biaya pihak ketiga yang Anda pakai sendiri (internet, pulsa/WhatsApp, printer, biaya transfer atau biaya layanan pembayaran).</li>
              <li>Fitur bertanda "Segera hadir" belum tersedia dan tidak ditagihkan.</li>
            </ul>
          </div>
        </section>

        {/* TESTIMONI — tampil otomatis bila lib/testimonials.js sudah berisi testimoni asli */}
        {TESTIMONIALS.length > 0 && (
          <section className="cx-sec" aria-labelledby="h-testi" style={{ background: '#fff' }}>
            <div className="cx-wrap">
              <div className="cx-head"><span className="cx-kick">Kata pengguna</span><h2 id="h-testi">Dipakai pemilik usaha sungguhan.</h2></div>
              <ul className="cx-trust">{TESTIMONIALS.map((t) => <li key={t.name} style={{ gridTemplateColumns: '1fr' }}><figure><blockquote style={{ margin: 0, fontSize: 18 }}>“{t.quote}”</blockquote><figcaption className="cx-note" style={{ marginTop: 8 }}><b>{t.name}</b> · {t.role}</figcaption></figure></li>)}</ul>
            </div>
          </section>
        )}

        {/* 13 TRANSPARANSI LANGGANAN */}
        <section className="cx-sec" id="langganan" aria-labelledby="h-langganan" style={{ background: '#fff' }}>
          <div className="cx-wrap cx-two">
            <div className="cx-head"><span className="cx-kick" data-rv="">Transparansi langganan</span><h2 id="h-langganan" data-rv="" style={{ '--i': 1 }}>Tahu Persis Apa yang Terjadi dengan Langganan Anda.</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Dari daftar sampai berhenti — tanpa syarat tersembunyi.</p></div>
            <Acc items={SUBS} id="sub" first={0} />
          </div>
        </section>

        {/* 14 FAQ */}
        <section className="cx-sec" id="faq" aria-labelledby="h-faq">
          <div className="cx-wrap cx-two">
            <div className="cx-head"><span className="cx-kick" data-rv="">FAQ</span><h2 id="h-faq" data-rv="" style={{ '--i': 1 }}>Pertanyaan yang Sering Diajukan</h2>
              <p className="cx-lead" data-rv="" style={{ '--i': 2 }}>Belum terjawab? <a href={WA} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', fontWeight: 700 }}>Tanya lewat WhatsApp</a></p></div>
            <Acc items={FAQ} id="faq" />
          </div>
        </section>

        {/* 15 PENUTUP */}
        <section className="cx-close" id="mulai" data-sp="view" aria-labelledby="h-mulai">
          <div className="cx-wrap">
            <div className="cx-close-logo"><LogoMark size={52} /></div>
            <h2 id="h-mulai" data-rv="">Bisnis yang Lebih Teratur Dimulai dari Sistem yang Tepat.</h2>
            <p data-rv="" style={{ '--i': 1 }}>Anda fokus mengembangkan bisnis. PRASARA membantu mengatur sistemnya.</p>
            <div className="cx-cta" data-rv="" style={{ '--i': 2 }}>
              <Link href={START} className="cx-btn pri">Mulai Kelola Bisnis Anda <Icon name="arrow" size={18} /></Link>
              <a href="#bisnis" className="cx-btn dark">Jelajahi PRASARA</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="cx-foot">
        <div className="cx-wrap cx-foot-grid">
          <div className="cx-foot-brand">
            <div className="cx-logo" style={{ color: '#fff', '--logo-1': '#4ADE80', '--logo-2': '#D6FBE6', '--logo-3': '#22A06B' }}><LogoMark size={30} /><span>PRASARA</span></div>
            <p style={{ marginTop: 12 }}>Adaptive Business System untuk mengelola operasional, pelanggan, transaksi, keuangan, dan layanan dalam satu tempat.</p>
            <p style={{ marginTop: 8, fontSize: 13 }}>One Intelligence. Every Business.</p>
          </div>
          <nav aria-label="Produk"><b>Produk</b><a href="#demo">Demonstrasi</a><a href="#modul">Modul</a><a href="#analisis">Analisis bisnis</a><a href="#harga">Harga</a></nav>
          <nav aria-label="Solusi bisnis"><b>Solusi bisnis</b><a href="#bisnis">Kos & properti</a><a href="#bisnis">Toko retail & grosir</a><a href="#bisnis">Laundry & jasa</a><a href="#bisnis">Kuliner</a><a href="#bisnis">Business Builder</a></nav>
          <nav aria-label="Bantuan"><b>Bantuan</b><Link href="/panduan">Pusat bantuan & panduan</Link><Link href="/p/contoh">Contoh portal penghuni</Link><a href={WA} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a><Link href="/masuk">Masuk</Link></nav>
          <nav aria-label="Perusahaan"><b>Perusahaan</b><Link href="/tentang">Tentang Kami</Link><Link href="/privasi">Kebijakan Privasi</Link><Link href="/syarat">Syarat & Ketentuan</Link></nav>
        </div>
        <div className="cx-wrap cx-copy">© {new Date().getFullYear()} PRASARA. Hak cipta dilindungi.</div>
      </footer>
    </div>
  );
}
