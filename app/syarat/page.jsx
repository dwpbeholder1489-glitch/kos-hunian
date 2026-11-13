import Link from 'next/link';
import InfoPage from '@/components/landing/InfoPage';
import { BUSINESS } from '@/lib/plan';

export const metadata = { title: 'Syarat & Ketentuan — PRASARA', description: 'Ketentuan penggunaan layanan PRASARA: akun, paket & pembayaran, masa coba, kewajiban pengguna, dan batas tanggung jawab.', alternates: { canonical: '/syarat' } };

export default function Syarat() {
  return (
    <InfoPage kicker="Syarat & Ketentuan" title="Ketentuan penggunaan PRASARA" updated="7 November 2026">
      <p>Dengan mendaftar dan memakai PRASARA, Anda menyetujui ketentuan berikut. Baca juga <Link href="/privasi">Kebijakan Privasi</Link>.</p>
      <h2>1. Layanan</h2>
      <p>PRASARA adalah aplikasi web untuk mengelola bisnis. PRASARA masih terus dikembangkan: fitur bertanda "Segera hadir" atau "Dalam rencana" belum tersedia dan tidak ditagihkan. Kami berupaya menjaga layanan tetap berjalan, namun tidak menjamin layanan bebas gangguan setiap saat.</p>
      <h2>2. Akun</h2>
      <ul>
        <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi dan atas aktivitas di akun Anda serta akun karyawan yang Anda undang.</li>
        <li>Informasi pendaftaran harus benar. Satu akun dapat mengelola beberapa bisnis; data tiap bisnis terpisah.</li>
      </ul>
      <h2>3. Masa coba, paket, dan pembayaran</h2>
      <ul>
        <li>Setiap bisnis baru mendapat masa coba {BUSINESS.trialDays} hari dengan fitur Paket Dasar. Setelah itu bisnis otomatis memakai paket Gratis kecuali Anda berlangganan.</li>
        <li>Harga berlaku per bisnis per bulan sesuai yang tertera di halaman Harga dan menu Langganan. Harga dapat berubah; pelanggan aktif diberi tahu lebih dulu.</li>
        <li>Pembayaran melalui QRIS atau transfer bank dan aktif setelah diperiksa. Naik paket berlaku sejak disetujui; turun paket berlaku setelah masa paket berjalan berakhir.</li>
        <li>Biaya pihak ketiga yang Anda pakai sendiri (internet, WhatsApp, printer, biaya transfer, dan penyedia lain) tidak termasuk dalam langganan.</li>
      </ul>
      <h2>4. Data Anda</h2>
      <ul>
        <li>Data bisnis yang Anda masukkan tetap milik Anda. Anda dapat mengunduhnya kapan saja.</li>
        <li>Anda bertanggung jawab atas kebenaran data dan atas izin dari pelanggan/penghuni yang datanya Anda catat atau hubungi.</li>
        <li>Berhenti berlangganan tidak menghapus data. Penghapusan data dapat diminta sesuai Kebijakan Privasi.</li>
      </ul>
      <h2>5. Larangan</h2>
      <ul>
        <li>Memakai PRASARA untuk kegiatan yang melanggar hukum, penipuan, atau mengirim pesan spam.</li>
        <li>Mencoba mengakses data bisnis lain, mengganggu sistem, atau mengakali batasan paket.</li>
      </ul>
      <p>Pelanggaran dapat menyebabkan akun dibatasi atau dihentikan.</p>
      <h2>6. Batas tanggung jawab</h2>
      <p>Laporan dan perhitungan di PRASARA disusun dari data yang Anda masukkan dan bukan nasihat keuangan, pajak, atau hukum. Keputusan bisnis tetap menjadi tanggung jawab Anda. Sepanjang diizinkan hukum, PRASARA tidak bertanggung jawab atas kerugian tidak langsung akibat penggunaan layanan.</p>
      <h2>7. Perubahan ketentuan</h2>
      <p>Ketentuan ini dapat diperbarui. Tanggal di atas akan diubah dan perubahan penting diumumkan di aplikasi. Ketentuan ini tunduk pada hukum Republik Indonesia.</p>
      <h2>8. Kontak</h2>
      <p>WhatsApp <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer">{BUSINESS.whatsappDisplay}</a> atau tiket di Pusat bantuan.</p>
    </InfoPage>
  );
}
