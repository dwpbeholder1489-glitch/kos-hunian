import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceTotals } from '../lib/propertyTotals.js';

test('partial payment, other billing periods and canceled invoices', () => {
  const rows = [
    { due_date: '2026-11-23', amount: 550000, paid: 275000, outstanding: 275000 },
    { due_date: '2026-10-06', amount: 500000, paid: 400000, outstanding: 100000 },
    { due_date: '2026-11-25', status: 'batal', amount: 90000, paid: 0, outstanding: 90000 },
  ];
  assert.deepEqual(invoiceTotals(rows, '2026-11'), {
    billedMonth: 550000, paidAgainstMonth: 275000, outstanding: 375000,
  });
});
