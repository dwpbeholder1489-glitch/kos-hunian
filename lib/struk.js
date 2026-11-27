// Teks struk penjualan (lebar 32 karakter, cocok untuk printer thermal 58mm dan WhatsApp)
import { angka, tgl } from '@/lib/format';
import { PAY_ALL as PAY, jam } from '@/lib/retail';
import { printLines } from './printer-format.mjs';

const n0 = (v) => angka(Math.round(Number(v) || 0));

export function strukText(kos, s, lines, contact, paper = '58') {
  const W = ['80', 'auto'].includes(paper) ? 48 : paper === 'A4' ? 72 : 32;
  const pad = (l, r) => { l = String(l); r = String(r); const n = W - l.length - r.length; return n >= 1 ? l + ' '.repeat(n) + r : l + '\n' + ' '.repeat(Math.max(0, W - r.length)) + r; };
  const out = [];
  const center = (t) => ' '.repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t;
  for (const text of [kos.name, kos.address, kos.contact_phone && 'WA ' + kos.contact_phone]) {
    if (text) out.push(...printLines(text, W).map(center));
  }
  out.push('-'.repeat(W));
  out.push(pad(s.number, ''), pad(tgl(s.sale_date), jam(s.sold_at)));
  // nama panjang dibungkus per 32 karakter (tidak keluar dari kertas 58mm)
  if (contact) (('Pelanggan: ' + contact.name).match(new RegExp(`.{1,${W}}`, 'g')) || []).forEach((t) => out.push(t));
  out.push('-'.repeat(W));
  for (const l of lines) {
    out.push(...printLines(l.name, W)); out.push(pad(`  ${angka(l.qty)} ${l.unit} x ${n0(l.price)}`, n0(l.line_total)));
    // nomor seri & garansi toko (barang elektronik/specialty)
    if (l.serials?.length) (('  SN: ' + l.serials.join(', ')).match(new RegExp(`.{1,${W}}`, 'g')) || []).forEach((t) => out.push(t));
    if (l.warranty_until) out.push('  Garansi s/d ' + tgl(l.warranty_until));
  }
  out.push('-'.repeat(W));
  if (Number(s.discount) > 0) {
    out.push(pad('Subtotal', n0(s.subtotal)));
    const pro = Number(s.promo_discount || 0);
    (s.promos || []).forEach((x) => out.push(pad(('Promo ' + x.name).slice(0, 22), '-' + n0(x.amount))));
    if (Number(s.discount) - pro > 0) out.push(pad('Diskon', '-' + n0(Number(s.discount) - pro)));
  }
  out.push(pad('TOTAL', n0(s.total)));
  if (Number(s.tax_amount) > 0) out.push(pad(`Termasuk PPN ${angka(Number(s.tax_rate))}%`, n0(s.tax_amount)));
  if (s.pay_method === 'campuran') {
    // bayar campuran: satu baris per cara bayar; uang tunai yang diterima & kembalian dari bagian tunai
    for (const [k, v] of Object.entries(s.pay_split || {})) if (Number(v) > 0) out.push(pad(PAY[k] || k, n0(v)));
    const tunai = Number(s.pay_split?.tunai || 0);
    if (tunai > 0 && Number(s.paid_amount) > tunai) { out.push(pad('Uang tunai', n0(s.paid_amount))); out.push(pad('Kembali', n0(s.paid_amount - tunai))); }
  } else {
    out.push(pad(PAY[s.pay_method] || s.pay_method || 'Pembayaran', s.pay_method === 'tunai' ? n0(s.paid_amount) : n0(s.total)));
    if (s.pay_method === 'tunai' && Number(s.paid_amount) > Number(s.total)) out.push(pad('Kembali', n0(s.paid_amount - s.total)));
  }
  (s.credit_notes || []).forEach((n) => out.push(pad('  ' + n.number, '-' + n0(n.amount))));
  if ((s.pay_method === 'kasbon' || Number(s.pay_split?.kasbon) > 0) && s.due_date) out.push('Janji bayar: ' + tgl(s.due_date));
  if (s.note?.trim()) out.push(...printLines('Catatan: ' + s.note.trim(), W));
  if (s.status === 'batal') out.push('', center('*** DIBATALKAN ***'));
  out.push('-'.repeat(W));
  const foot = printLines(kos.receipt_footer || 'Terima kasih', W);
  for (const t of foot) out.push(center(t.trim()));
  return out.join('\n');
}


// Contoh struk untuk pratinjau di Pengaturan (data contoh, bukan transaksi)
export function strukSample(kos) {
  const now = new Date().toISOString();
  return strukText(kos, { number: 'CONTOH-001', sale_date: now.slice(0, 10), sold_at: now, subtotal: 15000, discount: 0, total: 15000, pay_method: 'tunai', paid_amount: 20000, status: 'selesai' },
    [{ name: 'Gula pasir', qty: 1, unit: 'kg', price: 15000, line_total: 15000 }], null);
}
