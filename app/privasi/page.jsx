import InfoPage from '@/components/landing/InfoPage';
import { BUSINESS } from '@/lib/plan';

export const metadata = { title: 'Kebijakan Privasi — PRASARA', description: 'Data apa yang dikumpulkan PRASARA, untuk apa, di mana disimpan, siapa yang dapat mengaksesnya, dan hak Anda atas data tersebut.', alternates: { canonical: '/privasi' } };

export default function Privasi() {
  const wa = <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a>;
  return (
    <InfoPage kicker="Kebijakan Privasi" title="Bagaimana PRASARA memperlakukan data Anda" updated="7 November 2026">
      <p>Kebijakan ini menjelaskan data yang dikumpulkan saat Anda memakai PRASARA, tujuan penggunaannya, dan hak Anda. Kami berusaha mengikuti prinsip Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022).</p>
      <h2>Data yang kami kumpulkan</h2>
      <ul>
        <li><b>Akun:</b> alamat email dan kata sandi (disimpan dalam bentuk terenkripsi oleh layanan autentikasi; kami tidak dapat melihat kata sandi Anda).</li>
        <li><b>Data bisnis yang Anda masukkan:</b> profil bisnis, transaksi, pelanggan/penghuni, stok, kas, foto, dan lampiran. Data pelanggan atau penghuni Anda dimasukkan oleh Anda sebagai pengelola bisnis.</li>
        <li><b>Data dari halaman bisnis publik:</b> isian formulir pemesanan, pendaftaran, atau permintaan yang dikirim pengunjung kepada bisnis yang bersangkutan.</li>
        <li><b>Catatan teknis:</b> waktu dan pelaku perubahan penting (riwayat/audit) untuk keamanan dan penelusuran.</li>
        <li><b>Jumlah kunjungan halaman publik</b> (beranda, panduan, tentang, masuk, pendaftaran): hanya angka total per hari, tanpa identitas pengunjung, cookie pelacak, atau alamat IP.</li>
        <li><b>Alasan berhenti berlangganan</b> bila Anda memilih mengisinya (opsional) saat menghentikan perpanjangan.</li>
      </ul>
      <h2>Untuk apa data dipakai</h2>
      <ul>
        <li>Menjalankan fitur yang Anda pakai: pencatatan, laporan, tagihan, pengingat, dan halaman bisnis.</li>
        <li>Mengirim email layanan yang Anda aktifkan (mis. pengingat jatuh tempo, ringkasan harian) dan informasi akun/langganan.</li>
        <li>Memberi dukungan bila Anda meminta bantuan.</li>
      </ul>
      <p>Kami <b>tidak menjual</b> data Anda dan tidak memakai data bisnis Anda untuk iklan. Halaman ini tidak memasang pelacak iklan atau analytics pihak ketiga.</p>
      <h2>Di mana data disimpan</h2>
      <p>Aplikasi berjalan di Vercel; database, autentikasi, dan penyimpanan file berada di Supabase. Email dikirim melalui penyedia SMTP. Foto yang Anda tandai untuk halaman bisnis publik dapat dilihat siapa pun yang membuka halaman tersebut; lampiran internal (nota, bukti, dokumen) bersifat privat dan dibuka lewat tautan sementara.</p>
      <p>Bila fitur asisten AI di portal penghuni diaktifkan, pertanyaan penghuni beserta data tagihannya dikirim ke penyedia AI (Anthropic) hanya untuk menjawab pertanyaan tersebut, dengan batas pemakaian harian.</p>
      <h2>Siapa yang dapat mengakses</h2>
      <ul>
        <li>Pemilik bisnis dan karyawan yang diundang, sesuai peran masing-masing. Hak akses diperiksa di server/database.</li>
        <li>Tim PRASARA hanya dapat melihat ringkasan diagnostik bisnis Anda bila Anda memberi izin dari Pusat bantuan, dan setiap akses tercatat.</li>
      </ul>
      <h2>Penyimpanan di perangkat</h2>
      <p>PRASARA menyimpan sedikit pengaturan di browser Anda (mis. pilihan tampilan terang/gelap dan keranjang kasir yang belum selesai) agar aplikasi nyaman dipakai, serta sesi masuk agar Anda tidak perlu login berulang.</p>
      <h2>Hak Anda</h2>
      <ul>
        <li>Melihat dan mengunduh data bisnis Anda (Excel/PDF) dari aplikasi.</li>
        <li>Memperbaiki data yang keliru langsung di aplikasi.</li>
        <li>Meminta penghapusan akun dan data bisnis. Menutup bisnis atau berhenti berlangganan tidak menghapus data secara otomatis; ajukan penghapusan lewat {wa} atau tiket bantuan.</li>
      </ul>
      <h2>Perubahan kebijakan</h2>
      <p>Bila kebijakan ini berubah, tanggal di atas diperbarui dan perubahan penting diumumkan di aplikasi.</p>
      <h2>Kontak</h2>
      <p>Pertanyaan tentang privasi: {wa}.</p>
    </InfoPage>
  );
}
