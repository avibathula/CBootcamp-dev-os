# Spec: Feedback Submission

**Story:** US-010 | **Priority:** P2 (Phase 2 — Launch Hardening) | **Depends on:** `04-results-page-pdf-viewer.md`

---

## 1. User Flow

```
/contracts/[id] → thumbs up/down control (near LegalDisclaimer or results header)
  → click a rating → optional comment field expands
    → POST /api/feedback { contract_id, rating, comment? }
      → 200 → confirmation shown ("Thanks for your feedback")
  → Re-visiting a contract already rated shows the previously submitted rating pre-selected
```

---

## 2. Database

Writes/reads `user_feedback` (see `supabase-schema.sql`). One row per contract (`contract_id UNIQUE`) — resubmission is an upsert, not a new row.

---

## 3. API: `POST /api/feedback`

**File:** `app/api/feedback/route.ts`
**Auth:** Required

**Request:**
```json
{ "contract_id": "uuid", "rating": "thumbs_up", "comment": "Missed the auto-renewal clause on page 5" }
```

**Validation:**
- `rating` must be exactly `'thumbs_up'` or `'thumbs_down'` → 400 otherwise
- `comment` optional; if present, ≤ 1000 chars → 400 otherwise
- `contract_id` must exist and belong to the authenticated user → 403 otherwise

**Processing:**
```sql
INSERT INTO user_feedback (contract_id, user_id, rating, comment)
VALUES (?, ?, ?, ?)
ON CONFLICT (contract_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment;
```

**Response 200:**
```json
{ "feedback_id": "uuid" }
```

---

## 4. Frontend

### 4.1 `components/contract/FeedbackControl.tsx`

```typescript
type FeedbackControlProps = { contractId: string; existingFeedback: UserFeedback | null }
```

- Two icon buttons (thumbs up / thumbs down); the matching one is visually filled/active if `existingFeedback.rating` matches
- Clicking either rating reveals a comment `<textarea>` (optional, collapsed by default, max 1000 chars with a live counter) and a "Submit" button
- On submit: `POST /api/feedback`; on success, replace the control with a confirmation message "Thanks for your feedback" for 3s, then collapse back to showing the selected rating in its active state
- Existing feedback is fetched alongside the contract data on page load (a single extra `SELECT * FROM user_feedback WHERE contract_id = ?` via the client Supabase SDK, RLS-scoped) and passed in as `existingFeedback`

---

## 5. Design

- Thumbs icons: `24px`, Grey 400 default, Blue 500 when active/selected, `100ms ease-out` color transition
- Comment textarea: appears with a `150ms ease-out` height transition, `border-radius: 6px`, `1px solid` Grey 100, `padding: 8px`
- Character counter: Paragraph Small Regular Grey 500, bottom-right of the textarea, turns Red 500 if within 20 chars of the 1000 limit
- Confirmation message: Green 700 text, Paragraph Small Regular, fades in over `150ms ease-out`

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| User submits feedback twice with different ratings | Upsert replaces the prior rating and comment entirely (one row per contract, not a history) |
| User submits a rating with no comment, then later adds a comment | Second submit still targets the same row via the `ON CONFLICT` upsert; `comment` updates, `rating` must be re-sent (the UI always sends both fields together, never a comment-only patch) |
| `comment` is only whitespace | Treated as no comment — trimmed server-side; stored as `NULL` if empty after trim |

---

## 7. Acceptance Criteria

- [ ] Submitting thumbs_up with no comment saves successfully and shows a confirmation
- [ ] Submitting thumbs_down with a comment saves both fields
- [ ] Re-submitting feedback for the same contract updates the existing row instead of creating a duplicate
- [ ] Revisiting a rated contract shows the previously selected rating pre-filled
- [ ] A comment over 1000 characters is rejected with a 400 and a clear inline message
