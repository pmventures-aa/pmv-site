# Pinnacle Management Ventures — Site

Vite + React + TypeScript + Tailwind, configured for **Cloudflare Pages**.

## Develop
```bash
npm install
npm run dev
```

## Build
```bash
npm run build     # outputs to dist/
```

## Deploy to Cloudflare Pages
Option A — Git: push this repo, connect it in the Cloudflare dashboard
(Build command: `npm run build`, Output dir: `dist`).

Option B — Direct upload:
```bash
npm run deploy    # runs build + `wrangler pages deploy dist`
```
First run: `npx wrangler login`.

## Structure
- `src/pages/Home.tsx` — public marketing site
- `src/pages/PortalPlaceholder.tsx` — `/portal` client portal (scaffold)
- `src/pages/AdminPlaceholder.tsx` — `/admin` staff console (scaffold)
- `src/components/ui.tsx` — brand design system (navy/gold, Inter Tight)
- `public/_redirects` — SPA routing for Cloudflare Pages
- `wrangler.toml` — Cloudflare Pages config

## Backend (Phase 1)
See **DEPLOY.md**. API lives in `functions/api/` (Hono), schema in `migrations/0001_init.sql`.
Auth: email OTP + optional password, session in KV, access control mirroring Base44 RLS
(`functions/_lib/access.ts`). Endpoints: `/api/health`, `/api/auth/*`, `/api/me`, `/api/portal/matters`.
