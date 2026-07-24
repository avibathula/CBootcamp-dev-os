import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/requireAuth'
import { Errors, logServerError } from '@/lib/api/errors'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { parsePdf } from '@/lib/pdf/parse'
import { STANDARD_TERMS } from '@/lib/constants/standardTerms'
import type { ContractType, UploadContractResponse } from '@/types'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_PAGE_COUNT = 20
const MIN_WORD_COUNT = 100
const MAX_TOKEN_COUNT = 15000
const PDF_MAGIC_BYTES = '%PDF-'

function isContractType(value: unknown): value is ContractType {
  return value === 'nda' || value === 'msa'
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(-180)
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_') || 'contract.pdf'
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const contractType = formData.get('contract_type')

    if (!isContractType(contractType)) {
      return Errors.badRequest('Contract type must be "nda" or "msa".')
    }

    if (!(file instanceof File)) {
      return Errors.badRequest('Only PDF files are accepted.')
    }

    if (file.type !== 'application/pdf') {
      return Errors.badRequest('Only PDF files are accepted.')
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Errors.unprocessable('File exceeds the 10 MB limit.')
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (buffer.subarray(0, 5).toString('ascii') !== PDF_MAGIC_BYTES) {
      return Errors.unprocessable(
        'This PDF could not be read. It may be password-protected or corrupted.'
      )
    }

    let parsed
    try {
      parsed = await parsePdf(buffer)
    } catch (error) {
      logServerError('upload-contract:parse', error)
      return Errors.unprocessable(
        'This PDF could not be read. It may be password-protected or corrupted.'
      )
    }

    if (parsed.pageCount > MAX_PAGE_COUNT) {
      return Errors.unprocessable('Contract exceeds the 20-page limit.')
    }

    if (parsed.wordCount < MIN_WORD_COUNT) {
      return Errors.unprocessable('Scanned PDFs are not supported yet.')
    }

    if (parsed.tokenCount > MAX_TOKEN_COUNT) {
      return Errors.unprocessable('This contract is too long for analysis (over 15,000 tokens).')
    }

    const supabase = createServiceRoleClient()

    const { data: contract, error: insertError } = await supabase
      .from('contracts')
      .insert({
        user_id: user.id,
        file_name: file.name,
        contract_type: contractType,
        contract_text: parsed.text,
        status: 'uploading',
        page_count: parsed.pageCount,
        token_count: parsed.tokenCount,
      })
      .select('id')
      .single()

    if (insertError || !contract) {
      logServerError('upload-contract:insert', insertError)
      return Errors.internal()
    }

    const objectPath = `${user.id}/${contract.id}/${sanitizeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(objectPath, buffer, { contentType: 'application/pdf', upsert: false })

    const filePath = uploadError ? null : objectPath
    if (uploadError) {
      logServerError('upload-contract:storage', uploadError)
    }

    const { error: updateError } = await supabase
      .from('contracts')
      .update({ status: 'ready', file_path: filePath })
      .eq('id', contract.id)

    if (updateError) {
      logServerError('upload-contract:update', updateError)
      return Errors.internal()
    }

    return NextResponse.json<UploadContractResponse>(
      {
        contract_id: contract.id,
        standard_terms: STANDARD_TERMS[contractType],
        page_count: parsed.pageCount,
      },
      { status: 200 }
    )
  } catch (error) {
    logServerError('upload-contract', error)
    return Errors.internal()
  }
}
