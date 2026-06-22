// IndexedDB simple para modo offline — turnos y precios.
// No requiere librerías externas, usa la API nativa del browser.

const DB_NAME = 'elpiamonte_offline'
const DB_VERSION = 1
const STORE_TURNOS = 'turnos_cache'
const STORE_TURNOS_PENDIENTES = 'turnos_pendientes'
const STORE_PRECIOS = 'precios_cache'

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

// Búsqueda flexible en cache: si no hay match exacto, busca por inclusión de palabras
export async function buscarEnCachePrecios(query: string): Promise<any[]> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRECIOS, 'readonly')
      const store = tx.objectStore(STORE_PRECIOS)
      const req = store.getAll()
      req.onsuccess = () => {
        const all = req.result ?? []
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const resultados: any[] = []
        const vistos = new Set<string>()
        for (const entry of all) {
          for (const pieza of (entry.piezas || [])) {
            const desc = (pieza.descripcion || '').toLowerCase()
            const matchTodas = words.every(w => desc.includes(w))
            const key = `${pieza.proveedor}|${pieza.descripcion}`
            if (matchTodas && !vistos.has(key)) {
              vistos.add(key)
              resultados.push(pieza)
            }
          }
        }
        resolve(resultados)
      }
      req.onerror = () => resolve([])
    })
  } catch { return [] }
}
