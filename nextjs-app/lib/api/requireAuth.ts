import { createClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { Errors } from './errors'

export type AuthenticatedUser = { id: string; email: string }

export type AuthResult =
  | { user: AuthenticatedUser; error?: undefined }
  | { user?: undefined; error: NextResponse }

/**
 * Validates the `Authorization: Bearer <supabase_jwt>` header present on
 * every protected API route (engineering doc §9). Uses a stateless anon-key
 * client — no cookie/session state, just token verification.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!token) {
    return { error: Errors.unauthorized() }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user || !data.user.email) {
    return { error: Errors.unauthorized() }
  }

  return { user: { id: data.user.id, email: data.user.email } }
}
