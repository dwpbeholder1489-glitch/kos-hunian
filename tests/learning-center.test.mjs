import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.js', import.meta.url).href : specifier;
    return nextResolve(resolved, context);
  },
});

const { helpFor, knowledgeFor, learningTrack, quizFor } = await import('../lib/learning.js');
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

const { calculateDemo } = await import('../lib/learningDemo.js');
const { POST } = await import('../app/api/learning/demo/route.js');
const { curriculum, readiness, TRANSACTION_STAGES } = await import('../lib/learningCurriculum.js');

const transaction = { category: 'retail', person: 0, quantities: [0, 2], discount: 0, method: 'sebagian', tendered: 300000 };

test('demo validates partial and cash change without counting change as revenue', () => {
  const partial = calculateDemo(transaction);
  assert.deepEqual([partial.total, partial.received, partial.balance, partial.status], [500000, 300000, 200000, 'Dibayar sebagian']);
  const cash = calculateDemo({ ...transaction, method: 'tunai', tendered: 600000 });
  assert.deepEqual([cash.tendered, cash.received, cash.balance, cash.change], [600000, 500000, 0, 100000]);
  assert.ok(calculateDemo({ ...transaction, discount: 50001 }).error);
  assert.ok(calculateDemo({ ...transaction, tendered: -1 }).error);
  assert.ok(calculateDemo({ ...transaction, quantities: [0, 1.5] }).error);
});

test('demo respects demo catalog variants, tenancy, valid dates and weighted services', () => {
  assert.equal(calculateDemo({ ...transaction, person: 1 }).total, 480000);
  assert.ok(calculateDemo({ ...transaction, category: 'properti', quantities: [0, 1] }).error);
  assert.ok(calculateDemo({ ...transaction, method: 'tempo', tendered: 0, due: '2026-02-29' }).error);
  assert.equal(calculateDemo({ ...transaction, method: 'tempo', tendered: 0, due: '2028-02-29' }).balance, 500000);
  assert.equal(calculateDemo({ ...transaction, category: 'laundry', quantities: [1.25, 0], method: 'transfer', tendered: 30625 }).received, 30625);
});

test('backend route computes only from demo fixtures and respects payload bounds', async () => {
  const request = (body) => new Request('http://localhost/api/learning/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const result = await POST(request(JSON.stringify({ ...transaction, production: true, businessId: 'other-business', price: 1 })));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.demo, true);
  assert.equal(data.total, 500000);
  assert.equal(data.businessId, undefined);
  assert.equal((await POST(request('{'))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ ...transaction, method: 'transfer' })))).status, 422);
  assert.equal((await POST(request(' '.repeat(4097)))).status, 413);
});

test('catalog follows operational permissions, unknown modules and custom objects', () => {
  const retail = { business_type: 'retail', modules: ['r_belanja', 'r_kontak'] };
  assert.ok(curriculum({ ...retail, my_role: 'kasir' }).some(({ href }) => href === '/kasir'));
  assert.ok(!curriculum({ ...retail, my_role: 'kasir' }).some(({ href }) => href === '/kas'));
  assert.ok(curriculum({ ...retail, my_role: 'pengelola', my_areas: ['finance'] }).some(({ href }) => href === '/kas'));
  assert.ok(!curriculum({ ...retail, my_role: 'pengelola', my_areas: ['finance'] }).some(({ href }) => href === '/kasir'));
  assert.ok(curriculum({ ...retail, my_role: 'gudang' }).some(({ href }) => href === '/belanja'));
  assert.ok(!curriculum({ ...retail, modules: null }).some(({ href }) => href === '/belanja'));
  assert.ok(curriculum({ business_type: 'kustom', modules: [], bb: { active: true, menu: [['klien', 'Klien']] } }).some(({ href }) => href === '/catatan/klien'));
  assert.equal(TRANSACTION_STAGES.length, 8);
  assert.equal(readiness([0, 1], true), 'Memahami dasar');
  assert.equal(readiness([0, 1, 2, 3], true), 'Mampu melakukan simulasi');
});

test('retail demo checks available quantity and included tax from the active rate', () => {
  assert.match(calculateDemo({ ...transaction, quantities: [0, 7] }).error, /Stok DEMO/);
  const demo = calculateDemo({ ...transaction, taxRate: 11 });
  assert.equal(demo.total, 500000);
  assert.equal(demo.tax, 49550);
  assert.ok(calculateDemo({ ...transaction, taxRate: 26 }).error);
});
