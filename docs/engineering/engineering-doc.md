# ContractIQ — Engineering Document (High-Level Design)

**Version:** 1.0  
**Date:** 2026-07-22  
**Status:** Draft — Pending Engineering Review  
**Based on PRD:** `docs/ContractIQ_PRD.md` v1.0 (June 24, 2026)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Scope](#2-product-scope)
3. [User Personas](#3-user-personas)
4. [User Flows](#4-user-flows)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Database Design and Schema](#7-database-design-and-schema)
8. [AI Architecture](#8-ai-architecture)
9. [API Specification](#9-api-specification)
10. [Feature Breakdown](#10-feature-breakdown)
11. [Folder Structure](#11-folder-structure)
12. [Naming Conventions](#12-naming-conventions)
13. [Testing Strategy](#13-testing-strategy)
14. [Specs-to-Implementation Mapping](#14-specs-to-implementation-mapping)

---

## 1. Executive Summary

### Project Name
ContractIQ

### Business Goal
Reduce the time non-lawyers spend reviewing NDA and MSA contracts from 90–120 minutes (manual) to ≤ 15 minutes, without requiring legal expertise or a lawyer on call.

### Problem Statement
Business professionals at SMBs routinely sign NDAs and MSAs without fully understanding the terms. No affordable, purpose-built tool exists that combines structured key-term extraction with page-level attribution, confidence scoring, and document-grounded Q&A in a single workflow. Existing enterprise tools (DocuSign CLM, Ironclad) cost $50k–$500k/year; generic AI chat tools (ChatGPT) lack schema, page references, and confidence signals.

### Target Users
- **Primary:** Founders, COOs, procurement managers at 5–250 person companies with no in-house legal counsel
- **Secondary:** Freelancers and consultants receiving client MSAs from larger businesses

### Technology Stack (resolved)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API Routes (deployed to Vercel) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase PostgreSQL with Row-Level Security |
| File Storage | Supabase Storage (bucket: `contracts`) |
| AI | GPT-4o via OpenAI API (JSON mode) |
| PDF Parsing | `pdf-parse` (Node.js, server-side, run once at upload) |
| PDF Rendering | PDF.js (client-side) with paginated text-viewer fallback |
| Hosting | Vercel (frontend + API routes) + Supabase (DB + Storage) |
| State Management | React Context (auth) + SWR (server state) |

### Success Criteria

| Metric | Target |
|---|---|
| End-to-end extraction latency | ≤ 30 seconds P95 for ≤ 20-page contracts |
| Key-term extraction accuracy | ≥ 88% F1 (NDA), ≥ 85% F1 (MSA) |
| Confidence score calibration error | ≤ 0.10 per bucket |
| User correction rate | ≤ 12% of extracted terms |
| Chat hallucination rate | ≤ 5% of responses |
| 30-day user retention | ≥ 45% |
| Cost per contract analysis | ≤ $0.25 (≤ $0.20 for extraction alone) |

---

## 2. Product Scope

### In Scope — MVP

- Email/password authentication and session management
- PDF upload (text-layer only, ≤ 10 MB, ≤ 20 pages, ≤ 15,000 tokens)
- Server-side text extraction with `[PAGE N]` markers (stored once; reused for all AI calls)
- Pre-processing preview of standard key terms for the selected contract type (NDA or MSA)
- Custom key term addition (up to 5 terms) before processing
- GPT-4o key term extraction with: value, page number, confidence score (0–100%), source sentence
- Results page: two-panel layout (PDF viewer left, key terms panel right)
- Inline PDF viewer (PDF.js) with text-viewer fallback when Storage is unavailable
- Click-to-navigate from key term panel to PDF page
- Low-confidence flagging: ⚠️ icon + tooltip for confidence < 50%
- Inline key term editing with "Edited" badge; original AI value preserved
- Contract chat (GPT-4o, full-context, grounded, with mandatory page citation)
- Persistent chat history per contract
- Dashboard with contract history (sortable by date/name/type)
- Feedback submission (thumbs up/down + optional comment) — P2
- "Not legal advice" disclaimer on every results page
- Supabase RLS enforced on all tables and Storage

### Out of Scope — MVP

- Scanned / image PDFs (OCR) — graceful error returned
- Non-English contracts
- Batch contract upload
- Team workspaces / multi-user accounts
- Export to CSV or PDF (P2 backlog)
- Dashboard analytics charts
- Email notifications
- Fine-tuned models (uses few-shot prompting only)
- Mobile-native application

### Future Enhancements

| Release | Features |
|---|---|
| v1.1 (Weeks 15–18) | Export key terms to CSV/PDF; batch upload (up to 5); dashboard analytics charts |
| v1.2 (Weeks 19–24) | Scanned PDF support (AWS Textract); contract comparison view; email notifications; multi-user workspace (team plans) |
| Post-v1.2 | Fine-tuned extraction model; non-US contract convention support; API access (Pro plan); mobile PWA |

---

## 3. User Personas

### Persona A — The Time-Pressed Founder / Ops Lead

| Attribute | Detail |
|---|---|
| **Role** | Founder, COO, Procurement Manager, Legal Operations Manager |
| **Company size** | 5–250 employees, no in-house legal |
| **Industry** | SaaS, agency, professional services, fintech, e-commerce |
| **Contract volume** | 5–15 NDAs or MSAs per month |
| **Pain** | 90–120 min/review; misses auto-renewal clauses, indemnification caps, IP assignment; pays $250–500/hr for ad-hoc legal |
| **Goal in ContractIQ** | Upload → see key terms in < 30s → ask follow-up questions → sign with confidence |
| **Technical comfort** | Moderate; comfortable with SaaS tools; not a developer |
| **Primary flows** | Sign Up, Core Review Flow, Chat with Contract, Dashboard |
| **Permissions** | Full access to their own contracts, terms, and chat history; no access to other users' data |

### Persona B — The Freelancer / Consultant

| Attribute | Detail |
|---|---|
| **Role** | Individual contributor: designer, marketer, developer, consultant |
| **Company size** | Solo or 1–5 person team |
| **Contract volume** | 1–4 MSAs per month from larger clients |
| **Pain** | Cannot afford legal review; signs without reading due to power imbalance; no tool gives page-level citations |
| **Goal in ContractIQ** | Quickly identify non-standard or risky clauses before accepting a client MSA |
| **Technical comfort** | High (developers) to moderate (designers/consultants) |
| **Primary flows** | Sign Up, Core Review Flow, Chat with Contract |
| **Permissions** | Same as Persona A — single-user account model at MVP |

---

## 4. User Flows

### Flow 1 — New Visitor → Sign Up → Dashboard

```
User visits landing page
  → Clicks "Get Started Free"
    → Frontend renders Supabase Auth sign-up modal (email + password)
      → User submits credentials
        → Supabase Auth creates account, issues session token
          → Browser stores Supabase session (localStorage / cookie)
            → Next.js middleware detects authenticated session
              → Redirect to /dashboard
                → Dashboard loads empty state: "No contracts reviewed yet — upload your first contract to begin"
```

**Error paths:**
- Invalid email format → inline validation error before submission
- Weak password (< 8 chars) → inline validation error
- Email already registered → Supabase returns 400 → display "An account with this email already exists. Sign in instead."
- Supabase Auth unreachable → surface "Sign-up unavailable. Try again in a moment."

---

### Flow 2 — Returning User → Sign In → Dashboard

```
User visits /auth/signin (or landing page CTA "Sign In")
  → Enters email + password
    → Frontend calls supabase.auth.signInWithPassword()
      → Supabase validates credentials
        → Issues session token
          → Next.js middleware detects session
            → Redirect to /dashboard
              → SWR fetches contracts list for user_id
                → Dashboard renders contract history table (sorted by date desc)
```

**Error paths:**
- Invalid credentials → Supabase 400 → "Incorrect email or password."
- Account not found → same generic message (no user enumeration)
- Rate limit exceeded → "Too many sign-in attempts. Try again in 15 minutes."

---

### Flow 3 — Core Contract Review Flow

```
/dashboard → Click "Review a Contract"
  → /upload renders: contract type selector (NDA | MSA) + drag-drop PDF area

Step 1: Upload
  User selects contract type + drops/picks PDF
    → Frontend validates: file type = PDF, size ≤ 10 MB, pages ≤ 20
      → If invalid: show error banner, block submission
      → If valid: POST /api/upload-contract (multipart: file + contract_type)
        → Server: run pdf-parse on file buffer
          → If extracted text < 100 words: return 422 "Scanned PDFs are not supported yet"
          → If text > 15,000 tokens: return 422 "Contract exceeds 20-page limit"
          → If valid:
            → INSERT into contracts (user_id, file_name, contract_type, contract_text, status='uploading')
            → Upload PDF to Supabase Storage at contracts/{user_id}/{contract_id}/{filename}.pdf (non-blocking — failure does not block response)
            → UPDATE contracts SET status='ready', file_path=<path or null>
            → Return { contract_id, standard_terms: [...] }

Step 2: Pre-Processing Preview
  Frontend receives contract_id + standard_terms list
    → Renders "Key terms ContractIQ will extract:" card
      → NDA terms: Parties, Effective Date, Confidentiality Obligations, Permitted Disclosures, Term & Duration, Governing Law, Jurisdiction, IP Ownership, Non-Solicitation, Breach & Remedy
      → MSA terms: Parties, Service Scope, Payment Terms, Invoice Schedule, Late Payment Penalty, Liability Cap, Indemnification, IP Ownership, Termination Clause, Governing Law, Dispute Resolution, Notice Period
    → User optionally adds custom terms via "+ Add Key Term" (max 5)
      → Each custom term appears in the list with "Custom" badge

Step 3: Process
  User clicks "Process Contract"
    → POST /api/process-contract { contract_id, custom_terms: [] }
      → Server: reads contracts.contract_text from DB (NOT from Storage)
        → Builds few-shot extraction prompt (3 NDA or 3 MSA examples) + custom terms appended
        → Calls OpenAI GPT-4o (temp=0.1, JSON mode, max_tokens=2000)
          → On JSON parse failure: retry once with "Return only the JSON array, no explanation."
          → On second failure or timeout: UPDATE contracts SET status='error'; return 503
        → Parse JSON array → INSERT all terms into key_terms table
        → INSERT custom term definitions into custom_key_terms table
        → UPDATE contracts SET status='complete'
        → Return { contract_id, terms_count }
          → UI shows progress bar: Step 1 ✓ Extracting text → Step 2 ✓ Analysing with AI → Step 3 ✓ Compiling results
          → Redirect to /contracts/[id]

Step 4: Results Page
  /contracts/[id] renders two-panel layout:
    LEFT panel (60%): PdfViewer (PDF.js, signed URL from Supabase Storage)
      → If Storage unavailable (file_path = null): TextViewerFallback (parses [PAGE N] markers from contract_text)
      → Both panels respond to targetPage prop changes from key term clicks
    RIGHT panel (40%): KeyTermsPanel
      → SWR fetches key_terms for contract_id
      → Each TermCard shows: Term Name | Extracted Value | Page X | Confidence %
        → Confidence ≥ 80%: green badge
        → Confidence 50–79%: amber badge
        → Confidence < 50%: red badge + ⚠️ icon + tooltip "Low confidence — verify this in the document directly"
      → Expandable "Why?" section: shows source_sentence verbatim
      → Click page number → PDF viewer scrolls to that page
      → Click term value → inline edit mode (PATCH /api/terms/[id])
    BOTTOM: "This is an AI-assisted review tool, not legal advice. Always verify critical terms with a qualified lawyer."
```

---

### Flow 4 — Chat with Contract

```
/contracts/[id] → Click "Chat" tab (or floating button)
  → ChatInterface renders within results page
    → SWR loads existing chat_messages for this contract's chat_session (if any)

User types question (e.g. "What happens if I breach this NDA?")
  → POST /api/chat { contract_id, message: "..." }
    → Server:
        1. Fetch contracts.contract_text from DB
        2. Fetch all chat_messages for this session (up to 200, ascending)
        3. Classify query: 'contract' | 'history' | 'both' (inline logic, no extra API call)
        4. Build messages array:
           [
             { role: "system", content: "<grounding prompt>" },
             { role: "user", content: "<contract_text>" },
             ...chat history...,
             { role: "user", content: "<user question>" }
           ]
        5. Call GPT-4o (temp=0.4, max_tokens=1000)
        6. INSERT user message into chat_messages (role='user')
        7. INSERT AI response into chat_messages (role='assistant')
        8. Return { message: "Based on the document... [Page X]" }
    → ChatInterface appends messages to conversation view
      → User messages: right-aligned
      → AI responses: left-aligned, with "[Page X]" link that triggers PDF viewer navigation
      → "Source: Page X" citation is clickable

Conversation persistence:
  → On page reload: SWR re-fetches all messages for the session
  → Full history is preserved indefinitely (user can delete via dashboard)
```

---

## 5. Frontend Architecture

### Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Full-stack React framework; file-based routing; server components |
| Tailwind CSS | Utility-first styling |
| SWR | Client-side data fetching + caching + revalidation |
| React Context | Auth session state (from Supabase) |
| `@supabase/supabase-js` | Supabase client for auth + direct DB reads |
| PDF.js (`react-pdf`) | Client-side PDF rendering |
| `pdfjs-dist` | PDF.js worker (loaded from `/public`) |

### Pages

| Route | Purpose | Auth required |
|---|---|---|
| `/` | Landing page (value prop, demo GIF, CTAs) | No |
| `/auth/signin` | Email/password sign-in form | No (redirect to /dashboard if already authed) |
| `/auth/signup` | Email/password sign-up form | No |
| `/dashboard` | Contract history table + "Review a Contract" CTA | Yes |
| `/upload` | Contract type selector + PDF upload + pre-processing preview + custom terms | Yes |
| `/contracts/[id]` | Results page: PDF viewer + key terms panel + chat tab | Yes |

### Component Hierarchy

```
app/layout.tsx
├── AuthProvider (React Context — wraps all routes)
│
├── / → LandingPage
│   ├── HeroSection
│   ├── DemoGif
│   └── AuthCTAButtons
│
├── /auth/signin → SignInPage
│   └── AuthForm (email + password + error display)
│
├── /auth/signup → SignUpPage
│   └── AuthForm (variant: signup)
│
├── /dashboard → DashboardPage
│   ├── DashboardStats (total contracts, NDA count, MSA count)
│   ├── ContractHistoryTable (sortable by date/name/type)
│   │   └── ContractRow (name, type, date, status, click → /contracts/[id])
│   └── ReviewContractCTA → /upload
│
├── /upload → UploadPage
│   ├── ContractTypeSelector (NDA | MSA dropdown)
│   ├── PdfDropzone (drag-drop + file picker, validates size/type)
│   ├── PreProcessingPreview
│   │   ├── StandardTermsList (derived from contract type)
│   │   ├── CustomTermInput (up to 5; shows "Custom" badge)
│   │   └── ProcessButton
│   └── ExtractionProgressBar (Step 1 → Step 2 → Step 3)
│
└── /contracts/[id] → ResultsPage
    ├── ResultsLayout (two-panel: 60/40 split)
    │   ├── LEFT: PdfViewerPanel
    │   │   ├── PdfViewer (PDF.js; responds to targetPage prop)
    │   │   └── TextViewerFallback (parses [PAGE N] markers; shows when file_path = null)
    │   └── RIGHT: KeyTermsPanel
    │       ├── TermCard[] (for each key term)
    │       │   ├── TermName
    │       │   ├── TermValue (inline-editable)
    │       │   ├── PageBadge (click → sets targetPage)
    │       │   ├── ConfidenceIndicator (green/amber/red + ⚠️ tooltip)
    │       │   └── SourceSentenceExpander ("Why?" accordion)
    │       └── AddCustomTermPostProcess (disabled post-process; for future v1.1)
    ├── ChatInterface (tab or floating panel)
    │   ├── MessageList
    │   │   ├── UserMessage (right-aligned)
    │   │   └── AssistantMessage (left-aligned + PageCitationLink)
    │   └── MessageInput (textarea + send button)
    └── LegalDisclaimer (fixed footer: "not legal advice")
```

### UX States

| State | Behavior |
|---|---|
| **Loading** | Skeleton loaders on TermCard[], spinner on PDF viewer |
| **Empty dashboard** | Illustration + "No contracts reviewed yet — upload your first contract to begin" |
| **Upload validating** | Inline field errors for file type / size / page count |
| **Extraction in progress** | 3-step progress bar; estimated time shown ("Usually under 30 seconds") |
| **Low confidence** | ⚠️ icon on TermCard; amber/red badge; non-dismissible tooltip |
| **Chat loading** | Typing indicator (animated dots) while awaiting response |
| **Error: OpenAI timeout** | Banner: "Analysis timed out. Try again." + Retry button |
| **Error: scanned PDF** | Banner: "Scanned PDFs are not supported yet. Upload a text-based PDF." |
| **Error: contract too long** | Banner: "This contract exceeds our 20-page limit. Shorter contract support is coming." |
| **Storage unavailable** | Silent fallback to TextViewerFallback; no user-facing error |
| **Inline edit saved** | "Edited" badge appears on TermCard; save confirmed within 2s |

### Accessibility (WCAG 2.1 AA)

- All interactive elements have visible focus rings
- Confidence badge colors supplemented with ⚠️ icons (not color-only)
- ARIA labels on all badge/icon elements (`aria-label="Low confidence: verify manually"`)
- PDF viewer keyboard-navigable (page up/down)
- Chat input accessible via keyboard Tab and Enter
- All images have `alt` text; decorative images have `alt=""`

---

## 6. Backend Architecture

### Stack

| Tool | Purpose |
|---|---|
| Next.js API Routes (`/app/api/*/route.ts`) | Thin serverless handlers; deployed to Vercel |
| `@supabase/supabase-js` (service role) | Server-side DB writes; bypasses RLS for trusted operations |
| `pdf-parse` | Node.js PDF text extraction |
| `openai` (npm) | Official OpenAI SDK; GPT-4o calls |
| Supabase Auth (JWT validation) | Every API route validates the Bearer token before processing |

### Core Systems

#### Authentication & Authorization
- Every API route reads `Authorization: Bearer <supabase_jwt>` header
- Validates token via `supabase.auth.getUser(token)` — returns `user` or 401
- Service-role client used only for writes where RLS would block (e.g., writing `key_terms` on behalf of a user); user-scoped reads go through the user's JWT

#### Contract Processing Pipeline

```
POST /api/upload-contract
  ↓
Validate auth JWT
  ↓
Validate file (PDF, ≤ 10 MB, ≤ 20 pages via pdf-parse)
  ↓
Extract text with [PAGE N] markers
  ↓
Validate: text ≥ 100 words, ≤ 15,000 tokens
  ↓
INSERT contracts (status='uploading') → get contract_id
  ↓
Upload PDF to Supabase Storage (non-blocking, fire-and-forget)
  ↓
UPDATE contracts (status='ready', file_path=<path or null>)
  ↓
Return { contract_id, standard_terms }
```

```
POST /api/process-contract
  ↓
Validate auth JWT
  ↓
SELECT contract_text FROM contracts WHERE id=? AND user_id=?
  ↓
Build GPT-4o extraction prompt (standard terms + custom terms)
  ↓
Call OpenAI (temp=0.1, JSON mode, max_tokens=2000)
  ↓
Parse JSON response
  ↓ (on parse failure)
Retry once with correction prompt
  ↓ (on second failure)
UPDATE contracts SET status='error'; return 503
  ↓ (on success)
INSERT key_terms[] + custom_key_terms[]
  ↓
UPDATE contracts SET status='complete'
  ↓
Return { terms_count }
```

#### Error Handling Strategy

| Scenario | Behavior |
|---|---|
| OpenAI API timeout (> 20s) | Catch error; 3-retry with exponential backoff (1s, 2s, 4s); then set contract status='error'; return 503 with retry CTA |
| OpenAI JSON parse failure | Single retry with correction prompt; on second failure → 503 |
| Supabase Storage upload failure | Log error; set `file_path = null`; continue (text-viewer fallback handles UI) |
| PDF extraction yields < 100 words | Return 422 "Scanned PDFs are not supported yet" |
| Contract > 15,000 tokens | Return 422 "Contract exceeds the 20-page limit" |
| Invalid auth JWT | Return 401 "Unauthorized" |
| User not found | Return 401 |
| Cross-user data attempt | RLS blocks at DB layer; service role never exposed to client |

#### Service Interaction Diagram

```
                  Browser (Next.js Client)
                         │
            ┌────────────┼────────────────┐
            │            │                │
      Supabase Auth   SWR fetches      API Routes
      (sign in/up)  (contracts,       (Vercel serverless)
                    key_terms,              │
                    chat_messages)     ┌───┴───────────┐
                         │            │               │
                    Supabase DB    OpenAI API    Supabase Storage
                    (PostgreSQL)   (GPT-4o)      (PDF files)
                         │
                    All tables
                    with RLS
```

#### Rate Limiting
- Vercel Edge middleware: max 10 `/api/process-contract` calls per user per hour
- Max 60 `/api/chat` calls per user per hour
- Returns 429 with `Retry-After` header and human-readable message

---

## 7. Database Design and Schema

### Overview

All tables live in a single Supabase PostgreSQL project. Every table has a `user_id UUID REFERENCES auth.users(id)` column. Row-Level Security is enabled on every table with policies that restrict all operations to `auth.uid() = user_id`.

The Supabase Storage bucket (`contracts`) and its RLS policies are also created via SQL (not via the dashboard) to ensure reproducible setup.

---

### Table: `contracts`

**Purpose:** One row per uploaded contract. Stores the extracted text (single source of truth for AI pipeline), file metadata, processing status.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| `file_name` | `TEXT` | NOT NULL | Original filename as uploaded |
| `file_path` | `TEXT` | NULLABLE | `contracts/{user_id}/{id}/{filename}.pdf`; NULL if Storage upload failed |
| `contract_type` | `TEXT` | NOT NULL, CHECK IN ('nda', 'msa') | |
| `contract_text` | `TEXT` | NOT NULL | Full extracted text with `[PAGE N]` markers |
| `status` | `TEXT` | NOT NULL, DEFAULT 'uploading', CHECK IN ('uploading', 'ready', 'processing', 'complete', 'error') | |
| `page_count` | `INTEGER` | NOT NULL | Total pages extracted |
| `token_count` | `INTEGER` | NULLABLE | Approximate token count of contract_text |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Updated via trigger |

**Indexes:**
- `idx_contracts_user_id` ON `(user_id)`
- `idx_contracts_created_at` ON `(user_id, created_at DESC)` — for dashboard sort

**RLS Policies:**
```sql
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_contracts" ON contracts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Table: `key_terms`

**Purpose:** One row per extracted term per contract. Stores the AI output and tracks user edits.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `contract_id` | `UUID` | NOT NULL, FK → `contracts(id)` ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | Denormalized for RLS efficiency |
| `term_name` | `TEXT` | NOT NULL | e.g. "Governing Law", "Notice Period" |
| `value` | `TEXT` | NULLABLE | Current value (may be user-edited) |
| `original_value` | `TEXT` | NULLABLE | AI-extracted value; preserved when user edits |
| `page_number` | `INTEGER` | NULLABLE | 1-indexed page where term was found |
| `confidence_score` | `NUMERIC(4,2)` | NOT NULL, CHECK BETWEEN 0 AND 100 | Percentage (e.g. 87.50) |
| `source_sentence` | `TEXT` | NULLABLE | Verbatim sentence from contract used for extraction |
| `is_custom` | `BOOLEAN` | NOT NULL, DEFAULT false | True if added by user before processing |
| `is_edited` | `BOOLEAN` | NOT NULL, DEFAULT false | True if user has edited the value |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Updated via trigger |

**Indexes:**
- `idx_key_terms_contract_id` ON `(contract_id)`
- `idx_key_terms_user_id` ON `(user_id)`

**RLS Policies:**
```sql
ALTER TABLE key_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_key_terms" ON key_terms
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Table: `custom_key_terms`

**Purpose:** Stores the user-defined term names added before processing (pre-processing step). These become `key_terms` rows with `is_custom = true` after extraction; this table captures the intent before processing completes.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `contract_id` | `UUID` | NOT NULL, FK → `contracts(id)` ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| `term_name` | `TEXT` | NOT NULL | User-defined term name |
| `is_manual` | `BOOLEAN` | NOT NULL, DEFAULT true | Always true (all rows in this table are manual) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |

**Constraint:** Max 5 rows per `contract_id` (enforced at API layer).

**RLS Policies:**
```sql
ALTER TABLE custom_key_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_custom_terms" ON custom_key_terms
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Table: `chat_sessions`

**Purpose:** One chat session per contract (1:1 relationship at MVP). Allows future expansion to multiple sessions per contract.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `contract_id` | `UUID` | NOT NULL, UNIQUE (1:1 per contract at MVP), FK → `contracts(id)` ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |

**Indexes:**
- `idx_chat_sessions_contract_id` ON `(contract_id)` UNIQUE

**RLS Policies:**
```sql
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chat_sessions" ON chat_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Table: `chat_messages`

**Purpose:** All chat turns (user questions + AI responses) linked to a session.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `session_id` | `UUID` | NOT NULL, FK → `chat_sessions(id)` ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | Denormalized for RLS |
| `role` | `TEXT` | NOT NULL, CHECK IN ('user', 'assistant') | |
| `content` | `TEXT` | NOT NULL | Message text |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Used for ordering |

**Indexes:**
- `idx_chat_messages_session_id` ON `(session_id, created_at ASC)` — for loading ordered history

**RLS Policies:**
```sql
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chat_messages" ON chat_messages
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Table: `user_feedback`

**Purpose:** Thumbs up/down feedback per contract review with optional comment.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | |
| `contract_id` | `UUID` | NOT NULL, UNIQUE (one feedback per contract), FK → `contracts(id)` ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| `rating` | `TEXT` | NOT NULL, CHECK IN ('thumbs_up', 'thumbs_down') | |
| `comment` | `TEXT` | NULLABLE | Optional free-text feedback |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |

**RLS Policies:**
```sql
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_feedback" ON user_feedback
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Supabase Storage: `contracts` Bucket

The bucket and its RLS policies **must be created via SQL** (not via the dashboard) to ensure reproducible setup. If these SQL statements are omitted, Storage uploads will silently fail — `file_path` will remain NULL and the PDF viewer will not render (text-viewer fallback will still work).

```sql
-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: INSERT (upload)
CREATE POLICY "users_can_upload_own_contracts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: SELECT (download / signed URL)
CREATE POLICY "users_can_read_own_contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: DELETE
CREATE POLICY "users_can_delete_own_contracts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

**File path pattern:** `contracts/{user_id}/{contract_id}/{filename}.pdf`  
**Signed URL expiry:** 1 hour (generated server-side via service role)  
**Data retention:** Auto-delete PDFs 90 days after last access (implemented via Supabase scheduled function post-MVP)

---

### Updated-At Trigger (shared)

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON key_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### Entity Relationship Diagram

```
auth.users (Supabase managed)
    │
    ├─── contracts (user_id FK)
    │       │
    │       ├─── key_terms (contract_id FK)
    │       │
    │       ├─── custom_key_terms (contract_id FK)
    │       │
    │       ├─── chat_sessions (contract_id FK, UNIQUE)
    │       │       │
    │       │       └─── chat_messages (session_id FK)
    │       │
    │       └─── user_feedback (contract_id FK, UNIQUE)
    │
    └─── [Supabase Storage: contracts/{user_id}/{contract_id}/]
```

---

## 8. AI Architecture

### LLM Provider

| Setting | Value |
|---|---|
| Provider | OpenAI API |
| Model | `gpt-4o` |
| Context window | 128k tokens |
| Response format (extraction) | `{ "type": "json_object" }` (JSON mode) |
| Response format (chat) | Free text |

---

### Feature A: Key Term Extraction

**Goal:** Extract a structured list of key terms from any NDA or MSA with page attribution, confidence scoring, and source sentence — in a single inference call.

**Prompt technique:** Few-shot (3 NDA examples + 3 MSA examples embedded in the system prompt). Each example shows a contract excerpt → expected JSON output.

**Parameters:**
- `temperature`: 0.1 (deterministic structured output)
- `max_tokens`: 2000 (extraction output is bounded; 20–30 terms × ~60 tokens each)
- `response_format`: `{ "type": "json_object" }`

**System prompt structure (extraction):**

```
You are a legal contract analyst. Your task is to extract key terms from the provided contract text.

CONTRACT TYPE: {contract_type}

STANDARD TERMS TO EXTRACT:
{standard_terms_list}

CUSTOM TERMS TO EXTRACT:
{custom_terms_list}  ← appended from user input

INSTRUCTIONS:
- For each term, return: term_name, value, page_number (1-indexed), confidence_score (0–100), source_sentence
- confidence_score reflects how certain you are the extracted value is correct (0=not found/guessed, 100=explicitly stated verbatim)
- source_sentence is the verbatim sentence from the document you used to extract the value
- If a term is not present in the document, return value=null, confidence_score=0, source_sentence=null
- Return ONLY valid JSON. No explanation text.

OUTPUT FORMAT:
{ "terms": [ { "term_name": "...", "value": "...", "page_number": 1, "confidence_score": 85.0, "source_sentence": "..." } ] }

FEW-SHOT EXAMPLES:
[3 NDA examples or 3 MSA examples based on contract_type]
```

**Error recovery:**
- If JSON parse fails → send single retry prompt: "Your previous response was not valid JSON. Return only the JSON object, no explanation."
- If second failure → return 503; set contract `status='error'`

**Output schema validated:**
```typescript
type ExtractionTerm = {
  term_name: string
  value: string | null
  page_number: number | null
  confidence_score: number  // 0–100
  source_sentence: string | null
}
type ExtractionOutput = { terms: ExtractionTerm[] }
```

---

### Feature B: Contract Chat (Q&A)

**Goal:** Answer plain-English questions about the uploaded contract strictly using the document text, with mandatory page citation.

**Prompt technique:** RAG-style full-context injection (entire contract text passed as context). No vector retrieval at MVP — full text for ≤ 15,000 token contracts fits comfortably in 128k context window.

**Parameters:**
- `temperature`: 0.4 (slightly warmer for natural conversational responses)
- `max_tokens`: 1000 (concise answers)
- `response_format`: default (free text)

**System prompt (chat):**

```
You are a legal contract assistant. Answer questions ONLY from the contract text provided below.

RULES:
1. Every answer must include a citation in the format [Page X] where X is the page number from the document.
2. If the answer is not in the document, say: "I cannot find this in the document."
3. Begin every answer with "Based on the document," to make the scope clear.
4. Do NOT use general legal knowledge. Do NOT answer from memory.
5. Do NOT give legal advice. If asked for advice, say: "I can help you understand what the document says, but for legal advice, please consult a qualified lawyer."

CONTRACT TEXT:
{contract_text}
```

**Message array construction:**
```
[
  { role: "system", content: "<system_prompt_with_contract_text>" },
  { role: "user",   content: "<first user message>" },
  { role: "assistant", content: "<first AI response>" },
  ... (up to 200 messages ascending),
  { role: "user",   content: "<current user message>" }
]
```

**Query classification (inline, no extra API call):**
- If user message contains "earlier", "before", "previous", "you said" → type: `history`
- If user message contains contract-specific nouns → type: `contract`
- Default → type: `both`
- Classification adjusts the system prompt preamble (no structural change to context inclusion)

---

### Hallucination Guardrails (AI layer)

| Guardrail | Implementation |
|---|---|
| Confidence scoring | Self-reported per term in extraction JSON; never suppressed |
| Low-confidence flagging | confidence < 50% → ⚠️ badge + tooltip in UI |
| Source sentence requirement | Every term requires `source_sentence`; null source_sentence flags unreliable term |
| Temperature 0.1 for extraction | Minimizes fabrication in structured output |
| Document-only system prompt | Chat model forbidden from general legal knowledge |
| Mandatory page citation | Chat responses without `[Page X]` are treated as incomplete |
| JSON mode | Eliminates unparseable free-text extraction responses |
| Single retry on parse fail | One automatic correction prompt before failing gracefully |
| "Not found" is valid | Explicit instruction to return null/0 when term is absent; prevents confabulation |
| Automated hallucination test | Regression test: ask question about topic not in document → assert "I cannot find this" |

---

### Cost Controls

| Control | Target |
|---|---|
| Max input tokens per extraction call | ~15,000 (contract) + ~3,000 (few-shot + prompt) = ~18,000 input tokens |
| Max output tokens per extraction | 2,000 |
| Estimated cost per extraction | ~18k input × $0.005/1k + 1.5k output × $0.015/1k ≈ **$0.11** |
| Max input tokens per chat turn | ~15,000 (contract) + ~8,000 (200 history messages) + ~500 (prompt) = ~23,500 |
| Max output tokens per chat | 1,000 |
| Estimated cost per chat turn | ~23.5k × $0.005 + 0.8k × $0.015 ≈ **$0.13** |
| Total budget per contract session | ≤ $0.25 (extraction + ~1 chat turn); more chat turns within session are additive |
| Alert threshold | OpenAI spend alert at 80% of monthly budget via OpenAI usage alerts |
| Contract rejection | Contracts > 15,000 tokens rejected before any OpenAI call |

---

## 9. API Specification

All routes are Next.js API Routes at `/app/api/*/route.ts`, deployed to Vercel.

**Common headers (all protected routes):**
```
Authorization: Bearer <supabase_jwt>
Content-Type: application/json (except multipart uploads)
```

**Common error responses:**
| Code | Scenario |
|---|---|
| 400 | Malformed request body |
| 401 | Missing or invalid JWT |
| 403 | User does not own the requested resource |
| 422 | Business rule violation (scanned PDF, contract too long, etc.) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 503 | OpenAI API failure after retries |

---

### POST `/api/upload-contract`

**Purpose:** Accept PDF, extract text, store contract record, upload file to Storage (non-blocking).

**Auth:** Required

**Request:** `multipart/form-data`
```
file:           File    (PDF, ≤ 10 MB)
contract_type:  string  ("nda" | "msa")
```

**Validation:**
- `file.type` must be `application/pdf`
- `file.size` ≤ 10,485,760 bytes (10 MB)
- After extraction: `page_count` ≤ 20
- After extraction: token count ≤ 15,000
- After extraction: word count ≥ 100 (scanned PDF guard)

**Response 200:**
```json
{
  "contract_id": "uuid",
  "standard_terms": ["Parties", "Effective Date", "..."],
  "page_count": 12
}
```

**Error responses:**
```json
{ "error": "Only PDF files are accepted." }                             // 400
{ "error": "File exceeds the 10 MB limit." }                           // 422
{ "error": "Scanned PDFs are not supported yet." }                     // 422
{ "error": "Contract exceeds the 20-page limit." }                     // 422
{ "error": "This contract is too long for analysis (over 15,000 tokens)." } // 422
```

---

### POST `/api/process-contract`

**Purpose:** Trigger GPT-4o key term extraction for an uploaded contract.

**Auth:** Required

**Request body:**
```json
{
  "contract_id": "uuid",
  "custom_terms": ["Non-compete radius", "Auto-renewal clause"]
}
```

**Validation:**
- `contract_id` exists and `user_id` matches authenticated user
- `contracts.status` must be `'ready'` (not already processing/complete)
- `custom_terms` length ≤ 5

**Processing:**
1. Fetch `contract_text` from DB
2. Build and call GPT-4o extraction prompt
3. Parse response; retry once on JSON parse failure
4. Bulk insert `key_terms[]`
5. Insert `custom_key_terms[]`
6. Update `contracts.status = 'complete'`

**Response 200:**
```json
{
  "contract_id": "uuid",
  "terms_count": 14
}
```

**Error responses:**
```json
{ "error": "Contract not found or access denied." }                          // 403
{ "error": "Contract is already processed." }                                // 422
{ "error": "AI analysis failed. Please try again." }                        // 503
{ "error": "Too many custom terms. Maximum 5 allowed." }                     // 422
```

---

### POST `/api/chat`

**Purpose:** Send a user chat message and return a GPT-4o response grounded in the contract text.

**Auth:** Required

**Request body:**
```json
{
  "contract_id": "uuid",
  "message": "What is the notice period for termination?"
}
```

**Processing:**
1. Fetch `contract_text` from DB
2. Fetch or create `chat_session` for this contract
3. Fetch all `chat_messages` for the session (up to 200, ascending)
4. Build messages array with system prompt + contract context + history + new message
5. Call GPT-4o (temp=0.4, max_tokens=1000)
6. Insert user message into `chat_messages`
7. Insert AI response into `chat_messages`

**Response 200:**
```json
{
  "message": "Based on the document, the notice period is 30 days written notice to the other party [Page 7].",
  "session_id": "uuid"
}
```

**Error responses:**
```json
{ "error": "Contract not found or not yet processed." }    // 422
{ "error": "Chat response timed out. Please try again." }  // 503
```

---

### PATCH `/api/terms/[id]`

**Purpose:** Update an extracted key term value inline (user correction).

**Auth:** Required

**Request body:**
```json
{
  "value": "36 months from the Effective Date"
}
```

**Processing:**
1. Verify `key_terms.user_id` matches authenticated user
2. If `is_edited = false`: copy current `value` to `original_value`
3. Update `value = <new_value>`, `is_edited = true`

**Response 200:**
```json
{
  "id": "uuid",
  "value": "36 months from the Effective Date",
  "is_edited": true,
  "original_value": "3 years"
}
```

**SLA:** Save completes within 2 seconds (Supabase write latency target).

---

### POST `/api/feedback`

**Purpose:** Submit thumbs up/down feedback for a contract review.

**Auth:** Required

**Request body:**
```json
{
  "contract_id": "uuid",
  "rating": "thumbs_up",
  "comment": "Missed the auto-renewal clause on page 5"
}
```

**Validation:**
- `rating` must be `'thumbs_up'` or `'thumbs_down'`
- `comment` ≤ 1000 chars
- One feedback record per contract (UPSERT on conflict)

**Response 200:**
```json
{ "feedback_id": "uuid" }
```

---

## 10. Feature Breakdown

### Phase 1 — MVP (Weeks 1–11: v0.1 → v0.4)

#### US-001: User Authentication (P0)
- Email/password sign-up, sign-in, sign-out via Supabase Auth
- Session persistence via Supabase session tokens in browser
- Redirect to `/dashboard` on successful auth
- Protected routes: middleware checks session; unauthenticated → `/auth/signin`
- **Acceptance:** Auth flow completes within 10 seconds; invalid credentials return clear error

#### US-002: PDF Upload + Text Extraction (P0)
- Contract type selector (NDA / MSA) + drag-drop PDF area on `/upload`
- Client-side validation: file type, size ≤ 10 MB
- Server-side validation: page count ≤ 20, token count ≤ 15,000, word count ≥ 100
- `pdf-parse` extracts text with `[PAGE N]` markers (one-time, stored in DB)
- **Acceptance:** Upload accepted ≤ 10 MB; extraction completes within 30s P95 for ≤ 20 pages

#### US-003: Page Number Attribution (P0)
- Each `TermCard` displays "Page X" badge
- Clicking badge sets `targetPage` prop on `PdfViewer` / `TextViewerFallback`
- Both viewers scroll to and highlight the target page
- **Acceptance:** Each term shows page number; clicking navigates viewer

#### US-004: Confidence Score Display (P0)
- `ConfidenceIndicator` component: green (≥ 80%), amber (50–79%), red (< 50%)
- Red terms additionally show ⚠️ icon and non-dismissible tooltip
- Terms are always shown — never hidden due to low confidence
- **Acceptance:** All terms show confidence %; scores < 50% show warning icon + tooltip

#### US-005: Custom Key Term Addition (P0)
- "+ Add Key Term" button on pre-processing preview screen
- Input accepts term name; added terms shown with "Custom" badge
- Max 5 custom terms enforced with inline count indicator ("3 / 5 added")
- Custom terms passed to `/api/process-contract` and extracted with same JSON schema
- **Acceptance:** Custom terms appear in results with value, page, confidence; max 5 enforced

#### US-006: Inline PDF Viewer (P1)
- `PdfViewer` component uses `react-pdf` (PDF.js under the hood)
- PDF rendered from Supabase Storage signed URL (1-hour expiry)
- Lazy page loading for large files (renders visible pages first)
- If `file_path = null` (Storage unavailable): `TextViewerFallback` renders
- `TextViewerFallback` parses `[PAGE N]` markers; renders each page as a labelled section
- Both respond to `targetPage` prop from `KeyTermsPanel`
- **Acceptance:** PDF renders all pages; scroll + zoom work; page navigation from key terms panel works

#### US-007: Chat with Contract (P1)
- Chat tab/panel on `/contracts/[id]`
- User question → POST `/api/chat` → streamed or single response
- Response displayed with `[Page X]` citation as clickable link to PDF viewer
- System prompt strictly limits answers to document text
- **Acceptance:** Response within 15s; grounded in uploaded document; cites page number

#### US-008: Dashboard with Contract History (P1)
- `/dashboard` table: contract name, type (NDA/MSA), date uploaded, status chip
- Sortable by: date (default desc), name (alpha), type
- Clicking any row navigates to `/contracts/[id]`
- Empty state with CTA when no contracts exist
- **Acceptance:** All reviewed contracts displayed; sorting works; row click opens results

#### US-009: Inline Key Term Editing (P1)
- Click on term value in `TermCard` → `<input>` appears with current value pre-filled
- User edits → blur or Enter → PATCH `/api/terms/[id]`
- Save confirmed within 2 seconds; "Edited" badge appears
- Original AI value stored in `original_value`; shown in tooltip ("Original: ...")
- **Acceptance:** Edit saves within 2s; "Edited" badge shown; original AI value preserved

#### US-012: Persistent Chat History (P1)
- On page load: SWR fetches all `chat_messages` for the session
- Conversation rendered in chronological order (ascending)
- Full history passed to OpenAI on every turn (up to 200 messages)
- **Acceptance:** Reopening contract results page loads previous chat messages

---

### Phase 2 — Launch Hardening (Weeks 12–14: v1.0)

#### US-010: Feedback Submission (P2)
- Thumbs up / thumbs down button pair on results page
- Optional text comment field (max 1000 chars)
- POST `/api/feedback` → stored in `user_feedback`
- **Acceptance:** Rating + optional comment saved; one feedback per contract

#### Performance Optimization
- Target P95 extraction latency ≤ 30 seconds end-to-end
- PDF.js lazy page loading for faster initial render
- SWR stale-while-revalidate for instant dashboard loads

#### Security Audit
- RLS penetration test: attempt cross-user data access from test accounts
- Signed URL expiry validated (1-hour max)
- API key environment variable audit (no client-side exposure of `OPENAI_API_KEY`)
- Rate limiting verified (429 on excess)

#### WCAG 2.1 AA Review
- Contrast ratios for all text and badges
- Keyboard navigation for all interactive elements
- Screen reader testing for TermCard and ChatInterface

#### Onboarding Tooltips
- First-time user sees tooltips on: confidence indicator, "Why?" expander, page citation click, custom term input

---

### Phase 3 — Post-Launch Iteration (Weeks 15–24: v1.1–v1.2)

| Story | Feature | Target Release |
|---|---|---|
| US-011 | Export key terms to CSV and PDF summary | v1.1 |
| — | Batch contract upload (up to 5 contracts) | v1.1 |
| — | Dashboard analytics (charts: contracts by month, correction rate) | v1.1 |
| — | Scanned PDF support (AWS Textract OCR) | v1.2 |
| — | Contract comparison view (side-by-side key terms across 2 contracts) | v1.2 |
| — | Email notifications on processing completion | v1.2 |
| — | Multi-user workspace / team plans (up to 5 seats) | v1.2 |

---

## 11. Folder Structure

```
contractiq/                          # Project root
│
├── app/                             # Next.js 14 App Router
│   ├── layout.tsx                   # Root layout: AuthProvider + global styles
│   ├── page.tsx                     # Landing page (/)
│   │
│   ├── (auth)/                      # Route group: no shared auth layout needed
│   │   ├── signin/
│   │   │   └── page.tsx             # Sign-in form
│   │   └── signup/
│   │       └── page.tsx             # Sign-up form
│   │
│   ├── dashboard/
│   │   └── page.tsx                 # Contract history table + stats
│   │
│   ├── upload/
│   │   └── page.tsx                 # Upload screen + pre-processing preview
│   │
│   ├── contracts/
│   │   └── [id]/
│   │       ├── page.tsx             # Results: PDF viewer + key terms panel
│   │       └── chat/
│   │           └── page.tsx         # Chat interface (can also be a tab on results page)
│   │
│   └── api/                         # Next.js API Routes (serverless)
│       ├── upload-contract/
│       │   └── route.ts             # POST: PDF upload + text extraction
│       ├── process-contract/
│       │   └── route.ts             # POST: GPT-4o key term extraction
│       ├── chat/
│       │   └── route.ts             # POST: contract Q&A
│       ├── terms/
│       │   └── [id]/
│       │       └── route.ts         # PATCH: inline term edit
│       └── feedback/
│           └── route.ts             # POST: thumbs up/down feedback
│
├── components/
│   ├── ui/                          # Reusable primitives (Button, Badge, Input, Tooltip, Skeleton)
│   │
│   ├── auth/
│   │   └── AuthForm.tsx             # Shared sign-in/sign-up form (variant prop)
│   │
│   ├── pdf/
│   │   ├── PdfViewer.tsx            # PDF.js viewer (react-pdf); accepts targetPage prop
│   │   └── TextViewerFallback.tsx   # Parses [PAGE N] markers; renders pages as sections
│   │
│   ├── contract/
│   │   ├── KeyTermsPanel.tsx        # Right panel: list of TermCards
│   │   ├── TermCard.tsx             # Individual term: name, value, page, confidence, source
│   │   ├── ConfidenceIndicator.tsx  # Green/amber/red badge + ⚠️ tooltip
│   │   ├── CustomTermInput.tsx      # "+ Add Key Term" input on upload/preview screen
│   │   └── PreProcessingPreview.tsx # Card showing terms to be extracted; hosts CustomTermInput
│   │
│   ├── chat/
│   │   ├── ChatInterface.tsx        # Message list + input field
│   │   ├── UserMessage.tsx          # Right-aligned message bubble
│   │   └── AssistantMessage.tsx     # Left-aligned bubble with PageCitationLink
│   │
│   ├── dashboard/
│   │   ├── ContractHistoryTable.tsx # Sortable table of past contracts
│   │   ├── ContractRow.tsx          # Single table row
│   │   └── DashboardStats.tsx       # Total contracts + NDA/MSA breakdown
│   │
│   └── layout/
│       ├── Navbar.tsx               # Top nav: logo + auth controls
│       ├── LegalDisclaimer.tsx      # "Not legal advice" fixed footer on results page
│       └── ExtractionProgressBar.tsx # 3-step progress during processing
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser-side Supabase client (anon key)
│   │   └── server.ts                # Server-side client (service role key, for API routes)
│   │
│   ├── openai/
│   │   ├── extract.ts               # buildExtractionPrompt(), callExtraction(), parseExtractionResponse()
│   │   └── chat.ts                  # buildChatMessages(), callChat()
│   │
│   └── pdf/
│       └── parse.ts                 # parsePdf(): returns { text, pageCount, tokenCount }
│
├── hooks/
│   ├── useContractData.ts           # SWR hook: fetches contract + key_terms
│   ├── useChatSession.ts            # SWR hook: fetches chat_messages for a session
│   └── usePdfViewer.ts              # Local state: current page, zoom level
│
├── types/
│   └── index.ts                     # TypeScript types: Contract, KeyTerm, ChatMessage, UserFeedback
│
├── middleware.ts                    # Next.js Edge middleware: auth guard on /dashboard, /upload, /contracts/*
│
├── public/
│   └── pdf.worker.min.js            # PDF.js worker (copied from pdfjs-dist)
│
├── docs/
│   ├── ContractIQ_PRD.md
│   ├── design.md
│   └── engineering/
│       └── engineering-doc.md       # ← this file
│
├── supabase/
│   └── schema.sql                   # All tables, indexes, triggers, RLS, Storage bucket + policies
│
├── .env.example                     # All required environment variables
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 12. Naming Conventions

### Files and Folders

| Item | Convention | Example |
|---|---|---|
| Next.js pages | lowercase, co-located with route | `app/dashboard/page.tsx` |
| React components | PascalCase | `KeyTermsPanel.tsx` |
| Non-component files | camelCase | `parse.ts`, `extract.ts` |
| Route groups | `(group-name)` | `app/(auth)/` |
| Dynamic route segments | `[param]` | `app/contracts/[id]/` |
| API route files | `route.ts` (Next.js convention) | `app/api/chat/route.ts` |

### React Components

| Convention | Example |
|---|---|
| PascalCase for component name + file | `ConfidenceIndicator`, `ContractHistoryTable` |
| Named exports (not default) for components in `components/` | `export function TermCard(...)` |
| Default export only for page files | `export default function DashboardPage()` |
| Props type named `<ComponentName>Props` | `type TermCardProps = { ... }` |

### Hooks

| Convention | Example |
|---|---|
| `use` prefix, camelCase | `useContractData`, `usePdfViewer`, `useChatSession` |
| File named after hook | `hooks/useContractData.ts` |

### Services / Lib Functions

| Convention | Example |
|---|---|
| camelCase, verb-first for action functions | `buildExtractionPrompt()`, `parsePdf()`, `callChat()` |
| Grouped by domain in `lib/` subdirectories | `lib/openai/extract.ts`, `lib/pdf/parse.ts` |

### API Routes

| Convention | Example |
|---|---|
| kebab-case directory names under `/api/` | `api/upload-contract/`, `api/process-contract/` |
| HTTP method as export name | `export async function POST(req: Request)` |

### Database

| Item | Convention | Example |
|---|---|
| Tables | snake_case, plural | `key_terms`, `chat_sessions`, `user_feedback` |
| Columns | snake_case | `confidence_score`, `source_sentence`, `is_edited` |
| Indexes | `idx_{table}_{column(s)}` | `idx_key_terms_contract_id` |
| Policies | descriptive string | `"users_own_contracts"` |
| Foreign keys | `{referenced_table_singular}_id` | `contract_id`, `session_id` |

### Environment Variables

| Convention | Example |
|---|---|
| `NEXT_PUBLIC_` prefix for client-accessible vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| No prefix for server-only secrets | `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` |
| Screaming snake case | `NEXT_PUBLIC_SUPABASE_URL` |

**Full `.env.example`:**
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### TypeScript Types

| Convention | Example |
|---|---|
| PascalCase | `Contract`, `KeyTerm`, `ChatMessage` |
| Union types suffixed with `Type` when needed | `ContractStatusType = 'uploading' | 'ready' | ...` |
| Enum-like string unions preferred over enums | `type ContractType = 'nda' | 'msa'` |

---

## 13. Testing Strategy

### Unit Tests — Jest + React Testing Library

**Coverage target:** ≥ 80% line coverage on `lib/` and business-logic components

| Test target | What to test |
|---|---|
| `lib/pdf/parse.ts` | `parsePdf()`: `[PAGE N]` marker insertion; word count calculation; token count estimation; scanned PDF guard (< 100 words) |
| `lib/openai/extract.ts` | `buildExtractionPrompt()`: correct NDA vs MSA term list; custom terms appended; few-shot examples included. `parseExtractionResponse()`: valid JSON → array; malformed JSON → retry; missing fields → handled gracefully |
| `lib/openai/chat.ts` | `buildChatMessages()`: system prompt includes contract text; history ordered ascending; user message appended last |
| `components/contract/ConfidenceIndicator.tsx` | Renders green for ≥ 80; amber for 50–79; red + ⚠️ for < 50; tooltip text correct |
| `components/contract/TermCard.tsx` | Shows "Edited" badge when `is_edited = true`; inline edit input appears on click; calls PATCH on blur/Enter |
| `middleware.ts` | Unauthenticated requests to protected routes redirect to `/auth/signin` |

**Run command:** `npm test`

---

### Integration Tests — Jest + Supabase Local (via Supabase CLI)

**Coverage target:** All 5 API routes tested; RLS policies verified

| Test | Scenario |
|---|---|
| `POST /api/upload-contract` | Valid PDF → 200 + contract_id; oversized PDF → 422; scanned PDF → 422; unauthenticated → 401 |
| `POST /api/process-contract` | Valid contract_id → 200 + terms inserted into DB; already-processed contract → 422; OpenAI mock timeout → 503 |
| `POST /api/chat` | Valid question → 200 + grounded response; question about absent topic → response contains "cannot find"; unauthenticated → 401 |
| `PATCH /api/terms/[id]` | Valid edit → 200 + is_edited=true + original_value preserved; wrong user_id → 403 |
| `POST /api/feedback` | thumbs_up → 200; duplicate feedback → 200 (upsert); invalid rating → 400 |
| **RLS penetration test** | User A cannot SELECT/UPDATE/DELETE User B's contracts, key_terms, chat_messages, or feedback — verify 0 rows returned |

**Run command:** `npm run test:integration`

---

### E2E Tests — Playwright

**Coverage target:** 100% of critical user flows

| Test suite | Flow covered |
|---|---|
| `auth.spec.ts` | Sign-up → dashboard redirect; sign-in with valid creds; sign-in with invalid creds → error message; sign-out → redirect to `/` |
| `upload.spec.ts` | Upload valid NDA PDF → extraction progress → results page renders; upload oversized file → error banner; upload non-PDF → error banner |
| `results.spec.ts` | Key terms panel renders ≥ 10 terms; page badge click scrolls PDF viewer; "Why?" expander reveals source sentence; low-confidence term shows ⚠️ |
| `edit.spec.ts` | Click term value → edit input appears; type new value → blur → "Edited" badge appears; reload page → edited value persists |
| `chat.spec.ts` | Type question → response within 15s; response contains "[Page X]"; page citation click navigates PDF viewer; reload → prior messages persist |
| `dashboard.spec.ts` | Processed contract appears in dashboard list; sort by date works; click row → navigate to results |
| `hallucination.spec.ts` | Ask question about topic not in document → response contains "I cannot find this in the document" |
| `feedback.spec.ts` | Submit thumbs_up → confirmation shown; submit comment → stored; duplicate feedback → upsert (no error) |

**Run command:** `npm run test:e2e`

---

### AI Evaluation Suite (Offline)

Run against the 30-NDA + 20-MSA labelled test set before every release.

| Eval | Method | Target |
|---|---|---|
| Extraction F1 (NDA) | Precision/Recall on 30 labelled NDAs | ≥ 88% |
| Extraction F1 (MSA) | Precision/Recall on 20 labelled MSAs | ≥ 85% |
| Page number accuracy | % of terms where returned page matches ground truth | ≥ 92% |
| Custom term F1 | F1 on 10 custom terms across 15 test contracts | ≥ 80% |
| Confidence calibration | Predicted confidence vs. actual accuracy per 10% bucket | Error ≤ 0.10 |
| Chat groundedness | Expert review of 50 Q&A pairs: % hallucinated | ≤ 5% |
| End-to-end latency | P95 timing: upload submission → results rendered | ≤ 30s |

**Run command:** `npm run eval` (requires labelled test set in `eval/`)

---

## 14. Specs-to-Implementation Mapping

This table maps each user story and functional requirement to the exact implementation files. Use this as the authoritative reference when starting feature implementation.

| Story / FR | Feature | Files Involved | Flow |
|---|---|---|---|
| **US-001** | Email/password auth | `app/(auth)/signin/page.tsx`<br>`app/(auth)/signup/page.tsx`<br>`components/auth/AuthForm.tsx`<br>`lib/supabase/client.ts`<br>`middleware.ts` | Form → `supabase.auth.signIn/Up()` → session stored → middleware redirects |
| **US-002** | PDF upload + extraction | `app/upload/page.tsx`<br>`components/contract/PreProcessingPreview.tsx`<br>`app/api/upload-contract/route.ts`<br>`lib/pdf/parse.ts`<br>`lib/supabase/server.ts` | Drop PDF → validate → `parsePdf()` → INSERT contracts → Storage upload (non-blocking) |
| **US-003** | Page number attribution | `components/contract/TermCard.tsx`<br>`components/contract/KeyTermsPanel.tsx`<br>`components/pdf/PdfViewer.tsx`<br>`components/pdf/TextViewerFallback.tsx`<br>`hooks/usePdfViewer.ts` | TermCard badge click → `setTargetPage()` → PdfViewer / TextViewerFallback scroll |
| **US-004** | Confidence score display | `components/contract/ConfidenceIndicator.tsx`<br>`components/contract/TermCard.tsx` | `confidence_score` from DB → ConfidenceIndicator renders color + optional ⚠️ |
| **US-005** | Custom key term addition | `components/contract/CustomTermInput.tsx`<br>`components/contract/PreProcessingPreview.tsx`<br>`app/api/process-contract/route.ts`<br>`lib/openai/extract.ts` | User types term → appended to preview list → passed to `buildExtractionPrompt()` → extracted with same schema |
| **US-006** | Inline PDF viewer | `components/pdf/PdfViewer.tsx`<br>`components/pdf/TextViewerFallback.tsx`<br>`app/contracts/[id]/page.tsx`<br>`lib/supabase/server.ts` (signed URL) | `file_path` → signed URL → PdfViewer; if null → TextViewerFallback (parses contract_text) |
| **US-007** | Chat with contract | `app/contracts/[id]/chat/page.tsx`<br>`components/chat/ChatInterface.tsx`<br>`components/chat/AssistantMessage.tsx`<br>`app/api/chat/route.ts`<br>`lib/openai/chat.ts`<br>`hooks/useChatSession.ts` | Message → POST `/api/chat` → `buildChatMessages()` → GPT-4o → INSERT messages → render response |
| **US-008** | Dashboard + history | `app/dashboard/page.tsx`<br>`components/dashboard/ContractHistoryTable.tsx`<br>`components/dashboard/ContractRow.tsx`<br>`components/dashboard/DashboardStats.tsx`<br>`hooks/useContractData.ts` | SWR fetch contracts by user_id → render table sortable by date/name/type |
| **US-009** | Inline term editing | `components/contract/TermCard.tsx`<br>`app/api/terms/[id]/route.ts` | Click value → edit input → blur/Enter → PATCH `/api/terms/[id]` → `is_edited=true`, `original_value` preserved |
| **US-010** | Feedback submission | `app/contracts/[id]/page.tsx` (feedback section)<br>`app/api/feedback/route.ts` | Thumbs click → POST `/api/feedback` → INSERT/UPSERT user_feedback |
| **US-012** | Persistent chat history | `app/api/chat/route.ts`<br>`hooks/useChatSession.ts`<br>`components/chat/ChatInterface.tsx` | On load: SWR fetches all messages for session; on turn: INSERT user + assistant messages |
| **FR-03** | One-time text extraction | `app/api/upload-contract/route.ts`<br>`lib/pdf/parse.ts` | `parsePdf()` runs at upload; text stored in `contracts.contract_text`; extraction + chat routes read from DB |
| **FR-06** | Text viewer fallback | `components/pdf/TextViewerFallback.tsx`<br>`app/contracts/[id]/page.tsx` | If `file_path = null`: TextViewerFallback renders; parses `[PAGE N]` markers; supports same `targetPage` prop |
| **FR-11** | Low-confidence flagging | `components/contract/ConfidenceIndicator.tsx`<br>`components/contract/TermCard.tsx` | `confidence_score < 50` → red badge + ⚠️ + tooltip; term is never hidden |
| **FR-14** | Storage bucket via SQL | `supabase/schema.sql` | `INSERT INTO storage.buckets` + 3 `CREATE POLICY ON storage.objects`; must be run before first upload |

---

*End of Engineering Document — ContractIQ v1.0*  
*Next step: Review this document and approve to proceed to Stage 2 (Implementation Specs).*
