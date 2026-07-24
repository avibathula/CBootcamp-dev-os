import { buildExtractionPrompt, parseExtractionResponse } from '@/lib/openai/extract'

describe('buildExtractionPrompt', () => {
  it('includes the correct standard terms for an NDA', () => {
    const { system } = buildExtractionPrompt('nda', 'Some contract text', [])
    expect(system).toContain('CONTRACT TYPE: NDA')
    expect(system).toContain('Confidentiality Obligations')
    expect(system).toContain('Non-Solicitation')
    expect(system).not.toContain('Payment Terms')
  })

  it('includes the correct standard terms for an MSA', () => {
    const { system } = buildExtractionPrompt('msa', 'Some contract text', [])
    expect(system).toContain('CONTRACT TYPE: MSA')
    expect(system).toContain('Payment Terms')
    expect(system).toContain('Liability Cap')
    expect(system).not.toContain('Non-Solicitation')
  })

  it('appends custom terms when provided', () => {
    const { system } = buildExtractionPrompt('nda', 'text', ['Auto-renewal clause'])
    expect(system).toContain('CUSTOM TERMS TO EXTRACT:')
    expect(system).toContain('Auto-renewal clause')
  })

  it('says "None" for custom terms when none are provided', () => {
    const { system } = buildExtractionPrompt('nda', 'text', [])
    expect(system).toMatch(/CUSTOM TERMS TO EXTRACT:\nNone/)
  })

  it('includes few-shot examples matching the contract type', () => {
    const nda = buildExtractionPrompt('nda', 'text', [])
    const msa = buildExtractionPrompt('msa', 'text', [])
    expect(nda.system).toContain('Northwind Robotics')
    expect(msa.system).toContain('Carraway Logistics')
  })

  it('passes the contract text through as the user message unmodified', () => {
    const contractText = '\n[PAGE 1]\nSample contract body.'
    const { user } = buildExtractionPrompt('nda', contractText, [])
    expect(user).toBe(contractText)
  })
})

describe('parseExtractionResponse', () => {
  it('parses a valid extraction response into an array of terms', () => {
    const raw = JSON.stringify({
      terms: [
        {
          term_name: 'Parties',
          value: 'Acme and Beta',
          page_number: 1,
          confidence_score: 95,
          source_sentence: 'This agreement is between Acme and Beta.',
        },
      ],
    })

    const result = parseExtractionResponse(raw)
    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]).toEqual({
      term_name: 'Parties',
      value: 'Acme and Beta',
      page_number: 1,
      confidence_score: 95,
      source_sentence: 'This agreement is between Acme and Beta.',
    })
  })

  it('handles a "not found" term with null value and zero confidence', () => {
    const raw = JSON.stringify({
      terms: [{ term_name: 'Non-Solicitation', value: null, page_number: null, confidence_score: 0, source_sentence: null }],
    })
    const result = parseExtractionResponse(raw)
    expect(result.terms[0].value).toBeNull()
    expect(result.terms[0].confidence_score).toBe(0)
  })

  it('throws on malformed JSON', () => {
    expect(() => parseExtractionResponse('not valid json {')).toThrow()
  })

  it('throws when the top-level "terms" array is missing', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ foo: 'bar' }))).toThrow()
  })

  it('throws when a term is missing term_name', () => {
    const raw = JSON.stringify({ terms: [{ value: 'x', confidence_score: 50 }] })
    expect(() => parseExtractionResponse(raw)).toThrow()
  })

  it('coerces a numeric-string confidence_score', () => {
    const raw = JSON.stringify({
      terms: [{ term_name: 'Parties', value: 'x', page_number: 1, confidence_score: '85', source_sentence: 'x' }],
    })
    const result = parseExtractionResponse(raw)
    expect(result.terms[0].confidence_score).toBe(85)
  })

  it('clamps an out-of-range confidence_score into [0, 100]', () => {
    const raw = JSON.stringify({
      terms: [
        { term_name: 'A', value: 'x', page_number: 1, confidence_score: 150, source_sentence: 'x' },
        { term_name: 'B', value: 'x', page_number: 1, confidence_score: -10, source_sentence: 'x' },
      ],
    })
    const result = parseExtractionResponse(raw)
    expect(result.terms[0].confidence_score).toBe(100)
    expect(result.terms[1].confidence_score).toBe(0)
  })
})
