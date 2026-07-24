# Spec: Key Terms Panel, Confidence Display & Inline Editing

**Stories:** US-003, US-004, US-009, FR-11 | **Priority:** P0/P1 | **Depends on:** `03-key-term-extraction.md`, `04-results-page-pdf-viewer.md`

---

## 1. User Flow

```
KeyTermsPanel mounts on /contracts/[id]
  → SWR (useContractData) fetches key_terms for contract_id
    → Renders one TermCard per row: name, value, page badge, confidence badge
      → Click page badge → parent's setTargetPage(page_number)
      → Click "Why?" → expands source_sentence
      → Click term value → inline edit mode
        → blur or Enter → PATCH /api/terms/[id]
          → optimistic UI update + "Edited" badge; SWR revalidates in background
```

---

## 2. Database

Reads/writes `key_terms` (see `supabase-schema.sql`). No new tables.

---

## 3. API: `PATCH /api/terms/[id]`

**File:** `app/api/terms/[id]/route.ts`
**Auth:** Required

**Request:**
```json
{ "value": "36 months from the Effective Date" }
```

**Processing:**
1. `SELECT user_id, value, original_value, is_edited FROM key_terms WHERE id = ?`
2. If `user_id !== authenticatedUser.id` → 403
3. If `is_edited === false`: set `original_value = <current value>` in the same update (preserves the AI's first output exactly once)
4. `UPDATE key_terms SET value = <new value>, is_edited = true, original_value = COALESCE(original_value, <value captured in step 3>) WHERE id = ?`
5. Return the updated row

**Response 200:**
```json
{ "id": "uuid", "value": "36 months from the Effective Date", "is_edited": true, "original_value": "3 years" }
```

**Validation:** `value` must be a non-empty string ≤ 2000 chars → 400 otherwise.

**SLA:** Write completes within 2 seconds (Supabase direct write latency; no AI call in this path).

---

## 4. `hooks/useContractData.ts`

```typescript
export function useContractData(contractId: string) {
  const { data, error, mutate } = useSWR<KeyTerm[]>(
    `/api/contracts/${contractId}/key-terms`,
    fetcher
  )
  return { terms: data, isLoading: !data && !error, error, mutate }
}
```

Note: this requires a read endpoint `GET /api/contracts/[id]/key-terms` (thin wrapper: `SELECT * FROM key_terms WHERE contract_id = ? AND user_id = ? ORDER BY is_custom ASC, created_at ASC` — RLS also enforces the `user_id` scope as defense in depth). Alternatively, since `key_terms` has RLS enabled and the anon key is safe client-side, `useContractData` may call `supabase.from('key_terms').select('*').eq('contract_id', contractId)` directly from the client instead of a custom route — **use the direct Supabase client read**, matching the engineering doc's stated pattern ("user-scoped reads go through the user's JWT", §6). No custom `GET` route is needed for this read.

---

## 5. Frontend Components

### 5.1 `components/contract/KeyTermsPanel.tsx`

```typescript
type KeyTermsPanelProps = {
  contractId: string
  targetPage: number
  setTargetPage: (page: number) => void
}
```

- Uses `useContractData(contractId)`
- Renders standard terms first (in `STANDARD_TERMS` order, matched by `term_name`), then custom terms (`is_custom = true`), each as a `TermCard`
- Loading state: 6 skeleton `TermCard` placeholders
- Empty state: not expected in practice (a `'complete'` contract always has ≥ 1 term), but if `terms.length === 0`, show "No key terms were extracted for this contract."

### 5.2 `components/contract/TermCard.tsx`

```typescript
type TermCardProps = {
  term: KeyTerm
  onPageClick: (page: number) => void
  onSave: (id: string, value: string) => Promise<void>
}
```

- Header row: `term_name` (Paragraph Large Medium, Grey 900) + `is_custom && <CustomBadge />`
- Value row: click-to-edit (see §5.4) + page badge (click → `onPageClick(term.page_number)`, disabled/hidden if `page_number === null`)
- `ConfidenceIndicator` (§5.3)
- "Why?" accordion toggle → expands to show `source_sentence` verbatim in a quoted block; hidden entirely if `source_sentence === null`
- `is_edited && <EditedBadge originalValue={term.original_value} />` — badge shows "Edited"; hovering/focusing reveals a tooltip "Original: {original_value}"

### 5.3 `components/contract/ConfidenceIndicator.tsx`

```typescript
type ConfidenceIndicatorProps = {
  score: number  // 0–100
}
```

Logic:
```typescript
const tier = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
```

| Tier | Badge color | Extra UI |
|---|---|---|
| `high` (≥ 80) | Green 50 bg / Green 500 border / Green 700 text | — |
| `medium` (50–79) | Yellow 50 bg / Yellow 500 border / Yellow 800 text | — |
| `low` (< 50) | Red 50 bg / Red 500 border / Red 700 text | ⚠️ icon + non-dismissible tooltip: "Low confidence — verify this in the document directly" |

`aria-label` on the badge: `` `Confidence: ${score}%${tier === 'low' ? ' — Low confidence: verify manually' : ''}` ``. Terms are **never hidden** regardless of tier.

### 5.4 Inline edit interaction (within `TermCard`)

- Default: value rendered as plain text with a subtle edit-pencil icon on hover
- Click (or Enter when focused) → swaps to `<input value={draft} onChange={...} autoFocus>`
- `Escape` → reverts `draft` to the last saved value, exits edit mode without saving
- `Enter` or `onBlur` → if `draft !== term.value` and `draft.trim() !== ''`, call `onSave(term.id, draft.trim())`; optimistically update local state immediately, call `PATCH /api/terms/[id]`, then `mutate()` the SWR cache
- On save failure (network error, 403): revert to the previous value, show a small inline error "Couldn't save — try again" for 3s
- Empty `draft` on blur → revert without saving (empty values are not valid edits)

---

## 6. Design

- `TermCard`: White background, `1px solid` Grey 100 border, `border-radius: 8px`, `padding: 16px`, `12px` gap between internal rows, `12px` gap between stacked cards
- `CustomBadge`: reuses the same Violet 50/500/700 style defined in spec 02 for consistency between the pre-processing preview and results view
- `ConfidenceIndicator`: Semantic Status Badge pattern from design.md — `border-radius: 4px`, `padding: 2px 8px`, Paragraph Small Medium text
- Page badge: Blue 50 background, Blue 500 text, Paragraph Small Regular, `border-radius: 4px`, `padding: 2px 8px`, pointer cursor, `100ms ease-out` background transition to Blue 100 on hover
- "Why?" accordion: chevron icon rotates 180° over `150ms ease-out`; expanded content in Paragraph Small Regular Grey 500, italicized, `padding: 8px 12px`, Grey 25 background, `border-radius: 6px`
- `EditedBadge`: Grey 100 background, Grey 700 text, Paragraph Small Regular, `border-radius: 4px`
- Inline edit input: `border: 1px solid` Blue 500 (2px, focus state), `border-radius: 6px`, `padding: 8px`, matches the value text's font size to avoid layout shift

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| `page_number` is `null` (term not found in document) | Page badge is not rendered; `ConfidenceIndicator` will already show `low` tier since `confidence_score = 0` for not-found terms |
| User edits a term, then immediately edits it again before the first PATCH resolves | Debounce is not needed since save only fires on blur/Enter (not keystroke); if a second save fires while the first is in flight, the second request's response is authoritative — rely on the PATCH being idempotent per-value, no special sequencing needed given the UI blocks re-entering edit mode until the current save settles |
| Term value contains the literal string used for the term name (e.g. AI returns a full sentence for a "Parties" field) | No special handling — displayed as-is; content quality is an AI-eval concern (engineering doc §13), not a UI concern |
| User clicks "Why?" on a term with `source_sentence = null` | The accordion toggle itself is not rendered for that card (see §5.2) |
| Very long `value` (near the extraction's implicit length) wraps within the card | `TermCard` value container uses `white-space: pre-wrap; word-break: break-word` — no truncation, since accuracy matters more than density here |

---

## 8. Acceptance Criteria

- [ ] Every term is rendered as a `TermCard`, including terms with `value = null`
- [ ] Confidence ≥ 80 shows green, 50–79 shows amber, < 50 shows red + ⚠️ + tooltip
- [ ] Clicking a page badge calls `setTargetPage` with the correct page number and the PDF/text viewer scrolls accordingly
- [ ] "Why?" expander reveals the exact `source_sentence` text
- [ ] Editing a value and blurring saves within 2 seconds and shows an "Edited" badge
- [ ] The original AI-extracted value is preserved and shown in the "Edited" badge's tooltip after an edit
- [ ] A second edit to an already-edited term does not overwrite `original_value`
