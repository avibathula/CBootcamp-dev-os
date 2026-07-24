# Spec: Results Page Layout & PDF Viewer

**Stories:** US-003, US-006, FR-06 | **Priority:** P1 | **Depends on:** `03-key-term-extraction.md`

---

## 1. User Flow

```
/contracts/[id] loads
  → Server Component fetches contract (RLS-scoped by session)
    → If file_path is set: generate a 1-hour signed URL server-side → pass to PdfViewer
    → If file_path is null: pass contract_text to TextViewerFallback
  → ResultsLayout renders 60/40 split: PdfViewerPanel | KeyTermsPanel (spec 05)
  → Clicking a term's page badge sets targetPage → both viewer variants respond
```

---

## 2. Database

Read-only for this spec: `SELECT id, file_name, file_path, contract_type, contract_text, status, page_count FROM contracts WHERE id = ? AND user_id = ?`.

If `status !== 'complete'`, redirect to `/dashboard` (a contract with no extracted terms has nothing to show on this page — this should only happen if a user manually navigates to the URL before processing finishes or after an error).

---

## 3. API surface used

No new API routes. This spec consumes:
- A Server Component data fetch (not a client API route) for the contract row + signed URL generation
- `hooks/useContractData.ts` (SWR) for `key_terms`, defined fully in spec 05

### Signed URL generation (server-side only)

```typescript
// app/contracts/[id]/page.tsx (Server Component)
const supabase = createServiceRoleClient()
const { data: signedUrlData } = contract.file_path
  ? await supabase.storage.from('contracts').createSignedUrl(contract.file_path, 3600)
  : { data: null }
```

The signed URL is generated server-side (service role) and passed as a prop into the Client Component `PdfViewer` — it is never fetched client-side, since the client only holds the anon key and Storage RLS policies restrict direct client reads to the user's own folder (which would work, but server-side generation avoids a second round-trip and keeps signed-URL TTL logic in one place).

---

## 4. Frontend

### 4.1 `app/contracts/[id]/page.tsx` (Server Component, page shell)

```typescript
export default async function ContractResultsPage({ params }: { params: { id: string } })
```

- Fetches the contract row and signed URL as above
- Renders `<ResultsLayout contract={contract} signedUrl={signedUrl} />`

### 4.2 `components/contract/ResultsLayout.tsx` (Client Component)

```typescript
type ResultsLayoutProps = {
  contract: Contract
  signedUrl: string | null
}
```

- Owns `targetPage: number` state (via `hooks/usePdfViewer.ts`)
- Renders a 60/40 CSS grid: `grid-template-columns: 60% 40%` on desktop (`≥ 1024px`); stacks to a single column with the PDF panel first on smaller viewports
- Passes `targetPage` + `setTargetPage` down to both the viewer panel and `KeyTermsPanel`
- Renders `LegalDisclaimer` as a fixed footer

### 4.3 `hooks/usePdfViewer.ts`

```typescript
export function usePdfViewer() {
  const [targetPage, setTargetPage] = useState(1)
  const [zoom, setZoom] = useState(1.0)
  return { targetPage, setTargetPage, zoom, setZoom }
}
```

### 4.4 `components/pdf/PdfViewer.tsx`

```typescript
type PdfViewerProps = {
  signedUrl: string
  targetPage: number
  pageCount: number
}
```

- Built on `react-pdf` (`<Document>` / `<Page>`), worker script served from `public/pdf.worker.min.js`
- Renders all pages in a vertically scrollable container; lazy-mounts pages outside the viewport using an `IntersectionObserver` wrapper so only visible ± 1 pages are fully rendered (perf for large contracts)
- `useEffect` on `targetPage` change: scrolls the container to bring that page's element into view (`scrollIntoView({ behavior: 'smooth', block: 'start' })`) and applies a `2px solid Blue 500` highlight ring on that page for 1.5s
- Zoom controls: `+` / `−` buttons adjusting `usePdfViewer`'s `zoom` state in `0.25` increments, clamped `[0.5, 2.0]`
- Keyboard navigation: `PageUp` / `PageDown` adjust `targetPage` by ±1 when the viewer has focus (accessibility requirement, engineering doc §5)

### 4.5 `components/pdf/TextViewerFallback.tsx`

```typescript
type TextViewerFallbackProps = {
  contractText: string
  targetPage: number
}
```

- Parses `contractText` by splitting on the `\n[PAGE N]\n` marker (regex: `/\n\[PAGE (\d+)\]\n/`) into an array of `{ pageNumber: number; text: string }`
- Renders each page as a labelled `<section>` ("Page N" heading + paragraph text)
- Same `targetPage`-driven scroll-into-view behavior as `PdfViewer`, so consuming components never need to know which variant is active
- Rendered when `signedUrl === null` — this is a silent fallback per UX States in the engineering doc, so no error banner is shown

### 4.6 Panel wrapper

`components/contract/PdfViewerPanel.tsx` decides which child to render:

```typescript
type PdfViewerPanelProps = {
  signedUrl: string | null
  contractText: string
  targetPage: number
  pageCount: number
}
// signedUrl ? <PdfViewer .../> : <TextViewerFallback .../>
```

---

## 5. Design

- Panel split: `60% / 40%`, `1px solid` Grey 100 divider between panels
- `PdfViewerPanel` background: Grey 25 (page canvas behind the rendered PDF pages, per "Flat depth" principle)
- PDF page cards: White background, subtle `1px solid` Grey 100 border (no shadow — design system uses flat depth), `8px` border-radius, `16px` margin between stacked pages
- Target-page highlight: `2px solid` Blue 500 ring, `150ms ease-out` fade after 1.5s
- Zoom controls: bottom-right floating pill, White background, `1px solid` Grey 200, `border-radius: 6px`, buttons `32px` square
- `TextViewerFallback` page sections: "Page N" label in Paragraph Small Regular Grey 500, body text in Paragraph Large Medium Grey 900, `24px` gap between pages
- `LegalDisclaimer`: fixed footer, Grey 50 background, `1px solid` Grey 100 top border, Paragraph Small Regular Grey 500 text, `padding: 12px 24px`, full width

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| `file_path` set but the signed URL generation fails (Storage row deleted out-of-band) | `createSignedUrl` returns an error → treat as `signedUrl = null`, fall back to `TextViewerFallback` (same silent-fallback UX as a null `file_path`) |
| Signed URL expires mid-session (user leaves the tab open > 1 hour) | `PdfViewer`'s underlying `<embed>`/canvas fetch fails silently for not-yet-rendered pages; acceptable for MVP — a full refresh re-fetches a new signed URL. No proactive refresh logic required. |
| `targetPage` set to a page number beyond `pageCount` (stale data) | Clamp: `Math.min(targetPage, pageCount)` before scrolling |
| Extremely long contract (20 pages, near the token ceiling) on a slow connection | Lazy page rendering in `PdfViewer` keeps initial paint fast; `TextViewerFallback` has no such concern since it's plain text |
| User resizes the window across the `1024px` breakpoint | `ResultsLayout` grid re-flows via CSS media query, no JS resize listener needed |

---

## 7. Acceptance Criteria

- [ ] With a valid `file_path`, the PDF renders all pages and scroll/zoom work
- [ ] With `file_path = null` (or a failed signed-URL fetch), `TextViewerFallback` renders with no visible error to the user
- [ ] Clicking a term's page badge (from `KeyTermsPanel`, spec 05) scrolls the active viewer to that page and applies the highlight ring
- [ ] `PageUp` / `PageDown` keyboard input navigates pages when the PDF viewer has focus
- [ ] Layout is a 60/40 split on desktop and stacks to a single column below `1024px`
