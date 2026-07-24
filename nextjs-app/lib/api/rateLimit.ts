import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type RateLimitedRoute = 'process-contract' | 'chat'

// Limits per docs/specs/09-rate-limiting-and-error-handling.md §3
const LIMITS: Record<RateLimitedRoute, { tokens: number; window: `${number} h` }> = {
  'process-contract': { tokens: 10, window: '1 h' },
  chat: { tokens: 60, window: '1 h' },
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

const limiters = new Map<RateLimitedRoute, Ratelimit>()

function getLimiter(route: RateLimitedRoute): Ratelimit | null {
  if (!redis) return null
  if (!limiters.has(route)) {
    const { tokens, window } = LIMITS[route]
    limiters.set(
      route,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(tokens, window),
        prefix: `contractiq:ratelimit:${route}`,
        analytics: false,
      })
    )
  }
  return limiters.get(route)!
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

/**
 * Fails open if Upstash is unreachable or unconfigured (docs/specs/09 §6) —
 * AI usage should never be blocked entirely by a rate-limit infra outage.
 */
export async function checkRateLimit(
  userId: string,
  route: RateLimitedRoute
): Promise<RateLimitResult> {
  const limiter = getLimiter(route)
  if (!limiter) return { allowed: true, retryAfterSeconds: 0 }

  try {
    const { success, reset } = await limiter.limit(userId)
    const retryAfterSeconds = success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000))
    return { allowed: success, retryAfterSeconds }
  } catch (error) {
    console.error(`[rateLimit:${route}]`, error)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}
