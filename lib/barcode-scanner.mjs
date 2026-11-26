const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
const PREFERRED_CAMERA = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
const NATIVE_TIMEOUT_MS = 2000;

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function openBarcodeCamera(mediaDevices, signal, { detailed = false } = {}) {
  if (!mediaDevices?.getUserMedia) throw new DOMException('Camera API unavailable', 'NotSupportedError');
  signal.throwIfAborted();

  let stream;
  try {
    const video = detailed ? { ...PREFERRED_CAMERA, width: { ideal: 1920 }, height: { ideal: 1080 } } : PREFERRED_CAMERA;
    stream = await mediaDevices.getUserMedia({ video, audio: false });
  } catch (error) {
    if (!['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
    signal.throwIfAborted();
    stream = await mediaDevices.getUserMedia({ video: true, audio: false });
  }

  if (signal.aborted) stopCamera(stream);
  signal.throwIfAborted();
  return stream;
}

export function previewBarcodeCamera(video, stream, signal, timeout = 8000) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    video.muted = true;
    video.playsInline = true;
    const hasFrame = () => video.readyState >= 2 && video.videoWidth > 0;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', ready);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const ready = () => {
      if (!hasFrame()) return;
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new DOMException('Camera preview could not start', 'PreviewError'));
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(fail, timeout);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);
    video.addEventListener('error', fail);
    signal.addEventListener('abort', abort, { once: true });
    video.srcObject = stream;
    Promise.resolve().then(() => video.play()).then(ready, fail);
  });
}

async function runNative(action) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native detector timed out')), NATIVE_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function formatsFor(format) {
  if (format === 'linear') return FORMATS.filter((name) => name !== 'qr_code');
  if (format === 'qr') return ['qr_code'];
  return FORMATS;
}

export async function createBarcodeReader({ Detector, loadFallback, onFallback, format }) {
  let native;
  let fallback;
  let loading;

  async function useFallback() {
    if (fallback) return fallback;
    if (loading) return loading;
    onFallback?.('loading');
    loading = loadFallback()
      .then((reader) => {
        fallback = reader;
        native = null;
        onFallback?.('ready');
        return reader;
      })
      .finally(() => { loading = null; });
    return loading;
  }

  if (typeof Detector === 'function') {
    try {
      const supported = Detector.getSupportedFormats ? await runNative(() => Detector.getSupportedFormats()) : FORMATS;
      const formats = formatsFor(format).filter((name) => supported.includes(name));
      if (formats.length) native = new Detector({ formats });
    } catch {
      // Native API can exist but reject the formats or initialization on this device.
    }
  }
  if (!native) await useFallback();

  return {
    get usingNative() { return Boolean(native) && !loading; },
    useFallback,
    async read(video) {
      if (fallback || loading) return (await useFallback())(video);
      try {
        const detector = native;
        const matches = await runNative(() => detector.detect(video));
        if (fallback || loading) return (await useFallback())(video);
        return matches.find((match) => match.rawValue)?.rawValue || null;
      } catch {
        return (await useFallback())(video);
      }
    },
  };
}

export function barcodeFrame(width, height, format, attempt) {
  if (format !== 'linear' || attempt % 4 === 3) return { x: 0, y: 0, width, height };
  const cropWidth = Math.max(1, Math.round(width * (attempt % 4 === 1 ? 0.62 : 0.88)));
  const cropHeight = Math.max(1, Math.round(height * (attempt % 4 === 0 ? 0.32 : 0.52)));
  return { x: Math.round((width - cropWidth) / 2), y: Math.round((height - cropHeight) / 2), width: cropWidth, height: cropHeight };
}

export async function loadFallbackDecoder({ format, photo = false } = {}) {
  const zx = await import('@zxing/library');
  const hints = new Map([
    [zx.DecodeHintType.POSSIBLE_FORMATS, formatsFor(format).map((name) => zx.BarcodeFormat[name.toUpperCase()])],
    [zx.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new zx.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Camera frames are unavailable');

  let attempt = 0;
  function decode(source, frame, inverted, rotate = false) {
    const cap = photo ? 1800 : format === 'linear' ? 1440 : 960;
    const scale = Math.min(1, cap / Math.max(frame.width, frame.height));
    const width = Math.round((rotate ? frame.height : frame.width) * scale);
    const height = Math.round((rotate ? frame.width : frame.height) * scale);
    if (!width || !height) return null;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.save();
    if (rotate) {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    }
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, rotate ? height : width, rotate ? width : height);
    context.restore();
    const rgba = context.getImageData(0, 0, width, height).data;
    const grayscale = new Uint8ClampedArray(width * height);
    for (let pixel = 0, offset = 0; pixel < grayscale.length; pixel++, offset += 4) {
      const luminance = (306 * rgba[offset] + 601 * rgba[offset + 1] + 117 * rgba[offset + 2] + 512) >> 10;
      grayscale[pixel] = inverted ? 255 - luminance : luminance;
    }
    const bitmap = new zx.BinaryBitmap(new zx.HybridBinarizer(new zx.RGBLuminanceSource(grayscale, width, height)));
    try {
      return reader.decodeWithState(bitmap).getText();
    } catch (error) {
      if (error instanceof zx.NotFoundException || error instanceof zx.ChecksumException || error instanceof zx.FormatException) return null;
      throw error;
    }
  }

  return (source) => {
    const width = source.videoWidth ?? source.naturalWidth;
    const height = source.videoHeight ?? source.naturalHeight;
    if (!width || !height) return null;
    if (!photo) {
      const index = attempt++;
      return decode(source, barcodeFrame(width, height, format, index), index % 8 >= 4);
    }
    const full = { x: 0, y: 0, width, height };
    for (const frame of [barcodeFrame(width, height, format, 0), full]) {
      for (const rotate of [false, true]) {
        for (const inverted of [false, true]) {
          const code = decode(source, frame, inverted, rotate);
          if (code) return code;
        }
      }
    }
    return null;
  };
}

export async function readBarcodePhoto(file, format) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = url;
    const [decode] = await Promise.all([loadFallbackDecoder({ format, photo: true }), loaded]);
    return decode(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}
