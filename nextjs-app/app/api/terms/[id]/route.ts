import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { UpdateTermRequest, UpdateTermResponse } from '@/types'

const MAX_VALUE_LENGTH = 2000

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth

  try {
    const body = (await request.json()) as Partial<UpdateTermRequest>
    const value = body.value

    if (typeof value !== 'string' || value.trim().length === 0) {
      return Errors.badRequest('value must be a non-empty string.')
    }
    if (value.length > MAX_VALUE_LENGTH) {
      return Errors.badRequest(`value must be ${MAX_VALUE_LENGTH} characters or fewer.`)
    }

    const supabase = createServiceRoleClient()

    const { data: existing, error: fetchError } = await supabase
      .from('key_terms')
      .select('id, user_id, value, original_value, is_edited')
      .eq('id', params.id)
      .single()

    if (fetchError || !existing || existing.user_id !== user.id) {
      return Errors.forbidden()
    }

    // Preserve the AI's original value exactly once — subsequent edits never
    // overwrite it (docs/specs/05 §3).
    const originalValue = existing.is_edited ? existing.original_value : existing.value

    const { data: updated, error: updateError } = await supabase
      .from('key_terms')
      .update({ value: value.trim(), is_edited: true, original_value: originalValue })
      .eq('id', params.id)
      .select('id, value, is_edited, original_value')
      .single()

    if (updateError || !updated) {
      logServerError('terms:update', updateError)
      return Errors.internal()
    }

    return NextResponse.json<UpdateTermResponse>(updated, { status: 200 })
  } catch (error) {
    logServerError('terms', error)
    return Errors.internal()
  }
}
