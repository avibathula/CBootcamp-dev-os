'use client'

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'

export type CustomTermInputProps = {
  terms: string[]
  standardTerms: string[]
  onChange: (terms: string[]) => void
  max?: number
}

export function CustomTermInput({ terms, standardTerms, onChange, max = 5 }: CustomTermInputProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | undefined>()

  const isFull = terms.length >= max

  function handleAdd() {
    const trimmed = draft.trim()
    if (!trimmed || isFull) return

    const isDuplicate = [...standardTerms, ...terms].some(
      (existing) => existing.toLowerCase() === trimmed.toLowerCase()
    )
    if (isDuplicate) {
      setError('This term is already in the list.')
      return
    }

    onChange([...terms, trimmed])
    setDraft('')
    setError(undefined)
  }

  function handleRemove(term: string) {
    onChange(terms.filter((t) => t !== term))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-secondary">Custom terms (optional)</p>
        <span className="text-body-sm text-text-secondary">
          {terms.length} / {max} added
        </span>
      </div>

      {terms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <Badge key={term} color="violet">
              {term}
              <button
                type="button"
                onClick={() => handleRemove(term)}
                aria-label={`Remove ${term}`}
                className="ml-1 text-violet-700 hover:text-violet-900"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="e.g. Non-compete radius"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(undefined)
            }}
            onKeyDown={handleKeyDown}
            error={error}
            disabled={isFull}
            aria-label="Add a custom key term"
          />
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={isFull || !draft.trim()}>
          + Add
        </Button>
      </div>
    </div>
  )
}
