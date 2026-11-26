import assert from 'node:assert/strict';
import test from 'node:test';
import { matchProductPhoto, normalizePackagingText } from '../lib/product-photo-match.mjs';

const goreng = { id: 'goreng', name: 'Mie Sedaap Goreng 90 g', brand: 'Mie Sedaap', packaging_aliases: ['Sedaap Mi Goreng Original'] };
const korean = { id: 'korean', name: 'Mie Sedaap Korean Spicy 87 g', brand: 'Mie Sedaap' };
const aqua = { id: 'aqua600', name: 'Aqua Air Mineral 600 mL', brand: 'Aqua' };
const large = { id: 'aqua1500', name: 'Aqua Air Mineral 1,5 Liter', brand: 'Aqua' };

test('packaging redesign and the original name refer to the same product', () => {
  for (const label of ['SED AAP\nMie Sedaap Goreng netto 90g', 'Bungkus baru\nSEDAAP MI GORENG ORIGINAL']) {
    assert.equal(matchProductPhoto(label, [korean, goreng])[0].product.id, goreng.id);
  }
});

test('variant words outrank a shared brand', () => {
  assert.equal(matchProductPhoto('Mie Sedaap KOREAN SPICY 87 GR', [goreng, korean])[0].product.id, korean.id);
});

test('dimensions normalize and distinguish packages', () => {
  assert.equal(normalizePackagingText('1,5 Liter'), '1500ml');
  assert.equal(matchProductPhoto('AQUA air mineral isi 1.5 l', [aqua, large])[0].product.id, large.id);
  assert.equal(matchProductPhoto('AQUA air mineral 600ML', [large, aqua])[0].product.id, aqua.id);
});

test('blank or unrelated photos have no product result', () => {
  assert.deepEqual(matchProductPhoto('Kemasan baru halal', [goreng, korean, aqua, large]), []);
  assert.deepEqual(matchProductPhoto('Aqua air mineral 600 ml', [{ ...aqua, active: false }]), []);
});
