import assert from 'node:assert/strict';
import test from 'node:test';
import { createBarcodeReader, loadFallbackDecoder, openBarcodeCamera, previewBarcodeCamera } from '../lib/barcode-scanner.mjs';

test('camera retries flexible constraints when the preferred camera is unavailable', async () => {
  const requests = [];
  const stream = {};
  const mediaDevices = { async getUserMedia(options) {
    requests.push(options);
    if (requests.length === 1) throw new DOMException('Camera unavailable', 'OverconstrainedError');
    return stream;
  } };
  assert.equal(await openBarcodeCamera(mediaDevices, new AbortController().signal), stream);
  assert.equal(requests[0].video.facingMode.ideal, 'environment');
  assert.deepEqual(requests[1], { video: true, audio: false });
});

test('permission denial is forwarded without another camera prompt', async () => {
  let n = 0;
  const mediaDevices = { async getUserMedia() { n++; throw new DOMException('Denied', 'NotAllowedError'); } };
  await assert.rejects(openBarcodeCamera(mediaDevices, new AbortController().signal), { name: 'NotAllowedError' });
  assert.equal(n, 1);
});

test('a camera stream arriving after the dialog closed has all tracks stopped', async () => {
  const controller = new AbortController();
  let finish;
  let stops = 0;
  const mediaDevices = { getUserMedia: () => new Promise((resolve) => { finish = resolve; }) };
  const pending = openBarcodeCamera(mediaDevices, controller.signal);
  controller.abort();
  finish({ getTracks: () => [{ stop() { stops++; } }] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(stops, 1);
});

test('a preview without camera frames times out', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0, play: async () => {} });
  await assert.rejects(previewBarcodeCamera(video, {}, new AbortController().signal, 5), { name: 'PreviewError' });
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
});

test('fallback handles missing and broken native detector startup', async () => {
  class UnsupportedDetector {
    static async getSupportedFormats() { return ['ean_13']; }
    constructor() { throw new Error('Unsupported on device'); }
  }
  for (const Detector of [undefined, UnsupportedDetector]) {
    const states = [];
    const frame = {};
    const reader = await createBarcodeReader({
      Detector,
      loadFallback: async () => (source) => { assert.equal(source, frame); return '5901234123457'; },
      onFallback: (state) => states.push(state),
    });
    assert.equal(reader.usingNative, false);
    assert.equal(await reader.read(frame), '5901234123457');
    assert.deepEqual(states, ['loading', 'ready']);
  }
});

test('native failure during scan switches once and decodes the current frame', async () => {
  let reads = 0;
  let fallbackStarts = 0;
  class Detector {
    static async getSupportedFormats() { return ['ean_13', 'unsupported_here']; }
    constructor(options) { assert.deepEqual(options, { formats: ['ean_13'] }); }
    async detect() { reads++; if (reads === 1) return []; throw new Error('Failed on frame'); }
  }
  const reader = await createBarcodeReader({ Detector, loadFallback: async () => {
    fallbackStarts++;
    return () => 'TEST-007';
  } });
  assert.equal(reader.usingNative, true);
  assert.equal(await reader.read({}), null);
  assert.equal(await reader.read({}), 'TEST-007');
  assert.equal(reader.usingNative, false);
  assert.equal(await reader.read({}), 'TEST-007');
  assert.equal(fallbackStarts, 1);
});

test('the bundled fallback reads EAN-13 from camera pixels', async () => {
  // EAN-13 for 5901234123457, including start, center, and end guards.
  const bars = '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101';
  const width = 360;
  const height = 150;
  const image = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 20; y < 130; y++) {
    for (let x = 0; x < bars.length; x++) {
      if (bars[x] === '0') continue;
      for (let pixel = 0; pixel < 3; pixel++) {
        const index = (y * width + 38 + x * 3 + pixel) * 4;
        image.fill(0, index, index + 3);
      }
    }
  }
  const documentBefore = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: image }) }) }),
  };
  try {
    const read = await loadFallbackDecoder();
    assert.equal(read({ videoWidth: width, videoHeight: height }), '5901234123457');
  } finally {
    if (documentBefore === undefined) delete globalThis.document;
    else globalThis.document = documentBefore;
  }
});
