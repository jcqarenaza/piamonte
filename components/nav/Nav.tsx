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
  { id:'ordenes',      href:'/ordenes',      label:'Órdenes OS',    icon:'🔧' },
  { id:'caja',         href:'/caja',         label:'Caja del día',  icon:'💰' },
  { id:'stock',        href:'/stock',        label:'Mi stock',      icon:'📦' },
  { id:'adas',         href:'/adas',         label:'Cert. ADAS',    icon:'🛡️' },
  { id:'ofertas',      href:'/ofertas',      label:'Ofertas',       icon:'📄' },
  { id:'proveedores',  href:'/proveedores',  label:'Proveedores',   icon:'🏭' },
  { id:'informes',     href:'/informes',     label:'Informes',      icon:'📊' },
]

const DEFAULT_FAVS = ['inicio','turnos','caja','buscar']
const SIDEBAR_W = 220

// Estilos base reutilizables
const S = {
  sidebar: {
    position:'fixed' as const, left:0, top:0, height:'100vh',
    width:SIDEBAR_W, minWidth:SIDEBAR_W,
    background:'#0C1810', borderRight:'1px solid rgba(255,255,255,0.08)',
    display:'flex', flexDirection:'column' as const,
    zIndex:40, overflowY:'auto' as const, padding:'20px 0',
  },
  link: (active:boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10,
    padding:'9px 16px', margin:'1px 8px', borderRadius:8,
    background: active ? '#00A550' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.72)',
    textDecoration:'none', fontSize:13, fontWeight:600,
    fontFamily:'Arial, sans-serif', transition:'background .15s, color .15s',
    cursor:'pointer',
  }),
  icon: { fontSize:16, flexShrink:0, width:20, textAlign:'center' as const },
}

export default function Nav({ rol }: { rol?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [favs, setFavs]       = useState<string[]>(DEFAULT_FAVS)
  const [perfil, setPerfil]   = useState<{nombre:string;rol:string}|null>(null)
  const [masOpen, setMasOpen] = useState(false)
  const [editFavs, setEditFavs] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  useEffect(() => { setMasOpen(false); setSideOpen(false) }, [pathname])

  async function saveFavs(newFavs: string[]) {
    setFavs(newFavs)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('perfiles').update({ nav_favoritos: newFavs }).eq('id', user.id)
  }

  function toggleFav(id: string) {
    if (favs.includes(id)) {
      if (favs.length <= 2) return
      saveFavs(favs.filter(f => f !== id))
    } else {
      saveFavs(favs.length >= 4 ? [...favs.slice(0,3), id] : [...favs, id])
    }
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const visible = ALL_MODULES.filter(m => {
    if (rol === 'ventas' && ['proveedores','informes'].includes(m.id)) return false
    return true
  })

  const favModules = ALL_MODULES.filter(m => favs.includes(m.id))

  // ── SIDEBAR DESKTOP ──────────────────────────────────────────────────────
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{padding:'0 16px 20px',borderBottom:'1px solid rgba(255,255,255,0.08)',marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:perfil?12:0}}>
          <div style={{width:34,height:34,background:'#00A550',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{color:'#fff',fontWeight:900,fontSize:17,fontFamily:'Arial'}}>P</span>
          </div>
          <div>
            <div style={{color:'#00A550',fontWeight:900,fontSize:15,fontFamily:'Arial',letterSpacing:1,textTransform:'uppercase'}}>PIAMONTE</div>
            <div style={{color:'rgba(255,255,255,0.35)',fontSize:9,letterSpacing:'0.15em',textTransform:'uppercase',marginTop:1}}>Gestión</div>
          </div>
        </div>
        {perfil && (
          <div style={{background:'rgba(255,255,255,0.06)',borderRadius:7,padding:'7px 10px',marginTop:10}}>
            <div style={{color:'rgba(255,255,255,0.92)',fontSize:12,fontWeight:600,fontFamily:'Arial'}}>{perfil.nombre}</div>
            <div style={{color:'rgba(255,255,255,0.4)',fontSize:10,fontFamily:'Arial',marginTop:2,textTransform:'capitalize'}}>{perfil.rol}</div>
          </div>
        )}
      </div>

      {/* Links */}
      <nav style={{flex:1,padding:'4px 0'}}>
        {visible.map(m => (
          <Link key={m.id} href={m.href} style={S.link(isActive(m.href))}>
            <span style={S.icon}>{m.icon}</span>
            <span>{m.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div style={{padding:'16px',borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:'auto'}}>
        <div style={{color:'rgba(255,255,255,0.2)',fontSize:10,fontFamily:'Arial',letterSpacing:'0.1em',textTransform:'uppercase'}}>QP Cloud & IA</div>
      </div>
    </>
  )

  return (
    <>
      {/* Sidebar desktop */}
      {isDesktop && (
        <aside style={S.sidebar}>
          <SidebarContent />
        </aside>
      )}

      {/* Header mobile */}
      {!isDesktop && (
        <header style={{position:'fixed',top:0,left:0,right:0,height:48,background:'#0C1810',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',zIndex:40,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:28,height:28,background:'#00A550',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{color:'#fff',fontWeight:900,fontSize:14,fontFamily:'Arial'}}>P</span>
            </div>
            <span style={{color:'#00A550',fontWeight:900,fontSize:15,fontFamily:'Arial',letterSpacing:1}}>PIAMONTE</span>
          </div>
          <button onClick={() => setSideOpen(true)} style={{color:'rgba(255,255,255,0.7)',background:'none',border:'none',fontSize:22,cursor:'pointer',padding:4}}>☰</button>
        </header>
      )}

      {/* Drawer mobile */}
      {!isDesktop && sideOpen && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}} onClick={() => setSideOpen(false)}/>
          <aside style={{...S.sidebar,position:'relative',width:260,minWidth:260,height:'100%',paddingTop:16,zIndex:51}}>
            <button onClick={() => setSideOpen(false)} style={{position:'absolute',top:12,right:12,background:'none',border:'none',color:'rgba(255,255,255,0.5)',fontSize:20,cursor:'pointer'}}>✕</button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Bottom nav mobile */}
      {!isDesktop && (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #C2DDD0',display:'flex',zIndex:40}}>
          {favModules.map(m => (
            <Link key={m.id} href={m.href} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px',gap:3,textDecoration:'none',color:isActive(m.href)?'#00A550':'#4A6655'}}>
              <span style={{fontSize:22,lineHeight:1}}>{m.icon}</span>
              <span style={{fontSize:10,fontWeight:600,fontFamily:'Arial',lineHeight:1}}>{m.label.split(' ')[0]}</span>
            </Link>
          ))}
          <button onClick={() => setMasOpen(true)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px',gap:3,background:'none',border:'none',color:masOpen?'#00A550':'#4A6655',cursor:'pointer'}}>
            <span style={{fontSize:22,lineHeight:1}}>⋯</span>
            <span style={{fontSize:10,fontWeight:600,fontFamily:'Arial',lineHeight:1}}>Más</span>
          </button>
        </nav>
      )}

      {/* Sheet "Más" */}
      {masOpen && !isDesktop && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)'}} onClick={() => { setMasOpen(false); setEditFavs(false) }}/>
          <div style={{position:'relative',background:'#fff',borderRadius:'24px 24px 0 0',maxHeight:'85vh',overflowY:'auto',paddingBottom:24}}>
            {/* Handle */}
            <div style={{display:'flex',justifyContent:'center',padding:'12px 0 4px'}}>
              <div style={{width:40,height:4,borderRadius:2,background:'#C2DDD0'}}/>
            </div>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 20px 12px',borderBottom:'1px solid #E0EFE8'}}>
              <span style={{fontWeight:700,fontSize:15,fontFamily:'Arial',color:'#0C1810'}}>Todos los módulos</span>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button onClick={() => setEditFavs(!editFavs)}
                  style={{background:editFavs?'#00A550':'#fff',color:editFavs?'#fff':'#4A6655',border:'1.5px solid',borderColor:editFavs?'#00A550':'#C2DDD0',borderRadius:20,padding:'5px 14px',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'Arial'}}>
                  {editFavs ? '✓ Listo' : '✏ Personalizar'}
                </button>
                <button onClick={() => { setMasOpen(false); setEditFavs(false) }} style={{background:'none',border:'none',fontSize:20,color:'#7A9085',cursor:'pointer'}}>✕</button>
              </div>
            </div>
            {editFavs && (
              <div style={{margin:'10px 16px',background:'#E6F7EF',borderRadius:10,padding:'10px 14px',fontSize:12,color:'#005C2E',fontFamily:'Arial'}}>
                <strong>Elegí tus 4 accesos rápidos.</strong> Los tildados aparecen en la barra inferior.
              </div>
            )}
            {/* Grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,padding:'12px 16px'}}>
              {visible.map(m => {
                const active = isActive(m.href)
                const isFav = favs.includes(m.id)
                return (
                  <button key={m.id}
                    onClick={() => { if (editFavs) toggleFav(m.id); else { router.push(m.href); setMasOpen(false) } }}
                    style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,borderRadius:16,padding:'16px 8px',background:editFavs?(isFav?'#E6F7EF':'#f5f5f5'):(active?'#E6F7EF':'#f5f5f5'),border:`2px solid ${(editFavs?isFav:active)?'#00A550':'transparent'}`,cursor:'pointer',fontFamily:'Arial'}}>
                    {editFavs && (
                      <div style={{position:'absolute',top:6,right:6,width:18,height:18,borderRadius:9,border:'2px solid',borderColor:isFav?'#00A550':'#ccc',background:isFav?'#00A550':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',fontWeight:700}}>
                        {isFav?'✓':''}
                      </div>
                    )}
                    <span style={{fontSize:28}}>{m.icon}</span>
                    <span style={{fontSize:11,fontWeight:600,color:'#0C1810',textAlign:'center',lineHeight:1.2}}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
