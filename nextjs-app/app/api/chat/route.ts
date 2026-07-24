import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { checkRateLimit } from '@/lib/api/rateLimit'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { buildChatMessages, callChat, classifyQuery, HISTORY_TURN_LIMIT } from '@/lib/openai/chat'
import type { ChatRequest, ChatResponse } from '@/types'

const MAX_MESSAGE_LENGTH = 4000
// The largest window any classification needs (HISTORY's 20 turns); fetched
// once per request and trimmed further by buildChatMessages per classification.
const MAX_HISTORY_MESSAGES = HISTORY_TURN_LIMIT * 2

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

    // Classification depends only on the message text — safe to compute
    // before touching the DB, and needed up front to size the history fetch.
    const classification = classifyQuery(message)

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

    // CRITICAL: history is loaded here, before the new user message is ever
    // written, so the classifier and the model never see the current
    // question as part of its own history. Fetched newest-first so a long
    // conversation still yields the *most recent* turns, then reversed back
    // to ascending order for the prompt.
    const { data: recentDesc, error: historyError } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES)

    if (historyError) {
      logServerError('chat:history', historyError)
      return Errors.internal()
    }

    const history = (recentDesc ?? []).slice().reverse()
    const messages = buildChatMessages(classification, contract.contract_text, history, message)

    let assistantReply: string
    try {
      assistantReply = await callChat(messages)
    } catch (error) {
      logServerError('chat:completion', error)
      return Errors.serviceUnavailable('Chat response timed out. Please try again.')
    }

    // Monitoring signal only (docs/specs/06 §7) — not a blocking retry, to
    // avoid doubling chat latency/cost for what is usually a rare model slip.
    // Expected attribution tag depends on classification.
    const hasExpectedTag =
      classification === 'history'
        ? /\[From conversation\]/.test(assistantReply)
        : /\[Page \d+\]/.test(assistantReply) ||
          (classification === 'both' && /\[From conversation\]/.test(assistantReply))
    const isRefusal = /I cannot find this in (the document|our conversation|the document or our conversation)/.test(
      assistantReply
    )
    if (!hasExpectedTag && !isRefusal) {
      logServerError(
        'chat:missing-attribution',
        new Error(`[${classification}] Response lacked the expected attribution tag: "${assistantReply.slice(0, 200)}"`)
      )
    }

    const { error: insertUserError } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    if (insertUserError) {
      logServerError('chat:insert-user', insertUserError)
    }

    const { error: insertAssistantError } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      user_id: user.id,
      role: 'assistant',
      content: assistantReply,
      source_type: classification,
    })
    if (insertAssistantError) {
      logServerError('chat:insert-assistant', insertAssistantError)
    }

    return NextResponse.json<ChatResponse>(
      { message: assistantReply, session_id: sessionId, source_type: classification },
      { status: 200 }
    )
  } catch (error) {
    logServerError('chat', error)
    return Errors.internal()
  }
}
