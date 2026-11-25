import assert from 'node:assert/strict';
import test from 'node:test';
import { kitchenBoard, orderChannel, waitMinutes } from '../app/(app)/dapur/kitchen-board.mjs';

const now = Date.parse('2026-11-26T03:00:00Z');
const time = (minutes) => new Date(now - minutes * 60_000).toISOString();

test('kitchen keeps orders in one column, including orders on an inactive stage', () => {
  const board = {
    stages: [{ id: 'cook', name: 'Dimasak' }],
    orders: [
      { id: 'fresh', status: 'diterima', stage_id: 'cook', received_at: time(5) },
      { id: 'older', status: 'diterima', received_at: time(31) },
      { id: 'former', status: 'proses', stage_id: 'removed', received_at: time(34) },
      { id: 'on-stove', status: 'proses', stage_id: 'cook', received_at: time(10) },
      { id: 'ready', status: 'siap', received_at: time(40) },
      { id: 'qr', status: 'permintaan', received_at: time(45) },
      { id: 'done', status: 'selesai', received_at: time(90) },
    ],
  };
  const result = kitchenBoard(board, now, 'semua');
  assert.deepEqual(result.columns.map(({ id, orders }) => [id, orders.map((order) => order.id)]), [
    ['baru', ['older', 'fresh']], ['cook', ['on-stove']], ['proses', ['former']], ['siap', ['ready']],
  ]);
  assert.equal(result.columns[0].next, 'Dimasak');
  assert.equal(result.columns[1].next, 'Siap');
  assert.deepEqual([result.inKitchen, result.longWait, result.ready, result.requests], [4, 2, 1, 1]);
});

test('delivery takes precedence over packaging and filters preserve outlet counts', () => {
  const order = { status: 'diterima', dine: 'bungkus', deliver: true, received_at: time(30) };
  assert.equal(orderChannel(order), 'antar');
  const { columns, inKitchen, longWait } = kitchenBoard({ stages: [], orders: [order] }, now, 'bungkus');
  assert.equal(columns[0].orders.length, 0);
  assert.equal(inKitchen, 1);
  assert.equal(longWait, 0);
  assert.equal(waitMinutes(null, now), null);
  assert.equal(waitMinutes(time(-2), now), 0);
});
