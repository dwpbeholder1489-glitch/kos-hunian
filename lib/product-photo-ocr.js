async function imageForOcr(file) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Foto tidak dapat dibuka');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readProductPhotoText(file, { signal, onProgress }) {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  signal.throwIfAborted();
  const image = await imageForOcr(file);
  signal.throwIfAborted();

  let worker;
  let closed = false;
  let timer;
  let cancel;
  const failure = new Promise((_, reject) => { cancel = reject; });
  const abort = () => cancel(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => cancel(new Error('Pembacaan foto terlalu lama')), 45000);
  const base = new URL('/ocr-v6/', window.location.origin).href;
  const run = async () => {
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      errorHandler: (error) => cancel(error),
      logger: (progress) => { if (!closed) onProgress?.(progress.status === 'recognizing text' ? 'Membaca tulisan pada kemasan…' : 'Menyiapkan pembaca foto…'); },
    });
    if (closed) {
      await worker.terminate();
      return '';
    }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const result = await worker.recognize(image);
    return result.data.text;
  };
  try {
    return await Promise.race([run(), failure]);
  } finally {
    closed = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    if (worker) await worker.terminate().catch(() => {});
  }
}
