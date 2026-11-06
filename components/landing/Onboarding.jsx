// Section "Kami pandu sampai terbiasa" — semua klaim mengacu pada fasilitas yang benar-benar ada:
// daftar "Mulai di sini" di Dashboard, tombol "? Panduan" per menu, halaman /panduan, WhatsApp, masa coba.
// Untuk mengaktifkan fasilitas baru (mis. sesi pendampingan), tambahkan di BENEFITS / STAGES / POINTS.
import Link from 'next/link';
import Icon from './Icon';
import Reveal from './Reveal';
import { BUSINESS } from '@/lib/plan';

const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin dibantu memulai PRASARA.')}`;

const BENEFITS = [
  ['compass', 'Dipandu dari awal', 'Setelah mendaftar, Dashboard menampilkan daftar "Mulai di sini": isi harga kamar, masukkan penghuni, catat pembayaran, dan catat pengeluaran. Setiap langkah tercentang otomatis.'],
  ['home', 'Belajar langsung dengan kos sendiri', 'Tidak sekadar menonton tutorial. Anda langsung memakai data kos Anda sendiri, sehingga alurnya lebih cepat dipahami.'],
  ['layers', 'Tidak perlu menguasai semua fitur', 'Mulai dari yang paling sederhana: kamar dan pembayaran. Fitur lain bisa dipakai nanti, saat memang dibutuhkan.'],
  ['headset', 'Ada bantuan saat kesulitan', `Setiap menu punya tombol "? Panduan". Masih bingung? Tanyakan langsung lewat WhatsApp ${BUSINESS.whatsappDisplay}.`],
  ['eye', 'Kondisi kos jadi lebih jelas', 'Begitu pembayaran dan pengeluaran tercatat, Dashboard dan Laporan menunjukkan uang masuk, tunggakan, dan laba bersih kos.'],
  ['calendar', 'Waktu mencoba tanpa terburu-buru', `${BUSINESS.trialDays} hari akses semua fitur tanpa kartu kredit. Setelah itu kos otomatis menjadi paket Gratis — tidak ada tagihan otomatis.`],
];

// [judul, isi, dibantu oleh]
const STAGES = [
  ['Daftar dan mulai', 'Buat akun PRASARA dengan email.', 'Kurang dari 1 menit'],
  ['Kenali kos Anda', 'Masukkan nama kos, jumlah kamar, dan harga sewa.', 'Kamar dibuat otomatis'],
  ['Mulai mengelola', 'Catat penghuni dan pembayaran pertama.', 'Daftar "Mulai di sini"'],
  ['Pahami keuangan', 'Lihat pemasukan, pengeluaran, dan laba di Laporan.', 'Tombol "? Panduan"'],
  ['Kelola lebih mandiri', 'Biasakan administrasi kos dari satu tempat.', 'Panduan bergambar & WhatsApp'],
];

const POINTS = [
  'Tidak perlu keahlian teknologi khusus.',
  'Bisa mulai dari fitur yang paling dibutuhkan.',
  'Ada panduan dan kanal bantuan untuk proses awal.',
];

export default function Onboarding() {
  return (
    <section className="ln-sec ln-sec-alt" id="pendampingan" aria-labelledby="h-pandu">
      <div className="ln-wrap">
        <Reveal className="ln-head">
          <span className="ln-kicker">Untuk pengguna baru</span>
          <h2 id="h-pandu">Tidak harus langsung bisa. Kami pandu sampai terbiasa.</h2>
          <p>Memulai pengelolaan kos secara digital tidak harus membingungkan. Anda akan dipandu mengenal fitur, mengatur data kos, mencatat pembayaran, hingga memahami laporan keuangan dengan lebih mudah.</p>
        </Reveal>

        <div className="ln-benefits">
          {BENEFITS.map(([ic, t, d], i) => (
            <Reveal key={t} className="ln-benefit" delay={(i % 3) * 80}>
              <span className="ln-ico-wrap"><Icon name={ic} size={22} /></span>
              <h3>{t}</h3>
              <p>{d}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="ln-journey">
          <h3 className="ln-journey-h">Dari pertama mencoba sampai terbiasa</h3>
          <ol className="ln-timeline">
            {STAGES.map(([t, d, help], i) => (
              <li key={t}>
                <span className="ln-tl-dot">{i + 1}</span>
                <div className="ln-tl-body">
                  <b>{t}</b>
                  <p>{d}</p>
                  <span className="ln-tl-help"><Icon name="check" size={14} />{help}</span>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="ln-assure">
          <div>
            <h3>Belum terbiasa dengan teknologi? Tidak masalah.</h3>
            <p>Kami memahami bahwa tidak semua pemilik kos terbiasa menggunakan aplikasi untuk mengelola usahanya. Karena itu, proses awal dibuat sesederhana mungkin agar Anda bisa belajar secara bertahap. Tujuannya bukan membuat Anda menguasai teknologi, tetapi membantu Anda mengelola kos dengan lebih mudah.</p>
            <ul className="ln-checks">{POINTS.map((p) => <li key={p}><Icon name="check" size={18} />{p}</li>)}</ul>
          </div>
          <div className="ln-assure-cta">
            <span className="ln-assure-badge">Gratis mencoba selama {BUSINESS.trialDays} hari</span>
            <p>Kenali cara baru mengelola kos. Mulai dari langkah sederhana, pelajari manfaatnya, lalu putuskan apakah PRASARA cocok untuk kebutuhan Anda.</p>
            <Link href="/masuk?daftar=1" className="ln-btn ln-btn-primary ln-btn-lg">Mulai Coba PRASARA <Icon name="arrow" size={18} /></Link>
            <div className="ln-assure-links">
              <Link href="/panduan" className="ln-textlink">Lihat panduan bergambar</Link>
              <a href={WA} target="_blank" rel="noreferrer" className="ln-textlink"><Icon name="message" size={16} />Tanya lewat WhatsApp</a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
