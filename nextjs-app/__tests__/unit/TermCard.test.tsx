import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TermCard } from '@/components/contract/TermCard'
import type { KeyTerm } from '@/types'

function makeTerm(overrides: Partial<KeyTerm> = {}): KeyTerm {
  return {
    id: 'term-1',
    contract_id: 'contract-1',
    user_id: 'user-1',
    term_name: 'Governing Law',
    value: 'State of Delaware',
    original_value: 'State of Delaware',
    page_number: 2,
    confidence_score: 92,
    source_sentence: 'This agreement is governed by the laws of Delaware.',
    is_custom: false,
    is_edited: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('TermCard', () => {
  it('renders the term name, value, page badge, and confidence', () => {
    render(<TermCard term={makeTerm()} onPageClick={jest.fn()} onSave={jest.fn()} />)

    expect(screen.getByText('Governing Law')).toBeInTheDocument()
    expect(screen.getByText('State of Delaware')).toBeInTheDocument()
    expect(screen.getByText('Page 2')).toBeInTheDocument()
  })

  it('does not show an "Edited" badge when is_edited is false', () => {
    render(<TermCard term={makeTerm({ is_edited: false })} onPageClick={jest.fn()} onSave={jest.fn()} />)
    expect(screen.queryByText('Edited')).not.toBeInTheDocument()
  })

  it('shows an "Edited" badge when is_edited is true', () => {
    render(
      <TermCard
        term={makeTerm({ is_edited: true, value: 'Delaware (edited)', original_value: 'State of Delaware' })}
        onPageClick={jest.fn()}
        onSave={jest.fn()}
      />
    )
    expect(screen.getByText('Edited')).toBeInTheDocument()
  })

  it('calls onPageClick with the page number when the page badge is clicked', async () => {
    const onPageClick = jest.fn()
    const user = userEvent.setup()
    render(<TermCard term={makeTerm({ page_number: 5 })} onPageClick={onPageClick} onSave={jest.fn()} />)

    await user.click(screen.getByText('Page 5'))
    expect(onPageClick).toHaveBeenCalledWith(5)
  })

  it('does not render a page badge when page_number is null', () => {
    render(<TermCard term={makeTerm({ page_number: null })} onPageClick={jest.fn()} onSave={jest.fn()} />)
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument()
  })

  it('enters edit mode on click and calls onSave with the new value on blur', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TermCard term={makeTerm()} onPageClick={jest.fn()} onSave={onSave} />)

    await user.click(screen.getByText('State of Delaware'))
    const input = screen.getByDisplayValue('State of Delaware')
    await user.clear(input)
    await user.type(input, 'State of California')
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('term-1', 'State of California')
    })
  })

  it('does not call onSave when the value is unchanged', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TermCard term={makeTerm()} onPageClick={jest.fn()} onSave={onSave} />)

    await user.click(screen.getByText('State of Delaware'))
    const input = screen.getByDisplayValue('State of Delaware')
    fireEvent.blur(input)

    expect(onSave).not.toHaveBeenCalled()
  })

  it('reverts to the previous value without saving on Escape', async () => {
    const onSave = jest.fn()
    const user = userEvent.setup()
    render(<TermCard term={makeTerm()} onPageClick={jest.fn()} onSave={onSave} />)

    await user.click(screen.getByText('State of Delaware'))
    const input = screen.getByDisplayValue('State of Delaware')
    await user.clear(input)
    await user.type(input, 'Something else')
    await user.keyboard('{Escape}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('State of Delaware')).toBeInTheDocument()
  })

  it('shows the "Why?" expander only when source_sentence is present, and toggles it', async () => {
    const user = userEvent.setup()
    render(<TermCard term={makeTerm()} onPageClick={jest.fn()} onSave={jest.fn()} />)

    expect(screen.queryByText(/governed by the laws of Delaware/)).not.toBeInTheDocument()
    await user.click(screen.getByText(/Why\?/))
    expect(screen.getByText(/governed by the laws of Delaware/)).toBeInTheDocument()
  })

  it('does not render the "Why?" expander when source_sentence is null', () => {
    render(<TermCard term={makeTerm({ source_sentence: null })} onPageClick={jest.fn()} onSave={jest.fn()} />)
    expect(screen.queryByText(/Why\?/)).not.toBeInTheDocument()
  })

  it('shows "Not found" for a null value', () => {
    render(<TermCard term={makeTerm({ value: null })} onPageClick={jest.fn()} onSave={jest.fn()} />)
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })
})
