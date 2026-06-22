'use client'
import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        console.error('No se pudo registrar el service worker:', e)
      })
    }
  }, [])
  return null
}
