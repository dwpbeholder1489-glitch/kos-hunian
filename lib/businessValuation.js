export function valueBusiness({ firstCashFlow, growth, years, discount, terminalGrowth, excessCash, debt }) {
  if (![firstCashFlow, growth, years, discount, terminalGrowth, excessCash, debt].every(Number.isFinite) ||
      firstCashFlow <= 0 || growth <= -100 || terminalGrowth <= -100 || excessCash < 0 || debt < 0 ||
      discount <= 0 || discount - terminalGrowth < 1e-8 || !Number.isInteger(years) || years < 1 || years > 10) {
    throw new Error('Isi arus kas tahun pertama positif, periode 1–10 tahun, dan diskonto lebih tinggi dari pertumbuhan terminal.');
  }
  const pv = (amount, year) => amount / (1 + discount / 100) ** year;
  const annual = Array.from({ length: years }, (_, index) => {
    const year = index + 1;
    const cashFlow = firstCashFlow * (1 + growth / 100) ** index;
    return { year, cashFlow, presentValue: pv(cashFlow, year) };
  });
  const terminal = annual.at(-1).cashFlow * (1 + terminalGrowth / 100) / ((discount - terminalGrowth) / 100);
  const terminalPv = pv(terminal, years);
  const explicitPv = annual.reduce((sum, row) => sum + row.presentValue, 0);
  const enterprise = explicitPv + terminalPv;
  const equity = enterprise + excessCash - debt;
  if (![enterprise, equity].every(Number.isFinite)) throw new Error('Hasil terlalu besar. Periksa kembali asumsi model.');
  return { annual, terminalPv, explicitPv, enterprise, equity };
}

export function valuationSensitivity(assumptions) {
  // The center uses the exact assumptions entered. Offsets are in percentage points.
  return [-2, 0, 2].map((discountOffset) => {
    const discount = assumptions.discount + discountOffset;
    return {
      discount,
      cells: [-1, 0, 1].map((growthOffset) => {
        const terminalGrowth = assumptions.terminalGrowth + growthOffset;
        try {
          return { terminalGrowth, result: valueBusiness({ ...assumptions, discount, terminalGrowth }) };
        } catch {
          return { terminalGrowth, result: null };
        }
      }),
    };
  });
}
