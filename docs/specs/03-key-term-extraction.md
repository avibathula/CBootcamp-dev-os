# Spec: AI Key Term Extraction

**Stories:** US-002 (processing), US-004, US-005 | **Priority:** P0 | **Depends on:** `02-pdf-upload-and-extraction.md`

---

## 1. User Flow

```
PreProcessingPreview → "Process Contract" click
  → POST /api/process-contract { contract_id, custom_terms }
    → server builds extraction prompt, calls GPT-4o, parses + persists terms
      → 200 { contract_id, terms_count }
        → ExtractionProgressBar completes Step 3
          → redirect to /contracts/[id]
```

`ExtractionProgressBar` (client-side, cosmetic only — the API call is a single request/response, not a streamed multi-step process):
- Step 1 "Extracting text" — shown immediately (already done during upload, but displayed here for narrative continuity) and marked complete instantly
- Step 2 "Analysing with AI" — shown while the `/api/process-contract` request is in flight
- Step 3 "Compiling results" — shown for ~500ms after the response resolves, then redirect

---

## 2. Database

Writes to `key_terms` and `custom_key_terms` (see `supabase-schema.sql`). Reads `contracts.contract_text`.

### Write sequence

1. `SELECT contract_text, status FROM contracts WHERE id = ? AND user_id = ?`
2. If no row → 403 `{ "error": "Contract not found or access denied." }`
3. If `status !== 'ready'` → 422 `{ "error": "Contract is already processed." }`
4. If `custom_terms.length > 5` → 422 `{ "error": "Too many custom terms. Maximum 5 allowed." }`
5. `UPDATE contracts SET status = 'processing'`
6. Call GPT-4o (§4)
7. On success: bulk `INSERT INTO key_terms (...)` for every returned term (standard + custom, `is_custom` set accordingly), `INSERT INTO custom_key_terms (...)` for each custom term name, `UPDATE contracts SET status = 'complete'`
8. On failure after retry: `UPDATE contracts SET status = 'error'`; return 503

All writes in step 7 happen via the service-role client, wrapped in a single logical unit — if the bulk `key_terms` insert fails partway, `status` must **not** be set to `'complete'`; catch and fall through to the failure branch (step 8) so the contract shows `status='error'` rather than a silently incomplete term set.

---

## 3. API: `POST /api/process-contract`

**File:** `app/api/process-contract/route.ts`
**Auth:** Required

**Request:**
```json
{ "contract_id": "uuid", "custom_terms": ["Non-compete radius", "Auto-renewal clause"] }
```

**Response 200:**
```json
{ "contract_id": "uuid", "terms_count": 14 }
```

**Errors:** `403` (not found/not owned), `422` (already processed, too many custom terms), `503` (AI failure)

---

## 4. `lib/openai/extract.ts`

```typescript
export type ExtractionTerm = {
  term_name: string
  value: string | null
  page_number: number | null
  confidence_score: number   // 0–100
  source_sentence: string | null
}
export type ExtractionOutput = { terms: ExtractionTerm[] }

export function buildExtractionPrompt(
  contractType: 'nda' | 'msa',
  contractText: string,
  customTerms: string[]
): { system: string; user: string }

export async function callExtraction(
  system: string,
  user: string
): Promise<string>  // raw JSON string from OpenAI

export function parseExtractionResponse(raw: string): ExtractionOutput
// Throws on invalid JSON or a shape that doesn't match ExtractionOutput
// (missing `terms` array, non-array terms, term missing `term_name` or `confidence_score`)
```

### Prompt construction

`buildExtractionPrompt` assembles the system prompt exactly as defined in the engineering doc §8 (Feature A), interpolating:
- `{contract_type}` → `'nda'` or `'msa'`
- `{standard_terms_list}` → `STANDARD_TERMS[contractType]` from `02-pdf-upload-and-extraction.md`
- `{custom_terms_list}` → the user-supplied `custom_terms` array, or "None" if empty
- Few-shot examples: 3 hardcoded NDA or MSA examples (excerpt → expected JSON), stored as constants in `lib/openai/fewShotExamples.ts`

`user` message content is `contractText` (already includes `[PAGE N]` markers, which the model uses to populate `page_number`).

### OpenAI call parameters

```typescript
{
  model: 'gpt-4o',
  temperature: 0.1,
  max_tokens: 2000,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
}
```

### Error recovery (exact sequence)

1. Call OpenAI. If the HTTP call itself times out (> 20s) or errors, retry with exponential backoff: wait 1s, retry; on second failure wait 2s, retry; on third failure wait 4s, retry; if still failing → go to step 4 (treat as failure).
2. On a successful HTTP response, attempt `JSON.parse(response)`. If parsing fails, or `parseExtractionResponse` throws on shape validation, send **one** retry call with an appended correction message: `{ role: 'user', content: 'Your previous response was not valid JSON. Return only the JSON object, no explanation.' }` alongside the original messages.
3. If the retry also fails to parse → go to step 4.
4. Failure: `UPDATE contracts SET status = 'error'`; return `503 { "error": "AI analysis failed. Please try again." }`. Do not insert partial `key_terms`.

### Post-processing before insert

- For each `terms[i]`, if `value === null`, still insert the row (`confidence_score` will be `0` per the prompt's "not found" instruction) — terms are never dropped, only flagged low-confidence
- `is_custom = true` for any `term_name` that case-insensitively matches an entry in the request's `custom_terms`; `false` otherwise
- `original_value = value` on insert (both start identical; `original_value` only diverges after a user edit — see spec 05)

---

## 5. Frontend

`ExtractionProgressBar` (`components/layout/ExtractionProgressBar.tsx`):

```typescript
type ExtractionProgressBarProps = {
  currentStep: 1 | 2 | 3
}
```

- Three horizontally laid-out steps with a connecting line; completed steps show a checkmark, the active step shows a spinner, future steps are greyed
- Subtext under the bar: "Usually under 30 seconds"
- On `503`, replace the bar with an error state: "Analysis timed out. Try again." + a "Retry" button that re-calls `/api/process-contract` with the same `contract_id` and `custom_terms` (the contract's `status` was reset to `'error'`, but the route only requires `status === 'ready'`; add `'error'` as a retry-eligible status — see §6 edge case)

---

## 6. Design

- Progress bar steps: circles `24px` diameter, Grey 200 border default, Blue 500 filled + White checkmark when complete, Blue 500 border + spinning ring when active — animation duration 150ms ease-out per design.md micro-interaction guidance
- Step labels: Paragraph Small Regular, Grey 500 (Grey 900 when active/complete)
- Error state banner: Red 50 background, Red 500 border, Red 700 text, `border-radius: 6px`, `padding: 16px`, Retry button styled as secondary (White bg, Grey 200 border) per Default/Hover state table

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Retry after a `'error'` status | The `/api/process-contract` validation in step 4 of §2 must accept both `'ready'` **and** `'error'` as valid starting states (an `'error'` contract has already consumed its upload but never completed processing) |
| GPT-4o returns a term not on the standard or custom list | Inserted as-is (defense against prompt drift); `is_custom = false` since it doesn't match a requested custom term — acceptable, will simply appear as an extra `TermCard` |
| GPT-4o omits a requested standard term entirely | Not backfilled — the UI will simply show fewer `TermCard`s than `standard_terms.length`; this is a data-quality issue tracked by the AI Evaluation Suite (engineering doc §13), not something the API layer compensates for |
| `custom_terms` contains an empty string or only whitespace | Filtered out server-side before prompt construction; does not count toward the 5-term cap error |
| Two concurrent `/api/process-contract` calls for the same `contract_id` (double-click) | Second call's `status` check reads `'processing'` (set synchronously in step 5 before the OpenAI call) → returns 422 "Contract is already processed." Client also disables the "Process Contract" button on first click to prevent this in practice. |
| `confidence_score` returned as a string like `"85"` instead of a number | `parseExtractionResponse` coerces numeric strings via `Number()`; if the result is `NaN`, treat as a parse failure and trigger the retry path |

---

## 8. Acceptance Criteria

- [ ] Clicking "Process Contract" with 0–5 custom terms returns `terms_count` matching the number of standard + custom terms extracted, within 30s P95
- [ ] Every returned term has a `confidence_score` between 0 and 100 inclusive
- [ ] A term absent from the document is inserted with `value = null`, `confidence_score = 0`
- [ ] A malformed first OpenAI response triggers exactly one retry before either succeeding or failing
- [ ] A contract with `status = 'error'` can be retried via the same endpoint without re-uploading
- [ ] `custom_key_terms` contains exactly one row per non-empty custom term submitted
- [ ] After successful processing, `contracts.status = 'complete'` and the user is redirected to `/contracts/[id]`
