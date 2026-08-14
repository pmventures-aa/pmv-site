# Shipping PMV to Cloudflare

## Domain layout

Post-authentication surfaces (Client Portal + Pinnacle HQ) live behind
`secure.pinnaclemanagementventures.com`. The public marketing site stays at
`www.pinnaclemanagementventures.com`.

| Host | Purpose | Detected in `src/main.tsx` as |
|---|---|---|
| `www.pinnaclemanagementventures.com` | Public marketing site | `surface: 'public'` |
| `secure.pinnaclemanagementventures.com/` | Client Portal (post-signup) | `surface: 'portal'` with basePath `''` |
| `secure.pinnaclemanagementventures.com/hq/*` | Pinnacle HQ (staff/admin) | `surface: 'admin'` with basePath `'/hq'` |
| `hq.pinnaclemanagementventures.com` | Legacy HQ host — still routes to admin | `surface: 'admin'` |
| `client.pinnaclemanagementventures.com` | Legacy portal host — still routes to portal | `surface: 'portal'` |

### DNS + Cloudflare Pages setup for `secure.`
1. In Cloudflare DNS, add a `CNAME secure` → `pmv-site.pages.dev` (proxied).
2. In the Pages project → Custom domains, add `secure.pinnaclemanagementventures.com`. Cloudflare provisions a TLS cert automatically.
3. Session cookies use `SameSite=Lax; Secure; HttpOnly` scoped to the current host — no shared cross-subdomain cookie is needed because both portal and HQ live on the same `secure.` host now.
4. Update Resend + application email templates to link to `https://secure.pinnaclemanagementventures.com/…` (portal home = `/`, HQ home = `/hq`).
5. Keep the legacy `hq.` and `client.` hosts pointed at the same Pages project during the cutover; they still work. Retire them after 30 days of low traffic.


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
| `RESEND_API_KEY` | No | Secret | Enables real email delivery via Resend for notifications, Communications, account welcomes/invitations, vendor notices, and access reminders. Unset ordinary notification email no-ops; tracked account-email attempts are recorded as `skipped` in HQ instead of breaking account creation. |
| `RESEND_FROM_EMAIL` | No | Var (`wrangler.toml` `[vars]`) | Verified sender identity. The code defaults to `Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>` if this is not set. |
| `RESEND_WEBHOOK_SECRET` | No | Secret | Optional Cloudflare copy of the Svix signing secret for `POST /api/webhooks/resend`. HQ → Settings → General can create the Resend webhook and store this secret in D1 instead. |
| `RESEND_INBOUND_DOMAIN` | No | Var (`wrangler.toml` `[vars]`) | Resend receiving domain. Defaults in wrangler to `ziloifaluk.resend.app`. Used only as Reply-To so replies can be received without changing pinnaclemanagementventures.com MX or the From address. |
| `AUTH0_DOMAIN` | No | Secret / Var | Auth0 tenant domain (for example `your-tenant.us.auth0.com`). Required together with `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET` to enable client-portal social sign-in. |
| `AUTH0_CLIENT_ID` | No | Secret / Var | Auth0 Regular Web Application client ID. |
| `AUTH0_CLIENT_SECRET` | No | Secret | Auth0 Regular Web Application client secret. Never expose this to the frontend. |
| `AUTH0_AUDIENCE` | No | Secret / Var | Optional Auth0 API audience when your tenant requires it. |
| `AUTH0_CALLBACK_URL` | No | Var | OAuth callback URL. Production: `https://www.pinnaclemanagementventures.com/api/auth/auth0/callback`. Local dev: `http://127.0.0.1:8788/api/auth/auth0/callback`. |
| `AUTH0_LOGOUT_URL` | No | Var | Post-logout return URL. Production: `https://www.pinnaclemanagementventures.com/portal/login`. |
| `AUTH0_CONNECTION_GOOGLE` | No | Var | Auth0 connection name for Google (for example `google-oauth2`). Provider button stays hidden until set. |
| `AUTH0_CONNECTION_MICROSOFT` | No | Var | Auth0 connection name for Microsoft (for example `windowslive`). Provider button stays hidden until set. |

**Local dev:** copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill in test values — `wrangler pages dev` reads it automatically.

**Deployed (CLI):** `npx wrangler pages secret put <NAME>` for each secret.

**Deployed (dashboard):** Pages project → Settings → Functions → add each secret, plus the `RESEND_FROM_EMAIL` var if overriding the built-in sender.

## One-time setup (Cloudflare dashboard + CLI)
1. `npx wrangler login`
2. Create the database: `npx wrangler d1 create pmv` → paste the returned `database_id` into `wrangler.toml`
3. Create the KV namespace: `npx wrangler kv namespace create SESSIONS` → paste the `id` into `wrangler.toml`
4. Create the R2 bucket for profile pictures: `npx wrangler r2 bucket create pmv-uploads`, then **uncomment the `[[r2_buckets]]` block in `wrangler.toml`** and redeploy. It's commented out by default on purpose — Cloudflare Pages resolves every binding at deploy time, so referencing a bucket that doesn't exist yet fails the *entire deploy*, not just the avatar feature. Until you've done this, avatar uploads return a 503 in any deployed environment (the rest of the app is unaffected); local dev works regardless if you uncomment the binding locally (wrangler simulates R2 locally, same as D1) — just re-comment it before pushing until the real bucket exists.
5. Set the required secrets (see table above): `npx wrangler pages secret put SESSION_SECRET` and `npx wrangler pages secret put PAYMENT_ENCRYPTION_KEY`
6. Email delivery:
   - Verify `pinnaclemanagementventures.com` as a sending domain in Resend using the exact DNS records Resend provides.
   - Preserve the existing Apple/iCloud receiving MX records for `orders@pinnaclemanagementventures.com`; Resend is the application sender, not the human inbox host.
   - Set `RESEND_API_KEY` with `npx wrangler pages secret put RESEND_API_KEY`.
   - Optional: set `RESEND_FROM_EMAIL`; otherwise application mail already defaults to `Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>`.
   - Set a **Notification email** in HQ → Settings → General (`firm_notify_email`) for firm-wide staff notifications and let individual staff choose their notification preferences in HQ → Settings → Notifications.
7. Apply the schema: `npm run db:migrate` (local dev: `npm run db:migrate:local`). Migration `0029_account_email_delivery.sql` adds durable account-email state and webhook dedupe storage.

## Resend account-email webhook

PR #36 adds provider delivery tracking for account welcomes, invitations, vendor emails, and portal reminders. PMV stores the provider email ID when Resend accepts a message, then a signed webhook updates that record as delivery events arrive.

An empty Resend **Webhooks** dashboard is expected until HQ creates the endpoint. Do not wait on a dashboard row that is not there.

### Production setup
1. Confirm `RESEND_API_KEY` is set in Cloudflare Pages.
2. In HQ → Settings → General, use **Create webhook**. That calls `POST https://api.resend.com/webhooks` and registers:
   `https://www.pinnaclemanagementventures.com/api/webhooks/resend`
3. The created webhook is subscribed to:
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.failed`
   - `email.complained`
   - `email.suppressed`
   - `email.received` (inbound replies; webhook is metadata-only, HQ then fetches the body from `GET /emails/receiving/{id}`)
4. HQ stores the signing secret returned on create (`whsec_...`) in `app_settings`. The webhook handler accepts that stored secret or an optional Cloudflare `RESEND_WEBHOOK_SECRET`.
5. After create, Resend → Webhooks should show the PMV endpoint. Send a test account invitation from HQ → Users and confirm the Account email column advances from `sent` to `delivered` after the callback.

Optional fallback if HQ cannot reach Resend: create the same endpoint in the dashboard or with `curl -X POST https://api.resend.com/webhooks`, then `npx wrangler pages secret put RESEND_WEBHOOK_SECRET --project-name pmv-site`.

## Resend receiving (threaded replies)

HQ conversation mail still **sends from** the verified `pinnaclemanagementventures.com` address in `RESEND_FROM_EMAIL`. Do not point that domain's MX at Resend; Apple/iCloud continues to receive `orders@pinnaclemanagementventures.com`.

Replies are captured on Resend's managed receiving domain (`anything@ziloifaluk.resend.app` unless `RESEND_INBOUND_DOMAIN` is overridden):

1. In Resend → Emails → Receiving, confirm the receiving address (`ziloifaluk.resend.app` or the address shown for the team).
2. Create the webhook from HQ → Settings → General if Resend → Webhooks is empty. That same webhook includes `email.received`.
3. HQ compose/reply sets `Reply-To` to `t-{threadId}@ziloifaluk.resend.app`. Recipients still see From as Pinnacle. When they hit Reply, Resend receives it, posts `email.received`, and HQ fetches HTML/text/headers from the Receiving API and attaches the message to that thread.
4. Operational Email Center sends use `hq@ziloifaluk.resend.app` as Reply-To so those answers also land in HQ instead of a personal inbox.
5. Invitations, invoices, quotes, and account mail keep Reply-To on `orders@` / `support@` so the human firm inbox is unchanged.

The webhook body does **not** include the email body. That is Resend's current receiving design. HQ always follows `email.received` with `GET https://api.resend.com/emails/receiving/{email_id}`.

### Security behavior
- The webhook reads and verifies the **raw request body** before JSON parsing.
- It verifies `svix-id`, `svix-timestamp`, and `svix-signature` using the Resend webhook secret.
- Callbacks outside the timestamp tolerance are rejected.
- `svix-id` is stored as a primary key so duplicate webhook retries are harmless.
- No unsigned endpoint can change email delivery status.

## Account welcome/invitation behavior

The app owns its transactional templates in `functions/_lib/emailTemplates/`, while Resend is only the delivery provider.

- **Client self-signup:** account is created and logged in immediately; a branded welcome email links to the Client Portal home. Account creation is not rolled back if email is unavailable.
- **HQ-created client:** receives a branded one-time setup invitation for the Client Portal.
- **HQ-created staff/admin:** receives a branded one-time setup invitation for Pinnacle HQ.
- **Lead → client conversion:** the conversion-generated activation token is now included in the branded setup email.
- **Vendor self-signup:** receives a pending-review receipt; sign-in remains blocked until approval.
- **Vendor approval:** approval from Team & Vendors sends an approval confirmation linking to HQ.
- **Resend setup:** HQ → Users can issue a fresh setup email while no password exists. Generating a fresh activation token invalidates the previous setup URL.
- **Existing account:** HQ → Users sends a portal reminder instead of generating a new setup token once a password exists.

HQ tracks provider state as `sent`, `delivered`, `delayed`, `bounced`, `failed`, `complained`, `suppressed`, or `skipped` (provider not configured). The manual copyable setup URL remains available as a fallback after account creation.

## Deploy
- **Build + deploy:** already handled by Cloudflare Pages' own dashboard Git
  integration (Workers & Pages → `pmv-site` → Settings → Builds & deployments)
  — it builds and deploys automatically on every push (production on `main`,
  preview URLs on other branches/PRs). Don't add a second GitHub Actions step
  that also runs `wrangler pages deploy`; that would double-deploy alongside it.
- **D1 migrations:** the dashboard integration only builds and deploys the
  Pages app — it never touches the database. `.github/workflows/db-migrate.yml`
  covers that gap: it runs `npm run db:migrate` (`--remote`) on every push to
  `main`, or on demand via **Actions → Apply D1 migrations → Run workflow**.
  Requires two repo secrets (Settings → Secrets and variables → Actions):
  `CLOUDFLARE_API_TOKEN` (D1 Edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
- **Direct upload (manual, rarely needed):** `npm run deploy`

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
- Client self-signup lands on the Client Portal dashboard, not a mandatory onboarding gate.
- HQ → Users → Create user automatically attempts the appropriate account invitation and preserves a manual setup-link fallback.
- Resend webhook rejects requests without a valid signature.

## D1 migrations to confirm after deploy
Pages deploys do not apply SQL. Confirm GitHub Action **Apply D1 migrations** succeeded on `main`, or run `npm run db:migrate`. Recent field-work migrations:

| File | What it does |
|---|---|
| `0073_dispatch_vendor_fees.sql` | Vendor fee columns on `field_assignments` (Snapdocs-style local adjustment) |
| `0074_field_work_query_indexes.sql` | Indexes for vendor list, field map, and fee-estimate postal lookups |

Verify with `SELECT vendor_fee_cents FROM field_assignments LIMIT 1;` and `PRAGMA index_list('field_assignments');` in the D1 console.
