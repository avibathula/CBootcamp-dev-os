// Domain types mirroring docs/specs/supabase-schema.sql. Keep in sync with the schema.

export type ContractType = 'nda' | 'msa'

export type ContractStatus = 'uploading' | 'ready' | 'processing' | 'complete' | 'error'

export type Contract = {
  id: string
  user_id: string
  file_name: string
  file_path: string | null
  contract_type: ContractType
  contract_text: string
  status: ContractStatus
  page_count: number
  token_count: number | null
  created_at: string
  updated_at: string
}

export type ContractSummary = Pick<
  Contract,
  'id' | 'file_name' | 'contract_type' | 'status' | 'created_at'
>

export type KeyTerm = {
  id: string
  contract_id: string
  user_id: string
  term_name: string
  value: string | null
  original_value: string | null
  page_number: number | null
  confidence_score: number
  source_sentence: string | null
  is_custom: boolean
  is_edited: boolean
  created_at: string
  updated_at: string
}

export type CustomKeyTerm = {
  id: string
  contract_id: string
  user_id: string
  term_name: string
  is_manual: boolean
  created_at: string
}

export type ChatSession = {
  id: string
  contract_id: string
  user_id: string
  created_at: string
}

export type ChatRole = 'user' | 'assistant'

// Query classification for the conversation memory layer (docs/specs/06 §4).
// 'contract': contract text + last 10 turns. 'history': conversation only, no
// contract text, up to 20 turns. 'both': contract text + last 10 turns, with
// per-fact source attribution. Ambiguous queries fall back to 'both'.
export type QueryClassification = 'contract' | 'history' | 'both'

export type ChatMessage = {
  id: string
  session_id: string
  user_id: string
  role: ChatRole
  content: string
  // Set on assistant messages only — null for user messages.
  source_type: QueryClassification | null
  created_at: string
}

export type FeedbackRating = 'thumbs_up' | 'thumbs_down'

export type UserFeedback = {
  id: string
  contract_id: string
  user_id: string
  rating: FeedbackRating
  comment: string | null
  created_at: string
}

// -- API contracts -----------------------------------------------------------

export type ApiError = { error: string }

export type UploadContractResponse = {
  contract_id: string
  standard_terms: string[]
  page_count: number
}

export type ProcessContractRequest = {
  contract_id: string
  custom_terms: string[]
}

export type ProcessContractResponse = {
  contract_id: string
  terms_count: number
}

export type ChatRequest = {
  contract_id: string
  message: string
}

export type ChatResponse = {
  message: string
  session_id: string
  source_type: QueryClassification
}

export type UpdateTermRequest = {
  value: string
}

export type UpdateTermResponse = {
  id: string
  value: string
  is_edited: boolean
  original_value: string | null
}

export type SubmitFeedbackRequest = {
  contract_id: string
  rating: FeedbackRating
  comment?: string
}

export type SubmitFeedbackResponse = {
  feedback_id: string
}

// -- AI extraction shapes (lib/openai/extract.ts) -----------------------------

export type ExtractionTerm = {
  term_name: string
  value: string | null
  page_number: number | null
  confidence_score: number
  source_sentence: string | null
}

export type ExtractionOutput = {
  terms: ExtractionTerm[]
}
