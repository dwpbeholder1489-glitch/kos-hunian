// Teks struk penjualan (lebar 32 karakter, cocok untuk printer thermal 58mm dan WhatsApp)
import { angka, tgl } from '@/lib/format';
import { PAY, jam } from '@/lib/retail';

const W = 32; // lebar struk dalam karakter (printer thermal 58mm)
const pad = (l, r) => { l = String(l); r = String(r); const n = W - l.length - r.length; return n >= 1 ? l + ' '.repeat(n) + r : l + '\n' + ' '.repeat(Math.max(0, W - r.length)) + r; };
const n0 = (v) => angka(Math.round(Number(v) || 0));

export function strukText(kos, s, lines, contact) {
  const out = [];
  const center = (t) => ' '.repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t;
  out.push(center(kos.name.slice(0, W)));
  if (kos.address) out.push(center(kos.address.slice(0, W)));
  if (kos.contact_phone) out.push(center(('WA ' + kos.contact_phone).slice(0, W)));
  out.push('-'.repeat(W));
  out.push(pad(s.number, ''), pad(tgl(s.sale_date), jam(s.sold_at)));
  if (contact) out.push('Pelanggan: ' + contact.name);
  out.push('-'.repeat(W));
  for (const l of lines) { out.push(l.name.slice(0, W)); out.push(pad(`  ${angka(l.qty)} ${l.unit} x ${n0(l.price)}`, n0(l.line_total))); }
  out.push('-'.repeat(W));
  if (Number(s.discount) > 0) { out.push(pad('Subtotal', n0(s.subtotal))); out.push(pad('Diskon', '-' + n0(s.discount))); }
  out.push(pad('TOTAL', n0(s.total)));
  if (Number(s.tax_amount) > 0) out.push(pad(`Termasuk PPN ${angka(Number(s.tax_rate))}%`, n0(s.tax_amount)));
  if (s.pay_method === 'campuran') {
    // bayar campuran: satu baris per cara bayar; uang tunai yang diterima & kembalian dari bagian tunai
    for (const [k, v] of Object.entries(s.pay_split || {})) if (Number(v) > 0) out.push(pad(PAY[k] || k, n0(v)));
    const tunai = Number(s.pay_split?.tunai || 0);
    if (tunai > 0 && Number(s.paid_amount) > tunai) { out.push(pad('Uang tunai', n0(s.paid_amount))); out.push(pad('Kembali', n0(s.paid_amount - tunai))); }
  } else {
    out.push(pad(PAY[s.pay_method], s.pay_method === 'tunai' ? n0(s.paid_amount) : n0(s.total)));
    if (s.pay_method === 'tunai' && Number(s.paid_amount) > Number(s.total)) out.push(pad('Kembali', n0(s.paid_amount - s.total)));
  }
  if ((s.pay_method === 'kasbon' || Number(s.pay_split?.kasbon) > 0) && s.due_date) out.push('Janji bayar: ' + tgl(s.due_date));
  if (s.status === 'batal') out.push('', center('*** DIBATALKAN ***'));
  out.push('-'.repeat(W));
  const foot = (kos.receipt_footer || 'Terima kasih').split('\n').flatMap((t) => t.match(new RegExp(`.{1,${W}}(\\s|$)`, 'g')) || [t]);
  for (const t of foot) out.push(center(t.trim()));
  return out.join('\n');
}


// Contoh struk untuk pratinjau di Pengaturan (data contoh, bukan transaksi)
export function strukSample(kos) {
  const now = new Date().toISOString();
  return strukText(kos, { number: 'CONTOH-001', sale_date: now.slice(0, 10), sold_at: now, subtotal: 15000, discount: 0, total: 15000, pay_method: 'tunai', paid_amount: 20000, status: 'selesai' },
    [{ name: 'Gula pasir', qty: 1, unit: 'kg', price: 15000, line_total: 15000 }], null);
}
