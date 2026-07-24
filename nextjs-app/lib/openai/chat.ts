import OpenAI from 'openai'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatCompletionMessage = { role: ChatRole; content: string }

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

function classifyQuery(message: string): 'contract' | 'history' | 'both' {
  const historyMarkers = /\b(earlier|before|previous|you said)\b/i
  if (historyMarkers.test(message)) return 'history'
  return 'both'
}

export function buildChatMessages(
  contractText: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  newMessage: string
): ChatCompletionMessage[] {
  const classification = classifyQuery(newMessage)
  const classificationHint =
    classification === 'history' ? 'The user is referring to earlier parts of this conversation.\n\n' : ''

  const system = `${classificationHint}You are a legal contract assistant. Answer questions ONLY from the contract text provided below.

RULES:
1. Every answer must include a citation in the format [Page X] where X is the page number from the document.
2. If the answer is not in the document, say: "I cannot find this in the document."
3. Begin every answer with "Based on the document," to make the scope clear.
4. Do NOT use general legal knowledge. Do NOT answer from memory.
5. Do NOT give legal advice. If asked for advice, say: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer."

CONTRACT TEXT:
${contractText}`

  return [
    { role: 'system', content: system },
    ...history.slice(-200).map((entry) => ({ role: entry.role, content: entry.content })),
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
