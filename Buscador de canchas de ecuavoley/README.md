# ¿Dónde Hay Ecuavoley? (EcuaCanchas)

Buscador de canchas de ecuavoley (voleibol ecuatoriano), torneos y partidos abiertos. Cubre Ecuador y comunidades de la diáspora en España, Suiza, Italia, Bélgica y EEUU. Interfaz bilingüe es/en.

## Stack

- **React 18 + Vite** — sin SSR
- **Supabase** — Postgres + Auth + Storage + Edge Functions
- **React Router v7** · **Tanstack Query v5**
- **i18next** — traducciones en `src/locales/{es,en}`
- **Sentry** — captura de errores, opcional (ver `.env.example`)

## Requisitos

- Node 20+
- Una cuenta de Supabase con proyecto vinculado (ver `supabase/README.md`)

## Setup

```bash
npm install
cp .env.example .env   # rellenar las claves, ver detalle abajo
npm run dev
```

Variables de entorno (`.env`, nunca se commitea):

| Variable | De dónde sale |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Dashboard de Supabase → Settings → API |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console |
| `VITE_SITE_URL` | URL pública del sitio desplegado |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` (la clave privada va como secreto de la Edge Function `send-push`, nunca en el frontend) |
| `VITE_SENTRY_DSN` | Opcional — sentry.io. Vacío desactiva el error tracking por completo, sin tocar código |

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción (genera sitemap antes, snapshots después)
npm run preview  # sirve el build localmente
npm test         # tests unitarios (vitest)
npm run lint     # eslint
npm run generar:og-image   # regenera public/og-image.png a mano (no corre en cada build)
```

## Estructura

```
src/
  pages/           rutas de la app
  components/      componentes compartidos
  design-system/   tokens y primitivos de UI
  hooks/           hooks reutilizables (useAuth, useFavoritos, ...)
  lib/             wrappers de Supabase, un módulo por dominio (canchas, torneos, admin, ...)
  locales/         traducciones es/en (i18next)

supabase/
  migrations/      estado real de producción (ver supabase/README.md)
  functions/       Edge Functions (Deno)
  schema_*.sql     histórico de fixes aplicados a mano, ya no es el camino para cambios nuevos
```

Para el proceso de cambios de base de datos (migraciones, RLS, convenciones) → leer **`supabase/README.md`**.

## Deploy

Vercel, build con `npm run build`. Headers de seguridad y CSP ya configurados en `vercel.json` (scopeada a Supabase, Google Maps y Open-Meteo — no usar `unsafe-*` genérico si se agregan nuevos orígenes).
