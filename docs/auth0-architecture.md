# Auth0 client-portal sign-in

## Architecture

```
Auth0 Universal Login
  → GET /api/auth/auth0/callback (Hono / Cloudflare Pages Functions)
  → @auth0/auth0-auth-js AuthClient validates Authorization Code + PKCE,
    issuer, audience, signature, and expiration
  → external_identities row matched by issuer + subject
  → Pinnacle user (D1) authorization unchanged
  → createSession() rotates an opaque HttpOnly Secure SameSite=Lax cookie in KV
  → Client Portal
```

Auth0 is identity-only. Matters, documents, invoices, trusted-contact grants, and staff/client separation continue to use existing server-side checks against the internal `users` row and relationship tables.

We use `@auth0/auth0-auth-js` (Auth0’s official Authentication API SDK for JavaScript runtimes) instead of `@auth0/auth0-hono`, because the Hono middleware manages Auth0 session cookies and would create a parallel session system. Pinnacle’s KV-backed `pmv_session` remains the only application session.

## Account linking

Email match alone never links an Auth0 identity to an existing Pinnacle user. Linking requires an already-authenticated portal session that starts `mode=link` through `/api/auth/auth0/login`, and the provider must report a verified email. Conflicts (identity already linked elsewhere, email owned by another user) are rejected.

Unlinking refuses to remove the user’s final usable authentication method (password or remaining external identity).

## New Auth0 users

Unknown issuer+subject with a verified email that is not already registered creates a new client account bound only to that identity. Existing client relationships are never granted by email coincidence.

## Auth0 Organizations (deferred)

Pinnacle already models businesses and relationships in D1 (`relationship_parties`, `client_profiles`, invitations). Automatically creating an Auth0 Organization per client would distort that model. Future work may map Auth0 Organizations onto genuine multi-user business clients only, with:

- Pinnacle relationship records remaining authoritative
- Automatic org membership on login disabled
- Public org signup disabled
- Explicit invitation/approval required
- No mapping of Auth0 org roles onto granular Pinnacle resource permissions

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/auth0/status` | Public: whether Auth0 is enabled and which providers to show |
| GET | `/api/auth/auth0/login` | Start Authorization Code + PKCE |
| GET | `/api/auth/auth0/callback` | Exact production callback |
| POST | `/api/auth/auth0/link` | Authenticated helper returning link redirect |
| POST | `/api/auth/auth0/unlink` | Authenticated unlink |
| GET | `/api/auth/identities` | Authenticated list of connected methods |
| POST | `/api/auth/logout` | Local session revoke (Auth0 federated logout not required) |
