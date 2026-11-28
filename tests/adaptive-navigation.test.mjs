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

test('properti: menu Operasional properti/Keuangan, modul inventaris, dan istilah mengikuti jenis properti', () => {
  const kos = { business_type: 'properti', my_role: 'pemilik', modules: ['p_inventaris', 'p_perbaikan', 'p_meteran', 'p_booking', 'p_pengeluaran', 'u_crm', 'u_halaman', 'u_akuntansi', 'u_sdm', 'u_aset', 'u_karyawan'] };
  const { sections } = workspacePreview(kos);
  const titles = sections.map(([t]) => t);
  assert.ok(titles.includes('Operasional properti') && titles.includes('Keuangan'), titles.join());
  const ops = sections.find(([t]) => t === 'Operasional properti')[1];
  assert.ok(ops.includes('Properti & Lokasi'), ops.join());
  assert.ok(ops.includes('Kamar / Unit'), ops.join());
  // modul inventaris dimatikan → menunya hilang (progressive disclosure), kelompok Kamar tetap
  const off = groupsFor({ ...kos, modules: kos.modules.filter((m) => m !== 'p_inventaris') }).flatMap(([, , , items]) => items.map(([h]) => h));
  assert.ok(!off.includes('/inventaris') && off.includes('/kamar'));
  // ruko: Unit/Penyewa; penginapan: Tamu & Reservasi
  const ruko = groupsFor({ ...kos, subcategory_code: 'properti_ruko' }).flatMap(([, , , items]) => items.map(([, l]) => l));
  assert.ok(ruko.includes('Penyewa') && ruko.includes('Unit'), ruko.join());
  const inap = quickFor({ ...kos, subcategory_code: 'hospitality_guesthouse' }).map((a) => a.label);
  assert.ok(inap.includes('Tambah tamu') && inap.includes('Reservasi kamar'), inap.join());
  // karyawan penjaga (area rent) tidak melihat Property Intelligence (finance/settings)
  const penjaga = groupsFor({ ...kos, my_role: 'penjaga' }).flatMap(([, , , items]) => items.map(([h]) => h));
  assert.ok(!penjaga.includes('/properti') && penjaga.includes('/inventaris'));
});
