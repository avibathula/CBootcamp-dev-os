import { useId } from 'react'
import type { ReactNode } from 'react'

export type TooltipProps = {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom'
}

/**
 * Hover/focus-triggered tooltip with no dismiss control — appropriate for
 * the low-confidence warning (docs/specs/05) which must always be
 * reachable, never closed away, while still not cluttering the layout
 * until the user hovers or tabs to it.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const tooltipId = useId()

  return (
    <span className="group/tooltip relative inline-flex">
      <span aria-describedby={tooltipId} tabIndex={0} className="inline-flex focus:outline-none">
        {children}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className={[
          'pointer-events-none absolute left-1/2 z-10 w-max max-w-[240px] -translate-x-1/2 rounded-sm bg-grey-900 px-2 py-1 text-body-sm text-white opacity-0',
          'transition-opacity duration-150 ease-out',
          'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  )
}
