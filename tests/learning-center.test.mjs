import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.js', import.meta.url).href : specifier;
    return nextResolve(resolved, context);
  },
});

const { helpFor, knowledgeFor, learningTrack, quizFor, simulationTotals } = await import('../lib/learning.js');
const { pathAllowed } = await import('../lib/business.js');
const laundry = { business_type: 'jasa', template_code: 'laundry', modules: [] };

test('uses category-specific examples, with related modules limited to active and authorized paths', () => {
  const owner = learningTrack(laundry);
  assert.equal(owner.subject, 'Pesanan laundry');
  assert.match(owner.items[0][0], /Laundry/);
  assert.ok(!owner.related.some(({ href }) => ['/barang', '/kontak'].includes(href)));
  assert.ok(learningTrack({ ...laundry, template_code: 'kuliner' }).related.some(({ href }) => href === '/dapur'));
  const operator = { ...laundry, my_role: 'operator' };
  const track = learningTrack(operator);
  assert.equal(track.canPractice, false);
  assert.ok(track.related.every(({ href }) => pathAllowed(operator, href)));
  assert.equal(quizFor(track).length, 3);
  assert.equal(learningTrack({ business_type: 'kustom', modules: [] }).canPractice, false);
  assert.equal(learningTrack({ ...laundry, setup_status: 'draft' }).canPractice, false);
  assert.equal(learningTrack({ ...laundry, closed_at: '2026-01-01' }).canPractice, false);
});

test('knowledge lookup only returns allowed modules and always allows learning in a draft', () => {
  const cashier = { business_type: 'retail', my_role: 'kasir', modules: [] };
  assert.ok(knowledgeFor(cashier, '').every(({ href }) => pathAllowed(cashier, href)));
  assert.ok(knowledgeFor(cashier, 'simulasi').some(({ id }) => id === 'learning-center'));
  assert.ok(pathAllowed({ ...cashier, setup_status: 'draft' }, '/learning-center'));
  assert.equal(helpFor('/learning-center').step, 147);
});

test('checks partial payment and calculates outstanding amounts without mutating demo fixtures', () => {
  const items = learningTrack(laundry).items;
  assert.deepEqual(simulationTotals(items, { 0: 2, 1: 1 }, 'sebagian', '50000'), { total: 81000, paid: 50000, balance: 31000, valid: true });
  assert.equal(simulationTotals(items, { 0: 2, 1: 1 }, 'sebagian', '81000').valid, false);
  assert.equal(simulationTotals(items, { 0: 2, 1: 1 }, 'sebagian', '1.5').valid, false);
  assert.equal(simulationTotals(items, {}, 'lunas', '').valid, false);
  assert.equal(simulationTotals(items, { 0: 1 }, 'belum', '50000').balance, 24500);
  assert.deepEqual(learningTrack(laundry).items, [['Laundry Reguler / kg', 24500], ['Laundry Express / kg', 32000]]);
});
