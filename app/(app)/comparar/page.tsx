export const dynamic = 'force-dynamic'
import CompararClient from '@/components/comparar/CompararClient'

export default function Page() {
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Comparar precios</h1>
      <p className="text-p-ink2 text-sm mb-5">
        Compará el costo neto del mismo vidrio entre GAMMA, Malatesta y Sekurit. 
        El precio más bajo queda resaltado en verde.
      </p>
      <CompararClient />
    </div>
  )
}
