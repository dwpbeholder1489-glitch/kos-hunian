import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { escpos } from '../lib/printer-format.mjs';

test('ESC/POS strips embedded commands and applies thermal paper width', () => {
  const text = 'A'.repeat(48) + '\n\x1bp Café';
  const narrow = Buffer.from(escpos(text, '58', false)).toString('ascii');
  const wide = Buffer.from(escpos(text, '80', true)).toString('ascii');
  assert.match(narrow, /A{32}\nA{16}\n\?p Cafe/);
  assert.match(wide, /A{48}\n\?p Cafe/);
  assert.ok(wide.endsWith('\x1dV\x00'));
  assert.ok(!narrow.includes('\x1d'));
});

test('bridge detects CUPS destinations and sends allowed thermal and A4 jobs', { timeout: 10000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'prasara-printer-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const received = [];
  const printer = createServer((socket) => {
    socket.on('data', (data) => received.push(data));
    socket.on('end', () => printer.emit('job-received'));
  });
  printer.listen(0, '127.0.0.1');
  await once(printer, 'listening');
  t.after(() => printer.close());

  const origin = 'https://prasara.example';
  const token = 'mock-token-for-printer-bridge-testing';
  const config = join(dir, 'bridge.json');
  const pdfPath = join(dir, 'job.pdf');
  await Promise.all([
    writeFile(join(dir, 'lpstat'), '#!/bin/sh\necho "printer Office is idle"\n', { mode: 0o700 }),
    writeFile(join(dir, 'lp'), '#!/bin/sh\ncat > "$TEST_PRINT_PDF"\n', { mode: 0o700 }),
    writeFile(config, JSON.stringify({
      origin, token, port: 0,
      printers: [{ id: 'thermal', type: 'lan', host: '127.0.0.1', port: printer.address().port, paper: '80' }],
    })),
  ]);
  const bridge = spawn(process.execPath, ['scripts/printer-bridge.mjs', config], {
    env: { ...process.env, PATH: dir + ':' + process.env.PATH, TEST_PRINT_PDF: pdfPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => bridge.kill());
  const [started] = await once(bridge.stdout, 'data');
  const url = 'http://127.0.0.1:' + started.toString().trim().split(':').at(-1);
  const headers = { Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const request = (path, opts = {}) => fetch(url + path, { headers, ...opts });
  assert.equal((await request('/printers', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await request('/printers', { headers: { Origin: origin } })).status, 401);
  const response = await request('/printers');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual((await response.json()).map(({ id }) => id), ['thermal', 'cups:Office']);

  const print = (id, paper, copies) => request('/print', {
    method: 'POST', body: JSON.stringify({ id, paper, copies, text: 'TEST' }),
  });
  assert.equal((await print('thermal', '58', 1)).status, 400);
  const jobReceived = once(printer, 'job-received');
  assert.equal((await print('thermal', '80', 2)).status, 200);
  await jobReceived;
  assert.equal(Buffer.concat(received).toString().match(/TEST/g)?.length, 2);
  assert.equal((await print('cups:Office', 'A4', 1)).status, 200);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.01 && Math.abs(height - 841.89) < 0.01);
});
