import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { FeedbackRating, SubmitFeedbackRequest, SubmitFeedbackResponse } from '@/types'

const MAX_COMMENT_LENGTH = 1000

function isValidRating(value: unknown): value is FeedbackRating {
  return value === 'thumbs_up' || value === 'thumbs_down'
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth

  try {
    const body = (await request.json()) as Partial<SubmitFeedbackRequest>
    const contractId = body.contract_id
    const rating = body.rating
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

    if (typeof contractId !== 'string' || contractId.length === 0) {
      return Errors.badRequest('contract_id is required.')
    }
    if (!isValidRating(rating)) {
      return Errors.badRequest('rating must be "thumbs_up" or "thumbs_down".')
    }
    if (comment.length > MAX_COMMENT_LENGTH) {
      return Errors.badRequest(`comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`)
    }

    const supabase = createServiceRoleClient()

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, user_id')
      .eq('id', contractId)
      .single()

    if (contractError || !contract || contract.user_id !== user.id) {
      return Errors.forbidden('Contract not found or access denied.')
    }

    const { data: feedback, error: upsertError } = await supabase
      .from('user_feedback')
      .upsert(
        { contract_id: contractId, user_id: user.id, rating, comment: comment || null },
        { onConflict: 'contract_id' }
      )
      .select('id')
      .single()

    if (upsertError || !feedback) {
      logServerError('feedback:upsert', upsertError)
      return Errors.internal()
    }

    return NextResponse.json<SubmitFeedbackResponse>({ feedback_id: feedback.id }, { status: 200 })
  } catch (error) {
    logServerError('feedback', error)
    return Errors.internal()
  }
}
