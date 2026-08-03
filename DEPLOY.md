# Shipping PMV to Cloudflare

## What this is
- **Frontend:** React SPA (Vite) → Cloudflare **Pages**
- **API:** Hono on **Pages Functions** (`functions/api/*`) → served at `/api/*`
- **Database:** Cloudflare **D1** (SQLite), schema in `migrations/`
- **Sessions:** Cloudflare **KV**
- **Secret:** `SESSION_SECRET`

## One-time setup (Cloudflare dashboard + CLI)
1. `npx wrangler login`
2. Create the database:  `npx wrangler d1 create pmv`  → paste the returned `database_id` into `wrangler.toml`
3. Create the KV namespace:  `npx wrangler kv namespace create SESSIONS`  → paste the `id` into `wrangler.toml`
4. Set the secret:  `npx wrangler pages secret put SESSION_SECRET`
5. Apply the schema:  `npm run db:migrate`   (local dev: `npm run db:migrate:local`)

## Deploy
- **Git (recommended):** push to GitHub, then in the Cloudflare dashboard
  **Workers & Pages → Create → Pages → Connect to Git**. Settings below.
- **Direct upload:** `npm run deploy`

## Dashboard settings to select
| Field | Value |
|---|---|
| Framework preset | **None** (or "Vite") |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | 20 or later (set `NODE_VERSION=20` env var if needed) |

Bindings (Pages project → Settings → Functions): add the **D1** binding `DB` → `pmv`,
the **KV** binding `SESSIONS`, and the **SESSION_SECRET** secret. `wrangler.toml`
already declares these for CLI deploys; the dashboard needs them set on the project too.

## Verify
- `GET /api/health` → `{ ok: true }`
- Auth flow: `POST /api/auth/signup` (or `/api/auth/login`) → `GET /api/me`
  `SESSION_SECRET` doubles as the password-hashing pepper (see `functions/_lib/crypto.ts`) — it must be set for every environment, not just prod.
