export type UserMessageProps = {
  content: string
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-blue-500 px-3 py-2 text-body-lg text-white">
        {content}
      </div>
    </div>
  )
}
