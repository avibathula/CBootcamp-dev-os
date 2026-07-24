'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import type { FeedbackRating, UserFeedback, SubmitFeedbackResponse, ApiError } from '@/types'

export type FeedbackControlProps = {
  contractId: string
  existingFeedback: UserFeedback | null
}

const MAX_COMMENT_LENGTH = 1000

export function FeedbackControl({ contractId, existingFeedback }: FeedbackControlProps) {
  const supabase = useMemo(() => createClient(), [])
  const [rating, setRating] = useState<FeedbackRating | null>(existingFeedback?.rating ?? null)
  const [comment, setComment] = useState(existingFeedback?.comment ?? '')
  const [showComment, setShowComment] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | undefined>()

  function handleRate(nextRating: FeedbackRating) {
    setRating(nextRating)
    setShowComment(true)
    setIsSubmitted(false)
  }

  async function handleSubmit() {
    if (!rating || isSubmitting) return
    setIsSubmitting(true)
    setError(undefined)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError('Your session expired. Please sign in again.')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, rating, comment: comment.trim() }),
      })

      const body = (await response.json()) as SubmitFeedbackResponse | ApiError

      if (!response.ok) {
        setError('error' in body ? body.error : 'Something went wrong. Please try again.')
        return
      }

      setIsSubmitted(true)
      setShowComment(false)
      setTimeout(() => setIsSubmitted(false), 3000)
    } catch {
      setError("Couldn't save your feedback. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const remaining = MAX_COMMENT_LENGTH - comment.length

  return (
    <div className="flex flex-col gap-2 border-t border-grey-100 bg-grey-25 px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-text-secondary">Was this review helpful?</span>
        <button
          type="button"
          onClick={() => handleRate('thumbs_up')}
          aria-label="Thumbs up"
          aria-pressed={rating === 'thumbs_up'}
          className={[
            'text-h5 leading-none transition-colors duration-fast ease-out',
            rating === 'thumbs_up' ? 'text-blue-500' : 'text-grey-400 hover:text-grey-600',
          ].join(' ')}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => handleRate('thumbs_down')}
          aria-label="Thumbs down"
          aria-pressed={rating === 'thumbs_down'}
          className={[
            'text-h5 leading-none transition-colors duration-fast ease-out',
            rating === 'thumbs_down' ? 'text-blue-500' : 'text-grey-400 hover:text-grey-600',
          ].join(' ')}
        >
          👎
        </button>
        {isSubmitted && <span className="text-body-sm text-green-700">Thanks for your feedback</span>}
      </div>

      {showComment && (
        <div className="flex max-w-md flex-col gap-2">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder="Optional: tell us more…"
            rows={2}
            className="rounded-md border border-grey-100 px-3 py-2 text-body-sm text-text-primary focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className={['text-body-sm', remaining <= 20 ? 'text-red-500' : 'text-text-secondary'].join(' ')}>
              {remaining} characters left
            </span>
            <Button size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
              Submit
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-body-sm text-red-500">{error}</p>}
    </div>
  )
}
