'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ALL_MODULES = [
  { id:'inicio',       href:'/inicio',       label:'Inicio',        icon:'🏠' },
  { id:'buscar',       href:'/buscar',       label:'Buscar',        icon:'🔍' },
  { id:'comparar',     href:'/comparar',     label:'Comparar',      icon:'⚖️' },
  { id:'vehiculo',     href:'/vehiculo',     label:'Vehículo',      icon:'🚗' },
  { id:'turnos',       href:'/turnos',       label:'Turnos',        icon:'📅' },
  { id:'clientes',     href:'/clientes',     label:'Clientes',      icon:'👥' },
  { id:'presupuestos', href:'/presupuestos', label:'Presupuestos',  icon:'📋' },
  { id:'ordenes',      href:'/ordenes',      label:'Órdenes',       icon:'🔧' },
  { id:'caja',         href:'/caja',         label:'Caja',          icon:'💰' },
  { id:'stock',        href:'/stock',        label:'Stock',         icon:'📦' },
  { id:'adas',         href:'/adas',         label:'Cert. ADAS',    icon:'🛡' },
  { id:'ofertas',      href:'/ofertas',      label:'Ofertas',       icon:'📄' },
  { id:'proveedores',  href:'/proveedores',  label:'Proveedores',   icon:'🏭' },
  { id:'informes',     href:'/informes',     label:'Informes',      icon:'📊' },
]

const DEFAULT_FAVS = ['inicio','turnos','caja','buscar']

export default function Nav({ rol }: { rol?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [favs, setFavs] = useState<string[]>(DEFAULT_FAVS)
  const [perfil, setPerfil] = useState<{nombre:string;rol:string}|null>(null)
  const [masOpen, setMasOpen] = useState(false)
  const [editFavs, setEditFavs] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)

  // Cargar favoritos del usuario
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('perfiles').select('nav_favoritos,nombre,rol').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.nav_favoritos?.length) setFavs(data.nav_favoritos)
          if (data?.nombre) setPerfil({ nombre: data.nombre, rol: data.rol })
        })
    })
  }, [supabase])

  // Cerrar sheet al navegar
  useEffect(() => { setMasOpen(false); setSideOpen(false) }, [pathname])

  async function saveFavs(newFavs: string[]) {
    setFavs(newFavs)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('perfiles').update({ nav_favoritos: newFavs }).eq('id', user.id)
  }

  function toggleFav(id: string) {
    if (favs.includes(id)) {
      if (favs.length <= 2) return // mínimo 2
      saveFavs(favs.filter(f => f !== id))
    } else {
      if (favs.length >= 4) {
        // reemplazar el último
        saveFavs([...favs.slice(0, 3), id])
      } else {
        saveFavs([...favs, id])
      }
    }
  }

  const favModules = ALL_MODULES.filter(m => favs.includes(m.id))
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Filtrar por rol
  const visible = ALL_MODULES.filter(m => {
    if (rol === 'ventas' && ['proveedores','informes'].includes(m.id)) return false
    return true
  })

  return (
    <>
      {/* ── SIDEBAR DESKTOP ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full bg-p-ink z-40 py-6 overflow-y-auto" style={{width:224,minWidth:224,borderRight:"1px solid rgba(255,255,255,0.1)"}}>
        {/* Logo + usuario */}
        <div className="px-4 mb-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div style={{width:36,height:36,background:'#00A550',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'#fff',fontWeight:900,fontSize:16,fontFamily:'Arial'}}>P</span>
            </div>
            <div>
              <p style={{color:'#00A550',fontWeight:900,fontSize:16,fontFamily:'Arial',lineHeight:1}}>PIAMONTE</p>
              <p style={{color:'rgba(255,255,255,0.4)',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',marginTop:2}}>Gestión</p>
            </div>
          </div>
          {perfil && (
            <div style={{background:'rgba(255,255,255,0.07)',borderRadius:8,padding:'8px 10px'}}>
              <p style={{color:'#fff',fontSize:13,fontWeight:600,fontFamily:'Arial'}}>{perfil.nombre}</p>
              <p style={{color:'rgba(255,255,255,0.45)',fontSize:11,textTransform:'capitalize',marginTop:2}}>{perfil.rol}</p>
            </div>
          )}
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {visible.map(m => (
            <Link key={m.id} href={m.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isActive(m.href) ? 'bg-p-green text-white' : 'text-white opacity-75'}`}>
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-4 pt-6" style={{borderTop:'1px solid rgba(255,255,255,0.08)',marginTop:'auto',paddingTop:16}}>
          <p style={{color:'rgba(255,255,255,0.25)',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase'}}>QP Cloud & IA</p>
        </div>
      </aside>

      {/* ── HEADER MOBILE ─────────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-p-ink h-12 flex items-center justify-between px-4">
        <p className="font-saira font-black text-p-green text-lg">PIAMONTE</p>
        <button onClick={() => setSideOpen(true)} className="text-white text-xl p-1">☰</button>
      </header>

      {/* ── SIDEBAR MOBILE (drawer) ────────────────────────────────────── */}
      {sideOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSideOpen(false)}/>
          <aside className="relative w-72 max-w-[85vw] bg-p-ink h-full flex flex-col py-6 overflow-y-auto">
            <div className="px-5 mb-6 flex items-center justify-between">
              <p className="font-saira font-black text-xl text-p-green">PIAMONTE</p>
              <button onClick={() => setSideOpen(false)} className="text-white/60 text-xl">✕</button>
            </div>
            <nav className="flex flex-col gap-0.5 px-2">
              {visible.map(m => (
                <Link key={m.id} href={m.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-colors ${isActive(m.href) ? 'bg-p-green text-white' : 'text-white opacity-75'}`}>
                  <span className="text-lg">{m.icon}</span>
                  <span>{m.label}</span>
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* ── BOTTOM NAV MOBILE ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-p-line safe-area-bottom">
        <div className="flex">
          {favModules.map(m => (
            <Link key={m.id} href={m.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${isActive(m.href) ? 'text-p-green' : 'text-p-ink2'}`}>
              <span className="text-2xl leading-none">{m.icon}</span>
              <span className="text-[10px] font-semibold leading-none">{m.label.split(' ')[0]}</span>
            </Link>
          ))}
          {/* Botón Más */}
          <button onClick={() => setMasOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${masOpen ? 'text-p-green' : 'text-p-ink2'}`}>
            <span className="text-2xl leading-none">⋯</span>
            <span className="text-[10px] font-semibold leading-none">Más</span>
          </button>
        </div>
      </nav>

      {/* ── SHEET "MÁS" ───────────────────────────────────────────────── */}
      {masOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setMasOpen(false); setEditFavs(false) }}/>
          <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto pb-safe">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-p-line"/>
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-p-line2">
              <p className="font-saira font-bold text-p-ink">Todos los módulos</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditFavs(!editFavs)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${editFavs ? 'bg-p-green text-white border-p-green' : 'border-p-line text-p-ink2'}`}>
                  {editFavs ? '✓ Listo' : '✏ Personalizar'}
                </button>
                <button onClick={() => { setMasOpen(false); setEditFavs(false) }} className="text-p-ink2 text-lg">✕</button>
              </div>
            </div>

            {/* Hint personalización */}
            {editFavs && (
              <div className="mx-4 mt-3 bg-p-light rounded-xl px-4 py-2.5 text-xs text-p-dark">
                <p className="font-bold mb-0.5">Elegí tus 4 accesos rápidos</p>
                <p className="text-p-ink2">Los tildados aparecen en la barra inferior. Máximo 4.</p>
              </div>
            )}

            {/* Grid de módulos */}
            <div className="grid grid-cols-3 gap-2 p-4">
              {visible.map(m => {
                const active = isActive(m.href)
                const isFav = favs.includes(m.id)
                return (
                  <button key={m.id}
                    onClick={() => {
                      if (editFavs) { toggleFav(m.id) }
                      else { router.push(m.href); setMasOpen(false) }
                    }}
                    className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 transition-all border-2 ${
                      editFavs
                        ? isFav ? 'border-p-green bg-p-light' : 'border-transparent bg-gray-50'
                        : active ? 'border-p-green bg-p-light' : 'border-transparent bg-gray-50 active:bg-p-light'
                    }`}>
                    {editFavs && (
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${isFav ? 'bg-p-green border-p-green text-white' : 'border-gray-300 text-transparent'}`}>
                        {isFav ? '✓' : ''}
                      </div>
                    )}
                    <span className="text-3xl leading-none">{m.icon}</span>
                    <span className="text-xs font-semibold text-p-ink text-center leading-tight">{m.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="h-6"/>
          </div>
        </div>
      )}
    </>
  )
}
