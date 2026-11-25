import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.js', import.meta.url).href : specifier;
    return nextResolve(resolved, context);
  },
});

const { mainTabOf, fourthTab, setupWorkspacePreview, workspacePreview, groupsFor } = await import('../lib/menu.js');
const { quickFor } = await import('../lib/quick.js');

const retail = { business_type: 'retail', my_role: 'pemilik', modules: [] };

test('active profiles keep the center button and use their own primary actions', () => {
  const profiles = [
    [retail, 'Transaksi', 'Penjualan baru (kasir)'],
    [{ business_type: 'jasa', template_code: 'kuliner' }, 'Pesanan', 'Pesanan baru (kasir)'],
    [{ business_type: 'jasa', template_code: 'laundry' }, 'Pesanan', 'Penerimaan cucian'],
    [{ business_type: 'properti' }, 'Kamar', 'Tambah kamar'],
    [{ business_type: 'kustom', category_code: 'konstruksi', modules: ['u_proyek'] }, 'Proyek', 'Proyek baru'],
  ];
  for (const [business, primary, action] of profiles) {
    const preview = workspacePreview(business);
    assert.equal(preview.bottom.length, 5);
    assert.equal(preview.bottom[1], primary);
    assert.equal(preview.bottom[2], '+');
    assert.ok(preview.quick.includes(action), action);
  }
});

test('hidden menus stay out of automatic bottom navigation but remain discoverable', () => {
  const kos = { ...retail, exp: { nav: { hidden: ['/penjualan', '/laporan-toko'] } } };
  assert.equal(mainTabOf(kos)[0], '/kasir');
  assert.notEqual(fourthTab(kos)?.[0], '/laporan-toko');
  assert.ok(groupsFor(kos, { all: true }).some(([key, , , items]) =>
    key === 'hid' && items.some(([href]) => href === '/penjualan')));
});

test('draft, archived and suspended businesses have no quick actions', () => {
  for (const status of [{ setup_status: 'draft' }, { closed_at: '2026-11-25' }, { suspended_at: '2026-11-25' }]) {
    const kos = { ...retail, ...status };
    assert.equal(workspacePreview(kos).bottom[2], '+');
    assert.deepEqual(quickFor(kos, '/kasir'), []);
  }
});

test('setup preview includes newly approved modules and filters paid or deferred modules', () => {
  const draft = { ...retail, setup_status: 'draft', modules: ['r_belanja'], dna: { models: ['wholesale'] }, ent: { features: [] } };
  const items = [
    { kind: 'modul', status: 'approved', spec: { module: 'r_kontak' } },
    { kind: 'modul', status: 'approved', spec: { module: 'u_penawaran', entitlement: 'grosir' } },
    { kind: 'modul', status: 'paused', spec: { module: 'r_belanja' } },
  ];
  const preview = setupWorkspacePreview(draft, items);
  assert.ok(preview.quick.includes('Tambah pelanggan'));
  assert.ok(!preview.quick.includes('Pembelian / restok'));
  assert.ok(!preview.quick.includes('Pesanan grosir'));

  const pro = { ...draft, ent: { features: ['grosir'] } };
  assert.ok(setupWorkspacePreview(pro, items).quick.includes('Pesanan grosir'));
  assert.ok(!setupWorkspacePreview({ ...pro, my_role: 'gudang' }, items).quick.includes('Pesanan grosir'));
  assert.equal(setupWorkspacePreview({ ...draft, modules: null }, items), null);
});
