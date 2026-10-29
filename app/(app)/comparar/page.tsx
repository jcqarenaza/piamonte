import { redirect } from 'next/navigation'
// Comparar se unificó con Precios > Revisar (equivalencias, descripciones, stock sin catálogo)
export default function Page() { redirect('/precios?tab=revisar') }
