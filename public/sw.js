const CACHE_NAME = 'stock-digger-cloudflare-v2';
const URLS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Pre-cache app shell and static assets on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(URLS_TO_PRECACHE);
      })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event handler with a stale-while-revalidate strategy
self.addEventListener('fetch', event => {
  // Ignore API calls and non-GET requests
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      /^\/(api|exa-api|anysearch-api|ollama-api)(\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Check if we received a valid response before caching
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
            console.error("Fetch failed; returning cached response if available.", err);
        });

        // Return cached response immediately if available, and fetch in background
        return cachedResponse || fetchPromise.then(response => response || Response.error());
      });
    })
  );
});