// Harga dan isi keranjang untuk pratinjau. Mesin pesanan menghitung ulang di server.
export function priceAt(unit, quantity) {
  if (unit.pricing === 'tiered') {
    const eligible = (unit.breaks || []).filter((tier) => Number(tier.min_qty) <= quantity);
    const minimum = Math.max(0, ...eligible.map((tier) => Number(tier.min_qty)));
    return Math.min(Number(unit.price), ...eligible.filter((tier) => Number(tier.min_qty) === minimum).map((tier) => Number(tier.price)));
  }
  return (unit.breaks || []).filter((tier) => Number(tier.min_qty) <= quantity)
    .reduce((price, tier) => Math.min(price, Number(tier.price)), Number(unit.price));
}

export const lineKey = (line) => JSON.stringify([line.product_id, line.unit]);

export function cartLines(cart, products) {
  return cart.flatMap((line) => {
    const pr = products.get(line.product_id);
    const u = pr?.units.find((unit) => unit.name === line.unit);
    if (!u || !Number.isFinite(line.qty) || line.qty <= 0) return [];
    const price = priceAt(u, line.qty);
    return [{ ...line, pr, u, price, total: Math.round(price * line.qty * 100) / 100 }];
  });
}

export function updateCart(cart, product_id, unit, qty) {
  const n = Math.min(1000000, Math.max(0, Math.round(Number(qty) * 1000) / 1000 || 0));
  const index = cart.findIndex((line) => line.product_id === product_id && line.unit === unit);
  const line = { product_id, unit, qty: n };
  if (index < 0) return n > 0 ? [...cart, line] : cart;
  return [...cart.slice(0, index), ...(n > 0 ? [line] : []), ...cart.slice(index + 1)];
}

export function orderStatus(order) {
  if (order.status === 'batal') return 'Batal';
  if (order.status === 'selesai' && !order.deliveries.some((delivery) => delivery.status === 'dikirim')) return 'Selesai';
  if (order.deliveries.some((delivery) => delivery.status !== 'gagal') || order.status === 'sebagian') return 'Dikirim';
  return order.status === 'penawaran' ? 'Menunggu' : 'Diproses';
}
