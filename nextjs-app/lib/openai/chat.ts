import OpenAI from 'openai'
import type { QueryClassification } from '@/types'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatCompletionMessage = { role: ChatRole; content: string }
export type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string }

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

// Conversation memory layer (docs/specs/06 §4): every question is classified
// before any context is assembled, and the classification drives both what
// gets retrieved and how the model is instructed to respond.
export const CONTRACT_TURN_LIMIT = 10
export const HISTORY_TURN_LIMIT = 20

const HISTORY_MARKERS =
  /\b(earlier|before|previously|you said|we discussed|what have i asked|what did i ask|our conversation|this conversation|you mentioned|so far)\b/i

const CONTRACT_MARKERS =
  /\b(clause|section|page|term|terms|party|parties|agreement|contract|payment|invoice|liability|indemnif|confidential|terminat|governing law|jurisdiction|notice period|effective date|dollar|amount|penalty|renewal|scope|deliverable)\b/i

/**
 * Classifies a user question into CONTRACT, HISTORY, or BOTH. Falls back to
 * BOTH whenever the message is ambiguous (matches both marker sets, or
 * neither) — BOTH's retrieval is a strict superset of CONTRACT's, so falling
 * back never loses context, only ever adds a conversation-history option the
 * model may or may not need.
 */
export function classifyQuery(message: string): QueryClassification {
  const mentionsHistory = HISTORY_MARKERS.test(message)
  const mentionsContract = CONTRACT_MARKERS.test(message)

  if (mentionsHistory && !mentionsContract) return 'history'
  if (mentionsContract && !mentionsHistory) return 'contract'
  return 'both'
}

const CONTRACT_SYSTEM_PROMPT = (contractText: string) => `You are a legal contract assistant. Answer questions ONLY from the contract text provided below.

RULES:
1. Every answer must include a citation in the format [Page X] where X is the page number from the document.
2. If the answer is not in the document, say: "I cannot find this in the document."
3. Do NOT use general legal knowledge. Do NOT answer from memory.
4. Do NOT give legal advice. If asked for advice, say: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer."

CONTRACT TEXT:
${contractText}`

const HISTORY_SYSTEM_PROMPT = `You are a legal contract assistant. Answer ONLY using the prior conversation shown below — you have not been given the contract text for this question, so do not guess at or reference document content.

RULES:
1. Base your answer strictly on what was said earlier in this conversation.
2. If the conversation does not contain the answer, say: "I cannot find this in our conversation."
3. End every answer with the tag [From conversation].
4. Do NOT give legal advice. If asked for advice, say: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer."`

const BOTH_SYSTEM_PROMPT = (contractText: string) => `You are a legal contract assistant. Answer using the contract text and the prior conversation below, whichever is relevant to the question.

RULES:
1. For any fact drawn from the contract, cite it in the format [Page X].
2. For any fact drawn from the prior conversation rather than the contract itself, tag it with [From conversation].
3. If the question can't be answered from either source, say: "I cannot find this in the document or our conversation."
4. Do NOT use general legal knowledge beyond what's in the contract or the conversation.
5. Do NOT give legal advice. If asked for advice, say: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer."

CONTRACT TEXT:
${contractText}`

function buildSystemPrompt(classification: QueryClassification, contractText: string): string {
  if (classification === 'history') return HISTORY_SYSTEM_PROMPT
  if (classification === 'contract') return CONTRACT_SYSTEM_PROMPT(contractText)
  return BOTH_SYSTEM_PROMPT(contractText)
}

function turnLimitFor(classification: QueryClassification): number {
  return classification === 'history' ? HISTORY_TURN_LIMIT : CONTRACT_TURN_LIMIT
}

/**
 * Assembles the full message array for a chat turn. `history` should be the
 * full set of prior messages available (already fetched from the DB, in
 * ascending order, and NOT including the new message being answered) — this
 * function applies the classification-appropriate turn window itself, so
 * callers don't need to pre-trim.
 */
export function buildChatMessages(
  classification: QueryClassification,
  contractText: string,
  history: ChatHistoryEntry[],
  newMessage: string
): ChatCompletionMessage[] {
  const turnLimit = turnLimitFor(classification)
  const trimmedHistory = history.slice(-turnLimit * 2)

  return [
    { role: 'system', content: buildSystemPrompt(classification, contractText) },
    ...trimmedHistory.map((entry) => ({ role: entry.role, content: entry.content }) as ChatCompletionMessage),
    { role: 'user', content: newMessage },
  ]
}

export async function callChat(messages: ChatCompletionMessage[]): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.4,
    max_tokens: 1000,
    messages,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty chat response.')
  }
  return content
}
