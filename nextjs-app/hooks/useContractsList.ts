'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthProvider'
import type { ContractSummary } from '@/types'

export function useContractsList() {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const { data, error, isLoading, mutate } = useSWR<ContractSummary[]>(
    user ? ['contracts', user.id] : null,
    async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, file_name, contract_type, status, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as ContractSummary[]
    }
  )

  return {
    contracts: data ?? [],
    isLoading: !user || isLoading,
    error,
    mutate,
  }
}
