'use client'

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfidenceIndicator } from './ConfidenceIndicator'
import type { KeyTerm } from '@/types'

export type TermCardProps = {
  term: KeyTerm
  onPageClick: (page: number) => void
  onSave: (id: string, value: string) => Promise<void>
}

export function TermCard({ term, onPageClick, onSave }: TermCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(term.value ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  async function commitEdit() {
    const trimmed = draft.trim()

    if (trimmed === '' || trimmed === term.value) {
      setDraft(term.value ?? '')
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setSaveError(false)

    try {
      await onSave(term.id, trimmed)
      setIsEditing(false)
    } catch {
      setDraft(term.value ?? '')
      setSaveError(true)
      setTimeout(() => setSaveError(false), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    } else if (event.key === 'Escape') {
      setDraft(term.value ?? '')
      setIsEditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-grey-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <p className="text-body-lg font-medium text-text-primary">{term.term_name}</p>
        {term.is_custom && <Badge color="violet">Custom</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isEditing ? (
          <input
            autoFocus
            disabled={isSaving}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-md border border-blue-500 px-2 py-1 text-body-lg text-text-primary focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex-1 rounded-md px-2 py-1 text-left text-body-lg text-text-primary transition-colors duration-fast ease-out hover:bg-grey-50"
          >
            {term.value ?? <span className="italic text-text-secondary">Not found</span>}
          </button>
        )}

        {term.page_number !== null && (
          <button
            type="button"
            onClick={() => onPageClick(term.page_number as number)}
            className="rounded-sm bg-blue-50 px-2 py-0.5 text-body-sm text-blue-700 transition-colors duration-fast ease-out hover:bg-blue-100"
          >
            Page {term.page_number}
          </button>
        )}

        <ConfidenceIndicator score={term.confidence_score} />

        {term.is_edited && (
          <Tooltip content={`Original: ${term.original_value ?? 'N/A'}`}>
            <Badge color="grey">Edited</Badge>
          </Tooltip>
        )}
      </div>

      {saveError && <p className="text-body-sm text-red-500">Couldn&apos;t save — try again</p>}

      {term.source_sentence && (
        <div>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="text-body-sm text-text-secondary hover:text-text-primary"
            aria-expanded={isExpanded}
          >
            {isExpanded ? '▾' : '▸'} Why?
          </button>
          {isExpanded && (
            <blockquote className="mt-2 rounded-md bg-grey-25 p-3 text-body-sm italic text-text-secondary">
              &ldquo;{term.source_sentence}&rdquo;
            </blockquote>
          )}
        </div>
      )}
    </div>
  )
}
