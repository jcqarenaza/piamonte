export const dynamic = 'force-dynamic'
import OfertasClient from '@/components/ofertas/OfertasClient'

export default function Page() {
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Ofertas</h1>
      <p className="text-p-ink2 text-sm mb-5">Ofertas vigentes de proveedores. Adjuntá la foto de la lista para tenerla a mano.</p>
      <OfertasClient />
    </div>
  )
}
