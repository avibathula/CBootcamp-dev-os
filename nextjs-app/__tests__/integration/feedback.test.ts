/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))

import { requireAuth } from '@/lib/api/requireAuth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/feedback/route'

const mockRequireAuth = requireAuth as jest.Mock
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await POST(buildRequest({ contract_id: 'contract-1', rating: 'thumbs_up' }))
    expect(response.status).toBe(401)
  })

  it('returns 400 for an invalid rating', async () => {
    const response = await POST(buildRequest({ contract_id: 'contract-1', rating: 'meh' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 for a comment over 1000 characters', async () => {
    const response = await POST(
      buildRequest({ contract_id: 'contract-1', rating: 'thumbs_up', comment: 'x'.repeat(1001) })
    )
    expect(response.status).toBe(400)
  })

  it('returns 403 when the contract belongs to a different user', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { id: 'contract-1', user_id: 'someone-else' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', rating: 'thumbs_up' }))
    expect(response.status).toBe(403)
  })

  it('saves thumbs_up with no comment', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { id: 'contract-1', user_id: 'user-1' }, error: null },
      user_feedback: { data: { id: 'feedback-1' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ contract_id: 'contract-1', rating: 'thumbs_up' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.feedback_id).toBe('feedback-1')
  })

  it('upserts on the contract_id conflict, using the same rating/comment on resubmission', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { id: 'contract-1', user_id: 'user-1' }, error: null },
      user_feedback: { data: { id: 'feedback-1' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    await POST(buildRequest({ contract_id: 'contract-1', rating: 'thumbs_down', comment: 'changed my mind' }))

    const feedbackChainable = supabase.from.mock.results.find(
      (_r: unknown, i: number) => supabase.from.mock.calls[i][0] === 'user_feedback'
    )?.value as { upsert: jest.Mock }

    expect(feedbackChainable.upsert).toHaveBeenCalledWith(
      { contract_id: 'contract-1', user_id: 'user-1', rating: 'thumbs_down', comment: 'changed my mind' },
      { onConflict: 'contract_id' }
    )
  })
})
