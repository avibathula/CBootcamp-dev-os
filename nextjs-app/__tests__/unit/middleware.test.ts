/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { middleware } from '@/middleware'

const mockCreateServerClient = createServerClient as jest.Mock

function mockUser(user: { id: string } | null) {
  mockCreateServerClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
  })
}

describe('middleware', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('redirects unauthenticated requests to protected routes to /auth/signin with a redirect param', async () => {
    mockUser(null)
    const request = new NextRequest('http://localhost:3000/dashboard')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/signin')
    expect(response.headers.get('location')).toContain('redirect=%2Fdashboard')
  })

  it('allows authenticated requests to protected routes through', async () => {
    mockUser({ id: 'user-1' })
    const request = new NextRequest('http://localhost:3000/dashboard')
    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('redirects authenticated users away from auth pages to /dashboard', async () => {
    mockUser({ id: 'user-1' })
    const request = new NextRequest('http://localhost:3000/auth/signin')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/dashboard')
  })

  it('allows unauthenticated requests to auth pages through', async () => {
    mockUser(null)
    const request = new NextRequest('http://localhost:3000/auth/signin')
    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('does not redirect unauthenticated requests to public routes', async () => {
    mockUser(null)
    const request = new NextRequest('http://localhost:3000/')
    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('protects nested /contracts/[id] routes', async () => {
    mockUser(null)
    const request = new NextRequest('http://localhost:3000/contracts/abc-123')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/signin')
  })
})
