'use client';
// Bantuan notifikasi: masalah umum + panduan per perangkat (yang cocok untuk perangkat ini ditampilkan lebih dulu).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/Page';
import { detect, guideFor } from '@/lib/notif';
import { GUIDES, InstallGuide } from '@/components/NotifCenter';

const FAQ = [
  ['Notifikasi tidak masuk', ['Buka Pengaturan notifikasi: status perangkat harus "Aktif di perangkat ini". Tekan Kirim notifikasi uji.', 'Periksa Jam tenang — push selain kritis ditahan sampai jam tenang selesai.', 'Periksa kategori: push untuk Penjualan & Pengeluaran harian bawaannya mati.', 'Mode Hemat Baterai / Jangan Ganggu / Fokus di HP bisa menahan notifikasi.', 'Notifikasi hanya untuk modul yang boleh Anda buka; pelaku transaksi tidak diberi tahu tentang tindakannya sendiri.']],
  ['Izin terlanjur ditolak', ['Android Chrome: ketuk ikon gembok/ⓘ di kolom alamat › Izin › Notifikasi › Izinkan.', 'iPhone: Pengaturan › Notifikasi › PRASARA › Izinkan Notifikasi (muncul setelah dipasang ke Layar Utama).', 'Windows/Mac Chrome/Edge: klik ikon gembok di kolom alamat › Notifikasi › Izinkan, lalu muat ulang.', 'Mac Safari: Safari › Pengaturan › Situs web › Notifikasi › izinkan PRASARA.']],
  ['iPhone tidak ada tombol aktifkan', ['iPhone/iPad memerlukan iOS/iPadOS 16.4 atau lebih baru.', 'PRASARA harus dibuka dari ikon di Layar Utama, bukan dari tab Safari. Lihat panduan iPhone di bawah.']],
  ['Bunyinya bagaimana?', ['Saat PRASARA tertutup: bunyi & getar mengikuti pengaturan notifikasi HP/komputer Anda.', 'Saat PRASARA terbuka: terdengar nada khusus PRASARA (bisa dimatikan di Pengaturan).', 'Notifikasi kritis tetap tampil sampai Anda menyentuhnya (bila didukung perangkat).']],
  ['Ganti HP / HP hilang', ['Buka Perangkat terhubung dari perangkat lain, lalu Hapus perangkat lama.', 'Keluar akun di sebuah perangkat otomatis menghentikan notifikasinya.']],
];

export default function BantuanNotifikasi() {
  const [mine, setMine] = useState(null);
  useEffect(() => { setMine(guideFor(detect())); }, []);
  return (
    <div className="stack">
      <PageHeader title="Bantuan notifikasi" desc="Cara mengaktifkan di tiap perangkat dan solusi masalah umum." />
      <section className="panel" id="izin">
        <h3>Masalah umum</h3>
        {FAQ.map(([q, a]) => <details key={q} className="nt-faq"><summary>{q}</summary><ul>{a.map((x) => <li key={x}>{x}</li>)}</ul></details>)}
      </section>
      {mine && <section className="panel"><h3>Panduan untuk perangkat ini</h3><InstallGuide which={mine} /><Link href="/pusat-notifikasi/pengaturan" className="nt-btn primary">Buka pengaturan notifikasi</Link></section>}
      <section className="panel"><h3>Perangkat lain</h3>{mine && Object.keys(GUIDES).filter((k) => k !== mine).map((k) => <InstallGuide key={k} which={k} />)}</section>
      <p className="small muted">Masih bermasalah? <Link href="/bantuan">Hubungi tim bantuan PRASARA</Link>. Notifikasi push memakai layanan bawaan browser (gratis); PRASARA tetap bisa dipakai penuh tanpa push.</p>
    </div>
  );
}
