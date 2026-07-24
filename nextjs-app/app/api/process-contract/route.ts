import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { checkRateLimit } from '@/lib/api/rateLimit'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { buildExtractionPrompt, callExtraction, parseExtractionResponse } from '@/lib/openai/extract'
import type { ChatCompletionMessage } from '@/lib/openai/extract'
import type { ExtractionOutput, ProcessContractRequest, ProcessContractResponse } from '@/types'

const MAX_CUSTOM_TERMS = 5
const BACKOFF_DELAYS_MS = [1000, 2000, 4000]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callWithBackoff(messages: ChatCompletionMessage[]): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
    try {
      return await callExtraction(messages)
    } catch (error) {
      lastError = error
      if (attempt < BACKOFF_DELAYS_MS.length) {
        await sleep(BACKOFF_DELAYS_MS[attempt])
      }
    }
  }
  throw lastError
}

async function extractWithRetries(baseMessages: ChatCompletionMessage[]): Promise<ExtractionOutput> {
  const raw = await callWithBackoff(baseMessages)

  try {
    return parseExtractionResponse(raw)
  } catch {
    const correctionMessages: ChatCompletionMessage[] = [
      ...baseMessages,
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: 'Your previous response was not valid JSON. Return only the JSON object, no explanation.',
      },
    ]
    const retryRaw = await callWithBackoff(correctionMessages)
    return parseExtractionResponse(retryRaw)
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth

  const rateLimit = await checkRateLimit(user.id, 'process-contract')
  if (!rateLimit.allowed) {
    return Errors.rateLimited(rateLimit.retryAfterSeconds)
  }

  const supabase = createServiceRoleClient()

  try {
    const body = (await request.json()) as Partial<ProcessContractRequest>
    const contractId = body.contract_id
    const rawCustomTerms = Array.isArray(body.custom_terms) ? body.custom_terms : []
    const customTerms = rawCustomTerms
      .filter((term): term is string => typeof term === 'string')
      .map((term) => term.trim())
      .filter((term) => term.length > 0)

    if (typeof contractId !== 'string' || contractId.length === 0) {
      return Errors.badRequest('contract_id is required.')
    }

    if (customTerms.length > MAX_CUSTOM_TERMS) {
      return Errors.unprocessable('Too many custom terms. Maximum 5 allowed.')
    }

    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('id, user_id, contract_type, contract_text, status')
      .eq('id', contractId)
      .single()

    if (fetchError || !contract || contract.user_id !== user.id) {
      return Errors.forbidden('Contract not found or access denied.')
    }

    if (contract.status !== 'ready' && contract.status !== 'error') {
      return Errors.unprocessable('Contract is already processed.')
    }

    await supabase.from('contracts').update({ status: 'processing' }).eq('id', contractId)

    const { system, user: userMessage } = buildExtractionPrompt(
      contract.contract_type,
      contract.contract_text,
      customTerms
    )
    const baseMessages: ChatCompletionMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ]

    let extraction: ExtractionOutput
    try {
      extraction = await extractWithRetries(baseMessages)
    } catch (error) {
      logServerError('process-contract:extraction', error)
      await supabase.from('contracts').update({ status: 'error' }).eq('id', contractId)
      return Errors.serviceUnavailable('AI analysis failed. Please try again.')
    }

    try {
      const customTermsLower = new Set(customTerms.map((term) => term.toLowerCase()))

      const keyTermRows = extraction.terms.map((term) => ({
        contract_id: contractId,
        user_id: user.id,
        term_name: term.term_name,
        value: term.value,
        original_value: term.value,
        page_number: term.page_number,
        confidence_score: term.confidence_score,
        source_sentence: term.source_sentence,
        is_custom: customTermsLower.has(term.term_name.toLowerCase()),
        is_edited: false,
      }))

      if (keyTermRows.length > 0) {
        const { error: keyTermsError } = await supabase.from('key_terms').insert(keyTermRows)
        if (keyTermsError) throw keyTermsError
      }

      if (customTerms.length > 0) {
        const { error: customTermsError } = await supabase.from('custom_key_terms').insert(
          customTerms.map((termName) => ({
            contract_id: contractId,
            user_id: user.id,
            term_name: termName,
          }))
        )
        if (customTermsError) throw customTermsError
      }

      const { error: completeError } = await supabase
        .from('contracts')
        .update({ status: 'complete' })
        .eq('id', contractId)
      if (completeError) throw completeError
    } catch (error) {
      logServerError('process-contract:persist', error)
      await supabase.from('contracts').update({ status: 'error' }).eq('id', contractId)
      return Errors.serviceUnavailable('AI analysis failed. Please try again.')
    }

    return NextResponse.json<ProcessContractResponse>(
      { contract_id: contractId, terms_count: extraction.terms.length },
      { status: 200 }
    )
  } catch (error) {
    logServerError('process-contract', error)
    return Errors.internal()
  }
}
