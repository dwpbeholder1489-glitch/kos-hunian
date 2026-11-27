import { PAPER, printLines } from './printer-format.mjs';

const defaults = { mode: 'system', url: 'http://127.0.0.1:17658', token: '', id: '', name: '', paper: '58', copies: 1, auto: false };
const key = (kosId) => 'prasara:printer:' + kosId;

export function printerSettings(kosId) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(kosId)));
    return saved ? { ...defaults, ...saved } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function savePrinter(kosId, settings) {
  localStorage.setItem(key(kosId), JSON.stringify(settings));
}

function bridgeUrl(address) {
  const url = new URL(address);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const supported = url.protocol === 'https:' || (loopback && url.protocol === 'http:');
  if (!supported ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Gunakan alamat HTTPS aplikasi penghubung atau HTTP localhost.');
  }
  return url.origin;
}

async function bridge(settings, path, job) {
  const url = bridgeUrl(settings.url);
  const response = await fetch(url + path, {
    method: job ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + settings.token, ...(job && { 'Content-Type': 'application/json' }) },
    body: job ? JSON.stringify(job) : undefined,
    signal: AbortSignal.timeout(18000),
    credentials: 'omit',
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Aplikasi penghubung menolak permintaan.');
  return result;
}

export const discoverPrinters = (settings) => bridge(settings, '/printers');

function systemPrint(text, paper, copies) {
  const width = paper === 'A4' ? 210 : Number(paper);
  const margin = paper === 'A4' ? 12 : 3;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', bottom: 0, right: 0, width: 0, height: 0, border: 0 });
  document.body.appendChild(frame);
  try {
    const win = frame.contentWindow;
    const doc = win.document;
    const style = doc.createElement('style');
    style.textContent = `@page { size: ${paper === 'A4' ? 'A4' : `${width}mm 297mm`}; margin: ${margin}mm }
      body { margin: 0 } pre { font: ${paper === 'A4' ? 11 : 8}pt/1.35 monospace; color: black;
      margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; } pre + pre { break-before: page; }`;
    doc.head.appendChild(style);
    doc.title = 'PRASARA';
    const content = printLines(text, paper === '58' ? 32 : paper === '80' ? 48 : 78).join('\n');
    for (let i = 0; i < copies; i++) {
      const pre = doc.createElement('pre');
      pre.textContent = content;
      doc.body.appendChild(pre);
    }
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

let pending = Promise.resolve();

export function printReceipt(text, settings) {
  const { paper, copies, id, mode } = settings;
  if (!PAPER.includes(paper) || !Number.isInteger(copies) || copies < 1 || copies > 10) {
    throw new Error('Pilih ukuran kertas dan 1–10 salinan.');
  }
  if (mode === 'system') {
    systemPrint(text, paper, copies);
    return Promise.resolve();
  }
  if (!id) throw new Error('Pilih printer default di pengaturan printer.');
  const job = pending.then(() => bridge(settings, '/print', { id, paper, copies, text }));
  pending = job.catch(() => {});
  return job;
}

export function autoPrint(kosId, getText, onError) {
  const settings = printerSettings(kosId);
  if (settings.mode !== 'bridge' || !settings.auto) return;
  Promise.resolve().then(() => getText(settings.paper)).then((text) => printReceipt(text, settings)).catch(onError);
}
