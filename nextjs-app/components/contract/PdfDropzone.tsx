'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContractType, UploadContractResponse, ApiError } from '@/types'

export type PdfDropzoneProps = {
  contractType: ContractType
  onUploaded: (result: UploadContractResponse) => void
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export function PdfDropzone({ contractType, onUploaded }: PdfDropzoneProps) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const validateAndUpload = useCallback(
    async (file: File) => {
      setError(undefined)

      if (file.type !== 'application/pdf') {
        setError('Only PDF files are accepted.')
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError('File exceeds the 10 MB limit.')
        return
      }

      setIsUploading(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError('Your session expired. Please sign in again.')
        setIsUploading(false)
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('contract_type', contractType)

      try {
        const response = await fetch('/api/upload-contract', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })

        const body = (await response.json()) as UploadContractResponse | ApiError

        if (!response.ok) {
          setError('error' in body ? body.error : 'Upload failed. Please try again.')
          setIsUploading(false)
          return
        }

        onUploaded(body as UploadContractResponse)
      } catch {
        setError('Upload failed. Please check your connection and try again.')
        setIsUploading(false)
      }
    },
    [contractType, onUploaded, supabase]
  )

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void validateAndUpload(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        aria-label="Upload a PDF contract"
        className={[
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-12 py-12 text-center',
          'transition-colors duration-fast ease-out',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-grey-200 hover:border-grey-300',
          isUploading ? 'pointer-events-none opacity-70' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void validateAndUpload(file)
            event.target.value = ''
          }}
        />
        {isUploading ? (
          <>
            <span
              className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-body-lg text-text-primary">Extracting text…</p>
            <p className="text-body-sm text-text-secondary">Usually under 30 seconds</p>
          </>
        ) : (
          <>
            <span className="text-h4" aria-hidden="true">
              📄
            </span>
            <p className="text-body-lg text-text-primary">Drag and drop your PDF here, or click to browse</p>
            <p className="text-body-sm text-text-secondary">PDF, up to 10 MB, 20 pages</p>
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-red-500 bg-red-50 px-3 py-3 text-body-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
