# Spec: Authentication & Session Management

**Story:** US-001 | **Priority:** P0 | **Depends on:** `supabase-schema.sql` (auth.users is Supabase-managed; no custom table needed)

---

## 1. User Flow

```
Landing page (/) → "Get Started Free" or "Sign In"
  → /auth/signup or /auth/signin
    → AuthForm submits credentials to Supabase Auth (client SDK, not a custom API route)
      → Supabase issues a session (JWT access token + refresh token)
        → Session persisted by @supabase/ssr in cookies (readable by middleware and server components)
          → middleware.ts detects a valid session
            → redirect to /dashboard
```

Sign-out: any authenticated page → `supabase.auth.signOut()` → redirect to `/`.

### Error paths

| Condition | Handling |
|---|---|
| Invalid email format | Inline validation before submit (HTML5 `type="email"` + regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`) |
| Password < 8 chars | Inline validation before submit; error text: "Password must be at least 8 characters." |
| Email already registered (sign-up) | Supabase returns `400` with `error.message` containing "already registered" → display "An account with this email already exists. Sign in instead." with a link to `/auth/signin` |
| Invalid credentials (sign-in) | Supabase returns `400` → display "Incorrect email or password." (generic — do not reveal which field is wrong, no user enumeration) |
| Supabase Auth unreachable | Network/5xx error → display "Sign-up unavailable. Try again in a moment." |
| Rate limit exceeded (sign-in) | Supabase returns `429` → display "Too many sign-in attempts. Try again in 15 minutes." |
| Already authenticated, visits `/auth/signin` or `/auth/signup` | Middleware redirects to `/dashboard` |
| Unauthenticated, visits protected route | Middleware redirects to `/auth/signin?redirect=<original_path>` |

---

## 2. Database

No custom table. Supabase's built-in `auth.users` table is the source of truth. Every domain table (`contracts`, `key_terms`, etc.) references `auth.users(id)` via `user_id` — see `supabase-schema.sql`.

**Supabase Dashboard settings required (manual, not SQL):**
- Authentication → Providers → Email: enabled, "Confirm email" **disabled** for MVP (no email service configured yet; enabling it would strand users who never receive a confirmation email)
- Authentication → URL Configuration → Site URL: set to `NEXT_PUBLIC_APP_URL`

---

## 3. Frontend Implementation

### 3.1 Supabase clients

`lib/supabase/client.ts` — browser client, used in Client Components:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`lib/supabase/server.ts` — server client for Server Components / Route Handlers, reads cookies for the user's session, and a separate service-role client for privileged writes:

```typescript
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// Service-role client: bypasses RLS. Use only in API routes for writes the
// user's own JWT would be blocked from (see spec 03, 06). Never import this
// in a Client Component or expose the key via NEXT_PUBLIC_*.
export function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### 3.2 `middleware.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/contracts']
const AUTH_PAGES = ['/auth/signin', '/auth/signup']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p))
  const isAuthPage = AUTH_PAGES.includes(path)

  if (isProtected && !user) {
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(redirectUrl)
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*', '/contracts/:path*', '/auth/:path*'],
}
```

### 3.3 `components/auth/AuthForm.tsx`

```typescript
type AuthFormProps = {
  variant: 'signin' | 'signup'
}
```

- Fields: email (`<input type="email" required>`), password (`<input type="password" required minLength={8}>`)
- Client-side validation runs on submit before calling Supabase; invalid state shows inline error text below the field and does not call the network
- Submit button shows a loading spinner and is `disabled` while the request is in flight
- On `signup`: calls `supabase.auth.signUp({ email, password })`; on success with no session returned, still redirect to `/dashboard` (email confirmation is disabled per §2)
- On `signin`: calls `supabase.auth.signInWithPassword({ email, password })`
- On success: `router.push(redirectParam ?? '/dashboard')`; `router.refresh()` to sync server components with the new session
- On error: map the Supabase error to the messages in the table in §1 and render in a dismissible error banner above the form fields

### 3.4 `AuthProvider` (React Context)

`app/layout.tsx` wraps the tree in an `AuthProvider` (`lib/auth/AuthProvider.tsx`) that:
- Calls `supabase.auth.getSession()` once on mount and subscribes to `supabase.auth.onAuthStateChange`
- Exposes `{ user, session, isLoading }` via context to any Client Component that needs auth state client-side (e.g. Navbar showing "Sign Out")
- Does **not** gate rendering — route protection is middleware's job, this context is for UI state only

### 3.5 Pages

| Route | File | Notes |
|---|---|---|
| `/auth/signin` | `app/(auth)/signin/page.tsx` | Renders `<AuthForm variant="signin" />`; reads `?redirect=` search param |
| `/auth/signup` | `app/(auth)/signup/page.tsx` | Renders `<AuthForm variant="signup" />` |

---

## 4. Design

- Form container: centered card, `max-width: 400px`, White background, `border-radius: 12px` (Modal radius per design.md), `padding: 32px`
- Field labels: Paragraph Small Regular (12/18), Grey 500, positioned above each input with `4px` gap
- Inputs: `border-radius: 6px`, `1px solid` Grey 100 default / Blue 500 (2px) on focus per design.md state table, `padding: 12px`
- Primary submit button: Blue 500 background, White text, `border-radius: 6px`, full width
- Error banner: Red 50 background, `1px solid` Red 500 border, Red 700 text, `border-radius: 6px`, `padding: 12px`, positioned above the fields with `16px` gap below it
- Inline field errors: Paragraph Small Regular, Red 500, `4px` below the offending field

---

## 5. Edge Cases

- User double-submits the form (double-click) → submit button `disabled` while `isLoading` is true prevents duplicate requests
- User navigates directly to `/dashboard` with an expired refresh token → middleware's `getUser()` returns null → redirect to sign-in
- User signs out from one tab while another tab is open → `onAuthStateChange` fires in the other tab via the Supabase client's storage listener; `AuthProvider` updates context; next protected navigation is caught by middleware
- Password manager autofill triggers validation on paste, not only on keystroke — validation must run on both `input` and `blur` events

---

## 6. Acceptance Criteria

- [ ] Sign-up with a valid, unused email + 8+ char password creates an account and redirects to `/dashboard` within 10 seconds
- [ ] Sign-up with an already-registered email shows "An account with this email already exists. Sign in instead."
- [ ] Sign-in with valid credentials redirects to `/dashboard` (or `?redirect=` target)
- [ ] Sign-in with invalid credentials shows "Incorrect email or password." without revealing whether the email exists
- [ ] Visiting any of `/dashboard`, `/upload`, `/contracts/*` while unauthenticated redirects to `/auth/signin`
- [ ] Visiting `/auth/signin` or `/auth/signup` while already authenticated redirects to `/dashboard`
- [ ] Sign-out clears the session and subsequent visits to protected routes redirect to sign-in
