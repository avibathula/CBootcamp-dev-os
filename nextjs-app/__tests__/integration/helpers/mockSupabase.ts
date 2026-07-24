export type MockResult = { data: unknown; error: unknown }

function createChainable(result: MockResult) {
  const chainable: Record<string, unknown> = {}
  const chainMethods = ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete']

  for (const method of chainMethods) {
    chainable[method] = jest.fn(() => chainable)
  }
  chainable.single = jest.fn(() => Promise.resolve(result))
  chainable.maybeSingle = jest.fn(() => Promise.resolve(result))
  // Real supabase-js query builders are thenable — awaiting without .single()
  // resolves the same { data, error } shape.
  chainable.then = (resolve: (value: MockResult) => void) => resolve(result)

  return chainable
}

/**
 * Builds a mock Supabase client for route-handler integration tests.
 * `responses` maps table name -> either a single canned { data, error } result
 * (used for every call to that table) or an array of results consumed in
 * order across successive `.from(table)` calls in the same request.
 */
export function createMockSupabase(responses: Record<string, MockResult | MockResult[]>) {
  const callCounts: Record<string, number> = {}

  return {
    from: jest.fn((table: string) => {
      const config = responses[table]
      let result: MockResult

      if (Array.isArray(config)) {
        const index = callCounts[table] ?? 0
        result = config[Math.min(index, config.length - 1)]
        callCounts[table] = index + 1
      } else {
        result = config ?? { data: null, error: null }
      }

      return createChainable(result)
    }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        createSignedUrl: jest
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/file.pdf' }, error: null }),
      })),
    },
  }
}

export const mockUser = { id: 'user-1', email: 'test@example.com' }
