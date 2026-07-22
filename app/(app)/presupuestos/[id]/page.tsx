import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PresupuestoPublicoPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  // Buscar el presupuesto
  const { data: p } = await supabase
    .from('presupuestos')
    .select('id, cliente, total, vencimiento, created_at')
    .eq('id', params.id)
    .maybeSingle()

  if (!p) {
    return (
      <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '60px 20px' }}>
        <h2 style={{ color: '#6b7280' }}>Presupuesto no encontrado</h2>
        <p style={{ color: '#9ca3af' }}>El link puede haber expirado o ser inválido.</p>
      </div>
    )
  }

  // Verificar vencimiento
  const venc = new Date(p.vencimiento + 'T23:59:59')
  const vencido = venc < new Date()

  // Generar signed URL del PDF en Storage
  const { data: signed } = await supabase.storage
    .from('presupuestos')
    .createSignedUrl(`presupuesto-${p.id}.pdf`, 60) // 60 segundos para redirigir

  if (signed?.signedUrl && !vencido) {
    redirect(signed.signedUrl)
  }

  // Si está vencido o no hay PDF
  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '60px 20px', maxWidth: 400, margin: '0 auto' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
      <h1 style={{ color: '#111827', fontSize: 22, marginBottom: 8 }}>Presupuesto El Piamonte</h1>
      {p.cliente && <p style={{ color: '#6b7280', marginBottom: 4 }}>Para: <strong>{p.cliente}</strong></p>}
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Vencimiento: <strong>{p.vencimiento.split('-').reverse().join('/')}</strong>
      </p>
      {vencido ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ color: '#dc2626', fontWeight: 700, margin: 0 }}>⚠️ Este presupuesto ha vencido</p>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Contactá a El Piamonte para obtener un nuevo presupuesto.</p>
        </div>
      ) : (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ color: '#92400e', fontWeight: 700, margin: 0 }}>El archivo no está disponible</p>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Contactá a El Piamonte para obtener el presupuesto.</p>
        </div>
      )}
      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 32 }}>
        Parabrisas El Piamonte · General Pico, La Pampa
      </p>
    </div>
  )
}
