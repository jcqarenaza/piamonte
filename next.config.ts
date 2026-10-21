import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Link corto para WhatsApp: /c/<codigo> -> edge function pdf-link (que redirige al PDF firmado)
  async rewrites() {
    return [
      { source: '/c/:code', destination: 'https://hjzhatercccblhgaukgx.supabase.co/functions/v1/pdf-link?c=:code' },
    ]
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
