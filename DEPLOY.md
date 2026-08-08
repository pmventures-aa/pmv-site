# Shipping PMV to Cloudflare

## What this is
- **Frontend:** React SPA (Vite) → Cloudflare **Pages**
- **API:** Hono on **Pages Functions** (`functions/api/*`) → served at `/api/*`
- **Database:** Cloudflare **D1** (SQLite), schema in `migrations/`
- **Sessions:** Cloudflare **KV**
- **Profile pictures:** Cloudflare **R2**

## Environment variables

| Name | Required | Scope | Purpose |
|---|---|---|---|
| `SESSION_SECRET` | **Yes** | Secret | Session cookie signing + password-hashing pepper (`functions/_lib/crypto.ts`). Must be set in every environment, not just prod — auth won't work without it. |
| `PAYMENT_ENCRYPTION_KEY` | **Yes** | Secret | Encrypts ACH routing/account numbers at rest (`functions/_lib/crypto.ts`). Use a long random value, separate from `SESSION_SECRET`. The banking-info step of a service application 500s without it. |
| `RESEND_API_KEY` | No | Secret | Enables real email delivery via [Resend](https://resend.com) for new inquiries and submitted service applications. Unset = sending silently no-ops (logged, not thrown) and everything stays in-app-only (activity feed + bell). |
| `RESEND_FROM_EMAIL` | No | Var (`wrangler.toml` `[vars]`) | The verified sender address emails send as. Only read when `RESEND_API_KEY` is set. |

**Local dev:** copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill in test values — `wrangler pages dev` reads it automatically.

**Deployed (CLI):** `npx wrangler pages secret put <NAME>` for each secret.

**Deployed (dashboard):** Pages project → Settings → Functions → add each secret, plus the `RESEND_FROM_EMAIL` var if using email.

## One-time setup (Cloudflare dashboard + CLI)
1. `npx wrangler login`
2. Create the database: `npx wrangler d1 create pmv` → paste the returned `database_id` into `wrangler.toml`
3. Create the KV namespace: `npx wrangler kv namespace create SESSIONS` → paste the `id` into `wrangler.toml`
4. Create the R2 bucket for profile pictures: `npx wrangler r2 bucket create pmv-uploads`, then **uncomment the `[[r2_buckets]]` block in `wrangler.toml`** and redeploy. It's commented out by default on purpose — Cloudflare Pages resolves every binding at deploy time, so referencing a bucket that doesn't exist yet fails the *entire deploy*, not just the avatar feature. Until you've done this, avatar uploads return a 503 in any deployed environment (the rest of the app is unaffected); local dev works regardless if you uncomment the binding locally (wrangler simulates R2 locally, same as D1) — just re-comment it before pushing until the real bucket exists.
5. Set the required secrets (see table above): `npx wrangler pages secret put SESSION_SECRET` and `npx wrangler pages secret put PAYMENT_ENCRYPTION_KEY`
6. Optional — email delivery: `npx wrangler pages secret put RESEND_API_KEY`, then set `RESEND_FROM_EMAIL` (uncomment the `[vars]` block in `wrangler.toml`), a **Notification email** in HQ → Settings → General (`firm_notify_email`, the fallback recipient for firm-wide events like a new inquiry with no assignee yet), and have individual staff opt in from HQ → Settings → Notifications (email is off per staff member by default even once the key is set).
7. Apply the schema: `npm run db:migrate` (local dev: `npm run db:migrate:local`)

## Deploy
- **GitHub Actions (recommended):** `.github/workflows/deploy.yml` builds, runs
  D1 migrations against `--remote`, and deploys to Pages on every push to
  `main` (or via **Actions → Deploy to Cloudflare Pages → Run workflow**).
  Requires two repo secrets (Settings → Secrets and variables → Actions):
  `CLOUDFLARE_API_TOKEN` (D1 Edit + Pages Edit permissions) and
  `CLOUDFLARE_ACCOUNT_ID`. Don't also connect this repo via the Cloudflare
  dashboard's "Connect to Git" — that runs Cloudflare's own build on push too
  and would double-deploy.
- **Manual / local:** push to GitHub, then in the Cloudflare dashboard
  **Workers & Pages → Create → Pages → Connect to Git**. Settings below.
  Migrations still need `npm run db:migrate` run separately (this path
  doesn't run them).
- **Direct upload:** `npm run deploy`

## Dashboard settings to select
| Field | Value |
|---|---|
| Framework preset | **None** (or "Vite") |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | 20 or later (set `NODE_VERSION=20` env var if needed) |

Bindings (Pages project → Settings → Functions): add the **D1** binding `DB` → `pmv`
and the **KV** binding `SESSIONS` now; add the **R2** binding `UPLOADS` → `pmv-uploads`
once the bucket exists and the `[[r2_buckets]]` block above is uncommented.
`wrangler.toml` declares each for CLI deploys as it's enabled; the dashboard needs
them set on the project too, alongside the secrets from the table above.

## Verify
- `GET /api/health` → `{ ok: true }`
- Auth flow: `POST /api/auth/signup` (or `/api/auth/login`) → `GET /api/me`
