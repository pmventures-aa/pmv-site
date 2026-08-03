# Shipping PMV to Cloudflare

## What this is
- **Frontend:** React SPA (Vite) → Cloudflare **Pages**
- **API:** Hono on **Pages Functions** (`functions/api/*`) → served at `/api/*`
- **Database:** Cloudflare **D1** (SQLite), schema in `migrations/`
- **Sessions:** Cloudflare **KV**
- **Secrets:** `SESSION_SECRET`, `PAYMENT_ENCRYPTION_KEY`, `RESEND_API_KEY` (optional)

## One-time setup (Cloudflare dashboard + CLI)
1. `npx wrangler login`
2. Create the database:  `npx wrangler d1 create pmv`  → paste the returned `database_id` into `wrangler.toml`
3. Create the KV namespace:  `npx wrangler kv namespace create SESSIONS`  → paste the `id` into `wrangler.toml`
4. Set the secrets:
   - `npx wrangler pages secret put SESSION_SECRET`
   - `npx wrangler pages secret put PAYMENT_ENCRYPTION_KEY` — encrypts ACH routing/account numbers at rest (see `functions/_lib/crypto.ts`). Use a long random value, separate from `SESSION_SECRET`. Required before any client submits banking info on a service application — the endpoint 500s without it.
   - **Optional — email delivery ([Resend](https://resend.com)):** new inquiries and service applications currently only notify in-app (activity feed + bell). To also send real email:
     1. Create a Resend account, verify a sending domain (or use their shared test domain while testing).
     2. `npx wrangler pages secret put RESEND_API_KEY`
     3. Set the `RESEND_FROM_EMAIL` var in `wrangler.toml` (or as a dashboard env var) to a verified sender, e.g. `Pinnacle Management Ventures <notifications@pinnaclemanagementventures.com>`.
     4. Set a **Notification email** in HQ → Settings → General (`firm_notify_email`) — this is the fallback recipient for firm-wide events (like a brand-new inquiry with no assigned staff yet).
     5. Individual staff opt into email per-event from HQ → Settings → Notifications (or their own notification preferences) — email is off by default per staff member even once the key is set.
     Without `RESEND_API_KEY` set, sending silently no-ops (logged, not thrown) — nothing breaks, it just stays in-app-only.
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
the **KV** binding `SESSIONS`, and the **SESSION_SECRET** / **PAYMENT_ENCRYPTION_KEY**
secrets. `wrangler.toml` already declares the D1/KV bindings for CLI deploys; the
dashboard needs them (and both secrets) set on the project too.

## Verify
- `GET /api/health` → `{ ok: true }`
- Auth flow: `POST /api/auth/signup` (or `/api/auth/login`) → `GET /api/me`
  `SESSION_SECRET` doubles as the password-hashing pepper (see `functions/_lib/crypto.ts`) — it must be set for every environment, not just prod.
