import { buildChatMessages } from '@/lib/openai/chat'

describe('buildChatMessages', () => {
  it('includes the contract text in the system prompt', () => {
    const messages = buildChatMessages('Sample contract text here.', [], 'What is the term?')
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('Sample contract text here.')
  })

  it('includes the grounding rules in the system prompt', () => {
    const messages = buildChatMessages('text', [], 'question')
    expect(messages[0].content).toContain('[Page X]')
    expect(messages[0].content).toContain('I cannot find this in the document.')
    expect(messages[0].content).toContain('Based on the document,')
    expect(messages[0].content).toContain('consult a qualified lawyer')
  })

  it('orders history ascending and appends the new user message last', () => {
    const history = [
      { role: 'user' as const, content: 'first question' },
      { role: 'assistant' as const, content: 'first answer' },
      { role: 'user' as const, content: 'second question' },
      { role: 'assistant' as const, content: 'second answer' },
    ]
    const messages = buildChatMessages('text', history, 'third question')

    expect(messages).toHaveLength(6) // system + 4 history + new message
    expect(messages[1]).toEqual({ role: 'user', content: 'first question' })
    expect(messages[2]).toEqual({ role: 'assistant', content: 'first answer' })
    expect(messages[3]).toEqual({ role: 'user', content: 'second question' })
    expect(messages[4]).toEqual({ role: 'assistant', content: 'second answer' })
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'third question' })
  })

  it('adds a history-classification hint when the message references earlier conversation', () => {
    const withHint = buildChatMessages('text', [], 'What did you say earlier about the term?')
    const withoutHint = buildChatMessages('text', [], 'What is the term?')

    expect(withHint[0].content).toContain('referring to earlier parts of this conversation')
    expect(withoutHint[0].content).not.toContain('referring to earlier parts of this conversation')
  })

  it('caps history at the most recent 200 messages', () => {
    const history = Array.from({ length: 250 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message ${i}`,
    }))
    const messages = buildChatMessages('text', history, 'latest question')

    // system + 200 history + new message
    expect(messages).toHaveLength(202)
    expect(messages[1].content).toBe('message 50') // first 50 dropped
  })
})
