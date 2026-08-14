import { AuthClient } from '@auth0/auth0-auth-js'
import type { Env } from './types'
import { resolveAuth0Config, type Auth0Config } from './auth0Config'

export type Auth0ClientFactory = (cfg: Auth0Config) => AuthClient

let clientFactory: Auth0ClientFactory = (cfg) =>
  new AuthClient({
    domain: cfg.domain,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    authorizationParams: {
      redirect_uri: cfg.callbackUrl,
      scope: 'openid profile email',
      ...(cfg.audience ? { audience: cfg.audience } : {}),
    },
  })

/** Test seam — swap the Auth0 AuthClient construction boundary. */
export function setAuth0ClientFactory(factory: Auth0ClientFactory | null) {
  clientFactory = factory || ((cfg) =>
    new AuthClient({
      domain: cfg.domain,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      authorizationParams: {
        redirect_uri: cfg.callbackUrl,
        scope: 'openid profile email',
        ...(cfg.audience ? { audience: cfg.audience } : {}),
      },
    }))
}

export function createAuth0Client(env: Env): { client: AuthClient; config: Auth0Config } | null {
  const config = resolveAuth0Config(env)
  if (!config.enabled) return null
  return { client: clientFactory(config), config }
}

export function auth0IssuerFromConfig(config: Auth0Config): string {
  return config.issuer
}
