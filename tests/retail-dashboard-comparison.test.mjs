import assert from 'node:assert/strict';
import test from 'node:test';
import { comparableMetrics, retailComparison } from '../app/(app)/toko/retail-summary.js';

test('retail dashboard compares available dates equally when prior month is shorter', () => {
  const current = { from: '2026-03-01', to: '2026-03-31', days: 31 };
  const prior = retailComparison('bulan', current);
  assert.equal(prior.from, '2026-02-01');
  assert.equal(prior.to, '2026-02-28');
  assert.equal(prior.currentTo, '2026-03-28');
  assert.deepEqual(comparableMetrics({
    omzet: 300, hpp: 125, trx: 4,
    harian: [{ d: '2026-03-28', omzet: 100, laba: 75, trx: 2 }, { d: '2026-03-29', omzet: 200, laba: 100, trx: 2 }],
  }, current.to, prior.currentTo), { omzet: 100, laba: 75, trx: 2 });
});

test('retail dashboard compares a full day and seven days with adjacent equal periods', () => {
  const day = retailComparison('hari', { from: '2026-11-27', to: '2026-11-27', days: 1 });
  assert.equal(day.from, '2026-11-26');
  assert.equal(day.to, '2026-11-26');
  const week = retailComparison('7hari', { from: '2026-11-02', to: '2026-11-08', days: 7 });
  assert.equal(week.from, '2026-10-26');
  assert.equal(week.to, '2026-11-01');
});
