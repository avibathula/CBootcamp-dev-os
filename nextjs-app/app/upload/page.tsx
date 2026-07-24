'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { PdfDropzone } from '@/components/contract/PdfDropzone'
import { PreProcessingPreview } from '@/components/contract/PreProcessingPreview'
import { ExtractionProgressBar } from '@/components/layout/ExtractionProgressBar'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { ContractType, UploadContractResponse, ProcessContractResponse, ApiError } from '@/types'

const CONTRACT_TYPE_OPTIONS: { value: ContractType; label: string; description: string }[] = [
  { value: 'nda', label: 'NDA', description: 'Non-Disclosure Agreement' },
  { value: 'msa', label: 'MSA', description: 'Master Service Agreement' },
]

type ProcessingState = { step: 1 | 2 | 3 } | { step: 'error'; message: string } | null

export default function UploadPage() {
  const router = useRouter()
  const [contractType, setContractType] = useState<ContractType | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadContractResponse | null>(null)
  const [processing, setProcessing] = useState<ProcessingState>(null)
  const [lastCustomTerms, setLastCustomTerms] = useState<string[]>([])

  async function handleProcess(customTerms: string[]) {
    if (!uploadResult) return
    setLastCustomTerms(customTerms)
    setProcessing({ step: 2 })

    const supabase = createClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setProcessing({ step: 'error', message: 'Your session expired. Please sign in again.' })
      return
    }

    try {
      const response = await fetch('/api/process-contract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: uploadResult.contract_id, custom_terms: customTerms }),
      })

      const body = (await response.json()) as ProcessContractResponse | ApiError

      if (!response.ok) {
        setProcessing({
          step: 'error',
          message: 'error' in body ? body.error : 'AI analysis failed. Please try again.',
        })
        return
      }

      setProcessing({ step: 3 })
      setTimeout(() => router.push(`/contracts/${uploadResult.contract_id}`), 500)
    } catch {
      setProcessing({
        step: 'error',
        message: 'AI analysis failed. Please check your connection and try again.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-bg-surface">
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-8 sm:px-16 sm:py-12 lg:px-28 lg:py-24">
        <h1 className="text-h4 text-text-primary">Review a Contract</h1>

        {!uploadResult ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-body-sm text-text-secondary">Contract type</p>
              <div className="flex gap-4">
                {CONTRACT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setContractType(option.value)}
                    className={[
                      'flex-1 rounded-lg border-2 px-6 py-4 text-left transition-colors duration-fast ease-out',
                      contractType === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-grey-100 bg-white hover:border-grey-200',
                    ].join(' ')}
                  >
                    <p className="text-body-lg font-medium text-text-primary">{option.label}</p>
                    <p className="text-body-sm text-text-secondary">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {contractType && <PdfDropzone contractType={contractType} onUploaded={setUploadResult} />}
          </div>
        ) : processing?.step === 'error' ? (
          <div className="flex flex-col gap-4 rounded-lg border border-red-500 bg-red-50 p-6 text-center">
            <p className="text-body-lg text-red-700">{processing.message}</p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleProcess(lastCustomTerms)}
              className="mx-auto"
            >
              Retry
            </Button>
          </div>
        ) : processing ? (
          <div className="rounded-lg border border-grey-100 bg-white p-6">
            <ExtractionProgressBar currentStep={processing.step} />
          </div>
        ) : (
          <PreProcessingPreview standardTerms={uploadResult.standard_terms} onProcess={handleProcess} />
        )}
      </main>
    </div>
  )
}
