'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Grupos de módulos ─────────────────────────────────────────────────────────
const GRUPOS = [
  {
    label: 'CLIENTES Y VEHÍCULOS',
    items: [
      { id:'clientes',     href:'/clientes',     label:'Clientes',     icon:'👥' },
      
      { id:'aseguradoras', href:'/aseguradoras', label:'Aseguradoras', icon:'🛡️' },
    ]
  },
  {
    label: 'CATÁLOGO / ARTÍCULOS',
    items: [
      { id:'articulos', href:'/articulos', label:'Artículos', icon:'🏷️' },
      { id:'buscar',    href:'/buscar',    label:'Buscar',    icon:'🔍' },
      { id:'comparar',  href:'/comparar',  label:'Comparar',  icon:'⚖️' },
      { id:'ofertas',   href:'/ofertas',   label:'Ofertas',   icon:'⭐' },
    ]
  },
  {
    label: 'PROVEEDORES Y COMPRAS',
    items: [
      { id:'proveedores-compra',href:'/proveedores-compra',label:'Proveedores',  icon:'🏢' },
      { id:'proveedores',       href:'/proveedores',       label:'Listas',       icon:'📋' },
      { id:'compras',           href:'/compras',           label:'Compras',      icon:'🛒' },
      { id:'cuenta-corriente-proveedores', href:'/cuenta-corriente-proveedores', label:'Cta. Cte. Prov.', icon:'📒' },
    ]
  },
  {
    label: 'VENTAS',
    items: [
      { id:'turnos',           href:'/turnos',           label:'Turnos',          icon:'📅' },
      { id:'precios',          href:'/precios',          label:'Precios',        icon:'💰' },
      { id:'presupuestos',     href:'/presupuestos',     label:'Presupuestos',   icon:'📋' },
      { id:'ordenes',          href:'/ordenes',          label:'Órdenes OS',     icon:'🔧' },
      { id:'comprobantes',     href:'/comprobantes',     label:'Comprobantes',   icon:'🧾' },
      { id:'adas',             href:'/adas',             label:'Certificados',   icon:'🛡️' },
      { id:'cuenta-corriente', href:'/cuenta-corriente', label:'Cta. Corriente', icon:'📒' },
    ]
  },
  {
    label: 'STOCK',
    items: [
      { id:'stock',           href:'/stock',           label:'Stock',           icon:'📦' },
      { id:'depositos',       href:'/depositos',       label:'Depósitos',       icon:'🏭' },
      { id:'remitos-internos', href:'/remitos-internos', label:'Remitos Internos', icon:'🔄' },
    ]
  },
  {
    label: 'INFORMES',
    items: [
      { id:'informes',               href:'/informes',               label:'Informes',          icon:'📊' },
      { id:'rentabilidades-avanzadas',href:'/rentabilidades-avanzadas',label:'Rentabilidades',   icon:'💹' },
      { id:'busqueda-comprobantes',   href:'/busqueda-comprobantes',   label:'Buscar Comprobantes', icon:'🔎' },
    ]
  },
  {
    label: 'CONTABILIDAD',
    items: [
      { id:'caja',         href:'/caja',         label:'Caja',          icon:'💵' },
      { id:'arqueo',       href:'/arqueo',       label:'Arqueo',        icon:'🔒' },
      { id:'tarjetas',     href:'/tarjetas',     label:'Tarjetas',      icon:'💳' },
      { id:'cheques',      href:'/cheques',      label:'Cheques',       icon:'📃' },
      { id:'banco',        href:'/banco',        label:'Banco',         icon:'🏦' },
      { id:'contabilidad', href:'/contabilidad', label:'Contabilidad',  icon:'📒' },
    ]
  },
  {
    label: 'CONFIGURACIÓN',
    items: [
      { id:'usuarios',     href:'/usuarios',     label:'Usuarios',      icon:'👤' },
      { id:'auditoria',    href:'/auditoria',    label:'Auditoría',     icon:'🛡️' },
      { id:'configuracion',href:'/configuracion',label:'Configuración', icon:'⚙️' },
    ]
  },
]

const ALL_MODULES = GRUPOS.flatMap(g => g.items)
const DEFAULT_FAVS = ['turnos','caja','buscar','presupuestos']
const SIDEBAR_W = 210

// Colores — estilo MobixERP / QP C&IA
const C = {
  sidebar:    '#FFFFFF',
  border:     '#E5E7EB',
  sectionTxt: '#9CA3AF',
  linkTxt:    '#374151',
  linkHover:  '#F0FDF4',
  activeLink: '#E6F7EF',
  activeTxt:  '#00A550',
  activeBorder:'#00A550',
  logo:       '#00A550',
  userBg:     '#F9FAFB',
  content:    '#F9FAFB',
}

const MODULOS_FASE2 = ['proveedores-compra','compras','articulos','aseguradoras','depositos',
  'remitos-internos','tarjetas','rentabilidades-avanzadas',
  'cuenta-corriente','busqueda-comprobantes','cuenta-corriente-proveedores']
const MODULOS_FASE3 = ['contabilidad','cheques','banco']

type Module = typeof ALL_MODULES[0]

export default function Nav({ rol, fase = 1 }: { rol?: string; fase?: number }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [favs, setFavs]         = useState<string[]>(DEFAULT_FAVS)
  const [perfil, setPerfil]     = useState<{nombre:string;rol:string}|null>(null)
  const [masOpen, setMasOpen]   = useState(false)
  const [editFavs, setEditFavs] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check(); window.addEventListener('resize', check)
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
    if (favs.includes(id)) { if (favs.length > 2) saveFavs(favs.filter(f=>f!==id)) }
    else saveFavs(favs.length >= 4 ? [...favs.slice(0,3), id] : [...favs, id])
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href+'/')

  const visibleGrupos = GRUPOS.map(g => ({
    ...g,
    items: g.items.filter(m => {
      // Rol caja: solo ve Proveedores y Caja
      if (rol === 'caja' && !['proveedores-compra','caja','comprobantes','arqueo'].includes(m.id)) return false
      // Rol ventas: ocultar algunos módulos
      if (rol === 'ventas' && ['proveedores','informes'].includes(m.id)) return false
      if (rol === 'ventas' && ['proveedores-compra','compras','articulos','aseguradoras','rentabilidades-avanzadas','tarjetas','arqueo','contabilidad','cheques','banco','depositos','cuenta-corriente','remitos-internos','busqueda-comprobantes','cuenta-corriente-proveedores'].includes(m.id)) return false
      // Configuración solo gerencial/admin
      if (!['gerencial','admin'].includes(rol ?? '') && ['configuracion','usuarios','auditoria'].includes(m.id)) return false
      // Arqueo solo gerencial/admin
      if (!['gerencial','admin'].includes(rol ?? '') && m.id === 'arqueo') return false
      if (fase < 2 && MODULOS_FASE2.includes(m.id)) return false
      if (fase < 3 && MODULOS_FASE3.includes(m.id)) return false
      return true
    })
  })).filter(g => g.items.length > 0)

  const visible = visibleGrupos.flatMap(g => g.items)
  const favModules = ALL_MODULES.filter(m => favs.includes(m.id))

  // ── Contenido del sidebar ─────────────────────────────────────────────────
  const SidebarContent = () => (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {/* Logo */}
      <Link href="/inicio" style={{padding:'20px 16px 16px',borderBottom:`1px solid ${C.border}`,textDecoration:'none',display:'block'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,background:C.logo,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
            <img src="/logo.png" alt="Logo" style={{width:'100%',height:'100%',objectFit:'cover'}}
              onError={e=>{const t=e.target as HTMLImageElement;t.style.display='none';t.parentElement!.innerHTML='<span style="color:#fff;font-weight:900;font-size:16px;font-family:Arial">P</span>'}}/>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:'#111827',fontFamily:'Arial',letterSpacing:'0.03em'}}>El Piamonte</div>
            <div style={{fontSize:10,color:C.sectionTxt,marginTop:1,fontFamily:'Arial'}}>Gestión de comercio</div>
          </div>
        </div>
      </Link>

      {/* Grupos de links */}
      <nav style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
        {visibleGrupos.map(g => (
          <div key={g.label} style={{marginBottom:4}}>
            <div style={{padding:'8px 16px 4px',fontSize:10,fontWeight:700,color:C.sectionTxt,fontFamily:'Arial',letterSpacing:'0.08em'}}>
              {g.label}
            </div>
            {g.items.map(m => {
              const active = isActive(m.href)
              return (
                <Link key={m.id} href={m.href}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px 8px 16px',margin:'1px 8px',borderRadius:8,textDecoration:'none',fontFamily:'Arial',fontSize:13,fontWeight:active?600:500,
                    background:active?C.activeLink:'transparent',
                    color:active?C.activeTxt:C.linkTxt,
                    borderLeft:active?`3px solid ${C.activeBorder}`:'3px solid transparent',
                  }}>
                  <span style={{fontSize:15,width:20,textAlign:'center',flexShrink:0}}>{m.icon}</span>
                  <span>{m.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Usuario + logout */}
      <div style={{borderTop:`1px solid ${C.border}`,padding:'12px 16px'}}>
        {perfil && (
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{width:32,height:32,background:C.logo,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:13,fontFamily:'Arial'}}>{perfil.nombre.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#111827',fontFamily:'Arial'}}>{perfil.nombre}</div>
              <div style={{fontSize:11,color:C.sectionTxt,textTransform:'capitalize',fontFamily:'Arial'}}>{perfil.rol}</div>
            </div>
          </div>
        )}
        <button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/login' }}
          style={{display:'flex',alignItems:'center',gap:8,width:'100%',background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 12px',color:'#6B7280',fontSize:12,fontFamily:'Arial',fontWeight:600,cursor:'pointer'}}>
          <span style={{fontSize:13}}>🚪</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* ── SIDEBAR DESKTOP ── */}
      {isDesktop && (
        <aside style={{position:'fixed',left:0,top:0,height:'100vh',width:SIDEBAR_W,minWidth:SIDEBAR_W,background:C.sidebar,borderRight:`1px solid ${C.border}`,zIndex:40,overflowY:'auto',boxShadow:'2px 0 8px rgba(0,0,0,0.04)'}}>
          <SidebarContent />
        </aside>
      )}

      {/* ── HEADER MOBILE ── */}
      {!isDesktop && (
        <header style={{position:'fixed',top:0,left:0,right:0,height:52,background:'#fff',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',zIndex:40,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <Link href="/inicio" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none'}}>
            <div style={{width:30,height:30,background:C.logo,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
              <img src="/logo.png" alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}
                onError={e=>{const t=e.target as HTMLImageElement;t.style.display='none';t.parentElement!.innerHTML='<span style="color:#fff;font-weight:900;font-size:13px;font-family:Arial">P</span>'}}/>
            </div>
            <span style={{fontWeight:800,fontSize:15,color:'#111827',fontFamily:'Arial'}}>El Piamonte</span>
          </Link>
          <button onClick={()=>setSideOpen(true)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#6B7280',padding:4}}>☰</button>
        </header>
      )}

      {/* ── DRAWER MOBILE ── */}
      {!isDesktop && sideOpen && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.35)'}} onClick={()=>setSideOpen(false)}/>
          <aside style={{position:'relative',width:260,background:C.sidebar,height:'100%',zIndex:51,boxShadow:'4px 0 20px rgba(0,0,0,0.1)'}}>
            <button onClick={()=>setSideOpen(false)} style={{position:'absolute',top:14,right:14,background:'none',border:'none',fontSize:18,color:'#9CA3AF',cursor:'pointer'}}>✕</button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── BOTTOM NAV MOBILE ── */}
      {!isDesktop && (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:`1px solid ${C.border}`,display:'flex',zIndex:40,boxShadow:'0 -2px 8px rgba(0,0,0,0.06)'}}>
          {favModules.map(m => (
            <Link key={m.id} href={m.href} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px',gap:3,textDecoration:'none',color:isActive(m.href)?C.activeTxt:'#6B7280'}}>
              <span style={{fontSize:22,lineHeight:1}}>{m.icon}</span>
              <span style={{fontSize:10,fontWeight:600,fontFamily:'Arial',lineHeight:1}}>{m.label.split(' ')[0]}</span>
            </Link>
          ))}
          <button onClick={()=>setMasOpen(true)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px',gap:3,background:'none',border:'none',color:masOpen?C.activeTxt:'#6B7280',cursor:'pointer'}}>
            <span style={{fontSize:22,lineHeight:1}}>⋯</span>
            <span style={{fontSize:10,fontWeight:600,fontFamily:'Arial',lineHeight:1}}>Más</span>
          </button>
        </nav>
      )}

      {/* ── SHEET "MÁS" ── */}
      {masOpen && !isDesktop && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.35)'}} onClick={()=>{setMasOpen(false);setEditFavs(false)}}/>
          <div style={{position:'relative',background:'#fff',borderRadius:'20px 20px 0 0',maxHeight:'85vh',overflowY:'auto',paddingBottom:28}}>
            <div style={{display:'flex',justifyContent:'center',padding:'12px 0 4px'}}>
              <div style={{width:40,height:4,borderRadius:2,background:C.border}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 20px 12px',borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontWeight:700,fontSize:15,fontFamily:'Arial',color:'#111827'}}>Todos los módulos</span>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button onClick={()=>setEditFavs(!editFavs)}
                  style={{background:editFavs?C.logo:'#fff',color:editFavs?'#fff':C.sectionTxt,border:`1.5px solid ${editFavs?C.logo:C.border}`,borderRadius:20,padding:'5px 14px',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'Arial'}}>
                  {editFavs ? '✓ Listo' : '✏ Personalizar'}
                </button>
                <button onClick={()=>{setMasOpen(false);setEditFavs(false)}} style={{background:'none',border:'none',fontSize:20,color:C.sectionTxt,cursor:'pointer'}}>✕</button>
              </div>
            </div>
            {editFavs && (
              <div style={{margin:'10px 16px',background:C.activeLink,borderRadius:10,padding:'10px 14px',fontSize:12,color:'#005C2E',fontFamily:'Arial'}}>
                <strong>Elegí tus 4 accesos rápidos.</strong> Los tildados aparecen en la barra inferior.
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,padding:'12px 16px'}}>
              {visible.map(m => {
                const active = isActive(m.href)
                const isFav = favs.includes(m.id)
                return (
                  <button key={m.id}
                    onClick={()=>{ if(editFavs) toggleFav(m.id); else {router.push(m.href);setMasOpen(false)} }}
                    style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,borderRadius:14,padding:'16px 8px',background:(editFavs?isFav:active)?C.activeLink:'#F9FAFB',border:`2px solid ${(editFavs?isFav:active)?C.logo:'transparent'}`,cursor:'pointer',fontFamily:'Arial'}}>
                    {editFavs && (
                      <div style={{position:'absolute',top:6,right:6,width:18,height:18,borderRadius:9,border:`2px solid ${isFav?C.logo:'#ccc'}`,background:isFav?C.logo:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',fontWeight:700}}>
                        {isFav?'✓':''}
                      </div>
                    )}
                    <span style={{fontSize:28}}>{m.icon}</span>
                    <span style={{fontSize:11,fontWeight:600,color:'#374151',textAlign:'center',lineHeight:1.2}}>{m.label}</span>
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
