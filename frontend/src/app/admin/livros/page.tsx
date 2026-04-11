/**
 * Página Admin: Gerenciar Livros
 *
 * Catálogo de livros (cadastrar com PDF, capa, nível) e liberações para usuários
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import { Plus, Search, BookOpen, Upload, X, Headphones, Trash2, Loader2 } from 'lucide-react'

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

interface Book {
  id: string
  nome: string
  level: string
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
  const router = useRouter()
  const [tab, setTab] = useState<'catalogo' | 'liberacoes'>('catalogo')
  const [books, setBooks] = useState<Book[]>([])
  const [releases, setReleases] = useState<BookRelease[]>([])
  const [usersForRelease, setUsersForRelease] = useState<UserForRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [releaseSearch, setReleaseSearch] = useState('')
  const [releaseFilterBookId, setReleaseFilterBookId] = useState('')
  const [releaseFilterRole, setReleaseFilterRole] = useState<'all' | 'STUDENT' | 'TEACHER'>('all')
  const [isBulkReleaseModalOpen, setIsBulkReleaseModalOpen] = useState(false)
  const [bulkReleaseForm, setBulkReleaseForm] = useState({
    selectedUserIds: [] as string[],
    selectedBookIds: [] as string[],
  })
  const [bulkUserSearch, setBulkUserSearch] = useState('')
  const [bulkReleaseLoading, setBulkReleaseLoading] = useState(false)
  const [bulkReleaseUsers, setBulkReleaseUsers] = useState<UserForRelease[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false)
  const [isCreateBookModalOpen, setIsCreateBookModalOpen] = useState(false)
  const [createBookLoading, setCreateBookLoading] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editBookLoading, setEditBookLoading] = useState(false)
  const [releaseLoading, setReleaseLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [createBookForm, setCreateBookForm] = useState({
    nome: '',
    level: 'A1',
    totalPaginas: 1,
    imprimivel: true,
    pdf: null as File | null,
    capa: null as File | null,
  })

  const [editBookForm, setEditBookForm] = useState({
    nome: '',
    level: 'A1',
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

  const [releaseForm, setReleaseForm] = useState({
    selectedUserIds: [] as string[],
    bookId: '',
  })

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

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (releaseSearch.trim()) params.append('search', releaseSearch.trim())
      if (releaseFilterBookId) params.append('bookId', releaseFilterBookId)
      if (releaseFilterRole !== 'all') params.append('role', releaseFilterRole)
      const res = await fetch(`/api/admin/books/releases?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao carregar liberações')
      }
      if (json.ok) setReleases(json.data?.releases || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [releaseSearch, releaseFilterBookId, releaseFilterRole, router])

  const fetchUsersForRelease = useCallback(
    async (q?: string, excludeBookId?: string) => {
      try {
        const params = new URLSearchParams()
        if (q?.trim()) params.set('search', q.trim())
        if (excludeBookId) params.set('excludeBookId', excludeBookId)
        params.set('includeTeachers', 'true')
        const res = await fetch(`/api/admin/books/students?${params.toString()}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok) setUsersForRelease(json.data || [])
        else setUsersForRelease([])
      } catch {
        setUsersForRelease([])
      }
    },
    []
  )

  const fetchBulkReleaseUsers = useCallback(async (q?: string) => {
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('search', q.trim())
      params.set('includeTeachers', 'true')
      const res = await fetch(`/api/admin/books/students?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) setBulkReleaseUsers(json.data || [])
      else setBulkReleaseUsers([])
    } catch {
      setBulkReleaseUsers([])
    }
  }, [])

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
    if (tab === 'liberacoes') fetchReleases()
  }, [tab, releaseFilterBookId, releaseFilterRole, fetchReleases])

  useEffect(() => {
    if (isReleaseModalOpen) {
      fetchUsersForRelease(studentSearch, releaseForm.bookId)
    }
  }, [isReleaseModalOpen, studentSearch, releaseForm.bookId, fetchUsersForRelease])

  useEffect(() => {
    if (isBulkReleaseModalOpen) {
      fetchBulkReleaseUsers(bulkUserSearch)
    }
  }, [isBulkReleaseModalOpen, bulkUserSearch, fetchBulkReleaseUsers])

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
      setToast({ message: 'Livro cadastrado com sucesso!', type: 'success' })
      setIsCreateBookModalOpen(false)
      setCreateBookForm({ nome: '', level: 'A1', totalPaginas: 1, imprimivel: true, pdf: null, capa: null })
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
    if (!confirm('Remover este áudio?')) return
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
    setEditBookLoading(true)
    try {
      const batchOk = await submitPendingBatchAudios({ showSuccessToast: false })
      if (!batchOk) return
      const audioOk = await trySubmitPendingAudio({ showSuccessToast: false })
      if (!audioOk) return

      const fd = new FormData()
      fd.append('nome', editBookForm.nome.trim())
      fd.append('level', editBookForm.level)
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
      setToast({ message: 'Livro atualizado com sucesso!', type: 'success' })
      setEditingBook(null)
      fetchBooks()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao atualizar', type: 'error' })
    } finally {
      setEditBookLoading(false)
    }
  }

  const handleRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (releaseForm.selectedUserIds.length === 0 || !releaseForm.bookId) {
      setToast({ message: 'Selecione o livro e pelo menos um aluno.', type: 'error' })
      return
    }
    setReleaseLoading(true)
    try {
      const res = await fetch('/api/admin/books/release-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bookId: releaseForm.bookId,
          userIds: releaseForm.selectedUserIds,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao liberar livro')
      }
      setToast({ message: json.message || 'Livro liberado!', type: 'success' })
      setIsReleaseModalOpen(false)
      setReleaseForm({ selectedUserIds: [], bookId: '' })
      setStudentSearch('')
      fetchReleases()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao liberar', type: 'error' })
    } finally {
      setReleaseLoading(false)
    }
  }

  const toggleUser = (userId: string) => {
    setReleaseForm((p) =>
      p.selectedUserIds.includes(userId)
        ? { ...p, selectedUserIds: p.selectedUserIds.filter((id) => id !== userId) }
        : { ...p, selectedUserIds: [...p.selectedUserIds, userId] }
    )
  }

  const selectAllUsers = () => {
    setReleaseForm((p) => ({
      ...p,
      selectedUserIds: usersForRelease.map((u) => u.id),
    }))
  }

  const deselectAllUsers = () => {
    setReleaseForm((p) => ({ ...p, selectedUserIds: [] }))
  }

  const toggleBulkUser = (userId: string) => {
    setBulkReleaseForm((p) =>
      p.selectedUserIds.includes(userId)
        ? { ...p, selectedUserIds: p.selectedUserIds.filter((id) => id !== userId) }
        : { ...p, selectedUserIds: [...p.selectedUserIds, userId] }
    )
  }

  const toggleBulkBook = (bookId: string) => {
    setBulkReleaseForm((p) =>
      p.selectedBookIds.includes(bookId)
        ? { ...p, selectedBookIds: p.selectedBookIds.filter((id) => id !== bookId) }
        : { ...p, selectedBookIds: [...p.selectedBookIds, bookId] }
    )
  }

  const selectAllBulkUsers = () => {
    setBulkReleaseForm((p) => ({
      ...p,
      selectedUserIds: bulkReleaseUsers.map((u) => u.id),
    }))
  }

  const selectAllBulkBooks = () => {
    setBulkReleaseForm((p) => ({
      ...p,
      selectedBookIds: books.map((b) => b.id),
    }))
  }

  const handleBulkRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (bulkReleaseForm.selectedUserIds.length === 0 || bulkReleaseForm.selectedBookIds.length === 0) {
      setToast({
        message: 'Selecione pelo menos um usuário e um livro.',
        type: 'error',
      })
      return
    }
    setBulkReleaseLoading(true)
    try {
      const res = await fetch('/api/admin/books/release-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bookIds: bulkReleaseForm.selectedBookIds,
          userIds: bulkReleaseForm.selectedUserIds,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao liberar')
      }
      setToast({ message: json.message || 'Liberado!', type: 'success' })
      setIsBulkReleaseModalOpen(false)
      setBulkReleaseForm({ selectedUserIds: [], selectedBookIds: [] })
      setBulkUserSearch('')
      fetchReleases()
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Erro ao liberar',
        type: 'error',
      })
    } finally {
      setBulkReleaseLoading(false)
    }
  }

  const handleRevokeAccess = async (releaseId: string) => {
    setRevokingId(releaseId)
    try {
      const res = await fetch(`/api/admin/books/releases/${releaseId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: 'Acesso revogado', type: 'success' })
        fetchReleases()
      } else {
        setToast({ message: json.message || 'Erro ao revogar', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao revogar acesso', type: 'error' })
    } finally {
      setRevokingId(null)
    }
  }

  const releaseColumns = [
    {
      key: 'user',
      label: 'Usuário',
      render: (r: BookRelease) => (
        <span className="flex items-center gap-2">
          {r.user.nome}
          <span className="text-xs text-gray-500">
            ({r.user.role === 'TEACHER' ? 'Prof' : 'Aluno'})
          </span>
        </span>
      ),
    },
    { key: 'user.email', label: 'Email', render: (r: BookRelease) => r.user.email },
    {
      key: 'book',
      label: 'Livro',
      render: (r: BookRelease) => (
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRevokeAccess(r.id)
            }}
            disabled={revokingId === r.id}
            className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50 shrink-0"
            title="Revogar acesso a este livro"
          >
            <X className="w-4 h-4" />
          </button>
          {r.book ? r.book.nome : r.bookCode}
        </span>
      ),
    },
    { key: 'releasedByAdminEmail', label: 'Liberado por' },
    {
      key: 'criadoEm',
      label: 'Data',
      render: (r: BookRelease) => new Date(r.criadoEm).toLocaleDateString('pt-BR'),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Livros</h1>
            <p className="text-sm text-gray-600">
              Cadastre livros (PDF, capa, nível) e libere para alunos
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
            {tab === 'liberacoes' && (
              <>
                <Button
                  variant="primary"
                  size="md"
                  className="flex items-center gap-2"
                  onClick={() => setIsReleaseModalOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  Liberar Livro
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  className="flex items-center gap-2"
                  onClick={() => setIsBulkReleaseModalOpen(true)}
                >
                  <BookOpen className="w-4 h-4" />
                  Liberar para usuário(s)
                </Button>
              </>
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
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Buscar por nome ou email
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={releaseSearch}
                    onChange={(e) => setReleaseSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        fetchReleases()
                      }
                    }}
                    className="input flex-1"
                    placeholder="Nome do aluno ou professor, ou email (deixe vazio para ver todos)"
                  />
                  <Button variant="outline" size="md" onClick={fetchReleases}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Filtrar por livro
                  </label>
                  <select
                    value={releaseFilterBookId}
                    onChange={(e) => setReleaseFilterBookId(e.target.value)}
                    className="input py-2"
                  >
                    <option value="">Todos os livros</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome} ({b.level})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tipo
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReleaseFilterRole('all')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        releaseFilterRole === 'all'
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setReleaseFilterRole('STUDENT')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        releaseFilterRole === 'STUDENT'
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Somente alunos
                    </button>
                    <button
                      type="button"
                      onClick={() => setReleaseFilterRole('TEACHER')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        releaseFilterRole === 'TEACHER'
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Somente professores
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {error}
              </div>
            )}
            <Table
              columns={releaseColumns}
              data={releases}
              loading={loading}
              emptyMessage="Nenhuma liberação encontrada"
            />
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
            <>
              <Button variant="outline" onClick={() => setEditingBook(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
onClick={() => void handleEditBook({ preventDefault: () => {} } as React.FormEvent)}
                 disabled={editBookLoading || !editBookForm.nome.trim()}
              >
                {editBookLoading ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
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

        {/* Modal Liberar Livro */}
        <Modal
          isOpen={isReleaseModalOpen}
          onClose={() => {
            setIsReleaseModalOpen(false)
            setReleaseForm({ selectedUserIds: [], bookId: '' })
            setStudentSearch('')
          }}
          title="Liberar Livro"
          size="xl"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsReleaseModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleRelease({ preventDefault: () => {} } as React.FormEvent)}
                disabled={
                  releaseLoading ||
                  releaseForm.selectedUserIds.length === 0 ||
                  !releaseForm.bookId
                }
              >
                {releaseLoading
                  ? 'Liberando...'
                  : `Liberar para ${releaseForm.selectedUserIds.length} selecionado(s)`}
              </Button>
            </>
          }
        >
          <form onSubmit={handleRelease} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Livro <span className="text-red-500">*</span>
              </label>
              <select
                value={releaseForm.bookId}
                onChange={(e) => {
                  const bookId = e.target.value
                  setReleaseForm((p) => ({ ...p, bookId, selectedUserIds: [] }))
                  fetchUsersForRelease(studentSearch, bookId || undefined)
                }}
                className="input w-full"
                required
              >
                <option value="">Selecione o livro</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome} ({b.level})
                  </option>
                ))}
              </select>
              {books.length === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  Cadastre livros no Catálogo antes de liberar.
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Alunos e professores que terão acesso <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllUsers}
                    className="text-sm text-brand-orange hover:underline font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    type="button"
                    onClick={deselectAllUsers}
                    className="text-sm text-gray-600 hover:underline"
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar por nome ou email..."
                className="input w-full mb-3"
              />
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                {usersForRelease.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm text-center">
                    Nenhuma pessoa encontrada. Digite para buscar.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {usersForRelease.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleUser(u.id)}
                      >
                        <input
                          type="checkbox"
                          checked={releaseForm.selectedUserIds.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="flex-1 text-sm">
                          {u.nome}
                          <span className="text-gray-500 ml-1">({u.email})</span>
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                            {u.role === 'TEACHER' ? 'Prof' : 'Aluno'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {releaseForm.selectedUserIds.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {releaseForm.selectedUserIds.length} selecionado(s)
                </p>
              )}
            </div>
          </form>
        </Modal>

        {/* Modal Liberar para usuário(s) */}
        <Modal
          isOpen={isBulkReleaseModalOpen}
          onClose={() => {
            setIsBulkReleaseModalOpen(false)
            setBulkReleaseForm({ selectedUserIds: [], selectedBookIds: [] })
            setBulkUserSearch('')
          }}
          title="Liberar livros para usuário(s)"
          size="xl"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsBulkReleaseModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleBulkRelease({ preventDefault: () => {} } as React.FormEvent)}
                disabled={
                  bulkReleaseLoading ||
                  bulkReleaseForm.selectedUserIds.length === 0 ||
                  bulkReleaseForm.selectedBookIds.length === 0
                }
              >
                {bulkReleaseLoading
                  ? 'Liberando...'
                  : `Liberar ${bulkReleaseForm.selectedBookIds.length} livro(s) para ${bulkReleaseForm.selectedUserIds.length} usuário(s)`}
              </Button>
            </>
          }
        >
          <form onSubmit={handleBulkRelease} className="space-y-6">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Usuários <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllBulkUsers}
                    className="text-sm text-brand-orange hover:underline font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkReleaseForm((p) => ({ ...p, selectedUserIds: [] }))
                    }
                    className="text-sm text-gray-600 hover:underline"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={bulkUserSearch}
                onChange={(e) => setBulkUserSearch(e.target.value)}
                placeholder="Buscar por nome ou email..."
                className="input w-full mb-3"
              />
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {bulkReleaseUsers.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm text-center">
                    Digite para buscar usuários.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {bulkReleaseUsers.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleBulkUser(u.id)}
                      >
                        <input
                          type="checkbox"
                          checked={bulkReleaseForm.selectedUserIds.includes(u.id)}
                          onChange={() => toggleBulkUser(u.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="flex-1 text-sm">
                          {u.nome}
                          <span className="text-gray-500 ml-1">({u.email})</span>
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                            {u.role === 'TEACHER' ? 'Prof' : 'Aluno'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Livros a liberar <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllBulkBooks}
                    className="text-sm text-brand-orange hover:underline font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkReleaseForm((p) => ({ ...p, selectedBookIds: [] }))
                    }
                    className="text-sm text-gray-600 hover:underline"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {books.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm text-center">
                    Nenhum livro cadastrado.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {books.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleBulkBook(b.id)}
                      >
                        <input
                          type="checkbox"
                          checked={bulkReleaseForm.selectedBookIds.includes(b.id)}
                          onChange={() => toggleBulkBook(b.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">
                          {b.nome} ({b.level})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </form>
        </Modal>

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </AdminLayout>
  )
}
