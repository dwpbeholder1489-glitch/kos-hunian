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
  out.push('-'.repeat(W));
  out.push(pad(s.number, ''), pad(tgl(s.sale_date), jam(s.sold_at)));
  if (contact) out.push('Pelanggan: ' + contact.name);
  out.push('-'.repeat(W));
  for (const l of lines) { out.push(l.name.slice(0, W)); out.push(pad(`  ${angka(l.qty)} ${l.unit} x ${n0(l.price)}`, n0(l.line_total))); }
  out.push('-'.repeat(W));
  if (Number(s.discount) > 0) { out.push(pad('Subtotal', n0(s.subtotal))); out.push(pad('Diskon', '-' + n0(s.discount))); }
  out.push(pad('TOTAL', n0(s.total)));
  out.push(pad(PAY[s.pay_method], s.pay_method === 'tunai' ? n0(s.paid_amount) : n0(s.total)));
  if (s.pay_method === 'tunai' && Number(s.paid_amount) > Number(s.total)) out.push(pad('Kembali', n0(s.paid_amount - s.total)));
  if (s.pay_method === 'kasbon' && s.due_date) out.push('Janji bayar: ' + tgl(s.due_date));
  if (s.status === 'batal') out.push('', center('*** DIBATALKAN ***'));
  out.push('-'.repeat(W), center('Terima kasih'));
  return out.join('\n');
}

