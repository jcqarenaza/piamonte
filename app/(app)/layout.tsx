import type { Metadata } from 'next'
import { Saira, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const saira = Saira({ subsets: ['latin'], weight: ['500','600','700','800'], variable: '--font-saira' })
const ibmSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400','500','600'], variable: '--font-sans' })
const ibmMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500','600'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Gestión · El Piamonte',
  description: 'Sistema de gestión — Parabrisas El Piamonte',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${saira.variable} ${ibmSans.variable} ${ibmMono.variable} bg-p-paper text-p-ink antialiased`}>
        {children}
      </body>
    </html>
  )
}
