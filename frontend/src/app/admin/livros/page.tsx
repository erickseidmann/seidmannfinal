/**
 * Página Admin: Gerenciar Livros
 *
 * Catálogo de livros (cadastrar com PDF, capa, nível) e liberações para usuários
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Toast from '@/components/admin/Toast'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import Button from '@/components/ui/Button'
import { Plus, Search, BookOpen, Upload, X, Headphones, Trash2, Loader2, Check } from 'lucide-react'

const MAX_BATCH_AUDIOS = 10
const ALLOWED_AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.webm'] as const

function defaultChapterTitleFromFile(file: File): string {
  const base = file.name.replace(/\.[^./\\]+$/, '').replace(/[_]+/g, ' ').trim()
  return base || 'Capítulo'
}

function newBatchRowKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface PendingBatchAudioRow {
  key: string
  file: File
  chapterTitle: string
  pageStart: number
  pageEnd: number
  sortOrder: number
}

const BOOK_LEVELS: { value: string; label: string }[] = [
  { value: 'A1', label: 'A1 – Básico Iniciante' },
  { value: 'A2', label: 'A2 – Básico Intermediário' },
  { value: 'A3', label: 'A3 – Transição entre Básico e Intermediário' },
  { value: 'B1', label: 'B1 – Intermediário Iniciante' },
  { value: 'B2', label: 'B2 – Intermediário' },
  { value: 'B3', label: 'B3 – Intermediário Avançado' },
  { value: 'B4', label: 'B4 – Transição entre Intermediário e Avançado' },
  { value: 'C1', label: 'C1 – Avançado' },
  { value: 'C2', label: 'C2 – Avançado Fluente' },
]

type BookLanguage = 'ENGLISH' | 'SPANISH'

const BOOK_LANGUAGES: { value: BookLanguage; label: string }[] = [
  { value: 'ENGLISH', label: 'Inglês' },
  { value: 'SPANISH', label: 'Espanhol' },
]

function bookLanguageLabel(lang: string | null | undefined): string {
  if (lang === 'ENGLISH') return 'Inglês'
  if (lang === 'SPANISH') return 'Espanhol'
  return '—'
}

interface Book {
  id: string
  nome: string
  level: string
  language: BookLanguage | null
  totalPaginas: number
  imprimivel: boolean
  pdfPath: string | null
  capaPath: string | null
  criadoEm: string
}

interface BookAudioRow {
  id: string
  chapterTitle: string
  pageStart: number
  pageEnd: number
  sortOrder: number
}

interface BookRelease {
  id: string
  userId: string
  user: { id: string; nome: string; email: string; role?: string }
  bookCode: string
  bookId?: string | null
  book?: { id: string; nome: string; level: string; capaPath: string | null } | null
  releasedByAdminEmail: string
  criadoEm: string
}

interface UserForRelease {
  id: string
  nome: string
  email: string
  role?: string
}

export default function AdminLivrosPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const router = useRouter()
  const [tab, setTab] = useState<'catalogo' | 'liberacoes'>('catalogo')
  const [books, setBooks] = useState<Book[]>([])
  const [error, setError] = useState<string | null>(null)
  const [releaseSearch, setReleaseSearch] = useState('')
  const [releaseFilterRole, setReleaseFilterRole] = useState<'all' | 'STUDENT' | 'TEACHER'>('all')
  const [releaseLanguageTab, setReleaseLanguageTab] = useState<BookLanguage>('ENGLISH')
  const [releaseUsers, setReleaseUsers] = useState<UserForRelease[]>([])
  const [releaseUsersLoading, setReleaseUsersLoading] = useState(false)
  const [selectedReleaseUser, setSelectedReleaseUser] = useState<UserForRelease | null>(null)
  const [userReleasesByBookId, setUserReleasesByBookId] = useState<Record<string, BookRelease>>({})
  const [userReleasesLoading, setUserReleasesLoading] = useState(false)
  const [togglingBookId, setTogglingBookId] = useState<string | null>(null)
  const [isCreateBookModalOpen, setIsCreateBookModalOpen] = useState(false)
  const [createBookLoading, setCreateBookLoading] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editBookLoading, setEditBookLoading] = useState(false)
  const [deletingBookLoading, setDeletingBookLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [createBookForm, setCreateBookForm] = useState({
    nome: '',
    level: 'A1',
    language: 'ENGLISH' as BookLanguage,
    totalPaginas: 1,
    imprimivel: true,
    pdf: null as File | null,
    capa: null as File | null,
  })

  const [editBookForm, setEditBookForm] = useState({
    nome: '',
    level: 'A1',
    language: '' as BookLanguage | '',
    totalPaginas: 1,
    imprimivel: true,
    pdf: null as File | null,
    capa: null as File | null,
  })

  const [editBookAudios, setEditBookAudios] = useState<BookAudioRow[]>([])
  const [editAudiosLoading, setEditAudiosLoading] = useState(false)
  const [newAudioChapter, setNewAudioChapter] = useState('')
  const [newAudioPageStart, setNewAudioPageStart] = useState(1)
  const [newAudioPageEnd, setNewAudioPageEnd] = useState(1)
  const [newAudioSort, setNewAudioSort] = useState(0)
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null)
  const [addingAudio, setAddingAudio] = useState(false)
  const [deletingAudioId, setDeletingAudioId] = useState<string | null>(null)
  const [pendingBatchAudios, setPendingBatchAudios] = useState<PendingBatchAudioRow[]>([])
  const batchFileInputRef = useRef<HTMLInputElement>(null)

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/books', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao carregar livros')
      }
      if (json.ok) setBooks(json.data || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro')
    }
  }, [router])

  const fetchReleaseUsers = useCallback(async () => {
    setReleaseUsersLoading(true)
    try {
      const params = new URLSearchParams()
      if (releaseSearch.trim()) params.set('search', releaseSearch.trim())
      params.set('includeTeachers', 'true')
      const res = await fetch(`/api/admin/books/students?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao buscar usuários')
      }
      setReleaseUsers(json.ok ? json.data || [] : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar usuários')
      setReleaseUsers([])
    } finally {
      setReleaseUsersLoading(false)
    }
  }, [releaseSearch, router])

  const fetchUserReleases = useCallback(
    async (userId: string) => {
      setUserReleasesLoading(true)
      try {
        const res = await fetch(
          `/api/admin/books/releases?userId=${encodeURIComponent(userId)}`,
          { credentials: 'include' }
        )
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.message || 'Erro ao carregar liberações do usuário')
        }
        const map: Record<string, BookRelease> = {}
        for (const r of (json.data?.releases || []) as BookRelease[]) {
          const key = r.bookId || r.bookCode
          if (key) map[key] = r
        }
        setUserReleasesByBookId(map)
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Erro ao carregar liberações',
          type: 'error',
        })
        setUserReleasesByBookId({})
      } finally {
        setUserReleasesLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (tab === 'catalogo') fetchBooks()
  }, [tab, fetchBooks])

  useEffect(() => {
    if (!editingBook) {
      setEditBookAudios([])
      setNewAudioChapter('')
      setNewAudioPageStart(1)
      setNewAudioPageEnd(1)
      setNewAudioSort(0)
      setNewAudioFile(null)
      setPendingBatchAudios([])
      return
    }
    setEditAudiosLoading(true)
    fetch(`/api/admin/books/${editingBook.id}/audios`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data?.audios)) {
          setEditBookAudios(j.data.audios)
        } else {
          setEditBookAudios([])
        }
      })
      .catch(() => setEditBookAudios([]))
      .finally(() => setEditAudiosLoading(false))
  }, [editingBook?.id])

  useEffect(() => {
    if (tab !== 'liberacoes') return
    void Promise.all([fetchBooks(), fetchReleaseUsers()])
  }, [tab, fetchBooks, fetchReleaseUsers])

  useEffect(() => {
    if (!selectedReleaseUser) {
      setUserReleasesByBookId({})
      return
    }
    fetchUserReleases(selectedReleaseUser.id)
  }, [selectedReleaseUser, fetchUserReleases])

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createBookForm.pdf || !createBookForm.capa) {
      setToast({ message: 'Selecione o PDF e a imagem de capa.', type: 'error' })
      return
    }
    setCreateBookLoading(true)
    try {
      const fd = new FormData()
      fd.append('nome', createBookForm.nome.trim())
      fd.append('level', createBookForm.level)
      fd.append('language', createBookForm.language)
      fd.append('totalPaginas', String(createBookForm.totalPaginas))
      fd.append('imprimivel', createBookForm.imprimivel ? 'true' : 'false')
      fd.append('pdf', createBookForm.pdf)
      fd.append('capa', createBookForm.capa)

      const res = await fetch('/api/admin/books', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao cadastrar livro')
      }
      setToast({
        message: json.message || 'Livro cadastrado com sucesso!',
        type: 'success',
      })
      setIsCreateBookModalOpen(false)
      setCreateBookForm({
        nome: '',
        level: 'A1',
        language: 'ENGLISH',
        totalPaginas: 1,
        imprimivel: true,
        pdf: null,
        capa: null,
      })
      fetchBooks()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao cadastrar', type: 'error' })
    } finally {
      setCreateBookLoading(false)
    }
  }

  const handleOpenEditBook = (book: Book) => {
    setEditingBook(book)
    setEditBookForm({
      nome: book.nome,
      level: book.level,
      language: book.language ?? '',
      totalPaginas: book.totalPaginas,
      imprimivel: book.imprimivel,
      pdf: null,
      capa: null,
    })
    setNewAudioChapter('')
    setNewAudioPageStart(1)
    setNewAudioPageEnd(1)
    setNewAudioSort(0)
    setNewAudioFile(null)
    setPendingBatchAudios([])
  }

  const handleBatchFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length || !editingBook) return
    const picked = Array.from(list)
    const valid: File[] = []
    const rejected: string[] = []
    for (const f of picked.slice(0, MAX_BATCH_AUDIOS)) {
      const ext = f.name.includes('.') ? `.${f.name.split('.').pop()!.toLowerCase()}` : ''
      if (ALLOWED_AUDIO_EXT.includes(ext as (typeof ALLOWED_AUDIO_EXT)[number])) valid.push(f)
      else rejected.push(f.name)
    }
    if (rejected.length > 0) {
      setToast({
        message: `Ignorados (formato inválido): ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}`,
        type: 'error',
      })
    }
    if (valid.length === 0) {
      e.target.value = ''
      return
    }
    const maxSort = editBookAudios.reduce((m, a) => Math.max(m, a.sortOrder), 0)
    setPendingBatchAudios(
      valid.map((file, i) => ({
        key: newBatchRowKey(),
        file,
        chapterTitle: defaultChapterTitleFromFile(file),
        pageStart: 1,
        pageEnd: 1,
        sortOrder: maxSort + i + 1,
      }))
    )
    e.target.value = ''
  }

  /**
   * Envia todos os áudios da fila em lote (máx. 10).
   */
  const submitPendingBatchAudios = async (options?: { showSuccessToast?: boolean }): Promise<boolean> => {
    const showSuccessToast = options?.showSuccessToast ?? false
    if (!editingBook || pendingBatchAudios.length === 0) return true

    for (let i = 0; i < pendingBatchAudios.length; i++) {
      const row = pendingBatchAudios[i]
      if (!row.chapterTitle.trim()) {
        setToast({ message: `Fila: informe o título na linha ${i + 1}.`, type: 'error' })
        return false
      }
      if (row.pageStart < 1 || row.pageEnd < row.pageStart) {
        setToast({ message: `Fila: intervalo de páginas inválido na linha ${i + 1}.`, type: 'error' })
        return false
      }
      if (row.pageEnd > editingBook.totalPaginas) {
        setToast({
          message: `Fila: página final (linha ${i + 1}) não pode ser maior que ${editingBook.totalPaginas}.`,
          type: 'error',
        })
        return false
      }
    }

    setAddingAudio(true)
    try {
      let count = 0
      for (const row of pendingBatchAudios) {
        const fd = new FormData()
        fd.append('chapterTitle', row.chapterTitle.trim())
        fd.append('pageStart', String(row.pageStart))
        fd.append('pageEnd', String(row.pageEnd))
        fd.append('sortOrder', String(row.sortOrder))
        fd.append('audio', row.file)
        const res = await fetch(`/api/admin/books/${editingBook.id}/audios`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.message || `Erro ao enviar "${row.chapterTitle.trim()}"`)
        }
        if (json.data?.audio) {
          setEditBookAudios((prev) =>
            [...prev, json.data.audio].sort((a, b) => a.sortOrder - b.sortOrder || a.pageStart - b.pageStart)
          )
        }
        count++
      }
      setPendingBatchAudios([])
      if (showSuccessToast) {
        setToast({ message: `${count} áudio(s) adicionado(s).`, type: 'success' })
      }
      return true
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao enviar lote de áudios', type: 'error' })
      return false
    } finally {
      setAddingAudio(false)
    }
  }

  /**
   * Envia o áudio do formulário (se houver título + arquivo).
   * Sem pendência → true. Erro de validação/envio → false (toast já exibido).
   * `showSuccessToast`: só para o botão "Adicionar áudio"; no "Salvar" o toast final é do livro.
   */
  const trySubmitPendingAudio = async (options?: { showSuccessToast?: boolean }): Promise<boolean> => {
    const showSuccessToast = options?.showSuccessToast ?? false
    if (!editingBook) return true
    const hasFile = !!newAudioFile
    const hasTitle = !!newAudioChapter.trim()
    if (!hasFile && !hasTitle) return true
    if (!newAudioChapter.trim()) {
      setToast({ message: 'Informe o título do capítulo.', type: 'error' })
      return false
    }
    if (!newAudioFile) {
      setToast({ message: 'Selecione um arquivo de áudio.', type: 'error' })
      return false
    }
    if (newAudioPageStart < 1 || newAudioPageEnd < newAudioPageStart) {
      setToast({ message: 'Intervalo de páginas inválido.', type: 'error' })
      return false
    }
    if (newAudioPageEnd > editingBook.totalPaginas) {
      setToast({
        message: `Página final não pode ser maior que ${editingBook.totalPaginas}.`,
        type: 'error',
      })
      return false
    }
    setAddingAudio(true)
    try {
      const fd = new FormData()
      fd.append('chapterTitle', newAudioChapter.trim())
      fd.append('pageStart', String(newAudioPageStart))
      fd.append('pageEnd', String(newAudioPageEnd))
      fd.append('sortOrder', String(newAudioSort))
      fd.append('audio', newAudioFile)
      const res = await fetch(`/api/admin/books/${editingBook.id}/audios`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao enviar áudio')
      }
      if (json.data?.audio) {
        setEditBookAudios((prev) =>
          [...prev, json.data.audio].sort((a, b) => a.sortOrder - b.sortOrder || a.pageStart - b.pageStart)
        )
      }
      setNewAudioChapter('')
      setNewAudioFile(null)
      if (showSuccessToast) {
        setToast({ message: json.message || 'Áudio adicionado.', type: 'success' })
      }
      return true
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao enviar áudio', type: 'error' })
      return false
    } finally {
      setAddingAudio(false)
    }
  }

  const handleAddBookAudio = async () => {
    await trySubmitPendingAudio({ showSuccessToast: true })
  }

  const handleDeleteBookAudio = async (audioId: string) => {
    if (!editingBook) return
    const ok = await confirm({
      title: 'Remover áudio',
      message: 'Remover este áudio?',
      confirmLabel: 'Remover',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingAudioId(audioId)
    try {
      const res = await fetch(`/api/admin/books/${editingBook.id}/audios/${encodeURIComponent(audioId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao remover')
      }
      setEditBookAudios((prev) => prev.filter((a) => a.id !== audioId))
      setToast({ message: 'Áudio removido.', type: 'success' })
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao remover', type: 'error' })
    } finally {
      setDeletingAudioId(null)
    }
  }

  const handleEditBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBook) return
    if (!editBookForm.nome.trim()) {
      setToast({ message: 'Nome é obrigatório.', type: 'error' })
      return
    }
    if (!editBookForm.language) {
      setToast({
        message: 'Selecione o idioma do livro (Inglês ou Espanhol) e clique em Salvar.',
        type: 'error',
      })
      return
    }
    setEditBookLoading(true)
    try {
      const fd = new FormData()
      fd.append('nome', editBookForm.nome.trim())
      fd.append('level', editBookForm.level)
      fd.append('language', editBookForm.language)
      fd.append('totalPaginas', String(editBookForm.totalPaginas))
      fd.append('imprimivel', editBookForm.imprimivel ? 'true' : 'false')
      if (editBookForm.pdf) fd.append('pdf', editBookForm.pdf)
      if (editBookForm.capa) fd.append('capa', editBookForm.capa)

      const res = await fetch(`/api/admin/books/${editingBook.id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao atualizar livro')
      }

      await fetchBooks()
      if (json.data?.language) {
        setEditingBook((prev) =>
          prev ? { ...prev, language: json.data.language as BookLanguage } : prev
        )
      }

      const batchOk = await submitPendingBatchAudios({ showSuccessToast: false })
      const audioOk = batchOk ? await trySubmitPendingAudio({ showSuccessToast: false }) : false

      setToast({
        message: json.message || 'Livro atualizado com sucesso!',
        type: 'success',
      })

      if (batchOk && audioOk) {
        setEditingBook(null)
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao atualizar', type: 'error' })
    } finally {
      setEditBookLoading(false)
    }
  }

  const handleDeleteBook = async () => {
    if (!editingBook) return
    const ok = await confirm({
      title: 'Excluir livro',
      message:
        `Tem certeza que deseja EXCLUIR o livro "${editingBook.nome}"?\n\n` +
        'Esta ação remove o livro do catálogo, seus áudios e o PDF/capa enviados.\n' +
        'As liberações já feitas para alunos serão preservadas no histórico, ' +
        'mas ficarão sem o livro vinculado.\n\nEsta ação não pode ser desfeita.',
      confirmLabel: 'Excluir livro',
      variant: 'danger',
    })
    if (!ok) return

    setDeletingBookLoading(true)
    try {
      const res = await fetch(`/api/admin/books/${editingBook.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao excluir livro')
      }
      setToast({
        message: json.message || 'Livro excluído com sucesso!',
        type: 'success',
      })
      setEditingBook(null)
      fetchBooks()
      if (selectedReleaseUser) fetchUserReleases(selectedReleaseUser.id)
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Erro ao excluir livro',
        type: 'error',
      })
    } finally {
      setDeletingBookLoading(false)
    }
  }

  const handleToggleBookForUser = async (book: Book) => {
    if (!selectedReleaseUser || togglingBookId) return

    const existing = userReleasesByBookId[book.id]
    setTogglingBookId(book.id)

    try {
      if (existing) {
        const res = await fetch(`/api/admin/books/releases/${existing.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.message || 'Erro ao revogar acesso')
        }
        setUserReleasesByBookId((prev) => {
          const next = { ...prev }
          delete next[book.id]
          return next
        })
        setToast({ message: `Acesso a "${book.nome}" revogado.`, type: 'success' })
      } else {
        const res = await fetch('/api/admin/books/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: selectedReleaseUser.id,
            bookId: book.id,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.message || 'Erro ao liberar livro')
        }
        const release = json.data?.release as BookRelease | undefined
        if (release) {
          setUserReleasesByBookId((prev) => ({ ...prev, [book.id]: release }))
        }
        setToast({
          message: json.data?.message || `Livro "${book.nome}" liberado!`,
          type: 'success',
        })
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Erro ao atualizar liberação',
        type: 'error',
      })
    } finally {
      setTogglingBookId(null)
    }
  }

  const filteredReleaseUsers = releaseUsers.filter(
    (u) => releaseFilterRole === 'all' || u.role === releaseFilterRole
  )

  const booksForReleaseLanguage = books.filter((b) => b.language === releaseLanguageTab)
  const booksWithoutLanguage = books.filter((b) => !b.language)
  const hasReleaseBooksToShow =
    booksForReleaseLanguage.length > 0 || booksWithoutLanguage.length > 0

  const renderReleaseBookChip = (book: Book, options?: { missingLanguage?: boolean }) => {
    const release = userReleasesByBookId[book.id]
    const isReleased = Boolean(release)
    const isToggling = togglingBookId === book.id

    return (
      <button
        key={book.id}
        type="button"
        onClick={() => handleToggleBookForUser(book)}
        disabled={isToggling}
        className={`min-w-[140px] max-w-[220px] flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all disabled:opacity-60 ${
          isReleased
            ? 'border-green-500 bg-green-50 hover:bg-green-100/80'
            : options?.missingLanguage
              ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400'
              : 'border-gray-200 bg-white hover:border-brand-orange hover:shadow-sm'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center ${
              isReleased
                ? 'bg-green-500 text-white'
                : 'border-2 border-gray-300 bg-white'
            }`}
          >
            {isToggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
            ) : isReleased ? (
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{book.nome}</p>
            <p className="text-xs text-gray-500">{book.level}</p>
            {options?.missingLanguage && (
              <p className="text-xs text-amber-700 mt-1">Sem idioma — defina no Catálogo</p>
            )}
            {isReleased && release && (
              <p className="text-xs text-green-700 font-medium mt-1.5">
                Liberado em {new Date(release.criadoEm).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Livros</h1>
            <p className="text-sm text-gray-600">
              Cadastre livros no catálogo e libere com um clique na aba Liberações
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === 'catalogo' ? 'primary' : 'outline'}
              size="md"
              onClick={() => setTab('catalogo')}
            >
              Catálogo
            </Button>
            <Button
              variant={tab === 'liberacoes' ? 'primary' : 'outline'}
              size="md"
              onClick={() => setTab('liberacoes')}
            >
              Liberações
            </Button>
            {tab === 'catalogo' && (
              <Button
                variant="primary"
                size="md"
                className="flex items-center gap-2"
                onClick={() => setIsCreateBookModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Cadastrar Livro
              </Button>
            )}
          </div>
        </div>

        {tab === 'catalogo' && (
          <>
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {error}
              </div>
            )}
            {books.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">Nenhum livro cadastrado.</p>
                <Button
                  variant="primary"
                  onClick={() => setIsCreateBookModalOpen(true)}
                  className="flex items-center gap-2 mx-auto"
                >
                  <Upload className="w-4 h-4" />
                  Cadastrar primeiro livro
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {books.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleOpenEditBook(b)}
                    className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-brand-orange/50 transition-all text-left cursor-pointer"
                  >
                    <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                      {b.capaPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.capaPath}
                          alt={b.nome}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-gray-900 truncate">{b.nome}</p>
                      <p className="text-xs text-gray-500">
                        {BOOK_LEVELS.find((l) => l.value === b.level)?.label || b.level} •{' '}
                        {b.totalPaginas} pág.
                      </p>
                      <p className="text-xs text-gray-500">
                        Idioma:{' '}
                        <span className={b.language ? 'font-semibold text-gray-700' : 'text-amber-600'}>
                          {bookLanguageLabel(b.language)}
                        </span>
                        {!b.language && ' (defina ao editar)'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.imprimivel ? 'Imprimível' : 'Não imprimível'}
                      </p>
                      <p className="text-xs text-brand-orange mt-1">Clique para editar</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'liberacoes' && (
          <>
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-6">
              {/* Lista de usuários */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm h-fit lg:sticky lg:top-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Usuário</h2>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={releaseSearch}
                    onChange={(e) => setReleaseSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        fetchReleaseUsers()
                      }
                    }}
                    className="input flex-1 text-sm"
                    placeholder="Buscar por nome ou email"
                  />
                  <Button variant="outline" size="md" onClick={fetchReleaseUsers}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(
                    [
                      ['all', 'Todos'],
                      ['STUDENT', 'Alunos'],
                      ['TEACHER', 'Professores'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReleaseFilterRole(value)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                        releaseFilterRole === value
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="border border-gray-200 rounded-lg max-h-[min(60vh,520px)] overflow-y-auto">
                  {releaseUsersLoading ? (
                    <div className="flex items-center justify-center gap-2 p-6 text-gray-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando...
                    </div>
                  ) : filteredReleaseUsers.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm text-center">
                      Nenhum usuário encontrado.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {filteredReleaseUsers.map((u) => {
                        const isSelected = selectedReleaseUser?.id === u.id
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedReleaseUser(u)}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                isSelected
                                  ? 'bg-brand-orange/10 border-l-4 border-brand-orange'
                                  : 'hover:bg-gray-50 border-l-4 border-transparent'
                              }`}
                            >
                              <span className="font-medium text-gray-900">{u.nome}</span>
                              <span className="block text-xs text-gray-500 truncate">{u.email}</span>
                              <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                                {u.role === 'TEACHER' ? 'Professor' : 'Aluno'}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Livros por idioma */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                {!selectedReleaseUser ? (
                  <div className="text-center py-16 text-gray-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-700">Selecione um usuário</p>
                    <p className="text-sm mt-1">
                      Escolha um aluno ou professor à esquerda para liberar livros com um clique.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Liberando para
                      </p>
                      <p className="text-lg font-semibold text-gray-900">{selectedReleaseUser.nome}</p>
                      <p className="text-sm text-gray-500">{selectedReleaseUser.email}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-5">
                      <button
                        type="button"
                        onClick={() => setReleaseLanguageTab('ENGLISH')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                          releaseLanguageTab === 'ENGLISH'
                            ? 'bg-brand-orange text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Livros em inglês
                      </button>
                      <button
                        type="button"
                        onClick={() => setReleaseLanguageTab('SPANISH')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                          releaseLanguageTab === 'SPANISH'
                            ? 'bg-brand-orange text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Livros em espanhol
                      </button>
                    </div>

                    {userReleasesLoading ? (
                      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Carregando liberações...
                      </div>
                    ) : !hasReleaseBooksToShow ? (
                      <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-600">
                          Nenhum livro de{' '}
                          {releaseLanguageTab === 'ENGLISH' ? 'inglês' : 'espanhol'} no catálogo.
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Cadastre livros na aba Catálogo e defina o idioma de cada um ao editar.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {booksForReleaseLanguage.length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            {booksForReleaseLanguage.map((book) => renderReleaseBookChip(book))}
                          </div>
                        )}
                        {booksWithoutLanguage.length > 0 && (
                          <div>
                            {booksForReleaseLanguage.length > 0 && (
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                Sem idioma definido
                              </p>
                            )}
                            {booksForReleaseLanguage.length === 0 && (
                              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                                Seus livros ainda não têm idioma cadastrado. Eles aparecem abaixo
                                para liberação; edite cada um no Catálogo e defina Inglês ou
                                Espanhol para filtrar corretamente.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3">
                              {booksWithoutLanguage.map((book) =>
                                renderReleaseBookChip(book, { missingLanguage: true })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-5">
                      Clique no livro para liberar ou revogar o acesso. Livros com check já estão
                      liberados para este usuário.
                    </p>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Modal Cadastrar Livro */}
        <Modal
          isOpen={isCreateBookModalOpen}
          onClose={() => setIsCreateBookModalOpen(false)}
          title="Cadastrar Livro"
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsCreateBookModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
onClick={() => void handleCreateBook({ preventDefault: () => {} } as React.FormEvent)}
                  disabled={createBookLoading || !createBookForm.nome.trim()}
              >
                {createBookLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreateBook} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nome do livro <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createBookForm.nome}
                onChange={(e) =>
                  setCreateBookForm((p) => ({ ...p, nome: e.target.value }))
                }
                className="input w-full"
                required
                placeholder="Ex: English Grammar in Use"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nível <span className="text-red-500">*</span>
              </label>
              <select
                value={createBookForm.level}
                onChange={(e) =>
                  setCreateBookForm((p) => ({ ...p, level: e.target.value }))
                }
                className="input w-full"
              >
                {BOOK_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Idioma <span className="text-red-500">*</span>
              </label>
              <select
                value={createBookForm.language}
                onChange={(e) =>
                  setCreateBookForm((p) => ({
                    ...p,
                    language: e.target.value as BookLanguage,
                  }))
                }
                className="input w-full"
              >
                {BOOK_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Ao salvar, este livro será liberado automaticamente para todos os professores ATIVOS que ensinam este idioma.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Total de páginas <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={createBookForm.totalPaginas}
                onChange={(e) =>
                  setCreateBookForm((p) => ({
                    ...p,
                    totalPaginas: Math.max(1, parseInt(e.target.value, 10) || 1),
                  }))
                }
                className="input w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="imprimivel"
                checked={createBookForm.imprimivel}
                onChange={(e) =>
                  setCreateBookForm((p) => ({ ...p, imprimivel: e.target.checked }))
                }
              />
              <label htmlFor="imprimivel" className="text-sm font-medium text-gray-700">
                Imprimível
              </label>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                PDF do livro <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setCreateBookForm((p) => ({ ...p, pdf: f || null }))
                }}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Imagem de capa <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setCreateBookForm((p) => ({ ...p, capa: f || null }))
                }}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300"
              />
            </div>
          </form>
        </Modal>

        {/* Modal Editar Livro */}
        <Modal
          isOpen={!!editingBook}
          onClose={() => setEditingBook(null)}
          title="Editar Livro"
          size="xl"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteBook()}
                disabled={deletingBookLoading || editBookLoading}
                title="Remover este livro do catálogo"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-red-500 px-6 py-3 text-base font-semibold text-red-600 transition-all duration-200 hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-red-600"
              >
                {deletingBookLoading ? 'Excluindo...' : 'Excluir livro'}
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingBook(null)}
                  disabled={deletingBookLoading}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleEditBook({ preventDefault: () => {} } as React.FormEvent)}
                  disabled={
                    editBookLoading ||
                    deletingBookLoading ||
                    !editBookForm.nome.trim()
                  }
                >
                  {editBookLoading ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          }
        >
          {editingBook && (
            <form onSubmit={handleEditBook} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nome do livro <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editBookForm.nome}
                  onChange={(e) =>
                    setEditBookForm((p) => ({ ...p, nome: e.target.value }))
                  }
                  className="input w-full"
                  required
                  placeholder="Ex: English Grammar in Use"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nível <span className="text-red-500">*</span>
                </label>
                <select
                  value={editBookForm.level}
                  onChange={(e) =>
                    setEditBookForm((p) => ({ ...p, level: e.target.value }))
                  }
                  className="input w-full"
                >
                  {BOOK_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Idioma <span className="text-red-500">*</span>
                </label>
                {!editingBook.language && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    Este livro ainda não tem idioma salvo. Selecione abaixo e clique em{' '}
                    <strong>Salvar</strong> para aparecer corretamente em Liberações.
                  </p>
                )}
                <select
                  value={editBookForm.language}
                  onChange={(e) =>
                    setEditBookForm((p) => ({
                      ...p,
                      language: e.target.value as BookLanguage | '',
                    }))
                  }
                  className="input w-full"
                  required
                >
                  <option value="">— Selecione o idioma —</option>
                  {BOOK_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Se o idioma mudar, este livro será liberado automaticamente para os professores que ensinam o novo idioma. Liberações antigas não são removidas automaticamente.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Total de páginas <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={editBookForm.totalPaginas}
                  onChange={(e) =>
                    setEditBookForm((p) => ({
                      ...p,
                      totalPaginas: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  className="input w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-imprimivel"
                  checked={editBookForm.imprimivel}
                  onChange={(e) =>
                    setEditBookForm((p) => ({ ...p, imprimivel: e.target.checked }))
                  }
                />
                <label htmlFor="edit-imprimivel" className="text-sm font-medium text-gray-700">
                  Imprimível
                </label>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Substituir PDF (opcional)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setEditBookForm((p) => ({ ...p, pdf: f || null }))
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Deixe em branco para manter o PDF atual
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Substituir imagem de capa (opcional)
                </label>
                {editingBook.capaPath && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-gray-600">Capa atual:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editingBook.capaPath}
                      alt="Capa atual"
                      className="h-12 w-auto rounded border border-gray-200 object-cover"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setEditBookForm((p) => ({ ...p, capa: f || null }))
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Deixe em branco para manter a capa atual
                </p>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <Headphones className="w-4 h-4 text-brand-orange" aria-hidden />
                  Áudios por capítulo
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Cada arquivo corresponde a um capítulo e à faixa de páginas no PDF. Os alunos com o livro liberado
                  ouvem pelo material online.
                </p>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-3">
                  Um áudio: preencha e use <strong>Adicionar áudio</strong>, ou até {MAX_BATCH_AUDIOS} de uma vez na
                  seção abaixo. No <strong>Salvar</strong>, o sistema envia primeiro a fila em lote, depois o áudio
                  único pendente (se houver), e atualiza o livro.
                </p>
                {editAudiosLoading ? (
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    Carregando áudios…
                  </p>
                ) : editBookAudios.length === 0 ? (
                  <p className="text-xs text-gray-500 mb-3">Nenhum áudio cadastrado.</p>
                ) : (
                  <ul className="space-y-2 mb-4 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2">
                    {editBookAudios.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start justify-between gap-2 text-sm bg-gray-50 rounded-md px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-gray-800 block truncate">{a.chapterTitle}</span>
                          <span className="text-xs text-gray-500">
                            Págs. {a.pageStart}–{a.pageEnd}
                            {a.sortOrder !== 0 ? ` · ordem ${a.sortOrder}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBookAudio(a.id)}
                          disabled={deletingAudioId === a.id}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded shrink-0 disabled:opacity-40"
                          title="Remover áudio"
                          aria-label={`Remover áudio ${a.chapterTitle}`}
                        >
                          {deletingAudioId === a.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Título do capítulo</label>
                    <input
                      type="text"
                      value={newAudioChapter}
                      onChange={(e) => setNewAudioChapter(e.target.value)}
                      className="input w-full text-sm"
                      placeholder="Ex.: Unidade 3 – Past tense"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Página inicial</label>
                    <input
                      type="number"
                      min={1}
                      max={editingBook.totalPaginas}
                      value={newAudioPageStart}
                      onChange={(e) =>
                        setNewAudioPageStart(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Página final</label>
                    <input
                      type="number"
                      min={1}
                      max={editingBook.totalPaginas}
                      value={newAudioPageEnd}
                      onChange={(e) =>
                        setNewAudioPageEnd(
                          Math.min(
                            editingBook.totalPaginas,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        )
                      }
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Ordem (opcional)</label>
                    <input
                      type="number"
                      value={newAudioSort}
                      onChange={(e) => setNewAudioSort(parseInt(e.target.value, 10) || 0)}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Arquivo de áudio</label>
                    <input
                      type="file"
                      accept=".mp3,.m4a,.wav,.ogg,.webm,audio/*"
                      onChange={(e) => setNewAudioFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">MP3, M4A, WAV, OGG ou WebM · máx. 45 MB</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={addingAudio || editAudiosLoading}
                  onClick={() => void handleAddBookAudio()}
                >
                  {addingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2 inline" aria-hidden />
                      Enviando…
                    </>
                  ) : (
                    'Adicionar áudio'
                  )}
                </Button>

                <div className="mt-6 pt-4 border-t border-dashed border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-brand-orange shrink-0" aria-hidden />
                    Vários áudios de uma vez (máx. {MAX_BATCH_AUDIOS})
                  </h4>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Selecione vários arquivos; edite título e páginas em cada linha e envie a fila, ou apenas salve o
                    livro para enviar tudo automaticamente.
                  </p>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    multiple
                    accept=".mp3,.m4a,.wav,.ogg,.webm,audio/*"
                    disabled={addingAudio || editAudiosLoading}
                    onChange={handleBatchFilesSelected}
                    className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300 disabled:opacity-50"
                  />
                  {pendingBatchAudios.length > 0 && (
                    <div className="mt-3 space-y-3 max-h-[min(50vh,360px)] overflow-y-auto pr-1">
                      {pendingBatchAudios.map((row, idx) => (
                        <div
                          key={row.key}
                          className="rounded-lg border border-gray-200 bg-gray-50/90 p-2 sm:p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-700">#{idx + 1}</span>
                            <button
                              type="button"
                              disabled={addingAudio}
                              onClick={() =>
                                setPendingBatchAudios((p) => p.filter((x) => x.key !== row.key))
                              }
                              className="text-red-600 hover:underline disabled:opacity-40"
                            >
                              Remover da fila
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate" title={row.file.name}>
                            {row.file.name}
                          </p>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Título</label>
                            <input
                              type="text"
                              value={row.chapterTitle}
                              onChange={(e) =>
                                setPendingBatchAudios((p) =>
                                  p.map((r) =>
                                    r.key === row.key ? { ...r, chapterTitle: e.target.value } : r
                                  )
                                )
                              }
                              className="input w-full text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Pág. ini.</label>
                              <input
                                type="number"
                                min={1}
                                max={editingBook.totalPaginas}
                                value={row.pageStart}
                                onChange={(e) =>
                                  setPendingBatchAudios((p) =>
                                    p.map((r) =>
                                      r.key === row.key
                                        ? { ...r, pageStart: Math.max(1, parseInt(e.target.value, 10) || 1) }
                                        : r
                                    )
                                  )
                                }
                                className="input w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Pág. fim</label>
                              <input
                                type="number"
                                min={1}
                                max={editingBook.totalPaginas}
                                value={row.pageEnd}
                                onChange={(e) =>
                                  setPendingBatchAudios((p) =>
                                    p.map((r) =>
                                      r.key === row.key
                                        ? {
                                            ...r,
                                            pageEnd: Math.min(
                                              editingBook.totalPaginas,
                                              Math.max(1, parseInt(e.target.value, 10) || 1)
                                            ),
                                          }
                                        : r
                                    )
                                  )
                                }
                                className="input w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Ordem</label>
                              <input
                                type="number"
                                value={row.sortOrder}
                                onChange={(e) =>
                                  setPendingBatchAudios((p) =>
                                    p.map((r) =>
                                      r.key === row.key
                                        ? { ...r, sortOrder: parseInt(e.target.value, 10) || 0 }
                                        : r
                                    )
                                  )
                                }
                                className="input w-full text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={addingAudio || editAudiosLoading}
                          onClick={() => void submitPendingBatchAudios({ showSuccessToast: true })}
                        >
                          {addingAudio ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2 inline" aria-hidden />
                              Enviando…
                            </>
                          ) : (
                            `Enviar ${pendingBatchAudios.length} áudio(s)`
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={addingAudio}
                          onClick={() => setPendingBatchAudios([])}
                        >
                          Limpar fila
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}
        </Modal>

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <ConfirmDialog />
      </div>
    </AdminLayout>
  )
}
