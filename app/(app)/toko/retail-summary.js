import { addMonthsYm, monthEnd, tgl, tglShort } from '../../../lib/format.js';

export const RETAIL_GROUPS = [
  ['Performa penjualan', ['omzet', 'bulan', 'trx', 'keranjang', 'pelanggan', 'retur']],
  ['Profitabilitas', ['laba', 'margin']],
  ['Persediaan', ['nilai_stok', 'produk', 'menipis', 'modal', 'diam']],
  ['Kesehatan bisnis', ['piutang', 'piutang_lewat']],
];

export function moveDay(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function retailComparison(period, range) {
  if (period !== 'bulan') return {
    currentTo: range.to, from: moveDay(range.from, -range.days), to: moveDay(range.from, -1),
    label: period === 'hari' ? 'kemarin' : '7 hari sebelumnya',
  };
  const previous = addMonthsYm(range.from.slice(0, 7), -1);
  const sameDays = Math.min(range.days, Number(monthEnd(previous).slice(8, 10)));
  const day = String(sameDays).padStart(2, '0');
  return {
    currentTo: range.from.slice(0, 8) + day, from: previous + '-01', to: previous + '-' + day,
    label: `tgl 1–${sameDays} bulan lalu`,
    partialLabel: sameDays === range.days ? undefined : `Perubahan memakai tanggal 1–${sameDays} pada kedua bulan.`,
  };
}

export const num = (value) => Number(value) || 0;
export const retailMetrics = (report) => report && {
  omzet: num(report.omzet), trx: num(report.trx), laba: num(report.omzet) - num(report.hpp), retur: num(report.retur),
};

export function comparableMetrics(report, actualEnd, currentTo) {
  if (!report) return null;
  if (actualEnd === currentTo) return retailMetrics(report);
  return (report.harian || []).filter((row) => row.d <= currentTo).reduce((sum, row) => ({
    omzet: sum.omzet + num(row.omzet), trx: sum.trx + num(row.trx), laba: sum.laba + num(row.laba),
  }), { omzet: 0, trx: 0, laba: 0 });
}

export function retailReportLink({ from, to }, anchor) {
  return '/laporan-toko?dari=' + from + '&sampai=' + to + (anchor ? '#' + anchor : '');
}

export function retailTrendDays(to, rows, expenses) {
  const sales = new Map(rows.map((row) => [row.d, row]));
  return Array.from({ length: 30 }, (_, i) => {
    const date = moveDay(to, i - 29);
    const row = sales.get(date);
    return { date, label: tgl(date), short: tglShort(date), omzet: num(row?.omzet), laba: num(row?.laba), trx: num(row?.trx), biaya: num(expenses?.get(date)) / 100 };
  });
}
