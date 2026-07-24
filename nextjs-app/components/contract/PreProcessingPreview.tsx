'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CustomTermInput } from './CustomTermInput'

export type PreProcessingPreviewProps = {
  standardTerms: string[]
  onProcess: (customTerms: string[]) => void
}

export function PreProcessingPreview({ standardTerms, onProcess }: PreProcessingPreviewProps) {
  const [customTerms, setCustomTerms] = useState<string[]>([])

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-100 bg-white p-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-h5 text-text-primary">Key terms ContractIQ will extract</h2>
        <ul className="flex flex-col gap-2">
          {standardTerms.map((term) => (
            <li key={term} className="text-body-lg text-text-primary">
              {term}
            </li>
          ))}
        </ul>
      </div>

      <CustomTermInput terms={customTerms} standardTerms={standardTerms} onChange={setCustomTerms} max={5} />

      <Button type="button" onClick={() => onProcess(customTerms)} className="w-full">
        Process Contract
      </Button>
    </div>
  )
}
