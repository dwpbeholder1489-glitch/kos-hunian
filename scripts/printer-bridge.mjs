import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { createConnection } from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PAPER, printLines, escpos } from '../lib/printer-format.mjs';

const exec = promisify(execFile);
const config = JSON.parse(readFileSync(process.argv[2] || 'printer-bridge.json', 'utf8'));
const { origin, token, host = '127.0.0.1', port = 17658, tls, printers = [] } = config;
if (!origin || new URL(origin).origin !== origin || typeof token !== 'string' || token.length < 32) {
  throw new Error('Isi origin aplikasi dan token acak minimal 32 karakter.');
}
if (!['127.0.0.1', '::1'].includes(host) && !tls) throw new Error('Akses dari perangkat lain memerlukan TLS.');
const configured = new Map();
for (const device of printers) {
  if (!/^[\w.-]{1,80}$/.test(device.id) || configured.has(device.id) || !PAPER.includes(device.paper) ||
      !['lan', 'cups', 'bluetooth'].includes(device.type) ||
      (device.type === 'cups' && !/^[\w.-]{1,127}$/.test(device.queue)) ||
      (device.type === 'bluetooth' && (device.paper === 'A4' || !/^\/dev\/rfcomm\d+$/.test(device.path))) ||
      (device.type === 'lan' && (device.paper === 'A4' || !device.host ||
        !Number.isInteger(device.port ?? 9100) || (device.port ?? 9100) < 1 || (device.port ?? 9100) > 65535))) {
    throw new Error('Konfigurasi printer tidak valid: ' + device.id);
  }
  configured.set(device.id, device);
}

async function detect() {
  let queues = [];
  try {
    const { stdout } = await exec('lpstat', ['-p'], { timeout: 2500, env: { ...process.env, LC_ALL: 'C' } });
    queues = Array.from(stdout.matchAll(/^printer ([\w.-]+) /gm), (match) => match[1]);
  } catch {
    // LAN tetap tersedia saat CUPS tidak terpasang.
  }
  return [
    ...configured.values(),
    ...queues.filter((queue) => !printers.some((device) => device.queue === queue))
      .map((queue) => ({ id: 'cups:' + queue, name: queue, paper: 'A4', type: 'cups', queue })),
  ];
}

async function a4(text) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const cleaned = Array.from(text, (char) => {
    if (/^[\r\n\t]$/.test(char)) return char;
    if (/\p{Cc}/u.test(char)) return '';
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  const lines = printLines(cleaned, 78);
  for (let start = 0; start < lines.length; start += 54) {
    const page = doc.addPage([595.28, 841.89]);
    lines.slice(start, start + 54).forEach((line, row) => {
      page.drawText(line, { x: 38, y: 801 - row * 14, size: 10, font });
    });
  }
  return doc.save();
}

function sendToProcess(command, args, data, failure) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { timeout: 4500, killSignal: 'SIGKILL', stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(failure)));
    child.stdin.on('error', reject);
    child.stdin.end(data);
  });
}

function cups(device, data, copies) {
  const options = device.paper === 'A4' ? ['-o', 'media=A4'] : ['-o', 'raw'];
  return sendToProcess('lp', ['-d', device.queue, '-n', String(copies), ...options, '--', '-'],
    data, 'Antrean CUPS menolak pekerjaan cetak.');
}

function lan(device, data) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: device.host, port: device.port ?? 9100 });
    socket.setTimeout(4500, () => socket.destroy(new Error('Printer LAN tidak merespons.')));
    socket.on('error', reject);
    socket.on('connect', () => socket.end(data, () => {
      resolve();
      socket.destroy();
    }));
  });
}

async function readJob(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 128 * 1024) throw new Error('Pekerjaan cetak terlalu besar.');
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

let printing = false;
async function handle(req, res) {
  function reply(status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  if (req.headers.origin !== origin) return reply(403, { error: 'Origin aplikasi tidak diizinkan.' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    });
    return res.end();
  }
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return reply(401, { error: 'Token aplikasi penghubung tidak cocok.' });
  }
  if (req.method === 'GET' && req.url === '/printers') {
    const devices = await detect();
    return reply(200, devices.map(({ id, name, paper, type }) => ({ id, name: name || id, paper, type })));
  }
  if (req.method !== 'POST' || req.url !== '/print') return reply(404, { error: 'Layanan tidak ditemukan.' });
  let job;
  try { job = await readJob(req); } catch { return reply(400, { error: 'Data cetak tidak valid atau terlalu besar.' }); }
  if (typeof job?.id !== 'string' || !PAPER.includes(job.paper) || typeof job.text !== 'string' || !job.text.trim() ||
      !Number.isInteger(job.copies) || job.copies < 1 || job.copies > 10) {
    return reply(400, { error: 'Data cetak tidak valid.' });
  }
  if (printing) return reply(409, { error: 'Printer sedang memproses pekerjaan lain. Coba cetak ulang.' });
  printing = true;
  try {
    const device = (await detect()).find(({ id }) => job.id === id);
    if (!device || device.paper !== job.paper) return reply(400, { error: 'Printer atau ukuran kertas tidak cocok. Deteksi ulang dan pilih printer.' });
    const data = device.paper === 'A4' ? await a4(job.text) : escpos(job.text, job.paper, device.cut === true);
    if (device.paper === 'A4') {
      await cups(device, data, job.copies);
    } else {
      const copies = Buffer.concat(Array.from({ length: job.copies }, () => data));
      if (device.type === 'lan') await lan(device, copies);
      else if (device.type === 'bluetooth') {
        await sendToProcess('dd', ['of=' + device.path, 'oflag=noctty', 'conv=nocreat,notrunc', 'status=none'], copies, 'Printer Bluetooth tidak merespons.');
      } else await cups(device, copies, 1);
    }
    return reply(200, { accepted: true });
  } catch (error) {
    console.error(error.message);
    return reply(502, { error: 'Hasil cetak belum dapat dipastikan. Periksa printer sebelum mencetak ulang.' });
  } finally {
    printing = false;
  }
}

const server = tls ? createHttpsServer({ key: readFileSync(tls.key), cert: readFileSync(tls.cert) }, handle) : createServer(handle);
server.requestTimeout = 10000;
server.listen(port, host, () => console.log(`PRASARA Printer Bridge · ${host}:${server.address().port}`));
