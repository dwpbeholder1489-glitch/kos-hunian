import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import Icon from '@/components/landing/Icon';
import HeroMock from '@/components/landing/HeroMock';
import Showcase from '@/components/landing/Showcase';
import Onboarding from '@/components/landing/Onboarding';
import { PLANS, FEATURES, BUSINESS } from '@/lib/plan';
import { TESTIMONIALS } from '@/lib/testimonials';
import { rp as rpDemo, CASH_IN, CASH_OUT, ROOMS } from '@/components/demo/sample';

const TITLE = 'PRASARA — Aplikasi Pengelolaan Kos Online untuk Pemilik Kos';
const DESC = 'Kelola kamar, penghuni, tagihan, pembayaran, dan laporan keuangan kos dengan mudah. Coba PRASARA gratis selama 30 hari.';
export const metadata = {
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, type: 'website', locale: 'id_ID', siteName: 'PRASARA', url: '/', images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'PRASARA — aplikasi pengelolaan kos' }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/og.jpg'] },
};

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin tanya tentang aplikasi PRASARA.')}`;
const START = '/masuk?daftar=1';

const PROBLEMS = [
  ['notebook', 'Catatan yang tercecer', 'Buku, spreadsheet, dan percakapan WhatsApp membuat informasi sulit dilacak saat dibutuhkan.'],
  ['clock', 'Tagihan yang terlupakan', 'Sulit mengetahui siapa yang sudah membayar, belum membayar, atau masih memiliki tunggakan.'],
  ['trend', 'Keuangan yang tidak jelas', 'Uang masuk dan keluar bercampur, sehingga keuntungan bersih kos sulit diketahui.'],
];

// [ikon, judul grup, [ [fitur, manfaat, label?] ]]
const GROUPS = [
  ['bed', 'Kamar & penghuni', [
    ['Manajemen kamar', 'Status, harga, dan fasilitas setiap kamar terlihat sekilas.'],
    ['Manajemen penghuni', 'Kontak, kamar, dan riwayat sewa tersimpan rapi di satu tempat.'],
    ['Portal penghuni', 'Penghuni cek tagihan dan kirim bukti transfer sendiri lewat link pribadi.', 'Pro'],
  ]],
  ['receipt', 'Tagihan & pembayaran', [
    ['Tagihan otomatis', 'Tagihan sewa terbit sendiri setiap bulan — tidak ada yang terlewat.'],
    ['Pencatatan pembayaran', 'Tunai, transfer, atau QRIS tercatat dan diverifikasi sebelum dihitung lunas.'],
    ['Pembayaran sebagian', 'Penghuni boleh mencicil; sisa tagihan dihitung otomatis.'],
    ['Pengingat WhatsApp', 'Pesan pengingat berisi rincian tagihan siap dikirim dengan satu ketukan.'],
  ]],
  ['chart', 'Keuangan', [
    ['Pencatatan pengeluaran', 'Listrik, air, perbaikan, gaji penjaga — semua biaya kos tercatat.'],
    ['Laporan laba rugi', 'Tahu untung bersih setiap bulan, terpisah dari uang yang diambil pemilik.'],
    ['Kwitansi PDF', 'Kirim kwitansi resmi ke penghuni lewat WhatsApp atau cetak.', 'Standar'],
    ['Ekspor Excel', 'Unduh laporan dan transaksi untuk pembukuan atau pajak.', 'Standar'],
  ]],
  ['sparkles', 'Asisten AI khusus kos', [
    ['Asisten untuk penghuni', 'Menjawab pertanyaan penghuni soal tagihan, cara bayar, dan peraturan — hanya urusan kos.', 'Pro'],
    ['Asisten untuk pemilik', 'Tanya kondisi bisnis kos dengan bahasa sehari-hari.', 'Segera hadir'],
  ]],
];

const STEPS = [
  ['Daftarkan kos Anda', 'Buat akun dengan email, isi nama kos dan jumlah kamar. Kamar A01, A02, … dibuat otomatis.'],
  ['Masukkan kamar dan penghuni', 'Isi harga sewa, lalu masukkan penghuni beserta tanggal masuknya. Penghuni lama pun bisa dimulai dari tagihan berikutnya.'],
  ['Kelola secara otomatis', 'Tagihan terbit sendiri, pembayaran tercatat, pengingat siap dikirim, dan laporan tersusun setiap bulan.'],
];

const TRUST = [
  ['database', 'Data setiap pemilik terpisah', 'Pemisahan data dijaga langsung di tingkat database. Pemilik kos lain tidak dapat melihat data Anda.'],
  ['link', 'Penghuni hanya melihat miliknya', 'Link portal bersifat pribadi, hanya menampilkan tagihan penghuni itu, dan bisa diganti kapan saja.'],
  ['globe', 'Akses lewat browser', 'Tidak perlu memasang aplikasi. Koneksi ke PRASARA selalu terenkripsi (HTTPS).'],
  ['phone', 'HP dan laptop', 'Dirancang untuk dipakai dari HP, tetap nyaman di laptop. Data selalu sama di semua perangkat.'],
  ['lock', 'Data tetap milik Anda', 'Berhenti berlangganan tidak menghapus data. Laporan bisa diekspor ke Excel (Standar).'],
  ['headset', 'Bantuan langsung', `Ada pertanyaan atau kendala? Hubungi kami lewat WhatsApp ${BUSINESS.whatsappDisplay}.`],
];

const FAQ = [
  ['Apakah harus memasang aplikasi?', 'Tidak. PRASARA dibuka lewat browser di HP atau laptop. Agar terasa seperti aplikasi, tambahkan ke layar utama HP: di Safari ketuk Bagikan › Tambah ke Layar Utama, di Chrome ketuk ⋮ › Tambahkan ke layar utama.'],
  ['Bagaimana cara mencoba gratis?', `Daftar dengan email, lalu isi nama kos dan jumlah kamar. Setiap kos baru mendapat ${BUSINESS.trialDays} hari akses ke semua fitur tanpa kartu kredit. Setelah itu kos otomatis menjadi paket Gratis (maksimal ${BUSINESS.freeRoomLimit} kamar terisi), kecuali Anda berlangganan.`],
  ['Bagaimana cara membayar langganan?', 'Buka menu Langganan di aplikasi, pilih paket dan durasi, lalu bayar lewat QRIS atau transfer bank. Tekan "Saya sudah bayar" dan kirim bukti lewat WhatsApp. Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam.'],
  ['Apakah data saya aman?', 'Data setiap pemilik dipisahkan di tingkat database sehingga pemilik lain tidak bisa melihatnya, dan koneksi ke aplikasi selalu terenkripsi. Penghuni hanya bisa melihat tagihannya sendiri lewat link pribadi yang bisa Anda ganti kapan saja.'],
  ['Apa yang terjadi jika berhenti berlangganan?', `Data tidak dihapus. Kos kembali ke paket Gratis: fitur berbayar terkunci, dan penghuni baru tidak bisa ditambahkan jika sudah ada ${BUSINESS.freeRoomLimit} kamar terisi. Begitu berlangganan lagi, semuanya terbuka kembali.`],
  ['Bagaimana kalau saya bingung setelah mendaftar?', `Dashboard langsung menampilkan daftar "Mulai di sini" berisi 4 langkah awal, setiap menu punya tombol "? Panduan", dan panduan bergambar bisa dibuka kapan saja. Jika masih ada kendala, hubungi kami lewat WhatsApp ${BUSINESS.whatsappDisplay}.`],
  ['Apakah bisa digunakan melalui HP?', 'Bisa. PRASARA dirancang untuk dipakai dari HP — mulai dari mencatat pembayaran, mengirim pengingat WhatsApp, sampai melihat laporan.'],
  ['Bagaimana jika memiliki banyak kamar?', 'Paket Standar dan Pro tidak membatasi jumlah kamar. Harga berlaku per kos, dan satu akun bisa mengelola beberapa kos sekaligus.'],
];

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'PRASARA', applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web', description: DESC, inLanguage: 'id',
  offers: ['gratis', 'standar', 'pro'].map((k) => ({ '@type': 'Offer', name: PLANS[k].name, price: PLANS[k].price, priceCurrency: 'IDR' })),
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

export default function Landing() {
  const vacant = ROOMS.filter((r) => r.status === 'tersedia').map((r) => r.code).join(' dan ');
  return (
    <div className="ln">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingNav />

      <main>
        {/* HERO */}
        <section className="ln-hero" id="beranda">
          <div className="ln-wrap ln-hero-grid">
            <div className="ln-hero-text ln-rise">
              <span className="ln-eyebrow">Aplikasi pengelolaan kos untuk pemilik kos di Indonesia</span>
              <h1>Kos tetap berjalan. <span>Anda tetap tenang.</span></h1>
              <p className="ln-lead">Kelola kamar, penghuni, tagihan, pembayaran, dan keuntungan kos dalam satu dashboard. Tidak perlu lagi membuka banyak catatan atau mengingat siapa yang belum membayar.</p>
              <div className="ln-cta-row">
                <Link href={START} className="ln-btn ln-btn-primary ln-btn-lg">Mulai Gratis {BUSINESS.trialDays} Hari <Icon name="arrow" size={18} /></Link>
                <a href="#cara-kerja" className="ln-btn ln-btn-outline ln-btn-lg">Lihat Cara Kerjanya</a>
              </div>
              <p className="ln-support">Tanpa kartu kredit. Setelah masa uji coba, tersedia paket Gratis untuk maksimal {BUSINESS.freeRoomLimit} kamar terisi.</p>
            </div>
            <div className="ln-rise ln-rise-2"><HeroMock /></div>
          </div>
        </section>

        {/* MASALAH */}
        <section className="ln-sec" aria-labelledby="h-masalah">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Masalahnya</span><h2 id="h-masalah">Mengelola kos seharusnya tidak serumit ini.</h2></div>
            <div className="ln-problems">
              {PROBLEMS.map(([ic, t, d]) => (
                <div key={t} className="ln-problem"><span className="ln-ico-wrap warn"><Icon name={ic} size={22} /></span><h3>{t}</h3><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* SOLUSI */}
        <section className="ln-sec ln-sec-alt" id="fitur" aria-labelledby="h-fitur">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Solusinya</span><h2 id="h-fitur">Semua urusan kos, dalam satu kendali.</h2>
              <p>Dari kamar kosong sampai laba bersih — PRASARA mencatat, menghitung, dan mengingatkan untuk Anda.</p></div>
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

        {/* SHOWCASE */}
        <section className="ln-sec" id="produk" aria-labelledby="h-produk">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Lihat aplikasinya</span><h2 id="h-produk">Dirancang untuk dipakai setiap hari, dari HP.</h2></div>
            <Showcase />
          </div>
        </section>

        {/* CARA KERJA */}
        <section className="ln-sec ln-sec-alt" id="cara-kerja" aria-labelledby="h-cara">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Cara kerja</span><h2 id="h-cara">Mulai mengelola kos dengan lebih mudah.</h2></div>
            <ol className="ln-steps">
              {STEPS.map(([t, d], i) => <li key={t}><span className="ln-step-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}
            </ol>
            <div className="ln-center"><Link href="/panduan" className="ln-textlink">Baca panduan lengkap langkah demi langkah <Icon name="arrow" size={16} /></Link></div>
          </div>
        </section>

        {/* AI */}
        <section className="ln-sec" id="asisten" aria-labelledby="h-ai">
          <div className="ln-wrap ln-ai">
            <div>
              <span className="ln-kicker">Asisten AI</span>
              <h2 id="h-ai">Punya pertanyaan tentang bisnis kos Anda? Tinggal tanyakan.</h2>
              <p className="ln-p">Asisten AI PRASARA khusus untuk urusan kos. Ia hanya menjawab berdasarkan data yang tercatat di aplikasi dan sesuai hak akses — penghuni hanya bisa menanyakan tagihannya sendiri. Pertanyaan di luar urusan kos ditolak dengan sopan.</p>
              <div className="ln-ai-cards">
                <div className="ln-ai-card"><div className="ln-feat-t">Asisten untuk penghuni <Badge t="Pro" /></div><p>Di portal penghuni: tagihan, cara bayar, jatuh tempo, peraturan, dan kamar kosong.</p></div>
                <div className="ln-ai-card"><div className="ln-feat-t">Asisten untuk pemilik <Badge t="Segera hadir" /></div>
                  <p>Contoh pertanyaan yang sedang kami siapkan:</p>
                  <ul className="ln-qs">{['Berapa keuntungan bersih bulan ini?', 'Siapa saja penghuni yang belum membayar?', 'Berapa total pengeluaran bulan ini?', 'Kamar mana yang masih kosong?', 'Bagaimana kondisi keuangan kos saya?'].map((q) => <li key={q}>{q}</li>)}</ul>
                </div>
              </div>
            </div>
            <div className="ln-chat" aria-label="Pratinjau percakapan asisten pemilik dengan data contoh">
              <div className="ln-chat-h"><span className="ln-ico-wrap sm"><Icon name="sparkles" size={18} /></span><b>Asisten PRASARA</b><Badge t="Segera hadir" /></div>
              <div className="ln-bub me">Berapa keuntungan bersih bulan ini?</div>
              <div className="ln-bub">Pendapatan bulan ini {rpDemo(CASH_IN)} dan biaya operasional {rpDemo(CASH_OUT)}, jadi laba operasional {rpDemo(CASH_IN - CASH_OUT)}.</div>
              <div className="ln-bub me">Siapa saja yang belum membayar?</div>
              <div className="ln-bub">Ada 2 penghuni: Budi Santoso (A02) {rpDemo(750000)} sudah lewat jatuh tempo, dan Dimas Pratama (A05) sisa {rpDemo(350000)}. Kamar {vacant} masih kosong.</div>
              <p className="ln-note">Pratinjau dengan data contoh. Fitur asisten untuk pemilik belum tersedia.</p>
            </div>
          </div>
        </section>

        {/* KEPERCAYAAN */}
        <section className="ln-sec ln-sec-dark" aria-labelledby="h-trust">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Keamanan & privasi</span><h2 id="h-trust">Data kos Anda, tetap milik Anda.</h2></div>
            <div className="ln-trust">
              {TRUST.map(([ic, t, d]) => <div key={t}><Icon name={ic} size={22} /><h3>{t}</h3><p>{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* PENDAMPINGAN PENGGUNA BARU */}
        <Onboarding />

        {/* HARGA */}
        <section className="ln-sec" id="harga" aria-labelledby="h-harga">
          <div className="ln-wrap">
            <div className="ln-head"><span className="ln-kicker">Harga</span><h2 id="h-harga">Harga sederhana, per kos.</h2>
              <p>Setiap kos baru mendapat <b>{BUSINESS.trialDays} hari akses semua fitur</b>. Setelah itu kos otomatis menjadi paket Gratis kecuali Anda memilih berlangganan — tanpa tagihan kejutan, dan data tidak pernah dihapus.</p></div>
            <div className="ln-prices">
              {['gratis', 'standar', 'pro'].map((k) => (
                <div key={k} className={'ln-price' + (k === 'standar' ? ' best' : '')}>
                  {k === 'standar' && <span className="ln-best">Paling sesuai untuk kos aktif</span>}
                  <h3>{PLANS[k].name}</h3>
                  <p className="ln-tag">{PLANS[k].tagline}</p>
                  <div className="ln-amount">{rp(PLANS[k].price)}<span>{PLANS[k].price ? ' /bulan' : ' selamanya'}</span></div>
                  <ul>{FEATURES.filter((f) => f[k]).map((f) => (
                    <li key={f.label} className={f.soon ? 'soon' : ''}><Icon name={f.soon ? 'clock' : 'check'} size={17} /><span>{f.label}{typeof f[k] === 'string' ? ` — ${f[k]}` : ''}{f.soon && <> <Badge t="Segera hadir" /></>}</span></li>
                  ))}</ul>
                  <Link href={START} className={'ln-btn ' + (k === 'standar' ? 'ln-btn-primary' : 'ln-btn-outline')}>{k === 'gratis' ? 'Mulai gratis' : `Coba ${PLANS[k].name} 30 hari`}</Link>
                </div>
              ))}
            </div>
            <details className="ln-compare">
              <summary>Bandingkan semua fitur</summary>
              <div className="ln-table-wrap"><table>
                <thead><tr><th>Fitur</th><th>Gratis</th><th>Standar</th><th>Pro</th></tr></thead>
                <tbody>{FEATURES.map((f) => (
                  <tr key={f.label}><td>{f.label}{f.soon && <Badge t="Segera hadir" />}</td><td><Cell v={f.gratis} /></td><td><Cell v={f.standar} /></td><td><Cell v={f.pro} /></td></tr>
                ))}</tbody>
              </table></div>
            </details>
          </div>
        </section>

        {/* TESTIMONI — tampil otomatis bila lib/testimonials.js sudah berisi testimoni asli */}
        {TESTIMONIALS.length > 0 && (
          <section className="ln-sec ln-sec-alt" aria-labelledby="h-testi">
            <div className="ln-wrap">
              <div className="ln-head"><span className="ln-kicker">Kata pengguna</span><h2 id="h-testi">Dipakai pemilik kos sungguhan.</h2></div>
              <div className="ln-testi">{TESTIMONIALS.map((t) => (
                <figure key={t.name}><blockquote>“{t.quote}”</blockquote><figcaption><b>{t.name}</b><span>{t.role}</span></figcaption></figure>
              ))}</div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="ln-sec ln-sec-alt" id="faq" aria-labelledby="h-faq">
          <div className="ln-wrap ln-faq-wrap">
            <div className="ln-head"><span className="ln-kicker">FAQ</span><h2 id="h-faq">Pertanyaan yang sering diajukan</h2></div>
            <div className="ln-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" size={18} /></summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        {/* CTA AKHIR */}
        <section className="ln-sec">
          <div className="ln-wrap">
            <div className="ln-final">
              <h2>Mulai kelola kos dengan lebih teratur hari ini.</h2>
              <p>Lebih sedikit pekerjaan administratif. Lebih banyak kendali atas bisnis kos Anda.</p>
              <div className="ln-cta-row center">
                <Link href={START} className="ln-btn ln-btn-accent ln-btn-lg">Mulai Gratis {BUSINESS.trialDays} Hari <Icon name="arrow" size={18} /></Link>
                <a href={WA} target="_blank" rel="noreferrer" className="ln-btn ln-btn-onDark ln-btn-lg"><Icon name="message" size={18} />Hubungi Kami</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ln-foot">
        <div className="ln-wrap ln-foot-in">
          <div>
            <div className="ln-logo"><span className="ln-logo-mark">P</span><b>PRASARA</b></div>
            <p>Kos tetap berjalan. Anda tetap tenang.</p>
          </div>
          <nav aria-label="Tautan footer">
            <a href="#fitur">Fitur</a><a href="#harga">Harga</a><Link href="/panduan">Panduan</Link><Link href="/p/contoh">Contoh portal penghuni</Link><Link href="/masuk">Masuk</Link>
            <a href={WA} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a>
          </nav>
        </div>
        <div className="ln-wrap ln-copy">© {new Date().getFullYear()} PRASARA</div>
      </footer>
    </div>
  );
}
