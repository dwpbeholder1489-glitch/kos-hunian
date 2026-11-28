import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investmentDecision, investmentEvidence, plannerGuide } from '../lib/investmentPlanner.js';
import { INITIAL_INVESTMENT, investmentScenarios, savedInvestmentInputs } from '../lib/investmentSimulation.js';

const months = ['2026-08', '2026-09', '2026-10'];
const history = {
  expectedMonths: months,
  intel: { tren: months.map((month) => ({ mulai: month + '-01', transaksi: 10, pendapatan: 1000, hpp: 400, biaya: 150 })),
    posisi: { persediaan: 500 } },
  cash: months.map((month, index) => ({ month, report: { lengkap: true, cocok: true,
    kelompok: [{ kelompok: 'investasi', masuk: 9999, keluar: 0 },
      { kelompok: 'operasi', masuk: 100 + index * 100, keluar: 60 }] } })),
};
const project = { goal: 'growth', share: '25', category: 'retail', asset: '100', setup: '10', openingStock: '20', life: '12' };

test('recommends attributable operating cash with an explicit financing-independent project share', () => {
  const { suggestions, gross, expense, inventory, coverage } = investmentEvidence(history, project);
  assert.equal(coverage, 3);
  assert.equal(suggestions.revenue.value, '50');
  assert.equal(suggestions.cost.value, '15');
  assert.equal(suggestions.change.value, '50');
  assert.equal(suggestions.capital.value, '130');
  assert.equal(suggestions.months.value, '12');
  assert.match(suggestions.revenue.source, /2026-08.*2026-10/);
  assert.equal(gross, 60);
  assert.equal(expense, 150);
  assert.equal(inventory, 500);
});

test('withholds recommendations for missing or unreconciled records and adapts to business goals', () => {
  const missing = { ...history, cash: [history.cash[0], { ...history.cash[1], report: { lengkap: true, cocok: false } }] };
  const result = investmentEvidence(missing, { ...project, asset: '', life: '' });
  assert.equal(result.coverage, 1);
  assert.deepEqual(result.suggestions, {});
  assert.equal(investmentEvidence(history, { ...project, share: '' }).suggestions.revenue, undefined);
  const savings = investmentEvidence(history, { ...project, goal: 'savings', category: 'jasa' }).suggestions;
  assert.equal(savings.capital.value, '110');
  assert.equal(savings.revenue, undefined);
  assert.equal(savings.change, undefined);
  assert.match(plannerGuide('properti', 'capacity').cash, /unit sewa/);
});

test('keeps old saved plans readable and keeps savings constant through direct scenarios', () => {
  const old = { assumptions: { ...INITIAL_INVESTMENT, capital: '100', revenue: '40', cost: '10', months: '4', annualDiscount: '0' } };
  const baseline = investmentScenarios(savedInvestmentInputs(old), 'direct');
  assert.equal(baseline[1].npv, 20);
  assert.equal(baseline[1].roi, 20);
  assert.equal(baseline[1].payback, 4);
  assert.ok(baseline[1].irr > 0);
  assert.equal(investmentDecision(baseline)[0], 'Layak bersyarat');
  const improved = investmentScenarios({ ...savedInvestmentInputs(old), directSavings: '5' }, 'direct');
  assert.deepEqual(improved.map(({ cash }) => cash.savings), [5, 5, 5]);
  assert.equal(investmentDecision(improved)[0], 'Layak berdasarkan asumsi');
});
