/**
 * Visualizador de PDF com navegação de páginas e busca.
 * Responsivo e sem impressão/download.
 * pdfjs-dist é carregado dinamicamente para evitar erros com webpack/Next.js.
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Search, Loader2, ZoomIn, ZoomOut } from 'lucide-react'

interface PdfViewerProps {
  url: string
  totalPaginas?: number
  onClose?: () => void
}

export default function PdfViewer({ url, totalPaginas: totalFromBook, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<{ destroy: () => void } | null>(null)
  const [pdf, setPdf] = useState<{ getPage: (n: number) => Promise<unknown>; numPages: number } | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goToInput, setGoToInput] = useState('')
  const [autoScale, setAutoScale] = useState(1.5)
  const [manualScale, setManualScale] = useState<number | null>(null)
  const scale = manualScale ?? autoScale

  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 3
  const ZOOM_STEP = 0.25

  const handleZoomIn = () => {
    setManualScale((s) => Math.min(ZOOM_MAX, (s ?? autoScale) + ZOOM_STEP))
  }
  const handleZoomOut = () => {
    setManualScale((s) => Math.max(ZOOM_MIN, (s ?? autoScale) - ZOOM_STEP))
  }
  const handleZoomReset = () => {
    setManualScale(null)
  }

  const renderPage = useCallback(
    async (pageNum: number, pdfDoc: { getPage: (n: number) => Promise<unknown> }) => {
      if (!canvasRef.current) return
      try {
        const page = (await pdfDoc.getPage(pageNum)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number }
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
        }
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport }).promise
      } catch (err) {
        console.error('Erro ao renderizar página:', err)
      }
    },
    [scale]
  )

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const loadPdf = async () => {
      try {
        // Carregar pdfjs-dist dinamicamente (evita erro com webpack)
        const pdfjsLib = await import('pdfjs-dist')
        if (typeof window !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        }

        const response = await fetch(url, { credentials: 'include' })
        if (!response.ok) throw new Error('Erro ao carregar PDF')
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const doc = await loadingTask.promise
        if (cancelled) {
          doc.destroy()
          return
        }
        pdfRef.current = doc
        setPdf(doc)
        setNumPages(doc.numPages)
        setCurrentPage(1)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar PDF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPdf()
    return () => {
      cancelled = true
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [url])

  useEffect(() => {
    if (pdf && currentPage >= 1 && currentPage <= numPages) {
      renderPage(currentPage, pdf)
    }
  }, [pdf, currentPage, numPages, renderPage])

  // Escala automática conforme largura (usada quando manualScale é null)
  useEffect(() => {
    const updateAutoScale = () => {
      const w = containerRef.current?.clientWidth ?? window.innerWidth
      if (w < 400) setAutoScale(1)
      else if (w < 640) setAutoScale(1.2)
      else if (w < 768) setAutoScale(1.3)
      else setAutoScale(1.5)
    }
    updateAutoScale()
    const ro = new ResizeObserver(updateAutoScale)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', updateAutoScale)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateAutoScale)
    }
  }, [])

  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, numPages))
    setCurrentPage(p)
    setGoToInput('')
  }

  const handleGoToSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(goToInput, 10)
    if (!isNaN(n)) goToPage(n)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px]">
        <Loader2 className="w-10 h-10 animate-spin text-brand-orange" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px] text-red-600">
        {error}
      </div>
    )
  }

  if (!pdf || numPages === 0) {
    return null
  }

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 w-full">
      {/* Barra de navegação - fixa no topo, responsiva */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-100 border-b border-gray-200 shrink-0">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Próxima página"
        >
          <ChevronRight className="w-5 h-5 text-gray-700" />
        </button>

        <span className="text-sm text-gray-600 shrink-0">
          Página{' '}
          <strong>
            {currentPage} de {numPages}
          </strong>
        </span>

        <form onSubmit={handleGoToSubmit} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-500 shrink-0 hidden sm:block" />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={numPages}
            value={goToInput}
            onChange={(e) => setGoToInput(e.target.value)}
            placeholder="Ir para página..."
            className="w-24 sm:w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange"
          />
          <button
            type="submit"
            className="px-2 sm:px-3 py-1.5 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange/90 shrink-0"
          >
            Ir
          </button>
        </form>

        {/* Zoom */}
        <div className="flex items-center gap-1 border-l border-gray-300 pl-2 sm:pl-3 ml-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= ZOOM_MIN}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-5 h-5 text-gray-700" />
          </button>
          <span className="min-w-[3rem] text-center text-sm text-gray-600" title="Zoom">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= ZOOM_MAX}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-5 h-5 text-gray-700" />
          </button>
          {manualScale !== null && (
            <button
              type="button"
              onClick={handleZoomReset}
              className="px-2 py-1 text-xs text-gray-600 hover:text-brand-orange border border-gray-200 rounded-lg hover:border-brand-orange/50"
              title="Ajustar à tela"
            >
              Ajustar
            </button>
          )}
        </div>
      </div>

      {/* Área do PDF - scrollável; canvas centralizado (horizontal e vertical) */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 bg-gray-200 min-h-0">
        <div className="flex items-center justify-center min-h-full min-w-full">
          <canvas
            ref={canvasRef}
            className="shadow-lg rounded bg-white block"
          />
        </div>
      </div>
    </div>
  )
}
