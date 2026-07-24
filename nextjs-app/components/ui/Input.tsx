import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-body-sm text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={[
          'rounded-md border px-3 py-3 text-body-lg text-text-primary placeholder:text-grey-300',
          'transition-colors duration-fast ease-out',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0',
          error ? 'border-red-500' : 'border-grey-100 focus:border-blue-500',
          className,
        ].join(' ')}
        {...props}
      />
      {error && (
        <span id={errorId} className="text-body-sm text-red-500">
          {error}
        </span>
      )}
    </div>
  )
})
