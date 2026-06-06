export const dynamic = 'force-dynamic'
import BuscarClient from '@/components/buscar/BuscarClient'

export default function Page() {
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Buscar</h1>
      <p className="text-p-ink2 text-sm mb-5">Catálogo unificado GAMMA + Sekurit + Malatesta. Tu stock aparece primero con costo de reposición.</p>
      <BuscarClient />
    </div>
  )
}
