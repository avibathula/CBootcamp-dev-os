'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import type { ContractSummary, ContractStatus } from '@/types'

export type ContractRowProps = {
  contract: ContractSummary
}

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: 'green' | 'yellow' | 'red' | 'grey' }> = {
  complete: { label: 'Complete', color: 'green' },
  processing: { label: 'Processing', color: 'yellow' },
  error: { label: 'Failed', color: 'red' },
  uploading: { label: 'Pending', color: 'grey' },
  ready: { label: 'Pending', color: 'grey' },
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function ContractRow({ contract }: ContractRowProps) {
  const router = useRouter()
  const isClickable = contract.status === 'complete'
  const statusConfig = STATUS_CONFIG[contract.status]

  return (
    <tr
      onClick={() => isClickable && router.push(`/contracts/${contract.id}`)}
      className={[
        'border-b border-grey-50 transition-colors duration-fast ease-out',
        isClickable ? 'cursor-pointer hover:bg-grey-50' : 'cursor-not-allowed opacity-60',
      ].join(' ')}
    >
      <td className="px-4 py-3 text-body-lg text-text-primary">{contract.file_name}</td>
      <td className="px-4 py-3">
        <Badge color={contract.contract_type === 'msa' ? 'blue' : 'violet'}>
          {contract.contract_type.toUpperCase()}
        </Badge>
      </td>
      <td className="px-4 py-3 text-body-sm text-text-secondary">
        {dateFormatter.format(new Date(contract.created_at))}
      </td>
      <td className="px-4 py-3">
        <Badge color={statusConfig.color}>{statusConfig.label}</Badge>
      </td>
    </tr>
  )
}
