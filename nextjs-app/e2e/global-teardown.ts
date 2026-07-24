import { readFileSync, existsSync } from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const AUTH_DIR = path.join(__dirname, '.auth')

async function globalTeardown() {
  const contextPath = path.join(AUTH_DIR, 'context.json')
  if (!existsSync(contextPath)) return

  const { userId }: { userId: string } = JSON.parse(readFileSync(contextPath, 'utf-8'))

  // Storage objects don't cascade from the auth.users FK — clean up explicitly.
  // upload.spec.ts creates an additional contract beyond the seeded one, so
  // list everything under this user's folder rather than deleting one path.
  try {
    const contractFolders = await fetch(`${SUPABASE_URL}/storage/v1/object/list/contracts`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }),
    }).then((r) => r.json())

    const filePaths: string[] = []
    for (const folder of contractFolders as { name: string }[]) {
      const files = await fetch(`${SUPABASE_URL}/storage/v1/object/list/contracts`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: `${userId}/${folder.name}/`, limit: 100 }),
      }).then((r) => r.json())
      for (const file of files as { name: string }[]) {
        filePaths.push(`${userId}/${folder.name}/${file.name}`)
      }
    }

    if (filePaths.length > 0) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/contracts`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: filePaths }),
      })
    }
  } catch {
    // best-effort cleanup; the user delete below is the important part
  }

  // Deleting the user cascades contracts, key_terms, chat data, and feedback.
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).catch(() => undefined)
}

export default globalTeardown
