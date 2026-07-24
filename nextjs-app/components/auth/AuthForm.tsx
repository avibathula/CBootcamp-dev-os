'use client'

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export type AuthFormVariant = 'signin' | 'signup'

export type AuthFormProps = {
  variant: AuthFormVariant
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mapAuthError(variant: AuthFormVariant, error: { message: string; status?: number }): string {
  const message = error.message.toLowerCase()

  if (error.status === 429) {
    return 'Too many sign-in attempts. Try again in 15 minutes.'
  }
  if (variant === 'signup' && message.includes('already registered')) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (variant === 'signup' && message.includes('already') && message.includes('exist')) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (variant === 'signin' && message.includes('not confirmed')) {
    return 'Please confirm your email before signing in — check your inbox for the confirmation link.'
  }
  if (variant === 'signin' && (message.includes('invalid') || message.includes('credentials'))) {
    return 'Incorrect email or password.'
  }
  if (message.includes('fetch') || message.includes('network')) {
    return variant === 'signup'
      ? 'Sign-up unavailable. Try again in a moment.'
      : 'Sign-in unavailable. Try again in a moment.'
  }
  return variant === 'signup'
    ? 'Sign-up unavailable. Try again in a moment.'
    : 'Incorrect email or password.'
}

export function AuthForm({ variant }: AuthFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [passwordError, setPasswordError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)

  const redirectTarget = searchParams.get('redirect') || '/dashboard'

  function validate(): boolean {
    let valid = true
    if (!EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address.')
      valid = false
    } else {
      setEmailError(undefined)
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      valid = false
    } else {
      setPasswordError(undefined)
    }

    return valid
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(undefined)

    if (!validate() || isSubmitting) return

    setIsSubmitting(true)

    if (variant === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })

      if (error) {
        setFormError(mapAuthError(variant, error))
        setIsSubmitting(false)
        return
      }

      // Email confirmation is enabled on the Supabase project: no session is
      // issued until the user clicks the confirmation link. Disable "Confirm
      // email" in Supabase Auth settings to get the immediate-redirect MVP
      // flow described in the engineering doc; until then, this is the
      // correct fallback rather than a broken redirect to a protected route.
      if (!data.session) {
        setConfirmationPending(true)
        setIsSubmitting(false)
        return
      }

      router.push(redirectTarget)
      router.refresh()
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setFormError(mapAuthError(variant, error))
      setIsSubmitting(false)
      return
    }

    router.push(redirectTarget)
    router.refresh()
  }

  if (confirmationPending) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-md border border-green-500 bg-green-50 px-4 py-4 text-body-sm text-green-700"
      >
        <p className="font-medium">Check your email to confirm your account.</p>
        <p>We sent a confirmation link to {email}. Click it, then sign in below.</p>
        <Link href="/auth/signin" className="font-medium underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  const isSignup = variant === 'signup'

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && (
        <div
          role="alert"
          className="rounded-md border border-red-500 bg-red-50 px-3 py-3 text-body-sm text-red-700"
        >
          {formError}
          {formError.includes('Sign in instead') && (
            <>
              {' '}
              <Link href="/auth/signin" className="font-medium underline">
                Sign in
              </Link>
            </>
          )}
        </div>
      )}

      <Input
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={emailError}
        required
      />

      <Input
        type="password"
        label="Password"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={passwordError}
        minLength={8}
        required
      />

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-body-sm text-text-secondary">
        {isSignup ? (
          <>
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-medium text-blue-500 hover:text-blue-600">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="font-medium text-blue-500 hover:text-blue-600">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
