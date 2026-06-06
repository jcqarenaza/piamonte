import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
