import type { ReactNode } from 'react'

export type BadgeColor = 'grey' | 'blue' | 'green' | 'red' | 'yellow' | 'violet'

export type BadgeProps = {
  color?: BadgeColor
  children: ReactNode
  icon?: ReactNode
  className?: string
}

// Semantic Status Badge pattern (docs/design.md): bg {color}-50, border {color}-200/500, text {color}-700
const COLOR_CLASSES: Record<BadgeColor, string> = {
  grey: 'bg-grey-50 border-grey-200 text-grey-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-red-50 border-red-500 text-red-700',
  yellow: 'bg-yellow-50 border-yellow-500 text-yellow-800',
  violet: 'bg-violet-50 border-violet-500 text-violet-700',
}

export function Badge({ color = 'grey', children, icon, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-body-sm font-medium',
        COLOR_CLASSES[color],
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  )
}
