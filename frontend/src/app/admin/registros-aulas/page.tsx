/**
 * Página Admin: Registros de aulas
 * Lista todos os registros de aulas e permite adicionar/editar registro (status, presença, tipo, livro, tarefa, notas).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'

interface StudentPresenceItem {
  enrollmentId: string
  enrollment?: { id: string; nome: string }
  presence: string
}

interface LessonRecord {
  id: string
  lessonId: string
  status: string
  presence: string
  lessonType: string
  curso: string | null
  tempoAulaMinutos: number | null
  book: string | null
  lastPage: string | null
  assignedHomework: string | null
  homeworkDone: string | null
  conversationDescription: string | null
  notes: string | null
  notesForStudent: string | null
  notesForParents: string | null
  gradeGrammar: number | null
  gradeSpeaking: number | null
  gradeListening: number | null
  gradeUnderstanding: number | null
  criadoEm: string
  studentPresences?: StudentPresenceItem[]
  lesson: {
    id: string
    startAt: string
    enrollment: { id: string; nome: string; tipoAula?: string | null; nomeGrupo?: string | null }
    teacher: { id: string; nome: string }
  }
}

interface LessonOption {
  id: string
  startAt: string
  durationMinutes: number
  enrollment: { id: string; nome: string; tipoAula?: string | null; nomeGrupo?: string | null; curso?: string | null }
  teacher: { id: string; nome: string }
}

interface GroupMember {
  id: string
  nome: string
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REPOSICAO: 'Reposição',
}

const PRESENCE_LABELS: Record<string, string> = {
  PRESENTE: 'Presente',
  NAO_COMPARECEU: 'Não compareceu',
  ATRASADO: 'Atrasado',
}

const LESSON_TYPE_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  CONVERSAÇÃO: 'Só conversação',
  REVISAO: 'Revisão',
  AVALIACAO: 'Avaliação',
}

const HOMEWORK_DONE_LABELS: Record<string, string> = {
  SIM: 'Sim',
  NAO: 'Não',
  PARCIAL: 'Parcial',
  NAO_APLICA: 'Não aplica',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CURSO_LABELS: Record<string, string> = {
  INGLES: 'Inglês',
  ESPANHOL: 'Espanhol',
  INGLES_E_ESPANHOL: 'Inglês e Espanhol',
}

type FormState = {
  lessonId: string
  status: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  presence: string
  lessonType: string
  curso: string
  tempoAulaMinutos: string | number
  book: string
  lastPage: string
  assignedHomework: string
  homeworkDone: string
  conversationDescription: string
  notes: string
  notesForStudent: string
  notesForParents: string
  gradeGrammar: string | number
  gradeSpeaking: string | number
  gradeListening: string | number
  gradeUnderstanding: string | number
}

const emptyForm: FormState = {
  lessonId: '',
  status: 'CONFIRMED',
  presence: 'PRESENTE',
  lessonType: 'NORMAL',
  curso: '',
  tempoAulaMinutos: '',
  book: '',
  lastPage: '',
  assignedHomework: '',
  homeworkDone: '',
  conversationDescription: '',
  notes: '',
  notesForStudent: '',
  notesForParents: '',
  gradeGrammar: '',
  gradeSpeaking: '',
  gradeListening: '',
  gradeUnderstanding: '',
}

/** Rótulo da aula no select: grupo = nome do grupo, particular = nome do aluno */
function getLessonOptionLabel(l: LessonOption): string {
  const enr = l.enrollment
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    return enr.nomeGrupo!.trim()
  }
  return enr.nome
}

export default function AdminRegistrosAulasPage() {
  const router = useRouter()
  const [records, setRecords] = useState<LessonRecord[]>([])
  const [lessons, setLessons] = useState<LessonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [studentsPresence, setStudentsPresence] = useState<{ enrollmentId: string; presence: string }[]>([])
  const [loadingGroup, setLoadingGroup] = useState(false)

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lesson-records', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao carregar registros')
      }
      setRecords(json.data.records || [])
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao carregar registros', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [router])

  const fetchLessons = useCallback(async () => {
    const start = new Date()
    start.setDate(start.getDate() - 90)
    const end = new Date()
    end.setDate(end.getDate() + 30)
    try {
      const res = await fetch(
        `/api/admin/lessons?start=${start.toISOString()}&end=${end.toISOString()}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (res.ok && json.ok) setLessons(json.data.lessons || [])
    } catch {
      setLessons([])
    }
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  useEffect(() => {
    if (modalOpen) fetchLessons()
  }, [modalOpen, fetchLessons])

  const lessonsWithoutRecord = lessons.filter(
    (l) => !records.some((r) => r.lessonId === l.id)
  )

  const selectedLessonForGroup = form.lessonId
    ? lessonsWithoutRecord.find((l) => l.id === form.lessonId) ?? records.find((r) => r.lessonId === form.lessonId)?.lesson ?? null
    : null
  const isGroupLesson = selectedLessonForGroup?.enrollment?.tipoAula === 'GRUPO' && selectedLessonForGroup?.enrollment?.nomeGrupo?.trim()

  useEffect(() => {
    if (!modalOpen || !isGroupLesson || !selectedLessonForGroup?.enrollment?.nomeGrupo) {
      setGroupMembers([])
      setStudentsPresence([])
      return
    }
    const nomeGrupo = selectedLessonForGroup.enrollment.nomeGrupo!.trim()
    setLoadingGroup(true)
    fetch(`/api/admin/enrollments/group-members?nomeGrupo=${encodeURIComponent(nomeGrupo)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.enrollments) {
          const members = json.data.enrollments as GroupMember[]
          setGroupMembers(members)
          if (!editingId) {
            setStudentsPresence(members.map((m) => ({ enrollmentId: m.id, presence: 'PRESENTE' })))
          }
        } else {
          setGroupMembers([])
          setStudentsPresence([])
        }
      })
      .catch(() => {
        setGroupMembers([])
        setStudentsPresence([])
      })
      .finally(() => setLoadingGroup(false))
  }, [modalOpen, isGroupLesson, selectedLessonForGroup?.enrollment?.nomeGrupo, editingId])

  // Preencher curso e tempo de aula automaticamente ao selecionar a aula (apenas ao adicionar)
  useEffect(() => {
    if (!modalOpen || editingId || !form.lessonId || lessons.length === 0) return
    const withoutRecord = lessons.filter((l) => !records.some((r) => r.lessonId === l.id))
    const lesson = withoutRecord.find((l) => l.id === form.lessonId)
    if (!lesson) return
    setForm((prev) => ({
      ...prev,
      curso: lesson.enrollment?.curso ?? prev.curso,
      tempoAulaMinutos: lesson.durationMinutes ?? prev.tempoAulaMinutos,
    }))
  }, [modalOpen, editingId, form.lessonId, lessons, records])

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setGroupMembers([])
    setStudentsPresence([])
    setModalOpen(true)
  }

  const openEdit = (record: LessonRecord) => {
    setEditingId(record.id)
    setForm({
      lessonId: record.lessonId,
      status: (record.status === 'CANCELLED' || record.status === 'REPOSICAO' ? record.status : 'CONFIRMED'),
      presence: record.presence,
      lessonType: record.lessonType,
      curso: record.curso || '',
      tempoAulaMinutos: record.tempoAulaMinutos ?? '',
      book: record.book || '',
      lastPage: record.lastPage || '',
      assignedHomework: record.assignedHomework || '',
      homeworkDone: record.homeworkDone || '',
      conversationDescription: record.conversationDescription || '',
      notes: record.notes || '',
      notesForStudent: record.notesForStudent || '',
      notesForParents: record.notesForParents || '',
      gradeGrammar: record.gradeGrammar ?? '',
      gradeSpeaking: record.gradeSpeaking ?? '',
      gradeListening: record.gradeListening ?? '',
      gradeUnderstanding: record.gradeUnderstanding ?? '',
    })
    if (record.studentPresences?.length) {
      setStudentsPresence(
        record.studentPresences.map((s) => ({
          enrollmentId: s.enrollmentId,
          presence: s.presence,
        }))
      )
    } else {
      setStudentsPresence([])
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...(editingId ? {} : { lessonId: form.lessonId }),
        status: form.status,
        presence: form.presence,
        ...(isGroupLesson && studentsPresence.length > 0 ? { studentsPresence } : {}),
        lessonType: form.lessonType,
        curso: form.curso || null,
        tempoAulaMinutos: form.tempoAulaMinutos !== '' ? Number(form.tempoAulaMinutos) : null,
        book: form.book || null,
        lastPage: form.lastPage || null,
        assignedHomework: form.assignedHomework || null,
        homeworkDone: form.homeworkDone || null,
        conversationDescription: form.lessonType === 'CONVERSAÇÃO' ? (form.conversationDescription || null) : null,
        notes: form.notes || null,
        notesForStudent: form.notesForStudent || null,
        notesForParents: form.notesForParents || null,
        gradeGrammar: form.lessonType === 'AVALIACAO' && form.gradeGrammar !== '' ? Number(form.gradeGrammar) : null,
        gradeSpeaking: form.lessonType === 'AVALIACAO' && form.gradeSpeaking !== '' ? Number(form.gradeSpeaking) : null,
        gradeListening: form.lessonType === 'AVALIACAO' && form.gradeListening !== '' ? Number(form.gradeListening) : null,
        gradeUnderstanding: form.lessonType === 'AVALIACAO' && form.gradeUnderstanding !== '' ? Number(form.gradeUnderstanding) : null,
      }

      const url = editingId
        ? `/api/admin/lesson-records/${editingId}`
        : '/api/admin/lesson-records'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
        return
      }
      setToast({ message: editingId ? 'Registro atualizado' : 'Registro criado', type: 'success' })
      setModalOpen(false)
      fetchRecords()
    } catch (err) {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro?')) return
    try {
      const res = await fetch(`/api/admin/lesson-records/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        return
      }
      setToast({ message: 'Registro excluído', type: 'success' })
      fetchRecords()
    } catch {
      setToast({ message: 'Erro ao excluir', type: 'error' })
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Registros de aulas</h1>
          <Button variant="primary" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar aula
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            Nenhum registro de aula ainda. Clique em &quot;Adicionar aula&quot; para registrar uma aula.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Data / Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Professor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Presença</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((r) => {
                    const isGroup = r.lesson.enrollment?.tipoAula === 'GRUPO' && r.lesson.enrollment?.nomeGrupo?.trim()
                    const alunoLabel = isGroup ? (r.lesson.enrollment.nomeGrupo?.trim() ?? r.lesson.enrollment.nome) : r.lesson.enrollment.nome
                    const presenceLabel = isGroup && r.studentPresences?.length
                      ? r.studentPresences.map((s) => `${s.enrollment?.nome ?? s.enrollmentId}: ${PRESENCE_LABELS[s.presence] ?? s.presence}`).join('; ')
                      : (PRESENCE_LABELS[r.presence] ?? r.presence)
                    return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{formatDateTime(r.lesson.startAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{alunoLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{r.lesson.teacher.nome}</td>
                      <td className="px-4 py-3 text-sm">{STATUS_LABELS[r.status] ?? r.status}</td>
                      <td className="px-4 py-3 text-sm max-w-[200px]" title={isGroup && r.studentPresences?.length ? presenceLabel : undefined}>{presenceLabel}</td>
                      <td className="px-4 py-3 text-sm">{LESSON_TYPE_LABELS[r.lessonType] ?? r.lessonType}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="text-gray-600 hover:text-brand-orange mr-3"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="text-gray-600 hover:text-red-600"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar registro de aula' : 'Adicionar registro de aula'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : editingId ? (
                'Salvar'
              ) : (
                'Criar registro'
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingId && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Aula *</label>
              <select
                value={form.lessonId}
                onChange={(e) => setForm({ ...form, lessonId: e.target.value })}
                className="input w-full"
                required
              >
                <option value="">Selecione a aula</option>
                {lessonsWithoutRecord.map((l) => (
                  <option key={l.id} value={l.id}>
                    {formatDateTime(l.startAt)} — {getLessonOptionLabel(l)} — {l.teacher.nome}
                  </option>
                ))}
                {lessonsWithoutRecord.length === 0 && (
                  <option value="" disabled>
                    Nenhuma aula sem registro no período
                  </option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Status da aula</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
              className="input w-full"
            >
              <option value="CONFIRMED">Confirmada</option>
              <option value="CANCELLED">Cancelada</option>
              <option value="REPOSICAO">Reposição</option>
            </select>
          </div>

          {!isGroupLesson && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Presença do aluno</label>
              <select
                value={form.presence}
                onChange={(e) => setForm({ ...form, presence: e.target.value as typeof form.presence })}
                className="input w-full"
              >
                <option value="PRESENTE">Presente</option>
                <option value="NAO_COMPARECEU">Não compareceu</option>
                <option value="ATRASADO">Atrasado</option>
              </select>
            </div>
          )}

          {isGroupLesson && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">
                Aula em grupo: {selectedLessonForGroup?.enrollment?.nomeGrupo?.trim()}
              </p>
              {loadingGroup && groupMembers.length === 0 ? (
                <p className="text-sm text-amber-700">Carregando alunos do grupo...</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 mb-2">Status da aula (presença) de cada aluno:</p>
                  {(groupMembers.length > 0 ? groupMembers : studentsPresence.map((s) => ({ id: s.enrollmentId, nome: (s as StudentPresenceItem).enrollment?.nome ?? s.enrollmentId }))).map((member) => {
                    const current = studentsPresence.find((s) => s.enrollmentId === member.id)
                    const value = current?.presence ?? 'PRESENTE'
                    return (
                      <div key={member.id} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-800 min-w-[140px]">{member.nome}</span>
                        <select
                          value={value}
                          onChange={(e) => {
                            const presence = e.target.value as 'PRESENTE' | 'NAO_COMPARECEU' | 'ATRASADO'
                            setStudentsPresence((prev) => {
                              const next = prev.filter((s) => s.enrollmentId !== member.id)
                              next.push({ enrollmentId: member.id, presence })
                              return next
                            })
                          }}
                          className="input flex-1 max-w-[180px]"
                        >
                          <option value="PRESENTE">Presente</option>
                          <option value="NAO_COMPARECEU">Não compareceu</option>
                          <option value="ATRASADO">Atrasado</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de aula</label>
            <select
              value={form.lessonType}
              onChange={(e) => setForm({ ...form, lessonType: e.target.value as typeof form.lessonType })}
              className="input w-full"
            >
              <option value="NORMAL">Normal</option>
              <option value="CONVERSAÇÃO">Só conversação</option>
              <option value="REVISAO">Revisão</option>
              <option value="AVALIACAO">Avaliação</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Curso</label>
              <select
                value={form.curso}
                onChange={(e) => setForm({ ...form, curso: e.target.value })}
                className="input w-full"
              >
                <option value="">Selecione</option>
                <option value="INGLES">Inglês</option>
                <option value="ESPANHOL">Espanhol</option>
                <option value="INGLES_E_ESPANHOL">Inglês e Espanhol</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tempo de aula (min)</label>
              <input
                type="number"
                min={1}
                max={240}
                value={form.tempoAulaMinutos === '' ? '' : form.tempoAulaMinutos}
                onChange={(e) => setForm({ ...form, tempoAulaMinutos: e.target.value === '' ? '' : Number(e.target.value) })}
                className="input w-full"
                placeholder="Preenchido pela aula selecionada"
              />
              <p className="text-xs text-gray-500 mt-0.5">Preenchido automaticamente pela aula selecionada</p>
            </div>
          </div>

          {form.lessonType === 'CONVERSAÇÃO' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição da aula de conversação</label>
              <textarea
                value={form.conversationDescription}
                onChange={(e) => setForm({ ...form, conversationDescription: e.target.value })}
                className="input w-full min-h-[80px]"
                placeholder="Descreva o que foi trabalhado na aula de conversação..."
              />
            </div>
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>Importante:</strong> Mesmo que a aula não seja normal, você deve adicionar o livro e a página. Caso não trabalhe o livro, só repita as últimas infos da última aula.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Livro do aluno</label>
            <input
              type="text"
              value={form.book}
              onChange={(e) => setForm({ ...form, book: e.target.value })}
              className="input w-full"
              placeholder="Ex.: Book 1"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Última página trabalhada</label>
            <input
              type="text"
              value={form.lastPage}
              onChange={(e) => setForm({ ...form, lastPage: e.target.value })}
              className="input w-full"
              placeholder="Ex.: 42"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Tarefa designada</label>
            <textarea
              value={form.assignedHomework}
              onChange={(e) => setForm({ ...form, assignedHomework: e.target.value })}
              className="input w-full min-h-[60px]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Última tarefa feita?</label>
            <select
              value={form.homeworkDone}
              onChange={(e) => setForm({ ...form, homeworkDone: e.target.value })}
              className="input w-full"
            >
              <option value="">—</option>
              <option value="SIM">Sim</option>
              <option value="NAO">Não</option>
              <option value="PARCIAL">Parcial</option>
              <option value="NAO_APLICA">Não aplica</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Obs (observações gerais)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input w-full min-h-[60px]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Obs para os alunos</label>
            <textarea
              value={form.notesForStudent}
              onChange={(e) => setForm({ ...form, notesForStudent: e.target.value })}
              className="input w-full min-h-[60px]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Obs para os pais</label>
            <textarea
              value={form.notesForParents}
              onChange={(e) => setForm({ ...form, notesForParents: e.target.value })}
              className="input w-full min-h-[60px]"
              placeholder="Opcional"
            />
          </div>

          {form.lessonType === 'AVALIACAO' && (
            <div className="space-y-3 pt-3 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-700">Notas (avaliação)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nota de Gramática</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={form.gradeGrammar}
                    onChange={(e) => setForm({ ...form, gradeGrammar: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nota de Speaking</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={form.gradeSpeaking}
                    onChange={(e) => setForm({ ...form, gradeSpeaking: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nota de Listening</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={form.gradeListening}
                    onChange={(e) => setForm({ ...form, gradeListening: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nota de Understanding</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={form.gradeUnderstanding}
                    onChange={(e) => setForm({ ...form, gradeUnderstanding: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </AdminLayout>
  )
}
