export function waitMinutes(receivedAt, now) {
  const received = receivedAt ? Date.parse(receivedAt) : NaN;
  return Number.isFinite(received) ? Math.max(0, Math.floor((now - received) / 60_000)) : null;
}

export function orderChannel(order) {
  if (order.deliver) return 'antar';
  return order.dine === 'tempat' ? 'meja' : 'bungkus';
}

export function kitchenBoard(board, now, channel) {
  const { orders, stages } = board;
  const active = orders.filter((order) => ['diterima', 'proses', 'siap'].includes(order.status));
  const filtered = active.filter((order) => channel === 'semua' || orderChannel(order) === channel)
    .sort((a, b) => (Date.parse(a.received_at) || Infinity) - (Date.parse(b.received_at) || Infinity));
  const currentStages = new Set(stages.map((stage) => stage.id));
  const columns = [
    { id: 'baru', name: 'Baru masuk', next: stages[0]?.name || 'Siap', orders: filtered.filter((order) => order.status === 'diterima') },
    ...stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      next: stages[index + 1]?.name || 'Siap',
      orders: filtered.filter((order) => order.status === 'proses' && order.stage_id === stage.id),
    })),
    { id: 'proses', name: 'Tahap sebelumnya', next: 'Tahap berikutnya', orders: filtered.filter((order) => order.status === 'proses' && !currentStages.has(order.stage_id)) },
    { id: 'siap', name: 'Siap diserahkan', orders: filtered.filter((order) => order.status === 'siap') },
  ];
  const inKitchen = active.filter((order) => order.status !== 'siap');
  return {
    columns: columns.filter((column) => column.id !== 'proses' || column.orders.length),
    inKitchen: inKitchen.length,
    longWait: inKitchen.filter((order) => waitMinutes(order.received_at, now) > 30).length,
    ready: active.length - inKitchen.length,
    requests: orders.filter((order) => order.status === 'permintaan').length,
  };
}
