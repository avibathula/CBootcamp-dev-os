'use client'

import { useState } from 'react'

export function usePdfViewer() {
  const [targetPage, setTargetPage] = useState(1)
  const [zoom, setZoom] = useState(1)

  return { targetPage, setTargetPage, zoom, setZoom }
}
