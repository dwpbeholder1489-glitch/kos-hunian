import { jakartaDate, sisa } from './jasa';
const todayJ = () => jakartaDate(Date.now());
const jam = ts => new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
const ACTIVE = ['permintaan', 'diterima', 'proses', 'siap'];
// tagihan terbuka meja: pesanan aktif, atau sudah diserahkan hari ini tapi belum lunas
const openOf = (orders, t) => orders.filter((o) => o.dine === 'tempat' && o.table_no === String(t) && o.status !== 'batal'
  && (ACTIVE.includes(o.status) || (o.status === 'selesai' && sisa(o) > 0 && jakartaDate(o.received_at) === todayJ())));

export function tableState(d, rs, t) {
  const os = openOf(d.orders, t);
  const now = Date.now();
  const resv = rs.find((r) => r.table_no === String(t) && (r.status === 'datang' || (r.status === 'dipesan' && new Date(r.starts_at).getTime() - now < 3 * 36e5 && new Date(r.starts_at).getTime() + r.minutes * 6e4 > now)));
  const due = os.reduce((a, o) => a + sisa(o), 0);
  if (os.some((o) => o.status === 'siap')) return { os, resv, due, label: 'Siap saji', tone: 'good' };
  if (os.some((o) => ACTIVE.includes(o.status))) return { os, resv, due, label: os.some((o) => o.status === 'permintaan') ? 'QR baru' : 'Terisi', tone: 'gold' };
  if (due > 0) return { os, resv, due, label: 'Belum lunas', tone: 'bad' };
  if (resv) return { os, resv, due, label: resv.status === 'datang' ? 'Tamu reservasi' : `Dipesan ${jam(resv.starts_at)}`, tone: 'info' };
  return { os, resv, due, label: 'Kosong', tone: '' };
}
