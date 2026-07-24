'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types'

export function useChatSession(contractId: string) {
  const supabase = useMemo(() => createClient(), [])

  const { data, mutate } = useSWR<ChatMessage[]>(['chat-messages', contractId], async () => {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('contract_id', contractId)
      .maybeSingle()

    if (!session) return []

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })

    if (error) throw error
    return messages as ChatMessage[]
  })

  return { messages: data ?? [], mutate }
}
