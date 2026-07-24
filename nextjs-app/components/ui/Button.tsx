import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-500 text-white border border-blue-500 hover:bg-blue-600 hover:border-blue-600 disabled:bg-grey-100 disabled:border-grey-100 disabled:text-grey-400',
  secondary:
    'bg-white text-text-primary border border-grey-200 hover:border-grey-300 hover:bg-grey-25 disabled:text-grey-400 disabled:border-grey-100',
  ghost:
    'bg-transparent text-text-primary border border-transparent hover:bg-grey-50 disabled:text-grey-400',
  destructive:
    'bg-red-500 text-white border border-red-500 hover:bg-red-600 hover:border-red-600 disabled:bg-grey-100 disabled:border-grey-100 disabled:text-grey-400',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-body-sm',
  md: 'px-4 py-3 text-body-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, disabled, className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors duration-fast ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
})
