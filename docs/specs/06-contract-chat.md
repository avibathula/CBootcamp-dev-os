# Spec: Contract Chat (Q&A) with Conversation Memory

**Stories:** US-007, US-012 | **Priority:** P1 | **Depends on:** `04-results-page-pdf-viewer.md`

---

## 1. User Flow

```
/contracts/[id] → "Chat" tab
  → ChatInterface mounts → useChatSession(contractId) loads existing messages via SWR
User types a question → send
  → POST /api/chat { contract_id, message }
    → server CLASSIFIES the question (contract | history | both)
      → server RETRIEVES context per classification (§3.2)
        → server builds the classification-specific system prompt, calls GPT-4o
          → inserts user message, then assistant message tagged with its classification
          → returns { message, session_id, source_type }
  → ChatInterface appends both the user's message and the AI response to the view
  → The response shows a source badge ("Contract" / "Conversation" / "Contract + Conversation")
  → "[Page X]" citations are clickable → navigate the PDF viewer (spec 04) via the shared targetPage state
  → "[From conversation]" tags are shown inline, styled, not clickable (nothing to navigate to)
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

### `chat_messages.source_type`

`chat_messages` has a `source_type text` column (nullable, `CHECK IN ('contract', 'history', 'both')`). Set on assistant messages to the classification that produced them; always `NULL` on user messages. This is what lets the UI show a source badge on reload, not just for the message just sent — without persisting it, attribution would only be visible for the current session's freshly-sent messages, not the full stored history.

---

## 3. API: `POST /api/chat`

**File:** `app/api/chat/route.ts`
**Auth:** Required
**Rate limit:** 60 requests/user/hour (see `09-rate-limiting-and-error-handling.md`) — unchanged by the memory layer

**Request:**
```json
{ "contract_id": "uuid", "message": "What is the notice period for termination?" }
```

**Validation:**
- `message` non-empty, ≤ 4000 chars → 400 otherwise
- `contract_id` exists, `user_id` matches, `status === 'complete'` → 422 `{ "error": "Contract not found or not yet processed." }` otherwise

### 3.1 Classify

The very first thing the route does with a valid message — before any DB call — is classify it via `classifyQuery(message)` (§4). Classification is a pure function of the message text, computed once and reused for retrieval, the system prompt, the persisted `source_type`, and the API response.

### 3.2 Retrieve

| Classification | Contract text included? | History window |
|---|---|---|
| `contract` | Yes | last **10 turns** |
| `history` | **No** | last **20 turns** |
| `both` | Yes | last **10 turns** |

A "turn" is one user message + one assistant message (2 stored rows). `contract` and `both` share the same retrieval — they differ only in the system prompt's attribution instructions (§3.3). `history` deliberately gets a larger window and excludes the contract text entirely, since without contract text there's more context budget for conversation, and including contract text would invite the model to lean on it despite being asked a memory-only question.

**Processing order (critical):**
1. `SELECT contract_text, status FROM contracts WHERE id = ? AND user_id = ?`
2. Get-or-create `chat_session` (§2)
3. **Fetch history from `chat_messages` BEFORE inserting the new user message.** Query `ORDER BY created_at DESC LIMIT 40` (40 = the largest window any classification needs, `HISTORY_TURN_LIMIT * 2`), then reverse to ascending order. `buildChatMessages` (§4) trims this down further to the classification-appropriate window. Fetching before inserting guarantees the classifier and the model never see the current question as part of its own history, and that each message is written exactly once per turn.
4. `buildChatMessages(classification, contractText, history, message)` (§4)
5. Call GPT-4o (temp=0.4, max_tokens=1000); on timeout (> 20s) → 503 `{ "error": "Chat response timed out. Please try again." }` — no retry (unlike extraction, a conversational timeout is safe to surface directly and let the user re-send)
6. `INSERT INTO chat_messages (session_id, user_id, role, content) VALUES (?, ?, 'user', <message>)`
7. `INSERT INTO chat_messages (session_id, user_id, role, content, source_type) VALUES (?, ?, 'assistant', <response>, <classification>)`
8. Return `{ message: <response>, session_id, source_type: <classification> }`

### 3.3 Respond

Each classification gets its own system prompt (§4) with different rules:

- **`contract`** — answer only from the contract text; every fact cited `[Page X]`; refusal phrase is exactly `"I cannot find this in the document."` (unchanged from before the memory layer — this exact phrase is a regression-tested constraint, see §7)
- **`history`** — answer only from the conversation, no contract text available to lean on; every answer ends with the tag `[From conversation]`; refusal phrase is `"I cannot find this in our conversation."`
- **`both`** — answer from either source; each fact tagged `[Page X]` or `[From conversation]` depending on where it came from; refusal phrase is `"I cannot find this in the document or our conversation."`

All three retain: no legal advice (redirect to "consult a qualified lawyer"), no general legal knowledge beyond the given context.

**Response 200:**
```json
{
  "message": "Based on the document, the notice period is 30 days written notice to the other party [Page 7].",
  "session_id": "uuid",
  "source_type": "contract"
}
```

---

## 4. `lib/openai/chat.ts` — the memory layer

All classify/retrieve/respond logic lives here, not in a separate module — this is a small, cohesive extension of the existing chat prompt-building code, not a new subsystem.

```typescript
export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatCompletionMessage = { role: ChatRole; content: string }
export type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string }

export const CONTRACT_TURN_LIMIT = 10  // turns, i.e. 20 messages
export const HISTORY_TURN_LIMIT = 20   // turns, i.e. 40 messages

export function classifyQuery(message: string): QueryClassification

export function buildChatMessages(
  classification: QueryClassification,
  contractText: string,
  history: ChatHistoryEntry[],
  newMessage: string
): ChatCompletionMessage[]

export async function callChat(messages: ChatCompletionMessage[]): Promise<string>
```

`QueryClassification = 'contract' | 'history' | 'both'` is defined in `types/index.ts` since it's shared with the API contract and the DB row shape, not just this module.

### Classification (heuristic, no extra API call)

```typescript
const HISTORY_MARKERS = /\b(earlier|before|previously|you said|we discussed|what have i asked|what did i ask|our conversation|this conversation|you mentioned|so far)\b/i
const CONTRACT_MARKERS = /\b(clause|section|page|term|terms|party|parties|agreement|contract|payment|invoice|liability|indemnif|confidential|terminat|governing law|jurisdiction|notice period|effective date|dollar|amount|penalty|renewal|scope|deliverable)\b/i

function classifyQuery(message) {
  const mentionsHistory = HISTORY_MARKERS.test(message)
  const mentionsContract = CONTRACT_MARKERS.test(message)
  if (mentionsHistory && !mentionsContract) return 'history'
  if (mentionsContract && !mentionsHistory) return 'contract'
  return 'both' // ambiguous (matches both, or neither) — safe fallback since
                // 'both' retrieval is a strict superset of 'contract' retrieval
}
```

This must be able to return all three values, and explicitly falls back to `'both'` — never to a hardcoded default that silently drops context — whenever the message doesn't cleanly signal one category.

### `buildChatMessages` — turn windowing happens here, not in the route

`buildChatMessages` receives the *full* fetched history (up to 40 messages, per §3.2 step 3) and applies `history.slice(-turnLimit * 2)` itself based on the classification, where `turnLimit` is `HISTORY_TURN_LIMIT` for `'history'` and `CONTRACT_TURN_LIMIT` otherwise. Keeping the trim inside this function (rather than varying the DB query's `LIMIT`) means the windowing logic has one home and is unit-testable without a database.

`contractText` is passed through unconditionally by the caller; `buildChatMessages` itself decides whether to include it in the system prompt — for `'history'`, it's omitted entirely, not just left unused.

### Message array structure

```
[
  { role: 'system', content: <classification-specific prompt, with contract_text interpolated for contract/both> },
  ...trimmedHistory.map(h => ({ role: h.role, content: h.content })),  // 20 or 40 messages, ascending
  { role: 'user', content: newMessage },
]
```

### OpenAI call parameters

```typescript
{ model: 'gpt-4o', temperature: 0.4, max_tokens: 1000, messages }
```
(No `response_format` override — free text.) Unchanged by the memory layer.

---

## 5. Frontend

### 5.1 `hooks/useChatSession.ts`

Unchanged — still a plain `SELECT *` on `chat_messages` for the session, ordered ascending. The new `source_type` column comes along for free via `select('*')`.

### 5.2 `components/chat/ChatInterface.tsx`

```typescript
type ChatInterfaceProps = {
  contractId: string
  onCitationClick: (page: number) => void
}
```

Unchanged structurally — passes each message's `source_type` through to `AssistantMessage`.

### 5.3 `components/chat/UserMessage.tsx` / `AssistantMessage.tsx`

```typescript
type UserMessageProps = { content: string }
type AssistantMessageProps = {
  content: string
  sourceType: QueryClassification | null
  onCitationClick: (page: number) => void
}
```

- `AssistantMessage` parses `content` for both `\[Page (\d+)\]` and `\[From conversation\]` tags via regex:
  - `[Page X]` renders as a clickable inline button (`onClick={() => onCitationClick(pageNum)}`)
  - `[From conversation]` renders as styled (Violet 700, medium weight), non-clickable inline text — there's no page to navigate to
- `AssistantMessage` also renders a small `Badge` above the bubble showing the message's source: "Contract" (blue) for `contract`, "Conversation" (violet) for `history`, "Contract + Conversation" (grey) for `both`. This is the persistent, always-visible attribution — the inline tags are the per-fact attribution *within* the answer text.

### 5.4 Loading / error states

Unchanged: typing indicator between send and response; `503` timeout shows a client-only inline message, not persisted to `chat_messages`.

---

## 6. Design

- Chat panel: floating panel anchored bottom-right, `400px` wide, White background, `border-radius: 12px` (Modal radius), `2px solid` Grey 200 (flat depth — no shadow, per design.md)
- `UserMessage`: right-aligned bubble, Blue 500 background, White text, `border-radius: 12px 12px 4px 12px`, `padding: 8px 12px`, max-width `75%`
- `AssistantMessage`: left-aligned bubble, Grey 50 background, Grey 900 text, `border-radius: 12px 12px 12px 4px`, same padding/max-width
- Source badge: Semantic Status Badge pattern (`border-radius: 4px`, `padding: 2px 8px`, Paragraph Small Medium) — Blue for `contract`, Violet for `history`, Grey for `both`
- `[Page X]` citation: Blue 500 text, underlined, inline within the bubble, `100ms ease-out` color transition to Blue 700 on hover
- `[From conversation]` tag: Violet 700 text, medium weight, inline, not underlined (visually distinct from the clickable citation — no hover state, since there's nothing to click)
- Typing indicator: three `6px` dots in Grey 300, staggered opacity pulse animation
- `MessageInput`: fixed to the bottom of the panel, Grey 25 background, `1px solid` Grey 100 top border, textarea `border-radius: 6px`, send button Blue 500 circular icon button `32px`

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| User asks a question about contract content not in the document (classified `contract`) | Refusal is exactly `"I cannot find this in the document."` — **unchanged from the pre-memory-layer behavior**; this exact string is a regression-tested constraint (the hallucination guard must not weaken when the memory layer was added) |
| User asks a question about conversation content that was never discussed (classified `history`) | Refusal is exactly `"I cannot find this in our conversation."` |
| User asks for legal advice ("Should I sign this?") | Every system prompt redirects: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer." |
| A message matches both history and contract markers, or neither | Classified `'both'` — never silently dropped to a narrower category |
| Chat history exceeds the classification's turn window | Only the most recent N turns (10 or 20) are sent to the model, taken from the *end* of the conversation (fetched newest-first, then reversed) — not the oldest N. All messages remain stored and viewable in the UI regardless of what's in context |
| Response omits the expected attribution tag for its classification | Monitoring signal only (log a warning server-side), not a blocking retry — avoids doubling chat latency/cost for what should be a rare model slip. Not logged when the response is a valid refusal phrase, since refusals correctly have no tag |
| User sends two messages in rapid succession before the first resolves | `MessageInput` disables the send button while a request is in flight; queued sends are not supported in MVP |
| Contract chat requested for a contract still `status = 'processing'` or `'error'` | 422 "Contract not found or not yet processed." — chat is gated on `status = 'complete'`, regardless of classification |
| First message in a brand-new session, classified `history` | Retrieves an empty history window; the model is instructed to answer only from history, so it correctly has nothing to work with and should say "I cannot find this in our conversation." |

---

## 8. Acceptance Criteria

- [ ] A `contract`-classified question about content present in the document returns a response within 15s, grounded in the text, with a `[Page X]` citation
- [ ] A `contract`-classified question about content absent from the document returns exactly `"I cannot find this in the document."`
- [ ] A `history`-classified question (e.g. "what have I asked you so far") is answered from conversation history only, with no contract text in its context, and ends with `[From conversation]`
- [ ] A `both`-classified follow-up question that references a prior answer is answered correctly, attributing facts to `[Page X]` and/or `[From conversation]` as appropriate
- [ ] `classifyQuery` returns all three classifications given appropriate inputs, and falls back to `'both'` for ambiguous input
- [ ] `buildChatMessages` omits contract text entirely when classification is `'history'`, and includes it for `'contract'`/`'both'`
- [ ] `buildChatMessages` applies a 10-turn (20-message) window for `'contract'`/`'both'` and a 20-turn (40-message) window for `'history'`
- [ ] History is fetched from the DB before the new user message is inserted, and each message (user, assistant) is written exactly once per turn
- [ ] Clicking a `[Page X]` citation navigates the PDF/text viewer to that page; `[From conversation]` tags are visible but not clickable
- [ ] Each assistant message's source badge (Contract / Conversation / Contract + Conversation) is correct and persists across a reload
- [ ] Reloading the results page restores the full prior chat conversation in order, with attribution intact
- [ ] Chat requests against a non-`'complete'` contract are rejected with 422
- [ ] More than 60 chat requests per user in an hour return 429 (see spec 09)
