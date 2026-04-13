// =========================================================
// SERVICE WORKER — Colis Scanner PWA
// =========================================================

const CACHE_NAME = 'colis-scanner-v1';

// Ressources à pré-cacher au premier lancement
const PRECACHE_URLS = [
  './',
  './index.html',
  './icon.svg',
  './manifest.json'
];

// Ressources externes (CDN) — mises en cache au premier accès
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap'
];

// =========================================================
// INSTALL — pré-cache les fichiers locaux
// =========================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pré-cache des fichiers locaux');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Erreur pré-cache:', err))
  );
});

// =========================================================
// ACTIVATE — nettoie les anciens caches
// =========================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => {
        return Promise.all(
          names
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Suppression ancien cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// =========================================================
// FETCH — stratégie hybride
// =========================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer les requêtes chrome-extension et autres
  if (!url.protocol.startsWith('http')) return;

  // ---- CDN : Cache-first avec fallback réseau ----
  if (CDN_URLS.some(cdn => event.request.url.startsWith(cdn))) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request)
            .then(response => {
              // Mettre en cache la réponse CDN
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, clone);
                });
              }
              return response;
            })
            .catch(() => {
              // Si le réseau échoue et pas de cache, retourner une erreur simple
              return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
            });
        })
    );
    return;
  }

  // ---- Fichiers locaux : Stale-while-revalidate ----
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(networkResponse => {
              if (networkResponse.ok) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached); // Si réseau échoue, utiliser le cache

          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // ---- Autres requêtes : Network-first ----
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
        });
      })
  );
});