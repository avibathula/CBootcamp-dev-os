/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/api/rateLimit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/openai/extract', () => ({
  ...jest.requireActual('@/lib/openai/extract'),
  callExtraction: jest.fn(),
}))

import { requireAuth } from '@/lib/api/requireAuth'
import { checkRateLimit } from '@/lib/api/rateLimit'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { callExtraction } from '@/lib/openai/extract'
import { POST } from '@/app/api/process-contract/route'

const mockRequireAuth = requireAuth as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock
const mockCallExtraction = callExtraction as jest.Mock

const READY_CONTRACT = {
  id: 'contract-1',
  user_id: 'user-1',
  contract_type: 'nda' as const,
  contract_text: '\n[PAGE 1]\nSample contract text.',
  status: 'ready' as const,
}

const VALID_EXTRACTION_JSON = JSON.stringify({
  terms: [
    { term_name: 'Parties', value: 'Acme and Beta', page_number: 1, confidence_score: 95, source_sentence: 'x' },
    {
      term_name: 'Auto-renewal clause',
      value: null,
      page_number: null,
      confidence_score: 0,
      source_sentence: null,
    },
  ],
})

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/process-contract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/process-contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 })
    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
  })

  it('returns 400 when contract_id is missing', async () => {
    const response = await POST(buildRequest({ custom_terms: [] }))
    expect(response.status).toBe(400)
  })

  it('returns 422 when more than 5 custom terms are submitted', async () => {
    const response = await POST(
      buildRequest({ contract_id: 'contract-1', custom_terms: ['a', 'b', 'c', 'd', 'e', 'f'] })
    )
    expect(response.status).toBe(422)
  })

  it('returns 403 when the contract belongs to a different user', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { ...READY_CONTRACT, user_id: 'someone-else' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(403)
  })

  it('returns 403 when the contract does not exist', async () => {
    const supabase = createMockSupabase({ contracts: { data: null, error: { message: 'not found' } } })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'missing', custom_terms: [] }))
    expect(response.status).toBe(403)
  })

  it('returns 422 when the contract has already been processed', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { ...READY_CONTRACT, status: 'complete' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(422)
  })

  it('allows retry when the contract previously errored', async () => {
    mockCallExtraction.mockResolvedValue(VALID_EXTRACTION_JSON)
    const supabase = createMockSupabase({
      contracts: [
        { data: { ...READY_CONTRACT, status: 'error' }, error: null }, // fetch
        { data: null, error: null }, // update -> processing
        { data: null, error: null }, // update -> complete
      ],
      key_terms: { data: null, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(200)
  })

  it('extracts terms successfully and returns terms_count', async () => {
    mockCallExtraction.mockResolvedValue(VALID_EXTRACTION_JSON)
    const supabase = createMockSupabase({
      contracts: [
        { data: READY_CONTRACT, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
      key_terms: { data: null, error: null },
      custom_key_terms: { data: null, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(
      buildRequest({ contract_id: 'contract-1', custom_terms: ['Auto-renewal clause'] })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.terms_count).toBe(2)

    expect(supabase.from).toHaveBeenCalledWith('key_terms')
    expect(supabase.from).toHaveBeenCalledWith('custom_key_terms')
  })

  it('flags is_custom correctly on the inserted key_terms rows', async () => {
    mockCallExtraction.mockResolvedValue(VALID_EXTRACTION_JSON)
    const supabase = createMockSupabase({
      contracts: [{ data: READY_CONTRACT, error: null }, { data: null, error: null }, { data: null, error: null }],
      key_terms: { data: null, error: null },
      custom_key_terms: { data: null, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    await POST(buildRequest({ contract_id: 'contract-1', custom_terms: ['Auto-renewal clause'] }))

    // Find the chainable returned for the key_terms table and inspect its insert() call args.
    const keyTermsChainable = supabase.from.mock.results.find(
      (r: { value: unknown }, i: number) => supabase.from.mock.calls[i][0] === 'key_terms'
    )?.value as { insert: jest.Mock }
    const insertedRows = keyTermsChainable.insert.mock.calls[0][0]

    expect(insertedRows.find((r: { term_name: string }) => r.term_name === 'Parties').is_custom).toBe(false)
    expect(
      insertedRows.find((r: { term_name: string }) => r.term_name === 'Auto-renewal clause').is_custom
    ).toBe(true)
  })

  it('recovers from one malformed JSON response via the correction retry', async () => {
    mockCallExtraction.mockResolvedValueOnce('not valid json').mockResolvedValueOnce(VALID_EXTRACTION_JSON)
    const supabase = createMockSupabase({
      contracts: [{ data: READY_CONTRACT, error: null }, { data: null, error: null }, { data: null, error: null }],
      key_terms: { data: null, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(200)
    expect(mockCallExtraction).toHaveBeenCalledTimes(2)
  })

  it('returns 503 and sets status=error when both extraction attempts return malformed JSON', async () => {
    mockCallExtraction.mockResolvedValue('still not valid json')
    const supabase = createMockSupabase({
      contracts: [{ data: READY_CONTRACT, error: null }, { data: null, error: null }, { data: null, error: null }],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(503)

    const contractsChainable = supabase.from.mock.results[supabase.from.mock.results.length - 1].value as {
      update: jest.Mock
    }
    expect(contractsChainable.update).toHaveBeenCalledWith({ status: 'error' })
  })

  it('returns 503 and sets status=error when the key_terms insert fails', async () => {
    mockCallExtraction.mockResolvedValue(VALID_EXTRACTION_JSON)
    const supabase = createMockSupabase({
      contracts: [{ data: READY_CONTRACT, error: null }, { data: null, error: null }, { data: null, error: null }],
      key_terms: { data: null, error: { message: 'insert failed' } },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    expect(response.status).toBe(503)
  })

  it('retries the OpenAI call with backoff on transport failure, then returns 503', async () => {
    jest.useFakeTimers()
    mockCallExtraction.mockRejectedValue(new Error('network error'))
    const supabase = createMockSupabase({
      contracts: [{ data: READY_CONTRACT, error: null }, { data: null, error: null }, { data: null, error: null }],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const responsePromise = POST(buildRequest({ contract_id: 'contract-1', custom_terms: [] }))
    await jest.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 100)
    const response = await responsePromise

    expect(response.status).toBe(503)
    expect(mockCallExtraction).toHaveBeenCalledTimes(4) // initial + 3 backoff retries
    jest.useRealTimers()
  })
})
