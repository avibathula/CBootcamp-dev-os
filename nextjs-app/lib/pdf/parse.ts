import { PDFParse } from 'pdf-parse'

export type ParsedPdf = {
  /** Full text with `[PAGE N]` markers inserted before each page's content. */
  text: string
  pageCount: number
  wordCount: number
  /** Conservative chars/4 estimate — no tokenizer dependency needed for a 15k-token ceiling. */
  tokenCount: number
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()

    const text = result.pages.map((page) => `\n[PAGE ${page.num}]\n${page.text}`).join('')
    const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length
    const tokenCount = Math.ceil(text.length / 4)

    return { text, pageCount: result.total, wordCount, tokenCount }
  } finally {
    await parser.destroy()
  }
}
