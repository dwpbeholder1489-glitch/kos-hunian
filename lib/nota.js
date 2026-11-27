import { rp, angka } from '@/lib/format';
import { waktu, hari, stageLabel, sisa } from '@/lib/jasa';

export function notaText(kos, o, paper = '58') {
  const W = paper === '80' ? 48 : paper === 'A4' ? 72 : 32;
  const lr = (l, r) => { l = String(l); r = String(r); return l.length + r.length + 1 > W ? l + '\n' + ' '.repeat(Math.max(0, W - r.length)) + r : l + ' '.repeat(W - l.length - r.length) + r; };
  const center = (t) => ' '.repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t;
  return [
    center(kos.name.slice(0, W)), kos.address ? center(kos.address.slice(0, W)) : null, kos.contact_phone ? center('WA ' + kos.contact_phone) : null, '-'.repeat(W),
    lr('No', o.number), lr('Terima', waktu(o.received_at)), lr('Janji', hari(o.due_at)), lr('Pelanggan', (o.customer_name || '').slice(0, W - 12)), '-'.repeat(W),
    ...(o.lines || []).flatMap((l) => [l.name, lr(`  ${angka(l.charge_qty)} ${l.unit} x ${rp(l.price)}`, rp(l.line_total)), l.note ? `  (${l.note})` : null]),
    '-'.repeat(W),
    Number(o.discount) > 0 ? lr('Diskon', '-' + rp(o.discount)) : null,
    Number(o.delivery_fee) > 0 ? lr('Antar-jemput', rp(o.delivery_fee)) : null,
    lr('TOTAL', rp(o.total)), lr('Dibayar', rp(o.paid || 0)), lr(sisa(o) > 0 ? 'SISA' : 'Status', sisa(o) > 0 ? rp(sisa(o)) : 'LUNAS'),
    '-'.repeat(W), `Status: ${stageLabel(o)}`, o.deliver ? `Diantar: ${o.address || '-'}` : 'Diambil di tempat', kos.receipt_footer ? '' : null, kos.receipt_footer || null,
    center('Simpan nota ini untuk pengambilan'),
  ].filter((x) => x != null).join('\n');
}
