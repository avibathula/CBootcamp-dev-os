'use client'

import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { TermCard } from './TermCard'
import { useContractData } from '@/hooks/useContractData'
import { createClient } from '@/lib/supabase/client'
import type { KeyTerm } from '@/types'

export type KeyTermsPanelProps = {
  contractId: string
  onPageClick: (page: number) => void
}

export function KeyTermsPanel({ contractId, onPageClick }: KeyTermsPanelProps) {
  const { terms, isLoading, error, mutate } = useContractData(contractId)
  const supabase = useMemo(() => createClient(), [])

  async function handleSave(id: string, value: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not authenticated')

    await mutate(
      (current) =>
        current?.map((term) =>
          term.id === id
            ? { ...term, value, is_edited: true, original_value: term.original_value ?? term.value }
            : term
        ) as KeyTerm[] | undefined,
      { revalidate: false }
    )

    const response = await fetch(`/api/terms/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })

    if (!response.ok) {
      await mutate()
      throw new Error('Save failed')
    }

    await mutate()
  }

  if (isLoading) {
    return (
      <div data-testid="key-terms-panel" className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="key-terms-panel" role="alert" className="p-4 text-body-sm text-red-700">
        Couldn&apos;t load key terms. Try refreshing the page.
      </div>
    )
  }

  if (terms.length === 0) {
    return (
      <div data-testid="key-terms-panel" className="p-4 text-body-sm text-text-secondary">
        No key terms were extracted for this contract.
      </div>
    )
  }

  return (
    <div data-testid="key-terms-panel" className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {terms.map((term) => (
        <TermCard key={term.id} term={term} onPageClick={onPageClick} onSave={handleSave} />
      ))}
    </div>
  )
}
