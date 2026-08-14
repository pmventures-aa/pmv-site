/* HQ shell service worker — caches static assets only.
   Never caches /api responses (authenticated). Same secure. host. */
const CACHE = 'pmv-hq-shell-v1'
const PRECACHE = [
  '/manifest-hq.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/logo-crest.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  // Network-first for navigations; cache-first for hashed static assets.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/hq/') || caches.match(event.request)),
    )
    return
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit
        return fetch(event.request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, copy))
          return res
        })
      }),
    )
  }
})
