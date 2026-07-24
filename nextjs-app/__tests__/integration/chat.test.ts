/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/api/rateLimit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/openai/chat', () => ({
  ...jest.requireActual('@/lib/openai/chat'),
  callChat: jest.fn(),
}))

import { requireAuth } from '@/lib/api/requireAuth'
import { checkRateLimit } from '@/lib/api/rateLimit'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { callChat } from '@/lib/openai/chat'
import { POST } from '@/app/api/chat/route'

const mockRequireAuth = requireAuth as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock
const mockCallChat = callChat as jest.Mock

const COMPLETE_CONTRACT = {
  id: 'contract-1',
  user_id: 'user-1',
  contract_text: '\n[PAGE 1]\nSample contract text.',
  status: 'complete' as const,
}

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    mockCallChat.mockResolvedValue('Based on the document, the term is 3 years [Page 1].')
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'hello' }))
    expect(response.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'hello' }))
    expect(response.status).toBe(429)
  })

  it('returns 400 when contract_id is missing', async () => {
    const response = await POST(buildRequest({ message: 'hello' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 for an empty message', async () => {
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: '   ' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 for a message over 4000 characters', async () => {
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'x'.repeat(4001) }))
    expect(response.status).toBe(400)
  })

  it('returns 422 when the contract is not complete', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { ...COMPLETE_CONTRACT, status: 'processing' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'hello' }))
    expect(response.status).toBe(422)
  })

  it('returns 422 when the contract belongs to a different user', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { ...COMPLETE_CONTRACT, user_id: 'someone-else' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'hello' }))
    expect(response.status).toBe(422)
  })

  it('reuses an existing chat session and returns a grounded response', async () => {
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: { data: { id: 'session-1' }, error: null },
      chat_messages: [
        { data: [], error: null }, // history
        { data: null, error: null }, // insert user message
        { data: null, error: null }, // insert assistant message
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'What is the term?' }))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.session_id).toBe('session-1')
    expect(body.message).toContain('[Page 1]')
  })

  it('creates a new chat session when none exists yet', async () => {
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: [
        { data: null, error: null }, // no existing session
        { data: { id: 'new-session' }, error: null }, // insert
      ],
      chat_messages: [
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'What is the term?' }))
    const body = await response.json()
    expect(body.session_id).toBe('new-session')
  })

  it('returns 503 when the OpenAI chat call fails', async () => {
    mockCallChat.mockRejectedValue(new Error('timeout'))
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: { data: { id: 'session-1' }, error: null },
      chat_messages: { data: [], error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'hello' }))
    expect(response.status).toBe(503)
  })

  it('persists both the user message and the assistant response', async () => {
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: { data: { id: 'session-1' }, error: null },
      chat_messages: [
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    await POST(buildRequest({ contract_id: 'contract-1', message: 'What is the term?' }))

    const chatMessageCalls = supabase.from.mock.calls.filter((c: unknown[]) => c[0] === 'chat_messages')
    expect(chatMessageCalls.length).toBe(3) // history select + 2 inserts

    const insertCallsArgs = supabase.from.mock.results
      .filter((_r: unknown, i: number) => supabase.from.mock.calls[i][0] === 'chat_messages')
      .map((r) => (r as unknown as { value: { insert: jest.Mock } }).value.insert.mock.calls[0]?.[0])
      .filter(Boolean)

    expect(insertCallsArgs.find((c: { role: string }) => c.role === 'user').content).toBe('What is the term?')
    expect(insertCallsArgs.find((c: { role: string }) => c.role === 'assistant').content).toContain('[Page 1]')
  })
})
