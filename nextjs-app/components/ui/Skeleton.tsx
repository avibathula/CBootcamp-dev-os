export type SkeletonProps = {
  className?: string
  'aria-label'?: string
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={['block animate-pulse rounded-sm bg-grey-100', className].join(' ')}
      {...props}
    />
  )
}
