import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'

export const metadata: Metadata = {
  title: 'Sign Up — ContractIQ',
}

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-surface px-4 py-12">
      <div className="w-full max-w-[400px] rounded-xl border border-grey-100 bg-white p-8">
        <div className="mb-6 flex flex-col gap-1">
          <Link href="/" className="text-body-sm text-text-secondary hover:text-text-primary">
            ← ContractIQ
          </Link>
          <h1 className="text-h5 text-text-primary">Create your account</h1>
        </div>
        <Suspense fallback={null}>
          <AuthForm variant="signup" />
        </Suspense>
      </div>
    </main>
  )
}
