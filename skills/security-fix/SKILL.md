---
name: security-fix
description: >
  Scans a finished codebase for the most common web-application security issues and fixes
  each one in place, then reports what changed. Use this skill after the application is built
  and before deployment. Trigger when the user says things like "scan the codebase and fix
  security issues", "run the security fix", "security scan", "harden the app", or "check for
  vulnerabilities before deploy". This is a remediation pass over existing code. It modifies
  existing files only and does not scaffold new security infrastructure.
---

## Purpose

Act as a security reviewer for an already-built application. Work through the eight checks
below in order. For each issue found, propose the fix, let the user review the diff, and apply
it before moving to the next check. At the end, produce a summary table plus a
`Manual Actions Required` list for anything found but not safely auto-fixable.

This skill remediates existing code. It must not create a parallel security stack (no new
`lib/security/` service layer, no alternate rate limiter, no server-side auth routes). If a
control already exists, recognise it and leave it in place.

---

## Operating rules

1. **Review before applying.** Present each change as a diff and get approval before writing.
   Do not run in a mode that silently auto-applies edits.
2. **Modify existing files only.** Do not introduce new frameworks or parallel implementations
   of controls that already exist.
3. **Confirm, do not assume.** Read a file before deciding it has a vulnerability. Many
   apparent issues are already handled.
4. **No behaviour regressions.** A fix that breaks a working feature is not a fix. Preserve
   existing functionality.

---

## Project-specific guardrails (read first)

These reflect how this codebase is intentionally built. Violating them creates bugs, not
security improvements.

- **Public Supabase values are correct as public.** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` are meant to reach the browser.
  The anon key is a public key protected by row-level security. Do NOT strip `NEXT_PUBLIC_`
  from these or move them server-side. Only `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
  the `UPSTASH_*` keys are true secrets, and they already have no `NEXT_PUBLIC_` prefix.
- **Auth already exists.** API routes are protected by `requireAuth(request)` from
  `lib/api/requireAuth.ts`. Treat any route that calls `requireAuth` as already protected. Do
  NOT insert a second `getUser()` check on top of it. If a route genuinely lacks an auth check,
  add one using the existing `requireAuth` helper for consistency, not a new pattern.
- **The config file is `next.config.mjs`, not `next.config.js`.** Edit the existing `.mjs`
  file. Do not create a competing `next.config.js`. When adding security headers, PRESERVE the
  two existing blocks exactly: `experimental.serverComponentsExternalPackages: ['pdf-parse']`
  and the `webpack` alias that sets `config.resolve.alias.canvas = false` and
  `config.resolve.alias.encoding = false`. Dropping either reintroduces a known crash.
- **Rate limiting is Upstash Redis.** It lives in `lib/api/rateLimit.ts` and fails open when
  unset. Do NOT replace it with a Supabase-table rate limiter or add a second system.
- **Email confirmation is intentionally disabled** in Supabase for the MVP flow. Do NOT tell
  the user to re-enable it, and do not change auth-provider settings.
- **Do not touch the docs pipeline.** This is a code remediation pass. Leave `docs/` alone.

---

## The eight checks

Apply in order. For each, report status: `OK` (already safe), `Fixed`, or `Manual`.

### 1. Hardcoded secrets
Search source for literal keys or tokens (for example strings beginning `sk-`, `eyJ`, service
role JWTs, connection strings). Replace any with `process.env.YOUR_VAR`, and document the
variable in `.env.local.example`. Confirm no secret is committed in tracked files.

### 2. Secrets in `console.log`
Find `console.*` statements that print tokens, keys, request bodies with credentials, or full
user records. Remove them or scrub the sensitive fields. Server-side error logging via the
existing `logServerError` helper is fine; do not remove legitimate error logging.

### 3. Secrets exposed to the client
Flag any true secret carried with a `NEXT_PUBLIC_` prefix or read in a client component. Move
the read server-side and drop the prefix. Respect the guardrail above: the Supabase URL, anon
key, and app URL are legitimately public and must stay as they are.

### 4. API routes missing auth
For each handler under `app/api/**/route.ts`, confirm an auth check runs before any business
logic or database call. Routes already calling `requireAuth` are protected; mark them `OK`. Add
`requireAuth` only to a route that genuinely lacks it.

### 5. Stack traces in error responses
Ensure clients receive a generic message (for example `Internal server error`) while the full
error stays in the server log. The existing `Errors.*` helpers and `logServerError` already do
this; confirm no route returns raw `error.message`, `error.stack`, or the caught object to the
client.

### 6. Missing security headers
Add response security headers in `next.config.mjs` via the `headers()` async export, and set
`poweredByHeader: false`. Include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`. Preserve the
existing `experimental` and `webpack` blocks in the same file (see guardrails).

### 7. Unsafe `eval` / `innerHTML`
Find `eval(`, `new Function(`, or `dangerouslySetInnerHTML`. Remove `eval`/`new Function`. Where
`dangerouslySetInnerHTML` renders any non-constant content, sanitise with
`DOMPurify.sanitize()` and add the dependency. Confirm the affected UI still renders (for
example the chat `[Page X]` / `[From conversation]` badges).

### 8. `.gitignore` missing env files
Confirm `.env`, `.env.local`, and `.env*.local` are ignored. This repo already ignores `.env`
and `.env.*` and keeps `!.env.local.example` tracked on purpose. Do not add rules that would
re-ignore `.env.local.example`. Add only genuinely missing entries.

---

## Verification

After applying fixes, guide the user to verify:

- Security headers appear on responses (`curl -I http://localhost:3000` or DevTools Network).
- An unauthenticated call to a protected route returns `401`.
- No secret value appears in page source.
- `git status` does not show `.env.local` as untracked.

Recommend re-running `npm test`, `npm run test:integration`, and `npm run build` to confirm no
regression, especially auth flows and the `pdf-parse` config. Note that `npm run dev` has a
known dev-only PDF-viewer issue unrelated to security, so use non-viewer pages or `curl` for
these checks.

---

## Completion

Present:
- A table with one row per check: check name, status (`OK` / `Fixed` / `Manual`), files changed.
- The full list of files modified.
- A `Manual Actions Required` section for anything found that could not be safely auto-fixed,
  with exact steps.
- Any environment variables newly referenced (documented in `.env.local.example`).

Do not enable email confirmation, replace the rate limiter, or alter the docs. Confirm the two
`next.config.mjs` blocks (`serverComponentsExternalPackages` and the `webpack` alias) are still
present before finishing.
