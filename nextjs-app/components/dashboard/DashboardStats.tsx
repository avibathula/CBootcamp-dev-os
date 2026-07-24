import type { ContractSummary } from '@/types'

export type DashboardStatsProps = {
  contracts: ContractSummary[]
}

export function DashboardStats({ contracts }: DashboardStatsProps) {
  const total = contracts.length
  const ndaCount = contracts.filter((c) => c.contract_type === 'nda').length
  const msaCount = contracts.filter((c) => c.contract_type === 'msa').length

  const tiles = [
    { label: 'Total Contracts', value: total },
    { label: 'NDAs Reviewed', value: ndaCount },
    { label: 'MSAs Reviewed', value: msaCount },
  ]

  return (
    <div className="flex flex-wrap gap-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="min-w-[160px] flex-1 rounded-lg border border-grey-100 bg-white p-6"
        >
          <p className="text-h4 text-text-primary">{tile.value}</p>
          <p className="text-body-sm text-text-secondary">{tile.label}</p>
        </div>
      ))}
    </div>
  )
}
