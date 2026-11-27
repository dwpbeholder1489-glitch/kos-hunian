import { qrMatrix } from './qr.js';
import { downloadReceiptFile, receiptFilename, PORTAL_TITLE } from './receipt-image.js';
import { printLines } from './printer-format.mjs';

export async function downloadReceiptPdf(text, number, paper, portal) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const narrow = paper !== '80';
  const columns = narrow ? 32 : 48;
  const fontSize = narrow ? 7.5 : 7;
  const points = (mm) => mm * 72 / 25.4;
  const width = points(narrow ? 58 : 80);
  const margin = points(3);
  const lineHeight = fontSize * 1.4;
  const rowsPerPage = Math.floor((points(297) - 2 * margin) / lineHeight);
  const lines = printLines(text, columns).map((line) => Array.from(line, (char) => {
    if (/\p{Cc}/u.test(char)) return ' ';
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join(''));
  const pages = [];
  for (let start = 0; start < lines.length; start += rowsPerPage) {
    pages.push(lines.slice(start, start + rowsPerPage));
  }
  const portalHeight = points(44);
  if (portal && pages.at(-1).length * lineHeight + 2 * margin + portalHeight > points(297)) pages.push([]);
  const left = (width - font.widthOfTextAtSize(' '.repeat(columns), fontSize)) / 2;
  pages.forEach((rows, index) => {
    const showPortal = portal && index === pages.length - 1;
    const height = Math.max(points(30), rows.length * lineHeight + 2 * margin + (showPortal ? portalHeight : 0));
    const page = pdf.addPage([width, height]);
    rows.forEach((row, i) => page.drawText(row, {
      x: left,
      y: height - margin - fontSize - i * lineHeight,
      size: fontSize,
      font,
    }));
    if (showPortal) {
      const matrix = qrMatrix(portal);
      const step = points(30) / (matrix.length + 8);
      const origin = (width - matrix.length * step) / 2;
      const top = margin + points(31) - 4 * step;
      matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) page.drawRectangle({ x: origin + x * step, y: top - (y + 1) * step, width: step, height: step });
      }));
      [PORTAL_TITLE, 'Pindai kode QR untuk membuka', 'portal bisnis toko.'].forEach((label, i) => {
        page.drawText(label, { x: (width - font.widthOfTextAtSize(label, 7)) / 2, y: margin + points(40) - i * 9, font, size: 7 });
      });
    }
  });
  downloadReceiptFile(new File([await pdf.save()], receiptFilename(number, 'pdf'), { type: 'application/pdf' }));
}
