export type ExtractionProgressBarProps = {
  currentStep: 1 | 2 | 3
}

const STEPS = [
  { step: 1, label: 'Extracting text' },
  { step: 2, label: 'Analysing with AI' },
  { step: 3, label: 'Compiling results' },
] as const

export function ExtractionProgressBar({ currentStep }: ExtractionProgressBarProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="flex w-full max-w-sm items-center">
        {STEPS.map(({ step, label }, index) => {
          const isComplete = step < currentStep
          const isActive = step === currentStep
          return (
            <div key={step} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={[
                    'flex h-6 w-6 items-center justify-center rounded-full border text-body-sm transition-colors duration-fast ease-out',
                    isComplete
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : isActive
                        ? 'border-blue-500 text-blue-500'
                        : 'border-grey-200 text-grey-300',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {isComplete ? '✓' : isActive ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  ) : (
                    step
                  )}
                </div>
                <span
                  className={[
                    'whitespace-nowrap text-body-sm',
                    isActive || isComplete ? 'text-text-primary' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={['mx-2 h-px flex-1', isComplete ? 'bg-blue-500' : 'bg-grey-200'].join(' ')}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>
      <p className="text-body-sm text-text-secondary">Usually under 30 seconds</p>
    </div>
  )
}
