export function investmentActuals({ startMonth, asOf, entries, plan }) {
  const currentMonth = asOf.slice(0, 7);
  const startIndex = Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(5, 7)) - 1;
  const [year, month] = currentMonth.split('-').map(Number);
  const elapsed = year * 12 + month - 1 - startIndex + 1;
  const actual = new Map();
  let amountInvested = 0;
  let operatingCash = 0;
  for (const entry of entries) {
    const key = entry.entry_date.slice(0, 7);
    const amount = Number(entry.amount);
    const row = actual.get(key) ?? { operating: 0, capital: 0, entries: [] };
    row.entries.push(entry);
    if (entry.category === 'capital') { row.capital += amount; amountInvested -= amount; }
    else { row.operating += amount; operatingCash += amount; }
    actual.set(key, row);
  }
  const planByMonth = new Map(plan.series.slice(1).map((point, index) => {
    const position = startIndex + index;
    const key = Math.floor(position / 12) + '-' + String(position % 12 + 1).padStart(2, '0');
    return [key, plan.cash.revenue - plan.cash.cost];
  }));
  const rows = [...new Set([...planByMonth.keys(), ...actual.keys()])].sort().map((month) => {
    const observed = actual.get(month);
    const planned = planByMonth.get(month) ?? null;
    const difference = observed?.entries.some((entry) => entry.category === 'operating') && month < currentMonth && planned != null
      ? observed.operating - planned : null;
    return { month, planned, observed, difference, partial: month === currentMonth };
  });
  let balance = operatingCash - amountInvested;
  const recovered = amountInvested > 0 ? Math.min(amountInvested, Math.max(0, operatingCash)) : null;
  let estimatedPayback = null;
  if (amountInvested > 0 && balance < 0) {
    for (const point of plan.series.slice(Math.max(1, elapsed + 1))) {
      balance += point.flow;
      if (balance >= 0) { estimatedPayback = point.month; break; }
    }
  }
  const comparable = rows.filter((row) => row.difference != null);
  const cumulativeVariance = comparable.length ? comparable.reduce((total, row) => total + row.difference, 0) : null;
  return { rows, amountInvested, operatingCash, recovered, estimatedPayback, cumulativeVariance, comparedMonths: comparable.length };
}
