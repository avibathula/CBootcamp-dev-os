# Spec: PDF Upload, Text Extraction & Pre-Processing Preview

**Stories:** US-002, US-005, FR-03 | **Priority:** P0 | **Depends on:** `01-authentication.md`, `supabase-schema.sql`

---

## 1. User Flow

```
/dashboard → "Review a Contract" → /upload
  Step 1: ContractTypeSelector (NDA | MSA) + PdfDropzone
    → client validates file type + size
      → POST /api/upload-contract (multipart)
        → server extracts text, validates, persists, uploads to Storage
          → returns { contract_id, standard_terms, page_count }
  Step 2: PreProcessingPreview renders standard_terms + CustomTermInput (max 5)
  Step 3: "Process Contract" → hands off to 03-key-term-extraction.md
```

---

## 2. Database

Uses `contracts` and `custom_key_terms` tables from `supabase-schema.sql`. No new tables.

### DB write sequence for `/api/upload-contract`

1. `INSERT INTO contracts (user_id, file_name, contract_type, contract_text, status, page_count, token_count) VALUES (..., 'uploading', ...)` → capture `id`
2. Fire-and-forget: upload PDF buffer to Storage at `contracts/{user_id}/{contract_id}/{file_name}`
3. `UPDATE contracts SET status = 'ready', file_path = <path or null> WHERE id = <contract_id>`

Custom terms (added in Step 2 of the flow, before processing) are written by `/api/process-contract` in spec 03, not here — this route only returns the standard term list for the selected `contract_type`.

---

## 3. Standard Term Lists (constants)

`lib/constants/standardTerms.ts`:

```typescript
export const STANDARD_TERMS: Record<'nda' | 'msa', string[]> = {
  nda: [
    'Parties', 'Effective Date', 'Confidentiality Obligations',
    'Permitted Disclosures', 'Term & Duration', 'Governing Law',
    'Jurisdiction', 'IP Ownership', 'Non-Solicitation', 'Breach & Remedy',
  ],
  msa: [
    'Parties', 'Service Scope', 'Payment Terms', 'Invoice Schedule',
    'Late Payment Penalty', 'Liability Cap', 'Indemnification',
    'IP Ownership', 'Termination Clause', 'Governing Law',
    'Dispute Resolution', 'Notice Period',
  ],
}
```

---

## 4. API: `POST /api/upload-contract`

**File:** `app/api/upload-contract/route.ts`
**Auth:** Required (Bearer JWT validated via `supabase.auth.getUser(token)`)
**Request:** `multipart/form-data` — `file: File`, `contract_type: 'nda' | 'msa'`

### Processing steps

1. Validate `Authorization` header → 401 if missing/invalid
2. Validate `contract_type` is exactly `'nda'` or `'msa'` → 400 otherwise
3. Validate `file.type === 'application/pdf'` → 400 `{ "error": "Only PDF files are accepted." }`
4. Validate `file.size <= 10_485_760` (10 MB) → 422 `{ "error": "File exceeds the 10 MB limit." }`
5. Run `parsePdf(buffer)` (see §5) → `{ text, pageCount, tokenCount, wordCount }`
6. Validate `pageCount <= 20` → 422 `{ "error": "Contract exceeds the 20-page limit." }`
7. Validate `wordCount >= 100` → 422 `{ "error": "Scanned PDFs are not supported yet." }`
8. Validate `tokenCount <= 15000` → 422 `{ "error": "This contract is too long for analysis (over 15,000 tokens)." }`
9. `INSERT` into `contracts` with `status='uploading'` using the service-role client (RLS would otherwise require the row to already satisfy `auth.uid() = user_id`, which is fine since `user_id` is set from the validated JWT — either the user's own client or the service-role client works; use service-role for consistency with the non-blocking Storage step that follows)
10. Kick off Storage upload **without awaiting** completion before responding:
    - Path: `contracts/{user_id}/{contract_id}/{file_name}`
    - On success: `UPDATE contracts SET status='ready', file_path=<path>`
    - On failure: log the error server-side; `UPDATE contracts SET status='ready', file_path=NULL`
    - Either branch must complete before the client's next request (`/api/process-contract`) reads `status`; use `await` internally within the route handler (serverless functions do not continue executing after the response is sent) — i.e. this step is awaited by the server, just structured so a slow/failed Storage upload never blocks or fails the user-facing response's *content*, only its timing. Concretely: `await` the Storage upload and status update before returning, but never surface a Storage failure as a request failure.
11. Return 200 with `{ contract_id, standard_terms: STANDARD_TERMS[contract_type], page_count }`

### Response contracts

```json
// 200
{ "contract_id": "uuid", "standard_terms": ["Parties", "..."], "page_count": 12 }
```
```json
// 400 | 422 (see step-by-step errors above)
{ "error": "..." }
```

---

## 5. `lib/pdf/parse.ts`

```typescript
export type ParsedPdf = {
  text: string        // full text with [PAGE N] markers inserted between pages
  pageCount: number
  wordCount: number
  tokenCount: number   // estimated via chars/4 heuristic
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf>
```

- Uses `pdf-parse` with a custom `pagerender` callback to insert a `\n[PAGE N]\n` marker before each page's extracted text, where `N` is 1-indexed
- `wordCount`: `text.trim().split(/\s+/).filter(Boolean).length`
- `tokenCount`: `Math.ceil(text.length / 4)` (conservative approximation; no tokenizer dependency needed since the 15,000-token ceiling has generous headroom below GPT-4o's 128k context)
- Text is stored once in `contracts.contract_text` and never re-parsed — every downstream AI call (extraction, chat) reads this column

---

## 6. Frontend

### 6.1 `app/upload/page.tsx` (Client Component)

State machine: `'selecting-type' | 'uploading' | 'preview' | 'processing' | 'error'`

### 6.2 `components/contract/PdfDropzone.tsx`

- Drag-and-drop area + `<input type="file" accept="application/pdf">` fallback
- Client-side pre-checks before the network call: `file.type === 'application/pdf'`, `file.size <= 10_485_760`
- Invalid file → inline error banner, does not call the API
- Valid file → `POST /api/upload-contract` via `fetch` with `FormData`; show an indeterminate progress spinner ("Extracting text...")

### 6.3 `components/contract/PreProcessingPreview.tsx`

```typescript
type PreProcessingPreviewProps = {
  contractId: string
  standardTerms: string[]
  onProcess: (customTerms: string[]) => void
}
```

- Renders `standardTerms` as a static, read-only list ("Key terms ContractIQ will extract:")
- Hosts `CustomTermInput`
- "Process Contract" button calls `onProcess(customTerms)`, which triggers spec 03's `/api/process-contract` call

### 6.4 `components/contract/CustomTermInput.tsx`

```typescript
type CustomTermInputProps = {
  terms: string[]
  onChange: (terms: string[]) => void
  max: 5
}
```

- Text input + "+ Add" button; Enter key also adds
- Each added term renders as a chip with a "Custom" badge and a remove (×) control
- Counter: "N / 5 added"; input and add button `disabled` when `terms.length === 5`
- Client-side dedupe: case-insensitive comparison against both `standardTerms` and existing custom terms; duplicate attempt shows inline message "This term is already in the list" and does not add it

---

## 7. Design

- `PdfDropzone`: dashed `2px` Grey 200 border, `border-radius: 8px`, `padding: 48px`, centered icon + "Drag and drop your PDF here, or click to browse" in Paragraph Large Medium Grey 900; on drag-over, border becomes Blue 500 and background Blue 50
- Contract type selector: two selectable cards (NDA / MSA) side by side, `gap: 16px`; selected state has `2px solid` Blue 500 border and Blue 50 background, per the design system's Focus state color mapping
- `PreProcessingPreview` card: White background, `border-radius: 8px`, `padding: 24px`, `border: 1px solid` Grey 100
- Standard term list items: Paragraph Large Medium (16/24) Grey 900, `8px` item gap
- Custom term chips: Violet 50 background, Violet 500 border (1px), `border-radius: 4px`, `padding: 2px 8px`, "Custom" label in Violet 700 Paragraph Small
- Error banner (validation failures): Red 50 bg, Red 500 border, Red 700 text, per the Semantic Status Badge / Error state pattern in design.md

---

## 8. Edge Cases

| Case | Behavior |
|---|---|
| User uploads a password-protected PDF | `pdf-parse` throws → catch and return 422 `{ "error": "This PDF could not be read. It may be password-protected or corrupted." }` |
| User uploads a 0-byte or non-PDF file renamed to `.pdf` | `file.type` check catches MIME-spoofed files with a genuine PDF extension only if the browser reports the wrong MIME type; server also validates the file's magic bytes (`%PDF-`) as a second check before running `pdf-parse` |
| Contract text extracts exactly 100 words | Passes (`>= 100` is inclusive) |
| Contract is exactly 20 pages | Passes (`<= 20` is inclusive) |
| Storage upload fails (bucket misconfigured, network blip) | `file_path` stays `null`; upload response is still 200; results page falls back to `TextViewerFallback` (spec 04) — user never sees an error for this |
| User navigates away from `/upload` mid-extraction | No cleanup needed — the `contracts` row remains with whatever `status` it reached; it simply won't appear as "complete" on the dashboard until the user retries |
| User adds a custom term identical to a standard term (case-insensitive) | Rejected client-side with inline message; never reaches the API |
| Two custom terms differing only by case ("Renewal" vs "renewal") | Second is rejected as a duplicate |

---

## 9. Acceptance Criteria

- [ ] Uploading a valid ≤ 20-page, ≤ 10 MB, text-layer PDF returns a `contract_id` and the correct standard term list for the selected type within 30s P95
- [ ] Uploading a > 10 MB file is rejected client-side before any network call
- [ ] Uploading a scanned (image-only) PDF returns 422 with the "Scanned PDFs are not supported yet." message
- [ ] Uploading a > 20-page PDF returns 422 with the page-limit message
- [ ] A Storage outage does not fail the upload request; `file_path` is `null` and processing can still proceed
- [ ] Pre-processing preview shows the correct 10 NDA terms or 12 MSA terms based on selection
- [ ] User can add up to 5 custom terms; the 6th attempt is blocked with the input disabled
- [ ] Duplicate custom terms (including case-insensitive duplicates of standard terms) are rejected inline
