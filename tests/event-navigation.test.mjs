import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.js', import.meta.url).href : specifier;
    return nextResolve(resolved, context);
  },
});

const { tabsFor, homeOf, typeOf } = await import('../lib/business.js');
const { groupsFor, workspacePreview, mainTabOf } = await import('../lib/menu.js');
const { quickFor } = await import('../lib/quick.js');

// Bisnis event dengan workspace Builder lama aktif (Acara/Klien) — menunya TIDAK boleh muncul (keputusan E1)
// modules tidak diisi = semua modul aktif (sama dengan moduleOn)
const ev = { business_type: 'kustom', category_code: 'event', my_role: 'pemilik',
  bb: { active: true, create: ['acara'], menu: [['acara', 'Acara', 'cal'], ['klien', 'Klien', 'user']] } };

test('event business uses the Event workspace with its 10 menus', () => {
  assert.equal(typeOf(ev).name, 'Event Organizer');
  assert.equal(homeOf(ev), '/event');
  const tabs = tabsFor(ev).map(([h]) => h);
  for (const h of ['/event', '/proyek', '/booking-event', '/kontak', '/jadwal', '/vendor', '/aset', '/kas', '/analisis', '/pengaturan']) assert.ok(tabs.includes(h), h);
  assert.ok(!tabs.some((h) => h.startsWith('/catatan/')), 'menu Builder tidak dipetakan untuk event');
  assert.equal(mainTabOf(ev)[0], '/proyek');
});

test('event sidebar keeps every main menu reachable once', () => {
  const items = groupsFor(ev, { all: true }).flatMap(([, , , it]) => it.map(([h]) => h));
  for (const h of ['/proyek', '/booking-event', '/kontak', '/jadwal', '/vendor', '/aset', '/kas', '/analisis']) assert.equal(items.filter((x) => x === h).length, 1, h);
});

test('event quick actions create events and keep the center button', () => {
  assert.equal(workspacePreview(ev).bottom[2], '+');
  const q = quickFor(ev, '/event');
  assert.ok(q.some((a) => a.id === 'project_new' && /event/i.test(a.label)), JSON.stringify(q.map((a) => a.label)));
  assert.ok(!q.some((a) => String(a.id).startsWith('bb')), 'aksi Builder tidak ditawarkan untuk event');
});

test('non-event custom business keeps Builder menus', () => {
  const k = { ...ev, category_code: 'bengkel' };
  assert.ok(tabsFor(k).some(([h]) => h === '/catatan/acara'));
  assert.ok(!tabsFor(k).some(([h]) => h === '/event'));
});

test('event menu groups do not overwrite other business menus (kos "Booking" group)', () => {
  const kos = { business_type: 'properti', my_role: 'pemilik' };
  const g = groupsFor(kos, { all: true }).find(([, , , items]) => items.some(([h]) => h === '/booking'));
  assert.ok(g, 'kelompok booking kamar ada');
  assert.notEqual(g[1], 'Booking & Pesanan', 'label kos tidak boleh tertimpa label Event');
});
