import { copyFile, mkdir } from 'node:fs/promises';

const assets = new URL('../public/ocr-v6/', import.meta.url);
const modules = new URL('../node_modules/', import.meta.url);
const files = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'worker.min.js.LICENSE.txt': 'tesseract.js/dist/worker.min.js.LICENSE.txt',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'LICENSE': 'tesseract.js-core/LICENSE',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

await mkdir(assets, { recursive: true });
await Promise.all(Object.entries(files).map(([name, source]) => copyFile(new URL(source, modules), new URL(name, assets))));
