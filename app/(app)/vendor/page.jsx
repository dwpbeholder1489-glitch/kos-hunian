'use client';
// Vendor (workspace Event, Master Prompt §9): memakai daftar kontak supplier yang sama dengan Belanja & komitmen vendor proyek —
// tidak ada tabel vendor terpisah. Kategori layanan, harga, & evaluasi vendor menyusul di Tahap C.
import Kontak from '../kontak/page';

export default function Vendor() {
  return <Kontak mode="vendor" />;
}
