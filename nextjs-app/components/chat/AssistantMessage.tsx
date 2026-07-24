import { Badge } from '@/components/ui/Badge'
import type { QueryClassification } from '@/types'

export type AssistantMessageProps = {
  content: string
  sourceType: QueryClassification | null
  onCitationClick: (page: number) => void
}

const TAG_PATTERN = /(\[Page \d+\]|\[From conversation\])/g
const PAGE_CITATION = /^\[Page (\d+)\]$/
const CONVERSATION_TAG = '[From conversation]'

const SOURCE_BADGE: Record<QueryClassification, { label: string; color: 'blue' | 'violet' | 'grey' }> = {
  contract: { label: 'Contract', color: 'blue' },
  history: { label: 'Conversation', color: 'violet' },
  both: { label: 'Contract + Conversation', color: 'grey' },
}

export function AssistantMessage({ content, sourceType, onCitationClick }: AssistantMessageProps) {
  const parts = content.split(TAG_PATTERN)

  return (
    <div data-testid="assistant-message" data-source-type={sourceType ?? undefined} className="flex flex-col items-start gap-1">
      {sourceType && (
        <Badge color={SOURCE_BADGE[sourceType].color} className="text-body-sm">
          {SOURCE_BADGE[sourceType].label}
        </Badge>
      )}
      <div className="max-w-[75%] whitespace-pre-wrap rounded-[12px_12px_12px_4px] bg-grey-50 px-3 py-2 text-body-lg text-text-primary">
        {parts.map((part, index) => {
          const pageMatch = part.match(PAGE_CITATION)
          if (pageMatch) {
            const page = Number(pageMatch[1])
            return (
              <button
                key={index}
                type="button"
                onClick={() => onCitationClick(page)}
                className="font-medium text-blue-500 underline transition-colors duration-fast ease-out hover:text-blue-700"
              >
                {part}
              </button>
            )
          }
          if (part === CONVERSATION_TAG) {
            return (
              <span key={index} className="font-medium text-violet-700">
                {part}
              </span>
            )
          }
          return <span key={index}>{part}</span>
        })}
      </div>
    </div>
  )
}
