/**
 * Dashboard Aluno – Material (livros liberados para o aluno)
 * Visualização apenas – sem impressão nem download.
 * Visualizador com busca de página e responsivo para celular.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  BookOpen,
  Loader2,
  X,
  AlertCircle,
  Headphones,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'

const PdfViewer = dynamic(() => import('@/components/aluno/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center min-h-[200px]">
      <Loader2 className="w-10 h-10 animate-spin text-brand-orange" />
    </div>
  ),
})

interface Book {
  id: string
  nome: string
  level: string
  totalPaginas: number
  capaPath: string | null
  pdfPath: string | null
  /** Total de faixas de áudio cadastradas no livro */
  audioTotal?: number
  /** Quantas faixas o aluno já ouviu até o fim */
  audioListened?: number
}

interface BookAudioMeta {
  id: string
  chapterTitle: string
  pageStart: number
  pageEnd: number
  listened?: boolean
}

export default function MaterialPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingBook, setViewingBook] = useState<Book | null>(null)
  const [viewingBookAudios, setViewingBookAudios] = useState<BookAudioMeta[]>([])
  const [viewingAudiosLoading, setViewingAudiosLoading] = useState(false)
  /** Página atual do PDF (sincronizada com PdfViewer) para filtrar áudios por faixa. */
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)

  const [audiosModalBook, setAudiosModalBook] = useState<Book | null>(null)
  const [audiosModalList, setAudiosModalList] = useState<BookAudioMeta[]>([])
  const [audiosModalLoading, setAudiosModalLoading] = useState(false)
  /** No celular o painel de áudio começa recolhido para dar espaço ao PDF. */
  const [audioStripOpen, setAudioStripOpen] = useState(true)

  const loadBooks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/student/books', { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar livros')
        return
      }
      setBooks(json.data?.books ?? [])
    } catch {
      setError('Erro ao conectar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  /** Atualiza contadores no modal de áudios quando a lista de livros recarrega (ex.: após marcar ouvido). */
  useEffect(() => {
    if (!audiosModalBook) return
    const b = books.find((x) => x.id === audiosModalBook.id)
    if (b) setAudiosModalBook(b)
  }, [books, audiosModalBook?.id])

  const handleOpenBook = (book: Book) => {
    if (!book.pdfPath) {
      setError('Este livro não possui PDF disponível.')
      return
    }
    setViewingBook(book)
  }

  useEffect(() => {
    if (!viewingBook) return
    const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null
    setAudioStripOpen(!mq?.matches)
  }, [viewingBook?.id])

  const handleCloseBook = () => {
    setViewingBook(null)
    setViewingBookAudios([])
    setPdfCurrentPage(1)
  }

  const handlePdfPageChange = useCallback((page: number) => {
    setPdfCurrentPage(page)
  }, [])

  const openAudiosModal = useCallback((book: Book) => {
    setAudiosModalBook(book)
    setAudiosModalList([])
    setAudiosModalLoading(true)
    fetch(`/api/student/books/${book.id}/audios`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data?.audios)) {
          setAudiosModalList(j.data.audios)
        } else {
          setAudiosModalList([])
        }
      })
      .catch(() => setAudiosModalList([]))
      .finally(() => setAudiosModalLoading(false))
  }, [])

  const closeAudiosModal = useCallback(() => {
    setAudiosModalBook(null)
    setAudiosModalList([])
  }, [])

  const markAudioListened = useCallback(
    async (bookId: string, audioId: string) => {
      try {
        const res = await fetch(`/api/student/books/${bookId}/audios/${audioId}/listen`, {
          method: 'POST',
          credentials: 'include',
        })
        const j = await res.json()
        if (!res.ok || !j.ok) return
        setAudiosModalList((prev) =>
          prev.map((a) => (a.id === audioId ? { ...a, listened: true } : a))
        )
        loadBooks()
      } catch {
        /* ignore */
      }
    },
    [loadBooks]
  )

  useEffect(() => {
    if (!viewingBook) {
      setViewingBookAudios([])
      return
    }
    setViewingAudiosLoading(true)
    fetch(`/api/student/books/${viewingBook.id}/audios`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data?.audios)) {
          setViewingBookAudios(j.data.audios)
        } else {
          setViewingBookAudios([])
        }
      })
      .catch(() => setViewingBookAudios([]))
      .finally(() => setViewingAudiosLoading(false))
  }, [viewingBook?.id])

  useEffect(() => {
    if (viewingBook) setPdfCurrentPage(1)
  }, [viewingBook?.id])

  const audiosForCurrentPdfPage = useMemo(() => {
    return viewingBookAudios.filter(
      (a) => pdfCurrentPage >= a.pageStart && pdfCurrentPage <= a.pageEnd
    )
  }, [viewingBookAudios, pdfCurrentPage])

  /** URL estável por livro: não usar Date.now() a cada render — isso recarregava o PDF ao mudar de página (onPageChange). */
  const pdfUrl = useMemo(
    () => (viewingBook ? `/api/student/books/${viewingBook.id}/pdf` : ''),
    [viewingBook?.id]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-brand-orange" />
          Material
        </h1>
        <p className="text-gray-600 mt-1">
          Livros liberados para você. Apenas visualização online – impressão e download desabilitados.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      )}

      {!loading && !error && books.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          Nenhum livro liberado no momento. Entre em contato com a escola para solicitar acesso.
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {books.map((book) => {
            const total = book.audioTotal ?? 0
            const done = book.audioListened ?? 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <div
                key={book.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-brand-orange/40 transition-all"
              >
                <button
                  type="button"
                  onClick={() => handleOpenBook(book)}
                  disabled={!book.pdfPath}
                  className="group flex flex-col items-stretch text-left flex-1 min-h-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center overflow-hidden">
                    {book.capaPath ? (
                      <img
                        src={book.capaPath}
                        alt={book.nome}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <BookOpen className="w-16 h-16 text-gray-300" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 truncate">{book.nome}</h3>
                    <p className="text-sm text-gray-500">Nível {book.level}</p>
                  </div>
                </button>
                {total > 0 && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <div>
                      <div className="flex justify-between text-[11px] sm:text-xs text-gray-600 mb-1">
                        <span>Áudios ouvidos</span>
                        <span className="font-medium text-gray-800">
                          {done}/{total} ({pct}%)
                        </span>
                      </div>
                      <div
                        className="h-2 bg-gray-200 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progresso dos áudios: ${pct} por cento`}
                      >
                        <div
                          className="h-full bg-brand-orange rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs sm:text-sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openAudiosModal(book)
                      }}
                    >
                      <Headphones className="w-4 h-4 mr-1.5 inline shrink-0" aria-hidden />
                      Ver áudios
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        isOpen={audiosModalBook !== null}
        onClose={closeAudiosModal}
        title={audiosModalBook ? `Áudios — ${audiosModalBook.nome}` : ''}
        size="lg"
        footer={
          <Button variant="outline" onClick={closeAudiosModal}>
            Fechar
          </Button>
        }
      >
        {audiosModalBook && (
          <div className="space-y-4">
            {(audiosModalBook.audioTotal ?? 0) > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-700 mb-1">
                  <span>Progresso</span>
                  <span className="font-medium">
                    {audiosModalBook.audioListened ?? 0}/{audiosModalBook.audioTotal} ouvidos
                  </span>
                </div>
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-orange rounded-full transition-all"
                    style={{
                      width: `${Math.round((((audiosModalBook.audioListened ?? 0) / (audiosModalBook.audioTotal ?? 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {audiosModalLoading ? (
              <div className="flex items-center gap-2 text-gray-600 py-8 justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
              </div>
            ) : audiosModalList.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Nenhum áudio disponível para este livro.</p>
            ) : (
              <ul className="space-y-4 max-h-[min(60vh,420px)] overflow-y-auto pr-1">
                {audiosModalList.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm sm:text-base">{a.chapterTitle}</p>
                        <p className="text-xs text-gray-500">
                          Páginas {a.pageStart} a {a.pageEnd}
                        </p>
                      </div>
                      {a.listened ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700 shrink-0">
                          <CheckCircle2 className="w-4 h-4" aria-hidden />
                          Ouvido
                        </span>
                      ) : null}
                    </div>
                    <audio
                      controls
                      className="w-full h-9 sm:h-10"
                      src={`/api/student/books/${audiosModalBook.id}/audios/${a.id}`}
                      preload="metadata"
                      onEnded={() => {
                        if (!a.listened) void markAudioListened(audiosModalBook.id, a.id)
                      }}
                    >
                      Seu navegador não suporta áudio embutido.
                    </audio>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-gray-500">
              O progresso é atualizado quando o áudio termina de tocar até o fim.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal de visualização do PDF - responsivo */}
      {viewingBook && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          {/* Header — compacto no celular */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-4 sm:py-3 border-b border-gray-200 bg-gray-50 shrink-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <h2 className="font-semibold text-gray-900 truncate text-sm sm:text-base pr-1">
                {viewingBook.nome}
              </h2>
              <button
                type="button"
                onClick={handleCloseBook}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 shrink-0 sm:hidden touch-manipulation"
                aria-label="Fechar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3">
              <div
                className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-50 text-amber-900 text-[10px] sm:text-xs leading-tight min-w-0 flex-1 sm:flex-initial"
                title="Visualização apenas – sem impressão/download"
              >
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden />
                <span className="sm:hidden truncate">Só leitura · sem baixar</span>
                <span className="hidden sm:inline truncate">
                  Visualização apenas – sem impressão/download
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseBook}
                className="hidden sm:inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 shrink-0 touch-manipulation"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {(viewingAudiosLoading || viewingBookAudios.length > 0) && (
            <div className="shrink-0 border-b border-gray-200 bg-sky-50/90">
              <button
                type="button"
                className="md:hidden w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left min-h-[48px] touch-manipulation border-b border-sky-100/80"
                onClick={() => setAudioStripOpen((o) => !o)}
                aria-expanded={audioStripOpen}
              >
                <span className="flex items-center gap-2 text-sky-950 text-sm font-semibold min-w-0">
                  <Headphones className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    Áudio desta página
                    {!viewingAudiosLoading && audiosForCurrentPdfPage.length > 0
                      ? ` (${audiosForCurrentPdfPage.length})`
                      : ''}
                  </span>
                </span>
                {audioStripOpen ? (
                  <ChevronUp className="w-5 h-5 text-sky-800 shrink-0" aria-hidden />
                ) : (
                  <ChevronDown className="w-5 h-5 text-sky-800 shrink-0" aria-hidden />
                )}
              </button>
              <div
                className={`px-3 py-2 sm:px-4 sm:py-3 ${audioStripOpen ? 'block' : 'hidden'} md:block`}
              >
                <div className="hidden md:flex items-center gap-2 text-sky-900 text-sm font-semibold mb-2">
                  <Headphones className="w-4 h-4 shrink-0" aria-hidden />
                  Áudio desta página
                </div>
                {viewingAudiosLoading ? (
                  <div className="flex items-center gap-2 text-sky-800 text-xs py-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                    Carregando áudios…
                  </div>
                ) : audiosForCurrentPdfPage.length > 0 ? (
                  <ul className="max-h-[min(28vh,200px)] sm:max-h-[min(40vh,220px)] overflow-y-auto space-y-2.5 sm:space-y-3 pr-0.5">
                    {audiosForCurrentPdfPage.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-sky-200/80 bg-white/95 px-2.5 py-2 shadow-sm"
                      >
                        <p className="text-xs sm:text-sm font-medium text-gray-900 leading-snug">{a.chapterTitle}</p>
                        <p className="text-[11px] sm:text-xs text-gray-500 mb-1.5">
                          Págs. {a.pageStart}–{a.pageEnd}
                        </p>
                        <audio
                          controls
                          controlsList="nodownload"
                          className="w-full h-10 sm:h-10 max-w-full"
                          src={`/api/student/books/${viewingBook.id}/audios/${a.id}`}
                          preload="metadata"
                        >
                          Seu navegador não suporta áudio embutido.
                        </audio>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-sky-800/90 py-1 leading-relaxed">
                    Nenhum áudio para a <strong>página {pdfCurrentPage}</strong>. O player só aparece nas páginas da faixa
                    de cada capítulo.
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Visualizador com navegação de páginas */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <PdfViewer
              url={pdfUrl}
              totalPaginas={viewingBook.totalPaginas}
              onClose={handleCloseBook}
              onPageChange={handlePdfPageChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
