'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthProvider'
import { Button } from '@/components/ui/Button'

export function Navbar() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between border-b border-grey-100 bg-white px-6 py-4 sm:px-16 lg:px-28">
      <Link href="/dashboard" className="text-body-lg font-semibold text-text-primary">
        ContractIQ
      </Link>
      {user && (
        <div className="flex items-center gap-4">
          <span className="hidden text-body-sm text-text-secondary sm:inline">{user.email}</span>
          <Button variant="secondary" size="sm" onClick={handleSignOut} isLoading={isSigningOut}>
            Sign out
          </Button>
        </div>
      )}
    </header>
  )
}
