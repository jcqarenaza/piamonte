export const dynamic = 'force-dynamic'
import VehiculoClient from '@/components/vehiculo/VehiculoClient'

export default function Page() {
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Vehículo</h1>
      <p className="text-p-ink2 text-sm mb-5">
        Tocá una zona del auto para ver qué tenés en stock en esa posición.
      </p>
      <VehiculoClient />
    </div>
  )
}
