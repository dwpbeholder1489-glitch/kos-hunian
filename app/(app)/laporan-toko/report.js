import { addMonthsYm, bulan, monthEnd, tgl, today } from '@/lib/format';

export const N = (value) => Number(value) || 0;
export const round = (value) => Math.round(value * 100) / 100;
export const STOCK_KINDS = ['opname', 'rusak', 'kedaluwarsa', 'koreksi'];
export const labelRange = ({ from, to }) => from === to ? tgl(from) : from.endsWith('-01') && to === monthEnd(from.slice(0, 7)) ? bulan(from.slice(0, 7)) : `${tgl(from)} – ${tgl(to)}`;

export function shiftDay(date, days) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function reportRange(mode, date, custom) {
  if (mode === 'custom') return custom;
  if (mode === 'day') return { from: date, to: date };
  if (mode === 'week') {
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    const from = shiftDay(date, -((weekday + 6) % 7));
    return { from, to: shiftDay(from, 6) };
  }
  if (mode === 'year') return { from: date.slice(0, 4) + '-01-01', to: date.slice(0, 4) + '-12-31' };
  const month = date.slice(0, 7);
  return { from: month + '-01', to: monthEnd(month) };
}

export function previousRange(mode, range) {
  if (mode === 'month' || mode === 'year') return reportRange(mode, addMonthsYm(range.from.slice(0, 7), mode === 'year' ? -12 : -1) + '-01');
  const diff = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1;
  return { from: shiftDay(range.from, -diff), to: shiftDay(range.from, -1) };
}

export function pnl(r) {
  const omzet = N(r.omzet), hpp = N(r.hpp), kotor = round(omzet - hpp);
  const bridge = round(-N(r.biaya) + N(r.selisih_stok) + N(r.pendapatan_lain));
  return { omzet, hpp, kotor, bridge, bersih: round(kotor + bridge), margin: omzet > 0 ? round(kotor * 100 / omzet) : null };
}

export function trendPoints(range, daily, expenses, group) {
  const buckets = new Map();
  const keyFor = (date) => {
    if (group === 'month') return date.slice(0, 7) + '-01';
    if (group === 'week') return reportRange('week', date).from;
    return date;
  };
  const end = range.to < today() ? range.to : today();
  for (let day = range.from; day <= end; day = shiftDay(day, 1)) {
    const key = keyFor(day);
    if (!buckets.has(key)) buckets.set(key, { from: day, to: day, omzet: 0, kotor: 0, hpp: 0, biaya: 0 });
    buckets.get(key).to = day;
  }
  for (const row of daily) {
    const bucket = row.d > end ? null : buckets.get(keyFor(row.d));
    if (!bucket) continue;
    bucket.omzet += N(row.omzet);
    bucket.kotor += N(row.laba);
    bucket.hpp += N(row.omzet) - N(row.laba);
  }
  for (const row of expenses) {
    const bucket = row.date > end ? null : buckets.get(keyFor(row.date));
    if (bucket) bucket.biaya += N(row.amount);
  }
  return Array.from(buckets.values()).map((row) => ({ ...row, omzet: round(row.omzet), kotor: round(row.kotor), hpp: round(row.hpp), biaya: round(row.biaya) }));
}
