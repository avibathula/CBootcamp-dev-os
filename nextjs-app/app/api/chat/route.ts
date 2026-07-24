import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { checkRateLimit } from '@/lib/api/rateLimit'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { buildChatMessages, callChat } from '@/lib/openai/chat'
import type { ChatRequest, ChatResponse } from '@/types'

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY_MESSAGES = 200

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth

  const rateLimit = await checkRateLimit(user.id, 'chat')
  if (!rateLimit.allowed) {
    return Errors.rateLimited(rateLimit.retryAfterSeconds)
  }

  const supabase = createServiceRoleClient()

  try {
    const body = (await request.json()) as Partial<ChatRequest>
    const contractId = body.contract_id
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (typeof contractId !== 'string' || contractId.length === 0) {
      return Errors.badRequest('contract_id is required.')
    }
    if (message.length === 0) {
      return Errors.badRequest('message is required.')
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return Errors.badRequest(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`)
    }

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, user_id, contract_text, status')
      .eq('id', contractId)
      .single()

    if (contractError || !contract || contract.user_id !== user.id || contract.status !== 'complete') {
      return Errors.unprocessable('Contract not found or not yet processed.')
    }

    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('contract_id', contractId)
      .maybeSingle()

    let sessionId: string
    if (existingSession) {
      sessionId = existingSession.id
    } else {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({ contract_id: contractId, user_id: user.id })
        .select('id')
        .single()

      if (sessionError || !newSession) {
        logServerError('chat:session', sessionError)
        return Errors.internal()
      }
      sessionId = newSession.id
    }

    const { data: historyRows, error: historyError } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    if (historyError) {
      logServerError('chat:history', historyError)
      return Errors.internal()
    }

    const messages = buildChatMessages(contract.contract_text, historyRows ?? [], message)

    let assistantReply: string
    try {
      assistantReply = await callChat(messages)
    } catch (error) {
      logServerError('chat:completion', error)
      return Errors.serviceUnavailable('Chat response timed out. Please try again.')
    }

    // Monitoring signal only (docs/specs/06 §7) — not a blocking retry, to
    // avoid doubling chat latency/cost for what is usually a rare model slip.
    if (!/\[Page \d+\]/.test(assistantReply) && !assistantReply.includes('I cannot find this in the document')) {
      logServerError(
        'chat:missing-citation',
        new Error(`Response lacked a page citation: "${assistantReply.slice(0, 200)}"`)
      )
    }

    const { error: insertUserError } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    if (insertUserError) {
      logServerError('chat:insert-user', insertUserError)
    }

    const { error: insertAssistantError } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: assistantReply })
    if (insertAssistantError) {
      logServerError('chat:insert-assistant', insertAssistantError)
    }

    return NextResponse.json<ChatResponse>({ message: assistantReply, session_id: sessionId }, { status: 200 })
  } catch (error) {
    logServerError('chat', error)
    return Errors.internal()
  }
}
