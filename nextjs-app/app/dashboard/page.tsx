'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { ContractHistoryTable } from '@/components/dashboard/ContractHistoryTable'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useContractsList } from '@/hooks/useContractsList'

export default function DashboardPage() {
  const { contracts, isLoading, error } = useContractsList()

  return (
    <div className="min-h-screen bg-bg-surface">
      <Navbar />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-8 sm:px-16 sm:py-12 lg:px-28 lg:py-24">
        <div className="flex items-center justify-between">
          <h1 className="text-h4 text-text-primary">Dashboard</h1>
          {contracts.length > 0 && (
            <Link href="/upload">
              <Button variant="primary">Review a Contract</Button>
            </Link>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-red-500 bg-red-50 px-4 py-3 text-body-sm text-red-700">
            Couldn&apos;t load your contracts. Try refreshing the page.
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-10">
            <div className="flex gap-4">
              <Skeleton className="h-24 flex-1" />
              <Skeleton className="h-24 flex-1" />
              <Skeleton className="h-24 flex-1" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : contracts.length === 0 ? (
          <EmptyDashboard />
        ) : (
          <>
            <DashboardStats contracts={contracts} />
            <ContractHistoryTable contracts={contracts} />
          </>
        )}
      </main>
    </div>
  )
}
