import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Links publicos (sin login) que resuelve la edge function pdf-link:
  //  /c/<codigo>          -> PDF de comprobante enviado por WhatsApp
  //  /presupuesto/<nro>   -> PDF de presupuesto (links ya enviados siguen funcionando)
  async rewrites() {
    const fn = 'https://hjzhatercccblhgaukgx.supabase.co/functions/v1/pdf-link'
    return {
      beforeFiles: [
        { source: '/c/:code', destination: fn + '?c=:code' },
        { source: '/presupuesto/:ref', destination: fn + '?p=:ref' },
      ],
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hjzhatercccblhgaukgx.supabase.co',
      },
    ],
  },
}

export default nextConfig
