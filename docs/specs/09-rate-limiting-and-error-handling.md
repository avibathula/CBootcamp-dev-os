# Spec: Rate Limiting, Auth Guard & Shared Error Contract

**Cross-cutting spec** — applies to every API route in specs 02, 03, 05, 06, 08. **Priority:** P0 | **Depends on:** `01-authentication.md`

---

## 1. Purpose

Every API route shares three concerns that shouldn't be reimplemented per-route: JWT validation, rate limiting on the two AI-backed endpoints, and a consistent error response shape. This spec defines the shared utilities other specs' routes import.

---

## 2. Auth guard — `lib/api/requireAuth.ts`

```typescript
export type AuthResult = { user: { id: string; email: string } } | { error: NextResponse }

export async function requireAuth(request: Request): Promise<AuthResult>
```

- Reads `Authorization: Bearer <token>` from headers; missing header → `{ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }`
- Calls `supabase.auth.getUser(token)` using the anon-key client; invalid/expired token → same 401 shape
- Every route handler starts with:
  ```typescript
  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error
  const { user } = auth
  ```

---

## 3. Rate limiting

**Mechanism:** Next.js edge middleware (`middleware.ts`, extending the auth-guard middleware from spec 01) intercepts `/api/process-contract` and `/api/chat` before they reach the route handler. This runs on the hosting platform's edge (Netlify Edge Functions in this project).

**Store:** In-memory per-instance counter is insufficient on serverless (no shared state across invocations), so use Upstash Redis with a sliding-window counter keyed by `user_id`. Upstash is platform-neutral and is what the implementation uses.

```typescript
// lib/api/rateLimit.ts
export async function checkRateLimit(
  userId: string,
  route: 'process-contract' | 'chat'
): Promise<{ allowed: boolean; retryAfterSeconds: number }>
```

| Route | Limit | Window |
|---|---|---|
| `/api/process-contract` | 10 requests | per user per rolling hour |
| `/api/chat` | 60 requests | per user per rolling hour |

Implementation: `INCR` a key like `ratelimit:{userId}:{route}:{currentHourBucket}` with a 1-hour TTL on first increment; compare against the limit table above.

**Response when exceeded:**
```json
{ "error": "Too many requests. Please try again in {N} minutes." }
```
Status `429`, with a `Retry-After: <retryAfterSeconds>` header.

---

## 4. Shared error response shape

Every API route returns errors in the same envelope:

```typescript
type ApiError = { error: string }
```

Never nest error details under a different key, never return a raw stack trace or exception message from an unexpected 500 — catch-all handlers must map unknown errors to:
```json
{ "error": "Something went wrong. Please try again." }
```
with status `500`, while logging the real error server-side (`console.error` is sufficient for MVP; no external logging service specified in the engineering doc).

| Code | When used (canonical, per engineering doc §9) |
|---|---|
| 400 | Malformed request body / invalid field values |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but does not own the requested resource |
| 422 | Business rule violation (scanned PDF, contract too long, already processed, contract not ready) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 503 | OpenAI API failure after retries, or chat timeout |

---

## 5. Route handler skeleton (reference pattern)

Every route in specs 02, 03, 05, 06, 08 follows this shape:

```typescript
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json() // or formData() for multipart
    // ...validate body, return 400/422 as appropriate...
    // ...perform DB/AI work...
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error(`[${routeName}]`, err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
```

Rate-limited routes (`process-contract`, `chat`) additionally check `checkRateLimit` immediately after `requireAuth` and before parsing the body.

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Rate-limit store (KV) is unreachable | Fail open — allow the request through rather than blocking all AI usage on an infra dependency; log the KV error server-side for monitoring |
| User's JWT is valid but the user record was deleted mid-session (rare) | `supabase.auth.getUser(token)` returns null → 401, same as an invalid token |
| Two rate-limited requests race at exactly the limit boundary (10th and 11th `process-contract` calls in the same millisecond) | Acceptable to allow both through occasionally (sliding-window increment is not perfectly atomic across a race at this scale) — not worth the complexity of a distributed lock for a 10/hour soft limit |

---

## 7. Acceptance Criteria

- [ ] Any protected route called without an `Authorization` header returns 401 with `{ "error": "Unauthorized" }`
- [ ] Any protected route called with another user's resource ID returns 403
- [ ] The 11th `/api/process-contract` call by the same user within an hour returns 429 with a `Retry-After` header
- [ ] The 61st `/api/chat` call by the same user within an hour returns 429
- [ ] An unexpected exception in any route returns a generic 500 message, never a raw stack trace, and is logged server-side
