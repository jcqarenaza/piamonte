'use client'

export function OfflineBanner({ pendientes = 0 }: { pendientes?: number }) {
  return (
    <div style={{
      background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
      padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, color: '#92400e', fontWeight: 600
    }}>
      <span>🔌</span>
      <span>Sin conexión — viendo datos guardados localmente.</span>
      {pendientes > 0 && (
        <span style={{ marginLeft: 'auto', background: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12 }}>
          {pendientes} {pendientes === 1 ? 'cambio' : 'cambios'} pendiente{pendientes === 1 ? '' : 's'} de sincronizar
        </span>
      )}
    </div>
  )
}

export function SyncingBanner({ count }: { count: number }) {
  return (
    <div style={{
      background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 10,
      padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, color: '#1e40af', fontWeight: 600
    }}>
      <span>🔄</span>
      <span>Sincronizando {count} cambio{count === 1 ? '' : 's'} guardado{count === 1 ? '' : 's'} sin conexión…</span>
    </div>
  )
}
