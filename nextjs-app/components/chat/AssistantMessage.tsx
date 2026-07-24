export type AssistantMessageProps = {
  content: string
  onCitationClick: (page: number) => void
}

const CITATION_PATTERN = /(\[Page \d+\])/g
const CITATION_MATCH = /^\[Page (\d+)\]$/

export function AssistantMessage({ content, onCitationClick }: AssistantMessageProps) {
  const parts = content.split(CITATION_PATTERN)

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] whitespace-pre-wrap rounded-[12px_12px_12px_4px] bg-grey-50 px-3 py-2 text-body-lg text-text-primary">
        {parts.map((part, index) => {
          const match = part.match(CITATION_MATCH)
          if (!match) {
            return <span key={index}>{part}</span>
          }
          const page = Number(match[1])
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
        })}
      </div>
    </div>
  )
}
