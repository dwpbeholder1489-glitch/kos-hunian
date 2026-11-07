import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import Icon from '@/components/landing/Icon';
import HeroMulti, { KasirMock } from '@/components/landing/HeroMulti';
import Showcase from '@/components/landing/Showcase';
import { PLANS, FEATURES, FEATURE_GROUPS, BUSINESS, featureCell } from '@/lib/plan';
import { TESTIMONIALS } from '@/lib/testimonials';

const TITLE = 'PRASARA — One Intelligence. Every Business.';
const DESC = 'Satu aplikasi untuk mengelola bisnis dari HP: kos & properti sewa, toko retail & grosir, laundry & jasa. Satu akun untuk beberapa bisnis. Coba gratis 30 hari.';
export const metadata = {
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, type: 'website', locale: 'id_ID', siteName: 'PRASARA', url: '/', images: [{ url: '/og.jpg?v=2', width: 1200, height: 630, alt: 'PRASARA — aplikasi pengelolaan bisnis' }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/og.jpg?v=2'] },
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
  return ['gratis', 'standar', 'pro'].map((k) => ({ key: k, name: PLANS[k].name, tagline: PLANS[k].tagline, price: PLANS[k].price, is_free: k === 'gratis', active: true }));
}

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin tanya tentang aplikasi PRASARA.')}`;
const START = '/masuk?daftar=1';

// Nilai utama (hanya yang sudah berjalan)
const VALUES = [
  ['layers', 'Satu akun, banyak bisnis', 'Kelola kos, toko, dan laundry dari satu akun. Ketuk nama bisnis untuk pindah, dan lihat ringkasan semua bisnis dalam satu layar.'],
  ['compass', 'Menu sesuai jenis usaha', 'Kos melihat kamar, penghuni, dan tagihan. Toko melihat kasir, stok, dan belanja. Laundry melihat pesanan dan tahap proses. Menu yang tidak relevan tidak ditampilkan.'],
  ['shield', 'Tim dengan hak akses jelas', 'Karyawan masuk dengan akun sendiri. Kasir hanya melihat kasir — tidak melihat harga modal atau laba. Batasan diperiksa di database.'],
];

// Solusi per kategori: status jujur
const CATS = [
  ['🏠', 'Properti & Sewa', 'Kos, kontrakan, homestay: kamar, penghuni, tagihan bulanan otomatis, booking, deposit, keluhan & perbaikan, meteran listrik/air, verifikasi pembayaran, laba rugi.', 'ready'],
  ['🛒', 'Retail & Grosir', 'Toko sembako, minimarket, grosir: kasir eceran & grosir, stok multi-satuan, barcode, belanja ke supplier, kasbon, laporan laba.', 'ready'],
  ['🧺', 'Jasa & Laundry', 'Laundry kiloan & satuan (dan jasa lain): pesanan, tahap cuci–kering–setrika–QC, nota, DP, antar-jemput, keluhan, bahan, laporan.', 'ready'],
  ['🍳', 'Kuliner', 'Menu, resep, bahan baku, dan pesanan dapur.', 'plan'],
  ['🏭', 'Produksi', 'Produksi, daftar bahan (BOM), bahan baku, kontrol mutu.', 'plan'],
  ['🚚', 'Distribusi', 'Gudang, pesanan, armada, dan pengiriman.', 'plan'],
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
    ['Laba rugi & kwitansi', 'Untung bersih per bulan, kwitansi PDF, ekspor Excel.', 'Standar'],
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
  ['users', 'Untuk semua bisnis', [
    ['Karyawan & peran', 'Pengelola, kasir, staf gudang, penjaga, petugas proses — masing-masing hanya melihat menunya.'],
    ['Ringkasan semua bisnis', 'Angka penting setiap bisnis dalam satu layar.'],
    ['Pengingat & email pagi', 'Lonceng pengingat, email ringkasan, dan daftar yang perlu ditindaklanjuti.', 'Standar'],
    ['Bantuan', 'Panduan bergambar, tombol "? Panduan" di setiap menu, dan tiket bantuan.'],
    ['Tampilan terang & gelap', 'Nyaman dipakai siang maupun malam; mengikuti pengaturan HP.'],
  ]],
];

const TRUST = [
  ['database', 'Data tiap bisnis terpisah', 'Pemisahan data dijaga langsung di tingkat database. Pengguna lain tidak dapat melihat data Anda.'],
  ['shield', 'Hak akses diperiksa server', 'Peran karyawan diperiksa di database, bukan hanya disembunyikan dari menu.'],
  ['globe', 'Lewat browser, terenkripsi', 'Tidak perlu memasang aplikasi. Koneksi selalu HTTPS.'],
  ['lock', 'Data tetap milik Anda', 'Berhenti berlangganan tidak menghapus data. Laporan bisa diekspor.'],
];

const FAQ = [
  ['Bisnis apa saja yang sudah bisa dikelola?', 'Saat ini Properti & Sewa (kos, kontrakan, homestay), Retail & Grosir (toko sembako, minimarket, grosir), dan Jasa & Laundry (laundry kiloan/satuan, juga jasa lain seperti jahit atau servis). Jenis lain seperti kuliner, produksi, dan distribusi masih dalam rencana — kami tidak menjanjikan tanggal sebelum fiturnya siap.'],
  ['Apakah satu akun bisa untuk kos dan toko sekaligus?', 'Bisa. Tambahkan bisnis kedua dari menu bisnis (ketuk nama bisnis di kiri atas). Data tiap bisnis terpisah, dan Anda bisa melihat ringkasan semuanya dalam satu layar.'],
  ['Apakah harus memasang aplikasi?', 'Tidak. PRASARA dibuka lewat browser di HP atau laptop. Agar terasa seperti aplikasi, tambahkan ke layar utama: di Safari ketuk Bagikan › Tambah ke Layar Utama, di Chrome ketuk ⋮ › Tambahkan ke layar utama.'],
  ['Bagaimana cara mencoba gratis?', `Daftar dengan email, pilih jenis bisnis, lalu isi namanya. Setiap bisnis baru mendapat ${BUSINESS.trialDays} hari akses semua fitur tanpa kartu kredit. Setelah itu otomatis menjadi paket Gratis kecuali Anda berlangganan.`],
  ['Harganya per apa?', 'Per bisnis, per bulan. Jika punya kos dan toko, masing-masing memilih paketnya sendiri.'],
  ['Bagaimana dengan karyawan?', 'Pemilik mengundang karyawan lewat email dan memilih perannya. Karyawan masuk dengan akunnya sendiri dan hanya melihat menu sesuai perannya. Email karyawan yang tidak dipakai bisa dihapus kapan saja.'],
  ['Bagaimana cara membayar langganan?', 'Buka menu Langganan, pilih paket dan durasi, lalu bayar lewat QRIS atau transfer bank dan tekan "Saya sudah bayar". Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam pada hari kerja.'],
  ['Apakah data saya aman?', 'Data setiap bisnis dipisahkan di tingkat database, hak akses karyawan diperiksa di server, dan koneksi selalu terenkripsi. Tim PRASARA hanya bisa melihat ringkasan diagnostik bila Anda memberi izin dari Pusat bantuan, dan setiap aksesnya tercatat.'],
  ['Apa yang terjadi jika berhenti berlangganan?', 'Data tidak dihapus. Bisnis kembali ke paket Gratis dengan batasannya; begitu berlangganan lagi, semuanya terbuka kembali.'],
];

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'PRASARA', applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web', description: DESC, inLanguage: 'id',
  offers: ['gratis', 'standar', 'pro'].map((k) => ({ '@type': 'Offer', name: PLANS[k].name, price: PLANS[k].price, priceCurrency: 'IDR' })), // bawaan; harga terkini di halaman
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
  const best = (plans.find((x) => x.key === 'standar') || plans.filter((x) => !x.is_free)[0])?.key;
  const cardRows = (pl) => FEATURES.filter((f) => !f.soon).map((f) => [f, featureCell(f, pl)])
    .filter(([f, v]) => v && (pl.is_free || typeof v === 'string' || !(free && featureCell(f, free) === true))).slice(0, 8);
  return (
    <div className="ln">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingNav />

      <main>
        {/* 1. HERO */}
        <section className="ln-hero" id="beranda">
          <div className="ln-wrap ln-hero-grid">
            <div className="ln-hero-text ln-rise">
              <span className="ln-eyebrow">Satu aplikasi untuk berbagai jenis bisnis</span>
              <h1>One Intelligence. <span>Every Business.</span></h1>
              <p className="ln-lead">PRASARA membantu pemilik usaha mengelola bisnisnya dari HP — saat ini untuk <b>kos & properti sewa</b> dan <b>toko retail & grosir</b>. Satu akun untuk beberapa bisnis; menu menyesuaikan jenis usahanya.</p>
              <div className="ln-cta-row">
                <Link href={START} className="ln-btn ln-btn-primary ln-btn-lg">Mulai Gratis {BUSINESS.trialDays} Hari <Icon name="arrow" size={18} /></Link>
                <a href="#solusi" className="ln-btn ln-btn-outline ln-btn-lg">Lihat solusinya</a>
              </div>
              <p className="ln-support">Tanpa kartu kredit. Data setiap bisnis terpisah dan tetap milik Anda.</p>
            </div>
            <div className="ln-rise ln-rise-2"><HeroMulti /></div>
          </div>
        </section>

        {/* 2. NILAI UTAMA */}
        <section className="ln-sec" aria-labelledby="h-nilai">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Kenapa PRASARA</span><h2 id="h-nilai">Satu kendali untuk semua usaha Anda.</h2>
              <p>Catatan di buku, spreadsheet, dan chat WhatsApp pindah ke satu tempat — tersusun per bisnis, bisa dibuka dari HP kapan saja.</p></div>
            <div className="ln-vals">
              {VALUES.map(([ic, t, d]) => <div key={t} className="ln-val"><span className="ln-ico-wrap"><Icon name={ic} size={22} /></span><h3>{t}</h3><p>{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* 3. SOLUSI PER KATEGORI */}
        <section className="ln-sec ln-sec-alt" id="solusi" aria-labelledby="h-solusi">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Solusi per jenis bisnis</span><h2 id="h-solusi">Kos, toko, dan laundry.</h2>
              <p>Tiga jenis bisnis sudah bisa dipakai penuh. Jenis lain sedang kami rancang dan baru dibuka setelah siap.</p></div>
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

        {/* 4. FITUR UTAMA */}
        <section className="ln-sec" id="fitur" aria-labelledby="h-fitur">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Fitur utama</span><h2 id="h-fitur">Yang sudah bisa Anda pakai hari ini.</h2></div>
            <div className="ln-groups">
              {GROUPS.map(([ic, g, items]) => (
                <div key={g} className="ln-group">
                  <div className="ln-group-h"><span className="ln-ico-wrap"><Icon name={ic} size={22} /></span><h3>{g}</h3></div>
                  <ul>{items.map(([t, d, b]) => (
                    <li key={t}><div className="ln-feat-t">{t} <Badge t={b} /></div><p>{d}</p></li>
                  ))}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. BUSINESS BUILDER (belum tersedia) */}
        <section className="ln-sec ln-sec-alt" id="builder" aria-labelledby="h-builder">
          <div className="ln-wrap">
            <div className="ln-builder">
              <div>
                <span className="ln-kicker">Business Builder <Badge t="Segera hadir" /></span>
                <h2 id="h-builder" style={{ marginTop: 8 }}>Usaha Anda tidak ada di daftar?</h2>
                <p className="ln-p" style={{ marginTop: 12 }}>Kami sedang merancang Business Builder: menyusun alur bisnis sendiri dari template, memilih modul yang dibutuhkan, dan memakai istilah yang biasa Anda pakai. Fitur ini <b>belum tersedia</b>.</p>
              </div>
              <div>
                <h3>Rencana alurnya</h3>
                <ol style={{ marginTop: 10 }}>
                  <li>Pilih jenis usaha atau template terdekat.</li>
                  <li>Pilih modul: penjualan, stok, sewa, pesanan, keuangan.</li>
                  <li>Sesuaikan istilah, status, dan alur kerja.</li>
                  <li>Tinjau, lalu aktifkan.</li>
                </ol>
                <a href={WA} target="_blank" rel="noreferrer" className="ln-btn ln-btn-outline" style={{ marginTop: 16 }}><Icon name="message" size={18} />Ceritakan usaha Anda</a>
              </div>
            </div>
          </div>
        </section>

        {/* 6. DEMO PRODUK */}
        <section className="ln-sec" id="demo" aria-labelledby="h-demo">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Lihat aplikasinya</span><h2 id="h-demo">Dirancang untuk dipakai setiap hari, dari HP.</h2>
              <p>Semua tampilan di bawah memakai data contoh.</p></div>
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

        {/* KEAMANAN */}
        <section className="ln-sec ln-sec-dark" aria-labelledby="h-trust">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Keamanan & privasi</span><h2 id="h-trust">Data bisnis Anda, tetap milik Anda.</h2></div>
            <div className="ln-trust">
              {TRUST.map(([ic, t, d]) => <div key={t}><Icon name={ic} size={22} /><h3>{t}</h3><p>{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* 7. PAKET HARGA */}
        <section className="ln-sec" id="harga" aria-labelledby="h-harga">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Harga</span><h2 id="h-harga">Harga sederhana, per bisnis.</h2>
              <p>Setiap bisnis baru mendapat <b>{BUSINESS.trialDays} hari akses semua fitur</b>. Setelah itu otomatis menjadi paket Gratis kecuali Anda memilih berlangganan — tanpa tagihan kejutan, dan data tidak pernah dihapus.</p></div>
            <div className="ln-prices">
              {plans.map((pl) => (
                <div key={pl.key} className={'ln-price' + (pl.key === best ? ' best' : '')}>
                  {pl.key === best && <span className="ln-best">Paling sesuai untuk bisnis aktif</span>}
                  <h3>{pl.name}</h3>
                  <p className="ln-tag">{pl.tagline}</p>
                  <div className="ln-amount">{rp(Number(pl.price))}<span>{Number(pl.price) ? ' /bulan' : ' selamanya'}</span><span className="per">{Number(pl.price) ? 'per bisnis' : 'tanpa batas waktu'}</span></div>
                  {!pl.is_free && free && <p className="ln-small" style={{ margin: '-4px 0 6px' }}>Semua fitur {free.name}, ditambah:</p>}
                  <ul>{cardRows(pl).map(([f, v]) => (
                    <li key={f.label}><Icon name="check" size={17} /><span>{f.label}{typeof v === 'string' ? ` — ${v}` : ''}</span></li>
                  ))}</ul>
                  <Link href={START} className={'ln-btn ' + (pl.key === best ? 'ln-btn-primary' : 'ln-btn-outline')}>{pl.is_free ? 'Mulai gratis' : `Coba ${pl.name} ${BUSINESS.trialDays} hari`}</Link>
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
            <p className="ln-plan-note">Harga masih dapat berubah selama tahap pengembangan. Fitur bertanda "Segera hadir" belum tersedia dan tidak ditagihkan.</p>
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

        {/* 8. FAQ */}
        <section className="ln-sec ln-sec-alt" id="faq" aria-labelledby="h-faq">
          <div className="ln-wrap ln-faq-wrap">
            <div className="ln-head"><span className="ln-kicker">FAQ</span><h2 id="h-faq">Pertanyaan yang sering diajukan</h2></div>
            <div className="ln-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" size={18} /></summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        {/* 9. CTA */}
        <section className="ln-sec">
          <div className="ln-wrap">
            <div className="ln-final">
              <h2>Mulai rapikan bisnis Anda hari ini.</h2>
              <p>Lebih sedikit catatan yang tercecer. Lebih banyak kendali atas setiap usaha Anda.</p>
              <div className="ln-cta-row center">
                <Link href={START} className="ln-btn ln-btn-accent ln-btn-lg">Mulai Gratis {BUSINESS.trialDays} Hari <Icon name="arrow" size={18} /></Link>
                <a href={WA} target="_blank" rel="noreferrer" className="ln-btn ln-btn-onDark ln-btn-lg"><Icon name="message" size={18} />Hubungi Kami</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. FOOTER */}
      <footer className="ln-foot">
        <div className="ln-wrap ln-foot-in">
          <div>
            <div className="ln-logo"><span className="ln-logo-mark">P</span><b>PRASARA</b></div>
            <p>One Intelligence. Every Business.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>A smarter way to manage life and business.</p>
          </div>
          <nav aria-label="Tautan footer">
            <a href="#solusi">Solusi</a><a href="#fitur">Fitur</a><a href="#harga">Harga</a><Link href="/panduan">Panduan</Link><Link href="/p/contoh">Contoh portal penghuni</Link><Link href="/masuk">Masuk</Link>
            <a href={WA} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a>
          </nav>
        </div>
        <div className="ln-wrap ln-copy">© {new Date().getFullYear()} PRASARA</div>
      </footer>
    </div>
  );
}
