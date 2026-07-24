# Spec: Dashboard & Contract History

**Story:** US-008 | **Priority:** P1 | **Depends on:** `01-authentication.md`

---

## 1. User Flow

```
Sign-in / sign-up → redirect to /dashboard
  → DashboardStats + ContractHistoryTable fetch contracts for user_id
    → Empty state if none: "No contracts reviewed yet — upload your first contract to begin"
    → Otherwise: sortable table (date desc default, name, type)
      → Click a row → /contracts/[id]
  → "Review a Contract" CTA → /upload
```

---

## 2. Database

Read-only: `SELECT id, file_name, contract_type, status, created_at FROM contracts WHERE user_id = ? ORDER BY created_at DESC`. No new tables — reuses `contracts` from `supabase-schema.sql`. RLS scopes the query to the authenticated user automatically.

---

## 3. Frontend

### 3.1 `app/dashboard/page.tsx` (Server Component shell + Client Components for interactivity)

Renders `DashboardStats` and `ContractHistoryTable`, both Client Components using SWR so the table can re-sort without a full page reload and stays fresh via revalidation.

### 3.2 `hooks/useContractData.ts` (dashboard usage)

Reused from spec 05 but called at the list level here:
```typescript
export function useContractsList(userId: string) {
  return useSWR(['contracts', userId], () =>
    supabase.from('contracts')
      .select('id, file_name, contract_type, status, created_at')
      .order('created_at', { ascending: false })
  )
}
```

### 3.3 `components/dashboard/DashboardStats.tsx`

```typescript
type DashboardStatsProps = { contracts: ContractSummary[] }
```
- Three stat tiles: Total Contracts, NDAs Reviewed, MSAs Reviewed — all derived client-side from the already-fetched `contracts` array (`contracts.length`, `contracts.filter(c => c.contract_type === 'nda').length`, same for `'msa'`) — no separate aggregate query needed

### 3.4 `components/dashboard/ContractHistoryTable.tsx`

```typescript
type SortKey = 'date' | 'name' | 'type'
type ContractHistoryTableProps = { contracts: ContractSummary[] }
```
- Column headers (Date, Name, Type, Status) are clickable to toggle sort; default sort `date desc`
- Sorting is done client-side on the already-fetched array (dataset size per user is small — no server-side pagination needed at MVP scale)
- Each row renders as `ContractRow`

### 3.5 `components/dashboard/ContractRow.tsx`

```typescript
type ContractRowProps = { contract: ContractSummary }
```
- Columns: file name, type badge (NDA/MSA), formatted date (`Intl.DateTimeFormat`), status chip
- Status chip mapping: `'complete'` → Green "Complete", `'processing'` → Yellow "Processing", `'error'` → Red "Failed", `'uploading' | 'ready'` → Grey "Pending"
- Entire row is clickable (`router.push('/contracts/' + id)`) except when `status !== 'complete'`, in which case the row is not clickable (nothing to show yet) and shows a `not-allowed` cursor with reduced opacity

### 3.6 Empty state

`components/dashboard/EmptyDashboard.tsx` — centered illustration placeholder + "No contracts reviewed yet — upload your first contract to begin" (Paragraph Large Medium, Grey 500) + primary CTA button linking to `/upload`. Rendered instead of the table when `contracts.length === 0`.

---

## 4. Design

- Page wrapper: `padding: 96px 112px` (desktop), `flex-col`, `gap: 40px` per design.md Page Canvas pattern
- `DashboardStats` tiles: three-column flex row, `gap: 16px`, each tile White background, `1px solid` Grey 100, `border-radius: 8px`, `padding: 24px`; number in H4-equivalent weight (28px/600), label below in Paragraph Small Regular Grey 500
- `ContractHistoryTable`: header row Grey 25 background, Paragraph Small Regular Grey 500 uppercase-style labels (no letter-spacing per design rules); rows separated by `1px solid` Grey 50; row hover background Grey 50 (`100ms ease-out`)
- Type badge: Blue 50/500/700 for MSA, Violet 50/500/700 for NDA (distinct accent per type for scannability)
- Status chip: Semantic Status Badge pattern — Green/Yellow/Red/Grey per mapping in §3.5
- Empty state: centered within the content area, `gap: 24px` between illustration, text, and CTA

---

## 5. Edge Cases

| Case | Behavior |
|---|---|
| A contract stuck in `'processing'` (e.g. server crashed mid-call) | Row shows the "Processing" chip indefinitely; not clickable. No automatic timeout/cleanup at MVP — acceptable since `/api/process-contract` either completes or sets `'error'` synchronously within the request lifecycle (no async job queue exists to strand a row) |
| Two contracts with identical file names | Both listed independently by `id`; no de-duplication |
| Sorting by "Type" with only one contract type present | Sort still applies (stable, alphabetical fallback for ties by date desc) |
| User deletes their account (out of scope for MVP UI, but FK is `ON DELETE CASCADE`) | All `contracts` rows and their dependents are removed automatically at the DB level |

---

## 6. Acceptance Criteria

- [ ] Dashboard with zero contracts shows the empty state and CTA
- [ ] Dashboard with ≥ 1 contract shows accurate stat tiles and a table sorted by date descending by default
- [ ] Clicking a column header re-sorts by that column
- [ ] Clicking a `'complete'` row navigates to `/contracts/[id]`
- [ ] Rows with a non-`'complete'` status are visually distinct and not clickable
