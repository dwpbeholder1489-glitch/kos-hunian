export function shiftDate(date, days) {
  const result = new Date(date + 'T00:00:00Z');
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function cashForecast({ opening, today, receivables, payables, delay = 0, assumption }) {
  const first = shiftDate(today, 1);
  const last = shiftDate(today, 30);
  const items = new Map();
  let missing = 0;
  function schedule(date, value, type, reference) {
    if (!date || value == null || value === '' || !Number.isFinite(Number(value))) { missing++; return; }
    if (date < first || date > last) return;
    if (!items.has(date)) items.set(date, []);
    items.get(date).push({ type, value: Number(value), reference });
  }
  for (const row of receivables) {
    const due = row.due_date && (row.due_date < first ? first : row.due_date);
    schedule(due && shiftDate(due, delay), row.open_amount, 'Piutang', row.number);
  }
  for (const row of payables) {
    const due = row.due_date && (row.due_date < first ? first : row.due_date);
    schedule(due, row.open_amount == null || row.open_amount === '' ? null : -Number(row.open_amount), 'Utang', row.number);
  }
  if (assumption?.amount > 0) schedule(assumption.date, -assumption.amount, 'Asumsi biaya', 'Pengeluaran tambahan');
  let balance = opening;
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDate(first, index);
    const events = items.get(date) || [];
    balance = Math.round((balance + events.reduce((sum, event) => sum + event.value, 0)) * 100) / 100;
    return { date, balance, events };
  });
  const minimum = days.reduce((low, day) => day.balance < low.balance ? day : low, days[0]);
  return { days, minimum, firstShortfall: days.find((day) => day.balance < 0), ending: days.at(-1).balance, missing, shortfall: Math.max(0, -minimum.balance) };
}
