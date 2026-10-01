import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const sql = `INSERT INTO validation_invites (id, token_hash, expires_at) VALUES ('${randomUUID()}', '${hash}', '${expiresAt}')`
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'selleros-db', '--remote', '--command', sql], { stdio: 'ignore' })
if (result.status !== 0) { console.error('VALIDATION INVITE CREATION FAILED'); process.exit(1) }
console.log('VALIDATION INVITE CREATED')
console.log(`Expires: ${expiresAt}`)
console.log('Link:')
console.log(`https://selleros.xxxdiogenes.workers.dev/#invite=${token}`)
