import { CookieTransactionStore, ServerClient } from '@auth0/auth0-server-js'
import type { Env } from '../types'
import { uuid } from '../crypto'
import { AUTH0_CONNECTION_LABELS, type Auth0Config, type Auth0ConnectionId, auth0Issuer, resolveAuth0CallbackUrl } from './config'
import { applySetCookies, Auth0StoreOptions, DiscardingAuth0StateStore, HonoCookieHandler } from './cookies'
import { stripAuthorizationClaims, type Auth0IdentityClaims, type Auth0Purpose } from './identity'
import type { Auth0Surface } from './returnTo'

export interface Auth0AppState {
  purpose: Auth0Purpose
  surface: Auth0Surface
  returnTo: string | null
  loginPath: string
  connection: Auth0ConnectionId
  linkingUserId?: string
  state: string
}

export interface CompletedAuth0Login {
  claims: Auth0IdentityClaims
  appState: Auth0AppState
  cookies: string[]
}

export interface Auth0Flow {
  startLogin(input: {
    connection: Auth0ConnectionId
    purpose: Auth0Purpose
    surface: Auth0Surface
    returnTo: string | null
    loginPath: string
    linkingUserId?: string
    request: Request
  }): Promise<{ url: URL; cookies: string[] }>
  completeLogin(url: URL, request: Request): Promise<CompletedAuth0Login>
  buildLogoutUrl(returnTo: string): string
}

const TX_COOKIE = 'pmv_auth0_tx'

function createServerClient(config: Auth0Config, env: Env) {
  const cookieHandler = new HonoCookieHandler()
  return new ServerClient<Auth0StoreOptions>({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationParams: {
      redirect_uri: config.callbackUrl,
      scope: 'openid profile email',
    },
    transactionIdentifier: TX_COOKIE,
    stateIdentifier: 'pmv_auth0_unused_session',
    transactionStore: new CookieTransactionStore({ secret: env.SESSION_SECRET }, cookieHandler),
    stateStore: new DiscardingAuth0StateStore(),
  })
}

function claimsFromSession(raw: Record<string, unknown> | undefined, connection: Auth0ConnectionId, issuer: string): Auth0IdentityClaims {
  const claims = stripAuthorizationClaims(raw)
  return {
    ...claims,
    issuer: claims.issuer || issuer,
    connection,
  }
}

export function createAuth0Flow(config: Auth0Config, env: Env): Auth0Flow {
  const client = createServerClient(config, env)
  const issuer = auth0Issuer(config)

  return {
    async startLogin(input) {
      const store: Auth0StoreOptions = { request: input.request, cookies: [] }
      const state = uuid()
      const appState: Auth0AppState = {
        purpose: input.purpose,
        surface: input.surface,
        returnTo: input.returnTo,
        loginPath: input.loginPath,
        connection: input.connection,
        linkingUserId: input.linkingUserId,
        state,
      }
      const redirectUri = resolveAuth0CallbackUrl(config, input.request.url)
      const url = await client.startInteractiveLogin({
        appState,
        authorizationParams: {
          redirect_uri: redirectUri,
          scope: 'openid profile email',
          connection: input.connection,
          state,
        },
      }, store)
      return { url, cookies: store.cookies }
    },

    async completeLogin(url, request) {
      const store: Auth0StoreOptions = { request, cookies: [] }
      let result: { appState?: Auth0AppState }
      try {
        result = await client.completeInteractiveLogin<Auth0AppState>(url, store)
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'MissingTransactionError') throw new Error('missing_transaction')
        if (name === 'TokenByCodeError') throw new Error('invalid_token')
        throw new Error('invalid_token')
      }
      const appState = result.appState
      if (!appState?.state || !appState.connection) throw new Error('missing_transaction')
      if (url.searchParams.get('state') !== appState.state) throw new Error('invalid_state')
      const user = store.capturedSession?.user as Record<string, unknown> | undefined
      const claims = claimsFromSession(user, appState.connection, issuer)
      store.capturedSession = undefined
      if (!claims.subject || !claims.issuer) throw new Error('invalid_token')
      return { claims, appState, cookies: store.cookies }
    },

    buildLogoutUrl(returnTo: string) {
      return client.authClient.buildLogoutUrl({ returnTo }).toString()
    },
  }
}

let testFlow: Auth0Flow | null = null

export function setAuth0FlowForTests(flow: Auth0Flow | null) {
  testFlow = flow
}

export function getAuth0Flow(config: Auth0Config, env: Env): Auth0Flow {
  return testFlow || createAuth0Flow(config, env)
}

export function appendCookies(response: Response, cookies: string[]) {
  applySetCookies(response.headers, cookies)
  return response
}

export function connectionLabel(id: string): string {
  return AUTH0_CONNECTION_LABELS[id] || id
}
