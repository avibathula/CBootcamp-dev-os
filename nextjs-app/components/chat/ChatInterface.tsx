'use client'

import { useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useChatSession } from '@/hooks/useChatSession'
import { createClient } from '@/lib/supabase/client'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import type { ChatResponse, ApiError } from '@/types'

export type ChatInterfaceProps = {
  contractId: string
  onCitationClick: (page: number) => void
}

export function ChatInterface({ contractId, onCitationClick }: ChatInterfaceProps) {
  const { messages, mutate } = useChatSession(contractId)
  const supabase = useMemo(() => createClient(), [])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    setError(undefined)
    setInput('')
    setIsSending(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError('Your session expired. Please sign in again.')
      setIsSending(false)
      return
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, message: trimmed }),
      })

      const body = (await response.json()) as ChatResponse | ApiError

      if (!response.ok) {
        setError('error' in body ? body.error : 'Something went wrong. Please try again.')
        return
      }

      await mutate()
    } catch {
      setError("Couldn't send your message. Please check your connection and try again.")
    } finally {
      setIsSending(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void sendMessage()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-body-sm text-text-secondary">
            Ask a question about this contract or our conversation so far — answers are grounded in the
            document with page citations, or in what we&apos;ve discussed.
          </p>
        )}
        {messages.map((message) =>
          message.role === 'user' ? (
            <UserMessage key={message.id} content={message.content} />
          ) : (
            <AssistantMessage
              key={message.id}
              content={message.content}
              sourceType={message.source_type}
              onCitationClick={onCitationClick}
            />
          )
        )}
        {isSending && (
          <div className="flex justify-start gap-1 px-3 py-2" aria-label="Assistant is typing">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grey-300" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grey-300 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grey-300 [animation-delay:300ms]" />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="px-4 py-2 text-body-sm text-red-500">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-grey-100 bg-grey-25 p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about this contract…"
          rows={1}
          disabled={isSending}
          aria-label="Chat message"
          className="flex-1 resize-none rounded-md border border-grey-100 px-3 py-2 text-body-lg text-text-primary focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors duration-fast ease-out hover:bg-blue-600 disabled:bg-grey-200"
        >
          →
        </button>
      </form>
    </div>
  )
}
