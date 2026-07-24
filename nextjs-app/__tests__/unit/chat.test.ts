import { buildChatMessages, classifyQuery, CONTRACT_TURN_LIMIT, HISTORY_TURN_LIMIT } from '@/lib/openai/chat'
import type { ChatHistoryEntry } from '@/lib/openai/chat'

describe('classifyQuery', () => {
  it('classifies a message with contract-specific nouns as contract', () => {
    expect(classifyQuery('What is the payment term for this agreement?')).toBe('contract')
    expect(classifyQuery('Is there a liability clause on page 3?')).toBe('contract')
  })

  it('classifies a message referencing prior conversation as history', () => {
    expect(classifyQuery('What did you say earlier?')).toBe('history')
    expect(classifyQuery('What have I asked you so far?')).toBe('history')
  })

  it('falls back to both when the message is ambiguous (matches neither marker set)', () => {
    expect(classifyQuery('Hello there')).toBe('both')
    expect(classifyQuery('Can you help me?')).toBe('both')
  })

  it('falls back to both when the message matches both marker sets', () => {
    expect(classifyQuery('Earlier you mentioned a payment clause — can you clarify?')).toBe('both')
  })

  it('can return all three classifications', () => {
    const results = new Set([
      classifyQuery('What is the termination clause?'),
      classifyQuery('What did you say before about that?'),
      classifyQuery('Hi'),
    ])
    expect(results).toEqual(new Set(['contract', 'history', 'both']))
  })
})

describe('buildChatMessages', () => {
  const contractText = '\n[PAGE 1]\nThis is the confidential contract text.'

  it('includes the contract text in the system prompt for "contract" classification', () => {
    const messages = buildChatMessages('contract', contractText, [], 'What is the term?')
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(contractText)
  })

  it('includes the contract text in the system prompt for "both" classification', () => {
    const messages = buildChatMessages('both', contractText, [], 'What is the term?')
    expect(messages[0].content).toContain(contractText)
  })

  it('omits the contract text entirely for "history" classification', () => {
    const messages = buildChatMessages('history', contractText, [], 'What have I asked so far?')
    expect(messages[0].content).not.toContain(contractText)
    expect(messages[0].content).not.toContain('This is the confidential contract text.')
  })

  it('uses the [Page X] citation rule for "contract" classification, not [From conversation]', () => {
    const { content } = buildChatMessages('contract', contractText, [], 'q')[0]
    expect(content).toContain('[Page X]')
    expect(content).toContain('I cannot find this in the document.')
    expect(content).not.toContain('[From conversation]')
  })

  it('uses the [From conversation] rule for "history" classification, not [Page X]', () => {
    const { content } = buildChatMessages('history', contractText, [], 'q')[0]
    expect(content).toContain('[From conversation]')
    expect(content).toContain('I cannot find this in our conversation.')
    expect(content).not.toContain('[Page X]')
  })

  it('instructs attribution to both sources for "both" classification', () => {
    const { content } = buildChatMessages('both', contractText, [], 'q')[0]
    expect(content).toContain('[Page X]')
    expect(content).toContain('[From conversation]')
    expect(content).toContain('I cannot find this in the document or our conversation.')
  })

  it('all classifications redirect legal-advice requests to a qualified lawyer', () => {
    for (const classification of ['contract', 'history', 'both'] as const) {
      const { content } = buildChatMessages(classification, contractText, [], 'q')[0]
      expect(content).toContain('consult a qualified lawyer')
    }
  })

  it('orders history ascending and appends the new user message last', () => {
    const history: ChatHistoryEntry[] = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second question' },
      { role: 'assistant', content: 'second answer' },
    ]
    const messages = buildChatMessages('contract', contractText, history, 'third question')

    expect(messages).toHaveLength(6) // system + 4 history + new message
    expect(messages[1]).toEqual({ role: 'user', content: 'first question' })
    expect(messages[2]).toEqual({ role: 'assistant', content: 'first answer' })
    expect(messages[3]).toEqual({ role: 'user', content: 'second question' })
    expect(messages[4]).toEqual({ role: 'assistant', content: 'second answer' })
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'third question' })
  })

  function buildHistory(messageCount: number): ChatHistoryEntry[] {
    return Array.from({ length: messageCount }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message ${i}`,
    }))
  }

  it(`applies a ${CONTRACT_TURN_LIMIT}-turn (${CONTRACT_TURN_LIMIT * 2}-message) window for "contract"`, () => {
    const history = buildHistory(100)
    const messages = buildChatMessages('contract', contractText, history, 'latest question')

    // system + (turnLimit * 2) history + new message
    expect(messages).toHaveLength(1 + CONTRACT_TURN_LIMIT * 2 + 1)
    // the oldest messages should have been dropped — first surviving one is
    // the (100 - 20)th = message 80
    expect(messages[1].content).toBe(`message ${100 - CONTRACT_TURN_LIMIT * 2}`)
  })

  it(`applies the same ${CONTRACT_TURN_LIMIT}-turn window for "both"`, () => {
    const history = buildHistory(100)
    const messages = buildChatMessages('both', contractText, history, 'latest question')
    expect(messages).toHaveLength(1 + CONTRACT_TURN_LIMIT * 2 + 1)
  })

  it(`applies a ${HISTORY_TURN_LIMIT}-turn (${HISTORY_TURN_LIMIT * 2}-message) window for "history"`, () => {
    const history = buildHistory(100)
    const messages = buildChatMessages('history', contractText, history, 'what have I asked so far?')

    expect(messages).toHaveLength(1 + HISTORY_TURN_LIMIT * 2 + 1)
    expect(messages[1].content).toBe(`message ${100 - HISTORY_TURN_LIMIT * 2}`)
  })

  it('does not trim history shorter than the turn window', () => {
    const history = buildHistory(4)
    const messages = buildChatMessages('contract', contractText, history, 'latest question')
    expect(messages).toHaveLength(1 + 4 + 1)
  })
})
