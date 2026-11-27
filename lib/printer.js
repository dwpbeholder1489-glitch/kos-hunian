import { qrSvg } from './qr.js';
import { PORTAL_TITLE, PORTAL_HINT } from './receipt-image.js';
import { PAPER, printLines } from './printer-format.mjs';

const defaults = { mode: 'system', url: 'http://127.0.0.1:17658', token: '', id: '', name: '', paper: 'auto', copies: 1, auto: false };
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

export function printDocument(title, css, render) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', bottom: 0, right: 0, width: 0, height: 0, border: 0 });
  document.body.appendChild(frame);
  try {
    const win = frame.contentWindow;
    const doc = win.document;
    const style = doc.createElement('style');
    style.textContent = css;
    doc.head.appendChild(style);
    doc.title = title;
    render(doc);
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

function systemPrint(text, paper, copies, portal) {
  const thermal = paper === '58' || paper === '80';
  const columns = paper === '58' ? 32 : paper === 'A4' ? 72 : 48;
  const lines = printLines(text, columns);
  const height = Math.min(297, Math.max(30, Math.ceil(lines.length * 4.1 + 10 + (portal ? 45 : 0))));
  const size = thermal ? `${paper}mm ${height}mm` : paper;
  printDocument('Struk PRASARA', `
    @page { size: ${size}; margin: ${thermal ? '3mm' : paper === 'A4' ? '12mm' : '4%'} }
    body { margin: 0; color: black; container-type: inline-size; }
    .receipt {
      width: max-content; max-width: 100%; margin: 0 auto;
      font: ${paper === '58' ? '7.5pt' : paper === '80' ? '7pt' : paper === 'A4' ? '11pt' : '12pt'}/1.35 ui-monospace, Menlo, Consolas, monospace;
      ${paper === 'auto' ? 'font-size: clamp(5pt, 3.2cqw, 15pt);' : ''}
    }
    .receipt + .receipt { break-before: page; page-break-before: always; }
    .portal { text-align: center; break-inside: avoid; margin: 3mm auto 0; font: 8pt/1.3 sans-serif; }
    .portal svg { display: block; width: 30mm; margin: 1mm auto; }
    .line { white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; min-height: 1.35em; }
  `, (doc) => {
    for (let i = 0; i < copies; i++) {
      const receipt = doc.createElement('section');
      receipt.className = 'receipt';
      for (const line of lines) {
        const row = doc.createElement('div');
        row.className = 'line';
        row.textContent = line;
        receipt.appendChild(row);
      }
      if (portal) {
        const block = doc.createElement('div');
        block.className = 'portal';
        const title = doc.createElement('strong');
        title.textContent = PORTAL_TITLE;
        const code = doc.createElement('div');
        code.innerHTML = qrSvg(portal);
        const hint = doc.createElement('div');
        hint.textContent = PORTAL_HINT;
        block.append(title, code, hint);
        receipt.appendChild(block);
      }
      doc.body.appendChild(receipt);
    }
  });
}

let pending = Promise.resolve();

export function printReceipt(text, settings, portal) {
  const { paper, copies, id, mode } = settings;
  if (!(PAPER.includes(paper) || (mode === 'system' && paper === 'auto')) || !Number.isInteger(copies) || copies < 1 || copies > 10) {
    throw new Error('Pilih ukuran kertas dan 1–10 salinan.');
  }
  if (mode === 'system') {
    systemPrint(text, paper, copies, portal);
    return Promise.resolve();
  }
  if (!id) throw new Error('Pilih printer default di pengaturan printer.');
  const job = pending.then(() => bridge(settings, '/print', { id, paper, copies, text: portal ? text + '\n\n' + PORTAL_TITLE + '\n' + portal : text }));
  pending = job.catch(() => {});
  return job;
}

export function autoPrint(kosId, getText, onError) {
  const settings = printerSettings(kosId);
  if (settings.mode !== 'bridge' || !settings.auto) return;
  Promise.resolve().then(() => getText(settings.paper)).then((text) => printReceipt(text, settings)).catch(onError);
}
