'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Must come from react-pdf's own `pdfjs` export, not a standalone pdfjs-dist
// import — react-pdf bundles its own pinned pdfjs-dist version internally,
// and the worker build must match that exact version or PDF.js throws an
// API/Worker version mismatch error at runtime.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export type PdfViewerProps = {
  signedUrl: string
  targetPage: number
  pageCount: number
  onPageChange: (page: number) => void
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.25

type LazyPageProps = {
  pageNumber: number
  scale: number
  registerRef: (pageNumber: number, el: HTMLDivElement | null) => void
}

function LazyPage({ pageNumber, scale, registerRef }: LazyPageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(pageNumber === 1)

  useEffect(() => {
    if (isVisible) return
    const node = wrapperRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '800px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isVisible])

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el
        registerRef(pageNumber, el)
      }}
      className="flex justify-center transition-shadow duration-150 ease-out"
    >
      {isVisible ? (
        <Page
          pageNumber={pageNumber}
          scale={scale}
          className="overflow-hidden rounded-lg border border-grey-100 bg-white"
        />
      ) : (
        <div className="aspect-[8.5/11] w-full max-w-[612px] rounded-lg border border-grey-100 bg-grey-50" />
      )}
    </div>
  )
}

export function PdfViewer({ signedUrl, targetPage, pageCount, onPageChange }: PdfViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [loadError, setLoadError] = useState(false)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  function registerRef(pageNumber: number, el: HTMLDivElement | null) {
    if (el) pageRefs.current.set(pageNumber, el)
    else pageRefs.current.delete(pageNumber)
  }

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
      onPageChange(Math.min(targetPage + 1, pageCount))
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      onPageChange(Math.max(targetPage - 1, 1))
    }
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-body-sm text-text-secondary">
        Couldn&apos;t load the PDF. Try refreshing the page.
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col bg-bg-surface">
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="PDF viewer"
        className="flex-1 overflow-y-auto p-6 focus:outline-none"
      >
        <Document
          file={signedUrl}
          onLoadError={() => setLoadError(true)}
          loading={<p className="text-center text-body-sm text-text-secondary">Loading PDF…</p>}
          className="flex flex-col gap-4"
        >
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <LazyPage key={pageNumber} pageNumber={pageNumber} scale={zoom} registerRef={registerRef} />
          ))}
        </Document>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-md border border-grey-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-text-primary hover:bg-grey-50"
        >
          −
        </button>
        <span className="min-w-[3rem] text-center text-body-sm text-text-secondary">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-text-primary hover:bg-grey-50"
        >
          +
        </button>
      </div>
    </div>
  )
}
