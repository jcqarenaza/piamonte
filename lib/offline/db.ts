// IndexedDB simple para modo offline — turnos y precios.
// No requiere librerías externas, usa la API nativa del browser.

const DB_NAME = 'elpiamonte_offline'
const DB_VERSION = 2
const STORE_TURNOS = 'turnos_cache'
const STORE_TURNOS_PENDIENTES = 'turnos_pendientes'
const STORE_PRECIOS = 'precios_cache'
const STORE_CATALOGO = 'catalogo_completo'
const STORE_META = 'meta'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_TURNOS)) {
        db.createObjectStore(STORE_TURNOS, { keyPath: 'fecha' })
      }
      if (!db.objectStoreNames.contains(STORE_TURNOS_PENDIENTES)) {
        db.createObjectStore(STORE_TURNOS_PENDIENTES, { keyPath: 'local_id' })
      }
      if (!db.objectStoreNames.contains(STORE_PRECIOS)) {
        db.createObjectStore(STORE_PRECIOS, { keyPath: 'query' })
      }
      if (!db.objectStoreNames.contains(STORE_CATALOGO)) {
        db.createObjectStore(STORE_CATALOGO, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => T): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

// ── Turnos: cache de lectura por fecha ──
export async function cacheTurnosDelDia(fecha: string, turnos: any[]) {
  try {
    await withStore(STORE_TURNOS, 'readwrite', store => {
      store.put({ fecha, turnos, cached_at: new Date().toISOString() })
    })
  } catch { /* IndexedDB no disponible, falla silenciosamente */ }
}

export async function getTurnosDelDiaCache(fecha: string): Promise<any[] | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TURNOS, 'readonly')
      const store = tx.objectStore(STORE_TURNOS)
      const req = store.get(fecha)
      req.onsuccess = () => resolve(req.result?.turnos ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

// Precarga automática: guarda los turnos de varios días de una sola pasada (agrupados por fecha),
// para que si se corta la conexión ya estén disponibles varios días hacia adelante, no solo el de hoy.
export async function precargarTurnosRango(turnosPorFecha: Record<string, any[]>) {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TURNOS, 'readwrite')
      const store = tx.objectStore(STORE_TURNOS)
      for (const [fecha, turnos] of Object.entries(turnosPorFecha)) {
        store.put({ fecha, turnos, cached_at: new Date().toISOString() })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await withStore(STORE_META, 'readwrite', store => {
      store.put({ key: 'turnos_precargados_at', value: new Date().toISOString() })
    })
  } catch { /* IndexedDB no disponible, falla silenciosamente */ }
}

export async function getTurnosPrecargaMeta(): Promise<string | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly')
      const store = tx.objectStore(STORE_META)
      const req = store.get('turnos_precargados_at')
      req.onsuccess = () => resolve(req.result?.value ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

// ── Turnos: cola de pendientes de sincronizar (creados/editados offline) ──
export interface TurnoPendiente {
  local_id: string
  accion: 'insert' | 'update' | 'delete'
  turno_id?: string // solo para update/delete
  payload: any
  fecha: string
  created_at: string
}

export async function agregarTurnoPendiente(p: TurnoPendiente) {
  try {
    await withStore(STORE_TURNOS_PENDIENTES, 'readwrite', store => { store.put(p) })
  } catch { /* noop */ }
}

export async function getTurnosPendientes(): Promise<TurnoPendiente[]> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TURNOS_PENDIENTES, 'readonly')
      const store = tx.objectStore(STORE_TURNOS_PENDIENTES)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result ?? [])
      req.onerror = () => resolve([])
    })
  } catch { return [] }
}

export async function quitarTurnoPendiente(local_id: string) {
  try {
    await withStore(STORE_TURNOS_PENDIENTES, 'readwrite', store => { store.delete(local_id) })
  } catch { /* noop */ }
}

// ── Precios: cache de búsquedas ──
export async function cachePreciosBusqueda(query: string, piezas: any[]) {
  try {
    await withStore(STORE_PRECIOS, 'readwrite', store => {
      store.put({ query: query.toLowerCase().trim(), piezas, cached_at: new Date().toISOString() })
    })
  } catch { /* noop */ }
}

export async function getPreciosBusquedaCache(query: string): Promise<any[] | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRECIOS, 'readonly')
      const store = tx.objectStore(STORE_PRECIOS)
      const req = store.get(query.toLowerCase().trim())
      req.onsuccess = () => resolve(req.result?.piezas ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

// ── Catálogo completo: precarga automática para que la búsqueda offline funcione con cualquier término ──
// Guarda TODO el catálogo (no solo lo que se buscó antes), en bloques para no trabar el navegador.
export async function precargarCatalogoCompleto(piezas: any[], fingerprint: string) {
  try {
    const db = await openDB()
    const CHUNK = 500
    for (let i = 0; i < piezas.length; i += CHUNK) {
      const bloque = piezas.slice(i, i + CHUNK)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CATALOGO, 'readwrite')
        const store = tx.objectStore(STORE_CATALOGO)
        for (const p of bloque) store.put(p)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    await withStore(STORE_META, 'readwrite', store => {
      store.put({ key: 'catalogo_actualizado_at', value: new Date().toISOString(), count: piezas.length, fingerprint })
    })
  } catch { /* IndexedDB no disponible, falla silenciosamente */ }
}

export async function getCatalogoMeta(): Promise<{ value: string; count: number; fingerprint?: string } | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly')
      const store = tx.objectStore(STORE_META)
      const req = store.get('catalogo_actualizado_at')
      req.onsuccess = () => resolve(req.result ? { value: req.result.value, count: req.result.count, fingerprint: req.result.fingerprint } : null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

// Búsqueda offline sobre el catálogo completo precargado — mismo criterio que la búsqueda online:
// todas las palabras deben aparecer en la descripción, y se devuelve el más barato por proveedor.
export async function buscarEnCatalogoCompleto(query: string): Promise<any[]> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CATALOGO, 'readonly')
      const store = tx.objectStore(STORE_CATALOGO)
      const req = store.getAll()
      req.onsuccess = () => {
        const all = req.result ?? []
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const filtered = all.filter((p: any) => {
          const desc = (p.descripcion || '').toLowerCase()
          const marca = (p.marca || '').toLowerCase()
          const codigo = (p.codigo || '').toLowerCase()
          return words.every(w => desc.includes(w) || marca.includes(w) || codigo.includes(w))
        })
        // Deduplicar por proveedor+descripcion, quedarse con el más barato — igual que la búsqueda online
        const map = new Map<string, any>()
        for (const p of filtered) {
          const k = `${p.proveedor}|${p.descripcion}`
          if (!map.has(k) || p.costo_neto < map.get(k).costo_neto) map.set(k, p)
        }
        resolve([...map.values()])
      }
      req.onerror = () => resolve([])
    })
  } catch { return [] }
}

