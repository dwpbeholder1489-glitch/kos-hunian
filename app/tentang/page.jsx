import Link from 'next/link';
import InfoPage from '@/components/landing/InfoPage';
import { BUSINESS } from '@/lib/plan';

export const metadata = { title: 'Tentang Kami — PRASARA', description: 'PRASARA adalah Adaptive Business System untuk usaha kecil dan menengah di Indonesia: satu platform yang menyesuaikan diri dengan jenis bisnis, dengan pemilik sebagai pengambil keputusan.', alternates: { canonical: '/tentang' } };

export default function Tentang() {
  return (
    <InfoPage kicker="Tentang Kami" title="Sistem yang mengikuti bisnis Anda, bukan sebaliknya.">
      <p>PRASARA berawal dari kebutuhan sederhana: mengelola kos tanpa buku catatan yang tercecer. Dari sana PRASARA berkembang menjadi <b>Adaptive Business System</b> — satu platform untuk mengelola operasional, pelanggan, transaksi, keuangan, stok, dan layanan, yang menyesuaikan diri dengan jenis usaha masing-masing.</p>
      <h2>Yang kami pegang</h2>
      <ul>
        <li><b>Jujur soal kemampuan.</b> Fitur yang belum ada ditandai "Segera hadir" atau "Dalam rencana", tidak diklaim sudah bisa dipakai.</li>
        <li><b>Pemilik yang memutuskan.</b> Sistem memberi rekomendasi; aktivasi dan perubahan penting menunggu persetujuan pemilik dan tercatat di riwayat.</li>
        <li><b>Data tetap milik Anda.</b> Data tiap bisnis terpisah, bisa diunduh, dan tidak dihapus saat berhenti berlangganan.</li>
        <li><b>Dirancang untuk HP.</b> Pemilik usaha kecil bekerja dari HP; setiap layar dibuat agar nyaman dipakai dengan satu tangan.</li>
      </ul>
      <h2>Untuk siapa</h2>
      <p>Saat ini PRASARA dipakai untuk kos & properti sewa, toko retail & grosir, laundry & jasa, dan kuliner. Usaha lain dapat disusun dengan Business Builder.</p>
      <h2>Hubungi kami</h2>
      <p>WhatsApp: <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer">{BUSINESS.whatsappDisplay}</a>. Pengguna terdaftar juga bisa membuka tiket di Pusat bantuan dalam aplikasi. Ingin mencoba? <Link href="/masuk?daftar=1">Daftarkan bisnis Anda</Link>.</p>
    </InfoPage>
  );
}
