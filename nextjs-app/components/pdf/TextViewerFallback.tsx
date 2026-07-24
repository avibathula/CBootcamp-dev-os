'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent } from 'react'

export type TextViewerFallbackProps = {
  contractText: string
  targetPage: number
  onPageChange: (page: number) => void
}

type ParsedPage = { pageNumber: number; text: string }

function parsePages(contractText: string): ParsedPage[] {
  const parts = contractText.split(/\n\[PAGE (\d+)\]\n/)
  const pages: ParsedPage[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const pageNumber = Number(parts[i])
    pages.push({ pageNumber, text: (parts[i + 1] ?? '').trim() })
  }
  return pages
}

export function TextViewerFallback({ contractText, targetPage, onPageChange }: TextViewerFallbackProps) {
  const pages = useMemo(() => parsePages(contractText), [contractText])
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const el = pageRefs.current.get(targetPage)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('ring-2', 'ring-blue-500')
    const timeout = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 1500)
    return () => clearTimeout(timeout)
  }, [targetPage])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'PageDown') {
      event.preventDefault()
      onPageChange(Math.min(targetPage + 1, pages.length || 1))
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      onPageChange(Math.max(targetPage - 1, 1))
    }
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Contract text viewer"
      className="flex h-full flex-col gap-6 overflow-y-auto bg-bg-surface p-6 focus:outline-none"
    >
      {pages.map((page) => (
        <section
          key={page.pageNumber}
          ref={(el) => {
            if (el) pageRefs.current.set(page.pageNumber, el)
          }}
          className="rounded-lg border border-grey-100 bg-white p-6 transition-shadow duration-150 ease-out"
        >
          <p className="mb-3 text-body-sm text-text-secondary">Page {page.pageNumber}</p>
          <p className="whitespace-pre-wrap text-body-lg text-text-primary">{page.text}</p>
        </section>
      ))}
    </div>
  )
}
