// Service Worker mínimo — solo permite que la app ABRA sin internet.
// Los datos (turnos, precios) se manejan aparte con IndexedDB (ver lib/offline/db.ts).
// No cachea rutas de API ni de Supabase — esas siempre van a la red cuando hay conexión.

const CACHE_NAME = 'elpiamonte-shell-v1'
const SHELL_URLS = ['/', '/turnos', '/precios']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Nunca interceptar llamadas a Supabase ni a APIs — siempre van a la red
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) return
  // Solo manejar GET de navegación de páginas propias
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network-first: si hay conexión, traer fresco y actualizar cache; si falla, usar lo cacheado.
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached ? Promise.race([fetchPromise, Promise.resolve(cached)]) : fetchPromise
    })
  )
})
