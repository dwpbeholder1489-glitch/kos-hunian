// Mesin konversi satuan di browser — HANYA untuk pratinjau & pesan cepat. Server (unit_measure / unit_factor /
// product_save / unit_to_base) yang menentukan; aturan di sini harus sama persis.
// Satuan utama = dasar stok & modal. Satuan jual = isi × satuan isi → product_units.qty (dalam satuan utama).
import { angka } from '@/lib/format';

// ukuran: berat dalam gram, volume dalam ml
const SIZE = {
  kg: ['m', 1000], kilo: ['m', 1000], kilogram: ['m', 1000],
  gram: ['m', 1], gr: ['m', 1], g: ['m', 1], ons: ['m', 100],
  kuintal: ['m', 100000], kwintal: ['m', 100000], kw: ['m', 100000], ton: ['m', 1000000],
  liter: ['v', 1000], ltr: ['v', 1000], l: ['v', 1000], ml: ['v', 1], mililiter: ['v', 1], cc: ['v', 1],
};
const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '1/4': 0.25, '1/2': 0.5, '3/4': 0.75, setengah: 0.5, seperempat: 0.25 };

// "250 gram" → {dim:'m', size:250, n:250, unit:'gram'}; "Kemasan 250 gram" sama; "kg" → size 1000; "dus" → null
export function measure(name) {
  const s = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const m = s.match(/^(?:([^0-9¼½¾]*[^0-9¼½¾ ]) )?(¼|½|¾|1\/4|1\/2|3\/4|setengah|seperempat|\d+(?:[.,]\d+)?)? ?([a-z]+)$/);
  if (!m || (m[1] && !m[2]) || !SIZE[m[3]]) return null;
  const n = m[2] ? (FRAC[m[2]] ?? Number(m[2].replace(',', '.'))) : 1;
  if (!(n > 0)) return null;
  return { dim: SIZE[m[3]][0], size: n * SIZE[m[3]][1], n, unit: m[3] };
}
export const isMeasure = (u) => Boolean(measure(u));
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

// 1 from = ? to. Berat ↔ volume hanya dengan densitas (kg per liter). null = tidak bisa dihitung.
export function unitFactor(from, to, density) {
  const a = measure(from), b = measure(to);
  if (!a || !b) return null;
  if (a.dim === b.dim) return r6(a.size / b.size);
  if (!(Number(density) > 0)) return null;
  return a.dim === 'm' ? r6(a.size / Number(density) / b.size) : r6((a.size * Number(density)) / b.size);
}
export const crossDim = (a, b) => { const x = measure(a), y = measure(b); return Boolean(x && y && x.dim !== y.dim); };

// Jumlah satuan jual → satuan utama (sama dengan unit_to_base di server: dibulatkan 3 angka)
export const toBase = (qty, unitQty) => r3((Number(qty) || 0) * (Number(unitQty) || 0));

// Isi satu baris satuan jual (dalam satuan utama) dari {content_qty, content_unit}. rows = baris di atasnya (untuk "isi 2 Dus").
// Hasil {qty} atau {error}.
export function resolveUnit(row, base, density, rows = []) {
  const name = String(row.name || '').trim();
  const cq = isiNum(row.content_qty);
  const cu = String(row.content_unit || base || '').trim();
  if (!String(base || '').trim()) return { error: 'Pilih dulu satuan utama di atas.' };
  if (!name) return { error: 'Isi nama satuan (mis. Dus, Kemasan 250 gram).' };
  if (name.toLowerCase() === String(base).trim().toLowerCase()) return { error: `"${name}" sama dengan satuan utama. Beri nama lain, mis. "½ ${base}" atau "Dus".` };
  if (!(cq > 0)) return { error: `Isi berapa ${cu || base} dalam 1 ${name}?` };
  let f;
  if (cu.toLowerCase() === String(base).trim().toLowerCase()) f = 1;
  else {
    const prev = rows.find((r) => String(r.name || '').trim().toLowerCase() === cu.toLowerCase() && r._qty > 0);
    if (prev) f = prev._qty;
    else {
      f = unitFactor(cu, base, density);
      if (f == null) {
        if (isMeasure(cu) && isMeasure(base)) return { error: `Berat dan volume berbeda: ${cu} tidak bisa diubah ke ${base} secara otomatis. Isi "Berat 1 liter" di bawah, atau tulis isinya dalam ${base}.`, needDensity: true };
        if (isMeasure(cu)) return { error: `Satuan utama "${base}" bukan berat/volume — tulis isinya dalam ${base} (mis. 24 ${base}).` };
        return { error: `Satuan isi "${cu}" tidak dikenal.` };
      }
    }
  }
  let q = cq * f;
  if (crossDim(cu, base)) q = r3(q);
  q = r6(q);
  if (q === 1) return { error: `1 ${name} = 1 ${base} sama dengan satuan utama. Hapus atau ubah isinya.` };
  if (q > 1000000) return { error: 'Isi terlalu besar.' };
  if (r3(q) !== q) return { error: `1 ${name} = ${angka6(q)} ${base} — terlalu kecil untuk dicatat. Pakai satuan utama yang lebih kecil (mis. gram atau ml).` };
  const nm = measure(name), bm = measure(base);
  if (nm && bm) {
    let exp = unitFactor(name, base, density);
    if (exp == null) return { error: `"${name}" adalah ${nm.dim === 'm' ? 'berat' : 'volume'}, satuan utama ${base} ${bm.dim === 'm' ? 'berat' : 'volume'}. Isi "Berat 1 liter" atau ganti nama satuannya.`, needDensity: true };
    if (nm.dim !== bm.dim) exp = r3(exp);
    if (Math.abs(exp - q) > Math.max(0.001, exp * 0.005)) return { error: `Nama "${name}" berarti ${angka6(exp)} ${base}, tapi isinya ${angka6(q)} ${base}. Samakan nama dan isinya.`, expect: exp };
  }
  return { qty: q };
}
const angka6 = (n) => String(r6(Number(n))).replace('.', ',');

// Isi otomatis dari nama satuan (dalam satuan utama) bila keduanya berat/volume sejenis. null bila tidak bisa dihitung.
export function autoQty(name, base) {
  const a = measure(name); const b = measure(base);
  if (!a || !b || a.dim !== b.dim) return null;
  return r3(a.size / b.size);
}

// Satuan jual lama (tanpa content_*) → isian formulir: "Kemasan 250 gram" → 250 gram; "Dus" (24) → 24 base
export function contentOf(u, base) {
  if (u.content_qty != null && u.content_unit) return { content_qty: isiText(u.content_qty), content_unit: u.content_unit };
  const m = measure(u.name), b = measure(base);
  if (m && b && m.dim === b.dim && Math.abs(r3(m.size / b.size) - Number(u.qty)) < 0.0005) return { content_qty: isiText(m.n), content_unit: m.unit };
  return { content_qty: isiText(u.qty), content_unit: base };
}

// Angka isi: terima "0,25", "0.25", "1/4", "¼", "½", "1.000"
export function isiNum(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (FRAC[s] != null) return FRAC[s];
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[2]) > 0 ? r3(Number(f[1]) / Number(f[2])) : NaN;
  const t = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '') : s; // "1.000" = seribu
  const n = parseFloat(t.replace(',', '.'));
  return isFinite(n) ? r3(n) : NaN;
}

// Satuan utama yang umum
export const BASE_PRESETS = ['pcs', 'kg', 'gram', 'liter', 'ml', 'bungkus', 'botol', 'sachet', 'meter', 'lembar'];

// Pilihan "satuan isi" untuk satu baris: satuan utama, ukuran sejenis, satuan lain di atasnya, (ukuran lain dimensi bila densitas diisi)
export function contentChoices(base, rows, idx) {
  const b = measure(base);
  const list = [String(base || '').trim()];
  if (b) {
    const same = b.dim === 'm' ? ['gram', 'ons', 'kg', 'kuintal', 'ton'] : ['ml', 'liter'];
    const other = b.dim === 'm' ? ['ml', 'liter'] : ['gram', 'kg'];
    list.push(...same, ...other);
  }
  rows.slice(1, idx).forEach((r) => { const n = String(r.name || '').trim(); if (n) list.push(n); });
  return [...new Set(list.filter(Boolean).map((x) => x))].filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
}

// Satuan jual siap pakai menurut satuan utama: [nama, isi, satuan isi]; isi null = diisi pengguna
export function presetsFor(base) {
  const b = measure(base);
  if (b?.dim === 'm' && b.size >= 1000) return [['gram', 1, 'gram'], ['ons', 1, 'ons'], ['¼ kg', 250, 'gram'], ['½ kg', 500, 'gram'], ['Kemasan 250 gram', 250, 'gram'], ['Kemasan 500 gram', 500, 'gram'], ['Sak 25 kg', 25, 'kg'], ['Karung 50 kg', 50, 'kg']];
  if (b?.dim === 'm') return [['ons', 1, 'ons'], ['¼ kg', 250, 'gram'], ['½ kg', 500, 'gram'], ['kg', 1, 'kg']];
  if (b?.dim === 'v' && b.size >= 1000) return [['ml', 1, 'ml'], ['¼ liter', 250, 'ml'], ['½ liter', 500, 'ml'], ['Botol 600 ml', 600, 'ml'], ['Botol 1,5 liter', 1.5, 'liter'], ['Jeriken 5 liter', 5, 'liter'], ['Jeriken 20 liter', 20, 'liter']];
  if (b?.dim === 'v') return [['¼ liter', 250, 'ml'], ['½ liter', 500, 'ml'], ['liter', 1, 'liter']];
  if (!String(base || '').trim()) return [];
  return [['Lusin', 12, base], ['Kodi', 20, base], ['Renteng', null, base], ['Pak', null, base], ['Dus', null, base], ['Karton', null, base], ['Bal', null, base]];
}
// Lama (dipakai bagian lain): pecahan cepat untuk barang curah
export const quickFractions = (base) => presetsFor(base).filter(([, q]) => q != null).map(([n, q, u]) => [n, unitFactor(`${q} ${u}`, base) ?? q]);

// "dus" → "1 dus"; "250 gram" / "½ kg" tetap (sudah berangka)
export const one = (name) => (/^[\d¼½¾]/.test(String(name).trim()) ? String(name).trim() : `1 ${String(name).trim()}`);

// Masalah satu baris satuan (format lama {name, qty}) → teks (null bila aman)
export function unitProblem(row, base) {
  const name = String(row.name || '').trim(); const q = isiNum(row.qty);
  if (!String(base || '').trim()) return 'Isi dulu satuan utama di atas (mis. pcs, kg, liter).';
  if (!name) return 'Isi nama satuan (mis. dus, renteng, ½ kg).';
  if (name.toLowerCase() === String(base).trim().toLowerCase()) return `Nama "${name}" sama dengan satuan utama.`;
  if (!(q > 0)) return `Isi berapa ${base} dalam ${one(name)}.`;
  const exp = autoQty(name, base);
  if (exp != null && Math.abs(exp - q) > Math.max(0.001, exp * 0.005)) return `${one(name)} = ${angka(exp)} ${base}, bukan ${angka(q)} ${base}.`;
  if (crossDim(name, base)) return `"${name}" dan ${base} beda jenis (berat vs volume).`;
  return null;
}

// Angka isi untuk kolom isian (tanpa pemisah ribuan): 0.25 → "0,25", 1000 → "1000"
export const isiText = (n) => String(r3(Number(n))).replace('.', ',');
