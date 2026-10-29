import { redirect } from 'next/navigation'

// Las ofertas se ven en Precios (marcadas como OFERTA). Esta pantalla se retiró.
export default function Page() { redirect('/precios') }
