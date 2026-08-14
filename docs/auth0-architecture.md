# Auth0 client portal sign-in

## Architecture

```
Auth0 Universal Login
  → GET /api/auth/auth0/callback (official @auth0/auth0-server-js validation)
  → external_identities lookup by issuer + subject
  → Pinnacle KV session cookie (pmv_session)
  → Client portal
```

Auth0 authenticates identity only. Authorization for matters, documents,
invoices, trusted contacts, and every other resource remains in Pinnacle’s
API + D1 relationship/grant tables.

Auth0 Organizations are **deferred**. Multi-user business clients continue to
use Pinnacle’s internal relationship graph. Do not map Auth0 org roles to
Pinnacle permissions.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/auth0/providers` | Public: which provider buttons to show |
| GET | `/api/auth/auth0/login` | Start Authorization Code + PKCE |
| GET | `/api/auth/auth0/callback` | Complete Auth0 login or link |
| POST | `/api/auth/auth0/link` | Authenticated connect Google/Microsoft |
| POST | `/api/auth/auth0/unlink` | Authenticated disconnect |
| GET | `/api/auth/identities` | List connected methods |
| POST | `/api/auth/logout` | Invalidate local Pinnacle session (Auth0 federated logout not required) |

## Account linking

Email match alone never links an Auth0 identity to a Pinnacle user. Linking
requires an already authenticated portal user to choose **Connect Google** or
**Connect Microsoft** on Account → Security. Unlinking the final usable method
is blocked.

## Tokens

Short-lived OIDC transaction cookies hold PKCE/state only. Auth0 ID/access/
refresh tokens stay in request-scoped Worker memory during callback processing
and are discarded — never written to `localStorage`, `sessionStorage`, or the
long-lived application session.
