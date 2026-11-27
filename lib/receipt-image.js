import { qrMatrix } from './qr.js';

export const PORTAL_TITLE = 'Portal Bisnis';
export const PORTAL_HINT = 'Pindai kode QR untuk membuka portal bisnis toko.';

export function receiptFilename(number, extension) {
  return 'Struk-' + String(number).replace(/[^\w.-]/g, '_') + '.' + extension;
}

export function downloadReceiptFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function receiptImage(text, number, paper, portal) {
  const lines = text.split('\n');
  const width = 640;
  const padding = 30;
  const font = paper === '80' ? 19 : 27;
  const rowHeight = Math.ceil(font * 1.45);
  const canvas = document.createElement('canvas');
  const height = padding * 2 + lines.length * rowHeight + (portal ? 320 : 0);
  if (height > 15000) throw new Error('Struk terlalu panjang untuk satu gambar. Pilih Unduh PDF.');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';
  ctx.font = `${font}px monospace`;
  const columns = paper === '80' ? 48 : 32;
  const left = (width - ctx.measureText(' '.repeat(columns)).width) / 2;
  lines.forEach((line, index) => {
    ctx.font = `${index === 0 || /^TOTAL\s/.test(line) ? 'bold ' : ''}${font}px monospace`;
    ctx.fillText(line, left, padding + index * rowHeight, width - left - 12);
  });
  if (portal) {
    const top = padding + lines.length * rowHeight + 12;
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(PORTAL_TITLE, width / 2, top);
    ctx.font = '20px sans-serif';
    ctx.fillText(PORTAL_HINT, width / 2, top + 35, width - 2 * padding);
    const matrix = qrMatrix(portal);
    const step = Math.floor(225 / (matrix.length + 8));
    const origin = Math.floor((width - matrix.length * step) / 2);
    matrix.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) ctx.fillRect(origin + x * step, top + 76 + (y + 4) * step, step, step);
    }));
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Gambar struk gagal dibuat.');
  return new File([blob], receiptFilename(number, 'png'), { type: 'image/png' });
}
