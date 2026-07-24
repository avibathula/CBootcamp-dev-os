import { render, screen } from '@testing-library/react'
import { ConfidenceIndicator } from '@/components/contract/ConfidenceIndicator'

describe('ConfidenceIndicator', () => {
  it('renders a high-confidence score without a warning icon', () => {
    render(<ConfidenceIndicator score={95} />)
    expect(screen.getByLabelText('Confidence: 95%')).toBeInTheDocument()
    expect(screen.queryByText('⚠️')).not.toBeInTheDocument()
  })

  it('renders a medium-confidence score (50-79) without a warning icon', () => {
    render(<ConfidenceIndicator score={65} />)
    expect(screen.getByLabelText('Confidence: 65%')).toBeInTheDocument()
    expect(screen.queryByText('⚠️')).not.toBeInTheDocument()
  })

  it('renders a low-confidence score (<50) with a warning icon and tooltip', () => {
    render(<ConfidenceIndicator score={30} />)
    expect(screen.getByLabelText('Confidence: 30% — Low confidence: verify manually')).toBeInTheDocument()
    expect(screen.getByText('⚠️')).toBeInTheDocument()
    expect(screen.getByText('Low confidence — verify this in the document directly')).toBeInTheDocument()
  })

  it('treats exactly 80 as high and exactly 50 as medium (boundary values)', () => {
    const { rerender } = render(<ConfidenceIndicator score={80} />)
    expect(screen.queryByText('⚠️')).not.toBeInTheDocument()

    rerender(<ConfidenceIndicator score={50} />)
    expect(screen.queryByText('⚠️')).not.toBeInTheDocument()

    rerender(<ConfidenceIndicator score={49} />)
    expect(screen.getByText('⚠️')).toBeInTheDocument()
  })

  it('rounds fractional scores for display', () => {
    render(<ConfidenceIndicator score={87.5} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })
})
