import {
  CookieTransactionStore,
  ServerClient,
  MissingTransactionError,
  type UserClaims,
} from '@auth0/auth0-server-js'
import type { Env } from '../types'
import { inspectAuth0Config, type Auth0Config } from './config'
import { EphemeralStateStore, HonoCookieHandler, type Auth0StoreOptions } from './stores'

export type Auth0LoginIntent = 'login' | 'link'

export interface Auth0AppState {
  intent: Auth0LoginIntent
  returnTo: string
  connection: string
  provider: string
  userId?: string
}

export interface CompletedAuth0Login {
  appState?: Auth0AppState
  user: UserClaims
}

export interface Auth0Sdk {
  startInteractiveLogin(options: {
    appState?: Auth0AppState
    authorizationParams?: Record<string, unknown>
  }, storeOptions: Auth0StoreOptions): Promise<URL>
  completeInteractiveLogin(url: URL, storeOptions: Auth0StoreOptions): Promise<{ appState?: Auth0AppState }>
  getUser(storeOptions: Auth0StoreOptions): Promise<UserClaims | undefined>
}

const cookieHandler = new HonoCookieHandler()
const ephemeralStateStore = new EphemeralStateStore()

export function createAuth0ServerClient(env: Env, config: Auth0Config): ServerClient<Auth0StoreOptions> {
  const authorizationParams: Record<string, string> = {
    redirect_uri: config.callbackUrl,
    scope: 'openid profile email',
  }
  if (config.audience) authorizationParams.audience = config.audience

  return new ServerClient<Auth0StoreOptions>({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationParams,
    transactionIdentifier: 'pmv_auth0_tx',
    stateIdentifier: 'pmv_auth0_state',
    transactionStore: new CookieTransactionStore({ secret: env.SESSION_SECRET }, cookieHandler),
    stateStore: ephemeralStateStore,
  })
}

let testClient: Auth0Sdk | null = null

export function __setAuth0SdkForTests(client: Auth0Sdk | null): void {
  testClient = client
}

export function getAuth0Sdk(env: Env): Auth0Sdk | null {
  if (testClient) return testClient
  const inspected = inspectAuth0Config(env)
  if (inspected.status !== 'ready') return null
  return createAuth0ServerClient(env, inspected.config)
}

export { MissingTransactionError }

export function redactAuth0Error(error: unknown): string {
  const message = error instanceof Error ? error.message : 'authentication failed'
  return message
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(code|state|id_token|access_token|refresh_token|client_secret)=[^&\s]+/gi, '$1=[redacted]')
    .slice(0, 300)
}
