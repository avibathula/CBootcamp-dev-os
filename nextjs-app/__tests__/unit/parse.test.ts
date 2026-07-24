/**
 * @jest-environment node
 */
import { readFile } from 'fs/promises'
import path from 'path'
import { parsePdf } from '@/lib/pdf/parse'

describe('parsePdf', () => {
  it('extracts text with [PAGE N] markers and correct counts for a valid PDF', async () => {
    const buffer = await readFile(path.join(__dirname, '../fixtures/sample-nda.pdf'))
    const result = await parsePdf(buffer)

    expect(result.pageCount).toBe(1)
    expect(result.text).toMatch(/\[PAGE 1\]/)
    expect(result.text).toContain('Confidentiality Obligations')
    expect(result.wordCount).toBeGreaterThan(100)
    expect(result.tokenCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBe(Math.ceil(result.text.length / 4))
  })

  it('reports a word count below the scanned-PDF threshold for a very short document', async () => {
    const buffer = await readFile(path.join(__dirname, '../fixtures/sample-short.pdf'))
    const result = await parsePdf(buffer)

    expect(result.wordCount).toBeLessThan(100)
  })

  it('throws for a buffer that is not a valid PDF', async () => {
    const buffer = Buffer.from('this is not a pdf file')
    await expect(parsePdf(buffer)).rejects.toThrow()
  })
})
