/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/api/rateLimit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/openai/chat', () => ({
  // classifyQuery and buildChatMessages stay real — this is the memory layer
  // logic we want an integration test to actually exercise. Only the network
  // call to OpenAI is mocked.
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
  contract_text: '\n[PAGE 1]\nSample contract text with a unique marker CONTRACTMARKERXYZ.',
  status: 'complete' as const,
}

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function chainableForTable(supabase: ReturnType<typeof createMockSupabase>, table: string, callIndex = 0) {
  const calls = supabase.from.mock.calls
    .map((call: unknown[], i: number) => ({ call, i }))
    .filter(({ call }: { call: unknown[] }) => call[0] === table)
  return supabase.from.mock.results[calls[callIndex].i].value as {
    order: jest.Mock
    limit: jest.Mock
    insert: jest.Mock
  }
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    mockCallChat.mockResolvedValue('The term is 3 years [Page 1].')
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

  it('reuses an existing chat session and returns a grounded, contract-classified response', async () => {
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

    // "term" is a contract marker, no history markers present.
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'What is the term?' }))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.session_id).toBe('session-1')
    expect(body.source_type).toBe('contract')
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

  it('persists both messages, tagging the assistant message with its source_type', async () => {
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

    const userInsert = chainableForTable(supabase, 'chat_messages', 1)
    const assistantInsert = chainableForTable(supabase, 'chat_messages', 2)

    expect(userInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'What is the term?' })
    )
    expect(assistantInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', source_type: 'contract' })
    )
  })

  it('fetches history newest-first with a bounded limit, before inserting the new user message', async () => {
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

    const historyChainable = chainableForTable(supabase, 'chat_messages', 0)
    expect(historyChainable.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(historyChainable.limit).toHaveBeenCalledWith(40) // HISTORY_TURN_LIMIT * 2

    // The history select (call 0) must happen before either insert (calls 1, 2).
    const calls = supabase.from.mock.calls.filter((c: unknown[]) => c[0] === 'chat_messages')
    expect(calls.length).toBe(3)
  })

  it('a history-classified question omits contract text from the OpenAI call', async () => {
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: { data: { id: 'session-1' }, error: null },
      chat_messages: [
        {
          data: [
            { role: 'user', content: 'What is the term?' },
            { role: 'assistant', content: 'The term is 3 years [Page 1].' },
          ],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(
      buildRequest({ contract_id: 'contract-1', message: 'What have I asked you so far?' })
    )
    const body = await response.json()
    expect(body.source_type).toBe('history')

    const sentMessages = mockCallChat.mock.calls[0][0] as { content: string }[]
    const systemMessage = sentMessages[0].content
    expect(systemMessage).not.toContain('CONTRACTMARKERXYZ')
    expect(systemMessage).toContain('[From conversation]')
  })

  it('a both-classified question includes contract text and prior history', async () => {
    const supabase = createMockSupabase({
      contracts: { data: COMPLETE_CONTRACT, error: null },
      chat_sessions: { data: { id: 'session-1' }, error: null },
      chat_messages: [
        {
          data: [
            { role: 'user', content: 'What is the term?' },
            { role: 'assistant', content: 'The term is 3 years [Page 1].' },
          ],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    // No clean contract or history marker match — falls back to 'both'.
    const response = await POST(buildRequest({ contract_id: 'contract-1', message: 'Can you clarify that?' }))
    const body = await response.json()
    expect(body.source_type).toBe('both')

    const sentMessages = mockCallChat.mock.calls[0][0] as { role: string; content: string }[]
    expect(sentMessages[0].content).toContain('CONTRACTMARKERXYZ')
    // Prior history should be present as its own message(s), not just referenced in the system prompt.
    expect(sentMessages.some((m) => m.content === 'What is the term?')).toBe(true)
  })
})
