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

export function estimateMonthlyCash({ units, price, unitCost, fixedCost, savings }, factor = 1) {
  if (![units, price, unitCost, fixedCost, savings].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !Number.isFinite(factor) || factor < 0) throw new Error('Isi volume dan biaya dengan angka bulat nonnegatif.');
  const volume = Math.round(units * factor);
  const sales = volume * price;
  const variable = volume * unitCost;
  const revenue = sales + savings;
  const cost = variable + fixedCost;
  if (![revenue, cost].every((value) => Number.isSafeInteger(value) && value <= 1e12)) {
    throw new Error('Total penerimaan atau pengeluaran melampaui Rp1 triliun per bulan.');
  }
  return { volume, sales, savings, variable, fixedCost, revenue, cost, net: revenue - cost };
}

export const INITIAL_INVESTMENT = { capital: '', revenue: '', cost: '', months: '12', annualDiscount: '12', residual: '', change: '20', units: '', price: '', unitCost: '', fixedCost: '', savings: '' };
export const INVESTMENT_DRIVERS = ['units', 'price', 'unitCost', 'fixedCost', 'savings'];

export function savedInvestmentInputs(version) {
  return Object.fromEntries(Object.entries(INITIAL_INVESTMENT).map(([key, value]) => [
    key, typeof version.assumptions?.[key] === 'string' ? version.assumptions[key] : value,
  ]));
}

export function investmentScenarios(inputs, mode) {
  const guided = mode === 'plan';
  const drivers = Object.fromEntries(INVESTMENT_DRIVERS.map((key) => [key, Number(inputs[key])]));
  const moneyKeys = ['capital', 'residual', ...(guided ? INVESTMENT_DRIVERS : ['revenue', 'cost'])];
  const capital = Number(inputs.capital), residual = Number(inputs.residual);
  const months = Number(inputs.months), annualDiscount = Number(inputs.annualDiscount);
  const change = Number(inputs.change) / 100;
  if (moneyKeys.some((key) => !/^\d*$/.test(inputs[key]) || Number(inputs[key]) > 1e12) ||
      !Number.isFinite(change) || change < 0 || change > 1 || annualDiscount > 1000) {
    throw new Error('Masukkan nominal dalam angka bulat hingga Rp1 triliun. Perubahan skenario maksimal 100%.');
  }
  if (guided && !(drivers.units > 0 || drivers.savings > 0)) {
    throw new Error('Isi perkiraan volume penjualan atau penghematan kas bulanan.');
  }
  const variants = [['Lesu', 1 - change], ['Dasar', 1], ['Optimistis', 1 + change]];
  return variants.map(([name, factor]) => {
    const cash = guided ? estimateMonthlyCash(drivers, factor) : {
      revenue: Math.round(Number(inputs.revenue) * factor), cost: Number(inputs.cost),
    };
    return { name, cash, ...simulateInvestment({ capital, revenue: cash.revenue, cost: cash.cost, residual, months, annualDiscount }) };
  });
}
