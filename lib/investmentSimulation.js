function presentValue(flows, monthlyRate) {
  return flows.reduce((total, amount, month) => total + amount / (1 + monthlyRate) ** month, 0);
}

function annualIrr(flows) {
  const signs = flows.filter((value) => value !== 0).map(Math.sign);
  if (signs.filter((sign, index) => index > 0 && sign !== signs[index - 1]).length !== 1) return null;
  let low = -0.9999;
  let high = 1;
  while (high < 1e6 && presentValue(flows, high) > 0) high *= 2;
  if (presentValue(flows, low) < 0 || presentValue(flows, high) > 0) return null;
  for (let step = 0; step < 100; step++) {
    const midpoint = (low + high) / 2;
    if (presentValue(flows, midpoint) > 0) low = midpoint;
    else high = midpoint;
  }
  return ((1 + (low + high) / 2) ** 12 - 1) * 100;
}

export function simulateInvestment({ capital, revenue, cost, months, annualDiscount, residual }) {
  if (![capital, revenue, cost, months, annualDiscount, residual].every(Number.isFinite) ||
      capital <= 0 || revenue < 0 || cost < 0 || residual < 0 || annualDiscount < 0 ||
      !Number.isInteger(months) || months < 1 || months > 60) {
    throw new Error('Isi modal positif, arus kas nonnegatif, dan durasi 1–60 bulan.');
  }
  const recurring = revenue - cost;
  const flows = [-capital, ...Array.from({ length: months }, (_, index) => recurring + (index === months - 1 ? residual : 0))];
  const monthlyDiscount = (1 + annualDiscount / 100) ** (1 / 12) - 1;
  let cumulative = 0;
  const series = flows.map((flow, month) => ({ month, flow, cumulative: cumulative += flow }));
  const payback = series.find((row) => row.month > 0 && row.cumulative >= 0)?.month ?? null;
  const net = series.at(-1).cumulative;
  return { net, roi: net / capital * 100, npv: presentValue(flows, monthlyDiscount),
    irr: annualIrr(flows), payback, series };
}
