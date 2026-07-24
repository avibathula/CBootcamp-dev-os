'use client'

import dynamic from 'next/dynamic'
import { TextViewerFallback } from '@/components/pdf/TextViewerFallback'

// react-pdf/pdfjs-dist is browser-only (canvas, Worker, DOMMatrix) and its
// legacy build breaks under webpack's SSR bundling (same class of issue as
// pdf-parse in the upload route). Deferring it out of the SSR pass with
// next/dynamic avoids the crash and keeps the large pdfjs bundle out of the
// initial server-rendered HTML.
const PdfViewer = dynamic(() => import('@/components/pdf/PdfViewer').then((mod) => mod.PdfViewer), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-body-sm text-text-secondary">
      Loading PDF viewer…
    </p>
  ),
})

export type PdfViewerPanelProps = {
  signedUrl: string | null
  contractText: string
  targetPage: number
  pageCount: number
  onPageChange: (page: number) => void
}

// Silent fallback when Storage is unavailable (docs/specs/04 §4.5) — no
// error is surfaced to the user, the text viewer is a fully equivalent view.
export function PdfViewerPanel({
  signedUrl,
  contractText,
  targetPage,
  pageCount,
  onPageChange,
}: PdfViewerPanelProps) {
  return signedUrl ? (
    <PdfViewer signedUrl={signedUrl} targetPage={targetPage} pageCount={pageCount} onPageChange={onPageChange} />
  ) : (
    <TextViewerFallback contractText={contractText} targetPage={targetPage} onPageChange={onPageChange} />
  )
}
