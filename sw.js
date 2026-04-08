const CACHE_NAME = 'profittrack-v6';
const INDEX_URL = './index.html';
const OFFLINE_URL = './offline.html';
const ASSETS = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './script.js',
  './manifest.json',
  './image.png'
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Don't skipWaiting automatically — let the app decide via message
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isNavigation = e.request.mode === 'navigate'
    || e.request.destination === 'document'
    || e.request.url.endsWith('/index.html');

  // For navigation requests use a network-first approach with a cached fallback.
  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cachedOffline = await caches.match(OFFLINE_URL);
          if (cachedOffline) return cachedOffline;
          // Fallback finale (nel caso anche la cache fallisca)
          return new Response(
            '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"/><title>Offline - ProfitTrack</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;background:#000;color:#fff;padding:16px;box-sizing:border-box} .card{width:100%;max-width:420px;background:rgba(28,28,30,.92);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:22px 18px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.18)} button{width:100%;border:none;border-radius:14px;padding:14px 16px;background:#0A84FF;color:#fff;font-weight:700;font-size:16px;cursor:pointer}</style></head><body><div class="card"><div style="font-size:44px;margin-bottom:12px">📴</div><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;margin-bottom:8px">Connessione assente</div><div style="font-size:14px;opacity:.85;line-height:1.5;margin-bottom:16px">ProfitTrack non riesce a raggiungere la rete.</div><button onclick="location.reload()">Riprova</button></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Default: cache-first strategy for static assets.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached); // offline fallback
    })
  );
});

// Message: skipWaiting when app sends SKIP_WAITING
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    self.clients.claim();
  }
});
