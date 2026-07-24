'use client'

import { useMemo, useState } from 'react'
import { ContractRow } from './ContractRow'
import type { ContractSummary } from '@/types'

export type ContractHistoryTableProps = {
  contracts: ContractSummary[]
}

type SortKey = 'date' | 'name' | 'type'
type SortDirection = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'date', label: 'Date' },
]

function compare(a: ContractSummary, b: ContractSummary, key: SortKey): number {
  if (key === 'date') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  if (key === 'name') return a.file_name.localeCompare(b.file_name)
  return a.contract_type.localeCompare(b.contract_type)
}

export function ContractHistoryTable({ contracts }: ContractHistoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sorted = useMemo(() => {
    const result = [...contracts].sort((a, b) => compare(a, b, sortKey))
    return sortDirection === 'desc' ? result.reverse() : result
  }, [contracts, sortKey, sortDirection])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection(key === 'date' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-100">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="bg-grey-25">
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort(column.key)}
                  className="flex items-center gap-1 text-body-sm text-text-secondary hover:text-text-primary"
                >
                  {column.label}
                  {sortKey === column.key && <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-body-sm text-text-secondary">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((contract) => (
            <ContractRow key={contract.id} contract={contract} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
