// Fixture latihan. Tidak menerima katalog, ID bisnis, atau data pelanggan. Tarif PPN opsional hanya untuk perhitungan contoh.
const FIXTURES = {
  retail: { items: [['Beras / kg', 25000], ['Paket sembako', 250000]], people: ['Pelanggan eceran DEMO', 'Pelanggan grosir DEMO'], discount: 10, stock: [8, 6], wholesale: [24000, 240000] },
  laundry: { items: [['Reguler / kg', 24500], ['Express / kg', 32000]], people: ['Pelanggan DEMO A', 'Pelanggan DEMO B'], fraction: true, workflow: ['Diterima', 'Dikerjakan', 'Siap diambil', 'Diserahkan'] },
  jasa: { items: [['Servis reguler', 65000], ['Servis tambahan', 35000]], people: ['Pelanggan DEMO A', 'Pelanggan DEMO B'], workflow: ['Diterima', 'Dikerjakan', 'Diserahkan'] },
  kuliner: { items: [['Nasi ayam reguler', 28000], ['Nasi ayam porsi besar', 35000], ['Es teh', 8000]], people: ['Meja DEMO 01', 'Pesanan bungkus DEMO'], workflow: ['Diterima', 'Dapur', 'Disajikan'] },
  properti: { items: [['Unit A01 · Sewa bulanan', 500000], ['Unit B02 · Sewa bulanan', 750000]], people: ['Penghuni Unit A01 DEMO', 'Penghuni Unit B02 DEMO'], billing: true },
  kustom: { items: [['Penerimaan jasa', 150000], ['Penerimaan tambahan', 35000]], people: ['Kontak DEMO A', 'Kontak DEMO B'], cashOnly: true },
};

export function demoFixture(id) {
  return Object.hasOwn(FIXTURES, id) ? FIXTURES[id] : null;
}

export function calculateDemo(input) {
  const { category, person, quantities, discount, method, tendered, due, taxRate = 0 } = input || {};
  const fixture = demoFixture(category);
  const fail = (error) => ({ error });
  if (!fixture || !Number.isInteger(person) || !fixture.people[person] || !Array.isArray(quantities) || quantities.length !== fixture.items.length) return fail('Pilih contoh dan pelanggan yang tersedia.');
  if (quantities.some((qty) => !Number.isFinite(qty) || qty < 0 || qty > 99 || Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-7 || (!fixture.fraction && !Number.isInteger(qty)))) return fail('Periksa jumlah item. Gunakan jumlah yang sesuai dengan satuannya.');
  if (fixture.stock && quantities.some((qty, i) => qty > fixture.stock[i])) return fail('Stok DEMO tidak mencukupi. Kurangi jumlah sesuai stok yang tersedia.');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 25 || (category !== 'retail' && taxRate > 0)) return fail('Tarif PPN tidak berlaku untuk contoh latihan ini.');
  if (fixture.billing && quantities.some((qty, i) => qty !== (i === person ? 1 : 0))) return fail('Pilih tagihan yang sesuai dengan penghuni dan unit.');
  const prices = category === 'retail' && person === 1 ? fixture.wholesale : fixture.items.map(([, price]) => price);
  const lines = fixture.items.map(([name], i) => ({ name, quantity: quantities[i], price: prices[i], subtotal: Math.round(quantities[i] * prices[i]) })).filter((line) => line.quantity > 0);
  const subtotal = lines.reduce((total, line) => total + line.subtotal, 0);
  if (!subtotal) return fail('Tambahkan item atau pilih tagihan yang akan dibayar.');
  if (!Number.isInteger(discount) || discount < 0 || discount > Math.floor(subtotal * (fixture.discount || 0) / 100)) return fail('Diskon melebihi batas contoh latihan.');
  const total = subtotal - discount;
  // Kasir PRASARA memakai harga termasuk PPN. Fixture ini memakai item kena PPN.
  const tax = Math.round(total * taxRate / (100 + taxRate));
  const methods = fixture.cashOnly ? ['tunai', 'transfer'] : ['tunai', 'transfer', 'sebagian', 'tempo'];
  if (!methods.includes(method) || !Number.isSafeInteger(tendered) || tendered < 0 || tendered > 1000000000) return fail('Periksa cara bayar dan nominal yang dimasukkan.');
  if ((method === 'tunai' && tendered < total) || (method === 'transfer' && tendered !== total) || (method === 'sebagian' && !(tendered > 0 && tendered < total)) || (method === 'tempo' && tendered !== 0)) return fail('Nominal pembayaran belum sesuai dengan cara bayar.');
  if (method === 'tempo' && (!/^\d{4}-\d{2}-\d{2}$/.test(due || '') || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due)) return fail('Masukkan tanggal jatuh tempo yang valid.');
  return { demo: true, lines, person: fixture.people[person], subtotal, discount, tax, taxRate, total, method, tendered, received: Math.min(tendered, total), balance: Math.max(0, total - tendered), change: Math.max(0, tendered - total), due: method === 'tempo' ? due : null, status: tendered >= total ? 'Lunas' : tendered === 0 ? 'Belum dibayar' : 'Dibayar sebagian' };
}
