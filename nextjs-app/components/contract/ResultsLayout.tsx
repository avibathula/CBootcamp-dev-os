'use client'

import { useState } from 'react'
import { usePdfViewer } from '@/hooks/usePdfViewer'
import { PdfViewerPanel } from './PdfViewerPanel'
import { KeyTermsPanel } from './KeyTermsPanel'
import { FeedbackControl } from './FeedbackControl'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { Navbar } from '@/components/layout/Navbar'
import { LegalDisclaimer } from '@/components/layout/LegalDisclaimer'
import type { Contract, UserFeedback } from '@/types'

export type ResultsLayoutProps = {
  contract: Contract
  signedUrl: string | null
  existingFeedback: UserFeedback | null
}

export function ResultsLayout({ contract, signedUrl, existingFeedback }: ResultsLayoutProps) {
  const { targetPage, setTargetPage } = usePdfViewer()
  const [isChatOpen, setIsChatOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[60%_40%]">
        <div className="min-h-0 border-b border-grey-100 lg:border-b-0 lg:border-r">
          <PdfViewerPanel
            signedUrl={signedUrl}
            contractText={contract.contract_text}
            targetPage={targetPage}
            pageCount={contract.page_count}
            onPageChange={setTargetPage}
          />
        </div>
        <div className="min-h-0">
          <KeyTermsPanel contractId={contract.id} onPageClick={setTargetPage} />
        </div>
      </div>
      <FeedbackControl contractId={contract.id} existingFeedback={existingFeedback} />
      <LegalDisclaimer />

      {isChatOpen && (
        <div className="fixed bottom-24 right-6 z-20 flex h-[500px] w-[400px] max-w-[calc(100vw-48px)] flex-col rounded-xl border-2 border-grey-200 bg-white">
          <div className="flex items-center justify-between border-b border-grey-100 px-4 py-3">
            <p className="text-body-lg font-medium text-text-primary">Chat</p>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              aria-label="Close chat"
              className="text-body-lg text-text-secondary hover:text-text-primary"
            >
              ×
            </button>
          </div>
          <ChatInterface contractId={contract.id} onCitationClick={setTargetPage} />
        </div>
      )}

      {!isChatOpen && (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-16 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 border-blue-600 bg-blue-500 text-h5 text-white transition-colors duration-fast ease-out hover:bg-blue-600"
        >
          💬
        </button>
      )}
    </div>
  )
}
