// Service Worker mínimo — solo permite que la app ABRA sin internet.
// Los datos (turnos, precios) se manejan aparte con IndexedDB (ver lib/offline/db.ts).
// No cachea rutas de API ni de Supabase — esas siempre van a la red cuando hay conexión.

const CACHE_NAME = 'elpiamonte-shell-v2'
const SHELL_URLS = ['/', '/turnos', '/precios']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => {}))
      ))
      .catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .catch(() => {})
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Nunca interceptar llamadas a Supabase, APIs, ni nada que no sea GET de navegación propia
  if (url.hostname.includes('supabase.co')) return
  if (url.pathname.startsWith('/api/')) return
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Network-first simple y seguro: intenta la red; si falla, recién ahí busca en cache.
  // Nunca deja la página sin respuesta — si no hay red NI cache, deja pasar el error normal del navegador.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {})
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || fetch(event.request))
      )
  )
})
