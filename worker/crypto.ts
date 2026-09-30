function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptToken(value: string, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 characters')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, await encryptionKey(secret), new TextEncoder().encode(value))
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptToken(value: string, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 characters')
  const [version, encodedIv, encodedCiphertext] = value.split('.')
  if (version !== 'v1' || !encodedIv || !encodedCiphertext) throw new Error('Invalid encrypted token')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(encodedIv)) },
    await encryptionKey(secret),
    toArrayBuffer(base64UrlToBytes(encodedCiphertext)),
  )
  return new TextDecoder().decode(decrypted)
}
