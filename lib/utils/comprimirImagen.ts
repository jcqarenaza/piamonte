/**
 * Prepara un archivo para subir al bucket comprobante-adjuntos:
 * - Imágenes: se redimensionan a máx 1800px y se convierten a JPEG (calidad 0.82).
 *   Así una foto de celular de 8–12 MB (o HEIC de iPhone, si el navegador lo decodifica)
 *   queda en ~300–600 KB y pasa el límite de 10 MB y el filtro de tipos del bucket.
 * - PDFs: se devuelven tal cual (si superan 10 MB se avisa).
 * Devuelve { file, ext } o lanza un Error con mensaje para mostrar al usuario.
 */
const MAX_BYTES = 10 * 1024 * 1024

export async function prepararAdjunto(file: File): Promise<{ file: File; ext: string }> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_BYTES) throw new Error(`El PDF pesa ${(file.size/1048576).toFixed(1)} MB y el máximo es 10 MB.`)
    return { file, ext: 'pdf' }
  }
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Fallback (p.ej. HEIC en Safari viejo o tipos raros): intentar con <img>
    bitmap = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => rej(new Error('No se pudo leer la imagen. Si es una foto de iPhone, configurá la cámara en "Más compatible" (JPEG) o mandala por WhatsApp y subí esa.'))
      img.src = URL.createObjectURL(file)
    })
  }
  const w = (bitmap as any).width as number, h = (bitmap as any).height as number
  const MAX = 1800
  const esc = Math.min(1, MAX / Math.max(w, h))
  const cw = Math.round(w * esc), ch = Math.round(h * esc)
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen en este navegador.')
  ctx.drawImage(bitmap as any, 0, 0, cw, ch)
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('No se pudo comprimir la imagen.')), 'image/jpeg', 0.82))
  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return { file: new File([blob], nombre, { type: 'image/jpeg' }), ext: 'jpg' }
}
