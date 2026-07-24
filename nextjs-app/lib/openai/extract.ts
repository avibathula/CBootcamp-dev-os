import OpenAI from 'openai'
import { STANDARD_TERMS } from '@/lib/constants/standardTerms'
import { NDA_FEW_SHOT_EXAMPLES, MSA_FEW_SHOT_EXAMPLES } from './fewShotExamples'
import type { ContractType, ExtractionOutput, ExtractionTerm } from '@/types'

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export function buildExtractionPrompt(
  contractType: ContractType,
  contractText: string,
  customTerms: string[]
): { system: string; user: string } {
  const standardTermsList = STANDARD_TERMS[contractType].map((term) => `- ${term}`).join('\n')
  const customTermsList = customTerms.length > 0 ? customTerms.map((term) => `- ${term}`).join('\n') : 'None'
  const fewShotExamples = contractType === 'nda' ? NDA_FEW_SHOT_EXAMPLES : MSA_FEW_SHOT_EXAMPLES

  const system = `You are a legal contract analyst. Your task is to extract key terms from the provided contract text.

CONTRACT TYPE: ${contractType.toUpperCase()}

STANDARD TERMS TO EXTRACT:
${standardTermsList}

CUSTOM TERMS TO EXTRACT:
${customTermsList}

INSTRUCTIONS:
- For each term, return: term_name, value, page_number (1-indexed), confidence_score (0-100), source_sentence
- confidence_score reflects how certain you are the extracted value is correct (0=not found/guessed, 100=explicitly stated verbatim)
- source_sentence is the verbatim sentence from the document you used to extract the value
- If a term is not present in the document, return value=null, confidence_score=0, source_sentence=null
- Return ONLY valid JSON. No explanation text.

OUTPUT FORMAT:
{ "terms": [ { "term_name": "...", "value": "...", "page_number": 1, "confidence_score": 85.0, "source_sentence": "..." } ] }

FEW-SHOT EXAMPLES:
${fewShotExamples}`

  return { system, user: contractText }
}

export async function callExtraction(messages: ChatCompletionMessage[]): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty extraction response.')
  }
  return content
}

export function parseExtractionResponse(raw: string): ExtractionOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Extraction response was not valid JSON.')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('terms' in parsed) ||
    !Array.isArray((parsed as { terms: unknown }).terms)
  ) {
    throw new Error('Extraction response did not match the expected shape.')
  }

  const terms = (parsed as { terms: unknown[] }).terms.map((rawTerm): ExtractionTerm => {
    if (typeof rawTerm !== 'object' || rawTerm === null) {
      throw new Error('Extraction term was not an object.')
    }
    const term = rawTerm as Record<string, unknown>

    if (typeof term.term_name !== 'string' || term.term_name.trim() === '') {
      throw new Error('Extraction term missing term_name.')
    }

    const confidenceScore =
      typeof term.confidence_score === 'number' ? term.confidence_score : Number(term.confidence_score)

    if (Number.isNaN(confidenceScore)) {
      throw new Error('Extraction term had an invalid confidence_score.')
    }

    return {
      term_name: term.term_name,
      value: typeof term.value === 'string' ? term.value : null,
      page_number: typeof term.page_number === 'number' ? term.page_number : null,
      confidence_score: Math.min(100, Math.max(0, confidenceScore)),
      source_sentence: typeof term.source_sentence === 'string' ? term.source_sentence : null,
    }
  })

  return { terms }
}
