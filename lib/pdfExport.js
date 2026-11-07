// Membuat laporan PDF dari data ekspor (A4 mendatar): halaman sampul + satu bagian per lembar data, tabel dengan judul kolom di tiap halaman.
const fmtRp = (v) => 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID');
const fmtNum = (v) => Number(v).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const fmtDate = (v) => { const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s; };
const WIN = '–—‘’“”•…€';
const clean = (s) => String(s).replace(/[\r\n\t]+/g, ' ').split('').map((c) => (c.charCodeAt(0) < 256 || WIN.includes(c) ? c : '?')).join('');
const show = (v, t) => (v == null || v === '' ? '' : clean(t === 'r' && !isNaN(Number(v)) ? fmtRp(v) : t === 'n' && !isNaN(Number(v)) ? fmtNum(v) : t === 'd' ? fmtDate(v) : v));

export async function makePdf(data) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`Data ${data.business}`); doc.setCreator('PRASARA'); doc.setProducer('PRASARA');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 32, FS = 7.5, LH = 11;
  const navy = rgb(0.12, 0.17, 0.29), grey = rgb(0.45, 0.45, 0.45), band = rgb(0.93, 0.91, 0.86), line = rgb(0.85, 0.83, 0.78);
  const fit = (s, f, size, w) => { if (f.widthOfTextAtSize(s, size) <= w) return s; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (f.widthOfTextAtSize(s.slice(0, m) + '…', size) <= w) lo = m; else hi = m - 1; } return s.slice(0, lo) + '…'; };
  let page, y, pageNo = 0;
  const footer = () => page.drawText(clean(`${data.business} · diunduh ${data.exported_at} WIB · halaman ${pageNo}`), { x: M, y: 16, size: 7, font, color: grey });
  const newPage = () => { page = doc.addPage([W, H]); pageNo += 1; y = H - M; footer(); };

  // Sampul
  newPage();
  page.drawText(clean(`Data bisnis: ${data.business}`), { x: M, y: y - 20, size: 20, font: bold, color: navy });
  page.drawText(clean(`${data.type === 'retail' ? 'Toko' : data.type === 'jasa' ? 'Jasa / laundry' : 'Kos / properti'}${data.address ? ' · ' + data.address : ''}`), { x: M, y: y - 42, size: 10, font, color: grey });
  page.drawText(clean(`Diunduh dari PRASARA pada ${data.exported_at} WIB`), { x: M, y: y - 58, size: 10, font, color: grey });
  y -= 92;
  page.drawText('Isi dokumen', { x: M, y, size: 12, font: bold, color: navy }); y -= 18;
  data.sheets.forEach((s, i) => { page.drawText(clean(`${i + 1}. ${s.name}`), { x: M, y, size: 10, font }); page.drawText(`${s.rows.length.toLocaleString('id-ID')} baris`, { x: M + 260, y, size: 10, font, color: grey }); y -= 14; if (y < 60) { newPage(); } });
  y -= 10;
  page.drawText(clean('Versi Excel berisi data yang sama dan bisa diolah (filter, jumlah). Foto bukti transfer tidak termasuk.'), { x: M, y, size: 9, font, color: grey });

  newPage();
  for (const [i, s] of data.sheets.entries()) {
    if (i > 0) { if (y < 150) newPage(); else y -= 18; } // bagian pendek berbagi halaman agar tidak boros kertas
    page.drawText(clean(s.name), { x: M, y: y - 12, size: 14, font: bold, color: navy });
    page.drawText(`${s.rows.length.toLocaleString('id-ID')} baris`, { x: M, y: y - 26, size: 8, font, color: grey });
    y -= 40;
    if (!s.rows.length) { page.drawText('Belum ada data.', { x: M, y, size: 9, font, color: grey }); continue; }
    const cells = s.rows.map((r) => r.map((v, j) => show(v, s.types[j])));
    const want = s.cols.map((c, j) => Math.min(170, Math.max(bold.widthOfTextAtSize(clean(c), FS), ...cells.slice(0, 400).map((r) => font.widthOfTextAtSize(r[j], FS))) + 8));
    const total = want.reduce((a, b) => a + b, 0);
    const widths = want.map((w) => (w * Math.min(1, (W - 2 * M) / total)));
    const head = () => {
      page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: LH + 2, color: band });
      let x = M; s.cols.forEach((c, j) => { page.drawText(fit(clean(c), bold, FS, widths[j] - 4), { x: x + 2, y, size: FS, font: bold, color: navy }); x += widths[j]; });
      y -= LH + 3;
    };
    head();
    for (const r of cells) {
      if (y < 34) { newPage(); page.drawText(clean(`${s.name} (lanjutan)`), { x: M, y: y - 10, size: 9, font: bold, color: navy }); y -= 24; head(); }
      let x = M;
      r.forEach((v, j) => {
        const txt = fit(v, font, FS, widths[j] - 4);
        const right = s.types[j] === 'r' || s.types[j] === 'n';
        page.drawText(txt, { x: right ? x + widths[j] - 2 - font.widthOfTextAtSize(txt, FS) : x + 2, y, size: FS, font });
        x += widths[j];
      });
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.3, color: line });
      y -= LH;
    }
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
