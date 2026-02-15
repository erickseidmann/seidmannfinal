/**
 * Dashboard Professor – Material (livros do catálogo para consulta nas aulas)
 * Visualização apenas – sem impressão nem download.
 * Mesma experiência do aluno: visualizador com busca de página e responsivo.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { BookOpen, Loader2, X, AlertCircle } from 'lucide-react'

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
}

export default function MaterialProfessorPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingBook, setViewingBook] = useState<Book | null>(null)

  const loadBooks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/professor/books', { credentials: 'include' })
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

  const handleOpenBook = (book: Book) => {
    if (!book.pdfPath) {
      setError('Este livro não possui PDF disponível.')
      return
    }
    setViewingBook(book)
  }

  const handleCloseBook = () => {
    setViewingBook(null)
  }

  const pdfUrl = viewingBook
    ? `/api/professor/books/${viewingBook.id}/pdf?t=${Date.now()}`
    : ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-brand-orange" />
          Material
        </h1>
        <p className="text-gray-600 mt-1">
          Livros do catálogo para consulta nas aulas. Apenas visualização online – impressão e download desabilitados.
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
          Nenhum livro cadastrado no momento.
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => handleOpenBook(book)}
              disabled={!book.pdfPath}
              className="group flex flex-col items-stretch rounded-xl border border-gray-200 bg-white p-0 overflow-hidden shadow-sm hover:shadow-md hover:border-brand-orange/50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:border-gray-200"
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
          ))}
        </div>
      )}

      {/* Modal de visualização do PDF - responsivo */}
      {viewingBook && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-200 bg-gray-50 shrink-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <h2 className="font-semibold text-gray-900 truncate text-sm sm:text-base">
                {viewingBook.nome}
              </h2>
              <button
                type="button"
                onClick={handleCloseBook}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 shrink-0 sm:hidden"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">Visualização apenas – sem impressão/download</span>
              </div>
              <button
                type="button"
                onClick={handleCloseBook}
                className="hidden sm:flex p-2 rounded-lg hover:bg-gray-200 text-gray-600 shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <PdfViewer
              url={pdfUrl}
              totalPaginas={viewingBook.totalPaginas}
              onClose={handleCloseBook}
            />
          </div>
        </div>
      )}
    </div>
  )
}
