'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV_MAIN = [
  { href: '/inicio',         label: 'Inicio',        icon: '🏠' },
  { href: '/buscar',         label: 'Buscar',         icon: '🔍' },
  { href: '/caja',           label: 'Caja del día',   icon: '💰' },
  { href: '/presupuestos',   label: 'Presupuestos',   icon: '📄' },
  { href: '/ordenes',        label: 'O. Servicio',    icon: '🔧' },
  { href: '/adas',           label: 'Cert. ADAS',     icon: '🛡' },
  { href: '/turnos',         label: 'Turnos',         icon: '📅' },
  { href: '/clientes',       label: 'Clientes',       icon: '👥' },
]

const NAV_SEC = [
  { href: '/stock',          label: 'Mi stock',       icon: '📦' },
  { href: '/vehiculo',       label: 'Vehículo',       icon: '🚗' },
  { href: '/ofertas',        label: 'Ofertas',        icon: '🏷️' },
  { href: '/comparar',       label: 'Comparar',       icon: '⚖️' },
  { href: '/equivalencias',  label: 'Equivalencias',  icon: '🔗' },
  { href: '/proveedores',    label: 'Proveedores',    icon: '🏭' },
]

// Bottom nav mobile: solo los 5 más usados + Más
const NAV_MOBILE = [
  { href: '/inicio',       label: 'Inicio',   icon: '🏠' },
  { href: '/buscar',       label: 'Buscar',   icon: '🔍' },
  { href: '/caja',         label: 'Caja',     icon: '💰' },
  { href: '/turnos',       label: 'Turnos',   icon: '📅' },
  { href: '/stock',        label: 'Stock',    icon: '📦' },
]

interface NavProps { rol?: string }

export default function Nav({ rol }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ===== SIDEBAR DESKTOP ===== */}
      <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-white border-r border-p-line fixed top-0 left-0 z-20">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-p-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="El Piamonte" className="h-10 w-auto" />
          <div>
            <p className="font-saira font-bold text-sm text-p-ink leading-tight">El Piamonte</p>
            <p className="font-mono text-[10px] text-p-ink2 uppercase tracking-wider">Gestión</p>
          </div>
        </div>

        {/* Nav principal */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          <p className="px-3 text-[10px] font-semibold text-p-gray uppercase tracking-wider mb-2">Principal</p>
          {NAV_MAIN.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                isActive(item.href)
                  ? 'bg-p-light text-p-dark font-semibold'
                  : 'text-p-ink2 hover:bg-p-light/60 hover:text-p-ink'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <p className="px-3 text-[10px] font-semibold text-p-gray uppercase tracking-wider mt-4 mb-2">Catálogo</p>
          {NAV_SEC.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                isActive(item.href)
                  ? 'bg-p-light text-p-dark font-semibold'
                  : 'text-p-ink2 hover:bg-p-light/60 hover:text-p-ink'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer: rol + logout */}
        <div className="px-4 py-4 border-t border-p-line">
          {rol && (
            <p className="text-xs text-p-gray font-mono uppercase tracking-wider mb-2">{rol}</p>
          )}
          <button
            onClick={logout}
            className="w-full text-sm text-p-ink2 hover:text-red-600 py-2 rounded-lg hover:bg-red-50 transition-colors text-left px-2"
          >
            ← Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ===== HEADER MOBILE ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b-[3px] border-p-green shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="El Piamonte" className="h-9 w-auto" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-p-ink2 uppercase tracking-wider">
              {pathname.replace('/', '') || 'inicio'}
            </span>
          </div>
        </div>
        {/* Scroll nav secundaria mobile */}
        <div className="scroll-x flex px-3 pb-2 gap-1.5">
          {[...NAV_MAIN, ...NAV_SEC].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-shrink-0 text-xs font-saira font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                isActive(item.href)
                  ? 'bg-p-green text-white'
                  : 'bg-p-light text-p-dark'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </header>

      {/* ===== BOTTOM NAV MOBILE ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-p-line safe-area-pb">
        <div className="flex">
          {NAV_MOBILE.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-saira font-semibold transition-colors ${
                isActive(item.href) ? 'text-p-green' : 'text-p-gray'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
