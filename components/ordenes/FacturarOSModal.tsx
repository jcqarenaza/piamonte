'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

interface Props {
  os: any
  onClose: () => void
  onFacturado: () => void
}

const IVA = 0.21
const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnGray = { ...btn, background:'#6b7280' } as const

export default function FacturarOSModal({ os, onClose, onFacturado }: Props) {
  const [formaPago, setFormaPago] = useState('Cuenta Corriente')
  const [monto, setMonto] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const supabase = createClient()

  const total = os.total ?? 0
  const esRI  = !!os.aseguradora // facturas a aseguradoras siempre RI → discrimina IVA
  const neto  = esRI ? Math.round(total / (1 + IVA) * 100) / 100 : total
  const iva   = esRI ? Math.round((total - neto) * 100) / 100 : 0

  async function emitir() {
    if (!total || total === 0) { setToast('La OS no tiene precio. Editala antes de facturar.'); return }
    setSaving(true)
    try {
      // Obtener siguiente número de comprobante
      const tipo = esRI ? 'A' : 'B'
      const tipoCbte = esRI ? 1 : 6
      const { data: last } = await supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
      const numero = (last?.[0]?.numero ?? 0) + 1

      // Buscar CUIT de la aseguradora si aplica
      let clienteCuit = null
      if (esRI && os.aseguradora) {
        const { data: aseg } = await supabase.from('aseguradoras').select('id,cuit').ilike('nombre', `%${os.aseguradora}%`).maybeSingle()
        clienteCuit = aseg?.cuit?.replace(/[^0-9]/g,'') || null
      }

      // Insertar comprobante
      const { data: comp, error } = await supabase.from('comprobantes').insert({
        tipo, numero,
        fecha: todayStr(),
        categoria: 'venta',
        cliente_nombre: os.cliente || null,
        cliente_cuit: clienteCuit,
        aseguradora_nombre: os.aseguradora || null,
        vehiculo: os.vehiculo || null,
        patente: os.patente || null,
        siniestro: os.siniestro || null,
        items: os.items || [],
        neto, iva, total,
        forma_pago: formaPago,
        notas: obs || null,
        orden_id: os.id,
      }).select().single()
      if (error) { setToast('Error: ' + error.message); setSaving(false); return }

      // Solicitar CAE
      try {
        const docTipo = clienteCuit?.length === 11 ? 80 : 99
        const docNro  = clienteCuit?.length === 11 ? clienteCuit : '0'
        const res = await supabase.functions.invoke('arca-facturar', {
          body: { comprobante_id: comp.id, tipo_cbte: tipoCbte, punto_venta: 6,
            fecha: todayStr().replace(/-/g,''), total, neto, iva,
            docTipo, docNro, ivaAlicuota: esRI ? 5 : undefined }
        })
        if (res.data?.cae) {
          await supabase.from('comprobantes').update({
            cae_emitido: res.data.cae, cae_vencimiento: res.data.cae_vencimiento || null,
            nro_cbte_afip: res.data.nro_cbte || null,
          }).eq('id', comp.id)
        }
      } catch {}

      // Marcar OS como facturada
      await supabase.from('ordenes_servicio').update({ convertido_comp: true }).eq('id', os.id)
      onFacturado()
    } catch (e: any) {
      setToast('Error inesperado: ' + e.message)
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Facturar OS-${String(os.numero).padStart(4,'0')}`} size="lg">
      <div className="flex flex-col gap-4">
        {toast && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">{toast}</div>}

        {/* Datos del comprobante */}
        <div className="bg-p-light rounded-xl p-3 text-sm flex flex-col gap-1">
          {os.aseguradora && <p><span className="text-p-ink2">Aseguradora:</span> <strong>{os.aseguradora}</strong></p>}
          {os.cliente && <p><span className="text-p-ink2">{os.aseguradora ? 'Asegurado:' : 'Cliente:'}</span> {os.cliente}</p>}
          {os.vehiculo && <p><span className="text-p-ink2">Vehículo:</span> {os.vehiculo} · {os.patente}</p>}
          {os.siniestro && <p><span className="text-p-ink2">Siniestro:</span> {os.siniestro}</p>}
        </div>

        {/* Ítems */}
        {os.items?.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Ítems</p>
            {(os.items as any[]).map((it:any,i:number)=>(
              <div key={i} className="flex justify-between text-sm py-1 border-b border-p-line2">
                <span>{it.d} ×{it.c}</span>
                <span className="font-mono">{moneyARS(it.c*it.p)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Totales */}
        <div className="bg-p-light rounded-xl p-3">
          {esRI && <div className="flex justify-between text-sm text-p-ink2"><span>Neto</span><span className="font-mono">{moneyARS(neto)}</span></div>}
          {esRI && <div className="flex justify-between text-sm text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
          <div className="flex justify-between font-saira font-bold text-lg text-p-ink border-t border-p-line mt-1 pt-1">
            <span>TOTAL</span><span>{moneyARS(total)}</span>
          </div>
          {esRI && <p className="text-[10px] text-p-ink2 mt-1">Factura A — IVA discriminado (aseguradora RI)</p>}
        </div>

        {/* Forma de pago */}
        <Field label="Forma de pago">
          <select value={formaPago} onChange={e=>setFormaPago(e.target.value)}
            className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
            {['Cuenta Corriente','Efectivo','Transferencia','Cheque','Tarjeta Débito','Tarjeta Crédito'].map(f=><option key={f}>{f}</option>)}
          </select>
        </Field>

        <Field label="Observaciones (opcional)">
          <Input value={obs} onChange={e=>setObs(e.target.value)} placeholder="…"/>
        </Field>

        {total === 0 && <p className="text-sm text-amber-600 font-semibold">⚠ Esta OS no tiene precio. Editala antes de facturar.</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} style={btnGray}>Cancelar</button>
          <button onClick={emitir} disabled={saving || total === 0}
            style={{...btn, opacity: (saving || total === 0) ? .5 : 1}}>
            {saving ? 'Emitiendo…' : '✓ Emitir factura y CAE'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
