// PRASARA — penyimpan halaman untuk Kasir offline (Tahap 4 Retail).
// Yang disimpan di HP: halaman Kasir & pembuka aplikasi (+ file JS/CSS-nya), ikon, dan huruf.
// Data bisnis TIDAK disimpan di sini (katalog Kasir & antrean ada di IndexedDB lewat lib/offline.js).
// Permintaan ke server data (Supabase) & /api tidak disentuh.
const VER = 'v1';
const STATIC = 'prasara-static-' + VER;
const PAGES = 'prasara-pages-' + VER;
const OFFLINE_PAGES = ['/kasir', '/buka'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(warm().catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('prasara-') && ![STATIC, PAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'warm') e.waitUntil(warm().then(() => e.source && e.source.postMessage({ type: 'warmed' })).catch(() => {}));
});

// Ambil halaman offline terbaru + semua file yang dipakainya, supaya Kasir terbuka tanpa internet
async function warm() {
  const pages = await caches.open(PAGES);
  const stat = await caches.open(STATIC);
  for (const p of OFFLINE_PAGES) {
    const res = await fetch(p, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok || res.redirected) continue;
    const html = await res.clone().text();
    await pages.put(p, res);
    const files = new Set();
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) files.add(m[1].replace(/&amp;/g, '&'));
    for (const f of ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-icon.png', '/icon.png']) files.add(f);
    for (const f of files) {
      if (await stat.match(f)) continue;
      try { const r = await fetch(f); if (r.ok) await stat.put(f, r); } catch {}
    }
  }
  await trim(stat, 600);
}
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) {
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(r, true));
    return;
  }
  if (u.pathname.startsWith('/api/')) return;
  if (u.pathname.startsWith('/_next/static/') || /^\/(icon|apple-icon)[^/]*\.png$|^\/manifest\.webmanifest$/.test(u.pathname)) { e.respondWith(cacheFirst(r)); return; }
  if (r.mode === 'navigate') e.respondWith(page(r, u));
  // selain itu (data halaman Next, gambar unggahan, dll.) langsung ke jaringan
});

async function cacheFirst(r, refresh) {
  const c = await caches.open(STATIC);
  const hit = await c.match(r);
  if (hit) {
    if (refresh) fetch(r).then((x) => x.ok && c.put(r, x)).catch(() => {});
    return hit;
  }
  const res = await fetch(r);
  if (res.ok || res.type === 'opaque') c.put(r, res.clone()).catch(() => {});
  return res;
}

// Halaman: selalu coba jaringan dulu (maks. 8 detik — sinyal lemah); gagal → salinan di HP / halaman "sedang offline"
async function page(r, u) {
  const key = u.pathname.replace(/\/$/, '') || '/';
  const keep = OFFLINE_PAGES.includes(key);
  try {
    const res = await Promise.race([fetch(r), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
    if (keep && res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(key, res.clone())).catch(() => {});
    return res;
  } catch (err) {
    const c = await caches.open(PAGES);
    const hit = keep && (await c.match(key));
    if (hit) return hit;
    return new Response(OFFLINE_HTML(await c.match('/kasir')), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

const OFFLINE_HTML = (hasKasir) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sedang offline · PRASARA</title><style>
body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F7FAF8;color:#14251F;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{max-width:380px;background:#fff;border:1px solid #DCE7E0;border-radius:16px;padding:24px;display:grid;gap:12px}
h1{font-size:20px;margin:0}p{margin:0;color:#64746D;line-height:1.5}a,button{display:block;text-align:center;padding:12px;border-radius:10px;font:600 15px inherit;text-decoration:none;border:1px solid #DCE7E0;background:#fff;color:#14251F}
a.p{background:#15803D;border-color:#15803D;color:#fff}
@media (prefers-color-scheme: dark){body{background:#0B1310;color:#E7F0EA}main{background:#111C18;border-color:#22312B}p{color:#9AABA3}button,a{background:#111C18;color:#E7F0EA;border-color:#22312B}}
</style></head><body><main><h1>Sedang offline</h1>
<p>Halaman ini butuh internet. ${hasKasir ? 'Kasir tetap bisa dipakai — penjualan disimpan di HP dan dikirim otomatis saat internet kembali.' : 'Buka Kasir sekali saat online agar bisa dipakai tanpa internet.'}</p>
${hasKasir ? '<a class="p" href="/kasir">Buka Kasir</a>' : ''}<button onclick="location.reload()">Coba lagi</button></main></body></html>`;
