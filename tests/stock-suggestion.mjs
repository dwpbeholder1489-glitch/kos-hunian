import assert from 'node:assert/strict';
import { recommendStock, suggestedQuantity, readQuantity, readPrice } from '../lib/stockSuggestion.mjs';

const dates = { today: '2026-11-28', from: '2026-10-29', days: 30 };
const base = {
  created: '2025-01-01', stock: 30, reserved: 0, held: 0, min_stock: 0, max_stock: null,
  sold: 0, selling_days: 0, sold_90: 0, selling_days_90: 0, sold_season: 0, selling_days_season: 0,
  units: [{ name: 'dus', factor: 6, moq: 2 }], lead: null, inbound: [],
};
const forStock = (change) => recommendStock({ ...base, ...change }, dates);
const daily = { sold: 30, selling_days: 6, sold_90: 90, selling_days_90: 15, lead: 4 };
const po = (date, qty = 10) => ({ date, qty });

const minimum = forStock({ stock: 2, min_stock: 6 });
assert.equal(minimum.reason, 'minimum');
assert.equal(minimum.priority, 'order');
assert.equal(minimum.confidence, 'Cukup');
assert.equal(suggestedQuantity(minimum, minimum.units[0]), 2);
assert.equal(forStock({ stock: 5, reserved: 7, held: 1 }).reason, 'customer');
assert.equal(forStock({}).reason, 'history');
const purchases = forStock({ stock: 2, lead: 4, replenishments: [
  { date: '2026-11-25', qty: 12 }, { date: '2026-11-15', qty: 12 },
] });
assert.equal(purchases.demand.source, 'purchase');
assert.equal(purchases.priority, 'order');
assert.equal(purchases.confidence, 'Cukup');
assert.equal(forStock({ ...daily, stock: 3, lead: null }).reason, 'lead');

const fallback = forStock({ ...daily, sold: 0, selling_days: 0, stock: 3 });
assert.equal(fallback.demand.source, 'recent');
assert.equal(fallback.rate, 1);
assert.equal(fallback.priority, 'order');
assert.equal(fallback.confidence, 'Cukup');

const seasonal = forStock({ ...daily, sold_season: 90, selling_days_season: 6, stock: 10 });
assert.equal(seasonal.rate, 3);
assert.equal(seasonal.seasonal, true);
assert.equal(seasonal.priority, 'order');

assert.equal(forStock({ ...daily, stock: 4 }).priority, 'order');
assert.equal(forStock({ ...daily, stock: 3, inbound: [po('2026-11-30')] }).priority, 'safe');
const tooLate = forStock({ ...daily, stock: 3, inbound: [po('2026-12-02', 15)] });
assert.equal(tooLate.priority, 'order');
assert.equal(tooLate.reason, 'expedite');
assert.equal(tooLate.needed, 0);
assert.equal(forStock({ ...daily, stock: 3, inbound: [po(null)] }).reason, 'eta');
assert.equal(forStock({ ...daily, stock: 3, inbound: [po('2026-11-27')] }).reason, 'eta');
assert.equal(forStock({ ...daily, stock: 8 }).priority, 'scheduled');
assert.equal(forStock({ ...daily, stock: 8, inbound: [po('2026-12-03', 9)] }).priority, 'safe');
assert.equal(forStock({ ...daily, stock: 3, max_stock: 8 }).reason, 'capacity');
assert.equal(readQuantity('2,125'), 2.125);
assert.equal(readQuantity('2,1259'), null);
assert.equal(readPrice('1250,25'), 1250.25);
assert.equal(readPrice(''), null);
console.log('Saran belanja: sinyal alternatif, musim, ETA, satuan, dan batas stok lulus.');
