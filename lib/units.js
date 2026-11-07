// Satuan barang: konversi berat/volume & pemeriksaan "isi" supaya kesalahan seperti "250 gram = 250 kg" tertangkap.
// Aturan yang sama diperiksa ulang di server (unit_measure / product_save).
import { angka } from '@/lib/format';

// ukuran dasar: berat dalam gram, volume dalam ml
const SIZE = {
  kg: ['m', 1000], kilo: ['m', 1000], kilogram: ['m', 1000],
  gram: ['m', 1], gr: ['m', 1], g: ['m', 1], ons: ['m', 100],
  liter: ['v', 1000], ltr: ['v', 1000], l: ['v', 1000], ml: ['v', 1], mililiter: ['v', 1],
};
const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '1/4': 0.25, '1/2': 0.5, '3/4': 0.75, setengah: 0.5, seperempat: 0.25 };

// "250 gram" → {dim:'m', size:250}; "½ kg" → {dim:'m', size:500}; "kg" → {dim:'m', size:1000}; "dus" → null
export function measure(name) {
  const s = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (SIZE[s]) return { dim: SIZE[s][0], size: SIZE[s][1] };
  const m = s.match(/^(¼|½|¾|1\/4|1\/2|3\/4|setengah|seperempat|\d+(?:[.,]\d+)?)\s?([a-z]+)$/);
  if (!m || !SIZE[m[2]]) return null;
  const n = FRAC[m[1]] ?? Number(m[1].replace(',', '.'));
  if (!(n > 0)) return null;
  return { dim: SIZE[m[2]][0], size: n * SIZE[m[2]][1] };
}

// Isi otomatis dari nama satuan (dalam satuan terkecil) bila keduanya berat/volume. null bila tidak bisa dihitung.
export function autoQty(name, base) {
  const a = measure(name); const b = measure(base);
  if (!a || !b || a.dim !== b.dim) return null;
  return Math.round((a.size / b.size) * 1000) / 1000;
}

// Angka isi: terima "0,25", "0.25", "1/4", "¼", "½"
export function isiNum(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (FRAC[s] != null) return FRAC[s];
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[2]) > 0 ? Math.round((Number(f[1]) / Number(f[2])) * 1000) / 1000 : NaN;
  const t = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '') : s; // "1.000" = seribu
  const n = parseFloat(t.replace(',', '.'));
  return isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
}

// Satuan pecahan cepat untuk barang curah (dijual sebagian)
export function quickFractions(base) {
  const b = String(base || '').trim().toLowerCase();
  if (['kg', 'kilo', 'kilogram'].includes(b)) return [['¼ kg', 0.25], ['½ kg', 0.5]];
  if (['liter', 'ltr', 'l'].includes(b)) return [['¼ liter', 0.25], ['½ liter', 0.5]];
  if (['gram', 'gr', 'g'].includes(b)) return [['1 ons', 100], ['¼ kg', 250], ['½ kg', 500], ['1 kg', 1000]];
  if (b === 'ml') return [['¼ liter', 250], ['½ liter', 500], ['1 liter', 1000]];
  return [];
}

// "dus" → "1 dus"; "250 gram" / "½ kg" tetap (sudah berangka)
export const one = (name) => (/^[\d¼½¾]/.test(String(name).trim()) ? String(name).trim() : `1 ${String(name).trim()}`);

// Masalah satu baris satuan tambahan → teks (null bila aman)
export function unitProblem(row, base) {
  const name = String(row.name || '').trim(); const q = isiNum(row.qty);
  if (!String(base || '').trim()) return 'Isi dulu satuan terkecil di atas (mis. pcs, kg, liter).';
  if (!name) return 'Isi nama satuan (mis. dus, renteng, ½ kg).';
  if (name.toLowerCase() === String(base).trim().toLowerCase()) return `Nama "${name}" sama dengan satuan terkecil. Beri nama lain, mis. "½ ${base}" atau "dus".`;
  if (!(q > 0)) return `Isi berapa ${base} dalam ${one(name)}.`;
  if (q === 1) return `Isi 1 ${base} berarti sama dengan satuan terkecil — hapus baris ini atau ubah isinya.`;
  if (q > 100000) return 'Isi terlalu besar.';
  const exp = autoQty(name, base);
  if (exp != null && Math.abs(exp - q) > Math.max(0.001, exp * 0.005)) return `${one(name)} = ${angka(exp)} ${base}, bukan ${angka(q)} ${base}.`;
  return null;
}

// Angka isi untuk kolom isian (tanpa pemisah ribuan): 0.25 → "0,25", 1000 → "1000"
export const isiText = (n) => String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
