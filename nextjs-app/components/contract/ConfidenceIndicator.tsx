import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

export type ConfidenceIndicatorProps = {
  score: number
}

export function ConfidenceIndicator({ score }: ConfidenceIndicatorProps) {
  const rounded = Math.round(score)
  const tier = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
  const color = tier === 'high' ? 'green' : tier === 'medium' ? 'yellow' : 'red'
  const ariaLabel =
    tier === 'low' ? `Confidence: ${rounded}% — Low confidence: verify manually` : `Confidence: ${rounded}%`

  const badge = (
    <Badge color={color} icon={tier === 'low' ? <span aria-hidden="true">⚠️</span> : undefined}>
      <span aria-label={ariaLabel}>{rounded}%</span>
    </Badge>
  )

  if (tier !== 'low') {
    return badge
  }

  return <Tooltip content="Low confidence — verify this in the document directly">{badge}</Tooltip>
}
