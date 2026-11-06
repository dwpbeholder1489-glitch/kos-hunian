// Bantuan perhitungan Retail & Grosir (dipakai halaman Barang, nanti Kasir & Belanja)
import { angka } from '@/lib/format';

// "1,5" / "1.5" / "40" → angka desimal (untuk jumlah barang, bukan rupiah)
export function qtyNum(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
}

export const unitsOf = (p, units) => units.filter((u) => u.product_id === p.id).sort((a, b) => a.sort - b.sort);

// 93 pcs dengan dus isi 40 → "2 dus 13 pcs"
export function stockText(stock, units, base) {
  let s = Math.round(Number(stock || 0) * 1000) / 1000;
  if (s <= 0) return (s < 0 ? 'minus ' + angka(-s) : '0') + ' ' + base;
  const parts = [];
  for (const u of [...units].sort((a, b) => b.qty - a.qty)) {
    const q = Number(u.qty);
    if (q <= 1) continue; // sisa ditulis dalam satuan terkecil di bawah
    const n = Math.floor(s / q + 1e-9);
    if (n > 0) { parts.push(angka(n) + ' ' + u.name); s = Math.round((s - n * q) * 1000) / 1000; }
  }
  if (s > 0) parts.push(angka(s) + ' ' + base);
  return parts.join(' ');
}

export const isLow = (p) => Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock);

export const MOVE = {
  awal: 'Stok awal', opname: 'Stok opname', rusak: 'Rusak', kedaluwarsa: 'Kedaluwarsa', koreksi: 'Koreksi',
  jual: 'Terjual', beli: 'Belanja', retur_jual: 'Retur dari pelanggan', retur_beli: 'Retur ke supplier', batal: 'Pembatalan',
};
