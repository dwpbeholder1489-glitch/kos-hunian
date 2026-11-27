import { printLines } from './printer-format.mjs';

export async function downloadReceiptPdf(text, number, paper) {
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
  for (let start = 0; start < lines.length; start += rowsPerPage) {
    const rows = lines.slice(start, start + rowsPerPage);
    const height = Math.max(points(30), rows.length * lineHeight + 2 * margin);
    const page = pdf.addPage([width, height]);
    rows.forEach((row, i) => page.drawText(row, {
      x: (width - font.widthOfTextAtSize(' '.repeat(columns), fontSize)) / 2,
      y: height - margin - fontSize - i * lineHeight,
      size: fontSize,
      font,
    }));
  }
  const url = URL.createObjectURL(new Blob([await pdf.save()], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Struk-' + String(number).replace(/[^\w.-]/g, '_') + '.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
