// Ilustrasi garis sederhana untuk tampilan kosong — kecil, satu warna + aksen emas, ikut mode gelap/terang.
// Dipilih otomatis dari judul (mis. "Belum ada barang" → kotak) kecuali `kind` diisi.
const S = { fill: 'none', stroke: 'var(--muted)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const A = { fill: 'var(--gold-soft)', stroke: 'var(--gold)', strokeWidth: 1.6, strokeLinejoin: 'round' };

const ART = {
  box: <><path {...A} d="M20 22l16-8 16 8-16 8z" /><path {...S} d="M20 22v18l16 8 16-8V22M36 30v18" /><path {...S} d="M28 18l16 8" /></>,
  receipt: <><path {...S} d="M24 10h24v36l-4-3-4 3-4-3-4 3-4-3-4 3z" /><path {...S} d="M30 20h12M30 26h12M30 32h7" /><circle {...A} cx="50" cy="40" r="6" /><path stroke="var(--gold)" strokeWidth="1.6" fill="none" d="M47.5 40l1.8 1.8 3.4-3.6" /></>,
  calendar: <><rect {...S} x="18" y="14" width="36" height="32" rx="5" /><path {...S} d="M18 23h36M27 10v8M45 10v8" /><rect {...A} x="38" y="30" width="9" height="8" rx="2" /><path {...S} d="M26 31h4M26 38h4" /></>,
  chart: <><path {...S} d="M16 46h40M18 46V12" /><rect {...A} x="24" y="30" width="6" height="16" rx="1.5" /><rect {...S} x="34" y="22" width="6" height="24" rx="1.5" /><rect {...S} x="44" y="34" width="6" height="12" rx="1.5" /></>,
  room: <><path {...S} d="M22 46V14h20v32" /><path {...S} d="M42 18l8 2v26l-8-2" /><circle cx="38" cy="31" r="1.6" fill="var(--muted)" /><path {...A} d="M16 46h40v3H16z" /></>,
  photo: <><rect {...S} x="16" y="14" width="40" height="30" rx="5" /><circle {...A} cx="28" cy="24" r="4" /><path {...S} d="M18 40l11-10 8 7 6-5 11 9" /></>,
  people: <><circle {...A} cx="30" cy="22" r="6" /><path {...S} d="M19 44c0-7 5-12 11-12s11 5 11 12" /><circle {...S} cx="46" cy="24" r="5" /><path {...S} d="M42 33c6 0 10 4 10 10" /></>,
  bag: <><path {...S} d="M20 22h32l-3 24H23z" /><path {...S} d="M28 22v-3a8 8 0 0116 0v3" /><path {...A} d="M29 32h14v6H29z" /></>,
  lock: <><rect {...A} x="22" y="26" width="28" height="20" rx="4" /><path {...S} d="M27 26v-6a9 9 0 0118 0v6" /><path {...S} d="M36 33v6" /></>,
  check: <><circle {...A} cx="36" cy="28" r="15" /><path stroke="var(--gold)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M29 28.5l5 5 9-10" /></>,
  search: <><circle {...S} cx="32" cy="26" r="11" /><path {...S} d="M40 34l9 9" /><path {...A} d="M27 26h10" /></>,
  note: <><rect {...S} x="20" y="12" width="32" height="36" rx="4" /><path {...S} d="M27 22h18M27 29h18M27 36h10" /><path {...A} d="M44 40l6-6 3 3-6 6h-3z" /></>,
};

const RULES = [
  [/izin|khusus|super admin|terkunci/i, 'lock'],
  [/tidak ditemukan|tidak ada yang cocok/i, 'search'],
  [/semua aman|sudah beres|tidak ada tindak lanjut/i, 'check'],
  [/foto|media|galeri/i, 'photo'],
  [/laporan|data laporan/i, 'chart'],
  [/reservasi|jadwal|booking|tindak lanjut|shift/i, 'calendar'],
  [/penghuni/i, 'people'],
  [/kamar|meja/i, 'room'],
  [/prospek|pelanggan|karyawan|kontak/i, 'people'],
  [/pesanan|dimasak|layanan|menu/i, 'bag'],
  [/barang|stok|belanja|label|lokasi|bahan/i, 'box'],
  [/transaksi|penjualan|pembayaran|tagihan|kas|biaya|jurnal|kwitansi|struk|nota|langganan|paket/i, 'receipt'],
];
export const artFor = (title = '') => RULES.find(([re]) => re.test(title))?.[1] || 'note';

export default function EmptyArt({ kind, title }) {
  const k = kind || artFor(title);
  return <svg className="emptyart" width="72" height="56" viewBox="0 0 72 56" aria-hidden="true" focusable="false">{ART[k] || ART.note}</svg>;
}
