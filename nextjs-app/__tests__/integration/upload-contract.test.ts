/**
 * @jest-environment node
 */
import { createMockSupabase, mockUser } from './helpers/mockSupabase'

jest.mock('@/lib/api/requireAuth', () => ({
  requireAuth: jest.fn(),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/pdf/parse', () => ({
  parsePdf: jest.fn(),
}))

import { requireAuth } from '@/lib/api/requireAuth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { parsePdf } from '@/lib/pdf/parse'
import { POST } from '@/app/api/upload-contract/route'

const mockRequireAuth = requireAuth as jest.Mock
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock
const mockParsePdf = parsePdf as jest.Mock

const VALID_PARSE_RESULT = {
  text: '\n[PAGE 1]\nSample contract text.',
  pageCount: 1,
  wordCount: 150,
  tokenCount: 500,
}

function buildRequest(fields: { file?: File; contract_type?: string }) {
  const formData = new FormData()
  if (fields.file) formData.append('file', fields.file)
  if (fields.contract_type !== undefined) formData.append('contract_type', fields.contract_type)

  return new Request('http://localhost/api/upload-contract', { method: 'POST', body: formData })
}

function pdfFile(bytes = '%PDF-1.4\nfake pdf content', name = 'test.pdf') {
  return new File([bytes], name, { type: 'application/pdf' })
}

describe('POST /api/upload-contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ user: mockUser })
    mockParsePdf.mockResolvedValue(VALID_PARSE_RESULT)
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(401)
  })

  it('returns 400 for an invalid contract_type', async () => {
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'bogus' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 when the file field is missing', async () => {
    const response = await POST(buildRequest({ contract_type: 'nda' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 for a non-PDF mime type', async () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const response = await POST(buildRequest({ file, contract_type: 'nda' }))
    expect(response.status).toBe(400)
  })

  it('returns 422 for a file over 10MB', async () => {
    const bigContent = new Uint8Array(11 * 1024 * 1024)
    const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' })
    const response = await POST(buildRequest({ file, contract_type: 'nda' }))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toMatch(/10 MB/)
  })

  it('returns 422 when the file does not start with the PDF magic bytes', async () => {
    const file = new File(['NOT A REAL PDF'], 'fake.pdf', { type: 'application/pdf' })
    const response = await POST(buildRequest({ file, contract_type: 'nda' }))
    expect(response.status).toBe(422)
  })

  it('returns 422 when parsePdf throws (corrupted/password-protected PDF)', async () => {
    mockParsePdf.mockRejectedValue(new Error('bad pdf'))
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(422)
  })

  it('returns 422 when the page count exceeds 20', async () => {
    mockParsePdf.mockResolvedValue({ ...VALID_PARSE_RESULT, pageCount: 21 })
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toMatch(/20-page limit/)
  })

  it('returns 422 when the word count is below the scanned-PDF threshold', async () => {
    mockParsePdf.mockResolvedValue({ ...VALID_PARSE_RESULT, wordCount: 50 })
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toMatch(/Scanned PDFs/)
  })

  it('returns 422 when the token count exceeds 15,000', async () => {
    mockParsePdf.mockResolvedValue({ ...VALID_PARSE_RESULT, tokenCount: 16000 })
    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toMatch(/15,000 tokens/)
  })

  it('returns 200 with contract_id, standard_terms, and page_count for a valid NDA upload', async () => {
    const supabase = createMockSupabase({
      contracts: { data: { id: 'contract-1' }, error: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.contract_id).toBe('contract-1')
    expect(body.page_count).toBe(1)
    expect(body.standard_terms).toContain('Confidentiality Obligations')
    expect(body.standard_terms).not.toContain('Payment Terms')
  })

  it('returns 200 with the MSA standard terms for an MSA upload', async () => {
    const supabase = createMockSupabase({ contracts: { data: { id: 'contract-2' }, error: null } })
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'msa' }))
    const body = await response.json()
    expect(body.standard_terms).toContain('Payment Terms')
    expect(body.standard_terms).not.toContain('Confidentiality Obligations')
  })

  it('still returns 200 with a null file_path when Storage upload fails', async () => {
    const supabase = createMockSupabase({ contracts: { data: { id: 'contract-3' }, error: null } })
    supabase.storage.from = jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: { message: 'storage down' } }),
      createSignedUrl: jest.fn(),
    })) as unknown as typeof supabase.storage.from
    mockCreateServiceRoleClient.mockReturnValue(supabase)

    const response = await POST(buildRequest({ file: pdfFile(), contract_type: 'nda' }))
    expect(response.status).toBe(200)
  })
})
