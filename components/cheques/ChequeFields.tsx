'use client'
// Campos de cheque embebidos en cualquier modal de pago.
// Se usan cuando forma_pago === 'Cheque' para capturar los datos del cheque
// y registrarlo en la tabla `cheques` junto con el pago.
import { Field, Input } from '@/components/ui'
import { todayStr } from '@/lib/utils/format'

export interface ChequeData {
  numero: string
  banco: string
  fecha_cobro: string
  modalidad: 'al_dia' | 'diferido'
  formato: 'fisico' | 'echeq'
}

export const EMPTY_CHEQUE: ChequeData = {
  numero: '', banco: 'Banco Nación', fecha_cobro: todayStr(),
  modalidad: 'diferido', formato: 'fisico'
}

const BANCOS = ['Banco Nación','Banco Provincia','Banco Galicia','Banco Santander',
  'Banco BBVA','Banco HSBC','Banco Macro','Banco Credicoop','Otro']

interface Props {
  value: ChequeData
  onChange: (v: ChequeData) => void
}

export function ChequeFields({ value, onChange }: Props) {
  const set = (k: keyof ChequeData, v: string) => onChange({ ...value, [k]: v })
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 flex flex-col gap-2.5">
      <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Datos del cheque</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Formato">
          <select value={value.formato} onChange={e=>set('formato',e.target.value)}
            className="w-full border border-p-line rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
            <option value="fisico">📄 Físico</option>
            <option value="echeq">💻 E-Cheq</option>
          </select>
        </Field>
        <Field label="Modalidad">
          <select value={value.modalidad} onChange={e=>set('modalidad',e.target.value)}
            className="w-full border border-p-line rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
            <option value="al_dia">Al día</option>
            <option value="diferido">Diferido</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="N° cheque *">
          <Input value={value.numero} onChange={e=>set('numero',e.target.value)} placeholder="12345678"/>
        </Field>
        <Field label="Banco">
          <select value={value.banco} onChange={e=>set('banco',e.target.value)}
            className="w-full border border-p-line rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
            {BANCOS.map(b=><option key={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      {value.modalidad==='diferido'&&(
        <Field label="Fecha de cobro">
          <Input type="date" value={value.fecha_cobro} onChange={e=>set('fecha_cobro',e.target.value)}/>
        </Field>
      )}
    </div>
  )
}
