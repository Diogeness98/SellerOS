function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function createOAuthState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function createCodeVerifier(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(48)))
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return bytesToBase64Url(new Uint8Array(digest))
}
