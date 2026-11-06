// Barcode Code 128 (set B) sebagai SVG — untuk label barang tanpa barcode pabrik. Tanpa pustaka luar.
const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
  + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
  + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
  + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
  + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
  + '114131 311141 411131 211412 211214 211232 2331112').split(' ');

export const code128Ok = (text) => /^[\x20-\x7e]{1,40}$/.test(String(text || ''));

// Lebar modul: [bar, spasi, bar, ...] mulai dengan bar
export function code128Widths(text) {
  if (!code128Ok(text)) throw new Error('Kode hanya boleh huruf/angka biasa (maks 40)');
  const vals = [104, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  const check = vals.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103;
  return [...vals, check, 106].flatMap((v) => [...P[v]].map(Number));
}

export function code128Svg(text, { height = 40, module = 1.6 } = {}) {
  const w = code128Widths(text);
  const quiet = 10;
  let x = quiet, rects = '';
  w.forEach((n, i) => { if (i % 2 === 0) rects += `<rect x="${x * module}" y="0" width="${n * module}" height="${height}"/>`; x += n; });
  const width = (x + quiet) * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" fill="#000">${rects}</svg>`;
}

export const _patterns = P;
