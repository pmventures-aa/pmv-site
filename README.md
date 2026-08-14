# Pinnacle Management Ventures — Website & Client Portal

The official site and secure client platform for **Pinnacle Management Ventures (PMV)** —
business formation, compliance, tax, bookkeeping, funding, and property support under one roof.

Built to run entirely on **Cloudflare** (Pages + Functions + D1 + KV).

> **Building stronger businesses and creating lasting value.**

---

## What's here

| Area | Path | Status |
|------|------|--------|
| Public marketing site | `src/pages/Home.tsx` | Built |
| Brand design system (navy/gold, Inter Tight, glass cards) | `src/components/ui.tsx` | Built |
| Client portal | `src/pages/PortalPlaceholder.tsx` (`/portal`) | Scaffold |
| Staff admin console | `src/pages/AdminPlaceholder.tsx` (`/admin`) | Scaffold |
| API (Hono on Pages Functions) | `functions/api/` (`/api/*`) | Foundation |
| Database schema | `migrations/0001_init.sql` | Loaded to D1 |
| Cloudflare config | `wrangler.toml` | Wired to D1 + KV |

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Hosting:** Cloudflare Pages
- **API:** Hono, running as Cloudflare Pages Functions at `/api/*`
- **Database:** Cloudflare D1 (SQLite) — 18 tables, app-level access control
- **Sessions:** Cloudflare KV
- **Auth:** Email + password (PBKDF2-SHA256, HMAC-peppered), opaque KV-backed sessions; optional Auth0 Universal Login (Google/Microsoft) as an alternate identity provider for the client portal

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173 (frontend only — no /api/*)
```

To exercise the API too (auth, portal, admin), build and run through Wrangler instead —
see **DEPLOY.md** for local secrets setup (`.dev.vars.example`) and the exact commands.

## Build

```bash
npm run build      # outputs to dist/
```

## Deploy to Cloudflare Pages

This repo connects to Cloudflare Pages via Git — every push auto-deploys.

Build settings (Cloudflare dashboard):

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `20` (env var `NODE_VERSION`) |

Bindings to attach to the Pages project:

- D1 database `DB` -> `pmv`
- KV namespace `SESSIONS` -> `pmv-sessions`

The exact IDs are already in `wrangler.toml`. See **DEPLOY.md** for the full step-by-step,
including the required/optional secrets, local dev setup (`.dev.vars.example`), and how
the database schema is applied.

## Project structure

```
src/                     React frontend
  components/ui.tsx       design-system primitives
  pages/                  Home, Portal, Admin
  main.tsx                router
  index.css               Tailwind + brand styles
functions/               Cloudflare Pages Functions (API)
  api/[[route]].ts        Hono router: /api/health, /api/auth/*, /api/me
  _lib/                   crypto, sessions, access control
migrations/              D1 SQL schema
public/_redirects        SPA routing for Cloudflare Pages
wrangler.toml            Cloudflare bindings
DEPLOY.md                deployment guide
README.md
```

## Compliance note

PMV is not a law firm and does not provide legal advice. Tax services are delivered by
qualified professionals; funding assistance may involve referrals to independent third-party
lenders who alone determine approval and terms. No outcome is guaranteed. These disclosures
are reflected in the site footer and portal copy.

---

(c) Pinnacle Management Ventures. All rights reserved.
