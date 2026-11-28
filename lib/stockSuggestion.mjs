export const PERIODS = [7, 14, 30, 90];
export const PRIORITIES = {
  order: 'Perlu Dipesan',
  check: 'Perlu Dicek',
  scheduled: 'Terjadwal',
  safe: 'Stok Cukup',
};

const dayMs = 86_400_000;
export const stockRound = (value) => Math.round(value * 1000) / 1000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);

export function readQuantity(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const number = Number(text);
  return number > 0 && number <= 9_999_999 ? number : null;
}

export function readPrice(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return number <= 999_999_999_999.99 ? number : null;
}

function projection(available, rate, arrivals, horizon, minimum, protectFrom = horizon) {
  let received = 0;
  let breaches = false;
  let lowest = Infinity;
  let highest = -Infinity;
  const balanceAt = (day) => stockRound(available + received - rate * day);
  const scheduled = new Map(arrivals.filter(([day]) => day <= horizon));
  scheduled.set(protectFrom, scheduled.get(protectFrom) || 0);
  scheduled.set(horizon, scheduled.get(horizon) || 0);
  // Saldo sebelum ETA diperiksa agar kiriman terlambat tidak menutupi kekosongan sebelumnya.
  for (const [day, amount] of [...scheduled].sort(([a], [b]) => a - b)) {
    const before = balanceAt(day);
    if (day > 0 && (before < minimum || (rate > 0 && before < 0))) breaches = true;
    if (day > protectFrom) lowest = Math.min(lowest, before);
    received += amount;
    const after = balanceAt(day);
    if (after < minimum) breaches = true;
    if (day >= protectFrom) {
      lowest = Math.min(lowest, after);
      highest = Math.max(highest, after);
    }
  }
  const balance = balanceAt(horizon);
  return { balance, lowest, highest, breaches: breaches || balance < minimum || (rate > 0 && balance <= 0) };
}

export function recommendStock(row, { today, from, days }) {
  const selectedExposure = Math.max(1, Math.min(days, daysBetween(row.created || from, today)));
  const recentExposure = Math.max(1, Math.min(90, daysBetween(row.created || from, today)));
  const available = stockRound(Number(row.stock) - Number(row.reserved) - Number(row.held));
  const restocks = row.replenishments || [];
  const latest = restocks[0];
  const oldest = restocks.at(-1);
  const span = latest && oldest ? daysBetween(oldest.date, latest.date) : 0;
  const historicalQty = span > 0 ? restocks.filter((purchase) => purchase.date < latest.date)
    .reduce((amount, purchase) => amount + Number(purchase.qty), 0) : 0;
  const purchaseDemand = historicalQty > 0 && available <= Number(latest.qty) / 4
    ? { source: 'purchase', amount: historicalQty, days: span } : null;
  const demand = row.selling_days >= 2 ? { source: 'period', amount: row.sold, days: selectedExposure }
    : row.selling_days_90 >= 2 ? { source: 'recent', amount: row.sold_90, days: recentExposure }
    : purchaseDemand || (row.sold_90 > 0 ? { source: 'limited', amount: row.sold_90, days: recentExposure } : null);
  const baselineRate = demand ? demand.amount / demand.days : 0;
  const seasonalRate = row.selling_days_season >= 2 ? row.sold_season / days : 0;
  const rate = Math.max(baselineRate, seasonalRate);
  const seasonal = seasonalRate > baselineRate;
  const minimum = Number(row.min_stock) || 0;
  const expected = new Map();
  let uncertain = 0;
  for (const po of row.inbound) {
    if (!po.date || po.date < today) uncertain += Number(po.qty);
    else {
      const day = daysBetween(today, po.date);
      expected.set(day, (expected.get(day) || 0) + Number(po.qty));
    }
  }
  const arrivals = [...expected].sort(([a], [b]) => a - b);
  const lead = row.lead == null ? null : Number(row.lead);
  const todayBalance = stockRound(available + (expected.get(0) || 0));
  const atLead = projection(available, rate, arrivals, lead ?? 0, minimum);
  const nextWeek = projection(available, rate, arrivals, (lead ?? 0) + 7, minimum, lead ?? 0);
  // Tambahkan satu hari penjualan bila stok tepat nol di ujung proyeksi.
  const shortage = Math.max(0, minimum - nextWeek.lowest, rate > 0 && nextWeek.lowest === 0 && minimum === 0 ? rate : 0);
  const daysLeft = rate > 0 ? Math.max(available, 0) / rate : null;
  const demandReady = demand?.source === 'period' || demand?.source === 'recent' || demand?.source === 'purchase' || seasonal;
  const independentSignal = minimum > 0 || row.reserved > 0;
  const immediate = todayBalance < minimum;
  let priority;
  let reason;
  if (immediate) {
    priority = 'order';
    reason = todayBalance < 0 && row.reserved > 0 ? 'customer' : 'minimum';
  } else if (!demandReady && !independentSignal) {
    priority = 'check';
    reason = 'history';
  } else if (lead == null) {
    priority = 'check';
    reason = 'lead';
  } else if ((atLead.breaches || nextWeek.breaches) && uncertain > 0) {
    priority = 'check';
    reason = 'eta';
  } else if (atLead.breaches) {
    priority = 'order';
    reason = shortage === 0 ? 'expedite' : 'coverage';
  } else if (nextWeek.breaches) {
    priority = 'scheduled';
    reason = 'soon';
  } else {
    priority = 'safe';
    reason = 'safe';
  }

  const capacity = row.max_stock == null ? null : Math.max(0, Number(row.max_stock) - Math.max(0, nextWeek.highest + Number(row.reserved) + Number(row.held) + uncertain));
  const needed = ['order', 'scheduled'].includes(priority) && reason !== 'expedite' ? stockRound(shortage) : 0;
  if (needed > 0 && capacity != null && !row.units.some((unit) =>
    Math.floor(capacity / Number(unit.factor)) >= Math.max(1, Math.ceil(Number(unit.moq) || 0)))) {
    priority = 'check';
    reason = 'capacity';
  }
  const confidence = demandReady && lead != null && uncertain === 0 && selectedExposure >= days && demand?.source === 'period'
    ? 'Kuat' : (independentSignal || demandReady) && priority !== 'check' ? 'Cukup' : 'Terbatas';

  return { ...row, available, rate, demand, seasonal, seasonalRate, uncertain: stockRound(uncertain),
    lead, minimum, priority, reason, confidence, daysLeft, todayBalance, onArrival: atLead.balance, needed, projectedShortage: stockRound(shortage), capacity };
}

export function suggestedQuantity(item, unit) {
  if (!unit || item.needed <= 0 || item.reason === 'capacity') return 0;
  const factor = Number(unit.factor);
  const minimum = Math.ceil(Number(unit.moq) || 0);
  const desired = Math.max(Math.ceil(item.needed / factor), minimum);
  if (item.capacity == null) return desired;
  const maximum = Math.floor(item.capacity / factor);
  return maximum >= minimum ? Math.min(desired, maximum) : 0;
}
