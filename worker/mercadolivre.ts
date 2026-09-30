import { encryptToken } from './crypto'
import type { D1Database } from './types'

export const MERCADOLIVRE_AUTHORIZATION_URL = 'https://auth.mercadolivre.com.br/authorization'
export const MERCADOLIVRE_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
export const MERCADOLIVRE_USER_URL = 'https://api.mercadolibre.com/users/me'

export type MercadoLivreTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}

export async function exchangeAuthorizationCode(input: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<MercadoLivreTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  })
  const response = await fetch(MERCADOLIVRE_TOKEN_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('Mercado Livre token exchange failed')
  const token = (await response.json()) as Partial<MercadoLivreTokenResponse>
  if (!token.access_token || !token.refresh_token || typeof token.expires_in !== 'number') throw new Error('Mercado Livre token response was invalid')
  return token as MercadoLivreTokenResponse
}

export async function refreshMercadoLivreTokens(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<MercadoLivreTokenResponse> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: input.clientId, client_secret: input.clientSecret, refresh_token: input.refreshToken })
  const response = await fetch(MERCADOLIVRE_TOKEN_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('Mercado Livre token refresh failed')
  const token = (await response.json()) as Partial<MercadoLivreTokenResponse>
  if (!token.access_token || !token.refresh_token || typeof token.expires_in !== 'number') throw new Error('Mercado Livre refresh response was invalid')
  return token as MercadoLivreTokenResponse
}

export async function refreshAndStoreMercadoLivreTokens(input: { db: D1Database; integrationId: string; clientId: string; clientSecret: string; refreshToken: string; tokenEncryptionKey: string }): Promise<string> {
  const token = await refreshMercadoLivreTokens(input)
  const accessTokenEncrypted = await encryptToken(token.access_token, input.tokenEncryptionKey)
  const refreshTokenEncrypted = await encryptToken(token.refresh_token, input.tokenEncryptionKey)
  const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
  const result = await input.db.prepare("UPDATE integrations SET access_token_encrypted = ?1, refresh_token_encrypted = ?2, token_expires_at = ?3, scopes = ?4, status = 'CONNECTED', updated_at = datetime('now') WHERE id = ?5").bind(accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, token.scope ?? null, input.integrationId).run()
  if (result.meta && typeof result.meta.changes === 'number' && result.meta.changes !== 1) throw new Error('Integration was not found')
  return tokenExpiresAt
}

export async function fetchMercadoLivreUser(accessToken: string): Promise<{ id: string }> {
  const response = await fetch(MERCADOLIVRE_USER_URL, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error('Mercado Livre user lookup failed')
  const user = (await response.json()) as { id?: string | number }
  if (user.id === undefined || user.id === null) throw new Error('Mercado Livre user response was invalid')
  return { id: String(user.id) }
}
