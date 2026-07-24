# Spec: Contract Chat (Q&A)

**Stories:** US-007, US-012 | **Priority:** P1 | **Depends on:** `04-results-page-pdf-viewer.md`

---

## 1. User Flow

```
/contracts/[id] → "Chat" tab
  → ChatInterface mounts → useChatSession(contractId) loads existing messages via SWR
User types a question → send
  → POST /api/chat { contract_id, message }
    → server fetches contract_text + chat history, builds messages array, calls GPT-4o
      → inserts user + assistant messages
      → returns { message, session_id }
  → ChatInterface appends both the user's message and the AI response to the view
  → "[Page X]" citation in the response is clickable → navigates the PDF viewer (spec 04) via the shared targetPage state
```

---

## 2. Database

Writes/reads `chat_sessions` and `chat_messages` (see `supabase-schema.sql`).

### Session lookup/creation

```sql
-- On first message for a contract:
SELECT id FROM chat_sessions WHERE contract_id = ?;
-- If none:
INSERT INTO chat_sessions (contract_id, user_id) VALUES (?, ?) RETURNING id;
```

`chat_sessions.contract_id` is `UNIQUE`, so this is a get-or-create pattern, not a per-conversation session — one session per contract for the lifetime of the MVP.

---

## 3. API: `POST /api/chat`

**File:** `app/api/chat/route.ts`
**Auth:** Required
**Rate limit:** 60 requests/user/hour (see `09-rate-limiting-and-error-handling.md`)

**Request:**
```json
{ "contract_id": "uuid", "message": "What is the notice period for termination?" }
```

**Validation:**
- `message` non-empty, ≤ 4000 chars → 400 otherwise
- `contract_id` exists, `user_id` matches, `status === 'complete'` → 422 `{ "error": "Contract not found or not yet processed." }` otherwise

**Processing:**
1. `SELECT contract_text FROM contracts WHERE id = ? AND user_id = ?`
2. Get-or-create `chat_session` (§2)
3. `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 200`
4. `buildChatMessages(contractText, history, message)` (§4)
5. Call GPT-4o (temp=0.4, max_tokens=1000); on timeout (> 20s) → 503 `{ "error": "Chat response timed out. Please try again." }` — no retry (unlike extraction, a conversational timeout is safe to surface directly and let the user re-send)
6. `INSERT INTO chat_messages (session_id, user_id, role, content) VALUES (?, ?, 'user', <message>)`
7. `INSERT INTO chat_messages (session_id, user_id, role, content) VALUES (?, ?, 'assistant', <response>)`
8. Return `{ message: <response>, session_id }`

**Response 200:**
```json
{ "message": "Based on the document, the notice period is 30 days written notice to the other party [Page 7].", "session_id": "uuid" }
```

---

## 4. `lib/openai/chat.ts`

```typescript
export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatCompletionMessage = { role: ChatRole; content: string }

export function buildChatMessages(
  contractText: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  newMessage: string
): ChatCompletionMessage[]

export async function callChat(messages: ChatCompletionMessage[]): Promise<string>
```

### System prompt

Exactly as defined in the engineering doc §8 (Feature B), with `{contract_text}` interpolated. Key rules embedded in the prompt: mandatory `[Page X]` citation, "I cannot find this in the document." for out-of-scope questions, "Based on the document," opening, no general legal knowledge, no legal advice (redirect to "consult a qualified lawyer").

### Query classification

Inline string-matching in `buildChatMessages` (or a small helper called before it), no extra API call:
```typescript
function classifyQuery(message: string): 'contract' | 'history' | 'both' {
  const historyMarkers = /\b(earlier|before|previous|you said)\b/i
  if (historyMarkers.test(message)) return 'history'
  return 'both' // default; see engineering doc §4 Flow 4 — classification only adjusts prompt preamble, not structure
}
```
The classification result prefixes the system prompt with a one-line hint (e.g. for `'history'`: "The user is referring to earlier parts of this conversation.") — it does not change which context is included; the full contract text and history are always sent regardless of classification.

### Message array structure

```
[
  { role: 'system', content: <system prompt + contract_text + classification hint> },
  ...history.map(h => ({ role: h.role, content: h.content })),  // up to 200, ascending
  { role: 'user', content: newMessage },
]
```

### OpenAI call parameters

```typescript
{ model: 'gpt-4o', temperature: 0.4, max_tokens: 1000, messages }
```
(No `response_format` override — free text.)

---

## 5. Frontend

### 5.1 `hooks/useChatSession.ts`

```typescript
export function useChatSession(contractId: string) {
  const { data, mutate } = useSWR<ChatMessage[]>(
    ['chat-messages', contractId],
    () => supabase.from('chat_messages')
      .select('*, chat_sessions!inner(contract_id)')
      .eq('chat_sessions.contract_id', contractId)
      .order('created_at', { ascending: true })
  )
  return { messages: data ?? [], mutate }
}
```

### 5.2 `components/chat/ChatInterface.tsx`

```typescript
type ChatInterfaceProps = {
  contractId: string
  onCitationClick: (page: number) => void
}
```

- Renders `MessageList` + `MessageInput`
- On send: optimistically append the user's message to local state, show a typing indicator, `POST /api/chat`, then replace the typing indicator with the assistant's message and `mutate()` the SWR cache
- Textarea supports `Shift+Enter` for newline, `Enter` to send

### 5.3 `components/chat/UserMessage.tsx` / `AssistantMessage.tsx`

```typescript
type MessageProps = { content: string; createdAt: string }
type AssistantMessageProps = MessageProps & { onCitationClick: (page: number) => void }
```

- `AssistantMessage` parses `content` for `\[Page (\d+)\]` patterns via regex and renders each match as a clickable inline link (`<button className="citation-link" onClick={() => onCitationClick(pageNum)}>[Page {pageNum}]</button>`) instead of plain text
- If no `[Page X]` pattern is found (e.g. the "I cannot find this" response), render the content as plain text with no special treatment

### 5.4 Loading / error states

- Typing indicator: three animated dots, shown between send and response arrival
- `503` timeout: append a system-style inline message "Chat response timed out. Please try again." (not persisted to `chat_messages` — it's a client-only UI notice) and re-enable the input

---

## 6. Design

- Chat panel: tab or floating panel per engineering doc §5; floating variant is a `400px`-wide panel anchored bottom-right, White background, `border-radius: 12px` (Modal radius), `1px solid` Grey 100
- `UserMessage`: right-aligned bubble, Blue 500 background, White text, `border-radius: 12px 12px 4px 12px`, `padding: 8px 12px`, max-width `75%`
- `AssistantMessage`: left-aligned bubble, Grey 50 background, Grey 900 text, `border-radius: 12px 12px 12px 4px`, same padding/max-width
- Citation link: Blue 500 text, underlined, inline within the bubble, `100ms ease-out` color transition to Blue 700 on hover
- Typing indicator: three `6px` dots in Grey 300, staggered opacity pulse animation
- `MessageInput`: fixed to the bottom of the panel, Grey 25 background, `1px solid` Grey 100 top border, textarea `border-radius: 6px`, send button Blue 500 circular icon button `32px`

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| User asks a question about a topic not in the document | Response begins "Based on the document," and contains "I cannot find this in the document." per the system prompt's explicit instruction — this is the basis for the hallucination regression test in the engineering doc's testing strategy |
| User asks for legal advice ("Should I sign this?") | System prompt redirects: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer." |
| Chat history exceeds 200 messages | Only the most recent 200 (ascending order, so the oldest 200-and-beyond are excluded) are sent to the model; all messages remain stored and viewable in `MessageList`, just not all included in context — acceptable per engineering doc cost controls |
| Response omits the mandatory `[Page X]` citation | Per engineering doc §8 guardrails, a response without a citation is "treated as incomplete" — for MVP this is a monitoring signal only (log a warning server-side when the response contains no `\[Page \d+\]` match and is not the "cannot find" fallback), not a blocking retry, to avoid doubling chat latency/cost |
| User sends two messages in rapid succession before the first resolves | `MessageInput` disables the send button while a request is in flight; queued sends are not supported in MVP |
| Contract chat requested for a contract still `status = 'processing'` or `'error'` | 422 "Contract not found or not yet processed." — chat is gated on `status = 'complete'` |

---

## 8. Acceptance Criteria

- [ ] A question about content present in the document returns a response within 15s, grounded in the text, with a `[Page X]` citation
- [ ] A question about content absent from the document returns "I cannot find this in the document."
- [ ] Clicking a `[Page X]` citation navigates the PDF/text viewer to that page
- [ ] Reloading the results page restores the full prior chat conversation in order
- [ ] Chat requests against a non-`'complete'` contract are rejected with 422
- [ ] More than 60 chat requests per user in an hour return 429 (see spec 09)
