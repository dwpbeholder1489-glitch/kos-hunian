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
  jual: 'Terjual', beli: 'Belanja', retur_jual: 'Retur dari pelanggan', retur_beli: 'Retur ke supplier', batal: 'Pembatalan', transfer: 'Mutasi lokasi', pakai: 'Pemakaian bahan', titip: 'Terima titipan', titip_kembali: 'Titipan dikembalikan',
};

export const PAY = { tunai: 'Tunai', transfer: 'Transfer / QRIS', kasbon: 'Kasbon' };
// Semua cara bayar untuk label (Kasir hanya menampilkan PAY sebagai tombol; nota kredit dipilih terpisah)
export const PAY_ALL = { ...PAY, nota: 'Nota kredit', campuran: 'Campuran' };
// Label cara bayar sebuah penjualan (termasuk bayar campuran: rincian dari pay_split)
export const payLabel = (s, rpFn) => (s?.pay_method === 'campuran'
  ? 'Campuran (' + Object.entries(s.pay_split || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${PAY_ALL[k] || k}${rpFn ? ' ' + rpFn(v) : ''}`).join(' + ') + ')'
  : PAY_ALL[s?.pay_method] || s?.pay_method || '');
// Refund retur
export const REFUND = { tunai: 'Tunai', transfer: 'Transfer', kasbon: 'Potong kasbon', nota: 'Nota kredit' };
// Pisah daftar nomor seri yang diketik (koma, spasi, baris baru)
export const splitSerials = (t) => [...new Set(String(t || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
// Harga satuan sesuai jenis harga; grosir kosong → pakai eceran
export const unitPrice = (u, tier) => Number(tier === 'grosir' && Number(u.price_wholesale) > 0 ? u.price_wholesale : u.price_retail) || 0;
// Harga per jumlah beli (pratinjau; server price_break yang menentukan): harga terendah antara harga biasa dan tingkat yang memenuhi syarat
export const breakPrice = (breaks, productId, unit, tier, qty, base) => {
  const ok = (breaks || []).filter((b) => b.product_id === productId && b.unit === unit && (b.tier === 'semua' || b.tier === (tier || 'ecer')) && Number(b.min_qty) <= qty)
    .sort((a, b) => Number(b.min_qty) - Number(a.min_qty) || Number(a.price) - Number(b.price))[0];
  return ok ? Math.min(base, Number(ok.price)) : base;
};
export const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
