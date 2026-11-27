import { rp, tgl, invTitle, METHOD } from '@/lib/format';

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
  if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '');
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '');
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + terbilang(n % 1e6) : '');
  return terbilang(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + terbilang(n % 1e9) : '');
}

export function receiptNumber(p) {
  return 'KW-' + p.paid_at.replace(/-/g, '') + '-' + p.id.slice(0, 4).toUpperCase();
}

export function kwitansiText(kos, p, inv, occupant, room) {
  const no = receiptNumber(p);
  return [
    kos.name, kos.address, '', 'KWITANSI ' + no, '',
    'Diterima dari: ' + occupant, 'Kamar: ' + room,
    'Untuk: ' + invTitle(inv), 'Tanggal: ' + tgl(p.paid_at), 'Metode: ' + METHOD[p.method],
    p.ref ? 'Referensi: ' + p.ref : null, 'Jumlah: ' + rp(p.amount), terbilang(p.amount) + ' rupiah',
    'Total tagihan: ' + rp(inv.amount), 'Sisa: ' + (inv.outstanding > 0 ? rp(inv.outstanding) : 'Lunas'),
  ].filter((line) => line != null).join('\n');
}
