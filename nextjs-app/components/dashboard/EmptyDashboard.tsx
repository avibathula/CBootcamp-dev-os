import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export function EmptyDashboard() {
  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border border-dashed border-grey-200 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-h4" aria-hidden="true">
        📄
      </div>
      <p className="max-w-sm text-body-lg text-text-secondary">
        No contracts reviewed yet — upload your first contract to begin
      </p>
      <Link href="/upload">
        <Button variant="primary">Review a Contract</Button>
      </Link>
    </div>
  )
}
