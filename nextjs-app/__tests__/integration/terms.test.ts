/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))

import { requireAuth } from '@/lib/api/requireAuth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { PATCH } from '@/app/api/terms/[id]/route'

const mockRequireAuth = requireAuth as jest.Mock
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/terms/term-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/terms/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await PATCH(buildRequest({ value: 'x' }), { params: { id: 'term-1' } })
    expect(response.status).toBe(401)
  })

  it('returns 400 for an empty value', async () => {
    const response = await PATCH(buildRequest({ value: '   ' }), { params: { id: 'term-1' } })
    expect(response.status).toBe(400)
  })

  it('returns 400 for a value over 2000 characters', async () => {
    const response = await PATCH(buildRequest({ value: 'x'.repeat(2001) }), { params: { id: 'term-1' } })
    expect(response.status).toBe(400)
  })

  it('returns 403 when the term does not exist', async () => {
    const supabase = createMockSupabase({ key_terms: { data: null, error: { message: 'not found' } } })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await PATCH(buildRequest({ value: 'new value' }), { params: { id: 'missing' } })
    expect(response.status).toBe(403)
  })

  it('returns 403 when the term belongs to a different user', async () => {
    const supabase = createMockSupabase({
      key_terms: { data: { id: 'term-1', user_id: 'someone-else', value: 'x', original_value: 'x', is_edited: false }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await PATCH(buildRequest({ value: 'new value' }), { params: { id: 'term-1' } })
    expect(response.status).toBe(403)
  })

  it('captures the pre-edit value as original_value on a first edit', async () => {
    const supabase = createMockSupabase({
      key_terms: [
        {
          data: { id: 'term-1', user_id: 'user-1', value: '3 years', original_value: null, is_edited: false },
          error: null,
        },
        {
          data: { id: 'term-1', value: '36 months', is_edited: true, original_value: '3 years' },
          error: null,
        },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await PATCH(buildRequest({ value: '36 months' }), { params: { id: 'term-1' } })
    expect(response.status).toBe(200)

    const updateChainable = supabase.from.mock.results[1].value as { update: jest.Mock }
    expect(updateChainable.update).toHaveBeenCalledWith({
      value: '36 months',
      is_edited: true,
      original_value: '3 years',
    })

    const body = await response.json()
    expect(body.original_value).toBe('3 years')
    expect(body.is_edited).toBe(true)
  })

  it('does not overwrite original_value on a second edit', async () => {
    const supabase = createMockSupabase({
      key_terms: [
        {
          data: {
            id: 'term-1',
            user_id: 'user-1',
            value: '36 months',
            original_value: '3 years',
            is_edited: true,
          },
          error: null,
        },
        {
          data: { id: 'term-1', value: '48 months', is_edited: true, original_value: '3 years' },
          error: null,
        },
      ],
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await PATCH(buildRequest({ value: '48 months' }), { params: { id: 'term-1' } })
    const updateChainable = supabase.from.mock.results[1].value as { update: jest.Mock }

    expect(updateChainable.update).toHaveBeenCalledWith({
      value: '48 months',
      is_edited: true,
      original_value: '3 years', // unchanged from the first edit, not overwritten
    })

    const body = await response.json()
    expect(body.original_value).toBe('3 years')
  })
})
