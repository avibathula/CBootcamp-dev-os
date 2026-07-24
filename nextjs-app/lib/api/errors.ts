import { NextResponse } from 'next/server'
import type { ApiError } from '@/types'

export function apiError(message: string, status: number) {
  return NextResponse.json<ApiError>({ error: message }, { status })
}

export const Errors = {
  unauthorized: () => apiError('Unauthorized', 401),
  forbidden: (message = 'You do not have access to this resource.') => apiError(message, 403),
  badRequest: (message: string) => apiError(message, 400),
  unprocessable: (message: string) => apiError(message, 422),
  rateLimited: (retryAfterSeconds: number) => {
    const minutes = Math.ceil(retryAfterSeconds / 60)
    const response = apiError(
      `Too many requests. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      429
    )
    response.headers.set('Retry-After', String(retryAfterSeconds))
    return response
  },
  serviceUnavailable: (message: string) => apiError(message, 503),
  internal: () => apiError('Something went wrong. Please try again.', 500),
}

export function logServerError(route: string, error: unknown) {
  console.error(`[${route}]`, error)
}
