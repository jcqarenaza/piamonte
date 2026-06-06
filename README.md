# Gestión de Comercio · Parabrisas El Piamonte

Sistema de gestión comercial para venta y colocación de parabrisas.

## Stack

- **Frontend**: Next.js 16 · App Router · TypeScript · Tailwind CSS
- **Backend / DB**: Supabase (Postgres + Auth + Edge Functions)
- **Deploy**: Vercel → elpiamonte.vercel.app

## Módulos

- **Inicio**: dashboard con recordatorios del día y KPIs
- **Buscar**: catálogo unificado GAMMA + Sekurit + Malatesta, con stock propio primero
- **Caja del día**: registro de ventas, ganancia y descuento de stock
- **Presupuestos**: multi-ítem con IVA, cotización dólar, WhatsApp e impresión
- **Órdenes de Servicio**: para aseguradoras, con número correlativo
- **Turnos**: agenda con recordatorio por WhatsApp (link wa.me)
- **Mi Stock**: inventario por depósito con resumen por tipo de vidrio
- **Vehículo**: búsqueda por auto con diagrama clickeable
- **Comparar / Equivalencias**: decisión de compra multi-proveedor

## Usuarios

| Email | Rol |
|---|---|
| gerencial@elpiamonte.com | Gerencial (acceso total) |
| admin@elpiamonte.com | Admin (operación completa) |
| ventas@elpiamonte.com | Ventas (sin ver costos) |

## Setup local

```bash
git clone https://github.com/jcqarenaza/gestion-comercio-piamonte
cd gestion-comercio-piamonte
npm install
cp .env.local.example .env.local   # completar con password de Supabase
npm run dev
```

## Deploy

```bash
vercel --prod
```
