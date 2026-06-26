const CACHE_NAME = 'paw-trading-v7'; // Bumped cache version to v7 to force browser update
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json'
];

// Install Event - Pre-cache files and force activation
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      self.skipWaiting(); // Force the waiting service worker to become active immediately
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event - Clean up old caches and take control of clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Fetch Event - Network-First for HTML/JS/CSS to ensure instant updates, Cache fallback for offline
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bypass cache completely for API routes (always fetch live data)
  if (url.pathname.includes('/news') || url.pathname.includes('/macro') || url.pathname.includes('/sentiment')) {
    return;
  }

  // Network-First strategy for PWA shell assets
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clone response and update cache with the latest version
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline Fallback: Serve from cache if available
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback for document navigation if offline
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
