'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { KeyTerm } from '@/types'

export function useContractData(contractId: string) {
  const supabase = useMemo(() => createClient(), [])

  const { data, error, isLoading, mutate } = useSWR<KeyTerm[]>(['key_terms', contractId], async () => {
    const { data, error } = await supabase
      .from('key_terms')
      .select('*')
      .eq('contract_id', contractId)
      .order('is_custom', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return data as KeyTerm[]
  })

  return { terms: data ?? [], isLoading, error, mutate }
}
